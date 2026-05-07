import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, X, Sparkles, MessageSquare } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

interface AlphaBannerProps {
  onDismiss?: () => void;
  dismissible?: boolean;
}

export function AlphaBanner({ onDismiss, dismissible = true }: AlphaBannerProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [isVisible, setIsVisible] = useState(true);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    // Check if user has dismissed the banner before
    const dismissed = localStorage.getItem('groovely_alpha_banner_dismissed');
    if (dismissed === 'true') {
      setIsDismissed(true);
      setIsVisible(false);
    }
  }, []);

  const handleDismiss = () => {
    setIsVisible(false);
    localStorage.setItem('groovely_alpha_banner_dismissed', 'true');
    onDismiss?.();
  };

  const handleFeedback = async () => {
    try {
      await Haptics.impact({ style: ImpactStyle.Light });
    } catch (e) {
      // Haptics not available
    }
    
    if (user) {
      navigate('/feedback');
    } else {
      navigate('/login');
    }
  };

  if (isDismissed || !isVisible) return null;

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ y: -100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -100, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="fixed top-0 left-0 right-0 z-50 bg-gradient-to-r from-yellow-500/20 via-orange-500/20 to-red-500/20 backdrop-blur-xl border-b-2 border-yellow-500/50 shadow-2xl"
        >
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between py-4">
              <div className="flex items-center gap-3 flex-1">
                <motion.div
                  animate={{ rotate: [0, 10, -10, 0] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                  className="flex-shrink-0"
                >
                  <div className="w-10 h-10 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center shadow-lg">
                    <Sparkles size={20} className="text-white" />
                  </div>
                </motion.div>
                <div className="flex items-center gap-2 flex-1">
                  <AlertTriangle size={20} className="text-yellow-400 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-base font-bold text-white font-heading">
                      <span className="bg-gradient-to-r from-yellow-400 via-orange-400 to-red-400 bg-clip-text text-transparent">
                        ALPHA STAGE / EARLY ACCESS
                      </span>
                    </p>
                    <p className="text-sm text-white/90 font-body mt-0.5">
                      Groovely is currently in early development. You may encounter bugs, incomplete features, or frequent updates. Your feedback helps us improve!
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                {/* Feedback Button */}
                <motion.button
                  onClick={handleFeedback}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="px-3 py-1.5 bg-gradient-to-r from-groovely-peach-500/80 to-groovely-purple-500/80 hover:from-groovely-peach-500 hover:to-groovely-purple-500 rounded-lg transition-all text-white text-sm font-semibold shadow-lg backdrop-blur-sm border border-white/20 flex items-center gap-1.5"
                  aria-label="Give feedback"
                >
                  <MessageSquare size={14} />
                  <span className="hidden sm:inline">Feedback</span>
                </motion.button>
                {/* Dismiss Button */}
                {dismissible && (
                  <motion.button
                    onClick={handleDismiss}
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    className="p-2 hover:bg-white/10 rounded-lg transition-colors text-white/80 hover:text-white"
                    aria-label="Dismiss banner"
                  >
                    <X size={20} />
                  </motion.button>
                )}
              </div>
            </div>
          </div>
          {/* Animated gradient line */}
          <motion.div
            className="h-1 bg-gradient-to-r from-yellow-400 via-orange-500 to-red-500"
            animate={{
              backgroundPosition: ['0%', '100%', '0%'],
            }}
            transition={{
              duration: 3,
              repeat: Infinity,
              ease: 'linear',
            }}
            style={{
              backgroundSize: '200% 100%',
              backgroundImage: 'linear-gradient(to right, #facc15, #f97316, #ef4444, #f97316, #facc15)',
            }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
