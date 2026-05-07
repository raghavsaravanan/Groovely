import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, CheckCircle2, Camera, Sparkles, Check, X, AlertCircle, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase, DanceStyle } from '../lib/supabase';
import { motion, AnimatePresence } from 'framer-motion';
import { Button, Card } from '../components/ios';
import { staggerContainerVariants, staggerItemVariants, successVariants, floatVariants } from '../animations';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { Logo } from '../components/Logo';

const MAX_BIO_LENGTH = 150;
const MIN_USERNAME_LENGTH = 3;
const MAX_USERNAME_LENGTH = 20;

export function CreateProfile() {
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [selectedStyles, setSelectedStyles] = useState<string[]>([]);
  const [danceStyles, setDanceStyles] = useState<DanceStyle[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [checkingUsername, setCheckingUsername] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const navigate = useNavigate();
  const { user, refreshProfile } = useAuth();

  // Calculate progress
  const progress = Math.round(
    ((username ? 1 : 0) * 0.3 +
      (avatarPreview ? 1 : 0) * 0.2 +
      (displayName ? 1 : 0) * 0.1 +
      (bio ? 1 : 0) * 0.1 +
      (selectedStyles.length > 0 ? 1 : 0) * 0.3) * 100
  );

  useEffect(() => {
    const fetchDanceStyles = async () => {
      const { data, error } = await supabase
        .from('dance_styles')
        .select('*')
        .order('name');

      if (!error && data) {
        setDanceStyles(data);
      }
    };

    fetchDanceStyles();
  }, []);

  // Check username availability
  useEffect(() => {
    const checkUsername = async () => {
      if (!username || username.length < MIN_USERNAME_LENGTH) {
        setUsernameAvailable(null);
        return;
      }

      // Check username format
      const usernameRegex = /^[a-zA-Z0-9_]+$/;
      if (!usernameRegex.test(username)) {
        setUsernameAvailable(false);
        return;
      }

      setCheckingUsername(true);
      try {
        const { data } = await supabase
          .from('profiles')
          .select('id')
          .eq('username', username.toLowerCase())
          .maybeSingle();

        setUsernameAvailable(!data);
      } catch (err) {
        setUsernameAvailable(null);
      } finally {
        setCheckingUsername(false);
      }
    };

    const timeoutId = setTimeout(checkUsername, 500);
    return () => clearTimeout(timeoutId);
  }, [username]);

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAvatarFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setAvatarPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
      
      try {
        await Haptics.impact({ style: ImpactStyle.Light });
      } catch (e) {
        // Haptics not available
      }
    }
  };

  const toggleStyle = async (styleId: string) => {
    try {
      await Haptics.impact({ style: ImpactStyle.Light });
    } catch (e) {
      // Haptics not available
    }
    
    setSelectedStyles(prev =>
      prev.includes(styleId)
        ? prev.filter(id => id !== styleId)
        : [...prev, styleId]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (usernameAvailable === false) {
      setError('Username is already taken');
      return;
    }

    setError('');
    setLoading(true);

    try {
      let avatarUrl = null;

      if (avatarFile) {
        const fileExt = avatarFile.name.split('.').pop();
        const fileName = `${Date.now()}.${fileExt}`;
        const filePath = `${user.id}/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('avatars')
          .upload(filePath, avatarFile, {
            cacheControl: '3600',
            upsert: true,
          });

        if (uploadError) {
          throw uploadError;
        }

        const { data: { publicUrl } } = supabase.storage
          .from('avatars')
          .getPublicUrl(filePath);

        avatarUrl = publicUrl;
      }

      const { error: profileError } = await supabase
        .from('profiles')
        .insert({
          id: user.id,
          username: username.toLowerCase(),
          display_name: displayName || username,
          bio,
          avatar_url: avatarUrl,
        });

      if (profileError) {
        throw profileError;
      }

      if (selectedStyles.length > 0) {
        const userDanceStyles = selectedStyles.map(styleId => ({
          user_id: user.id,
          dance_style_id: styleId,
        }));

        const { error: stylesError } = await supabase
          .from('user_dance_styles')
          .insert(userDanceStyles);

        if (stylesError) {
          throw stylesError;
        }
      }

      await refreshProfile();
      
      // Success haptic
      try {
        await Haptics.notification({ type: NotificationType.Success });
      } catch (e) {
        // Haptics not available
      }

      setShowSuccess(true);
      setTimeout(() => {
        navigate('/explore');
      }, 2000);
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'message' in err) {
        setError((err as { message: string }).message);
      } else {
        setError('An unexpected error occurred');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden bg-groovely-dark-bg">
      {/* Animated gradient mesh background */}
      <div className="absolute inset-0 overflow-hidden">
        <motion.div
          variants={floatVariants}
          animate="float"
          className="absolute top-1/4 left-1/4 w-96 h-96 bg-groovely-peach-500/10 rounded-full blur-3xl"
        />
        <motion.div
          variants={floatVariants}
          animate="float"
          transition={{ delay: 1 }}
          className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-groovely-purple-500/10 rounded-full blur-3xl"
        />
        <motion.div
          variants={floatVariants}
          animate="float"
          transition={{ delay: 0.5 }}
          className="absolute top-1/2 right-1/3 w-72 h-72 bg-groovely-pink-500/10 rounded-full blur-3xl"
        />
      </div>

      <div className="relative min-h-screen flex items-center justify-center px-6 py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="w-full max-w-2xl"
        >
          {/* Header with Logo */}
          <motion.div
            className="text-center mb-8"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <div className="flex justify-center mb-4">
              <motion.div 
                whileHover={{ scale: 1.05 }} 
                transition={{ duration: 0.15 }} 
                className="relative"
              >
                <Logo size={60} animated />
                <motion.span
                  aria-hidden
                  className="absolute inset-0 rounded-full"
                  initial={{ opacity: 0 }}
                  whileHover={{ opacity: 0.25 }}
                  transition={{ duration: 0.2 }}
                  style={{ boxShadow: '0 0 24px rgba(236,72,153,0.45)' }}
                />
              </motion.div>
            </div>
            <h1 className="text-4xl font-bold text-white font-heading mb-2">Welcome to Groovely</h1>
            <p className="text-base text-groovely-dark-text-secondary font-body">
              CREATE YOUR PROFILE TO MOVE DIFFERENT
            </p>
          </motion.div>

          {/* Progress Indicator */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3 }}
            className="mb-6"
          >
            <Card variant="glass" className="backdrop-blur-xl">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-groovely-dark-text-secondary uppercase">
                  Profile Progress
                </span>
                <span className="text-sm font-bold text-white font-heading">{progress}%</span>
              </div>
              <div className="h-2 bg-groovely-dark-surface rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
                  className="h-full bg-gradient-to-r from-groovely-peach-500 via-groovely-pink-500 to-groovely-purple-500 rounded-full"
                />
              </div>
            </Card>
          </motion.div>

          {/* Main Form Card */}
          <Card variant="glass" className="backdrop-blur-xl relative overflow-hidden">
            {/* Subtle corner glows */}
            <div className="pointer-events-none absolute -top-24 -left-24 w-72 h-72 rounded-full bg-groovely-peach-500/10 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-24 -right-24 w-72 h-72 rounded-full bg-groovely-purple-500/10 blur-3xl" />

            {/* Error Message */}
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mb-6"
                >
                  <Card variant="elevated" className="bg-red-500/10 border border-red-500/20">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="text-red-400" size={20} />
                      <p className="text-sm text-red-400 font-medium">{error}</p>
                    </div>
                  </Card>
                </motion.div>
              )}
            </AnimatePresence>

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Avatar Upload */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="flex flex-col items-center mb-6"
              >
                <motion.div
                  className="relative"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <div className={`w-32 h-32 rounded-full flex items-center justify-center overflow-hidden border-4 shadow-lg transition-all duration-300 ${
                    avatarPreview 
                      ? 'border-groovely-peach-500/50 shadow-groovely-peach-500/30' 
                      : 'border-groovely-dark-border bg-groovely-dark-surface'
                  }`}>
                    {avatarPreview ? (
                      <motion.img
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: 'spring', stiffness: 200 }}
                        src={avatarPreview}
                        alt="Avatar preview"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <motion.div
                        animate={{ rotate: [0, 5, -5, 0] }}
                        transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
                      >
                        <Camera className="text-groovely-dark-text-tertiary" size={40} />
                      </motion.div>
                    )}
                  </div>
                  <motion.button
                    type="button"
                    onClick={async () => {
                      try {
                        await Haptics.impact({ style: ImpactStyle.Light });
                      } catch (e) {
                        // ignore
                      }
                      fileInputRef.current?.click();
                    }}
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    className="absolute bottom-0 right-0 bg-gradient-to-br from-groovely-peach-500 to-groovely-purple-500 text-white p-3 rounded-full hover:shadow-lg hover:shadow-groovely-peach-500/30 transition-all shadow-md focus:outline-none focus:ring-2 focus:ring-groovely-peach-500/50"
                  >
                    <Upload size={18} />
                  </motion.button>
                  <input
                    ref={fileInputRef}
                    id="avatar"
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarChange}
                    className="hidden"
                  />
                </motion.div>
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  className="text-sm text-groovely-dark-text-secondary mt-3"
                >
                  {avatarPreview ? 'Tap to change' : 'Upload profile picture'}
                </motion.p>
              </motion.div>

              {/* Username */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
              >
                <label htmlFor="username" className="block text-sm font-semibold text-white mb-2 font-body">
                  Username <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <input
                    id="username"
                    type="text"
                    value={username}
                    onChange={(e) => {
                      setUsername(e.target.value);
                      setError('');
                    }}
                    required
                    minLength={MIN_USERNAME_LENGTH}
                    maxLength={MAX_USERNAME_LENGTH}
                    className={`w-full px-4 py-3 bg-groovely-dark-surface border rounded-xl text-base text-white placeholder:text-groovely-dark-text-tertiary caret-groovely-peach-500 focus:ring-2 focus:ring-groovely-peach-500/50 focus:border-transparent transition-all ${
                      usernameAvailable === false
                        ? 'border-red-500/50 focus:ring-red-500/50'
                        : usernameAvailable === true
                        ? 'border-green-500/50 focus:ring-green-500/50'
                        : 'border-groovely-dark-border'
                    }`}
                    placeholder="dancer_username"
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <AnimatePresence mode="wait">
                      {checkingUsername && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.8 }}
                        >
                          <Loader2 className="text-groovely-dark-text-tertiary animate-spin" size={18} />
                        </motion.div>
                      )}
                      {!checkingUsername && username.length >= MIN_USERNAME_LENGTH && usernameAvailable === true && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.8 }}
                        >
                          <Check className="text-green-400" size={18} />
                        </motion.div>
                      )}
                      {!checkingUsername && username.length >= MIN_USERNAME_LENGTH && usernameAvailable === false && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.8 }}
                        >
                          <X className="text-red-400" size={18} />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
                {username && (
                  <motion.p
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className={`text-xs mt-1 ${
                      usernameAvailable === false
                        ? 'text-red-400'
                        : usernameAvailable === true
                        ? 'text-green-400'
                        : 'text-groovely-dark-text-tertiary'
                    }`}
                  >
                    {username.length < MIN_USERNAME_LENGTH
                      ? `At least ${MIN_USERNAME_LENGTH} characters`
                      : usernameAvailable === false
                      ? 'Username is taken'
                      : usernameAvailable === true
                      ? 'Username available'
                      : 'Checking...'}
                  </motion.p>
                )}
              </motion.div>

              {/* Display Name */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                <label htmlFor="displayName" className="block text-sm font-semibold text-white mb-2 font-body">
                  Display Name
                </label>
                <input
                  id="displayName"
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full px-4 py-3 bg-groovely-dark-surface border border-groovely-dark-border rounded-xl text-base text-white placeholder:text-groovely-dark-text-tertiary caret-groovely-peach-500 focus:ring-2 focus:ring-groovely-peach-500/50 focus:border-transparent transition-all"
                  placeholder="Your Name"
                />
              </motion.div>

              {/* Bio */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 }}
              >
                <div className="flex items-center justify-between mb-2">
                  <label htmlFor="bio" className="block text-sm font-semibold text-white font-body">
                    Bio
                  </label>
                  <span className={`text-xs ${
                    bio.length > MAX_BIO_LENGTH
                      ? 'text-red-400'
                      : 'text-groovely-dark-text-tertiary'
                  }`}>
                    {bio.length}/{MAX_BIO_LENGTH}
                  </span>
                </div>
                <textarea
                  id="bio"
                  value={bio}
                  onChange={(e) => {
                    if (e.target.value.length <= MAX_BIO_LENGTH) {
                      setBio(e.target.value);
                    }
                  }}
                  rows={3}
                  className="w-full px-4 py-3 bg-groovely-dark-surface border border-groovely-dark-border rounded-xl text-base text-white placeholder:text-groovely-dark-text-tertiary caret-groovely-peach-500 focus:ring-2 focus:ring-groovely-peach-500/50 focus:border-transparent transition-all resize-none"
                  placeholder="Tell us about your dance journey..."
                />
              </motion.div>

              {/* Dance Styles */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
              >
                <div className="flex items-center justify-between mb-3">
                  <label className="block text-sm font-semibold text-white font-body">
                    Choose Your Dance Styles
                  </label>
                  {selectedStyles.length > 0 && (
                    <motion.span
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="text-xs text-groovely-peach-400 font-semibold"
                    >
                      {selectedStyles.length} selected
                    </motion.span>
                  )}
                </div>
                <motion.div
                  variants={staggerContainerVariants}
                  initial="initial"
                  animate="animate"
                  className="grid sm:grid-cols-2 gap-3"
                >
                  {danceStyles.map(style => {
                    const isSelected = selectedStyles.includes(style.id);
                    return (
                      <motion.button
                        key={style.id}
                        variants={staggerItemVariants}
                        type="button"
                        onClick={() => toggleStyle(style.id)}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        className={`relative p-4 rounded-xl border-2 transition-all text-left overflow-hidden ${
                          isSelected
                            ? 'border-groovely-peach-500 bg-groovely-peach-500/10 shadow-lg shadow-groovely-peach-500/20'
                            : 'border-groovely-dark-border bg-groovely-dark-surface hover:border-groovely-peach-500/50 hover:bg-groovely-dark-surface/80'
                        }`}
                      >
                        {isSelected && (
                          <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="absolute inset-0 bg-gradient-to-br from-groovely-peach-500/5 to-groovely-purple-500/5"
                          />
                        )}
                        <div className="flex items-center justify-between relative z-10">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs font-semibold text-white uppercase font-body">
                                {style.name}
                              </span>
                            </div>
                            {style.description && (
                              <p className="text-xs text-groovely-dark-text-secondary line-clamp-2">
                                {style.description}
                              </p>
                            )}
                          </div>
                          <AnimatePresence>
                            {isSelected && (
                              <motion.div
                                initial={{ scale: 0, rotate: -180 }}
                                animate={{ scale: 1, rotate: 0 }}
                                exit={{ scale: 0, rotate: 180 }}
                                transition={{ type: 'spring', stiffness: 300 }}
                                className="flex-shrink-0 ml-2"
                              >
                                <div className="w-6 h-6 bg-gradient-to-br from-groovely-peach-500 to-groovely-purple-500 rounded-full flex items-center justify-center shadow-md">
                                  <Check className="text-white" size={14} />
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      </motion.button>
                    );
                  })}
                </motion.div>
              </motion.div>

              {/* Submit Button */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35 }}
                className="pt-4"
              >
                <Button
                  type="submit"
                  disabled={loading || !username || usernameAvailable === false || username.length < MIN_USERNAME_LENGTH}
                  loading={loading}
                  variant="primary"
                  size="lg"
                  fullWidth
                  className="!bg-gradient-to-r !from-groovely-peach-500 !to-groovely-purple-500 hover:!shadow-lg hover:!shadow-groovely-peach-500/30 disabled:!opacity-50 disabled:!cursor-not-allowed"
                >
                  {loading ? 'Creating Profile...' : 'Create Profile'}
                </Button>
              </motion.div>
            </form>
          </Card>
        </motion.div>
      </div>

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
                  <CheckCircle2 size={40} strokeWidth={3} className="text-white" />
                </div>
              </motion.div>
              <h3 className="text-2xl font-bold text-white font-heading mb-2">Profile Created!</h3>
              <p className="text-sm text-groovely-dark-text-secondary mb-4">
                Welcome to Groovely - Move Different
              </p>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="flex items-center justify-center gap-2 text-groovely-peach-400"
              >
                <Sparkles size={16} />
                <span className="text-xs font-semibold">Taking you to explore...</span>
              </motion.div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
