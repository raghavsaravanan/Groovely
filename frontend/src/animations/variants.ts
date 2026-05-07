import { Variants } from 'framer-motion';

// ============================================
// SYNCHRONIZED TIMING CONSTANTS
// ============================================
// All animations use these constants for seamless transitions
export const TIMING = {
  // Page transitions
  PAGE_ENTER_DURATION: 0.5,
  PAGE_EXIT_DURATION: 0.3,
  PAGE_MOUNT_DELAY: 0.1, // Delay before page content starts animating
  
  // Tab transitions
  TAB_TRANSITION_DURATION: 0.4,
  TAB_STAGGER_DELAY: 0.05,
  
  // Content animations
  CONTENT_DELAY: 0.15, // Delay after page mount before content appears
  STAGGER_CHILDREN: 0.05,
  STAGGER_DELAY: 0.05,
  
  // Easing curves (premium cinematic)
  EASE_PAGE: [0.16, 1, 0.3, 1] as [number, number, number, number], // Smooth ease-out
  EASE_CONTENT: [0.25, 0.1, 0.25, 1] as [number, number, number, number], // Premium ease-in-out
  EASE_EXIT: [0.4, 0, 0.2, 1] as [number, number, number, number], // Fast ease-out
} as const;

// ============================================
// PAGE TRANSITION VARIANTS
// ============================================
// Optimized for seamless page-to-page transitions
export const pageVariants: Variants = {
  initial: {
    opacity: 0,
    y: 16,
    scale: 0.98,
  },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: TIMING.PAGE_ENTER_DURATION,
      ease: TIMING.EASE_PAGE,
      delay: TIMING.PAGE_MOUNT_DELAY,
    },
  },
  exit: {
    opacity: 0,
    y: -16,
    scale: 0.98,
    transition: {
      duration: TIMING.PAGE_EXIT_DURATION,
      ease: TIMING.EASE_EXIT,
    },
  },
};

// Tab transition variants - synchronized with page transitions
export const tabContentVariants: Variants = {
  initial: {
    opacity: 0,
    y: 12,
    scale: 0.99,
  },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: TIMING.TAB_TRANSITION_DURATION,
      ease: TIMING.EASE_CONTENT,
      delay: TIMING.CONTENT_DELAY,
    },
  },
  exit: {
    opacity: 0,
    y: -12,
    scale: 0.99,
    transition: {
      duration: TIMING.PAGE_EXIT_DURATION,
      ease: TIMING.EASE_EXIT,
    },
  },
};

export const fadeVariants: Variants = {
  initial: { opacity: 0 },
  animate: { 
    opacity: 1,
    transition: { duration: 0.3 }
  },
  exit: { 
    opacity: 0,
    transition: { duration: 0.2 }
  },
};

export const scaleVariants: Variants = {
  initial: { opacity: 0, scale: 0.9 },
  animate: { 
    opacity: 1, 
    scale: 1,
    transition: {
      duration: 0.3,
      ease: [0.4, 0, 0.2, 1],
    }
  },
  exit: { 
    opacity: 0, 
    scale: 0.9,
    transition: { duration: 0.2 }
  },
};

export const slideUpVariants: Variants = {
  initial: { opacity: 0, y: 50 },
  animate: { 
    opacity: 1, 
    y: 0,
    transition: {
      duration: 0.4,
      ease: [0.4, 0, 0.2, 1],
    }
  },
  exit: { 
    opacity: 0, 
    y: 50,
    transition: { duration: 0.2 }
  },
};

export const slideDownVariants: Variants = {
  initial: { opacity: 0, y: -50 },
  animate: { 
    opacity: 1, 
    y: 0,
    transition: {
      duration: 0.4,
      ease: [0.4, 0, 0.2, 1],
    }
  },
  exit: { 
    opacity: 0, 
    y: -50,
    transition: { duration: 0.2 }
  },
};

// Card entrance animations
export const cardVariants: Variants = {
  initial: { opacity: 0, y: 20, scale: 0.95 },
  animate: { 
    opacity: 1, 
    y: 0, 
    scale: 1,
    transition: {
      duration: 0.4,
      ease: [0.4, 0, 0.2, 1],
    }
  },
};

// ============================================
// STAGGERED CHILDREN ANIMATIONS
// ============================================
// Synchronized with page timing for seamless reveals
export const staggerContainerVariants: Variants = {
  initial: {
    opacity: 0,
  },
  animate: {
    opacity: 1,
    transition: {
      staggerChildren: TIMING.STAGGER_CHILDREN,
      delayChildren: TIMING.STAGGER_DELAY + TIMING.CONTENT_DELAY,
      when: 'beforeChildren',
    },
  },
  exit: {
    opacity: 0,
    transition: {
      staggerChildren: TIMING.STAGGER_CHILDREN * 0.6,
      staggerDirection: -1,
      when: 'afterChildren',
    },
  },
};

export const staggerItemVariants: Variants = {
  initial: { 
    opacity: 0, 
    y: 12,
    scale: 0.98,
  },
  animate: { 
    opacity: 1, 
    y: 0,
    scale: 1,
    transition: {
      duration: 0.45,
      ease: TIMING.EASE_CONTENT,
    }
  },
  exit: {
    opacity: 0,
    y: -8,
    scale: 0.98,
    transition: {
      duration: TIMING.PAGE_EXIT_DURATION,
      ease: TIMING.EASE_EXIT,
    }
  },
};

// Button press animation
export const buttonPressVariants: Variants = {
  rest: { scale: 1 },
  pressed: { scale: 0.95 },
};

// Success/Error animations
export const successVariants: Variants = {
  initial: { scale: 0, opacity: 0 },
  animate: { 
    scale: [0, 1.2, 1], 
    opacity: 1,
    transition: {
      duration: 0.5,
      times: [0, 0.6, 1],
      ease: [0.68, -0.55, 0.265, 1.55],
    }
  },
  exit: {
    scale: 0.9,
    opacity: 0,
    transition: {
      duration: 0.2,
      ease: [0.4, 0, 0.2, 1],
    }
  },
};

export const errorShakeVariants: Variants = {
  shake: {
    x: [-10, 10, -10, 10, 0],
    transition: {
      duration: 0.4,
    },
  },
};

// Loading pulse animation
export const pulseVariants: Variants = {
  pulse: {
    scale: [1, 1.05, 1],
    opacity: [1, 0.8, 1],
    transition: {
      duration: 1.5,
      repeat: Infinity,
      ease: 'easeInOut',
    },
  },
};

// Floating animation (for decorative elements)
export const floatVariants: Variants = {
  float: {
    y: [0, -10, 0],
    transition: {
      duration: 3,
      repeat: Infinity,
      ease: 'easeInOut',
    },
  },
};

// Glow animation
export const glowVariants: Variants = {
  glow: {
    boxShadow: [
      '0 0 20px rgba(0, 122, 255, 0.3)',
      '0 0 40px rgba(0, 122, 255, 0.6)',
      '0 0 20px rgba(0, 122, 255, 0.3)',
    ],
    transition: {
      duration: 2,
      repeat: Infinity,
      ease: 'easeInOut',
    },
  },
};


