import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  User,
  Bell,
  Mail,
  Heart,
  Trophy,
  Settings as SettingsIcon,
  Trash2,
  AlertTriangle,
  X,
  UserPlus,
  MessageSquare,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { Button, Card, PageHeader } from '../components/ios';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { supabase } from '../lib/supabase';

// Local storage keys
const STORAGE_KEYS = {
  NOTIFICATIONS: 'groovely_notifications_enabled',
  EMAIL_NOTIFICATIONS: 'groovely_email_notifications',
  PUSH_FOLLOWERS: 'groovely_push_followers',
  PUSH_LIKES: 'groovely_push_likes',
};

export function Settings() {
  const navigate = useNavigate();
  const { signOut, user } = useAuth();
  
  // Load preferences from localStorage
  const loadPreference = (key: string, defaultValue: boolean) => {
    try {
      const stored = localStorage.getItem(key);
      return stored !== null ? JSON.parse(stored) : defaultValue;
    } catch {
      return defaultValue;
    }
  };

  const [notificationsEnabled, setNotificationsEnabled] = useState(() => 
    loadPreference(STORAGE_KEYS.NOTIFICATIONS, true)
  );
  const [emailNotifications, setEmailNotifications] = useState(() => 
    loadPreference(STORAGE_KEYS.EMAIL_NOTIFICATIONS, true)
  );
  const [pushFollowers, setPushFollowers] = useState(() => 
    loadPreference(STORAGE_KEYS.PUSH_FOLLOWERS, true)
  );
  const [pushLikes, setPushLikes] = useState(() => 
    loadPreference(STORAGE_KEYS.PUSH_LIKES, true)
  );

  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);

  // Initialize page
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // Load user email on mount
  useEffect(() => {
    if (user?.email) {
      setEmailInput(user.email);
    }
  }, [user]);

  // Reset delete confirmation text when modal closes
  useEffect(() => {
    if (!showDeleteAccount) {
      setDeleteConfirmText('');
    }
  }, [showDeleteAccount]);

  // Save preferences to localStorage
  const savePreference = (key: string, value: boolean) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.error('Failed to save preference:', error);
    }
  };

  const handleToggle = async (
    setter: (value: boolean) => void, 
    currentValue: boolean,
    storageKey?: string
  ) => {
    try {
      await Haptics.impact({ style: ImpactStyle.Light });
    } catch (e) {
      // Haptics not available
    }
    const newValue = !currentValue;
    setter(newValue);
    if (storageKey) {
      savePreference(storageKey, newValue);
    }
  };

  const handleLogout = async () => {
    try {
      await Haptics.impact({ style: ImpactStyle.Heavy });
    } catch (e) {
      // Haptics not available
    }
    
    const confirm = window.confirm('Are you sure you want to log out?');
    if (confirm) {
      await signOut();
      navigate('/login');
    }
  };

  const handleDeleteAccount = async () => {
    if (!user) return;
    
    const confirmText = 'DELETE';
    if (deleteConfirmText !== confirmText) {
      alert(`Please type "${confirmText}" to confirm account deletion.`);
      return;
    }

    setDeletingAccount(true);
    try {
      // Try haptics feedback (ignore errors if not supported)
      try {
        const hapticsEnabled = loadPreference('groovely_haptics_enabled', true);
        if (hapticsEnabled) {
          await Haptics.impact({ style: ImpactStyle.Heavy });
        }
      } catch (e) {
        // Haptics not available, continue with deletion
      }

      // Delete user account using the database function
      // This will delete the profile and cascade delete all related data
      const { error } = await supabase.rpc('delete_user_account');

      if (error) throw error;

      // Sign out and redirect
      await signOut();
      navigate('/login');
    } catch (error: any) {
      console.error('Error deleting account:', error);
      alert(`Failed to delete account: ${error.message || 'Unknown error'}`);
    } finally {
      setDeletingAccount(false);
    }
  };

  const handleEmailNotifications = async () => {
    if (!emailNotifications) {
      // If enabling, show modal to configure email
      setShowEmailModal(true);
    } else {
      // If disabling, just toggle
      await handleToggle(setEmailNotifications, emailNotifications, STORAGE_KEYS.EMAIL_NOTIFICATIONS);
    }
  };

  const handleSaveEmail = async () => {
    if (!user || !emailInput.trim()) return;
    
    setSavingEmail(true);
    try {
      // Update user email in Supabase Auth
      const { error: updateError } = await supabase.auth.updateUser({
        email: emailInput.trim()
      });

      if (updateError) throw updateError;

      // Save email notifications preference
      savePreference(STORAGE_KEYS.EMAIL_NOTIFICATIONS, true);
      setEmailNotifications(true);
      setShowEmailModal(false);
      
      try {
        await Haptics.notification({ type: NotificationType.Success });
      } catch (e) {
        // Haptics not available
      }
    } catch (error: any) {
      console.error('Error saving email:', error);
      alert(`Failed to save email: ${error.message || 'Unknown error'}`);
    } finally {
      setSavingEmail(false);
    }
  };

  const ToggleSwitch = ({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) => (
    <motion.button
      onClick={onToggle}
      className={`relative w-12 h-7 rounded-full transition-colors ${
        enabled 
          ? 'bg-gradient-to-r from-groovely-peach-500 to-groovely-purple-500' 
          : 'bg-groovely-gray-700'
      }`}
      whileTap={{ scale: 0.95 }}
    >
      <motion.div
        className="absolute top-1 w-5 h-5 bg-white rounded-full shadow-lg"
        animate={{ left: enabled ? 'calc(100% - 24px)' : '4px' }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      />
    </motion.button>
  );

  const SettingItem = ({
    icon: Icon,
    label,
    description,
    onClick,
    toggle,
    value,
    danger,
  }: {
    icon: React.ElementType;
    label: string;
    description?: string;
    onClick?: () => void;
    toggle?: boolean;
    value?: boolean;
    danger?: boolean;
  }) => (
    <motion.div
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={`flex items-center justify-between py-4 border-b border-groovely-dark-border last:border-0 cursor-pointer hover:bg-groovely-dark-surface/50 transition-colors ${
        danger ? 'hover:bg-red-500/10' : ''
      }`}
    >
      <div className="flex items-center gap-3 flex-1">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 shadow-md ${
          danger 
            ? 'bg-gradient-to-br from-red-500 to-red-600 shadow-red-500/20'
            : 'bg-gradient-to-br from-groovely-peach-500 to-groovely-purple-500 shadow-groovely-peach-500/20'
        }`}>
          <Icon size={18} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className={`text-base font-medium font-heading ${
            danger ? 'text-red-400' : 'text-white'
          }`}>{label}</div>
          {description && (
            <div className="text-sm text-groovely-dark-text-secondary mt-0.5">{description}</div>
          )}
        </div>
      </div>
      {toggle && value !== undefined ? (
        <ToggleSwitch enabled={value} onToggle={onClick!} />
      ) : null}
    </motion.div>
  );

  return (
    <motion.div 
      className="min-h-screen bg-groovely-dark-bg pb-24"
    >
      {/* Header */}
      <PageHeader
        title="Settings"
        subtitle="MANAGE YOUR ACCOUNT"
        icon={<SettingsIcon size={32} className="text-white/90" />}
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

      <div className="max-w-2xl mx-auto px-ios-4 pt-6">
        {/* Account Section */}
        <motion.div
          className="mb-6"
        >
          <h2 className="text-lg font-bold text-white font-heading mb-3 px-2">Account</h2>
          <Card variant="elevated" className="backdrop-blur-xl">
            <div className="p-4">
              <SettingItem
                icon={User}
                label="Edit Profile"
                description="Update your info, photo, and bio"
                onClick={() => navigate('/profile/edit')}
              />
              <SettingItem
                icon={UserPlus}
                label="Follow Management"
                description="See who you follow and your followers"
                onClick={() => navigate('/profile/follows')}
              />
              <SettingItem
                icon={Trophy}
                label="My Crews"
                description="Manage crews you've created"
                onClick={() => navigate('/profile/my-crews')}
              />
              <SettingItem
                icon={MessageSquare}
                label="Feedback"
                description="Share your thoughts and help us improve"
                onClick={() => navigate('/feedback')}
              />
            </div>
          </Card>
        </motion.div>

        {/* Notifications Section */}
        <motion.div
          className="mb-6"
        >
          <h2 className="text-lg font-bold text-white font-heading mb-3 px-2">Notifications</h2>
          <Card variant="elevated" className="backdrop-blur-xl">
            <div className="p-4">
              <SettingItem
                icon={Bell}
                label="Push Notifications"
                description="Enable all notifications"
                onClick={() => handleToggle(setNotificationsEnabled, notificationsEnabled, STORAGE_KEYS.NOTIFICATIONS)}
                toggle
                value={notificationsEnabled}
              />
              {notificationsEnabled && (
                <>
                  <div className="ml-11 space-y-2 py-3 border-l-2 border-groovely-peach-500/30 pl-4 mt-2">
                    <SettingItem
                      icon={UserPlus}
                      label="New Followers"
                      onClick={() => handleToggle(setPushFollowers, pushFollowers, STORAGE_KEYS.PUSH_FOLLOWERS)}
                      toggle
                      value={pushFollowers}
                    />
                    <SettingItem
                      icon={Heart}
                      label="Likes & Comments"
                      onClick={() => handleToggle(setPushLikes, pushLikes, STORAGE_KEYS.PUSH_LIKES)}
                      toggle
                      value={pushLikes}
                    />
                  </div>
                </>
              )}
              <SettingItem
                icon={Mail}
                label="Email Notifications"
                description={emailNotifications ? user?.email || 'Configure email address' : 'Receive updates via email'}
                onClick={handleEmailNotifications}
                toggle
                value={emailNotifications}
              />
            </div>
          </Card>
        </motion.div>

        {/* Danger Zone */}
        <motion.div
          className="mb-6"
        >
          <h2 className="text-lg font-bold text-red-400 font-heading mb-3 px-2">Danger Zone</h2>
          <Card variant="elevated" className="border-2 border-red-500/30 bg-red-500/5 backdrop-blur-xl">
            <div className="p-4">
              <motion.button
                onClick={() => setShowDeleteAccount(true)}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="w-full flex items-center justify-between py-4 border-b border-groovely-dark-border last:border-0 cursor-pointer hover:bg-red-500/10 transition-colors group"
              >
                <div className="flex items-center gap-3 flex-1">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500 to-red-600 shadow-md shadow-red-500/20 flex items-center justify-center flex-shrink-0">
                    <Trash2 size={18} className="text-white" />
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <div className="text-base font-semibold text-red-400 font-heading group-hover:text-red-300 transition-colors">
                      Delete Account
                    </div>
                    <div className="text-sm text-groovely-dark-text-secondary mt-0.5">
                      Permanently delete your account and all data
                    </div>
                  </div>
                </div>
                <motion.div
                  animate={{ x: [0, 4, 0] }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                  className="text-red-400 opacity-60"
                >
                  →
                </motion.div>
              </motion.button>
            </div>
          </Card>
        </motion.div>

        {/* Logout Button */}
        <motion.div>
          <Button
            onClick={handleLogout}
            variant="outline"
            size="lg"
            fullWidth
            className="!border-red-500/50 !text-red-400 hover:!bg-red-500/10 !bg-red-500/5"
          >
            Log Out
          </Button>
        </motion.div>

        {/* Footer */}
        <p 
          className="text-center text-sm text-groovely-dark-text-tertiary mt-8 font-body"
        >
          Made with ❤️ by the Groovely Team
          <br />
          <span className="text-groovely-peach-400 font-heading text-base mt-2 inline-block">Dance The Ranks. Connect Through Movement.</span>
        </p>
      </div>

      {/* Email Configuration Modal */}
      <AnimatePresence>
        {showEmailModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
            onClick={() => !savingEmail && setShowEmailModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-groovely-dark-card rounded-2xl w-full max-w-md p-6 border border-groovely-dark-border"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-2xl font-bold text-white font-heading">Email Notifications</h3>
                <button
                  onClick={() => !savingEmail && setShowEmailModal(false)}
                  className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                  disabled={savingEmail}
                >
                  <X size={20} className="text-white" />
                </button>
              </div>
              <p className="text-groovely-dark-text-secondary mb-4">
                Enter your email address to receive notifications about your dance journey.
              </p>
              <div className="mb-6">
                <label className="block text-sm font-medium text-white mb-2">Email Address</label>
                <input
                  type="email"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="your.email@example.com"
                  disabled={savingEmail}
                  className="w-full px-4 py-3 bg-groovely-dark-surface border border-groovely-dark-border rounded-lg text-white placeholder-white/40 focus:ring-2 focus:ring-groovely-pink-500 focus:border-transparent disabled:opacity-50"
                />
              </div>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  size="lg"
                  fullWidth
                  onClick={() => setShowEmailModal(false)}
                  disabled={savingEmail}
                  className="!border-groovely-dark-border !text-white"
                >
                  Cancel
                </Button>
                <Button
                  size="lg"
                  fullWidth
                  onClick={handleSaveEmail}
                  disabled={savingEmail || !emailInput.trim()}
                  className="!bg-gradient-to-r !from-groovely-peach-500 !to-groovely-purple-500"
                >
                  {savingEmail ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent mr-2" />
                      Saving...
                    </>
                  ) : (
                    'Save Email'
                  )}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Account Confirmation Modal */}
      <AnimatePresence>
        {showDeleteAccount && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
            onClick={() => !deletingAccount && setShowDeleteAccount(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-groovely-dark-card rounded-2xl w-full max-w-md p-6 border border-red-500/30"
            >
              <div className="flex items-center gap-3 mb-4">
                <AlertTriangle size={24} className="text-red-400" />
                <h3 className="text-2xl font-bold text-white font-heading">Delete Account</h3>
              </div>
              <p className="text-groovely-dark-text-secondary mb-4 font-body">
                WARNING: This will permanently delete your account and all associated data. This action CANNOT be undone. All your videos, crews, followers, and achievements will be lost.
              </p>
              <div className="mb-6">
                <label className="block text-sm font-medium text-white mb-2">
                  Type <span className="text-red-400 font-bold">DELETE</span> to confirm:
                </label>
                <input
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder="Type DELETE to confirm"
                  disabled={deletingAccount}
                  className="w-full px-4 py-3 bg-groovely-dark-surface border border-red-500/50 rounded-lg text-white placeholder-white/40 focus:ring-2 focus:ring-red-500 focus:border-transparent disabled:opacity-50"
                  autoFocus
                />
              </div>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  size="lg"
                  fullWidth
                  onClick={() => setShowDeleteAccount(false)}
                  disabled={deletingAccount}
                  className="!border-groovely-dark-border !text-white"
                >
                  Cancel
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  fullWidth
                  onClick={handleDeleteAccount}
                  disabled={deletingAccount || deleteConfirmText !== 'DELETE'}
                  className="!border-red-500/50 !text-red-400 hover:!bg-red-500/10 !bg-red-500/5 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {deletingAccount ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-2 border-red-400 border-t-transparent mr-2" />
                      Deleting...
                    </>
                  ) : (
                    'Delete Account'
                  )}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
