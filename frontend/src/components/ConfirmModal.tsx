import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, X } from 'lucide-react';
import { Button } from './ios';

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'default' | 'destructive';
}

export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'default',
}: ConfirmModalProps) {
  const handleConfirm = () => {
    onConfirm();
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
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            onClick={onClose}
          />
          
          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-groovely-dark-surface border border-groovely-dark-border rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
              {/* Header */}
              <div className="p-6 pb-4">
                <div className="flex items-start gap-4">
                  <div className={`flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center ${
                    variant === 'destructive' 
                      ? 'bg-red-500/20 text-red-400' 
                      : 'bg-groovely-peach-500/20 text-groovely-peach-400'
                  }`}>
                    <AlertTriangle size={24} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-xl font-bold text-white font-heading mb-2">
                      {title}
                    </h3>
                    <p className="text-base text-groovely-dark-text-secondary leading-relaxed">
                      {message}
                    </p>
                  </div>
                  <button
                    onClick={onClose}
                    className="flex-shrink-0 p-2 hover:bg-groovely-dark-card rounded-lg transition-colors text-groovely-dark-text-secondary hover:text-white"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>

              {/* Actions */}
              <div className="p-6 pt-4 flex gap-3 border-t border-groovely-dark-border">
                <Button
                  onClick={onClose}
                  variant="outline"
                  size="md"
                  fullWidth
                  className="!border-groovely-dark-border !text-groovely-dark-text-secondary hover:!bg-groovely-dark-card"
                >
                  {cancelText}
                </Button>
                <Button
                  onClick={handleConfirm}
                  variant="primary"
                  size="md"
                  fullWidth
                  className={variant === 'destructive' 
                    ? '!bg-gradient-to-r !from-red-500 !to-red-600 hover:!shadow-red-500/30' 
                    : '!bg-gradient-to-r !from-groovely-peach-500 !to-groovely-purple-500 hover:!shadow-groovely-peach-500/30'
                  }
                >
                  {confirmText}
                </Button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

