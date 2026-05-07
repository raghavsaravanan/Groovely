import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Plus, Edit2, Trash2, Users, Trophy, Crown, Save, X } from 'lucide-react';
import { supabase, Crew } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Button, Card, LoadingSpinner, PageHeader } from '../components/ios';
import { staggerContainerVariants, staggerItemVariants } from '../animations';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

export function MyClans() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [crews, setCrews] = useState<(Crew & { memberCount?: number; rank?: number })[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingCrew, setEditingCrew] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newCrewName, setNewCrewName] = useState('');
  const [newCrewDesc, setNewCrewDesc] = useState('');
  const [isMounted, setIsMounted] = useState(false);

  // Initialize page on mount - synchronized with global timing
  useEffect(() => {
    window.scrollTo(0, 0);
    if (document.documentElement) {
      document.documentElement.scrollTop = 0;
    }
    if (document.body) {
      document.body.scrollTop = 0;
    }

    const animationFrame = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setTimeout(() => {
          setIsMounted(true);
        }, 50);
      });
    });

    return () => {
      cancelAnimationFrame(animationFrame);
      setIsMounted(false);
    };
  }, []);

  useEffect(() => {
    if (user) {
      fetchMyCrews();
    }
  }, [user]);

  const fetchMyCrews = async () => {
    if (!user) return;

    setLoading(true);

    // Fetch crews created by this user
    const { data, error } = await supabase
      .from('clans')
      .select('*')
      .eq('creator_id', user.id)
      .order('created_at', { ascending: false });

    if (!error && data) {
      // Fetch member counts and ranks for each crew
      const crewsWithStats = await Promise.all(
        (data as Crew[]).map(async (crew) => {
          const { count: memberCount } = await supabase
            .from('profiles')
            .select('id', { count: 'exact', head: true })
            .eq('clan_id', crew.id);

          // Get rank
          const { data: allCrews } = await supabase
            .from('clans')
            .select('id, total_score')
            .order('total_score', { ascending: false });

          const rank = allCrews ? allCrews.findIndex(c => c.id === crew.id) + 1 : null;

          return {
            ...crew,
            memberCount: memberCount || 0,
            rank: rank || undefined,
          };
        })
      );

      setCrews(crewsWithStats);
    } else {
      setCrews([]);
    }

    setLoading(false);
  };

  const handleCreateCrew = async () => {
    if (!user || !newCrewName.trim()) return;
    
    try {
      await Haptics.impact({ style: ImpactStyle.Medium });
    } catch (e) {
      // Haptics not available
    }

    const { data, error } = await supabase
      .from('clans')
      .insert({
        name: newCrewName.trim(),
        description: newCrewDesc.trim() || 'A crew ready to dominate the dance floor',
        creator_id: user.id,
      })
      .select()
      .maybeSingle();

    if (!error && data) {
      setCrews((prev) => [{ ...data, memberCount: 0, rank: undefined } as typeof crews[0], ...prev]);
      setNewCrewName('');
      setNewCrewDesc('');
      setShowCreateModal(false);
      
      try {
        await Haptics.notification({ type: NotificationType.Success });
      } catch (e) {
        // Haptics not available
      }
      
      // Navigate to the new crew
      navigate(`/crew/${data.id}`);
    } else {
      console.error('Error creating crew:', error);
      alert('Failed to create crew. Please try again.');
    }
  };

  const handleStartEdit = (crew: Crew) => {
    try {
      Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
    } catch (e) {
      // Haptics not available
    }
    
    setEditingCrew(crew.id);
    setEditName(crew.name);
    setEditDesc(crew.description || '');
  };

  const handleSaveEdit = async (crewId: string) => {
    try {
      await Haptics.impact({ style: ImpactStyle.Medium });
    } catch (e) {
      // Haptics not available
    }

    const { error } = await supabase
      .from('clans')
      .update({
        name: editName.trim(),
        description: editDesc.trim(),
      })
      .eq('id', crewId)
      .eq('creator_id', user?.id);

    if (!error) {
      setCrews((prev) =>
        prev.map((c) =>
          c.id === crewId ? { ...c, name: editName.trim(), description: editDesc.trim() } : c
        )
      );
      setEditingCrew(null);
      
      try {
        await Haptics.notification({ type: NotificationType.Success });
      } catch (e) {
        // Haptics not available
      }
    } else {
      console.error('Error updating crew:', error);
      alert('Failed to update crew. Please try again.');
    }
  };

  const handleDelete = async (crewId: string, crewName: string) => {
    try {
      await Haptics.impact({ style: ImpactStyle.Heavy });
    } catch (e) {
      // Haptics not available
    }

    const confirm = window.confirm(`Are you sure you want to delete "${crewName}"? This action cannot be undone.`);
    
    if (!confirm) return;

    // Only allow deleting crews the current user created
    const { data: crewRow } = await supabase
      .from('clans')
      .select('id, creator_id')
      .eq('id', crewId)
      .maybeSingle();

    if (!crewRow || crewRow.creator_id !== user?.id) {
      alert('Only the crew creator can delete this crew.');
      return;
    }

    if (!user) return;
    const { error } = await supabase.from('clans').delete().eq('id', crewId).eq('creator_id', user.id);

    if (error) {
      console.error('Failed to delete crew', error);
      alert('Failed to delete crew. Please try again.');
      return;
    }

    // Detach all members from this crew
    await supabase
      .from('profiles')
      .update({ clan_id: null })
      .eq('clan_id', crewId);

    setCrews((prev) => prev.filter((c) => c.id !== crewId));

    try {
      await Haptics.notification({ type: NotificationType.Warning });
    } catch (e) {
      // Haptics not available
    }
  };

  return (
    <motion.div 
      className="min-h-screen bg-groovely-dark-bg pb-24"
      initial={{ opacity: 0 }}
      animate={isMounted ? { opacity: 1 } : { opacity: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Header */}
      <motion.div
        initial={{ y: -20, opacity: 0 }}
        animate={isMounted ? { y: 0, opacity: 1 } : { y: -20, opacity: 0 }}
        transition={{ 
          duration: 0.5, 
          ease: [0.16, 1, 0.3, 1],
          delay: isMounted ? 0.1 : 0
        }}
      >
        <PageHeader
          title="My Crews"
          subtitle="MANAGE YOUR DANCE CREWS"
          icon={<Crown size={32} className="text-white/90" />}
          bottomPadding="xl"
          maxWidth="2xl"
          action={
            <motion.button
              onClick={() => navigate(-1)}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="p-2 hover:bg-white/10 rounded-lg transition-all duration-300 backdrop-blur-sm"
            >
              <ArrowLeft size={24} className="text-white" />
            </motion.button>
          }
        >
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={isMounted ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
            transition={{ delay: 0.2 }}
            className="flex justify-end"
          >
            <Button
              onClick={() => setShowCreateModal(true)}
              size="sm"
              className="!bg-gradient-to-r !from-groovely-peach-500 !to-groovely-purple-500"
            >
              <Plus size={18} className="mr-2" />
              New Crew
            </Button>
          </motion.div>
        </PageHeader>
      </motion.div>

      <motion.div 
        className="max-w-2xl mx-auto px-ios-4 pt-6"
        initial={{ opacity: 0, y: 20 }}
        animate={isMounted ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
        transition={{ 
          duration: 0.5, 
          delay: isMounted ? 0.15 : 0, 
          ease: [0.16, 1, 0.3, 1] 
        }}
      >
        {/* Stats Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isMounted ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ 
            duration: 0.5, 
            delay: isMounted ? 0.2 : 0, 
            ease: [0.16, 1, 0.3, 1] 
          }}
          className="mb-6"
        >
          <Card variant="elevated" className="backdrop-blur-xl">
            <div className="flex items-center justify-around p-4">
              <div className="text-center">
                <div className="text-3xl font-bold bg-gradient-to-r from-groovely-peach-500 to-groovely-pink-500 bg-clip-text text-transparent font-heading">
                  {crews.length}
                </div>
                <div className="text-sm text-groovely-dark-text-secondary mt-1">Crews Created</div>
              </div>
              <div className="h-12 w-px bg-groovely-dark-border" />
              <div className="text-center">
                <div className="text-3xl font-bold bg-gradient-to-r from-groovely-pink-500 to-groovely-purple-500 bg-clip-text text-transparent font-heading">
                  {crews.reduce((sum, c) => sum + (c.memberCount || 0), 0)}
                </div>
                <div className="text-sm text-groovely-dark-text-secondary mt-1">Total Members</div>
              </div>
            </div>
          </Card>
        </motion.div>

        {/* Crews List */}
        <AnimatePresence mode="wait">
          {loading ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={isMounted ? { opacity: 1 } : { opacity: 0 }}
              exit={{ opacity: 0 }}
              transition={{ 
                duration: 0.3, 
                ease: [0.16, 1, 0.3, 1],
                delay: isMounted ? 0.25 : 0
              }}
              className="flex justify-center py-12"
            >
              <LoadingSpinner size="lg" />
            </motion.div>
          ) : crews.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0, y: 20 }}
              animate={isMounted ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ 
                duration: 0.4, 
                ease: [0.16, 1, 0.3, 1],
                delay: isMounted ? 0.25 : 0
              }}
            >
              <Card variant="elevated" className="text-center py-12 backdrop-blur-xl">
                <Crown size={64} className="mx-auto mb-4 text-groovely-dark-text-tertiary" />
                <h3 className="text-xl font-bold text-white mb-2 font-heading">No Crews Yet</h3>
                <p className="text-base text-groovely-dark-text-secondary mb-6 max-w-sm mx-auto">
                  Create your first crew and start building your dance crew!
                </p>
                <Button
                  onClick={() => setShowCreateModal(true)}
                  className="!bg-gradient-to-r !from-groovely-peach-500 !to-groovely-purple-500"
                >
                  <Plus size={18} className="mr-2" />
                  Create Your First Crew
                </Button>
              </Card>
            </motion.div>
          ) : (
            <motion.div
              key="crews"
              variants={staggerContainerVariants}
              initial="initial"
              animate={isMounted ? "animate" : "initial"}
              className="space-y-4"
            >
              {crews.map((crew) => {
                const isEditing = editingCrew === crew.id;
                
                return (
                  <motion.div key={crew.id} variants={staggerItemVariants}>
                    <Card variant="elevated" className="relative backdrop-blur-xl">
                      {/* Rank badge */}
                      {crew.rank && crew.rank <= 3 && (
                        <div className="absolute top-4 right-4 w-10 h-10 bg-gradient-to-br from-groovely-peach-500 to-groovely-purple-500 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-groovely-peach-500/30">
                          #{crew.rank}
                        </div>
                      )}

                      {isEditing ? (
                        // Edit Mode
                        <div className="space-y-4">
                          <div>
                            <label className="block text-sm text-groovely-dark-text-secondary mb-2">Crew Name</label>
                            <input
                              type="text"
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              maxLength={30}
                              className="w-full px-4 py-3 bg-groovely-dark-surface border border-groovely-dark-border rounded-lg text-white focus:ring-2 focus:ring-groovely-pink-500 focus:border-transparent transition-all"
                            />
                          </div>

                          <div>
                            <label className="block text-sm text-groovely-dark-text-secondary mb-2">Description</label>
                            <textarea
                              value={editDesc}
                              onChange={(e) => setEditDesc(e.target.value)}
                              rows={2}
                              maxLength={200}
                              className="w-full px-4 py-3 bg-groovely-dark-surface border border-groovely-dark-border rounded-lg text-white focus:ring-2 focus:ring-groovely-pink-500 focus:border-transparent transition-all resize-none"
                            />
                          </div>

                          <div className="flex gap-2">
                            <Button
                              onClick={() => setEditingCrew(null)}
                              variant="outline"
                              size="sm"
                              fullWidth
                              className="!border-groovely-dark-border !text-white"
                            >
                              <X size={16} className="mr-2" />
                              Cancel
                            </Button>
                            <Button
                              onClick={() => handleSaveEdit(crew.id)}
                              disabled={!editName.trim()}
                              size="sm"
                              fullWidth
                              className="!bg-gradient-to-r !from-groovely-peach-500 !to-groovely-purple-500"
                            >
                              <Save size={16} className="mr-2" />
                              Save
                            </Button>
                          </div>
                        </div>
                      ) : (
                        // View Mode
                        <>
                          {/* Crew Header */}
                          <div className="flex items-start gap-4 mb-4">
                            <motion.div
                              whileHover={{ scale: 1.05 }}
                              onClick={() => navigate(`/crew/${crew.id}`)}
                              className="w-16 h-16 bg-gradient-to-br from-groovely-peach-500 to-groovely-purple-500 rounded-xl flex items-center justify-center shadow-lg shadow-groovely-peach-500/30 flex-shrink-0 cursor-pointer"
                            >
                              {crew.avatar_url ? (
                                <img src={crew.avatar_url} alt={crew.name} className="w-full h-full rounded-xl object-cover" />
                              ) : (
                                <Crown size={32} className="text-white" />
                              )}
                            </motion.div>
                            
                            <div className="flex-1 min-w-0">
                              <h3 
                                className="text-lg font-bold text-white truncate mb-1 font-heading cursor-pointer hover:text-groovely-peach-400 transition-colors"
                                onClick={() => navigate(`/crew/${crew.id}`)}
                              >
                                {crew.name}
                              </h3>
                              <p className="text-sm text-groovely-dark-text-secondary line-clamp-2">
                                {crew.description || 'No description'}
                              </p>
                            </div>
                          </div>

                          {/* Stats */}
                          <div className="flex gap-4 mb-4 pb-4 border-b border-groovely-dark-border">
                            <div className="flex-1 text-center">
                              <div className="text-xl font-bold text-white font-heading">{crew.memberCount || 0}</div>
                              <div className="text-xs text-groovely-dark-text-tertiary flex items-center justify-center gap-1 mt-1">
                                <Users size={12} />
                                Members
                              </div>
                            </div>
                            <div className="flex-1 text-center">
                              <div className="text-xl font-bold bg-gradient-to-r from-groovely-peach-500 to-groovely-purple-500 bg-clip-text text-transparent font-heading">
                                {crew.total_score?.toLocaleString() || 0}
                              </div>
                              <div className="text-xs text-groovely-dark-text-tertiary flex items-center justify-center gap-1 mt-1">
                                <Trophy size={12} />
                                Score
                              </div>
                            </div>
                          </div>

                          {/* Action Buttons */}
                          <div className="flex gap-2">
                            <Button
                              onClick={() => handleStartEdit(crew)}
                              variant="secondary"
                              size="sm"
                              fullWidth
                              className="!bg-white/10 !text-white hover:!bg-white/20"
                            >
                              <Edit2 size={16} className="mr-2" />
                              Edit
                            </Button>
                            <Button
                              onClick={() => navigate(`/crew/${crew.id}`)}
                              variant="primary"
                              size="sm"
                              fullWidth
                              className="!bg-gradient-to-r !from-groovely-peach-500 !to-groovely-purple-500"
                            >
                              View Crew
                            </Button>
                            <Button
                              onClick={() => handleDelete(crew.id, crew.name)}
                              variant="ghost"
                              size="sm"
                              className="!text-red-400 hover:!bg-red-500/10"
                            >
                              <Trash2 size={16} />
                            </Button>
                          </div>
                        </>
                      )}
                    </Card>
                  </motion.div>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Create Crew Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 px-4"
            onClick={() => setShowCreateModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-groovely-dark-card rounded-2xl p-6 shadow-xl w-full max-w-md border border-groovely-dark-border"
            >
              <h2 className="text-2xl font-bold text-white mb-6 font-heading">Create New Crew</h2>
              
              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-white mb-2">Crew Name</label>
                  <input
                    type="text"
                    value={newCrewName}
                    onChange={(e) => setNewCrewName(e.target.value)}
                    placeholder="The Groove Masters"
                    maxLength={30}
                    className="w-full px-4 py-3 bg-groovely-dark-surface border border-groovely-dark-border rounded-lg text-white placeholder-white/40 focus:ring-2 focus:ring-groovely-pink-500 focus:border-transparent transition-all"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-white mb-2">Description</label>
                  <textarea
                    value={newCrewDesc}
                    onChange={(e) => setNewCrewDesc(e.target.value)}
                    placeholder="Tell others what your crew is about..."
                    rows={3}
                    maxLength={200}
                    className="w-full px-4 py-3 bg-groovely-dark-surface border border-groovely-dark-border rounded-lg text-white placeholder-white/40 focus:ring-2 focus:ring-groovely-pink-500 focus:border-transparent transition-all resize-none"
                  />
                </div>
              </div>

              <div className="flex gap-3">
                <Button
                  onClick={() => setShowCreateModal(false)}
                  variant="outline"
                  size="lg"
                  fullWidth
                  className="!border-groovely-dark-border !text-white"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleCreateCrew}
                  disabled={!newCrewName.trim()}
                  size="lg"
                  fullWidth
                  className="!bg-gradient-to-r !from-groovely-peach-500 !to-groovely-purple-500"
                >
                  <Crown size={18} className="mr-2" />
                  Create
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
