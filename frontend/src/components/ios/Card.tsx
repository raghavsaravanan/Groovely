import { motion } from 'framer-motion';
import { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
  variant?: 'default' | 'glass' | 'elevated' | 'outline';
  hoverable?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

export function Card({
  children,
  onClick,
  className = '',
  variant = 'default',
  hoverable = false,
  padding = 'md',
}: CardProps) {
  const baseStyles = 'rounded-2xl transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]';
  
  const variantStyles = {
    default: 'bg-groovely-dark-card border border-groovely-dark-border shadow-lg',
    glass: 'bg-groovely-dark-card/80 backdrop-blur-xl border border-groovely-dark-border/50 shadow-xl',
    elevated: 'bg-groovely-dark-card border border-groovely-dark-border shadow-2xl',
    outline: 'bg-transparent border-2 border-groovely-dark-border',
  };

  const paddingStyles = {
    none: '',
    sm: 'p-3',
    md: 'p-6',
    lg: 'p-8',
  };

  const interactiveStyles = onClick || hoverable
    ? 'cursor-pointer hover:shadow-xl hover:border-groovely-peach-500/50 active:scale-98'
    : '';

  return (
    <motion.div
      onClick={onClick}
      className={`${baseStyles} ${variantStyles[variant]} ${paddingStyles[padding]} ${interactiveStyles} ${className}`}
      whileHover={hoverable ? { scale: 1.02, y: -2 } : undefined}
      whileTap={onClick ? { scale: 0.98 } : undefined}
      transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
    >
      {children}
    </motion.div>
  );
}


