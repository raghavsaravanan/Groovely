import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

export function FloatingFeedbackButton() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [isVisible, setIsVisible] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  // Hide on certain pages
  const hideOnPages = ['/login', '/create-profile', '/feedback', '/feed'];
  const shouldHide = hideOnPages.some(page => location.pathname === page);

  useEffect(() => {
    // Show button after a short delay on mount (except on excluded pages)
    if (!shouldHide) {
      const timer = setTimeout(() => {
        setIsVisible(true);
      }, 2000); // Show after 2 seconds
      return () => clearTimeout(timer);
    } else {
      setIsVisible(false);
    }
  }, [shouldHide, location.pathname]);

  const handleClick = async () => {
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

  if (shouldHide || !isVisible) return null;

  // Check if TabBar is visible (matches App.tsx hideTabBar logic)
  const hideTabBarPages = [
    '/login',
    '/create-profile',
    '/',
    '/settings',
    '/profile/edit',
    '/profile/follows',
    '/profile/my-crews',
    '/reset-password',
    '/feedback'
  ];
  const hasTabBar = !hideTabBarPages.includes(location.pathname) && !location.pathname.startsWith('/user/');

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, scale: 0, x: 20, y: 20 }}
          animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
          exit={{ opacity: 0, scale: 0, x: 20, y: 20 }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          className={`fixed right-4 sm:right-6 z-[45] ${
            hasTabBar 
              ? 'bottom-24 sm:bottom-28' // Above TabBar (TabBar is ~80px + padding, so 96px/112px gives clearance)
              : location.pathname === '/' 
                ? 'bottom-24 sm:bottom-24' // Home page has footer, need more clearance
                : 'bottom-6 sm:bottom-8'    // No TabBar, can be closer to bottom (24px/32px from edge)
          }`}
        >
          {/* Expanded Tooltip */}
          <AnimatePresence>
            {isExpanded && (
              <motion.div
                initial={{ opacity: 0, x: 10, scale: 0.9 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 10, scale: 0.9 }}
                transition={{ duration: 0.2 }}
                className="absolute right-16 bottom-0 mb-0 px-4 py-2 bg-groovely-dark-card border border-groovely-dark-border rounded-xl shadow-2xl backdrop-blur-xl whitespace-nowrap"
              >
                <p className="text-sm font-semibold text-white font-heading">
                  Share Your Feedback
                </p>
                <p className="text-xs text-groovely-dark-text-secondary mt-0.5">
                  Help us improve Groovely
                </p>
                {/* Arrow pointing to button */}
                <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-full w-0 h-0 border-t-8 border-t-transparent border-b-8 border-b-transparent border-l-8 border-l-groovely-dark-border" />
                <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-[calc(100%-1px)] w-0 h-0 border-t-[7px] border-t-transparent border-b-[7px] border-b-transparent border-l-[7px] border-l-groovely-dark-card" />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Feedback Button */}
          <motion.button
            onClick={handleClick}
            onMouseEnter={() => setIsExpanded(true)}
            onMouseLeave={() => setIsExpanded(false)}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            className="relative w-14 h-14 bg-gradient-to-br from-groovely-peach-500 to-groovely-purple-500 rounded-full shadow-2xl shadow-groovely-pink-500/50 border-2 border-white/20 flex items-center justify-center group hover:shadow-groovely-pink-500/70 transition-shadow duration-300"
            aria-label="Give feedback"
          >
            <motion.div
              animate={{ rotate: [0, 10, -10, 0] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
            >
              <MessageSquare size={24} className="text-white" />
            </motion.div>
            
            {/* Pulse effect */}
            <motion.div
              className="absolute inset-0 bg-gradient-to-br from-groovely-peach-500 to-groovely-purple-500 rounded-full opacity-75"
              animate={{ scale: [1, 1.2, 1], opacity: [0.75, 0, 0.75] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            />
          </motion.button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
