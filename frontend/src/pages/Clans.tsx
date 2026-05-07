import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Plus, Send, MessageCircle, Trash2 } from 'lucide-react';
import { supabase, Crew, checkAchievementsSilently } from '../lib/supabase';

// Alias Crew as Clan for backward compatibility
type Clan = Crew;
import { useAuth } from '../contexts/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import { Button, Card } from '../components/ios';
import { staggerContainerVariants, staggerItemVariants } from '../animations';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { ConfirmModal } from '../components/ConfirmModal';

export function Clans() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [clans, setClans] = useState<Clan[]>([]);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [activeClan, setActiveClan] = useState<Clan | null>(null);
  const [msg, setMsg] = useState('');
  const [messages, setMessages] = useState<any[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmModalProps, setConfirmModalProps] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
    variant?: 'default' | 'destructive';
  } | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('clans').select('*').order('created_at', { ascending: false });
      if (data) setClans(data);
    })();
  }, []);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (!activeClan) {
      setMessages([]);
      return;
    }
    
    let sub: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    (async () => {
      // Load initial messages
      const { data } = await supabase
        .from('clan_messages')
        .select('*, profiles(display_name,username,avatar_url)')
        .eq('clan_id', activeClan.id)
        .order('created_at', { ascending: true });
      
      if (cancelled) return;
      
      if (data) {
        setMessages(data);
        // Scroll to bottom after initial load
        setTimeout(scrollToBottom, 100);
      }

      // Realtime for new messages - listen to all inserts and filter by clan_id
      // This approach matches Direct Messaging and is more reliable
      sub = supabase
        .channel(`clan-messages-${activeClan.id}`)
        .on(
          'postgres_changes',
          { 
            event: 'INSERT', 
            schema: 'public', 
            table: 'clan_messages'
          },
          async (payload) => {
            if (cancelled) return;
            
            // Filter by clan_id in the callback (more reliable than subscription filter)
            const newMessage = payload.new as any;
            if (newMessage.clan_id !== activeClan.id) {
              return; // Not for this clan, ignore
            }
            
            // Fetch the full message with profile data
            const { data: messageData } = await supabase
              .from('clan_messages')
              .select('*, profiles(display_name,username,avatar_url)')
              .eq('id', newMessage.id)
              .single();
            
            if (messageData && !cancelled) {
              setMessages((prev) => {
                // Check if message already exists (avoid duplicates)
                if (prev.some(m => m.id === messageData.id)) {
                  return prev;
                }
                return [...prev, messageData];
              });
              // Scroll to bottom when new message arrives
              setTimeout(scrollToBottom, 100);
            }
          }
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
          } else if (status === 'CHANNEL_ERROR') {
            console.error(' Error subscribing to crew messages channel:', status);
          } else if (status === 'TIMED_OUT') {
          } else if (status === 'CLOSED') {
          }
        });
    })();

    return () => {
      cancelled = true;
      if (sub) {
        supabase.removeChannel(sub);
      }
    };
  }, [activeClan]);

  const createClan = async () => {
    if (!user || !name.trim()) return;
    
    try {
      await Haptics.impact({ style: ImpactStyle.Medium });
    } catch (e) {
      // Haptics not available
    }

    const { data, error } = await supabase
      .from('clans')
      .insert({ 
        name: name.trim(), 
        description: desc,
        creator_id: user?.id, // Track creator
      })
      .select()
      .maybeSingle();
    if (!error && data) {
      setClans((prev) => [data as Clan, ...prev]);
      setName('');
      setDesc('');
      setShowCreateForm(false);
      
      // Auto-join created clan
      if (user) {
        await supabase.from('profiles').update({ clan_id: data.id }).eq('id', user.id);
        
        // Check for achievements (clan leader)
        await checkAchievementsSilently(user.id);
      }
    }
  };

  const joinClan = async (clanId: string) => {
    if (!user) return;
    
    try {
      await Haptics.impact({ style: ImpactStyle.Light });
    } catch (e) {
      // Haptics not available
    }

    const isAlreadyJoined = profile?.clan_id === clanId;
    
    if (isAlreadyJoined) {
      // Leave clan
      const { error } = await supabase.from('profiles').update({ clan_id: null }).eq('id', user.id);
      if (!error && profile) {
        profile.clan_id = null as any;
      }
    } else {
      // Check if user is already in a different clan
      if (profile?.clan_id && profile.clan_id !== clanId) {
        const currentClan = clans.find(c => c.id === profile.clan_id);
        const targetClan = clans.find(c => c.id === clanId);
        
        // Show modern confirm modal
        setConfirmModalProps({
          title: 'Leave Current Crew?',
          message: `You are already in "${currentClan?.name || 'another crew'}". You must leave it before joining "${targetClan?.name || 'this crew'}". Would you like to leave your current crew and join this one?`,
          onConfirm: async () => {
            // Leave current clan first
            const { error: leaveError } = await supabase.from('profiles').update({ clan_id: null }).eq('id', user.id);
            if (leaveError) {
              alert(`Failed to leave current crew: ${leaveError.message}`);
              return;
            }
            if (profile) {
              profile.clan_id = null as any;
            }
            
            // Join clan
            const { error } = await supabase.from('profiles').update({ clan_id: clanId }).eq('id', user.id);
            if (!error && profile) {
              profile.clan_id = clanId as any;
            } else if (error) {
              alert(`Failed to join crew: ${error.message}`);
            }
          },
        });
        setShowConfirmModal(true);
        return;
      }
      
      // Join clan
      const { error } = await supabase.from('profiles').update({ clan_id: clanId }).eq('id', user.id);
      if (!error && profile) {
        profile.clan_id = clanId as any;
      } else if (error) {
        alert(`Failed to join crew: ${error.message}`);
      }
    }
  };


  const deleteClan = async (clanId: string) => {
    if (!user) return;
    
    // Check if user is the creator
    const clan = clans.find(c => c.id === clanId);
    const isCreator = (clan as any)?.creator_id === user.id;
    
    if (!isCreator) {
      alert('Only the clan creator can delete this clan.');
      return;
    }
    
    // Show modern confirm modal
    setConfirmModalProps({
      title: 'Delete Clan?',
      message: 'Are you sure you want to delete this clan? This action cannot be undone.',
      variant: 'destructive',
      onConfirm: async () => {
        try {
          await Haptics.impact({ style: ImpactStyle.Medium });
        } catch (e) {
          // Haptics not available
        }

        const { error } = await supabase
          .from('clans')
          .delete()
          .eq('id', clanId)
          .eq('creator_id', user.id); // Only allow deletion by creator

        if (!error) {
          setClans(prev => prev.filter(c => c.id !== clanId));
          if (activeClan?.id === clanId) {
            setActiveClan(null);
          }
          
          // Remove clan from all members
          await supabase
            .from('profiles')
            .update({ clan_id: null })
            .eq('clan_id', clanId);
        } else {
          alert('Failed to delete clan. You may not have permission.');
        }
      },
    });
    setShowConfirmModal(true);
  };

  const sendMessage = async () => {
    if (!user || !activeClan || !msg.trim()) return;
    
    try {
      await Haptics.impact({ style: ImpactStyle.Light });
    } catch (e) {
      // Haptics not available
    }

    await supabase.from('clan_messages').insert({
      clan_id: activeClan.id,
      user_id: user.id,
      content: msg.trim(),
    });
    setMsg('');
  };


  return (
    <div className="min-h-screen bg-ios-background-secondary pb-24">
      {/* Header */}
      <div className="bg-gradient-to-br from-ios-purple-500 via-ios-blue-500 to-ios-purple-600 pb-8">
        <div className="max-w-6xl mx-auto px-ios-6 py-ios-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-ios-large-title font-bold text-white">Clans</h1>
              <p className="text-ios-subheadline text-white/80">Join a dance crew</p>
            </div>
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={() => setShowCreateForm(!showCreateForm)}
              className="p-ios-3 bg-white/20 hover:bg-white/30 rounded-ios-full transition-colors"
            >
              <Plus size={24} className="text-white" />
            </motion.button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-ios-6 -mt-ios-4">
        {/* Create Clan Form */}
        <AnimatePresence>
          {showCreateForm && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-ios-6"
            >
              <Card variant="glass" className="backdrop-blur-ios-xl">
                <h3 className="text-ios-title-3 font-bold text-ios-gray-900 mb-ios-4">Create New Clan</h3>
                <div className="space-y-ios-4">
                  <input
                    className="w-full px-ios-4 py-ios-3 bg-white/80 border border-ios-gray-200 rounded-ios-lg text-ios-body focus:ring-2 focus:ring-ios-purple-500 focus:border-transparent transition-all"
                    placeholder="Clan name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                  <input
                    className="w-full px-ios-4 py-ios-3 bg-white/80 border border-ios-gray-200 rounded-ios-lg text-ios-body focus:ring-2 focus:ring-ios-purple-500 focus:border-transparent transition-all"
                    placeholder="Description"
                    value={desc}
                    onChange={(e) => setDesc(e.target.value)}
                  />
                  <Button
                    onClick={createClan}
                    disabled={!name.trim()}
                    variant="primary"
                    fullWidth
                    className="!bg-gradient-to-r !from-ios-purple-500 !to-ios-blue-500"
                  >
                    <Plus size={18} className="mr-2" />
                    Create Clan
                  </Button>
                </div>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Clans Grid */}
        <div className="grid lg:grid-cols-3 gap-ios-6">
          {/* Clans List */}
          <div className="lg:col-span-1">
            <Card variant="elevated" padding="none">
              <div className="p-ios-4 bg-gradient-to-r from-ios-purple-500 to-ios-blue-500 flex items-center gap-ios-2">
                <Users size={20} className="text-white" />
                <span className="text-ios-headline font-semibold text-white">All Clans</span>
              </div>

              <motion.div
                variants={staggerContainerVariants}
                initial="initial"
                animate="animate"
                className="max-h-[60vh] overflow-y-auto"
              >
                {clans.map((c) => (
                  <motion.div
                    key={c.id}
                    variants={staggerItemVariants}
                    onClick={() => navigate(`/crew/${c.id}`)}
                    className={`p-ios-4 border-t border-ios-gray-100 cursor-pointer transition-colors ${
                      activeClan?.id === c.id
                        ? 'bg-ios-purple-50'
                        : 'hover:bg-ios-gray-50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-ios-3">
                      <div className="flex-1 min-w-0">
                        <div className="text-ios-body font-semibold text-ios-gray-900 truncate">{c.name}</div>
                        <div className="text-ios-caption-1 text-ios-gray-600 line-clamp-1">{c.description}</div>
                      </div>
                      <div className="flex gap-ios-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                        <Button
                          onClick={() => joinClan(c.id)}
                          variant="ghost"
                          size="sm"
                        >
                          {profile?.clan_id === c.id ? 'Leave' : 'Join'}
                        </Button>
                        {((c as any)?.creator_id === user?.id) && (
                          <button
                            onClick={() => deleteClan(c.id)}
                            className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                            aria-label="Delete clan (creator only)"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </motion.div>
            </Card>
          </div>

          {/* Chat Area */}
          <div className="lg:col-span-2">
            {activeClan ? (
              <Card variant="elevated" padding="none" className="h-[70vh] flex flex-col">
                {/* Chat Header */}
                <div className="p-ios-4 bg-gradient-to-r from-ios-purple-500 to-ios-blue-500 flex items-center gap-ios-3">
                  <MessageCircle size={20} className="text-white" />
                  <div className="flex-1">
                    <h3 className="text-ios-headline font-semibold text-white">{activeClan.name}</h3>
                    <p className="text-ios-caption-1 text-white/80">Crew Chat</p>
                  </div>
                </div>

                {/* Messages */}
                <div className="flex-1 p-ios-4 overflow-y-auto bg-ios-gray-50 space-y-ios-3">
                  <AnimatePresence>
                    {messages.map((m) => (
                      <motion.div
                        key={m.id}
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.2 }}
                        className={`flex ${m.user_id === user?.id ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[80%] ${
                            m.user_id === user?.id
                              ? 'bg-gradient-to-r from-ios-blue-500 to-ios-purple-500 text-white'
                              : 'bg-white text-ios-gray-900'
                          } rounded-ios-2xl px-ios-4 py-ios-3 shadow-ios-sm`}
                        >
                          {m.user_id !== user?.id && (
                            <div className="text-ios-caption-1 text-ios-gray-500 mb-ios-1">
                              {m.profiles?.display_name || m.profiles?.username || 'User'}
                            </div>
                          )}
                          <div className="text-ios-body">{m.content}</div>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                  <div ref={messagesEndRef} />
                </div>

                {/* Message Input */}
                <div className="p-ios-4 border-t border-ios-gray-200 bg-white">
                  <div className="flex gap-ios-2">
                    <input
                      className="flex-1 px-ios-4 py-ios-3 bg-ios-gray-50 border border-ios-gray-200 rounded-ios-full text-ios-body focus:ring-2 focus:ring-ios-purple-500 focus:border-transparent transition-all"
                      placeholder="Type a message..."
                      value={msg}
                      onChange={(e) => setMsg(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                    />
                    <Button
                      onClick={sendMessage}
                      disabled={!msg.trim()}
                      variant="primary"
                      className="!bg-gradient-to-r !from-ios-purple-500 !to-ios-blue-500 !rounded-ios-full"
                    >
                      <Send size={18} />
                    </Button>
                  </div>
                </div>
              </Card>
            ) : (
              <Card variant="elevated" className="h-[70vh] flex items-center justify-center">
                <div className="text-center">
                  <MessageCircle size={64} className="mx-auto mb-ios-4 text-ios-gray-300" />
                  <h3 className="text-ios-title-3 font-bold text-ios-gray-900 mb-ios-2">
                    No Clan Selected
                  </h3>
                  <p className="text-ios-body text-ios-gray-600">
                    Select a clan to start chatting
                  </p>
                </div>
              </Card>
            )}
          </div>
        </div>
      </div>
      
      {/* Confirm Modal */}
      {confirmModalProps && (
        <ConfirmModal
          isOpen={showConfirmModal}
          onClose={() => {
            setShowConfirmModal(false);
            setConfirmModalProps(null);
          }}
          onConfirm={confirmModalProps.onConfirm}
          title={confirmModalProps.title}
          message={confirmModalProps.message}
          confirmText={confirmModalProps.variant === 'destructive' ? 'Delete' : 'Leave & Join'}
          cancelText="Cancel"
          variant={confirmModalProps.variant}
        />
      )}
    </div>
  );
}
