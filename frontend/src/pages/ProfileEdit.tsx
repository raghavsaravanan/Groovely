import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Camera, Check, X, Sparkles, Edit as EditIcon } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { Button, Card, LoadingOverlay, PageHeader } from '../components/ios';
import { supabase, DanceStyle } from '../lib/supabase';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { successVariants, staggerContainerVariants, staggerItemVariants } from '../animations';

export function ProfileEdit() {
  const navigate = useNavigate();
  const { user, profile, refreshProfile } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [username, setUsername] = useState(profile?.username || '');
  const [displayName, setDisplayName] = useState(profile?.display_name || '');
  const [bio, setBio] = useState(profile?.bio || '');
  const [selectedStyles, setSelectedStyles] = useState<string[]>([]); // Store dance style IDs
  const [danceStyles, setDanceStyles] = useState<DanceStyle[]>([]);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string>(profile?.avatar_url || '');
  const [loading, setLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [error, setError] = useState('');

  // Fetch dance styles and current user's dance styles
  useEffect(() => {
    const fetchData = async () => {
      if (!profile) return;

      // Fetch all available dance styles
      const { data: stylesData } = await supabase
        .from('dance_styles')
        .select('*')
        .order('name');

      if (stylesData) {
        setDanceStyles(stylesData);
      }

      // Fetch user's current dance styles
      const { data: userStylesData } = await supabase
        .from('user_dance_styles')
        .select('dance_style_id')
        .eq('user_id', profile.id);

      if (userStylesData) {
        setSelectedStyles(userStylesData.map((item) => item.dance_style_id));
      }
    };

    fetchData();
  }, [profile]);

  // Update form fields when profile changes
  useEffect(() => {
    if (profile) {
      setUsername(profile.username || '');
      setDisplayName(profile.display_name || '');
      setBio(profile.bio || '');
      setAvatarPreview(profile.avatar_url || '');
    }
  }, [profile]);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAvatarFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setAvatarPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
      
      Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
    }
  };

  const toggleStyle = (styleId: string) => {
    Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
    
    if (selectedStyles.includes(styleId)) {
      setSelectedStyles(selectedStyles.filter((s) => s !== styleId));
    } else {
      if (selectedStyles.length < 5) {
        setSelectedStyles([...selectedStyles, styleId]);
      } else {
        alert('You can select up to 5 dance styles');
      }
    }
  };

  const handleSave = async () => {
    if (!user) return;
    
    setError('');
    setLoading(true);

    try {
      let avatarUrl = profile?.avatar_url;

      // Upload avatar if changed
      if (avatarFile) {
        const fileExt = avatarFile.name.split('.').pop() || 'jpg';
        const fileName = `${user.id}-${Date.now()}.${fileExt}`;
        
        
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('avatars')
          .upload(fileName, avatarFile, {
            cacheControl: '3600',
            upsert: true, // Allow overwriting existing files
          });

        if (uploadError) {
          console.error(' Avatar upload error:', uploadError);
          throw new Error(`Failed to upload avatar: ${uploadError.message}`);
        }

        if (!uploadData) {
          console.error(' No upload data returned');
          throw new Error('Failed to upload avatar: No data returned');
        }

        
        const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(fileName);
        if (!urlData?.publicUrl) {
          console.error(' Failed to get public URL');
          throw new Error('Failed to get avatar URL');
        }
        
        avatarUrl = urlData.publicUrl;
      }

      // Update profile (without dance_styles - that field doesn't exist)
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          username: username.trim(),
          display_name: displayName.trim(),
          bio: bio.trim(),
          avatar_url: avatarUrl,
        })
        .eq('id', user.id);

      if (updateError) {
        throw updateError;
      }

      // Update user_dance_styles junction table
      // First, delete all existing dance styles for this user
      const { error: deleteError } = await supabase
        .from('user_dance_styles')
        .delete()
        .eq('user_id', user.id);

      if (deleteError) {
        throw deleteError;
      }

      // Then, insert the new selected dance styles
      if (selectedStyles.length > 0) {
        const userDanceStyles = selectedStyles.map((styleId) => ({
          user_id: user.id,
          dance_style_id: styleId,
        }));

        const { error: insertError } = await supabase
          .from('user_dance_styles')
          .insert(userDanceStyles);

        if (insertError) {
          throw insertError;
        }
      }

      // Refresh profile context
      await refreshProfile();

      setShowSuccess(true);
      
      Haptics.notification({ type: NotificationType.Success }).catch(() => {});
      
      setTimeout(() => {
        navigate('/profile');
      }, 1500);
    } catch (err: any) {
      console.error(' Profile update failed:', err);
      const errorMessage = err.message || 'Failed to update profile';
      setError(errorMessage);
      
      // Show more detailed error messages
      if (errorMessage.includes('Bucket not found') || errorMessage.includes('does not exist')) {
        setError('Storage bucket "avatars" does not exist. Please create it in Supabase Dashboard > Storage.');
      } else if (errorMessage.includes('permission') || errorMessage.includes('policy')) {
        setError('Permission denied. Please check storage policies in Supabase Dashboard > Storage > Policies.');
      } else if (errorMessage.includes('upload')) {
        setError(`Avatar upload failed: ${errorMessage}. Check browser console for details.`);
      }
      
      Haptics.notification({ type: NotificationType.Error }).catch(() => {});
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-groovely-dark-bg pb-24">
      {/* Loading Overlay */}
      {loading && <LoadingOverlay message="Updating profile..." />}

      {/* Success Animation - Groovely Themed */}
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
              <h3 className="text-2xl font-bold text-white font-heading mb-2">Profile Updated!</h3>
              <p className="text-sm text-groovely-dark-text-secondary">Your changes have been saved successfully</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <PageHeader
        title="Edit Profile"
        subtitle="UPDATE YOUR INFORMATION"
        icon={<EditIcon size={32} className="text-white/90" />}
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
      />

      <div className="max-w-2xl mx-auto px-6 pt-6">
        {/* Error Message */}
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="mb-6 p-4 bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl text-sm"
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
          <Card variant="glass" className="mb-6 text-center backdrop-blur-xl">
            <h3 className="text-xl font-bold text-white font-heading mb-4">Profile Photo</h3>
            
            <div className="flex flex-col items-center">
              <motion.div
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => fileInputRef.current?.click()}
                className="relative w-32 h-32 mb-4 bg-gradient-to-br from-groovely-peach-500 to-groovely-purple-500 rounded-full flex items-center justify-center text-white text-5xl font-bold shadow-lg shadow-groovely-peach-500/30 cursor-pointer overflow-hidden"
              >
                {avatarPreview ? (
                  <img src={avatarPreview} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <span>{username?.[0]?.toUpperCase() || '?'}</span>
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
            </div>
          </Card>
        </motion.div>

        {/* Basic Info */}
        <motion.div variants={staggerItemVariants}>
          <Card variant="glass" className="mb-6 backdrop-blur-xl">
            <h3 className="text-xl font-bold text-white font-heading mb-4">Basic Info</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-groovely-dark-text-secondary mb-2">
                  Username
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                  placeholder="username"
                  maxLength={20}
                  className="w-full px-4 py-3 bg-groovely-dark-surface/60 border border-groovely-dark-border rounded-xl text-base text-white placeholder-groovely-dark-text-tertiary focus:ring-2 focus:ring-groovely-peach-500 focus:border-groovely-peach-500 transition-all"
                />
                <p className="text-xs text-groovely-dark-text-tertiary mt-2">
                  Letters, numbers, and underscores only
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-groovely-dark-text-secondary mb-2">
                  Display Name
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Your Name"
                  maxLength={30}
                  className="w-full px-4 py-3 bg-groovely-dark-surface/60 border border-groovely-dark-border rounded-xl text-base text-white placeholder-groovely-dark-text-tertiary focus:ring-2 focus:ring-groovely-peach-500 focus:border-groovely-peach-500 transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-groovely-dark-text-secondary mb-2">
                  Bio
                </label>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Tell us about yourself..."
                  rows={4}
                  maxLength={150}
                  className="w-full px-4 py-3 bg-groovely-dark-surface/60 border border-groovely-dark-border rounded-xl text-base text-white placeholder-groovely-dark-text-tertiary focus:ring-2 focus:ring-groovely-peach-500 focus:border-groovely-peach-500 transition-all resize-none"
                />
                <p className="text-xs text-groovely-dark-text-tertiary mt-2">
                  {bio.length}/150 characters
                </p>
              </div>
            </div>
          </Card>
        </motion.div>

        {/* Dance Styles */}
        <motion.div variants={staggerItemVariants}>
          <Card variant="glass" className="mb-6 backdrop-blur-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-white font-heading">Dance Styles</h3>
              <span className="text-sm text-groovely-dark-text-secondary">{selectedStyles.length}/5</span>
            </div>
            
            <p className="text-xs text-groovely-dark-text-tertiary mb-4">
              Select up to 5 dance styles you specialize in
            </p>

            <div className="flex flex-wrap gap-2">
              {danceStyles.map((style) => {
                const isSelected = selectedStyles.includes(style.id);
                return (
                  <motion.button
                    key={style.id}
                    onClick={() => toggleStyle(style.id)}
                    whileTap={{ scale: 0.95 }}
                    whileHover={{ scale: 1.05 }}
                    className={`px-4 py-2 rounded-full text-xs font-semibold uppercase transition-all flex items-center gap-1.5 ${
                      isSelected
                        ? 'bg-gradient-to-r from-groovely-peach-500 to-groovely-purple-500 text-white shadow-md shadow-groovely-peach-500/30'
                        : 'bg-groovely-dark-surface/60 text-groovely-dark-text-secondary hover:bg-groovely-dark-surface/80 border border-groovely-dark-border'
                    }`}
                  >
                    {isSelected && <Check size={12} className="flex-shrink-0" />}
                    {style.name}
                  </motion.button>
                );
              })}
            </div>
          </Card>
        </motion.div>

        {/* Action Buttons */}
        <motion.div 
          variants={staggerItemVariants}
          className="flex gap-3 pb-6"
        >
          <Button
            onClick={() => navigate(-1)}
            variant="outline"
            size="lg"
            fullWidth
            className="!border-groovely-dark-border !text-groovely-dark-text-secondary hover:!bg-groovely-dark-surface/60"
          >
            <X size={18} className="mr-2" />
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={loading || !username.trim()}
            variant="primary"
            size="lg"
            fullWidth
            className="!bg-gradient-to-r !from-groovely-peach-500 !to-groovely-purple-500 hover:!shadow-lg hover:!shadow-groovely-peach-500/30 disabled:!opacity-50 disabled:!cursor-not-allowed"
          >
            <Sparkles size={18} className="mr-2" />
            Save Changes
          </Button>
        </motion.div>
      </div>
    </div>
  );
}

