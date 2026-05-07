import { motion } from 'framer-motion';
import { useState } from 'react';

interface LogoProps {
  size?: number;
  animated?: boolean;
  className?: string;
  disableHover?: boolean;
}

export function Logo({ size = 40, animated = false, className = '', disableHover = false }: LogoProps) {
  const [isHovered, setIsHovered] = useState(false);

  // Cinematic easing curve - smooth and purposeful
  const cinematicEase = [0.25, 0.1, 0.25, 1];

  // Initial entrance animation
  const initialAnimation = animated
    ? {
        scale: 0,
        rotate: -180,
        opacity: 0,
      }
    : undefined;

  // Determine animation props based on state
  const getAnimateProps = () => {
    if (animated) {
      return {
        scale: 1,
        rotate: 0,
        opacity: 1,
      };
    }
    return {};
  };

  // Subtle outline glow effect - multiple drop-shadows for edge glow
  const getGlowFilter = () => {
    if (disableHover) {
      return 'drop-shadow(0 2px 4px rgba(255, 149, 0, 0.2))';
    }
    if (isHovered) {
      // Multiple layered shadows to create subtle outline glow
      return 'drop-shadow(0 0 2px rgba(255, 149, 0, 0.6)) drop-shadow(0 0 4px rgba(255, 149, 0, 0.4)) drop-shadow(0 0 8px rgba(236, 72, 153, 0.3)) drop-shadow(0 0 12px rgba(168, 85, 247, 0.2))';
    }
    return 'drop-shadow(0 2px 4px rgba(255, 149, 0, 0.2))';
  };

  return (
    <motion.div
      className={`relative inline-block ${className}`}
      onMouseEnter={disableHover ? undefined : () => setIsHovered(true)}
      onMouseLeave={disableHover ? undefined : () => setIsHovered(false)}
      initial={initialAnimation}
      animate={getAnimateProps()}
      transition={animated ? { type: 'spring' as const, stiffness: 200, damping: 20 } : { duration: 0.4, ease: cinematicEase as [number, number, number, number] }}
    >
      {/* Main logo image with subtle outline glow */}
      <motion.img
        src="/logo.png"
        alt="Groovely Logo"
        width={size}
        height={size}
        className="relative z-10 select-none"
        style={{
          filter: getGlowFilter(),
          imageRendering: 'crisp-edges',
        }}
        animate={{
          filter: getGlowFilter(),
        }}
        transition={{ duration: 0.4, ease: cinematicEase as [number, number, number, number] }}
        onError={() => {
          // Fallback if image not found
          console.warn('Logo image not found at /logo.png. Please place the logo file in the public folder.');
        }}
      />
      
      {/* Animated glow effect behind logo (only for entrance animation) */}
      {animated && (
        <motion.div
          className="absolute inset-0 rounded-full blur-xl pointer-events-none"
          style={{
            background: 'radial-gradient(circle, rgba(255, 149, 0, 0.4) 0%, rgba(175, 82, 222, 0.2) 50%, transparent 70%)',
            width: size * 1.5,
            height: size * 1.5,
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
          }}
          initial={{ scale: 0, opacity: 0 }}
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.6, 0.8, 0.6],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      )}
    </motion.div>
  );
}

export function LogoWithText({ size = 40, animated = false }: LogoProps) {
  return (
    <div className="flex items-center gap-3">
      <Logo size={size} animated={animated} />
      <motion.div
        initial={animated ? { opacity: 0, x: -20 } : undefined}
        animate={animated ? { opacity: 1, x: 0 } : undefined}
        transition={animated ? { delay: 0.8, duration: 0.5 } : undefined}
      >
        <h1 className="text-2xl font-bold bg-gradient-to-r from-groovely-peach-500 via-groovely-pink-500 to-groovely-purple-500 bg-clip-text text-transparent">
          Groovely
        </h1>
        <p className="text-xs text-groovely-dark-text-tertiary font-medium tracking-wide">MOVE DIFFERENT</p>
      </motion.div>
    </div>
  );
}

