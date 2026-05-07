import { motion, AnimatePresence } from 'framer-motion';
import { ReactNode } from 'react';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

interface ActionSheetItem {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  destructive?: boolean;
  disabled?: boolean;
}

interface ActionSheetProps {
  isOpen: boolean;
  onClose: () => void;
  items: ActionSheetItem[];
  title?: string;
}

export function ActionSheet({ isOpen, onClose, items, title }: ActionSheetProps) {
  const handleItemClick = async (item: ActionSheetItem) => {
    if (item.disabled) return;
    
    try {
      await Haptics.impact({ style: ImpactStyle.Light });
    } catch (e) {
      // Haptics not available
    }
    
    item.onClick();
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
            onClick={onClose}
          />
          
          {/* Action Sheet */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ 
              type: 'spring', 
              damping: 30, 
              stiffness: 300 
            }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-groovely-dark-surface rounded-t-3xl shadow-2xl border-t border-groovely-dark-border safe-area-bottom max-w-lg mx-auto"
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-12 h-1 bg-groovely-dark-text-tertiary rounded-full" />
            </div>

            {/* Title */}
            {title && (
              <div className="px-6 py-3 border-b border-groovely-dark-border">
                <h3 className="text-lg font-semibold text-white font-heading text-center">{title}</h3>
              </div>
            )}

            {/* Items */}
            <div className="px-4 py-2">
              {items.map((item, index) => (
                <motion.button
                  key={index}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  onClick={() => handleItemClick(item)}
                  disabled={item.disabled}
                  className={`w-full flex items-center gap-3 px-4 py-4 rounded-xl transition-all duration-200 ${
                    item.destructive
                      ? 'text-red-500 hover:bg-red-500/10 active:bg-red-500/20'
                      : 'text-white hover:bg-groovely-dark-card active:bg-groovely-dark-card/80'
                  } ${item.disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {item.icon && (
                    <div className={`${item.destructive ? 'text-red-500' : 'text-groovely-peach-400'}`}>
                      {item.icon}
                    </div>
                  )}
                  <span className="flex-1 text-left font-medium">{item.label}</span>
                </motion.button>
              ))}
            </div>

            {/* Cancel Button */}
            <div className="px-4 pb-4 pt-2">
              <motion.button
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: items.length * 0.05 }}
                onClick={onClose}
                className="w-full flex items-center justify-center px-4 py-4 rounded-xl bg-groovely-dark-card text-white font-semibold hover:bg-groovely-dark-card/80 active:bg-groovely-dark-card/60 transition-all duration-200"
              >
                Cancel
              </motion.button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}


