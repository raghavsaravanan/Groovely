import { motion } from 'framer-motion';
import { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  action?: ReactNode;
  bottomPadding?: 'sm' | 'md' | 'lg' | 'xl';
  sticky?: boolean;
  className?: string;
  children?: ReactNode;
  maxWidth?: '2xl' | '3xl' | '4xl' | '5xl' | '6xl' | '7xl';
}

const paddingMap = {
  sm: 'pb-1',
  md: 'pb-2',
  lg: 'pb-3',
  xl: 'pb-4',
};

const maxWidthMap = {
  '2xl': 'max-w-2xl',
  '3xl': 'max-w-3xl',
  '4xl': 'max-w-4xl',
  '5xl': 'max-w-5xl',
  '6xl': 'max-w-6xl',
  '7xl': 'max-w-7xl',
};

export function PageHeader({
  title,
  subtitle,
  icon,
  action,
  bottomPadding = 'md',
  sticky = false,
  className = '',
  children,
  maxWidth = '7xl',
}: PageHeaderProps) {
  const padding = paddingMap[bottomPadding];
  const maxWidthClass = maxWidthMap[maxWidth];

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.5,
        ease: [0.25, 0.1, 0.25, 1], // Premium cinematic easing
      }}
      className={`bg-groovely-gradient ${padding} ${sticky ? 'sticky top-0 z-20' : 'relative z-20'} ${className}`}
      style={{ willChange: 'transform, opacity' }}
    >
      {/* Animated gradient overlay for depth */}
      <motion.div
        className="absolute inset-0 opacity-0"
        animate={{
          opacity: [0, 0.1, 0],
        }}
        transition={{
          duration: 8,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        style={{
          background: 'radial-gradient(circle at 50% 50%, rgba(255,255,255,0.15) 0%, transparent 70%)',
        }}
      />

      {/* Subtle particle effect */}
      <motion.div
        className="absolute inset-0 opacity-5"
        animate={{
          backgroundPosition: ['0% 0%', '100% 100%'],
        }}
        transition={{
          duration: 20,
          repeat: Infinity,
          repeatType: 'reverse',
        }}
        style={{
          backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
      />

      <div className={`relative ${maxWidthClass} mx-auto px-6 py-3`}>
        <div className="flex items-center gap-4 mb-4">
          {/* Left section: Icon and Title */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{
              duration: 0.6,
              delay: 0.1,
              ease: [0.25, 0.1, 0.25, 1],
            }}
            className="flex items-center gap-4 flex-1 min-w-0"
          >
            {icon && (
              <motion.div
                whileHover={{ scale: 1.1, rotate: 5 }}
                transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                className="text-white/90 flex-shrink-0"
              >
                {icon}
              </motion.div>
            )}
            <div className="flex-1 min-w-0">
              <motion.h1
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.6,
                  delay: 0.15,
                  ease: [0.25, 0.1, 0.25, 1],
                }}
                className="text-2xl font-bold text-white font-heading drop-shadow-lg truncate"
              >
                {title}
              </motion.h1>
              {subtitle && (
                <motion.p
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.6,
                    delay: 0.2,
                    ease: [0.25, 0.1, 0.25, 1],
                  }}
                  className="text-xs text-white/80 font-subtext mt-0.5 tracking-wide uppercase"
                >
                  {subtitle}
                </motion.p>
              )}
            </div>
          </motion.div>

          {/* Right section: Action buttons */}
          {action && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{
                duration: 0.6,
                delay: 0.1,
                ease: [0.25, 0.1, 0.25, 1],
              }}
              className="flex items-center gap-2 flex-shrink-0"
            >
              {action}
            </motion.div>
          )}
        </div>

        {children && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.6,
              delay: 0.25,
              ease: [0.25, 0.1, 0.25, 1],
            }}
            className="mt-2"
          >
            {children}
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}


