import { motion } from 'framer-motion';

type VideoTypeBadgeProps = {
  type: 'model' | 'attempt';
};

export function VideoTypeBadge({ type }: VideoTypeBadgeProps) {
  const isModel = type === 'model';
  
  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.8, y: -8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      whileHover={{ scale: 1.05 }}
      className={`inline-flex items-center px-3 py-1.5 rounded-lg mb-2 backdrop-blur-md border shadow-lg ${
        isModel 
          ? 'border-groovely-peach-500/40' 
          : 'border-groovely-purple-500/40'
      }`}
      style={{
        background: isModel
          ? 'linear-gradient(135deg, rgba(255, 140, 90, 0.25) 0%, rgba(236, 72, 153, 0.25) 100%)'
          : 'linear-gradient(135deg, rgba(168, 85, 247, 0.25) 0%, rgba(236, 72, 153, 0.25) 100%)',
        boxShadow: isModel
          ? '0 4px 20px rgba(255, 140, 90, 0.4), 0 0 30px rgba(236, 72, 153, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
          : '0 4px 20px rgba(168, 85, 247, 0.4), 0 0 30px rgba(236, 72, 153, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
      }}
    >
      <span 
        className="text-xs font-heading font-bold tracking-widest uppercase"
        style={{
          background: isModel
            ? 'linear-gradient(135deg, #FF8C5A 0%, #EC4899 100%)'
            : 'linear-gradient(135deg, #A855F7 0%, #EC4899 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          letterSpacing: '0.15em',
        }}
      >
        {isModel ? 'MODEL' : 'ATTEMPT'}
      </span>
    </motion.div>
  );
}

