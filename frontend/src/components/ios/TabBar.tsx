import { motion } from 'framer-motion';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { useNavigate, useLocation } from 'react-router-dom';
import { Home, Compass, PlusCircle, Trophy, User, Video } from 'lucide-react';
import { ReactNode } from 'react';

interface Tab {
  id: string;
  label: string;
  icon: ReactNode;
  path: string;
}

export function TabBar() {
  const navigate = useNavigate();
  const location = useLocation();

  const tabs: Tab[] = [
    { id: 'home', label: 'Home', icon: <Home size={24} />, path: '/' },
    { id: 'feed', label: 'Feed', icon: <Video size={24} />, path: '/feed' },
    { id: 'explore', label: 'Explore', icon: <Compass size={24} />, path: '/explore' },
    { id: 'create', label: 'Create', icon: <PlusCircle size={24} />, path: '/create' },
    { id: 'leaderboard', label: 'Leaderboard', icon: <Trophy size={24} />, path: '/leaderboard' },
    { id: 'profile', label: 'Profile', icon: <User size={24} />, path: '/profile' },
  ];

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  const handleTabPress = async (path: string) => {
    // Haptic feedback
    try {
      await Haptics.impact({ style: ImpactStyle.Light });
    } catch (e) {
      // Haptics not available
    }
    navigate(path);
  };

  return (
    <>
      {/* Spacer for fixed tab bar */}
      <div className="h-20" />
      
      {/* Fixed Tab Bar */}
      <motion.div
        initial={{ y: 100 }}
        animate={{ y: 0 }}
        className="fixed bottom-0 left-0 right-0 z-50 bg-groovely-dark-card/80 backdrop-blur-xl border-t border-groovely-dark-border shadow-lg safe-area-bottom transition-all duration-300"
      >
        <div className="flex items-center justify-around px-ios-2 py-ios-2 max-w-screen-lg mx-auto relative">
          {tabs.map((tab) => {
            const active = isActive(tab.path);
            return (
              <div key={tab.id} className="flex-1 flex justify-center">
                <TabBarItem
                  icon={tab.icon}
                  label={tab.label}
                  active={active}
                  onClick={() => handleTabPress(tab.path)}
                />
              </div>
            );
          })}
        </div>
      </motion.div>
    </>
  );
}

interface TabBarItemProps {
  icon: ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}

function TabBarItem({ icon, label, active, onClick }: TabBarItemProps) {
  return (
    <motion.button
      onClick={onClick}
      className="flex flex-col items-center justify-center w-full py-ios-2 px-ios-1 relative"
      whileTap={{ scale: 0.95 }}
      transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
      style={{ position: 'relative' }}
    >
      {/* Active indicator with gradient and glow - using layoutId for smooth transitions */}
      {active && (
        <motion.div
          layoutId="activeTabBar"
          className="absolute inset-0 rounded-xl bg-gradient-to-br from-groovely-peach-500/30 via-groovely-pink-500/25 to-groovely-purple-500/30"
          initial={false}
          transition={{ 
            type: 'spring', 
            stiffness: 380, 
            damping: 32,
            mass: 0.75
          }}
          style={{
            boxShadow: '0 0 20px rgba(236, 72, 153, 0.3), 0 0 40px rgba(168, 85, 247, 0.2)',
          }}
        />
      )}

      {/* Icon container */}
      <motion.div
        className="relative z-10 mb-1"
        animate={active ? { 
          scale: 1.05,
          filter: 'drop-shadow(0 0 8px rgba(236, 72, 153, 0.6))'
        } : { 
          scale: 1,
          filter: 'drop-shadow(0 0 0px transparent)'
        }}
        transition={{ 
          duration: 0.4,
          ease: [0.4, 0, 0.2, 1]
        }}
      >
        <motion.div
          className={`transition-colors duration-300 ${
            active ? 'text-groovely-peach-400' : 'text-groovely-dark-text-tertiary'
          }`}
          animate={active ? {
            color: '#FF8C5A'
          } : {
            color: '#A3A3A3'
          }}
          transition={{ duration: 0.3 }}
        >
          {icon}
        </motion.div>
      </motion.div>

      {/* Label */}
      <motion.span
        className={`text-ios-caption-1 font-medium z-10 relative transition-colors duration-300 ${
          active ? 'text-groovely-peach-400' : 'text-groovely-dark-text-tertiary'
        }`}
        animate={active ? {
          color: '#FF8C5A',
          fontWeight: 600
        } : {
          color: '#A3A3A3',
          fontWeight: 500
        }}
        transition={{ duration: 0.3 }}
      >
        {label}
      </motion.span>
    </motion.button>
  );
}


