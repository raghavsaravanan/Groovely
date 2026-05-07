import { Eye } from 'lucide-react';
import { motion } from 'framer-motion';

interface ViewCountProps {
  count: number;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
  className?: string;
}

export function ViewCount({ count, size = 'md', showIcon = true, className = '' }: ViewCountProps) {
  const formattedCount = count > 0 ? count.toLocaleString() : '0';
  
  const sizeClasses = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base',
  };

  const iconSizes = {
    sm: 12,
    md: 14,
    lg: 16,
  };

  return (
    <motion.div
      className={`flex items-center gap-1.5 ${sizeClasses[size]} ${className}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      {showIcon && (
        <Eye 
          size={iconSizes[size]} 
          className="text-current opacity-70 flex-shrink-0" 
        />
      )}
      <span className="font-medium">{formattedCount}</span>
    </motion.div>
  );
}

