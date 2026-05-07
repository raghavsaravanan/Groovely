import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, Users, Trophy, Crown, Medal, Star, TrendingUp, 
  UserPlus, UserMinus, Zap, 
  Target, Award, Sparkles, Settings, BarChart3,
  X, Camera, Check, Flame
} from 'lucide-react';
import { supabase, Crew, Profile } from '../lib/supabase';

// Alias Crew as Clan for backward compatibility
type Clan = Crew;
import { useAuth } from '../contexts/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import { Button, Card, LoadingSpinner, PageHeader, LoadingOverlay } from '../components/ios';
import { staggerContainerVariants, staggerItemVariants, successVariants } from '../animations';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

type MemberWithProfile = Profile & {
  member_since?: string;
  contribution_score?: number;
};

// Crew Chat feature - removed but type kept for future reactivation
// type ClanMessage = {
//   id: string;
//   content: string;
//   created_at: string;
//   user_id: string;
//   profiles?: {
//     display_name: string;
//     username: string;
//     avatar_url: string | null;
//   };
// };

export function ClanDetail() {
  const { clanId } = useParams<{ clanId: string }>();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [clan, setClan] = useState<Clan | null>(null);
  const [members, setMembers] = useState<MemberWithProfile[]>([]);
  // Crew Chat feature - removed but state kept for future reactivation
  // const [messages, setMessages] = useState<ClanMessage[]>([]);
  // const [messageText, setMessageText] = useState('');
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'members' | 'activity'>('overview');
  const [clanRank, setClanRank] = useState<number | null>(null);
  const [isMember, setIsMember] = useState(false);
  const [isCreator, setIsCreator] = useState(false);
  const [activities, setActivities] = useState<any[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [editingName, setEditingName] = useState('');
  const [editingDescription, setEditingDescription] = useState('');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [error, setError] = useState('');
  const [calculatedClanScore, setCalculatedClanScore] = useState<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!clanId) {
      setLoading(false);
      setClan(null);
      return;
    }
    fetchClanData();
  }, [clanId, user, profile]);

  const fetchClanData = async () => {
    if (!clanId) {
      setLoading(false);
      setClan(null);
      return;
    }
    
    setLoading(true);

    try {
      // Fetch clan data (select all columns, creator_id will be included if it exists)
      const { data: clanData, error: clanError } = await supabase
        .from('clans')
        .select('*')
        .eq('id', clanId)
        .maybeSingle();


      if (clanError) {
        console.error('Error fetching clan:', clanError);
        console.error('Clan ID:', clanId);
        console.error('Error details:', JSON.stringify(clanError, null, 2));
        setLoading(false);
        setClan(null);
        return;
      }

      if (!clanData) {
        console.error('Clan not found:', clanId);
        console.error('Clan ID type:', typeof clanId);
        console.error('Attempting to verify clan exists...');
        
        // Try a simple count query to see if the clan exists at all
        const { count, error: countError } = await supabase
          .from('clans')
          .select('id', { count: 'exact', head: true })
          .eq('id', clanId);
        
        
        setLoading(false);
        setClan(null);
        return;
      }


      setClan(clanData as Clan);

      // Check if user is the creator
      const creatorId = (clanData as any).creator_id;
      let userIsCreator = user && creatorId && creatorId === user.id;
      
      // Debug logging
      
      // If creator_id is not set but user is a member and clan was created recently, 
      // check if they're likely the creator (fallback for older clans)
      if (!userIsCreator && user && profile?.clan_id === clanId) {
        // Check if user is the only member or first member
        const { data: membersCheck } = await supabase
          .from('profiles')
          .select('id, created_at')
          .eq('clan_id', clanId)
          .order('created_at', { ascending: true })
          .limit(1);
        
        if (membersCheck && membersCheck.length > 0 && membersCheck[0].id === user.id) {
          // User is the first/only member, likely the creator
          userIsCreator = true;
        }
      }
      
      setIsCreator(!!userIsCreator);

      // Check if user is a member (creator is automatically a member)
      const isUserMember = profile?.clan_id === clanId || userIsCreator;
      setIsMember(isUserMember);

      // Calculate clan total_score as sum of all member scores
      const { data: memberProfiles } = await supabase
        .from('profiles')
        .select('score')
        .eq('clan_id', clanId);
      
      const calculatedTotalScore = memberProfiles?.reduce((sum, p) => sum + (p.score || 0), 0) || 0;
      setCalculatedClanScore(calculatedTotalScore);
      
      // Update clan total_score in database if it doesn't match (background update)
      if (clanData.total_score !== calculatedTotalScore) {
        supabase
          .from('clans')
          .update({ total_score: calculatedTotalScore })
          .eq('id', clanId)
          .then(({ error }) => {
            if (error) {
            } else {
              // Update local clan data after successful update
              setClan((prev: Clan | null) => prev ? { ...prev, total_score: calculatedTotalScore } : null);
            }
          });
      }

      // Fetch clan rank - use stored total_score for ranking (will be updated by background process)
      const { data: allClans } = await supabase
        .from('clans')
        .select('id, total_score')
        .order('total_score', { ascending: false });
      
      if (allClans) {
        // Use calculated score for this clan, stored scores for others
        const sortedClans = [...allClans].sort((a, b) => {
          const scoreA = a.id === clanId ? calculatedTotalScore : (a.total_score || 0);
          const scoreB = b.id === clanId ? calculatedTotalScore : (b.total_score || 0);
          return scoreB - scoreA;
        });
        const rank = sortedClans.findIndex(c => c.id === clanId) + 1;
        setClanRank(rank);
      }

      // Fetch creator profile if creator_id exists
      let creatorProfileData: Profile | null = null;
      
      if (creatorId) {
        const { data: creatorData } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', creatorId)
          .maybeSingle();
        
        if (creatorData) {
          creatorProfileData = creatorData;
        }
      }

      // Fetch members
      const { data: membersData } = await supabase
        .from('profiles')
        .select('*')
        .eq('clan_id', clanId)
        .order('score', { ascending: false })
        .limit(50);

      if (membersData && membersData.length > 0) {
        // If creator is not in members list (shouldn't happen, but handle it), add them
        let allMembers = [...membersData];
        
        if (creatorId && !membersData.find(m => m.id === creatorId) && profile && profile.id === creatorId) {
          // Creator not found in members, add them
          allMembers = [profile, ...membersData];
        }

        // Calculate contribution scores and mark creator
        const membersWithContributions = allMembers.map(m => ({
          ...m,
          contribution_score: (m.score || 0) + (Math.random() * 1000), // Mock contribution
          isCreator: m.id === creatorId,
        }));
        
        // Sort: creator first, then by score
        membersWithContributions.sort((a, b) => {
          if ((a as any).isCreator) return -1;
          if ((b as any).isCreator) return 1;
          return (b.score || 0) - (a.score || 0);
        });
        
        setMembers(membersWithContributions as MemberWithProfile[]);
        
        // Only show "Clan Created" activity - use creatorProfileData directly, or find in members, or use profile
        if (clan && clan.created_at) {
          const creatorUser = creatorProfileData || 
                             membersWithContributions.find(m => (m as any).isCreator) || 
                             (profile && profile.id === creatorId ? profile : null);
          
          setActivities([{
            type: 'created',
            timestamp: clan.created_at,
            user: creatorUser,
          }]);
        }
      } else if (creatorId && profile && profile.id === creatorId) {
        // No members found, but user is creator - add them
        setMembers([{
          ...profile,
          contribution_score: profile.score || 0,
          isCreator: true,
        } as MemberWithProfile]);
        
        // Add "Clan Created" activity
        if (clan && clan.created_at) {
          setActivities([{
            type: 'created',
            timestamp: clan.created_at,
            user: profile,
          }]);
        }
      } else if (creatorId && user && user.id === creatorId && profile) {
        // Creator exists but not in members list - add them
        setMembers([{
          ...profile,
          contribution_score: profile.score || 0,
          isCreator: true,
        } as MemberWithProfile]);
        
        // Add "Clan Created" activity
        if (clan && clan.created_at) {
          setActivities([{
            type: 'created',
            timestamp: clan.created_at,
            user: profile,
          }]);
        }
      } else if (clan && clan.created_at) {
        // Fallback: just show creation activity
        const creatorUser = creatorProfileData || 
                           (profile && profile.id === creatorId ? profile : null);
        
        setActivities([{
          type: 'created',
          timestamp: clan.created_at,
          user: creatorUser,
        }]);
      }

      // Crew Chat feature - removed but code kept for future reactivation
      // Subscribe to member changes only (chat removed)
      if (isUserMember) {
        const channel = supabase
          .channel(`clan:${clanId}`)
          .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'profiles',
            filter: `clan_id=eq.${clanId}`,
          }, async () => {
            // Refresh members when someone joins
            const { data: updatedMembers } = await supabase
              .from('profiles')
              .select('*')
              .eq('clan_id', clanId)
              .order('score', { ascending: false })
              .limit(50);
            
            if (updatedMembers) {
              const creatorId = (clanData as any).creator_id;
              const membersWithContributions = updatedMembers.map(m => ({
                ...m,
                contribution_score: (m.score || 0) + (Math.random() * 1000),
                isCreator: m.id === creatorId,
              }));
              
              membersWithContributions.sort((a, b) => {
                if ((a as any).isCreator) return -1;
                if ((b as any).isCreator) return 1;
                return (b.score || 0) - (a.score || 0);
              });
              
              setMembers(membersWithContributions as MemberWithProfile[]);
            }
          })
          .subscribe();

        return () => {
          supabase.removeChannel(channel);
        };
      }
    } catch (error) {
      console.error('Error fetching clan data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleJoinClan = async () => {
    if (!user || !clanId) return;
    
    setJoining(true);
    try {
      await Haptics.impact({ style: ImpactStyle.Medium });
    } catch (e) {
      // Haptics not available
    }

    try {
      if (isMember) {
        // Leave clan
        await supabase
          .from('profiles')
          .update({ clan_id: null })
          .eq('id', user.id);
        
        setIsMember(false);
        setMembers(prev => prev.filter(m => m.id !== user.id));
        
        try {
          await Haptics.notification({ type: NotificationType.Success });
        } catch (e) {}
      } else {
        // Join clan
        await supabase
          .from('profiles')
          .update({ clan_id: clanId })
          .eq('id', user.id);
        
        setIsMember(true);
        if (profile) {
          setMembers(prev => [profile as MemberWithProfile, ...prev]);
        }
        
        try {
          await Haptics.notification({ type: NotificationType.Success });
        } catch (e) {}
      }
      
      // Refresh profile to update clan_id
      window.location.reload();
    } catch (error) {
      console.error('Error joining/leaving clan:', error);
    } finally {
      setJoining(false);
    }
  };

  // Crew Chat feature - removed but function kept for future reactivation
  // const sendMessage = async () => {
  //   if (!user || !clanId || !messageText.trim() || !isMember) return;
  //
  //   try {
  //     await Haptics.impact({ style: ImpactStyle.Light });
  //   } catch (e) {
  //     // Haptics not available
  //   }
  //
  //   const { error } = await supabase
  //     .from('clan_messages')
  //     .insert({
  //       clan_id: clanId,
  //       user_id: user.id,
  //       content: messageText.trim(),
  //     });
  //
  //   if (!error) {
  //     setMessageText('');
  //   }
  // };

  const handleOpenSettings = () => {
    if (!clan) {
      console.error('Cannot open settings: clan is null');
      return;
    }
    
    if (!isCreator) {
      console.error('Cannot open settings: user is not the creator');
      alert('Only the clan creator can edit clan settings.');
      return;
    }
    
    
    // Initialize form with current clan data
    setEditingName(clan.name || '');
    setEditingDescription(clan.description || '');
    setAvatarPreview(clan.avatar_url || null);
    setAvatarFile(null);
    setError('');
    setShowSuccess(false);
    setShowSettings(true);
    
    try {
      Haptics.impact({ style: ImpactStyle.Light });
    } catch (e) {}
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        setError('Please select an image file');
        return;
      }
      
      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        setError('Image size must be less than 5MB');
        return;
      }
      
      setAvatarFile(file);
      setError('');
      const reader = new FileReader();
      reader.onloadend = () => {
        setAvatarPreview(reader.result as string);
      };
      reader.onerror = () => {
        setError('Error reading image file');
        setAvatarFile(null);
        setAvatarPreview(clan?.avatar_url || null);
      };
      reader.readAsDataURL(file);
      
      try {
        Haptics.impact({ style: ImpactStyle.Light });
      } catch (e) {}
    }
  };

  const handleSaveSettings = async () => {
    if (!user || !clanId || !clan) return;
    
    // Verify user is creator before allowing save
    const creatorId = (clan as any).creator_id;
    if (!isCreator && creatorId !== user.id) {
      console.error('User is not the creator of this clan');
      setError('You do not have permission to edit this clan');
      try {
        await Haptics.notification({ type: NotificationType.Error });
      } catch (e) {}
      return;
    }
    
    if (!editingName.trim()) {
      setError('Clan name is required');
      try {
        await Haptics.notification({ type: NotificationType.Error });
      } catch (e) {}
      return;
    }
    
    setError('');
    setSaving(true);
    try {
      await Haptics.impact({ style: ImpactStyle.Medium });
    } catch (e) {}

    try {
      let avatarUrl = clan.avatar_url;

      // Upload avatar if changed
      if (avatarFile) {
        const fileExt = avatarFile.name.split('.').pop() || 'jpg';
        // Use a more organized path structure
        const fileName = `clans/${clanId}/${Date.now()}.${fileExt}`;
        
        
        // Delete old avatar if it exists (optional cleanup)
        if (clan.avatar_url && clan.avatar_url.includes('avatars')) {
          try {
            const oldPath = clan.avatar_url.split('/avatars/')[1]?.split('?')[0];
            if (oldPath) {
              await supabase.storage.from('avatars').remove([oldPath]);
            }
          } catch (cleanupError) {
          }
        }
        
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('avatars')
          .upload(fileName, avatarFile, {
            cacheControl: '3600',
            upsert: true,
          });

        if (uploadError) {
          console.error(' Avatar upload error:', uploadError);
          // Provide more helpful error messages
          if (uploadError.message?.includes('Bucket not found') || uploadError.message?.includes('does not exist')) {
            throw new Error('Storage bucket "avatars" does not exist. Please create it in Supabase Dashboard > Storage.');
          } else if (uploadError.message?.includes('permission') || uploadError.message?.includes('policy')) {
            throw new Error('Permission denied. Please check storage policies in Supabase Dashboard > Storage > Policies.');
          }
          throw new Error(`Failed to upload avatar: ${uploadError.message}`);
        }

        if (!uploadData) {
          console.error(' No upload data returned');
          throw new Error('Failed to upload avatar: No data returned');
        }

        
        const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(uploadData.path);
        if (!urlData?.publicUrl) {
          console.error(' Failed to get public URL');
          throw new Error('Failed to get avatar URL');
        }
        
        avatarUrl = urlData.publicUrl;
      }

      // Update clan in Supabase
      // Prepare update data
      const updateData: {
        name: string;
        description: string;
        avatar_url: string | null;
      } = {
        name: editingName.trim(),
        description: editingDescription.trim(),
        avatar_url: avatarUrl,
      };


      // Try update with creator_id filter first
      let updateError = null;
      let updateSuccess = false;
      
      const { error: error1 } = await supabase
        .from('clans')
        .update(updateData)
        .eq('id', clanId)
        .eq('creator_id', user.id)
        .select();

      if (error1) {
        
        // Try without creator_id filter (RLS policy should handle authorization)
        const { error: error2 } = await supabase
          .from('clans')
          .update(updateData)
          .eq('id', clanId)
          .select();
        
        if (error2) {
          console.error(' Second update attempt also failed:', error2);
          updateError = error2;
        } else {
          updateSuccess = true;
        }
      } else {
        updateSuccess = true;
      }

      if (!updateSuccess && updateError) {
        console.error(' Clan update error:', updateError);
        
        // Provide specific error messages
        if (updateError.code === '42501' || updateError.message?.includes('permission')) {
          throw new Error('Permission denied. You must be the clan creator to update clan settings.');
        } else if (updateError.code === 'PGRST116' || updateError.message?.includes('0 rows')) {
          throw new Error('Clan not found or you do not have permission to update it.');
        } else {
          throw updateError;
        }
      }

      // Verify the update by fetching the updated clan
      const { data: updatedClanData, error: fetchError } = await supabase
        .from('clans')
        .select('*')
        .eq('id', clanId)
        .maybeSingle();

      if (fetchError) {
        console.error(' Error fetching updated clan:', fetchError);
        // Still proceed with local state update
      }

      // Update local state with fetched data or fallback to computed values
      const updatedClan = updatedClanData || {
        ...clan,
        name: editingName.trim(),
        description: editingDescription.trim(),
        avatar_url: avatarUrl,
      };
      
      
      setClan(updatedClan as Clan);
      
      // Reset form state
      setAvatarFile(null);
      setAvatarPreview(updatedClan.avatar_url || null);
      
      setShowSuccess(true);
      
      try {
        await Haptics.notification({ type: NotificationType.Success });
      } catch (e) {}
      
      setTimeout(() => {
        setShowSettings(false);
        setShowSuccess(false);
        // Refresh the page data to ensure everything is in sync
        fetchClanData();
      }, 1500);
    } catch (error: any) {
      console.error(' Error saving clan settings:', error);
      const errorMessage = error.message || 'Failed to save clan settings. Please try again.';
      setError(errorMessage);
      
      // Show more detailed error messages
      if (errorMessage.includes('Bucket not found') || errorMessage.includes('does not exist')) {
        setError('Storage bucket "avatars" does not exist. Please create it in Supabase Dashboard > Storage.');
      } else if (errorMessage.includes('permission') || errorMessage.includes('policy')) {
        setError('Permission denied. Please check storage policies in Supabase Dashboard > Storage > Policies.');
      } else if (errorMessage.includes('upload')) {
        setError(`Avatar upload failed: ${errorMessage}. Check browser console for details.`);
      }
      
      try {
        await Haptics.notification({ type: NotificationType.Error });
      } catch (e) {}
    } finally {
      setSaving(false);
    }
  };

  const getRankBadge = (rank: number) => {
    if (rank === 1) return { icon: Crown, color: 'from-yellow-400 to-yellow-600', glow: 'shadow-[0_0_20px_rgba(250,204,21,0.5)]' };
    if (rank === 2) return { icon: Medal, color: 'from-gray-300 to-gray-500', glow: 'shadow-[0_0_15px_rgba(156,163,175,0.5)]' };
    if (rank === 3) return { icon: Medal, color: 'from-orange-400 to-orange-600', glow: 'shadow-[0_0_15px_rgba(251,146,60,0.5)]' };
    return { icon: Star, color: 'from-groovely-purple-500 to-groovely-peach-500', glow: '' };
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-groovely-dark-bg flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!clan) {
    return (
      <div className="min-h-screen bg-groovely-dark-bg">
        <PageHeader
          title="Clan Not Found"
          subtitle="THIS CLAN DOES NOT EXIST"
          icon={<Users size={32} className="text-white/90" />}
          bottomPadding="xl"
          maxWidth="4xl"
        />
        <div className="max-w-4xl mx-auto px-6">
          <Card variant="elevated" className="text-center py-12">
            <Users size={64} className="mx-auto mb-4 text-groovely-dark-text-tertiary" />
            <h3 className="text-2xl font-bold text-white mb-2 font-heading">Clan Not Found</h3>
            <p className="text-base text-groovely-dark-text-secondary mb-6">
              This clan doesn't exist or has been deleted.
            </p>
            <Button onClick={() => navigate('/explore')} variant="primary">
              <ArrowLeft size={18} className="mr-2" /> Back to Explore
            </Button>
          </Card>
        </div>
      </div>
    );
  }

  const rankBadge = clanRank ? getRankBadge(clanRank) : null;
  const RankIcon = rankBadge?.icon || Star;

  return (
    <div className="min-h-screen bg-groovely-dark-bg pb-24">
      {/* Header */}
      <PageHeader
        title={clan.name}
        subtitle={clan.description || 'A DANCE CREW READY TO DOMINATE'}
        icon={
          clan.avatar_url ? (
            <div className="w-12 h-12 rounded-xl overflow-hidden border-2 border-groovely-peach-500/50 shadow-lg">
              <img 
                src={clan.avatar_url} 
                alt={clan.name} 
                className="w-full h-full object-cover"
              />
            </div>
          ) : (
            <div className="w-12 h-12 bg-gradient-to-br from-groovely-purple-500 to-groovely-peach-500 rounded-xl flex items-center justify-center shadow-lg">
              <Users size={32} className="text-white/90" />
            </div>
          )
        }
        bottomPadding="xl"
        maxWidth="6xl"
        action={
          <motion.div className="flex items-center gap-2">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => navigate(-1)}
              className="p-2 hover:bg-white/10 rounded-lg transition-all duration-300 backdrop-blur-sm"
            >
              <ArrowLeft size={24} className="text-white" />
            </motion.button>
            {/* Settings button for creator */}
            {isCreator && (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleOpenSettings}
                className="p-2 hover:bg-white/10 rounded-lg transition-all duration-300 backdrop-blur-sm"
                title="Clan Settings"
              >
                <Settings size={24} className="text-white" />
              </motion.button>
            )}
            {/* Only show Join/Leave button if user is not the creator */}
            {!isCreator && (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleJoinClan}
                disabled={joining}
                className={`px-6 py-2 rounded-xl font-semibold text-base transition-all duration-300 shadow-lg backdrop-blur-sm ${
                  isMember
                    ? 'bg-red-500/20 hover:bg-red-500/30 border border-red-500/50 text-red-400'
                    : 'bg-gradient-to-r from-groovely-peach-500 to-groovely-purple-500 hover:from-groovely-peach-600 hover:to-groovely-purple-600 text-white'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {joining ? (
                  <>
                    <LoadingSpinner size="sm" />
                    <span className="ml-2">...</span>
                  </>
                ) : isMember ? (
                  <>
                    <UserMinus size={18} className="inline mr-2" />
                    Leave Clan
                  </>
                ) : (
                  <>
                    <UserPlus size={18} className="inline mr-2" />
                    Join Clan
                  </>
                )}
              </motion.button>
            )}
          </motion.div>
        }
      >
        {/* Stats Cards */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6"
        >
          <Card variant="elevated" className="bg-gradient-to-br from-groovely-purple-500/20 to-groovely-peach-500/20 border border-groovely-purple-500/30">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-br from-groovely-purple-500 to-groovely-peach-500 rounded-xl flex items-center justify-center">
                <Trophy size={24} className="text-white" />
              </div>
              <div>
                <div className="text-2xl font-bold text-white font-heading">
                  {calculatedClanScore > 0 ? calculatedClanScore.toLocaleString() : (clan.total_score?.toLocaleString() || 0)}
                </div>
                <div className="text-xs text-groovely-dark-text-tertiary">Total Score</div>
              </div>
            </div>
          </Card>

          <Card variant="elevated" className="bg-gradient-to-br from-groovely-peach-500/20 to-groovely-pink-500/20 border border-groovely-peach-500/30">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-br from-groovely-peach-500 to-groovely-pink-500 rounded-xl flex items-center justify-center">
                <Users size={24} className="text-white" />
              </div>
              <div>
                <div className="text-2xl font-bold text-white font-heading">{members.length}</div>
                <div className="text-xs text-groovely-dark-text-tertiary">Members</div>
              </div>
            </div>
          </Card>

          <Card variant="elevated" className="bg-gradient-to-br from-groovely-pink-500/20 to-groovely-purple-500/20 border border-groovely-pink-500/30">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-br from-groovely-pink-500 to-groovely-purple-500 rounded-xl flex items-center justify-center">
                <RankIcon size={24} className="text-white" />
              </div>
              <div>
                <div className="text-2xl font-bold text-white font-heading">
                  {clanRank ? `#${clanRank}` : 'N/A'}
                </div>
                <div className="text-xs text-groovely-dark-text-tertiary">Global Rank</div>
              </div>
            </div>
          </Card>

          <Card variant="elevated" className="bg-gradient-to-br from-groovely-purple-500/20 to-groovely-blue-500/20 border border-groovely-purple-500/30">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-br from-groovely-purple-500 to-blue-500 rounded-xl flex items-center justify-center">
                <TrendingUp size={24} className="text-white" />
              </div>
              <div>
                <div className="text-2xl font-bold text-white font-heading">
                  {members.length > 0 ? Math.round(members.reduce((sum, m) => sum + (m.score || 0), 0) / members.length) : 0}
                </div>
                <div className="text-xs text-groovely-dark-text-tertiary">Avg Score</div>
              </div>
            </div>
          </Card>
        </motion.div>
      </PageHeader>

      <div className="max-w-6xl mx-auto px-6">
        {/* Tabs */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="mb-6"
        >
          <Card variant="elevated" padding="sm">
            <div className="flex gap-2 overflow-x-auto scrollbar-hide">
              {[
                { id: 'overview' as const, label: 'Overview', icon: BarChart3 },
                { id: 'members' as const, label: 'Members', icon: Users },
                { id: 'activity' as const, label: 'Activity', icon: Zap },
              ].map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <motion.button
                    key={tab.id}
                    onClick={() => {
                      try {
                        Haptics.impact({ style: ImpactStyle.Light });
                      } catch (e) {}
                      setActiveTab(tab.id);
                    }}
                    whileTap={{ scale: 0.97 }}
                    whileHover={{ scale: 1.02 }}
                    className={`relative flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-sm transition-all ${
                      isActive ? 'text-white' : 'text-groovely-dark-text-secondary hover:bg-groovely-dark-surface'
                    }`}
                  >
                    {isActive && (
                      <motion.div
                        layoutId="activeClanTab"
                        className="absolute inset-0 bg-gradient-to-r from-groovely-peach-500 to-groovely-purple-500 rounded-xl"
                        initial={false}
                        transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                      />
                    )}
                    <Icon size={18} className="relative z-10" />
                    <span className="relative z-10 whitespace-nowrap">{tab.label}</span>
                  </motion.button>
                );
              })}
            </div>
          </Card>
        </motion.div>

        {/* Tab Content */}
        <AnimatePresence mode="wait">
          {activeTab === 'overview' && (
            <motion.div
              key="overview"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              variants={staggerContainerVariants}
              className="space-y-6"
            >
              {/* Rank Badge */}
              {clanRank && clanRank <= 3 && (
                <motion.div variants={staggerItemVariants}>
                  <Card variant="elevated" className="bg-gradient-to-br from-groovely-purple-500/30 to-groovely-peach-500/30 border-2 border-groovely-purple-500/50">
                    <div className="flex items-center gap-4">
                      <motion.div
                        whileHover={{ scale: 1.1, rotate: 5 }}
                        className={`w-20 h-20 bg-gradient-to-br ${rankBadge?.color} rounded-2xl flex items-center justify-center ${rankBadge?.glow} shadow-2xl`}
                      >
                        <RankIcon size={40} className="text-white" />
                      </motion.div>
                      <div className="flex-1">
                        <h3 className="text-xl font-bold text-white font-heading mb-1">
                          #{clanRank} Clan Globally
                        </h3>
                        <p className="text-sm text-groovely-dark-text-secondary">
                          {clanRank === 1 ? '🏆 Top of the leaderboard!' : clanRank === 2 ? '🥈 Second place!' : '🥉 Third place!'}
                        </p>
                      </div>
                    </div>
                  </Card>
                </motion.div>
              )}

              {/* Top Members Preview */}
              <motion.div variants={staggerItemVariants}>
                <Card variant="elevated">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-white font-heading flex items-center gap-2">
                      <Crown size={20} className="text-groovely-peach-400" />
                      Top Performers
                    </h3>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setActiveTab('members')}
                    >
                      View All
                    </Button>
                  </div>
                  <div className="space-y-3">
                    {members.slice(0, 5).map((member, index) => {
                      const memberBadge = getRankBadge(index + 1);
                      const MemberIcon = memberBadge.icon;
                      return (
                        <motion.div
                          key={member.id}
                          whileHover={{ scale: 1.02, x: 4 }}
                          onClick={() => navigate(`/user/${member.id}`)}
                          className="flex items-center gap-3 p-3 bg-groovely-dark-surface rounded-xl cursor-pointer border border-groovely-dark-border hover:border-groovely-peach-500/50 transition-all"
                        >
                          <div className={`w-10 h-10 bg-gradient-to-br ${memberBadge.color} rounded-lg flex items-center justify-center flex-shrink-0`}>
                            {index < 3 ? (
                              <MemberIcon size={18} className="text-white" />
                            ) : (
                              <span className="text-sm font-bold text-white">{index + 1}</span>
                            )}
                          </div>
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-groovely-purple-500 to-groovely-peach-500 flex items-center justify-center flex-shrink-0 overflow-hidden">
                            {member.avatar_url ? (
                              <img src={member.avatar_url} alt={member.username} className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-white font-bold">{member.username?.[0]?.toUpperCase() || '?'}</span>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <div className="text-base font-semibold text-white truncate font-heading">
                                {member.display_name || member.username}
                              </div>
                              {(member as any).isCreator && (
                                <motion.span
                                  initial={{ scale: 0 }}
                                  animate={{ scale: 1 }}
                                  className="px-2 py-0.5 bg-gradient-to-r from-yellow-400 to-yellow-600 text-black text-xs font-bold rounded-full"
                                >
                                  Founder
                                </motion.span>
                              )}
                            </div>
                            <div className="text-xs text-groovely-dark-text-tertiary">@{member.username}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-lg font-bold bg-gradient-to-r from-groovely-peach-500 to-groovely-purple-500 bg-clip-text text-transparent font-heading">
                              {member.score?.toLocaleString() || 0}
                            </div>
                            <div className="text-xs text-groovely-dark-text-tertiary">Score</div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </Card>
              </motion.div>

              {/* Clan Achievements */}
              <motion.div variants={staggerItemVariants}>
                <Card variant="elevated">
                  <h3 className="text-lg font-bold text-white font-heading flex items-center gap-2 mb-4">
                    <Award size={20} className="text-groovely-purple-400" />
                    Clan Achievements
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {[
                      { icon: Trophy, label: 'Elite Clan', unlocked: clanRank ? clanRank <= 10 : false },
                      { icon: Flame, label: 'On Fire', unlocked: (clan.total_score || 0) > 10000 },
                      { icon: Target, label: 'Goal Crusher', unlocked: members.length >= 10 },
                      { icon: Sparkles, label: 'Rising Star', unlocked: clanRank ? clanRank <= 5 : false },
                      { icon: Zap, label: 'Powerhouse', unlocked: (clan.total_score || 0) > 50000 },
                      { icon: Crown, label: 'Legendary', unlocked: clanRank === 1 },
                    ].map((achievement, index) => (
                      <motion.div
                        key={index}
                        whileHover={{ scale: 1.05 }}
                        className={`p-4 rounded-xl border-2 transition-all ${
                          achievement.unlocked
                            ? 'bg-gradient-to-br from-groovely-purple-500/20 to-groovely-peach-500/20 border-groovely-purple-500/50'
                            : 'bg-groovely-dark-surface border-groovely-dark-border opacity-50'
                        }`}
                      >
                        <achievement.icon
                          size={32}
                          className={`mb-2 ${
                            achievement.unlocked ? 'text-groovely-peach-400' : 'text-groovely-dark-text-tertiary'
                          }`}
                        />
                        <div className={`text-sm font-semibold ${
                          achievement.unlocked ? 'text-white' : 'text-groovely-dark-text-tertiary'
                        }`}>
                          {achievement.label}
                        </div>
                        {achievement.unlocked && (
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className="text-xs text-groovely-peach-400 mt-1"
                          >
                            ✓ Unlocked
                          </motion.div>
                        )}
                      </motion.div>
                    ))}
                  </div>
                </Card>
              </motion.div>
            </motion.div>
          )}

          {activeTab === 'members' && (
            <motion.div
              key="members"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <Card variant="elevated" padding="none">
                <div className="p-4 border-b border-groovely-dark-border">
                  <h3 className="text-lg font-bold text-white font-heading">
                    All Members ({members.length})
                  </h3>
                </div>
                <div className="divide-y divide-groovely-dark-border max-h-[60vh] overflow-y-auto">
                  {members.map((member, index) => {
                    const memberBadge = getRankBadge(index + 1);
                    const MemberIcon = memberBadge.icon;
                    return (
                      <div
                        key={member.id}
                        onClick={() => navigate(`/user/${member.id}`)}
                        className="flex items-center gap-4 p-4 cursor-pointer transition-all hover:bg-groovely-dark-surface/50 active:bg-groovely-dark-surface"
                      >
                        <div className={`w-12 h-12 bg-gradient-to-br ${memberBadge.color} rounded-xl flex items-center justify-center flex-shrink-0`}>
                          {index < 3 ? (
                            <MemberIcon size={20} className="text-white" />
                          ) : (
                            <span className="text-base font-bold text-white">{index + 1}</span>
                          )}
                        </div>
                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-groovely-purple-500 to-groovely-peach-500 flex items-center justify-center flex-shrink-0 overflow-hidden">
                          {member.avatar_url ? (
                            <img 
                              src={member.avatar_url} 
                              alt={member.username} 
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <span className="text-white font-bold">{member.username?.[0]?.toUpperCase() || '?'}</span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <div className="text-base font-semibold text-white truncate font-heading">
                              {member.display_name || member.username}
                            </div>
                            {(member as any).isCreator && (
                              <span className="px-2 py-0.5 bg-gradient-to-r from-yellow-400 to-yellow-600 text-black text-xs font-bold rounded-full">
                                Founder
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-groovely-dark-text-tertiary">@{member.username}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-bold bg-gradient-to-r from-groovely-peach-500 to-groovely-purple-500 bg-clip-text text-transparent font-heading">
                            {member.score?.toLocaleString() || 0}
                          </div>
                          <div className="text-xs text-groovely-dark-text-tertiary">Score</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            </motion.div>
          )}

          {activeTab === 'activity' && (
            <motion.div
              key="activity"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <Card variant="elevated">
                <h3 className="text-lg font-bold text-white font-heading flex items-center gap-2 mb-4">
                  <Zap size={20} className="text-groovely-peach-400" />
                  Recent Activity
                </h3>
                <div className="space-y-4">
                  {activities.length > 0 ? (
                    activities.map((activity, index) => {
                      const activityUser = activity.user;
                      const userName = activityUser?.display_name || activityUser?.username || 'Unknown';
                      
                      return (
                        <motion.div
                          key={index}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: index * 0.1 }}
                          className="flex items-center gap-3 p-3 bg-groovely-dark-surface rounded-xl border border-groovely-dark-border"
                        >
                          <div className="w-10 h-10 bg-gradient-to-br from-groovely-purple-500 to-groovely-peach-500 rounded-full flex items-center justify-center flex-shrink-0">
                            {activity.type === 'created' ? (
                              <Sparkles size={18} className="text-white" />
                            ) : (
                              <UserPlus size={18} className="text-white" />
                            )}
                          </div>
                          <div className="flex-1">
                            <div className="text-sm text-white">
                              {activity.type === 'created' ? (
                                <>
                                  <span className="font-semibold">Clan Created</span>
                                  {' '}
                                  by <span className="font-semibold text-groovely-peach-400">{userName}</span>
                                </>
                              ) : (
                                <>
                                  <span className="font-semibold text-groovely-peach-400">{userName}</span>
                                  {' '}
                                  joined the clan
                                </>
                              )}
                            </div>
                            <div className="text-xs text-groovely-dark-text-tertiary mt-1">
                              {new Date(activity.timestamp).toLocaleDateString('en-US', { 
                                month: 'short', 
                                day: 'numeric', 
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </div>
                          </div>
                        </motion.div>
                      );
                    })
                  ) : (
                    <div className="text-center py-12">
                      <Zap size={48} className="mx-auto mb-4 text-groovely-dark-text-tertiary" />
                      <p className="text-groovely-dark-text-secondary">No activity yet</p>
                    </div>
                  )}
                </div>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Loading Overlay */}
      {saving && <LoadingOverlay message="Updating clan..." />}

      {/* Success Animation */}
      <AnimatePresence>
        {showSuccess && (
          <motion.div
            variants={successVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="fixed inset-0 flex items-center justify-center bg-groovely-dark-bg/95 backdrop-blur-md z-50"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-groovely-dark-surface/95 backdrop-blur-xl rounded-2xl p-8 shadow-2xl border border-groovely-dark-border min-w-[280px] max-w-[320px] text-center"
            >
              <motion.div
                animate={{ rotate: 360, scale: [1, 1.1, 1] }}
                transition={{ duration: 0.6, ease: "easeOut" }}
                className="mb-6 flex justify-center"
              >
                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-groovely-peach-500 to-groovely-purple-500 flex items-center justify-center shadow-lg shadow-groovely-peach-500/30">
                  <Check size={40} strokeWidth={3} className="text-white" />
                </div>
              </motion.div>
              <h3 className="text-2xl font-bold text-white font-heading mb-2">Clan Updated!</h3>
              <p className="text-sm text-groovely-dark-text-secondary">Your changes have been saved successfully</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Clan Settings Modal */}
      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
            onClick={() => {
              if (!saving) {
                setShowSettings(false);
                setError('');
              }
            }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl"
            >
              <Card variant="glass" className="relative flex flex-col backdrop-blur-xl overflow-hidden h-full max-h-[90vh]">
                {/* Header - Fixed */}
                <div className="flex-shrink-0 p-6 border-b border-groovely-dark-border bg-gradient-to-r from-groovely-purple-500/20 to-groovely-peach-500/20">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-gradient-to-br from-groovely-purple-500 to-groovely-peach-500 rounded-xl flex items-center justify-center">
                        <Settings size={24} className="text-white" />
                      </div>
                      <div>
                        <h2 className="text-2xl font-bold text-white font-heading">Clan Settings</h2>
                        <p className="text-sm text-groovely-dark-text-secondary">Manage your clan details</p>
                      </div>
                    </div>
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => {
                        if (!saving) {
                          setShowSettings(false);
                          setError('');
                        }
                      }}
                      disabled={saving}
                      className="p-2 hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50"
                    >
                      <X size={24} className="text-white" />
                    </motion.button>
                  </div>
                </div>

                {/* Scrollable Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                  {/* Error Message */}
                  {error && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="p-4 bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl text-sm"
                    >
                      {error}
                    </motion.div>
                  )}

                  {/* Avatar Section */}
                  <motion.div
                    variants={staggerContainerVariants}
                    initial="initial"
                    animate="animate"
                  >
                    <Card variant="glass" className="text-center backdrop-blur-xl">
                      <h3 className="text-xl font-bold text-white font-heading mb-4">Clan Avatar</h3>
                      
                      <div className="flex flex-col items-center">
                        <motion.div
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => fileInputRef.current?.click()}
                          className="relative w-32 h-32 mb-4 bg-gradient-to-br from-groovely-peach-500 to-groovely-purple-500 rounded-full flex items-center justify-center text-white text-5xl font-bold shadow-lg shadow-groovely-peach-500/30 cursor-pointer overflow-hidden"
                        >
                          {avatarPreview ? (
                            <img src={avatarPreview} alt="Clan avatar" className="w-full h-full object-cover" />
                          ) : (
                            <Users size={48} className="text-white" />
                          )}
                          
                          {/* Camera overlay */}
                          <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center">
                            <Camera size={32} className="text-white" />
                          </div>
                        </motion.div>

                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          onChange={handleAvatarChange}
                          className="hidden"
                        />

                        <Button
                          onClick={() => fileInputRef.current?.click()}
                          variant="secondary"
                          size="sm"
                          className="!bg-groovely-dark-surface/60 !text-white hover:!bg-groovely-dark-surface/80 border border-groovely-dark-border"
                        >
                          <Camera size={16} className="mr-2" />
                          Change Photo
                        </Button>
                        
                        {avatarFile && (
                          <p className="text-xs text-groovely-peach-400 mt-2">
                            ✓ {avatarFile.name}
                          </p>
                        )}
                      </div>
                    </Card>
                  </motion.div>

                  {/* Basic Info - Clan Name and Description */}
                  <motion.div 
                    variants={staggerItemVariants}
                    initial="initial"
                    animate="animate"
                  >
                    <Card variant="glass" className="backdrop-blur-xl">
                      <h3 className="text-xl font-bold text-white font-heading mb-4">Basic Info</h3>
                      
                      <div className="space-y-4">
                        {/* Clan Name Field */}
                        <div>
                          <label 
                            htmlFor="clan-name-input"
                            className="block text-sm font-medium text-groovely-dark-text-secondary mb-2"
                          >
                            Clan Name <span className="text-red-400">*</span>
                          </label>
                          <input
                            id="clan-name-input"
                            type="text"
                            value={editingName || ''}
                            onChange={(e) => {
                              setEditingName(e.target.value);
                              setError('');
                            }}
                            placeholder="Enter clan name"
                            maxLength={30}
                            autoComplete="off"
                            className="w-full px-4 py-3 bg-groovely-dark-surface/60 border border-groovely-dark-border rounded-xl text-base text-white placeholder-groovely-dark-text-tertiary focus:ring-2 focus:ring-groovely-peach-500 focus:border-groovely-peach-500 transition-all"
                            style={{ minHeight: '48px' }}
                          />
                          <p className="text-xs text-groovely-dark-text-tertiary mt-2">
                            {(editingName || '').length}/30 characters
                          </p>
                        </div>

                        {/* Description Field */}
                        <div>
                          <label 
                            htmlFor="clan-description-input"
                            className="block text-sm font-medium text-groovely-dark-text-secondary mb-2"
                          >
                            Description
                          </label>
                          <textarea
                            id="clan-description-input"
                            value={editingDescription || ''}
                            onChange={(e) => {
                              setEditingDescription(e.target.value);
                              setError('');
                            }}
                            placeholder="Tell others what makes your clan special..."
                            rows={4}
                            maxLength={200}
                            className="w-full px-4 py-3 bg-groovely-dark-surface/60 border border-groovely-dark-border rounded-xl text-base text-white placeholder-groovely-dark-text-tertiary focus:ring-2 focus:ring-groovely-peach-500 focus:border-groovely-peach-500 transition-all resize-none"
                            style={{ minHeight: '100px' }}
                          />
                          <p className="text-xs text-groovely-dark-text-tertiary mt-2">
                            {(editingDescription || '').length}/200 characters
                          </p>
                        </div>
                      </div>
                    </Card>
                  </motion.div>

                </div>

                {/* Action Buttons - Fixed at bottom */}
                <div className="flex-shrink-0 p-6 border-t border-groovely-dark-border bg-groovely-dark-surface/50 backdrop-blur-sm sticky bottom-0 z-20">
                  <div className="flex gap-3">
                    <Button
                      onClick={() => {
                        // Reset form state
                        if (clan) {
                          setEditingName(clan.name);
                          setEditingDescription(clan.description || '');
                          setAvatarPreview(clan.avatar_url || null);
                        }
                        setAvatarFile(null);
                        setError('');
                        setShowSettings(false);
                      }}
                      variant="outline"
                      size="lg"
                      fullWidth
                      disabled={saving}
                      className="!border-groovely-dark-border !text-groovely-dark-text-secondary hover:!bg-groovely-dark-surface/60 disabled:!opacity-50"
                    >
                      <X size={18} className="mr-2" />
                      Cancel
                    </Button>
                    <Button
                      onClick={handleSaveSettings}
                      disabled={saving || !editingName.trim()}
                      variant="primary"
                      size="lg"
                      fullWidth
                      className="!bg-gradient-to-r !from-groovely-peach-500 !to-groovely-purple-500 hover:!shadow-lg hover:!shadow-groovely-peach-500/30 disabled:!opacity-50 disabled:!cursor-not-allowed"
                    >
                      {saving ? (
                        <>
                          <LoadingSpinner size="sm" />
                          <span className="ml-2">Saving...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles size={18} className="mr-2" />
                          Save Changes
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </Card>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

