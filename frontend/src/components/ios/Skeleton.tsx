import { motion } from 'framer-motion';

interface SkeletonProps {
  width?: string;
  height?: string;
  circle?: boolean;
  className?: string;
}

export function Skeleton({ 
  width = 'w-full', 
  height = 'h-4', 
  circle = false,
  className = '' 
}: SkeletonProps) {
  return (
    <motion.div
      className={`${width} ${height} ${circle ? 'rounded-full' : 'rounded-ios-md'} bg-gradient-to-r from-ios-gray-200 via-ios-gray-100 to-ios-gray-200 ${className}`}
      animate={{
        backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'],
      }}
      transition={{
        duration: 1.5,
        repeat: Infinity,
        ease: 'linear',
      }}
      style={{
        backgroundSize: '200% 100%',
      }}
    />
  );
}

// Preset skeleton components
export function SkeletonCard() {
  return (
    <div className="bg-white rounded-ios-2xl p-ios-6 shadow-ios-md">
      <Skeleton height="h-48" className="mb-ios-4" />
      <Skeleton width="w-3/4" height="h-6" className="mb-ios-2" />
      <Skeleton width="w-full" height="h-4" className="mb-ios-2" />
      <Skeleton width="w-2/3" height="h-4" />
    </div>
  );
}

export function SkeletonAvatar({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizeClasses = {
    sm: 'w-10 h-10',
    md: 'w-16 h-16',
    lg: 'w-24 h-24',
  };
  
  return <Skeleton width={sizeClasses[size]} height={sizeClasses[size]} circle />;
}

export function SkeletonText({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-ios-2">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton 
          key={i} 
          width={i === lines - 1 ? 'w-3/4' : 'w-full'} 
          height="h-4" 
        />
      ))}
    </div>
  );
}


