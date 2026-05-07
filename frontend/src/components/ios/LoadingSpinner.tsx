import { motion } from 'framer-motion';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  color?: 'blue' | 'gray' | 'white';
  className?: string;
}

export function LoadingSpinner({ 
  size = 'md', 
  color = 'blue',
  className = '' 
}: LoadingSpinnerProps) {
  const sizeStyles = {
    sm: 'w-4 h-4 border-2',
    md: 'w-8 h-8 border-3',
    lg: 'w-12 h-12 border-4',
  };

  const colorStyles = {
    blue: 'border-groovely-peach-500',
    gray: 'border-groovely-gray-500',
    white: 'border-white',
  };

  return (
    <div className={`flex items-center justify-center ${className}`}>
      <motion.div
        className={`${sizeStyles[size]} ${colorStyles[color]} border-t-transparent rounded-full`}
        animate={{ rotate: 360 }}
        transition={{
          duration: 1,
          repeat: Infinity,
          ease: 'linear',
        }}
      />
    </div>
  );
}

// Full screen loading overlay - Groovely themed
interface LoadingOverlayProps {
  message?: string;
  progress?: number;
  status?: string;
  showSpinner?: boolean;
}

export function LoadingOverlay({ message, progress, status, showSpinner = true }: LoadingOverlayProps) {
  const clampedProgress = typeof progress === 'number'
    ? Math.max(0, Math.min(100, progress))
    : undefined;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-groovely-dark-bg/95 backdrop-blur-md flex items-center justify-center z-50"
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-groovely-dark-surface/95 backdrop-blur-xl rounded-2xl p-8 shadow-2xl border border-groovely-dark-border min-w-[280px] max-w-[320px]"
      >
        <div className="flex flex-col items-center w-full">
          {showSpinner && (
            <LoadingSpinner size="lg" color="blue" className={clampedProgress !== undefined ? 'mb-6' : ''} />
          )}
          {message && (
            <div className="text-base font-medium text-white text-center leading-relaxed whitespace-pre-line">
              {message.split('\n').map((line, idx) => {
                if (line.trim() === '') return <br key={idx} />;
                const isBold = line.includes("You'll be automatically redirected") || line.includes("Please don't close");
                return (
                  <p key={idx} className={isBold ? "font-bold mt-2" : idx > 0 ? "mt-1" : ""}>
                    {line}
                  </p>
                );
              })}
            </div>
          )}
          {clampedProgress !== undefined && (
            <div className="w-full mt-6 space-y-2">
              <div className="flex items-center justify-between text-xs text-groovely-dark-text-tertiary">
                <span>{status || 'Working on it...'}</span>
                <span className="text-white font-semibold">{Math.round(clampedProgress)}%</span>
              </div>
              <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-gradient-to-r from-groovely-peach-500 via-groovely-orange-500 to-groovely-purple-500 shadow-lg shadow-groovely-peach-500/20"
                  initial={{ width: 0 }}
                  animate={{ width: `${clampedProgress}%` }}
                  transition={{ duration: 0.35, ease: 'easeOut' }}
                />
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}


