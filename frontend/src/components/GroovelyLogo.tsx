import { motion } from 'framer-motion';

interface GroovelyLogoProps {
  size?: number;
  animated?: boolean;
  className?: string;
}

export function GroovelyLogo({ size = 48, animated = true, className = '' }: GroovelyLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <motion.g
        initial={animated ? { scale: 0, rotate: -180 } : {}}
        animate={animated ? { scale: 1, rotate: 0 } : {}}
        transition={{ type: 'spring', stiffness: 200, damping: 15 }}
      >
        {/* Outer Ring - Movement */}
        <motion.circle
          cx="50"
          cy="50"
          r="45"
          stroke="url(#gradient1)"
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
          strokeDasharray="283"
          strokeDashoffset={animated ? 283 : 0}
          animate={animated ? { strokeDashoffset: [283, 0] } : {}}
          transition={{ duration: 1.5, delay: 0.2 }}
        />

        {/* Dynamic G Shape - Represents "Groovely" */}
        <motion.path
          d="M 50 20 
             Q 70 20, 75 35
             Q 80 50, 75 65
             Q 70 80, 50 80
             L 50 50
             L 65 50"
          stroke="url(#gradient2)"
          strokeWidth="6"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={animated ? { pathLength: 0 } : {}}
          animate={animated ? { pathLength: 1 } : {}}
          transition={{ duration: 1, delay: 0.5 }}
        />

        {/* Center Dot - Energy Point */}
        <motion.circle
          cx="50"
          cy="50"
          r="8"
          fill="url(#gradient3)"
          initial={animated ? { scale: 0 } : {}}
          animate={animated ? { scale: 1 } : {}}
          transition={{ type: 'spring', stiffness: 400, delay: 1 }}
        />

        {/* Motion Trails - Represents Dance Movement */}
        <motion.path
          d="M 30 30 Q 35 25, 40 30"
          stroke="url(#gradient4)"
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
          opacity="0.6"
          initial={animated ? { pathLength: 0, opacity: 0 } : {}}
          animate={animated ? { pathLength: 1, opacity: 0.6 } : {}}
          transition={{ duration: 0.8, delay: 1.2 }}
        />
        <motion.path
          d="M 60 70 Q 65 75, 70 70"
          stroke="url(#gradient4)"
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
          opacity="0.6"
          initial={animated ? { pathLength: 0, opacity: 0 } : {}}
          animate={animated ? { pathLength: 1, opacity: 0.6 } : {}}
          transition={{ duration: 0.8, delay: 1.3 }}
        />
      </motion.g>

      {/* Gradients */}
      <defs>
        <linearGradient id="gradient1" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#007AFF" />
          <stop offset="100%" stopColor="#AF52DE" />
        </linearGradient>
        <linearGradient id="gradient2" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#007AFF" />
          <stop offset="50%" stopColor="#5E5CE6" />
          <stop offset="100%" stopColor="#AF52DE" />
        </linearGradient>
        <radialGradient id="gradient3" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="50%" stopColor="#007AFF" />
          <stop offset="100%" stopColor="#5E5CE6" />
        </radialGradient>
        <linearGradient id="gradient4" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#007AFF" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#AF52DE" stopOpacity="0.8" />
        </linearGradient>
      </defs>
    </svg>
  );
}

// Logo with Text
interface GroovelyLogoWithTextProps {
  size?: 'sm' | 'md' | 'lg';
  animated?: boolean;
  className?: string;
}

export function GroovelyLogoWithText({ 
  size = 'md', 
  animated = true,
  className = '' 
}: GroovelyLogoWithTextProps) {
  const sizes = {
    sm: { logo: 32, text: 'text-xl' },
    md: { logo: 48, text: 'text-3xl' },
    lg: { logo: 64, text: 'text-5xl' },
  };

  const currentSize = sizes[size];

  return (
    <motion.div
      className={`flex items-center gap-3 ${className}`}
      initial={animated ? { opacity: 0, y: -20 } : {}}
      animate={animated ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6 }}
    >
      <GroovelyLogo size={currentSize.logo} animated={animated} />
      <div>
        <motion.h1
          className={`${currentSize.text} font-bold bg-gradient-to-r from-ios-blue-500 via-ios-purple-500 to-ios-blue-600 bg-clip-text text-transparent`}
          initial={animated ? { opacity: 0, x: -20 } : {}}
          animate={animated ? { opacity: 1, x: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          Groovely
        </motion.h1>
        <motion.p
          className="text-ios-caption-1 text-ios-gray-600 font-medium tracking-wide"
          initial={animated ? { opacity: 0 } : {}}
          animate={animated ? { opacity: 1 } : {}}
          transition={{ duration: 0.6, delay: 0.4 }}
        >
          Move Different
        </motion.p>
      </div>
    </motion.div>
  );
}

