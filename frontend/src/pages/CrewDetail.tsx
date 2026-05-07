import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, Users, Trophy, Crown, Medal, Star, TrendingUp, 
  MessageCircle, Send, UserPlus, UserMinus, Zap, 
  Target, Award, Flame, Sparkles, Settings, BarChart3,
  X, Image as ImageIcon, Edit2, Camera, Check, Trash2, AlertTriangle,
  Video as VideoIcon, Heart, Eye
} from 'lucide-react';
import { supabase, Crew, Profile } from '../lib/supabase';
import { ViewCount } from '../components/ViewCount';
import { useAuth } from '../contexts/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import { Button, Card, LoadingSpinner, PageHeader, LoadingOverlay } from '../components/ios';
import { staggerContainerVariants, staggerItemVariants, successVariants } from '../animations';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { ConfirmModal } from '../components/ConfirmModal';

type MemberWithProfile = Profile & {
  member_since?: string;
  contribution_score?: number;
};

type CrewMessage = {
  id: string;
  content: string;
  created_at: string;
  user_id: string;
  profiles?: {
    display_name: string;
    username: string;
    avatar_url: string | null;
  };
};

type ClanMessage = CrewMessage; // Alias for compatibility

export function CrewDetail() {
  const { crewId } = useParams<{ crewId: string }>();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [crew, setCrew] = useState<Crew | null>(null);
  const [members, setMembers] = useState<MemberWithProfile[]>([]);
  const [messages, setMessages] = useState<CrewMessage[]>([]);
  const [messageText, setMessageText] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  // Crew Chat feature - disabled but kept for future reactivation
  const CHAT_ENABLED = false;
  const [activeTab, setActiveTab] = useState<'overview' | 'members' | 'chat' | 'activity'>('overview');
  
  // Redirect from chat tab if disabled
  useEffect(() => {
    if (activeTab === 'chat' && !CHAT_ENABLED) {
      setActiveTab('overview');
    }
  }, [activeTab]);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmModalProps, setConfirmModalProps] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);
  const [crewRank, setCrewRank] = useState<number | null>(null);
  const [crewRankTier, setCrewRankTier] = useState<string>('Bronze');
  const [crewRankScore, setCrewRankScore] = useState<number>(0);
  const [isMember, setIsMember] = useState(false);
  const [isCreator, setIsCreator] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false); // Creator or co-founder
  const [coFounders, setCoFounders] = useState<Profile[]>([]);
  const [showTransferOwnership, setShowTransferOwnership] = useState(false);
  const [showMakeCoFounder, setShowMakeCoFounder] = useState(false);
  const [selectedMemberForAction, setSelectedMemberForAction] = useState<Profile | null>(null);
  const [activities, setActivities] = useState<any[]>([]);
  const hasLoadedHistoricalActivities = useRef(false);
  const [showSettings, setShowSettings] = useState(false);
  const [editingName, setEditingName] = useState('');
  const [editingDescription, setEditingDescription] = useState('');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [error, setError] = useState('');
  const [calculatedCrewScore, setCalculatedCrewScore] = useState<number>(0);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [crewStats, setCrewStats] = useState({
    totalVideos: 0,
    totalViews: 0,
    totalLikes: 0,
    avgMemberScore: 0,
    weeklyGrowth: 0,
  });
  const [recentVideos, setRecentVideos] = useState<any[]>([]);

  useEffect(() => {
    if (!crewId) {
      setLoading(false);
      setCrew(null);
      return;
    }
    // Reset historical activities flag when crew changes
    hasLoadedHistoricalActivities.current = false;
    setActivities([]); // Clear activities when switching crews
    fetchCrewData();
  }, [crewId, user?.id, profile?.id]); // Use stable IDs instead of objects

  // Fetch analytics when members are loaded
  useEffect(() => {
    if (!crewId || !crew) return;
    
    // Initialize with empty stats first
    if (members.length === 0) {
      setCrewStats({
        totalVideos: 0,
        totalViews: 0,
        totalLikes: 0,
        avgMemberScore: 0,
        weeklyGrowth: 0,
      });
      setRecentVideos([]);
      return;
    }
    
    // Fetch analytics if we have members
    fetchCrewAnalytics(crewId).catch(err => {
      console.error('Error fetching crew analytics:', err);
      // Don't block rendering - set safe defaults
      setCrewStats({
        totalVideos: 0,
        totalViews: 0,
        totalLikes: 0,
        avgMemberScore: members.length > 0
          ? Math.round(members.reduce((sum, m) => sum + (m.score || 0), 0) / members.length)
          : 0,
        weeklyGrowth: 0,
      });
      setRecentVideos([]);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crewId, crew?.id, members.length]);

  const fetchCrewData = async () => {
    if (!crewId) {
      setLoading(false);
      setCrew(null);
      return;
    }
    
    // Only show loading if we don't have crew data yet
    if (!crew) {
      setLoading(true);
    }

    try {
      // Fetch crew data (select all columns, creator_id will be included if it exists)
      const { data: crewData, error: crewError } = await supabase
        .from('clans')
        .select('*')
        .eq('id', crewId)
        .maybeSingle();


      if (crewError) {
        console.error('Error fetching crew:', crewError);
        console.error('Clan ID:', crewId);
        console.error('Error details:', JSON.stringify(crewError, null, 2));
        setLoading(false);
        setCrew(null);
        return;
      }

      if (!crewData) {
        console.error('Clan not found:', crewId);
        console.error('Clan ID type:', typeof crewId);
        console.error('Attempting to verify clan exists...');
        
        // Try a simple count query to see if the clan exists at all
        const { count, error: countError } = await supabase
          .from('clans')
          .select('id', { count: 'exact', head: true })
          .eq('id', crewId);
        
        
        setLoading(false);
        setCrew(null);
        return;
      }


      setCrew(crewData as Crew);
      
      // Also update avatar preview if it's different from current preview
      if (crewData.avatar_url && crewData.avatar_url !== avatarPreview) {
        setAvatarPreview(crewData.avatar_url);
      }

      // Check if user is the creator
      const creatorId = (crewData as any).creator_id;
      const coFoundersList = (crewData as any).co_founders || [];
      
      // Normalize IDs to strings for comparison (handles UUID comparison issues)
      const normalizedCreatorId = creatorId ? String(creatorId) : null;
      const normalizedUserId = user?.id ? String(user.id) : null;
      
      let userIsCreator = normalizedUserId && normalizedCreatorId && normalizedCreatorId === normalizedUserId;
      let userIsCoFounder = normalizedUserId && Array.isArray(coFoundersList) && 
        coFoundersList.some((cf: string) => String(cf) === normalizedUserId);
      
      // Debug logging with normalized IDs
      
      // If creator_id is not set but user is a member, check if they're likely the creator
      // This handles crews created before creator_id was added or if there was an error
      if (!userIsCreator && !userIsCoFounder && user && profile?.clan_id === crewId) {
        
        // Check if user is the first member (likely the creator)
        const { data: membersCheck } = await supabase
          .from('profiles')
          .select('id, created_at')
          .eq('clan_id', crewId)
          .order('created_at', { ascending: true })
          .limit(1);
        
        if (membersCheck && membersCheck.length > 0 && String(membersCheck[0].id) === normalizedUserId) {
          // User is the first member, likely the creator - update creator_id
          userIsCreator = true;
          
          // Try to update creator_id in the database (background update, don't await)
          supabase
            .from('clans')
            .update({ creator_id: user.id })
            .eq('id', crewId)
            .then(({ error }) => {
              if (error) {
              } else {
                // Refresh crew data to get updated creator_id
                fetchCrewData();
              }
            });
        } else {
        }
      }
      
      // Final verification log
      if (userIsCreator) {
      } else if (userIsCoFounder) {
      } else if (profile?.clan_id === crewId) {
      } else {
      }
      
      setIsCreator(!!userIsCreator);
      setIsAdmin(!!(userIsCreator || userIsCoFounder));
      // Note: isCoFounder state removed as it's not used - isAdmin covers both creator and co-founder
      
      // Fetch co-founder profiles
      if (coFoundersList && coFoundersList.length > 0) {
        const { data: coFounderProfiles } = await supabase
          .from('profiles')
          .select('*')
          .in('id', coFoundersList);
        
        if (coFounderProfiles) {
          setCoFounders(coFounderProfiles);
        }
      } else {
        setCoFounders([]);
      }
      

      // Check if user is a member (creator is automatically a member)
      const isUserMember = Boolean(profile?.clan_id === crewId || userIsCreator);
      setIsMember(isUserMember);

      // Calculate crew total_score as sum of all member scores
      const { data: memberProfiles } = await supabase
        .from('profiles')
        .select('score')
        .eq('clan_id', crewId);
      
      const calculatedTotalScore = memberProfiles?.reduce((sum, p) => sum + (p.score || 0), 0) || 0;
      setCalculatedCrewScore(calculatedTotalScore);
      
      // Update crew total_score in database if it doesn't match (background update)
      if (crewData.total_score !== calculatedTotalScore) {
        supabase
          .from('clans')
          .update({ total_score: calculatedTotalScore })
          .eq('id', crewId)
          .then(({ error }) => {
            if (error) {
            } else {
              // Update local crew data after successful update
              setCrew(prev => prev ? { ...prev, total_score: calculatedTotalScore } : null);
            }
          });
      }

      // Fetch crew rank - use stored total_score for ranking (will be updated by background process)
      const { data: allCrews } = await supabase
        .from('clans')
        .select('id, total_score')
        .order('total_score', { ascending: false });
      
      if (allCrews) {
        // Use calculated score for this crew, stored scores for others
        const sortedCrews = [...allCrews].sort((a, b) => {
          const scoreA = a.id === crewId ? calculatedTotalScore : (a.total_score || 0);
          const scoreB = b.id === crewId ? calculatedTotalScore : (b.total_score || 0);
          return scoreB - scoreA;
        });
        const rank = sortedCrews.findIndex(c => c.id === crewId) + 1;
        setCrewRank(rank);
      }

      // Fetch tier + composite score via RPC helper
      const { data: avgRankData, error: avgRankError } = await supabase.rpc('calculate_crew_rank', {
        p_crew_id: crewId,
      });

      if (!avgRankError && avgRankData && avgRankData.length > 0) {
        const snapshot = avgRankData[0] as { avg_rank: string; crew_score: number };
        setCrewRankTier(snapshot.avg_rank || 'Bronze');
        setCrewRankScore(snapshot.crew_score ?? calculatedTotalScore);
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
        .eq('clan_id', crewId)
        .order('score', { ascending: false })
        .limit(50);

      if (membersData && membersData.length > 0) {
        // If creator is not in members list (shouldn't happen, but handle it), add them
        let allMembers = [...membersData];
        
        if (creatorId && !membersData.find(m => m.id === creatorId) && profile && profile.id === creatorId) {
          // Creator not found in members, add them
          allMembers = [profile, ...membersData];
        }

        // Calculate contribution scores and mark creator/co-founders
        const membersWithContributions = allMembers.map(m => ({
          ...m,
          contribution_score: (m.score || 0) + (Math.random() * 1000), // Mock contribution
          isCreator: m.id === creatorId,
          isCoFounder: Array.isArray(coFoundersList) && coFoundersList.includes(m.id),
        }));
        
        // Sort: creator first, then co-founders, then by score
        membersWithContributions.sort((a, b) => {
          if ((a as any).isCreator) return -1;
          if ((b as any).isCreator) return 1;
          if ((a as any).isCoFounder && !(b as any).isCoFounder) return -1;
          if (!(a as any).isCoFounder && (b as any).isCoFounder) return 1;
          return (b.score || 0) - (a.score || 0);
        });
        
        setMembers(membersWithContributions as MemberWithProfile[]);
        
        // Fetch crew analytics after members are loaded
        fetchCrewAnalytics(crewId);
        
        // Historical activities will be fetched after fetchHistoricalActivities is defined
        // For now, just set the basic creation activity
        if (crew && crew.created_at) {
          // Fallback: just show creation activity
          const creatorUser = creatorProfileData || 
                             (profile && profile.id === creatorId ? profile : null);
          
          if (creatorUser) {
            setActivities([{
              type: 'created',
              timestamp: crew.created_at,
              user: creatorUser,
            }]);
          }
        }
      } else if (creatorId && profile && profile.id === creatorId) {
        // No members found, but user is creator - add them
        setMembers([{
          ...profile,
          contribution_score: profile.score || 0,
          isCreator: true,
        } as MemberWithProfile]);
        
        // Add "Crew Created" activity
        if (crewData.created_at) {
          setActivities([{
            type: 'created',
            timestamp: crewData.created_at,
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
        
        // Add "Crew Created" activity
        if (crewData.created_at) {
          setActivities([{
            type: 'created',
            timestamp: crewData.created_at,
            user: profile,
          }]);
        }
      } else if (crewData.created_at) {
        // Fallback: just show creation activity
        const creatorUser = creatorProfileData || 
                           (profile && profile.id === creatorId ? profile : null);
        
        setActivities([{
          type: 'created',
          timestamp: crewData.created_at,
          user: creatorUser,
        }]);
      }

      // Fetch messages if user is member
      if (isUserMember) {
        const { data: messagesData } = await supabase
          .from('clan_messages')
          .select('*, profiles!clan_messages_user_id_fkey(display_name, username, avatar_url)')
          .eq('clan_id', crewId)
          .order('created_at', { ascending: false })
          .limit(50);

        if (messagesData) {
          // Normalize profiles if they're arrays
          const normalizedMessages = messagesData.map((msg: any) => {
            if (msg.profiles && Array.isArray(msg.profiles) && msg.profiles.length > 0) {
              msg.profiles = msg.profiles[0];
            }
            return msg;
          });
          const reversedMessages = normalizedMessages.reverse() as ClanMessage[];
          setMessages(reversedMessages);
          // Scroll to bottom after messages are loaded - use multiple attempts
          setTimeout(() => {
            if (messagesEndRef.current) {
              messagesEndRef.current.scrollIntoView({ behavior: 'auto' });
            } else if (chatContainerRef.current) {
              chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
            }
          }, 150);
          setTimeout(() => {
            if (messagesEndRef.current) {
              messagesEndRef.current.scrollIntoView({ behavior: 'auto' });
            } else if (chatContainerRef.current) {
              chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
            }
          }, 400);
        }
      }
    } catch (error) {
      console.error('Error fetching clan data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Scroll to bottom function - defined early so it can be used in other hooks
  const scrollToBottom = useCallback((smooth = false) => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
    } else if (chatContainerRef.current) {
      // Fallback: scroll the container itself
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, []);

  // Separate useEffect for real-time join/leave tracking (for ALL users viewing the page)
  useEffect(() => {
    if (!crewId) {
      return;
    }


    // Create a dedicated channel for join/leave events
    const joinLeaveChannel = supabase
      .channel(`crew-join-leave-${crewId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'profiles',
      }, async (payload) => {
        // Track both joins and leaves for this crew
        const memberId = payload.new.id;
        const oldClanId = payload.old?.clan_id;
        const newClanId = payload.new.clan_id;
        
        // Check if someone joined this crew (clan_id changed from null/different to crewId)
        if (newClanId === crewId && oldClanId !== crewId) {
          
          // Refresh members list
          const { data: updatedMembers } = await supabase
            .from('profiles')
            .select('*')
            .eq('clan_id', crewId)
            .order('score', { ascending: false })
            .limit(50);
          
          if (updatedMembers && crew) {
            const creatorId = (crew as any).creator_id;
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
            
            // Fetch the new member's profile
            const { data: newMemberProfile } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', memberId)
              .maybeSingle();
            
            if (newMemberProfile) {
              setActivities(prev => [{
                type: 'joined',
                timestamp: new Date().toISOString(),
                user: newMemberProfile,
              }, ...prev].slice(0, 50));
              
              // Check for member count milestones
              const memberCount = updatedMembers.length;
              const milestones = [5, 10, 25, 50, 100];
              if (milestones.includes(memberCount)) {
                setActivities(prev => [{
                  type: 'crew_milestone',
                  timestamp: new Date().toISOString(),
                  milestone: memberCount,
                  milestoneType: 'members',
                }, ...prev].slice(0, 50));
              }
            }
          }
        }
        
        // Check if someone left this crew (old clan_id was this crew, new one is not)
        if (oldClanId === crewId && newClanId !== crewId) {
          
          // Use cached profile data since they're no longer in the crew
          const cachedProfile = members.find(m => m.id === memberId);
          
          if (cachedProfile) {
            setActivities(prev => [{
              type: 'left',
              timestamp: new Date().toISOString(),
              user: cachedProfile,
            }, ...prev].slice(0, 50));
          } else {
            // Fallback: fetch profile if not cached
            const { data: leftMemberProfile } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', memberId)
              .maybeSingle();
            
            if (leftMemberProfile) {
              setActivities(prev => [{
                type: 'left',
                timestamp: new Date().toISOString(),
                user: leftMemberProfile,
              }, ...prev].slice(0, 50));
            }
          }
          
          // Update members list
          setMembers(prev => prev.filter(m => m.id !== memberId));
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
        } else if (status === 'CHANNEL_ERROR') {
          console.error(' Error subscribing to join/leave events:', status);
        }
      });

    return () => {
      supabase.removeChannel(joinLeaveChannel);
    };
  }, [crewId, crew, members]);

  // Separate useEffect for real-time message subscription
  useEffect(() => {
    if (!crewId || !isMember || !user?.id) {
      return;
    }


    // Helper function to hydrate message with profile data
    const hydrateMessage = async (messageId: string) => {
      const { data, error } = await supabase
        .from('clan_messages')
        .select('*, profiles!clan_messages_user_id_fkey(display_name, username, avatar_url)')
        .eq('id', messageId)
        .maybeSingle();
      
      if (error) {
        console.error('Failed to hydrate message', error);
        return null;
      }
      
      // Normalize profiles if it's an array
      if (data) {
        const message = data as any;
        if (message.profiles && Array.isArray(message.profiles) && message.profiles.length > 0) {
          message.profiles = message.profiles[0];
        }
      }
      
      return data as CrewMessage | null;
    };

    // Subscribe to new messages - use filter at database level for better performance
    // Fallback to callback filtering if filter doesn't work
    const channel = supabase
      .channel(`crew-messages-${crewId}`)
      .on(
        'postgres_changes',
        { 
          event: 'INSERT', 
          schema: 'public', 
          table: 'clan_messages',
          filter: `clan_id=eq.${crewId}`
        },
        async (payload) => {
          const newMessage = payload.new as any;
          
          // Double-check clan_id matches (safety check)
          if (newMessage.clan_id !== crewId) {
            return;
          }
          
          
          // Hydrate the message with profile data
          const hydratedMessage = await hydrateMessage(newMessage.id);
          
          if (hydratedMessage) {
            setMessages((prev) => {
              // Check if message already exists (avoid duplicates)
              const exists = prev.some(m => m.id === hydratedMessage.id);
              if (exists) {
                return prev;
              }
              return [...prev, hydratedMessage];
            });
            // Scroll to bottom when new message arrives
            setTimeout(() => {
              scrollToBottom(true);
            }, 100);
          } else {
          }
        }
      )
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'clans',
        filter: `id=eq.${crewId}`,
      }, async (payload) => {
        // Track crew updates (name, description, avatar changes)
        const oldName = payload.old?.name;
        const newName = payload.new.name;
        const oldAvatar = payload.old?.avatar_url;
        const newAvatar = payload.new.avatar_url;
        
        // Update crew data
        setCrew(payload.new as Crew);
        
        // Add activity for significant changes
        if (oldName !== newName && user && profile) {
          setActivities(prev => [{
            type: 'renamed',
            timestamp: new Date().toISOString(),
            user: profile,
            oldValue: oldName,
            newValue: newName,
          }, ...prev].slice(0, 50));
        }
        
        if (oldAvatar !== newAvatar && user && profile) {
          setActivities(prev => [{
            type: 'avatar_changed',
            timestamp: new Date().toISOString(),
            user: profile,
          }, ...prev].slice(0, 50));
        }
      })
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
        } else if (status === 'CHANNEL_ERROR') {
          console.error(' Channel subscription error. Details:', {
            status,
            error: err,
            crewId,
            isMember,
            userId: user?.id,
            message: 'Check: 1) Is clan_messages in supabase_realtime publication? 2) Does table have REPLICA IDENTITY FULL? 3) Are RLS policies correct?'
          });
        } else if (status === 'TIMED_OUT') {
          console.error(' Channel subscription timed out');
        } else if (status === 'CLOSED') {
        }
      });

    // Cleanup function
    return () => {
      supabase.removeChannel(channel);
    };
  }, [crewId, isMember, user?.id]); // Include user?.id to ensure subscription is set up when user is available

  const handleJoinClan = async () => {
    if (!user || !crewId) return;
    
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
        
        // Add activity for leaving
        if (profile) {
          setActivities(prev => [{
            type: 'left',
            timestamp: new Date().toISOString(),
            user: profile,
          }, ...prev].slice(0, 50));
        }
        
        try {
          await Haptics.notification({ type: NotificationType.Success });
        } catch (e) {}
      } else {
        // Check if user is already in a different clan
        if (profile?.clan_id && profile.clan_id !== crewId) {
          // Fetch the current clan name
          const { data: currentCrew } = await supabase
            .from('clans')
            .select('name')
            .eq('id', profile.clan_id)
            .single();
          
          // Show modern confirm modal
          setConfirmModalProps({
            title: 'Leave Current Crew?',
            message: `You are already in "${currentCrew?.name || 'another crew'}". You must leave it before joining this crew. Would you like to leave your current crew and join this one?`,
            onConfirm: async () => {
              // Leave current clan first
              const { error: leaveError } = await supabase
                .from('profiles')
                .update({ clan_id: null })
                .eq('id', user.id);
              
              if (leaveError) {
                alert(`Failed to leave current crew: ${leaveError.message}`);
                setJoining(false);
                return;
              }
              
              // Continue with joining (code below)
              await continueJoiningCrew();
            },
          });
          setShowConfirmModal(true);
          setJoining(false);
          return;
        }
        
        await continueJoiningCrew();
      }
    } catch (error) {
      console.error('Error joining/leaving clan:', error);
    } finally {
      setJoining(false);
    }
  };

  const continueJoiningCrew = async () => {
    if (!user || !crewId) return;
    
    setJoining(true);
    try {
      // Join clan
      const { error: joinError } = await supabase
        .from('profiles')
        .update({ clan_id: crewId })
        .eq('id', user.id);
      
      if (joinError) {
        alert(`Failed to join crew: ${joinError.message}`);
        setJoining(false);
        return;
      }
      
      setIsMember(true);
      if (profile) {
        setMembers(prev => [profile as MemberWithProfile, ...prev]);
        
        // Add activity for joining
        setActivities(prev => [{
          type: 'joined',
          timestamp: new Date().toISOString(),
          user: profile,
        }, ...prev].slice(0, 50));
      }
      
      try {
        await Haptics.notification({ type: NotificationType.Success });
      } catch (e) {}
    } catch (error) {
      console.error('Error joining/leaving clan:', error);
    } finally {
      setJoining(false);
    }
  };

  // Fetch historical activities (videos, joins, etc.)
  const fetchHistoricalActivities = useCallback(async (
    _crewId: string, 
    memberIds: string[], 
    creatorId: string | null,
    creatorProfile: Profile | null
  ) => {
    const activitiesList: any[] = [];
    
    // 1. Add crew creation activity
    if (crew && crew.created_at) {
      const creatorUser = creatorProfile || 
                         members.find(m => (m as any).isCreator) || 
                         (profile && profile.id === creatorId ? profile : null);
      
      if (creatorUser) {
        activitiesList.push({
          type: 'created',
          timestamp: crew.created_at,
          user: creatorUser,
        });
      }
    }

    // 1.5. Add historical join activities for current members
    // Note: We can't get exact join timestamps from the database, so we'll use updated_at
    // as a proxy. However, real-time joins will always have accurate timestamps.
    // We'll only add historical joins if we don't already have a more recent join activity
    if (memberIds.length > 0 && members.length > 0) {
      // Get all current members (excluding creator, who we already showed in "created")
      const nonCreatorMembers = members.filter(m => m.id !== creatorId);
      
      
      // For each member, add a join activity only if we don't have a more recent one
      // We'll use updated_at as the join timestamp (best approximation we have)
      nonCreatorMembers.forEach((member) => {
        const memberUpdatedAt = (member as any).updated_at;
        const crewCreatedAt = crew?.created_at;
        
        // Only add historical join if updated_at is after crew creation
        // This ensures we're not showing joins before the crew existed
        if (memberUpdatedAt && crewCreatedAt) {
          const memberUpdateTime = new Date(memberUpdatedAt).getTime();
          const crewCreateTime = new Date(crewCreatedAt).getTime();
          
          // Only show as join if updated_at is after crew creation
          // This is the best approximation we have for join time
          if (memberUpdateTime > crewCreateTime) {
            activitiesList.push({
              type: 'joined',
              timestamp: memberUpdatedAt, // Use updated_at as join timestamp
              user: member,
            });
          }
        }
      });
    }

    // 2. Fetch recent videos from crew members (last 20)
    if (memberIds.length > 0) {
      try {
        
        // First, let's verify these members actually have videos
        // Try without any filters first to see if we can query videos at all
        const { data: allVideosTest, error: allVideosError } = await supabase
          .from('videos')
          .select('id, user_id, title')
          .limit(5);
        
        
        // Now test with member IDs
        const { data: testVideos, error: testError } = await supabase
          .from('videos')
          .select('id, user_id, title')
          .in('user_id', memberIds)
          .limit(5);
        
        
        // Also try querying videos for the current user to see if that works
        if (user?.id) {
          const { data: myVideos, error: myVideosError } = await supabase
            .from('videos')
            .select('id, user_id, title')
            .eq('user_id', user.id)
            .limit(5);
        }
        
        const { data: recentVideos, error: videosError } = await supabase
          .from('videos')
          .select('id, user_id, title, thumbnail_url, kind, created_at, likes, views, ai_score')
          .in('user_id', memberIds)
          .order('created_at', { ascending: false })
          .limit(20);
        
        if (videosError) {
          console.error(' Error fetching recent videos:', videosError);
          console.error(' Error details:', JSON.stringify(videosError, null, 2));
        }

        if (recentVideos && recentVideos.length > 0) {
        } else {
          // Let's check if ANY videos exist for these users
          for (const memberId of memberIds) {
            const { data: memberVideos, error: memberError } = await supabase
              .from('videos')
              .select('id, user_id, title, kind, created_at')
              .eq('user_id', memberId)
              .limit(10);
            
            if (memberError) {
              console.error(` Error querying videos for member ${memberId}:`, memberError);
            } else {
            }
          }
          
          // Also check if we can query videos at all (without user filter)
          const { data: anyVideos, error: anyVideosError } = await supabase
            .from('videos')
            .select('id, user_id, title')
            .limit(5);
        }
        if (recentVideos && recentVideos.length > 0) {
          // Filter out draft attempts - only show published videos
          const attemptVideos = recentVideos.filter((v: any) => v.kind === 'attempt');
          const nonAttemptVideos = recentVideos.filter((v: any) => v.kind !== 'attempt' || !v.kind);
          
          let publishedVideos: any[] = nonAttemptVideos;
          
          // For attempt videos, check if they're published
          if (attemptVideos.length > 0) {
            const attemptRoutineIds = [...new Set(attemptVideos.map((v: any) => v.routine_id).filter(Boolean))];
            const attemptVideoUrls = attemptVideos.map((v: any) => v.video_url).filter(Boolean);
            
            if (attemptRoutineIds.length > 0 && attemptVideoUrls.length > 0) {
              const { data: publishedAttempts } = await supabase
                .from('attempts')
                .select('routine_id, video_url')
                .in('user_id', memberIds)
                .eq('status', 'published')
                .in('routine_id', attemptRoutineIds)
                .in('video_url', attemptVideoUrls);
              
              const publishedKeys = new Set<string>();
              publishedAttempts?.forEach((a: any) => {
                if (a.routine_id && a.video_url) {
                  publishedKeys.add(`${a.routine_id}:${a.video_url}`);
                }
              });
              
              const publishedAttemptVideos = attemptVideos.filter((v: any) => {
                if (!v.routine_id || !v.video_url) return false;
                const key = `${v.routine_id}:${v.video_url}`;
                return publishedKeys.has(key);
              });
              
              publishedVideos = [...nonAttemptVideos, ...publishedAttemptVideos];
            }
          } else {
            publishedVideos = nonAttemptVideos;
          }
          
          
          // Fetch profiles for all video owners
          const videoOwnerIds = [...new Set(publishedVideos.map((v: any) => v.user_id))];
          const { data: videoOwners, error: ownersError } = await supabase
            .from('profiles')
            .select('id, display_name, username, avatar_url')
            .in('id', videoOwnerIds);
          
          if (ownersError) {
            console.error('Error fetching video owners:', ownersError);
          }
          
          
          // Create a map for quick lookup
          const ownersMap = new Map();
          if (videoOwners) {
            videoOwners.forEach((owner: any) => {
              ownersMap.set(owner.id, owner);
            });
          }
          
          publishedVideos.forEach((video: any) => {
            const videoProfile = ownersMap.get(video.user_id);
            if (videoProfile) {
              activitiesList.push({
                type: video.kind === 'attempt' ? 'routine_attempted' : 'video_uploaded',
                timestamp: video.created_at,
                user: videoProfile,
                video: {
                  id: video.id,
                  title: video.title,
                  thumbnail_url: video.thumbnail_url,
                },
                // Include additional data for potential future use
                metadata: {
                  likes: video.likes || 0,
                  views: video.views || 0,
                  ai_score: video.ai_score,
                },
              });
            } else {
            }
          });
        }
      } catch (error) {
        console.error('Error fetching recent videos for activities:', error);
      }
    }

    // 3. Fetch high-scoring videos (milestones)
    if (memberIds.length > 0) {
      try {
        const { data: highScoreVideos, error: highScoreError } = await supabase
          .from('videos')
          .select('id, user_id, title, thumbnail_url, likes, created_at')
          .in('user_id', memberIds)
          .gte('likes', 10)
          .order('likes', { ascending: false })
          .limit(10);
        
        if (highScoreError) {
          console.error('Error fetching high-scoring videos:', highScoreError);
        }

        if (highScoreVideos && highScoreVideos.length > 0) {
          // Fetch profiles for all video owners
          const videoOwnerIds = [...new Set(highScoreVideos.map((v: any) => v.user_id))];
          const { data: videoOwners, error: ownersError } = await supabase
            .from('profiles')
            .select('id, display_name, username, avatar_url')
            .in('id', videoOwnerIds);
          
          if (ownersError) {
            console.error('Error fetching high-score video owners:', ownersError);
          }
          
          // Create a map for quick lookup
          const ownersMap = new Map();
          if (videoOwners) {
            videoOwners.forEach((owner: any) => {
              ownersMap.set(owner.id, owner);
            });
          }
          
          highScoreVideos.forEach((video: any) => {
            const videoProfile = ownersMap.get(video.user_id);
            if (videoProfile) {
              const likeCount = video.likes || 0;
              const milestones = [10, 25, 50, 100, 250, 500, 1000];
              const isMilestone = milestones.some(m => likeCount >= m && likeCount < m * 2);
              
              // Only add if it's a milestone and not already in the list
              if (isMilestone && !activitiesList.find(a => a.video?.id === video.id && a.type === 'video_milestone')) {
                activitiesList.push({
                  type: 'video_milestone',
                  timestamp: video.created_at,
                  user: videoProfile,
                  video: {
                    id: video.id,
                    title: video.title,
                    thumbnail_url: video.thumbnail_url,
                  },
                  milestone: likeCount,
                });
              }
            }
          });
        }
      } catch (error) {
        console.error('Error fetching high-scoring videos for activities:', error);
      }
    }

    // 4. Sort all activities by timestamp (newest first)
    activitiesList.sort((a, b) => {
      const timeA = new Date(a.timestamp).getTime();
      const timeB = new Date(b.timestamp).getTime();
      return timeB - timeA;
    });

    // 5. Limit to 50 most recent activities
    const finalActivities = activitiesList.slice(0, 50);
    // Only set if we have activities, and merge with existing real-time activities
    setActivities(prev => {
      // If we already have activities (from real-time), merge them intelligently
      if (prev.length > 0) {
        const merged = [...prev, ...finalActivities];
        
        // Remove duplicates, but for join/leave activities, keep the most recent one per user
        const activityMap = new Map<string, any>();
        
        merged.forEach((activity) => {
          // Create a unique key for each activity type
          let key: string;
          
          if (activity.type === 'joined' || activity.type === 'left') {
            // For join/leave, use user ID + type as key to keep only the most recent
            key = `${activity.type}-${activity.user?.id}`;
          } else if (activity.type === 'video_uploaded' || activity.type === 'routine_attempted' || activity.type === 'video_milestone') {
            // For video activities, use video ID + type
            key = `${activity.type}-${activity.video?.id}`;
          } else if (activity.type === 'crew_milestone') {
            // For crew milestones, use milestone value
            key = `${activity.type}-${activity.milestone}`;
          } else {
            // For other activities, use type + timestamp + user ID
            key = `${activity.type}-${activity.timestamp}-${activity.user?.id || ''}`;
          }
          
          // If we already have this activity, keep the one with the most recent timestamp
          const existing = activityMap.get(key);
          if (!existing) {
            activityMap.set(key, activity);
          } else {
            const existingTime = new Date(existing.timestamp).getTime();
            const newTime = new Date(activity.timestamp).getTime();
            // Keep the more recent one
            if (newTime > existingTime) {
              activityMap.set(key, activity);
            }
          }
        });
        
        // Convert back to array, sort by timestamp, and limit
        const unique = Array.from(activityMap.values());
        unique.sort((a, b) => {
          const timeA = new Date(a.timestamp).getTime();
          const timeB = new Date(b.timestamp).getTime();
          return timeB - timeA;
        });
        return unique.slice(0, 50);
      }
      return finalActivities;
    });
  }, [crew, members, profile]);

  // Fetch historical activities after members are loaded (only once)
  useEffect(() => {
    if (!crewId || !crew || members.length === 0) {
      return;
    }
    if (hasLoadedHistoricalActivities.current) {
      return; // Don't reload if already loaded
    }
    
    const memberIds = members.map(m => m.id);
    const creatorId = (crew as any).creator_id;
    const creatorProfile = members.find(m => (m as any).isCreator) || null;
    
    hasLoadedHistoricalActivities.current = true;
    fetchHistoricalActivities(crewId, memberIds, creatorId, creatorProfile).catch(err => {
      console.error('Error fetching historical activities:', err);
      hasLoadedHistoricalActivities.current = false; // Reset on error so we can retry
    });
  }, [crewId, crew, members, fetchHistoricalActivities]);

  const fetchCrewAnalytics = useCallback(async (crewId: string) => {
    try {
      // Get all member IDs from current members state or fetch fresh
      let memberIds: string[] = [];
      const currentMembers = members.length > 0 ? members : [];
      
      if (currentMembers.length > 0) {
        memberIds = currentMembers.map(m => m.id);
      } else {
        // Fetch members first if not loaded
        const { data: memberData } = await supabase
          .from('profiles')
          .select('id')
          .eq('clan_id', crewId);
        
        if (memberData && memberData.length > 0) {
          memberIds = memberData.map(m => m.id);
        } else if (profile?.clan_id === crewId && user) {
          memberIds = [user.id];
        }
      }
      
      if (memberIds.length === 0) {
        // Set default stats if no members
        setCrewStats({
          totalVideos: 0,
          totalViews: 0,
          totalLikes: 0,
          avgMemberScore: 0,
          weeklyGrowth: 0,
        });
        setRecentVideos([]);
        return;
      }
      
      // Fetch videos from crew members - get all for accurate stats
      // Exclude draft attempts - only show published videos
      const { data: allVideos, error: videosError } = await supabase
        .from('videos')
        .select('*')
        .in('user_id', memberIds)
        .order('created_at', { ascending: false });
      
      if (videosError) {
        console.error('Error fetching videos:', videosError);
        // Set default stats on error
        setCrewStats({
          totalVideos: 0,
          totalViews: 0,
          totalLikes: 0,
          avgMemberScore: currentMembers.length > 0
            ? Math.round(currentMembers.reduce((sum, m) => sum + (m.score || 0), 0) / currentMembers.length)
            : 0,
          weeklyGrowth: 0,
        });
        setRecentVideos([]);
        return;
      }
      
      if (allVideos) {
        // Filter out draft attempts - only show published attempts
        const attemptVideos = allVideos.filter(v => v.kind === 'attempt');
        const nonAttemptVideos = allVideos.filter(v => v.kind !== 'attempt');
        
        let publishedVideos: typeof allVideos = [];
        
        if (attemptVideos.length > 0) {
          const attemptRoutineIds = [...new Set(attemptVideos.map(v => v.routine_id).filter(Boolean))];
          
          // Get published attempts
          const { data: publishedAttempts } = await supabase
            .from('attempts')
            .select('routine_id, video_url')
            .in('user_id', memberIds)
            .eq('status', 'published')
            .in('routine_id', attemptRoutineIds);
          
          // Create set of published attempt keys
          const publishedKeys = new Set<string>();
          publishedAttempts?.forEach((a: any) => {
            if (a.routine_id && a.video_url) {
              publishedKeys.add(`${a.routine_id}:${a.video_url}`);
            }
          });
          
          // Filter to only published attempt videos
          const publishedAttemptVideos = attemptVideos.filter(v => {
            if (!v.routine_id || !v.video_url) return false;
            const key = `${v.routine_id}:${v.video_url}`;
            return publishedKeys.has(key);
          });
          
          // Combine non-attempt videos with published attempt videos
          publishedVideos = [...nonAttemptVideos, ...publishedAttemptVideos]
            .sort((a, b) => {
              const dateA = new Date(a.created_at || 0).getTime();
              const dateB = new Date(b.created_at || 0).getTime();
              return dateB - dateA;
            });
        } else {
          publishedVideos = nonAttemptVideos;
        }
        
        // Set recent videos for display (limit 6)
        setRecentVideos(publishedVideos.slice(0, 6));
        
        // Calculate stats from ALL published videos (not limited)
        const totalVideos = publishedVideos.length;
        const totalViews = publishedVideos.reduce((sum, v) => sum + (v.views || 0), 0);
        const totalLikes = publishedVideos.reduce((sum, v) => sum + (v.likes || 0), 0);
        
        // Calculate average member score
        const avgMemberScore = currentMembers.length > 0
          ? Math.round(currentMembers.reduce((sum, m) => sum + (m.score || 0), 0) / currentMembers.length)
          : 0;
        
        // Calculate weekly growth
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        const recentVideosCount = publishedVideos.filter((v: any) => {
          try {
            return new Date(v.created_at) >= weekAgo;
          } catch {
            return false;
          }
        }).length;
        
        setCrewStats({
          totalVideos,
          totalViews,
          totalLikes,
          avgMemberScore,
          weeklyGrowth: recentVideosCount,
        });
      } else {
        // No videos found, set defaults
        setCrewStats({
          totalVideos: 0,
          totalViews: 0,
          totalLikes: 0,
          avgMemberScore: currentMembers.length > 0
            ? Math.round(currentMembers.reduce((sum, m) => sum + (m.score || 0), 0) / currentMembers.length)
            : 0,
          weeklyGrowth: 0,
        });
        setRecentVideos([]);
      }
      
      // Calculate top contributors
      if (currentMembers.length > 0) {
        // Top contributors calculated but not stored in state (used directly in render)
      }
    } catch (error) {
      console.error('Error fetching crew analytics:', error);
      // Set safe defaults on error
      setCrewStats({
        totalVideos: 0,
        totalViews: 0,
        totalLikes: 0,
        avgMemberScore: 0,
        weeklyGrowth: 0,
      });
      setRecentVideos([]);
    }
  }, [members, profile, user]);

  // Subscribe to video updates and new uploads to refresh analytics and add activities
  useEffect(() => {
    if (!crewId || members.length === 0) return;

    const memberIds = members.map(m => m.id);
    
    // Subscribe to video updates (when views change)
    const videoChannel = supabase
      .channel(`crew-videos-${crewId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'videos',
      }, async (payload) => {
        const video = payload.new as any;
        // Only process if video belongs to a crew member
        if (memberIds.includes(video.user_id)) {
          // Refresh analytics when any crew member's video is updated (e.g., views incremented)
          fetchCrewAnalytics(crewId).catch(err => {
            console.error('Error refreshing crew analytics after video update:', err);
          });
        }
      })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'videos',
      }, async (payload) => {
        const video = payload.new as any;
        // Only process if video belongs to a crew member
        if (memberIds.includes(video.user_id)) {
          
          // Fetch the member's profile
          const { data: memberProfile } = await supabase
            .from('profiles')
            .select('id, display_name, username, avatar_url')
            .eq('id', video.user_id)
            .maybeSingle();
          
          if (memberProfile) {
            // Determine activity type based on video kind
            let activityType = 'video_uploaded';
            if (video.kind === 'attempt') {
              activityType = 'routine_attempted';
            }
            
            // Add activity for video upload
            setActivities(prev => [{
              type: activityType,
              timestamp: video.created_at || new Date().toISOString(),
              user: memberProfile,
              video: {
                id: video.id,
                title: video.title,
                thumbnail_url: video.thumbnail_url,
              },
            }, ...prev].slice(0, 50));
          }
          
          // Refresh analytics
          fetchCrewAnalytics(crewId).catch(err => {
            console.error('Error refreshing crew analytics after video upload:', err);
          });
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
        }
      });

    // Subscribe to video likes for crew member videos
    const likesChannel = supabase
      .channel(`crew-video-likes-${crewId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'video_likes',
      }, async (payload) => {
        const like = payload.new as any;
        
        // Check if the liked video belongs to a crew member
        const { data: video } = await supabase
          .from('videos')
          .select('id, user_id, title, thumbnail_url, likes')
          .eq('id', like.video_id)
          .maybeSingle();
        
        if (video && memberIds.includes(video.user_id)) {
          // Only show activity for significant likes (e.g., milestones like 10, 50, 100, etc.)
          const likeCount = video.likes || 0;
          const milestones = [10, 25, 50, 100, 250, 500, 1000];
          const isMilestone = milestones.includes(likeCount);
          
          if (isMilestone) {
            const { data: videoOwner } = await supabase
              .from('profiles')
              .select('id, display_name, username, avatar_url')
              .eq('id', video.user_id)
              .maybeSingle();
            
            if (videoOwner) {
              setActivities(prev => [{
                type: 'video_milestone',
                timestamp: new Date().toISOString(),
                user: videoOwner,
                video: {
                  id: video.id,
                  title: video.title,
                  thumbnail_url: video.thumbnail_url,
                },
                milestone: likeCount,
              }, ...prev].slice(0, 50));
            }
          }
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
        }
      });

    return () => {
      supabase.removeChannel(videoChannel);
      supabase.removeChannel(likesChannel);
    };
  }, [crewId, members, fetchCrewAnalytics]);

  const sendMessage = async () => {
    if (!user || !crewId || !messageText.trim() || !isMember || sendingMessage) return;

    setSendingMessage(true);
    const messageContent = messageText.trim();
    setMessageText('');

    try {
      await Haptics.impact({ style: ImpactStyle.Light });
    } catch (e) {
      // Haptics not available
    }

    // Optimistically add message to state immediately
    const tempMessageId = `temp-${Date.now()}`;
    const optimisticMessage: CrewMessage = {
      id: tempMessageId,
      content: messageContent,
      created_at: new Date().toISOString(),
      user_id: user.id,
      profiles: profile ? {
        display_name: profile.display_name || '',
        username: profile.username || '',
        avatar_url: profile.avatar_url,
      } : undefined,
    };
    
    setMessages(prev => [...prev, optimisticMessage]);
    
    // Scroll to bottom immediately
    setTimeout(() => {
      scrollToBottom(true);
    }, 50);

    const { data, error } = await supabase
      .from('clan_messages')
      .insert({
        clan_id: crewId,
        user_id: user.id,
        content: messageContent,
      })
      .select('*, profiles!clan_messages_user_id_fkey(display_name, username, avatar_url)')
      .single();

    if (error) {
      console.error('Error sending message:', error);
      // Remove optimistic message on error
      setMessages(prev => prev.filter(m => m.id !== tempMessageId));
      setMessageText(messageContent); // Restore message on error
      setError('Failed to send message. Please try again.');
      setSendingMessage(false);
    } else if (data) {
      // Normalize profiles if it's an array
      const message = data as any;
      if (message.profiles && Array.isArray(message.profiles) && message.profiles.length > 0) {
        message.profiles = message.profiles[0];
      }
      
      // Replace optimistic message with real message from server
      // The real-time subscription will also add it, but we handle it here to ensure it shows up
      setMessages(prev => {
        // Remove optimistic message
        const filtered = prev.filter(m => m.id !== tempMessageId);
        // Check if real message already exists (from real-time subscription)
        if (filtered.some(m => m.id === message.id)) {
          return filtered;
        }
        // Add real message
        return [...filtered, message as CrewMessage];
      });
      
      // Scroll to bottom after real message is added
      setTimeout(() => {
        scrollToBottom(true);
      }, 100);
      
      setSendingMessage(false);
    }
  };

  // Scroll to bottom when messages change or when chat tab is opened
  useEffect(() => {
    if (CHAT_ENABLED && activeTab === 'chat' && messages.length > 0) {
      // Use multiple timeouts to ensure DOM is fully rendered
      const timeout1 = setTimeout(() => {
        scrollToBottom(false);
      }, 100);
      
      const timeout2 = setTimeout(() => {
        scrollToBottom(false);
      }, 300);
      
      const timeout3 = setTimeout(() => {
        scrollToBottom(false);
      }, 500);
      
      return () => {
        clearTimeout(timeout1);
        clearTimeout(timeout2);
        clearTimeout(timeout3);
      };
    }
  }, [activeTab, messages.length, scrollToBottom]);
  
  // Also scroll when tab changes to chat (even if messages are empty)
  useEffect(() => {
    if (CHAT_ENABLED && activeTab === 'chat') {
      const timeoutId = setTimeout(() => {
        scrollToBottom(false);
      }, 400);
      
      return () => clearTimeout(timeoutId);
    }
  }, [activeTab, scrollToBottom]);

  const handleOpenSettings = () => {
    if (!crew) {
      console.error('Cannot open settings: crew is null');
      return;
    }
    
    if (!isAdmin) {
      console.error('Cannot open settings: user is not an admin');
      alert('Only the crew creator or co-founders can edit crew settings.');
      return;
    }
    
    
    // Initialize form with current crew data
    setEditingName(crew.name || '');
    setEditingDescription(crew.description || '');
    setAvatarPreview(crew.avatar_url || null);
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
        const previewUrl = reader.result as string;
        setAvatarPreview(previewUrl);
      };
      reader.onerror = () => {
        console.error(' Error reading image file');
        setError('Error reading image file');
        setAvatarFile(null);
        setAvatarPreview(crew?.avatar_url || null);
      };
      reader.readAsDataURL(file);
      
      try {
        Haptics.impact({ style: ImpactStyle.Light });
      } catch (e) {}
    }
  };

  const handleSaveSettings = async () => {
    if (!user || !crewId || !crew) return;
    
    // Verify user is admin (creator or co-founder) before allowing save
    if (!isAdmin) {
      console.error('User is not an admin of this crew');
      setError('You do not have permission to edit this crew. Only admins can edit crew settings.');
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
      if (!crew) {
        console.error('Cannot save: crew is null');
        return;
      }

      let avatarUrl = crew.avatar_url;

      // Upload avatar if changed (simplified to match CreateProfile.tsx pattern)
      if (avatarFile) {
        const fileExt = avatarFile.name.split('.').pop() || 'jpg';
        const fileName = `${Date.now()}.${fileExt}`;
        const filePath = `clans/${crewId}/${fileName}`;

        

        // Upload the avatar file (same pattern as CreateProfile.tsx)
        const { error: uploadError } = await supabase.storage
          .from('avatars')
          .upload(filePath, avatarFile, {
            cacheControl: '3600',
            upsert: true,
          });

        if (uploadError) {
          console.error(' Avatar upload error:', uploadError);
          
          // Provide helpful error messages
          const errorMessage = uploadError.message || String(uploadError);
          if (errorMessage.includes('Bucket not found') || 
              errorMessage.includes('does not exist') ||
              errorMessage.includes('not found') ||
              errorMessage.includes('404')) {
            throw new Error(
              'Storage bucket "avatars" does not exist.\n\n' +
              '📝 QUICK FIX:\n\n' +
              'Option 1 - Manual (Recommended):\n' +
              '1. Go to Supabase Dashboard > Storage\n' +
              '2. Click "New Bucket"\n' +
              '3. Name: avatars (exactly, lowercase)\n' +
              '4. Public: Yes (check this box!)\n' +
              '5. Click "Create Bucket"\n\n' +
              'Option 2 - Automated:\n' +
              'Run: npx tsx scripts/setup-storage-buckets.ts\n\n' +
              'After creating, refresh the page and try again.\n\n' +
              'Verify setup: npx tsx scripts/verify-crews-setup.ts'
            );
          } else if (errorMessage.includes('permission') || errorMessage.includes('policy')) {
            throw new Error(
              'Permission denied. Please check storage policies in Supabase Dashboard > Storage > Policies.'
            );
          }
          throw uploadError;
        }

        // Get the public URL (same pattern as CreateProfile.tsx)
        const { data: { publicUrl } } = supabase.storage
          .from('avatars')
          .getPublicUrl(filePath);

        if (!publicUrl) {
          throw new Error('Failed to get avatar URL');
        }

        avatarUrl = publicUrl;
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


      // Update crew - RLS policy allows creators and co-founders to update
      // Use .select() to get the updated data back immediately, explicitly select avatar_url
      
      // Try selecting with co_founders first, fallback to without if column doesn't exist
      let updatedCrewData: any = null;
      let updateErr: any = null;
      
      const { data: crewDataWithCoFounders, error: errorWithCoFounders } = await supabase
        .from('clans')
        .update(updateData)
        .eq('id', crewId)
        .select('id, name, description, avatar_url, total_score, creator_id, co_founders, created_at')
        .single();
      
      if (errorWithCoFounders) {
        // If error is about co_founders column, try without it
        if (errorWithCoFounders.message?.includes('co_founders') || 
            errorWithCoFounders.message?.includes('column') ||
            errorWithCoFounders.message?.includes('schema cache')) {
          const { data: crewDataWithoutCoFounders, error: errorWithoutCoFounders } = await supabase
            .from('clans')
            .update(updateData)
            .eq('id', crewId)
            .select('id, name, description, avatar_url, total_score, creator_id, created_at')
            .single();
          
          if (errorWithoutCoFounders) {
            updateErr = errorWithoutCoFounders;
          } else {
            updatedCrewData = crewDataWithoutCoFounders;
          }
        } else {
          updateErr = errorWithCoFounders;
        }
      } else {
        updatedCrewData = crewDataWithCoFounders;
      }
      
      if (updateErr) {
        console.error(' Update failed:', updateErr);
        console.error('Update error details:', JSON.stringify(updateErr, null, 2));
        
        // Provide specific error messages
        if (updateErr.code === '42501' || updateErr.message?.includes('permission')) {
          throw new Error('Permission denied. You must be a crew admin (creator or co-founder) to update crew settings.');
        } else if (updateErr.code === 'PGRST116' || updateErr.message?.includes('0 rows')) {
          throw new Error('Crew not found or you do not have permission to update it.');
        } else {
          throw updateErr;
        }
      }

      if (!updatedCrewData) {
        console.error(' No data returned from update');
        throw new Error('Update succeeded but no data was returned');
      }

      
      // Verify avatar_url was actually updated in the database
      if (avatarFile) {
        // Normalize URLs for comparison (remove query params)
        const normalizedUploadedUrl = avatarUrl?.split('?')[0];
        const normalizedDbUrl = updatedCrewData.avatar_url?.split('?')[0];
        
        if (normalizedDbUrl !== normalizedUploadedUrl) {
          
          // Do a fresh fetch to verify what's actually in the database
          const { data: verifyData, error: verifyError } = await supabase
            .from('clans')
            .select('avatar_url')
            .eq('id', crewId)
            .single();
          
          if (!verifyError && verifyData) {
            
            // Use verified data if available
            if (verifyData.avatar_url) {
              updatedCrewData.avatar_url = verifyData.avatar_url;
            } else {
              // If database doesn't have it, use our uploaded URL
              updatedCrewData.avatar_url = avatarUrl;
            }
          } else {
            // If verification fails, use the uploaded URL
            updatedCrewData.avatar_url = avatarUrl;
          }
        } else {
        }
      }

      // Update local state with the returned data
      const oldName = crew.name;
      const oldAvatar = crew.avatar_url;
      
      // Use the data returned from the update (which should include the new avatar_url)
      // Ensure avatar_url is always set if we uploaded a file
      const updatedCrew = {
        ...updatedCrewData,
        avatar_url: avatarFile ? (updatedCrewData.avatar_url || avatarUrl) : updatedCrewData.avatar_url,
      };
      
      
      // Add activities for changes
      if (profile) {
        if (oldName !== updatedCrew.name) {
          setActivities(prev => [{
            type: 'renamed',
            timestamp: new Date().toISOString(),
            user: profile,
            oldValue: oldName,
            newValue: updatedCrew.name,
          }, ...prev].slice(0, 50));
        }
        
        if (oldAvatar !== updatedCrew.avatar_url) {
          setActivities(prev => [{
            type: 'avatar_changed',
            timestamp: new Date().toISOString(),
            user: profile,
          }, ...prev].slice(0, 50));
        }
      }
      
      
      // Update crew state immediately with the new avatar URL
      // Force a state update by creating a new object reference
      const finalAvatarUrl = updatedCrew.avatar_url || avatarUrl;
      const crewWithNewAvatar = {
        ...updatedCrew,
        avatar_url: finalAvatarUrl, // Ensure avatar_url is set
      } as Crew;
      
      
      // Update state immediately
      setCrew(crewWithNewAvatar);
      
      // Also update the preview to match
      setAvatarPreview(finalAvatarUrl || null);
      
      // Reset form state
      setAvatarFile(null);
      
      
      setShowSuccess(true);
      
      try {
        await Haptics.notification({ type: NotificationType.Success });
      } catch (e) {}
      
      // Immediately refresh crew data to ensure UI is in sync
      // Don't wait for the timeout - refresh right away
      await fetchCrewData();
      
      setTimeout(() => {
        setShowSettings(false);
        setShowSuccess(false);
      }, 1500);
    } catch (error: any) {
      console.error(' Error saving crew settings:', error);
      const errorMessage = error.message || 'Failed to save crew settings. Please try again.';
      setError(errorMessage);
      
      // Show more detailed error messages
      if (errorMessage.includes('Bucket not found') || errorMessage.includes('does not exist')) {
        setError(
          'Storage bucket "avatars" does not exist.\n\n' +
          '📝 QUICK FIX:\n\n' +
          'Option 1 - Manual (Recommended):\n' +
          '1. Go to Supabase Dashboard > Storage\n' +
          '2. Click "New Bucket"\n' +
          '3. Name: avatars (exactly, lowercase)\n' +
          '4. Public: Yes (check this box!)\n' +
          '5. Click "Create Bucket"\n\n' +
          'Option 2 - Automated:\n' +
          'Run: npx tsx scripts/setup-storage-buckets.ts\n\n' +
          'After creating, refresh the page and try again.\n\n' +
          'Verify setup: npx tsx scripts/verify-crews-setup.ts'
        );
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

  const handleTransferOwnership = async (newOwnerId: string) => {
    if (!user || !crewId || !crew) return;
    
    // Verify user is creator (only creator can transfer ownership)
    if (!isCreator) {
      setError('Only the crew creator can transfer ownership.');
      try {
        await Haptics.notification({ type: NotificationType.Error });
      } catch (e) {}
      return;
    }
    
    if (newOwnerId === user.id) {
      setError('You cannot transfer ownership to yourself.');
      try {
        await Haptics.notification({ type: NotificationType.Error });
      } catch (e) {}
      return;
    }
    
    setSaving(true);
    setError('');
    
    try {
      await Haptics.impact({ style: ImpactStyle.Medium });
    } catch (e) {}
    
    try {
      // Get current co-founders
      const currentCoFounders = (crew as any).co_founders || [];
      
      // Add old creator to co-founders list (if not already there)
      const updatedCoFounders = [...new Set([...currentCoFounders, user.id])];
      
      // Transfer ownership: update creator_id and co_founders
      // First try with co_founders, fallback to just creator_id if column doesn't exist
      let transferError: any = null;
      
      // Try updating with co_founders first
      const { error: updateWithCoFoundersError } = await supabase
        .from('clans')
        .update({
          creator_id: newOwnerId,
          co_founders: updatedCoFounders.filter(id => id !== newOwnerId) // Remove new owner from co-founders
        })
        .eq('id', crewId)
        .eq('creator_id', user.id); // Ensure only current creator can transfer
      
      if (updateWithCoFoundersError) {
        // Check if error is about missing co_founders column
        if (updateWithCoFoundersError.message?.includes('co_founders') || 
            updateWithCoFoundersError.message?.includes('column') ||
            updateWithCoFoundersError.message?.includes('schema cache')) {
          
          // Fallback: update only creator_id
          const { error: updateWithoutCoFoundersError } = await supabase
            .from('clans')
            .update({
              creator_id: newOwnerId
            })
            .eq('id', crewId)
            .eq('creator_id', user.id);
          
          if (updateWithoutCoFoundersError) {
            transferError = updateWithoutCoFoundersError;
          } else {
            // Note: We can't add old creator to co-founders if column doesn't exist
          }
        } else {
          transferError = updateWithCoFoundersError;
        }
      }
      
      if (transferError) {
        // Provide helpful error message if it's a migration issue
        if (transferError.message?.includes('co_founders') || 
            transferError.message?.includes('column') ||
            transferError.message?.includes('schema cache')) {
          throw new Error(
            'The co_founders feature is not available. The database migration has not been applied.\n\n' +
            '📝 QUICK FIX:\n\n' +
            '1. Go to Supabase Dashboard > SQL Editor\n' +
            '2. Open and run: frontend/supabase/migrations/20250203000000_finalize_crews_feature.sql\n' +
            '3. Refresh this page and try again\n\n' +
            'Or verify your setup:\n' +
            '   Run: npx tsx scripts/verify-crews-setup.ts'
          );
        }
        throw transferError;
      }
      
      
      // Success haptic
      try {
        await Haptics.notification({ type: NotificationType.Success });
      } catch (e) {}
      
      // Refresh crew data
      await fetchCrewData();
      setShowTransferOwnership(false);
      setSelectedMemberForAction(null);
      setSaving(false);
      
    } catch (error: any) {
      console.error(' Error transferring ownership:', error);
      setError(error?.message || 'Failed to transfer ownership. Please try again.');
      setSaving(false);
      
      try {
        await Haptics.notification({ type: NotificationType.Error });
      } catch (e) {}
    }
  };

  const handleMakeCoFounder = async (memberId: string, makeCoFounder: boolean) => {
    if (!user || !crewId || !crew) return;
    
    // Verify user is admin
    if (!isAdmin) {
      setError('Only crew admins can manage co-founders.');
      try {
        await Haptics.notification({ type: NotificationType.Error });
      } catch (e) {}
      return;
    }
    
    if (memberId === (crew as any).creator_id) {
      setError('The creator is already an admin.');
      try {
        await Haptics.notification({ type: NotificationType.Error });
      } catch (e) {}
      return;
    }
    
    setSaving(true);
    setError('');
    
    try {
      await Haptics.impact({ style: ImpactStyle.Medium });
    } catch (e) {}
    
    try {
      const currentCoFounders = (crew as any).co_founders || [];
      let updatedCoFounders: string[];
      
      if (makeCoFounder) {
        // Add to co-founders
        updatedCoFounders = [...new Set([...currentCoFounders, memberId])];
      } else {
        // Remove from co-founders
        updatedCoFounders = currentCoFounders.filter((id: string) => id !== memberId);
      }
      
      const { error: updateError } = await supabase
        .from('clans')
        .update({ co_founders: updatedCoFounders })
        .eq('id', crewId);
      
      if (updateError) {
        // Check if error is about missing column
        if (updateError.message?.includes('co_founders') || 
            updateError.message?.includes('column') ||
            updateError.message?.includes('schema cache')) {
          throw new Error(
            'The co_founders feature is not available. The database migration has not been applied.\n\n' +
            '📝 QUICK FIX:\n\n' +
            '1. Go to Supabase Dashboard > SQL Editor\n' +
            '2. Open and run: frontend/supabase/migrations/20250203000000_finalize_crews_feature.sql\n' +
            '3. Refresh this page and try again\n\n' +
            'Or verify your setup:\n' +
            '   Run: npx tsx scripts/verify-crews-setup.ts\n\n' +
            '📖 For detailed instructions, see: frontend/CREWS_SETUP_COMPLETE.md'
          );
        }
        throw updateError;
      }
      
      
      // Add activity for co-founder change
      if (selectedMemberForAction) {
        const { data: memberProfile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', memberId)
          .maybeSingle();
        
        if (memberProfile) {
          setActivities(prev => [{
            type: makeCoFounder ? 'co_founder_added' : 'co_founder_removed',
            timestamp: new Date().toISOString(),
            user: memberProfile,
          }, ...prev].slice(0, 50));
        }
      }
      
      // Success haptic
      try {
        await Haptics.notification({ type: NotificationType.Success });
      } catch (e) {}
      
      // Refresh crew data
      await fetchCrewData();
      setShowMakeCoFounder(false);
      setSelectedMemberForAction(null);
      setSaving(false);
      
    } catch (error: any) {
      console.error(' Error updating co-founder:', error);
      const errorMessage = error?.message || `Failed to ${makeCoFounder ? 'add' : 'remove'} co-founder. Please try again.`;
      setError(errorMessage);
      setSaving(false);
      
      try {
        await Haptics.notification({ type: NotificationType.Error });
      } catch (e) {}
    }
  };

  const handleDeleteCrew = async () => {
    if (!user || !crewId || !crew) {
      setError('Missing required information to delete crew');
      return;
    }
    
    // Verify user is creator
    const creatorId = (crew as any).creator_id;
    if (!isCreator && creatorId !== user.id) {
      setError('You do not have permission to delete this crew. Only the creator can delete it.');
      try {
        await Haptics.notification({ type: NotificationType.Error });
      } catch (e) {}
      return;
    }
    
    setDeleting(true);
    setError('');
    
    try {
      await Haptics.impact({ style: ImpactStyle.Medium });
    } catch (e) {}
    
    try {

      // First, explicitly remove all members from the crew
      // This ensures clean state even though ON DELETE SET NULL should handle it
      const { error: membersError } = await supabase
        .from('profiles')
        .update({ clan_id: null })
        .eq('clan_id', crewId);
      
      if (membersError) {
        // Continue with deletion anyway - foreign key constraint should handle it
      } else {
      }

      // Delete the crew using Supabase
      // RLS policy will check: auth.uid() = creator_id OR creator_id IS NULL
      let deleteError = null;
      
      if (creatorId) {
        // Crew has creator_id set - use RLS policy that checks creator_id
        const { error } = await supabase
          .from('clans')
          .delete()
          .eq('id', crewId);
        
        deleteError = error;
        
        // If that fails, try with explicit creator_id filter (though RLS should handle it)
        if (deleteError && (deleteError.code === '42501' || deleteError.message?.includes('permission'))) {
          const { error: retryError } = await supabase
            .from('clans')
            .delete()
            .eq('id', crewId)
            .eq('creator_id', user.id);
          
          deleteError = retryError;
        }
      } else {
        // Legacy crew without creator_id - use policy that allows deletion if creator_id IS NULL
        const { error } = await supabase
          .from('clans')
          .delete()
          .eq('id', crewId);
        
        deleteError = error;
      }
      
      if (deleteError) {
        console.error(' Delete error:', deleteError);
        
        // Provide user-friendly error messages
        if (deleteError.code === '42501' || deleteError.message?.includes('permission') || deleteError.message?.includes('policy')) {
          throw new Error('Permission denied. You must be the crew creator to delete it.');
        } else if (deleteError.code === 'PGRST116' || deleteError.message?.includes('0 rows')) {
          throw new Error('Crew not found or already deleted.');
        } else {
          throw deleteError;
        }
      }
      
      
      // Success haptic
      try {
        await Haptics.notification({ type: NotificationType.Success });
      } catch (e) {}
      
      // Close confirmation modal
      setShowDeleteConfirm(false);
      
      // Small delay before navigation to show success state
      setTimeout(() => {
        // Navigate back to explore page with crews tab
        navigate('/explore?tab=crews');
      }, 500);
      
    } catch (error: any) {
      console.error(' Error deleting crew:', error);
      const errorMessage = error?.message || error?.error_description || 'Failed to delete crew. Please try again.';
      setError(errorMessage);
      setDeleting(false);
      
      try {
        await Haptics.notification({ type: NotificationType.Error });
      } catch (e) {}
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

  if (!crew) {
    return (
      <div className="min-h-screen bg-groovely-dark-bg">
        <PageHeader
          title="Crew Not Found"
          subtitle="THIS CREW DOES NOT EXIST"
          icon={<Users size={32} className="text-white/90" />}
          bottomPadding="xl"
          maxWidth="4xl"
        />
        <div className="max-w-4xl mx-auto px-6">
          <Card variant="elevated" className="text-center py-12">
            <Users size={64} className="mx-auto mb-4 text-groovely-dark-text-tertiary" />
            <h3 className="text-2xl font-bold text-white mb-2 font-heading">Crew Not Found</h3>
            <p className="text-base text-groovely-dark-text-secondary mb-6">
              This crew doesn't exist or has been deleted.
            </p>
            <Button onClick={() => navigate('/explore')} variant="primary">
              <ArrowLeft size={18} className="mr-2" /> Back to Explore
            </Button>
          </Card>
        </div>
      </div>
    );
  }

  const rankBadge = crewRank ? getRankBadge(crewRank) : null;
  const RankIcon = rankBadge?.icon || Star;

  return (
    <div className="min-h-screen bg-groovely-dark-bg pb-24">
      {/* Elegant Header - No Icon */}
      <div className="relative overflow-hidden">
        {/* Gradient Background */}
        <div className="absolute inset-0 bg-gradient-to-br from-groovely-purple-500/20 via-groovely-pink-500/10 to-groovely-peach-500/20" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-groovely-purple-500/10 via-transparent to-transparent" />
        
        <div className="relative max-w-7xl mx-auto px-6 pt-8 pb-12">
          {/* Top Bar */}
          <div className="flex items-center justify-between mb-8">
            <motion.button
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => navigate(-1)}
              className="p-3 rounded-2xl bg-white/5 hover:bg-white/10 backdrop-blur-sm border border-white/10 transition-all"
            >
              <ArrowLeft size={20} className="text-white" />
            </motion.button>
            
            <div className="flex items-center gap-3">
              {isAdmin && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleOpenSettings}
                  className="p-3 rounded-2xl bg-white/5 hover:bg-white/10 backdrop-blur-sm border border-white/10 transition-all"
                  title="Crew Settings"
                >
                  <Settings size={20} className="text-white" />
                </motion.button>
              )}
              {!isCreator && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleJoinClan}
                  disabled={joining}
                  className={`px-6 py-3 rounded-2xl font-semibold text-sm transition-all backdrop-blur-sm ${
                    isMember
                      ? 'bg-red-500/20 hover:bg-red-500/30 border border-red-500/50 text-red-400'
                      : 'bg-gradient-to-r from-groovely-peach-500 to-groovely-purple-500 hover:from-groovely-peach-600 hover:to-groovely-purple-600 text-white shadow-lg shadow-groovely-peach-500/20'
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
                      Leave
                    </>
                  ) : (
                    <>
                      <UserPlus size={18} className="inline mr-2" />
                      Join Crew
                    </>
                  )}
                </motion.button>
              )}
            </div>
          </div>

          {/* Crew Title & Description */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mb-8"
          >
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white font-heading mb-3">
              {crew.name}
            </h1>
            {crew.description && (
              <p className="text-lg md:text-xl text-white/70 max-w-3xl leading-relaxed">
                {crew.description}
              </p>
            )}
          </motion.div>

          {/* Key Stats - Horizontal Cards */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="grid grid-cols-3 gap-4"
          >
            <Card variant="elevated" className="bg-white/5 backdrop-blur-md border border-white/10 hover:border-white/20 transition-all group cursor-pointer" onClick={() => setActiveTab('members')}>
              <div className="text-center py-4">
                <div className="text-3xl md:text-4xl font-bold text-white font-heading mb-1 group-hover:scale-110 transition-transform">
                  {(calculatedCrewScore || crew.total_score || 0).toLocaleString()}
                </div>
                <div className="text-xs text-white/60 uppercase tracking-wider">Total Score</div>
              </div>
            </Card>

            <Card variant="elevated" className="bg-white/5 backdrop-blur-md border border-white/10 hover:border-white/20 transition-all group cursor-pointer" onClick={() => setActiveTab('members')}>
              <div className="text-center py-4">
                <div className="text-3xl md:text-4xl font-bold text-white font-heading mb-1 group-hover:scale-110 transition-transform">
                  {members.length}
                </div>
                <div className="text-xs text-white/60 uppercase tracking-wider">Members</div>
              </div>
            </Card>

            <Card variant="elevated" className="bg-white/5 backdrop-blur-md border border-white/10 hover:border-white/20 transition-all">
              <div className="text-center py-4">
                <div className="text-3xl md:text-4xl font-bold text-white font-heading mb-1 flex items-center justify-center gap-2">
                  {crewRank || '—'}
                  {crewRank && crewRank <= 3 && (
                    <motion.div
                      animate={{ rotate: [0, 10, -10, 0] }}
                      transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
                    >
                      <Star size={20} className="text-yellow-400" />
                    </motion.div>
                  )}
                </div>
                <div className="text-xs text-white/60 uppercase tracking-wider">Global Rank</div>
                <div className="text-xs text-groovely-dark-text-secondary uppercase tracking-[0.3em] mt-1">
                  Tier: {crewRankTier}
                </div>
                <div className="text-sm text-white/70 mt-1">
                  Crew Score {crewRankScore.toLocaleString()} pts
                </div>
              </div>
            </Card>
          </motion.div>
        </div>
      </div>

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
                { id: 'chat' as const, label: 'Chat', icon: MessageCircle, hidden: !CHAT_ENABLED },
                { id: 'activity' as const, label: 'Activity', icon: Zap },
              ].filter((tab) => !tab.hidden).map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <motion.button
                    key={tab.id}
                    onClick={() => {
                      // Disable chat tab if not enabled
                      if (tab.id === 'chat' && !CHAT_ENABLED) return;
                      try {
                        Haptics.impact({ style: ImpactStyle.Light });
                      } catch (e) {}
                      setActiveTab(tab.id);
                    }}
                    disabled={tab.id === 'chat' && !CHAT_ENABLED}
                    whileTap={{ scale: 0.97 }}
                    whileHover={{ scale: 1.02 }}
                    className={`relative flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-sm transition-all ${
                      isActive ? 'text-white' : 'text-groovely-dark-text-secondary hover:bg-groovely-dark-surface'
                    } ${tab.id === 'chat' && !CHAT_ENABLED ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    {isActive && (
                      <motion.div
                        layoutId="activeClanTab"
                        className="absolute inset-0 bg-gradient-to-r from-groovely-peach-500 to-groovely-purple-500 rounded-xl"
                        initial={false}
                        transition={{ 
                          type: 'spring', 
                          stiffness: 500, 
                          damping: 40,
                          mass: 0.8
                        }}
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
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="space-y-8"
            >
              {/* Crew Avatar Section - Clickable for Admins */}
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.1 }}
              >
                <Card variant="elevated" className="bg-gradient-to-br from-groovely-dark-card/80 to-groovely-dark-surface/80 backdrop-blur-xl border border-white/10 overflow-hidden relative group">
                  <div className="absolute inset-0 bg-gradient-to-br from-groovely-purple-500/5 via-transparent to-groovely-peach-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                  
                  <div className="relative p-8 md:p-12">
                    <div className="flex flex-col md:flex-row items-center md:items-start gap-8">
                      {/* Large Clickable Avatar */}
                      <motion.div
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        className="relative flex-shrink-0"
                      >
                        {isAdmin ? (
                          <label className="cursor-pointer group/avatar">
                            <input
                              type="file"
                              ref={fileInputRef}
                              onChange={handleAvatarChange}
                              accept="image/*"
                              className="hidden"
                            />
                            <div className="relative">
                              {crew.avatar_url ? (
                                <div className="w-40 h-40 md:w-48 md:h-48 rounded-3xl overflow-hidden border-4 border-white/20 shadow-2xl ring-4 ring-groovely-purple-500/30 group-hover/avatar:ring-groovely-peach-500/50 transition-all">
                                  <img 
                                    key={`crew-avatar-${crew.id}-${crew.avatar_url}`}
                                    src={crew.avatar_url}
                                    alt={crew.name} 
                                    className="w-full h-full object-cover group-hover/avatar:scale-110 transition-transform duration-300"
                                    onError={(e) => {
                                      console.error(' Failed to load crew avatar:', crew.avatar_url);
                                      const target = e.target as HTMLImageElement;
                                      target.style.display = 'none';
                                    }}
                                    onLoad={() => {
                                    }}
                                  />
                                </div>
                              ) : (
                                <div className="w-40 h-40 md:w-48 md:h-48 bg-gradient-to-br from-groovely-purple-500 to-groovely-peach-500 rounded-3xl flex items-center justify-center shadow-2xl border-4 border-white/20 ring-4 ring-groovely-purple-500/30 group-hover/avatar:ring-groovely-peach-500/50 transition-all">
                                  <Users size={80} className="text-white/90" />
                                </div>
                              )}
                              {/* Upload Overlay */}
                              <div className="absolute inset-0 bg-black/60 rounded-3xl flex items-center justify-center opacity-0 group-hover/avatar:opacity-100 transition-opacity">
                                <div className="text-center">
                                  <Camera size={32} className="text-white mx-auto mb-2" />
                                  <span className="text-white text-sm font-semibold">Change Photo</span>
                                </div>
                              </div>
                              {/* Rank Badge */}
                              {crewRank && crewRank <= 3 && (
                                <motion.div
                                  initial={{ scale: 0, rotate: -180 }}
                                  animate={{ scale: 1, rotate: 0 }}
                                  className={`absolute -top-3 -right-3 w-14 h-14 bg-gradient-to-br ${rankBadge?.color} rounded-full flex items-center justify-center ${rankBadge?.glow} shadow-2xl border-3 border-white/40`}
                                >
                                  <RankIcon size={28} className="text-white" />
                                </motion.div>
                              )}
                            </div>
                          </label>
                        ) : (
                          <div className="relative">
                            {crew.avatar_url ? (
                              <div className="w-40 h-40 md:w-48 md:h-48 rounded-3xl overflow-hidden border-4 border-white/20 shadow-2xl ring-4 ring-groovely-purple-500/30">
                                <img 
                                  key={`crew-avatar-${crew.id}-${crew.avatar_url}`}
                                  src={crew.avatar_url}
                                  alt={crew.name} 
                                  className="w-full h-full object-cover"
                                  onError={(e) => {
                                    console.error(' Failed to load crew avatar:', crew.avatar_url);
                                    const target = e.target as HTMLImageElement;
                                    target.style.display = 'none';
                                  }}
                                  onLoad={() => {
                                  }}
                                />
                              </div>
                            ) : (
                              <div className="w-40 h-40 md:w-48 md:h-48 bg-gradient-to-br from-groovely-purple-500 to-groovely-peach-500 rounded-3xl flex items-center justify-center shadow-2xl border-4 border-white/20 ring-4 ring-groovely-purple-500/30">
                                <Users size={80} className="text-white/90" />
                              </div>
                            )}
                            {crewRank && crewRank <= 3 && (
                              <motion.div
                                initial={{ scale: 0, rotate: -180 }}
                                animate={{ scale: 1, rotate: 0 }}
                                className={`absolute -top-3 -right-3 w-14 h-14 bg-gradient-to-br ${rankBadge?.color} rounded-full flex items-center justify-center ${rankBadge?.glow} shadow-2xl border-3 border-white/40`}
                              >
                                <RankIcon size={28} className="text-white" />
                              </motion.div>
                            )}
                          </div>
                        )}
                      </motion.div>

                      {/* Crew Info */}
                      <div className="flex-1 text-center md:text-left">
                        <div className="mb-6">
                          <h2 className="text-3xl md:text-4xl font-bold text-white font-heading mb-3">
                            {crew.name}
                          </h2>
                          {crew.description && (
                            <p className="text-base md:text-lg text-white/70 leading-relaxed max-w-2xl">
                              {crew.description}
                            </p>
                          )}
                        </div>
                        
                        {/* Quick Stats */}
                        <div className="grid grid-cols-3 gap-4 max-w-lg">
                          <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
                            <div className="text-2xl md:text-3xl font-bold text-white font-heading mb-1">
                              {(calculatedCrewScore || crew.total_score || 0).toLocaleString()}
                            </div>
                            <div className="text-xs text-white/50 uppercase tracking-wider">Score</div>
                          </div>
                          <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
                            <div className="text-2xl md:text-3xl font-bold text-white font-heading mb-1">
                              {members.length}
                            </div>
                            <div className="text-xs text-white/50 uppercase tracking-wider">Members</div>
                          </div>
                          <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
                            <div className="text-2xl md:text-3xl font-bold text-white font-heading mb-1 flex items-center justify-center gap-1">
                              {crewRank || '—'}
                              {crewRank && crewRank <= 3 && <Star size={16} className="text-yellow-400" />}
                            </div>
                            <div className="text-xs text-white/50 uppercase tracking-wider">Rank</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>
              </motion.div>

              {/* Performance Dashboard */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Engagement Metrics */}
                  <Card variant="elevated" className="bg-gradient-to-br from-groovely-purple-500/10 to-groovely-pink-500/10 backdrop-blur-xl border border-white/10 overflow-hidden group">
                    <div className="p-6">
                      <div className="flex items-center gap-3 mb-6">
                        <div className="w-12 h-12 bg-gradient-to-br from-groovely-purple-500 to-groovely-pink-500 rounded-2xl flex items-center justify-center shadow-lg">
                          <Flame size={24} className="text-white" />
                        </div>
                        <div>
                          <h3 className="text-xl font-bold text-white font-heading">Engagement</h3>
                          <p className="text-xs text-white/50">Community activity</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                          <div className="flex items-center gap-2 mb-2">
                            <ViewCount count={crewStats.totalViews} size="sm" className="text-groovely-blue-400" showIcon={true} />
                            <span className="text-xs text-white/60 uppercase tracking-wide">Views</span>
                          </div>
                          <ViewCount count={crewStats.totalViews} size="lg" className="text-white font-heading font-bold" showIcon={false} />
                        </div>
                        <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                          <div className="flex items-center gap-2 mb-2">
                            <Heart size={16} className="text-red-400" />
                            <span className="text-xs text-white/60 uppercase tracking-wide">Likes</span>
                          </div>
                          <div className="text-2xl font-bold text-white font-heading">{crewStats.totalLikes.toLocaleString()}</div>
                        </div>
                        <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                          <div className="flex items-center gap-2 mb-2">
                            <VideoIcon size={16} className="text-groovely-pink-400" />
                            <span className="text-xs text-white/60 uppercase tracking-wide">Videos</span>
                          </div>
                          <div className="text-2xl font-bold text-white font-heading">{crewStats.totalVideos}</div>
                        </div>
                        <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                          <div className="flex items-center gap-2 mb-2">
                            <TrendingUp size={16} className="text-green-400" />
                            <span className="text-xs text-white/60 uppercase tracking-wide">Growth</span>
                          </div>
                          <div className="text-2xl font-bold text-white font-heading">+{crewStats.weeklyGrowth}</div>
                        </div>
                      </div>
                    </div>
                  </Card>

                  {/* Quick Actions */}
                  <Card variant="elevated" className="bg-gradient-to-br from-groovely-peach-500/10 to-groovely-purple-500/10 backdrop-blur-xl border border-white/10 overflow-hidden">
                    <div className="p-6">
                      <div className="flex items-center gap-3 mb-6">
                        <div className="w-12 h-12 bg-gradient-to-br from-groovely-peach-500 to-groovely-purple-500 rounded-2xl flex items-center justify-center shadow-lg">
                          <Zap size={24} className="text-white" />
                        </div>
                        <div>
                          <h3 className="text-xl font-bold text-white font-heading">Quick Actions</h3>
                          <p className="text-xs text-white/50">Navigate & manage</p>
                        </div>
                      </div>
                      <div className="space-y-3">
                        {/* Crew Chat button - disabled but code kept for reactivation */}
                        {CHAT_ENABLED && (
                        <Button
                          variant="ghost"
                          size="md"
                          fullWidth
                          onClick={() => {
                            try {
                              Haptics.impact({ style: ImpactStyle.Light });
                            } catch (e) {}
                            setActiveTab('chat');
                          }}
                          className="!justify-start !text-white hover:!bg-white/10 !h-12 !text-base !rounded-xl"
                        >
                          <MessageCircle size={20} className="mr-3" />
                          Open Chat
                        </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="md"
                          fullWidth
                          onClick={() => {
                            try {
                              Haptics.impact({ style: ImpactStyle.Light });
                            } catch (e) {}
                            setActiveTab('activity');
                          }}
                          className="!justify-start !text-white hover:!bg-white/10 !h-12 !text-base !rounded-xl"
                        >
                          <Zap size={20} className="mr-3" />
                          View Activity
                        </Button>
                        <Button
                          variant="ghost"
                          size="md"
                          fullWidth
                          onClick={() => {
                            try {
                              Haptics.impact({ style: ImpactStyle.Light });
                            } catch (e) {}
                            setActiveTab('members');
                          }}
                          className="!justify-start !text-white hover:!bg-white/10 !h-12 !text-base !rounded-xl"
                        >
                          <Users size={20} className="mr-3" />
                          View All Members
                        </Button>
                        {isAdmin && (
                          <Button
                            variant="ghost"
                            size="md"
                            fullWidth
                            onClick={handleOpenSettings}
                            className="!justify-start !text-white hover:!bg-white/10 !h-12 !text-base !rounded-xl"
                          >
                            <Settings size={20} className="mr-3" />
                            Manage Crew
                          </Button>
                        )}
                      </div>
                    </div>
                  </Card>
                </div>
              </motion.div>

              {/* Recent Videos from Crew */}
              {recentVideos.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                >
                  <Card variant="elevated" className="bg-gradient-to-br from-groovely-dark-card/80 to-groovely-dark-surface/80 backdrop-blur-xl border border-white/10 overflow-hidden">
                    <div className="p-6">
                      <div className="flex items-center justify-between mb-6">
                        <div>
                          <h3 className="text-xl font-bold text-white font-heading flex items-center gap-2 mb-1">
                            <VideoIcon size={24} className="text-groovely-pink-400" />
                            Recent Videos
                          </h3>
                          <p className="text-xs text-white/50">Latest content from crew members</p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => navigate('/explore?tab=videos')}
                          className="text-groovely-pink-400 hover:text-groovely-pink-300 hover:bg-white/5 rounded-xl"
                        >
                          View All →
                        </Button>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {recentVideos.map((video, index) => (
                          <motion.div
                            key={video.id}
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: 0.4 + index * 0.05 }}
                            whileHover={{ scale: 1.05, y: -4 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => navigate(`/video/${video.id}`)}
                            className="relative aspect-video rounded-2xl overflow-hidden cursor-pointer group bg-groovely-dark-surface border-2 border-white/10 hover:border-groovely-pink-500/50 transition-all shadow-lg"
                          >
                            {video.thumbnail_url ? (
                              <img 
                                src={video.thumbnail_url} 
                                alt={video.title} 
                                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                              />
                            ) : (
                              <div className="w-full h-full bg-gradient-to-br from-groovely-purple-500/50 to-groovely-peach-500/50 flex items-center justify-center">
                                <VideoIcon size={40} className="text-white/50" />
                              </div>
                            )}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                              <div className="absolute bottom-0 left-0 right-0 p-3">
                                <p className="text-sm font-semibold text-white truncate mb-2 line-clamp-2">{video.title}</p>
                                <div className="flex items-center gap-3 text-xs text-white/80">
                                  <ViewCount count={video.views || 0} size="sm" className="text-white/80" />
                                  <span className="flex items-center gap-1">
                                    <Heart size={12} /> {video.likes?.toLocaleString() || 0}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    </div>
                  </Card>
                </motion.div>
              )}

              {/* Performance Insights */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
              >
                <Card variant="elevated" className="bg-gradient-to-br from-groovely-dark-card/80 to-groovely-dark-surface/80 backdrop-blur-xl border border-white/10 overflow-hidden">
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h3 className="text-lg font-bold text-white font-heading flex items-center gap-2 mb-1">
                        <BarChart3 size={20} className="text-groovely-purple-400" />
                        Performance Insights
                      </h3>
                      <p className="text-xs text-groovely-dark-text-tertiary">Crew analytics and metrics</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Score Distribution */}
                    <div className="space-y-4">
                      <h4 className="text-sm font-semibold text-groovely-dark-text-secondary uppercase tracking-wide flex items-center gap-2">
                        <Trophy size={14} />
                        Score Distribution
                      </h4>
                      {(members || []).length > 0 ? (
                        <div className="space-y-3">
                          {(members || []).slice(0, 5).map((member, index) => {
                            const memberScores = (members || []).map(m => m.score || 0);
                            const maxScore = Math.max(...memberScores, 1);
                            const percentage = maxScore > 0 ? ((member.score || 0) / maxScore) * 100 : 0;
                            return (
                              <div key={member.id} className="space-y-2">
                                <div className="flex items-center justify-between text-xs">
                                  <div className="flex items-center gap-2 flex-1 min-w-0">
                                    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-groovely-purple-500/80 to-groovely-peach-500/80 flex items-center justify-center flex-shrink-0 overflow-hidden">
                                      {member.avatar_url ? (
                                        <img src={member.avatar_url} alt={member.username} className="w-full h-full object-cover" />
                                      ) : (
                                        <span className="text-white text-[10px] font-bold">{member.username?.[0]?.toUpperCase()}</span>
                                      )}
                                    </div>
                                    <span className="text-groovely-dark-text-secondary truncate">
                                      {member.display_name || member.username}
                                    </span>
                                  </div>
                                  <span className="text-white font-semibold ml-2">{(member.score || 0).toLocaleString()}</span>
                                </div>
                                <div className="h-2 bg-groovely-dark-surface rounded-full overflow-hidden">
                                  <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${percentage}%` }}
                                    transition={{ duration: 0.8, delay: index * 0.1, ease: [0.16, 1, 0.3, 1] }}
                                    className="h-full bg-gradient-to-r from-groovely-peach-500 to-groovely-purple-500 rounded-full"
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-sm text-groovely-dark-text-tertiary text-center py-4">No members yet</p>
                      )}
                    </div>

                    {/* Activity Breakdown */}
                    <div className="space-y-4">
                      <h4 className="text-sm font-semibold text-groovely-dark-text-secondary uppercase tracking-wide flex items-center gap-2">
                        <Zap size={14} />
                        Activity Breakdown
                      </h4>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between p-4 bg-groovely-dark-surface/50 rounded-xl border border-groovely-dark-border/50 hover:border-groovely-purple-500/30 transition-all">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-gradient-to-br from-groovely-pink-500 to-groovely-purple-500 rounded-lg flex items-center justify-center">
                              <VideoIcon size={18} className="text-white" />
                            </div>
                            <div>
                              <span className="text-sm text-groovely-dark-text-secondary block">Videos Posted</span>
                              <span className="text-xs text-groovely-dark-text-tertiary">Total content</span>
                            </div>
                          </div>
                          <span className="text-2xl font-bold text-white font-heading">{crewStats.totalVideos}</span>
                        </div>
                        <div className="flex items-center justify-between p-4 bg-groovely-dark-surface/50 rounded-xl border border-groovely-dark-border/50 hover:border-groovely-blue-500/30 transition-all">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-gradient-to-br from-groovely-blue-500 to-groovely-purple-500 rounded-lg flex items-center justify-center">
                              <Eye size={18} className="text-white" />
                            </div>
                            <div>
                              <span className="text-sm text-groovely-dark-text-secondary block">Total Views</span>
                              <span className="text-xs text-groovely-dark-text-tertiary">All-time</span>
                            </div>
                          </div>
                          <ViewCount count={crewStats.totalViews} size="lg" className="text-white font-heading font-bold" showIcon={false} />
                        </div>
                        <div className="flex items-center justify-between p-4 bg-groovely-dark-surface/50 rounded-xl border border-groovely-dark-border/50 hover:border-groovely-peach-500/30 transition-all">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-gradient-to-br from-groovely-peach-500 to-groovely-pink-500 rounded-lg flex items-center justify-center">
                              <Heart size={18} className="text-white" />
                            </div>
                            <div>
                              <span className="text-sm text-groovely-dark-text-secondary block">Total Likes</span>
                              <span className="text-xs text-groovely-dark-text-tertiary">Community engagement</span>
                            </div>
                          </div>
                          <span className="text-2xl font-bold text-white font-heading">{crewStats.totalLikes.toLocaleString()}</span>
                        </div>
                        <div className="flex items-center justify-between p-4 bg-groovely-dark-surface/50 rounded-xl border border-groovely-dark-border/50 hover:border-groovely-purple-500/30 transition-all">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-gradient-to-br from-groovely-purple-500 to-groovely-pink-500 rounded-lg flex items-center justify-center">
                              <TrendingUp size={18} className="text-white" />
                            </div>
                            <div>
                              <span className="text-sm text-groovely-dark-text-secondary block">Weekly Growth</span>
                              <span className="text-xs text-groovely-dark-text-tertiary">New content this week</span>
                            </div>
                          </div>
                          <span className="text-2xl font-bold bg-gradient-to-r from-groovely-peach-500 to-groovely-purple-500 bg-clip-text text-transparent font-heading">
                            +{crewStats.weeklyGrowth}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>
              </motion.div>

              {/* Top Members Preview */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
              >
                <Card variant="elevated" className="bg-gradient-to-br from-groovely-dark-card/80 to-groovely-dark-surface/80 backdrop-blur-xl border border-white/10 overflow-hidden">
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h3 className="text-lg font-bold text-white font-heading flex items-center gap-2 mb-1">
                        <Crown size={20} className="text-groovely-peach-400" />
                        Top Performers
                      </h3>
                      <p className="text-xs text-groovely-dark-text-tertiary">Leading the crew</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        try {
                          Haptics.impact({ style: ImpactStyle.Light });
                        } catch (e) {}
                        setActiveTab('members');
                      }}
                      className="text-groovely-peach-400 hover:text-groovely-peach-300"
                    >
                      View All →
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {(members || []).slice(0, 5).map((member, index) => {
                      const memberBadge = getRankBadge(index + 1);
                      const MemberIcon = memberBadge.icon;
                      return (
                        <motion.div
                          key={member.id}
                          whileHover={{ scale: 1.01, x: 2 }}
                          whileTap={{ scale: 0.99 }}
                          onClick={() => navigate(`/user/${member.id}`)}
                          className="flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all group hover:bg-groovely-dark-surface/60 border border-transparent hover:border-groovely-dark-border/50"
                        >
                          <div className={`w-9 h-9 bg-gradient-to-br ${memberBadge.color} rounded-lg flex items-center justify-center flex-shrink-0 shadow-md`}>
                            {index < 3 ? (
                              <MemberIcon size={16} className="text-white" />
                            ) : (
                              <span className="text-xs font-bold text-white">{index + 1}</span>
                            )}
                          </div>
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-groovely-purple-500/80 to-groovely-peach-500/80 flex items-center justify-center flex-shrink-0 overflow-hidden ring-2 ring-groovely-dark-border group-hover:ring-groovely-peach-500/30 transition-all">
                            {member.avatar_url ? (
                              <img src={member.avatar_url} alt={member.username} className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-white text-sm font-bold">{member.username?.[0]?.toUpperCase() || '?'}</span>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <div className="text-sm font-semibold text-white truncate font-heading">
                                {member.display_name || member.username}
                              </div>
                              {member.id === (crew as any)?.creator_id && (
                                <motion.span
                                  initial={{ scale: 0 }}
                                  animate={{ scale: 1 }}
                                  className="px-1.5 py-0.5 bg-gradient-to-r from-yellow-400/90 to-yellow-600/90 text-black text-[10px] font-bold rounded-full flex items-center gap-0.5"
                                >
                                  <Crown size={10} />
                                  <span>Creator</span>
                                </motion.span>
                              )}
                              {coFounders.some(cf => cf.id === member.id) && member.id !== (crew as any)?.creator_id && (
                                <motion.span
                                  initial={{ scale: 0 }}
                                  animate={{ scale: 1 }}
                                  className="px-1.5 py-0.5 bg-gradient-to-r from-groovely-purple-500/90 to-groovely-pink-500/90 text-white text-[10px] font-bold rounded-full flex items-center gap-0.5"
                                >
                                  <Users size={10} />
                                  <span>Co-Founder</span>
                                </motion.span>
                              )}
                            </div>
                            <div className="text-xs text-groovely-dark-text-tertiary">@{member.username}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-base font-bold bg-gradient-to-r from-groovely-peach-500 to-groovely-purple-500 bg-clip-text text-transparent font-heading">
                              {member.score?.toLocaleString() || 0}
                            </div>
                            <div className="text-[10px] text-groovely-dark-text-tertiary">Score</div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </Card>
              </motion.div>

              {/* Crew Achievements */}
              <motion.div variants={staggerItemVariants}>
                <Card variant="elevated">
                  <h3 className="text-lg font-bold text-white font-heading flex items-center gap-2 mb-4">
                    <Award size={20} className="text-groovely-purple-400" />
                    Crew Achievements
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {[
                      { icon: Trophy, label: 'Elite Crew', unlocked: crewRank ? crewRank <= 10 : false, description: 'Top 10 globally', color: 'from-yellow-400 to-yellow-600' },
                      { icon: Flame, label: 'On Fire', unlocked: (calculatedCrewScore || crew.total_score || 0) > 10000, description: '10K+ total score', color: 'from-orange-400 to-red-500' },
                      { icon: Target, label: 'Goal Crusher', unlocked: members.length >= 10, description: '10+ members', color: 'from-blue-400 to-purple-500' },
                      { icon: Sparkles, label: 'Rising Star', unlocked: crewRank ? crewRank <= 5 : false, description: 'Top 5 globally', color: 'from-purple-400 to-pink-500' },
                      { icon: Zap, label: 'Powerhouse', unlocked: (calculatedCrewScore || crew.total_score || 0) > 50000, description: '50K+ total score', color: 'from-groovely-peach-500 to-groovely-purple-500' },
                      { icon: Crown, label: 'Legendary', unlocked: crewRank === 1, description: 'Rank #1 globally', color: 'from-yellow-400 via-yellow-500 to-yellow-600' },
                    ].map((achievement, index) => {
                      const getUnlockedBg = () => {
                        if (!achievement.unlocked) return 'bg-groovely-dark-surface';
                        switch (achievement.color) {
                          case 'from-yellow-400 to-yellow-600': return 'bg-gradient-to-br from-yellow-400/20 to-yellow-600/20 border-yellow-400/50 hover:border-yellow-400';
                          case 'from-orange-400 to-red-500': return 'bg-gradient-to-br from-orange-400/20 to-red-500/20 border-orange-400/50 hover:border-orange-400';
                          case 'from-blue-400 to-purple-500': return 'bg-gradient-to-br from-blue-400/20 to-purple-500/20 border-blue-400/50 hover:border-blue-400';
                          case 'from-purple-400 to-pink-500': return 'bg-gradient-to-br from-purple-400/20 to-pink-500/20 border-purple-400/50 hover:border-purple-400';
                          case 'from-groovely-peach-500 to-groovely-purple-500': return 'bg-gradient-to-br from-groovely-peach-500/20 to-groovely-purple-500/20 border-groovely-peach-500/50 hover:border-groovely-peach-500';
                          case 'from-yellow-400 via-yellow-500 to-yellow-600': return 'bg-gradient-to-br from-yellow-400/20 via-yellow-500/20 to-yellow-600/20 border-yellow-400/50 hover:border-yellow-400';
                          default: return 'bg-groovely-dark-surface border-groovely-dark-border';
                        }
                      };
                      
                      const getIconBg = () => {
                        if (!achievement.unlocked) return 'bg-groovely-dark-surface';
                        return `bg-gradient-to-br ${achievement.color}`;
                      };
                      
                      return (
                      <motion.div
                        key={index}
                        whileHover={{ scale: 1.05, y: -2 }}
                        whileTap={{ scale: 0.98 }}
                        className={`p-4 rounded-xl border-2 transition-all cursor-pointer ${
                          achievement.unlocked
                            ? getUnlockedBg()
                            : 'bg-groovely-dark-surface border-groovely-dark-border opacity-50'
                        }`}
                      >
                        <div className="flex items-center gap-3 mb-3">
                          <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                            achievement.unlocked 
                              ? `${getIconBg()} shadow-lg` 
                              : 'bg-groovely-dark-surface'
                          }`}>
                            <achievement.icon
                              size={24}
                              className={achievement.unlocked ? 'text-white' : 'text-groovely-dark-text-tertiary'}
                            />
                          </div>
                          <div className="flex-1">
                            <div className={`text-sm font-semibold ${
                              achievement.unlocked ? 'text-white' : 'text-groovely-dark-text-tertiary'
                            }`}>
                              {achievement.label}
                            </div>
                            <div className={`text-xs mt-0.5 ${
                              achievement.unlocked ? 'text-groovely-dark-text-secondary' : 'text-groovely-dark-text-tertiary'
                            }`}>
                              {achievement.description}
                            </div>
                          </div>
                        </div>
                        {achievement.unlocked && (
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className="text-xs text-groovely-peach-400 font-semibold flex items-center gap-1"
                          >
                            <Check size={12} />
                            Unlocked
                          </motion.div>
                        )}
                      </motion.div>
                      );
                    })}
                  </div>
                </Card>
              </motion.div>
            </motion.div>
          )}

          {activeTab === 'members' && (
            <motion.div
              key="members"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            >
              <Card variant="elevated" padding="none">
                <div className="p-4 border-b border-groovely-dark-border">
                  <h3 className="text-lg font-bold text-white font-heading">
                    All Members ({members.length})
                  </h3>
                </div>
                <div className="max-h-[60vh] overflow-y-auto space-y-1 p-2">
                  {members.map((member, index) => {
                    const memberBadge = getRankBadge(index + 1);
                    const MemberIcon = memberBadge.icon;
                    return (
                      <motion.div
                        key={member.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.03 }}
                        whileHover={{ scale: 1.01, x: 2 }}
                        whileTap={{ scale: 0.99 }}
                        onClick={() => navigate(`/user/${member.id}`)}
                        className="flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all group hover:bg-groovely-dark-surface/40 border border-transparent hover:border-groovely-dark-border/30"
                      >
                        <div className={`w-10 h-10 bg-gradient-to-br ${memberBadge.color} rounded-lg flex items-center justify-center flex-shrink-0 shadow-sm`}>
                          {index < 3 ? (
                            <MemberIcon size={18} className="text-white" />
                          ) : (
                            <span className="text-sm font-bold text-white">{index + 1}</span>
                          )}
                        </div>
                        <div className="w-11 h-11 rounded-full bg-gradient-to-br from-groovely-purple-500/80 to-groovely-peach-500/80 flex items-center justify-center flex-shrink-0 overflow-hidden ring-2 ring-groovely-dark-border/50 group-hover:ring-groovely-peach-500/30 transition-all">
                          {member.avatar_url ? (
                            <img 
                              src={member.avatar_url} 
                              alt={member.username} 
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <span className="text-white text-sm font-bold">{member.username?.[0]?.toUpperCase() || '?'}</span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <div className="text-sm font-semibold text-white truncate font-heading">
                              {member.display_name || member.username}
                            </div>
                            {member.id === (crew as any)?.creator_id && (
                              <motion.span
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                className="px-1.5 py-0.5 bg-gradient-to-r from-yellow-400/90 to-yellow-600/90 text-black text-[10px] font-bold rounded-full flex items-center gap-0.5"
                              >
                                <Crown size={10} />
                                <span>Creator</span>
                              </motion.span>
                            )}
                            {coFounders.some(cf => cf.id === member.id) && member.id !== (crew as any)?.creator_id && (
                              <motion.span
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                className="px-1.5 py-0.5 bg-gradient-to-r from-groovely-purple-500/90 to-groovely-pink-500/90 text-white text-[10px] font-bold rounded-full flex items-center gap-0.5"
                              >
                                <Users size={10} />
                                <span>Co-Founder</span>
                              </motion.span>
                            )}
                          </div>
                          <div className="text-xs text-groovely-dark-text-tertiary">@{member.username}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-base font-bold bg-gradient-to-r from-groovely-peach-500 to-groovely-purple-500 bg-clip-text text-transparent font-heading">
                            {member.score?.toLocaleString() || 0}
                          </div>
                          <div className="text-[10px] text-groovely-dark-text-tertiary">Score</div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </Card>
            </motion.div>
          )}

          {/* Crew Chat tab - disabled but code kept for reactivation */}
          {CHAT_ENABLED && activeTab === 'chat' && (
            <motion.div
              key="chat"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="flex flex-col h-[60vh]"
            >
              {isMember ? (
                <Card variant="elevated" padding="none" className="flex flex-col h-full">
                  <div className="p-4 bg-gradient-to-r from-groovely-purple-500/20 to-groovely-peach-500/20 border-b border-groovely-dark-border">
                    <h3 className="text-lg font-bold text-white font-heading flex items-center gap-2">
                      <MessageCircle size={20} className="text-groovely-peach-400" />
                      Crew Chat
                    </h3>
                  </div>
                  <div 
                    ref={chatContainerRef}
                    className="flex-1 p-4 overflow-y-auto space-y-3 bg-groovely-dark-surface/30"
                  >
                    <AnimatePresence>
                      {messages.length === 0 ? (
                        <motion.div 
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="text-center py-12"
                        >
                          <MessageCircle size={48} className="mx-auto mb-4 text-groovely-dark-text-tertiary" />
                          <p className="text-groovely-dark-text-secondary">No messages yet. Start the conversation!</p>
                        </motion.div>
                      ) : (
                        <>
                          {messages.map((message) => (
                            <motion.div
                              key={message.id}
                              initial={{ opacity: 0, y: 10, scale: 0.95 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.95 }}
                              transition={{ duration: 0.2 }}
                              className={`flex ${message.user_id === user?.id ? 'justify-end' : 'justify-start'} gap-2`}
                            >
                              {message.user_id !== user?.id && message.profiles && (
                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-groovely-purple-500 to-groovely-peach-500 flex items-center justify-center flex-shrink-0 overflow-hidden mt-1">
                                  {message.profiles.avatar_url ? (
                                    <img src={message.profiles.avatar_url} alt={message.profiles.username} className="w-full h-full object-cover" />
                                  ) : (
                                    <span className="text-white text-xs font-bold">{message.profiles.username?.[0]?.toUpperCase()}</span>
                                  )}
                                </div>
                              )}
                              <div className={`max-w-[75%] ${
                                message.user_id === user?.id
                                  ? 'bg-gradient-to-r from-groovely-peach-500 to-groovely-purple-500 text-white'
                                  : 'bg-groovely-dark-card text-white border border-groovely-dark-border'
                              } rounded-2xl px-4 py-2.5 shadow-lg`}>
                                {message.user_id !== user?.id && message.profiles && (
                                  <div className="text-xs text-white/70 mb-1 font-semibold">
                                    {message.profiles.display_name || message.profiles.username}
                                  </div>
                                )}
                                <div className="text-sm leading-relaxed break-words">{message.content}</div>
                                <div className={`text-xs mt-1 ${
                                  message.user_id === user?.id ? 'text-white/60' : 'text-groovely-dark-text-tertiary'
                                }`}>
                                  {new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </div>
                              </div>
                              {message.user_id === user?.id && (
                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-groovely-purple-500 to-groovely-peach-500 flex items-center justify-center flex-shrink-0 overflow-hidden mt-1">
                                  {profile?.avatar_url ? (
                                    <img src={profile.avatar_url} alt={profile.username} className="w-full h-full object-cover" />
                                  ) : (
                                    <span className="text-white text-xs font-bold">{profile?.username?.[0]?.toUpperCase()}</span>
                                  )}
                                </div>
                              )}
                            </motion.div>
                          ))}
                          <div ref={messagesEndRef} />
                        </>
                      )}
                    </AnimatePresence>
                  </div>
                  <div className="p-4 border-t border-groovely-dark-border bg-groovely-dark-card">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={messageText}
                        onChange={(e) => setMessageText(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                        placeholder="Type a message..."
                        className="flex-1 px-4 py-3 bg-groovely-dark-surface border border-groovely-dark-border rounded-xl text-white placeholder-groovely-dark-text-tertiary focus:ring-2 focus:ring-groovely-peach-500 focus:border-transparent transition-all"
                      />
                      <Button
                        onClick={sendMessage}
                        disabled={!messageText.trim() || sendingMessage}
                        variant="primary"
                        className="!bg-gradient-to-r !from-groovely-peach-500 !to-groovely-purple-500 disabled:!opacity-50"
                      >
                        {sendingMessage ? (
                          <LoadingSpinner size="sm" />
                        ) : (
                          <Send size={18} />
                        )}
                      </Button>
                    </div>
                  </div>
                </Card>
              ) : (
                <Card variant="elevated" className="flex-1 flex items-center justify-center">
                  <div className="text-center">
                    <MessageCircle size={64} className="mx-auto mb-4 text-groovely-dark-text-tertiary" />
                    <h3 className="text-xl font-bold text-white mb-2 font-heading">Join to Chat</h3>
                    <p className="text-groovely-dark-text-secondary mb-6">
                      You need to be a member to participate in crew chat.
                    </p>
                    <Button onClick={handleJoinClan} variant="primary">
                      <UserPlus size={18} className="mr-2" /> Join Clan
                    </Button>
                  </div>
                </Card>
              )}
            </motion.div>
          )}

          {activeTab === 'activity' && (
            <motion.div
              key="activity"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            >
              <Card variant="elevated">
                <h3 className="text-lg font-bold text-white font-heading flex items-center gap-2 mb-4">
                  <Zap size={20} className="text-groovely-peach-400" />
                  Recent Activity
                </h3>
                <div className="space-y-2">
                  {activities.length > 0 ? (
                    activities.map((activity, index) => {
                      const activityUser = activity.user;
                      const userName = activityUser?.display_name || activityUser?.username || 'Unknown';
                      const userAvatar = activityUser?.avatar_url;
                      const isCrewMilestone = activity.type === 'crew_milestone';
                      
                      const getActivityIcon = () => {
                        switch (activity.type) {
                          case 'created':
                            return <Sparkles size={16} className="text-groovely-peach-400" />;
                          case 'joined':
                            return <UserPlus size={16} className="text-groovely-blue-400" />;
                          case 'left':
                            return <UserMinus size={16} className="text-red-400" />;
                          case 'renamed':
                            return <Edit2 size={16} className="text-groovely-purple-400" />;
                          case 'avatar_changed':
                            return <ImageIcon size={16} className="text-groovely-pink-400" />;
                          case 'co_founder_added':
                            return <Crown size={16} className="text-yellow-400" />;
                          case 'co_founder_removed':
                            return <UserMinus size={16} className="text-orange-400" />;
                          case 'video_uploaded':
                            return <VideoIcon size={16} className="text-groovely-purple-400" />;
                          case 'routine_attempted':
                            return <Target size={16} className="text-groovely-peach-400" />;
                          case 'video_milestone':
                            return <Trophy size={16} className="text-yellow-400" />;
                          case 'crew_milestone':
                            return <Users size={16} className="text-groovely-peach-400" />;
                          default:
                            return <Zap size={16} className="text-groovely-peach-400" />;
                        }
                      };
                      
                      const getActivityText = () => {
                        switch (activity.type) {
                          case 'created':
                            return (
                              <>
                                <span className="font-semibold text-groovely-peach-400">{userName}</span>
                                {' '}created the crew
                              </>
                            );
                          case 'joined':
                            return (
                              <>
                                <span className="font-semibold text-groovely-blue-400">{userName}</span>
                                {' '}joined the crew
                              </>
                            );
                          case 'left':
                            return (
                              <>
                                <span className="font-semibold text-red-400">{userName}</span>
                                {' '}left the crew
                              </>
                            );
                          case 'renamed':
                            return (
                              <>
                                <span className="font-semibold text-groovely-purple-400">{userName}</span>
                                {' '}renamed the crew to <span className="font-semibold text-white">"{activity.newValue}"</span>
                              </>
                            );
                          case 'avatar_changed':
                            return (
                              <>
                                <span className="font-semibold text-groovely-pink-400">{userName}</span>
                                {' '}updated the crew avatar
                              </>
                            );
                          case 'co_founder_added':
                            return (
                              <>
                                <span className="font-semibold text-yellow-400">{userName}</span>
                                {' '}was promoted to co-founder
                              </>
                            );
                          case 'co_founder_removed':
                            return (
                              <>
                                <span className="font-semibold text-orange-400">{userName}</span>
                                {' '}was removed as co-founder
                              </>
                            );
                          case 'video_uploaded':
                            return (
                              <>
                                <span className="font-semibold text-groovely-purple-400">{userName}</span>
                                {' '}uploaded a video
                                {activity.video?.title && (
                                  <>: <span className="text-white/80 italic">"{activity.video.title}"</span></>
                                )}
                              </>
                            );
                          case 'routine_attempted':
                            return (
                              <>
                                <span className="font-semibold text-groovely-peach-400">{userName}</span>
                                {' '}attempted a routine
                                {activity.video?.title && (
                                  <>: <span className="text-white/80 italic">"{activity.video.title}"</span></>
                                )}
                              </>
                            );
                          case 'video_milestone':
                            return (
                              <>
                                <span className="font-semibold text-yellow-400">{userName}</span>
                                {' '}reached <span className="font-bold text-yellow-400">{activity.milestone}</span> likes on
                                {activity.video?.title ? (
                                  <> <span className="text-white/80 italic">"{activity.video.title}"</span></>
                                ) : (
                                  <> a video</>
                                )}
                              </>
                            );
                          case 'crew_milestone':
                            return (
                              <>
                                <span className="font-semibold text-groovely-peach-400">Crew</span>
                                {' '}reached <span className="font-bold text-groovely-peach-400">{activity.milestone} members</span>!
                              </>
                            );
                          default:
                            return 'Activity occurred';
                        }
                      };
                      
                      return (
                        <motion.div
                          key={`${activity.type}-${activity.timestamp}-${index}`}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: index * 0.05 }}
                          className={`flex items-center gap-3 p-3 bg-groovely-dark-surface/50 rounded-xl border border-groovely-dark-border/50 transition-all group ${isCrewMilestone ? '' : 'hover:border-groovely-dark-border cursor-pointer'}`}
                          onClick={() => {
                            if (isCrewMilestone) {
                              // Crew milestones are not clickable
                              return;
                            }
                            if (activity.video?.id) {
                              navigate(`/video/${activity.video.id}`);
                            } else if (activityUser?.id) {
                              navigate(`/user/${activityUser.id}`);
                            }
                          }}
                        >
                          {!isCrewMilestone && (
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-groovely-purple-500/80 to-groovely-peach-500/80 flex items-center justify-center flex-shrink-0 overflow-hidden ring-2 ring-groovely-dark-border/50">
                              {userAvatar ? (
                                <img src={userAvatar} alt={userName} className="w-full h-full object-cover" />
                              ) : (
                                <span className="text-white text-xs font-bold">{userName?.[0]?.toUpperCase()}</span>
                              )}
                            </div>
                          )}
                          {isCrewMilestone && (
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-groovely-purple-500/80 to-groovely-peach-500/80 flex items-center justify-center flex-shrink-0 overflow-hidden ring-2 ring-groovely-dark-border/50">
                              <Users size={20} className="text-white" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0 flex items-center gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <div className="flex items-center gap-1.5 text-sm text-white">
                                  {getActivityIcon()}
                                  {getActivityText()}
                                </div>
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
                            {activity.video?.thumbnail_url && (
                              <div className="w-16 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-groovely-dark-surface border border-groovely-dark-border">
                                <img 
                                  src={activity.video.thumbnail_url} 
                                  alt={activity.video.title || 'Video'} 
                                  className="w-full h-full object-cover"
                                />
                              </div>
                            )}
                          </div>
                        </motion.div>
                      );
                    })
                  ) : (
                    <motion.div 
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="text-center py-12"
                    >
                      <Zap size={48} className="mx-auto mb-4 text-groovely-dark-text-tertiary" />
                      <p className="text-groovely-dark-text-secondary">No activity yet</p>
                      <p className="text-xs text-groovely-dark-text-tertiary mt-2">Activity will appear here as members interact with the crew</p>
                    </motion.div>
                  )}
                </div>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Loading Overlay */}
      {saving && <LoadingOverlay message="Updating crew..." />}
      {deleting && <LoadingOverlay message="Deleting crew..." />}

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
              <h3 className="text-2xl font-bold text-white font-heading mb-2">Crew Updated!</h3>
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
                        <h2 className="text-2xl font-bold text-white font-heading">Crew Settings</h2>
                        <p className="text-sm text-groovely-dark-text-secondary">Manage your crew details</p>
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
                      className="p-4 bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl text-sm whitespace-pre-line"
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
                      <h3 className="text-xl font-bold text-white font-heading mb-4">Crew Avatar</h3>
                      
                      <div className="flex flex-col items-center">
                        <motion.div
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => fileInputRef.current?.click()}
                          className="relative w-32 h-32 mb-4 bg-gradient-to-br from-groovely-peach-500 to-groovely-purple-500 rounded-full flex items-center justify-center text-white text-5xl font-bold shadow-lg shadow-groovely-peach-500/30 cursor-pointer overflow-hidden"
                        >
                          {avatarPreview ? (
                            <img src={avatarPreview} alt="Crew avatar" className="w-full h-full object-cover" />
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
                            htmlFor="crew-name-input"
                            className="block text-sm font-medium text-groovely-dark-text-secondary mb-2"
                          >
                            Crew Name <span className="text-red-400">*</span>
                          </label>
                          <input
                            id="crew-name-input"
                            type="text"
                            value={editingName || ''}
                            onChange={(e) => {
                              setEditingName(e.target.value);
                              setError('');
                            }}
                            placeholder="Enter crew name"
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
                            htmlFor="crew-description-input"
                            className="block text-sm font-medium text-groovely-dark-text-secondary mb-2"
                          >
                            Description
                          </label>
                          <textarea
                            id="crew-description-input"
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

                  {/* Transfer Ownership - Only for Creator */}
                  {isCreator && (
                    <motion.div 
                      variants={staggerItemVariants}
                      initial="initial"
                      animate="animate"
                    >
                      <Card variant="glass" className="backdrop-blur-xl border-2 border-groovely-peach-500/30 bg-groovely-peach-500/5">
                        <h3 className="text-xl font-bold text-white font-heading mb-2 flex items-center gap-2">
                          <Crown size={20} className="text-groovely-peach-400" />
                          Transfer Ownership
                        </h3>
                        <p className="text-sm text-groovely-dark-text-secondary mb-4">
                          Transfer ownership of this crew to another member. You will become a co-founder after the transfer.
                        </p>
                        <Button
                          onClick={() => {
                            setShowTransferOwnership(true);
                            setShowSettings(false);
                          }}
                          variant="outline"
                          size="sm"
                          className="!border-groovely-peach-500/50 !text-groovely-peach-400 hover:!bg-groovely-peach-500/10 hover:!border-groovely-peach-500"
                          disabled={saving || deleting || members.length <= 1}
                        >
                          <Crown size={16} className="mr-2" />
                          Transfer Ownership
                        </Button>
                        {members.length <= 1 && (
                          <p className="text-xs text-groovely-dark-text-tertiary mt-2">
                            You need at least one other member to transfer ownership.
                          </p>
                        )}
                      </Card>
                    </motion.div>
                  )}

                  {/* Co-Founder Management - For Creator and Co-Founders */}
                  {isAdmin && (
                    <motion.div 
                      variants={staggerItemVariants}
                      initial="initial"
                      animate="animate"
                    >
                      <Card variant="glass" className="backdrop-blur-xl border-2 border-groovely-purple-500/30 bg-groovely-purple-500/5">
                        <h3 className="text-xl font-bold text-white font-heading mb-2 flex items-center gap-2">
                          <Users size={20} className="text-groovely-purple-400" />
                          Manage Co-Founders
                        </h3>
                        <p className="text-sm text-groovely-dark-text-secondary mb-4">
                          Co-founders have the same administrative powers as the creator, except they cannot transfer ownership.
                        </p>
                        {coFounders.length > 0 && (
                          <div className="mb-4 space-y-2">
                            <p className="text-xs text-groovely-dark-text-tertiary mb-2">Current Co-Founders:</p>
                            {coFounders.map((coFounder) => (
                              <div key={coFounder.id} className="flex items-center justify-between p-2 bg-groovely-dark-surface/60 rounded-lg">
                                <div className="flex items-center gap-2">
                                  {coFounder.avatar_url ? (
                                    <img src={coFounder.avatar_url} alt={coFounder.username} className="w-8 h-8 rounded-full" />
                                  ) : (
                                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-groovely-purple-500 to-groovely-peach-500 flex items-center justify-center text-white text-xs font-bold">
                                      {coFounder.username?.[0]?.toUpperCase() || '?'}
                                    </div>
                                  )}
                                  <span className="text-sm text-white">{coFounder.display_name || coFounder.username}</span>
                                </div>
                                {isCreator && (
                                  <Button
                                    onClick={() => handleMakeCoFounder(coFounder.id, false)}
                                    variant="ghost"
                                    size="sm"
                                    className="!text-red-400 hover:!bg-red-500/10"
                                    disabled={saving}
                                  >
                                    Remove
                                  </Button>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                        <Button
                          onClick={() => {
                            setShowMakeCoFounder(true);
                            setShowSettings(false);
                          }}
                          variant="outline"
                          size="sm"
                          className="!border-groovely-purple-500/50 !text-groovely-purple-400 hover:!bg-groovely-purple-500/10 hover:!border-groovely-purple-500"
                          disabled={saving || deleting}
                        >
                          <UserPlus size={16} className="mr-2" />
                          {coFounders.length > 0 ? 'Add More Co-Founders' : 'Add Co-Founder'}
                        </Button>
                      </Card>
                    </motion.div>
                  )}

                  {/* Danger Zone - Delete Crew */}
                  <motion.div 
                    variants={staggerItemVariants}
                    initial="initial"
                    animate="animate"
                  >
                    <Card variant="glass" className="backdrop-blur-xl border-2 border-red-500/30 bg-red-500/5">
                      <h3 className="text-xl font-bold text-white font-heading mb-2 flex items-center gap-2">
                        <AlertTriangle size={20} className="text-red-400" />
                        Danger Zone
                      </h3>
                      <p className="text-sm text-groovely-dark-text-secondary mb-4">
                        Permanently delete this crew. This action cannot be undone. All members will be removed from the crew.
                      </p>
                      <Button
                        onClick={() => setShowDeleteConfirm(true)}
                        variant="outline"
                        size="sm"
                        className="!border-red-500/50 !text-red-400 hover:!bg-red-500/10 hover:!border-red-500"
                        disabled={saving || deleting}
                      >
                        <Trash2 size={16} className="mr-2" />
                        Delete Crew
                      </Button>
                    </Card>
                  </motion.div>

                </div>

                {/* Action Buttons - Fixed at bottom */}
                <div className="flex-shrink-0 p-6 border-t border-groovely-dark-border bg-groovely-dark-surface/50 backdrop-blur-sm sticky bottom-0 z-20">
                  <div className="flex gap-3">
                    <Button
                      onClick={() => {
                        // Reset form state
                        if (crew) {
                          setEditingName(crew.name);
                          setEditingDescription(crew.description || '');
                          setAvatarPreview(crew.avatar_url || null);
                        }
                        setAvatarFile(null);
                        setError('');
                        setShowSettings(false);
                        setShowDeleteConfirm(false);
                      }}
                      variant="outline"
                      size="lg"
                      fullWidth
                      disabled={saving || deleting}
                      className="!border-groovely-dark-border !text-groovely-dark-text-secondary hover:!bg-groovely-dark-surface/60 disabled:!opacity-50"
                    >
                      <X size={18} className="mr-2" />
                      Cancel
                    </Button>
                    <Button
                      onClick={handleSaveSettings}
                      disabled={saving || deleting || !editingName.trim()}
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

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md"
            onClick={() => {
              if (!deleting) {
                setShowDeleteConfirm(false);
              }
            }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md"
            >
              <Card variant="glass" className="backdrop-blur-xl border-2 border-red-500/30">
                <div className="p-6">
                  {/* Icon */}
                  <motion.div
                    initial={{ scale: 0, rotate: -180 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: 'spring', stiffness: 300 }}
                    className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-red-500 to-red-600 rounded-full flex items-center justify-center shadow-lg shadow-red-500/30"
                  >
                    <AlertTriangle size={32} className="text-white" />
                  </motion.div>

                  {/* Title */}
                  <h2 className="text-2xl font-bold text-white text-center mb-2 font-heading">
                    Delete Crew?
                  </h2>
                  
                  {/* Warning Message */}
                  <p className="text-groovely-dark-text-secondary text-center mb-6">
                    Are you sure you want to delete <span className="font-semibold text-white">{crew?.name}</span>? 
                    This action cannot be undone. All members will be removed from the crew.
                  </p>

                  {/* Error Message */}
                  {error && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="p-3 bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl text-sm mb-4"
                    >
                      {error}
                    </motion.div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex gap-3">
                    <Button
                      onClick={() => {
                        setShowDeleteConfirm(false);
                        setError('');
                      }}
                      variant="outline"
                      size="lg"
                      fullWidth
                      disabled={deleting}
                      className="!border-groovely-dark-border !text-groovely-dark-text-secondary hover:!bg-groovely-dark-surface/60"
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleDeleteCrew}
                      disabled={deleting}
                      variant="primary"
                      size="lg"
                      fullWidth
                      className="!bg-gradient-to-r !from-red-500 !to-red-600 hover:!shadow-lg hover:!shadow-red-500/30 disabled:!opacity-50"
                    >
                      {deleting ? (
                        <>
                          <LoadingSpinner size="sm" />
                          <span className="ml-2">Deleting...</span>
                        </>
                      ) : (
                        <>
                          <Trash2 size={18} className="mr-2" />
                          Delete Crew
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

      {/* Transfer Ownership Modal */}
      <AnimatePresence>
        {showTransferOwnership && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md"
            onClick={() => {
              if (!saving) {
                setShowTransferOwnership(false);
                setSelectedMemberForAction(null);
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
              className="w-full max-w-md"
            >
              <Card variant="glass" className="backdrop-blur-xl border-2 border-groovely-peach-500/30">
                <div className="p-6">
                  <motion.div
                    initial={{ scale: 0, rotate: -180 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: 'spring', stiffness: 300 }}
                    className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-groovely-peach-500 to-groovely-pink-500 rounded-full flex items-center justify-center shadow-lg shadow-groovely-peach-500/30"
                  >
                    <Crown size={32} className="text-white" />
                  </motion.div>

                  <h2 className="text-2xl font-bold text-white text-center mb-2 font-heading">
                    Transfer Ownership
                  </h2>
                  
                  <p className="text-groovely-dark-text-secondary text-center mb-6">
                    Select a member to transfer ownership to. You will become a co-founder after the transfer.
                  </p>

                  {error && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="p-3 bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl text-sm mb-4"
                    >
                      {error}
                    </motion.div>
                  )}

                  <div className="space-y-2 max-h-64 overflow-y-auto mb-6">
                    {members.length <= 1 ? (
                      <p className="text-groovely-dark-text-secondary text-center py-4">
                        You need at least one other member to transfer ownership.
                      </p>
                    ) : (
                      members
                        .filter(m => {
                          // Exclude current user and creator
                          const isCurrentUser = m.id === user?.id;
                          const isCreator = m.id === (crew as any)?.creator_id;
                          return !isCurrentUser && !isCreator;
                        })
                        .map((member) => (
                          <motion.button
                            key={member.id}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => setSelectedMemberForAction(member)}
                            className={`w-full p-3 rounded-xl border-2 transition-all text-left ${
                              selectedMemberForAction?.id === member.id
                                ? 'border-groovely-peach-500 bg-groovely-peach-500/10'
                                : 'border-groovely-dark-border bg-groovely-dark-surface/60 hover:border-groovely-peach-500/50'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              {member.avatar_url ? (
                                <img src={member.avatar_url} alt={member.username} className="w-10 h-10 rounded-full" />
                              ) : (
                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-groovely-purple-500 to-groovely-peach-500 flex items-center justify-center text-white font-bold">
                                  {member.username?.[0]?.toUpperCase() || '?'}
                                </div>
                              )}
                              <div className="flex-1">
                                <div className="text-white font-semibold">{member.display_name || member.username}</div>
                                <div className="text-xs text-groovely-dark-text-secondary">@{member.username}</div>
                              </div>
                              {selectedMemberForAction?.id === member.id && (
                                <Check size={20} className="text-groovely-peach-400" />
                              )}
                            </div>
                          </motion.button>
                        ))
                    )}
                  </div>

                  <div className="flex gap-3">
                    <Button
                      onClick={() => {
                        setShowTransferOwnership(false);
                        setSelectedMemberForAction(null);
                        setError('');
                      }}
                      variant="outline"
                      size="lg"
                      fullWidth
                      disabled={saving}
                      className="!border-groovely-dark-border !text-groovely-dark-text-secondary hover:!bg-groovely-dark-surface/60"
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={() => {
                        if (selectedMemberForAction) {
                          handleTransferOwnership(selectedMemberForAction.id);
                        }
                      }}
                      disabled={saving || !selectedMemberForAction}
                      variant="primary"
                      size="lg"
                      fullWidth
                      className="!bg-gradient-to-r !from-groovely-peach-500 !to-groovely-purple-500 hover:!shadow-lg hover:!shadow-groovely-peach-500/30 disabled:!opacity-50"
                    >
                      {saving ? (
                        <>
                          <LoadingSpinner size="sm" />
                          <span className="ml-2">Transferring...</span>
                        </>
                      ) : (
                        <>
                          <Crown size={18} className="mr-2" />
                          Transfer Ownership
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

      {/* Make Co-Founder Modal */}
      <AnimatePresence>
        {showMakeCoFounder && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md"
            onClick={() => {
              if (!saving) {
                setShowMakeCoFounder(false);
                setSelectedMemberForAction(null);
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
              className="w-full max-w-md"
            >
              <Card variant="glass" className="backdrop-blur-xl border-2 border-groovely-purple-500/30">
                <div className="p-6">
                  <motion.div
                    initial={{ scale: 0, rotate: -180 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: 'spring', stiffness: 300 }}
                    className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-groovely-purple-500 to-groovely-pink-500 rounded-full flex items-center justify-center shadow-lg shadow-groovely-purple-500/30"
                  >
                    <Users size={32} className="text-white" />
                  </motion.div>

                  <h2 className="text-2xl font-bold text-white text-center mb-2 font-heading">
                    {selectedMemberForAction && coFounders.some(cf => cf.id === selectedMemberForAction.id)
                      ? 'Remove Co-Founder'
                      : 'Add Co-Founder'}
                  </h2>
                  
                  <p className="text-groovely-dark-text-secondary text-center mb-6">
                    {selectedMemberForAction && coFounders.some(cf => cf.id === selectedMemberForAction.id)
                      ? 'Remove co-founder privileges from this member?'
                      : 'Co-founders have the same administrative powers as the creator, except they cannot transfer ownership.'}
                  </p>

                  {error && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="p-3 bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl text-sm mb-4"
                    >
                      {error}
                    </motion.div>
                  )}

                  {!selectedMemberForAction ? (
                    <div className="space-y-2 max-h-64 overflow-y-auto mb-6">
                      {members
                        .filter(m => {
                          const isCreator = m.id === (crew as any)?.creator_id;
                          const isCoFounder = coFounders.some(cf => cf.id === m.id);
                          return !isCreator && !isCoFounder;
                        })
                        .map((member) => (
                          <motion.button
                            key={member.id}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => setSelectedMemberForAction(member)}
                            className="w-full p-3 rounded-xl border-2 border-groovely-dark-border bg-groovely-dark-surface/60 hover:border-groovely-purple-500/50 transition-all text-left"
                          >
                            <div className="flex items-center gap-3">
                              {member.avatar_url ? (
                                <img src={member.avatar_url} alt={member.username} className="w-10 h-10 rounded-full" />
                              ) : (
                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-groovely-purple-500 to-groovely-peach-500 flex items-center justify-center text-white font-bold">
                                  {member.username?.[0]?.toUpperCase() || '?'}
                                </div>
                              )}
                              <div className="flex-1">
                                <div className="text-white font-semibold">{member.display_name || member.username}</div>
                                <div className="text-xs text-groovely-dark-text-secondary">@{member.username}</div>
                              </div>
                              <UserPlus size={20} className="text-groovely-purple-400" />
                            </div>
                          </motion.button>
                        ))}
                    </div>
                  ) : (
                    <div className="mb-6 p-4 bg-groovely-dark-surface/60 rounded-xl">
                      <div className="flex items-center gap-3">
                        {selectedMemberForAction.avatar_url ? (
                          <img src={selectedMemberForAction.avatar_url} alt={selectedMemberForAction.username} className="w-12 h-12 rounded-full" />
                        ) : (
                          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-groovely-purple-500 to-groovely-peach-500 flex items-center justify-center text-white font-bold">
                            {selectedMemberForAction.username?.[0]?.toUpperCase() || '?'}
                          </div>
                        )}
                        <div>
                          <div className="text-white font-semibold">{selectedMemberForAction.display_name || selectedMemberForAction.username}</div>
                          <div className="text-xs text-groovely-dark-text-secondary">@{selectedMemberForAction.username}</div>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="flex gap-3">
                    <Button
                      onClick={() => {
                        setShowMakeCoFounder(false);
                        setSelectedMemberForAction(null);
                        setError('');
                      }}
                      variant="outline"
                      size="lg"
                      fullWidth
                      disabled={saving}
                      className="!border-groovely-dark-border !text-groovely-dark-text-secondary hover:!bg-groovely-dark-surface/60"
                    >
                      Cancel
                    </Button>
                    {selectedMemberForAction && (
                      <Button
                        onClick={() => {
                          const isCurrentlyCoFounder = coFounders.some(cf => cf.id === selectedMemberForAction.id);
                          handleMakeCoFounder(selectedMemberForAction.id, !isCurrentlyCoFounder);
                        }}
                        disabled={saving}
                        variant="primary"
                        size="lg"
                        fullWidth
                        className="!bg-gradient-to-r !from-groovely-purple-500 !to-groovely-pink-500 hover:!shadow-lg hover:!shadow-groovely-purple-500/30 disabled:!opacity-50"
                      >
                        {saving ? (
                          <>
                            <LoadingSpinner size="sm" />
                            <span className="ml-2">Updating...</span>
                          </>
                        ) : coFounders.some(cf => cf.id === selectedMemberForAction.id) ? (
                          <>
                            <UserMinus size={18} className="mr-2" />
                            Remove Co-Founder
                          </>
                        ) : (
                          <>
                            <UserPlus size={18} className="mr-2" />
                            Add Co-Founder
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      
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
          confirmText="Leave & Join"
          cancelText="Cancel"
        />
      )}
    </div>
  );
}

