import { motion } from 'framer-motion';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { ReactNode } from 'react';

interface ButtonProps {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  fullWidth?: boolean;
  loading?: boolean;
  className?: string;
  type?: 'button' | 'submit' | 'reset';
}

export function Button({
  children,
  onClick,
  variant = 'primary',
  size = 'md',
  disabled = false,
  fullWidth = false,
  loading = false,
  className = '',
  type = 'button',
}: ButtonProps) {
  const handleClick = async () => {
    if (disabled || loading) return;
    
    // Haptic feedback
    try {
      await Haptics.impact({ style: ImpactStyle.Light });
    } catch (e) {
      // Haptics not available (web)
    }
    
    onClick?.();
  };

  const baseStyles = 'relative overflow-hidden font-semibold transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]';
  
  const variantStyles = {
    primary: 'btn-gradient-smooth text-white shadow-lg hover:shadow-xl hover:shadow-groovely-pink-500/30 active:opacity-90',
    secondary: 'bg-groovely-dark-card text-white border border-groovely-dark-border shadow-md hover:border-groovely-peach-500/50 active:opacity-90',
    outline: 'bg-transparent border-2 border-groovely-peach-500 text-groovely-peach-500 hover:bg-groovely-peach-500/10 active:bg-groovely-peach-500/20 active:text-groovely-peach-400',
    ghost: 'bg-transparent text-groovely-peach-500 hover:bg-groovely-peach-500/10 active:bg-groovely-peach-500/20',
  };

  const sizeStyles = {
    sm: 'px-3 py-2 text-sm rounded-lg',
    md: 'px-6 py-3 text-base rounded-xl',
    lg: 'px-8 py-4 text-lg rounded-2xl',
  };

  const disabledStyles = disabled || loading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer';
  const widthStyles = fullWidth ? 'w-full' : '';

  return (
    <motion.button
      type={type}
      onClick={handleClick}
      disabled={disabled || loading}
      whileTap={{ scale: disabled || loading ? 1 : 0.97 }}
      whileHover={{ scale: disabled || loading ? 1 : 1.01, y: -1 }}
      transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
      className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${disabledStyles} ${widthStyles} ${className}`}
    >
      {/* Content wrapper to ensure text stays on top */}
      <span className="relative z-10 inline-flex items-center justify-center">
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <motion.span
              className="w-4 h-4 border-2 border-current border-t-transparent rounded-full"
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            />
            Loading...
          </span>
        ) : (
          children
        )}
      </span>
      
      {/* Subtle glow effect on hover - behind text */}
      <motion.span
        className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent opacity-0 pointer-events-none"
        whileHover={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
        style={{ zIndex: 0 }}
      />
    </motion.button>
  );
}


