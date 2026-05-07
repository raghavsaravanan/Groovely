import { useCallback } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Send } from 'lucide-react';
import { Button } from './ios';

type CommentComposerProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  disabled?: boolean;
  isSubmitting?: boolean;
  userAvatarUrl?: string | null;
  userInitial?: string | null;
  authMessage?: string;
  onAuthAction?: () => void;
  className?: string;
};

export function CommentComposer({
  value,
  onChange,
  onSubmit,
  placeholder = 'Leave a comment…',
  disabled = false,
  isSubmitting = false,
  userAvatarUrl,
  userInitial,
  authMessage,
  onAuthAction,
  className = '',
}: CommentComposerProps) {
  const hasContent = value.trim().length > 0;
  const canSend = !disabled && !isSubmitting && hasContent;
  const showAuthCta = disabled && !!authMessage && !!onAuthAction;

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        if (canSend) {
          onSubmit();
        } else if (showAuthCta) {
          onAuthAction?.();
        }
      }
    },
    [canSend, onSubmit, showAuthCta, onAuthAction],
  );

  const renderAvatar = () => {
    if (userAvatarUrl) {
      return (
        <img
          src={userAvatarUrl}
          alt="Your avatar"
          className="w-full h-full object-cover"
        />
      );
    }
    const fallbackInitial = (userInitial || 'You').slice(0, 1).toUpperCase();
    return (
      <span className="text-white font-heading font-bold text-lg">
        {fallbackInitial}
      </span>
    );
  };

  return (
    <div className={`flex gap-3 ${className}`}>
      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-groovely-purple-500 via-groovely-pink-500 to-groovely-peach-500 flex items-center justify-center overflow-hidden flex-shrink-0 border border-white/20">
        {renderAvatar()}
      </div>
      <div className="flex-1 space-y-3">
        <motion.div
          initial={{ opacity: 0.9, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.2 }}
          className={`relative rounded-2xl border px-4 py-2.5 bg-groovely-dark-surface/80 text-white focus-within:ring-2 focus-within:ring-groovely-pink-500 transition-all ${
            disabled
              ? 'border-white/10 opacity-70'
              : 'border-groovely-dark-border/80'
          }`}
        >
          <textarea
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="w-full bg-transparent resize-none outline-none text-sm leading-relaxed placeholder-white/40 font-body pr-12"
            rows={2}
            disabled={disabled}
          />
          <motion.button
            type="button"
            onClick={disabled ? onAuthAction : onSubmit}
            whileHover={{ scale: canSend || showAuthCta ? 1.05 : 1 }}
            whileTap={{ scale: canSend || showAuthCta ? 0.95 : 1 }}
            className={`absolute bottom-2 right-2 h-10 w-10 rounded-2xl flex items-center justify-center transition-all ${
              canSend
                ? 'btn-gradient-smooth text-white shadow-lg shadow-groovely-pink-500/30'
                : showAuthCta
                ? 'bg-white/15 text-white border border-white/20 cursor-pointer'
                : 'bg-white/5 text-white/40 border border-white/10 cursor-not-allowed'
            }`}
            disabled={!canSend && !showAuthCta}
            aria-label={showAuthCta ? 'Sign in to comment' : 'Send comment'}
          >
            <Send size={18} />
          </motion.button>
        </motion.div>

        <div className="flex items-center justify-between text-xs text-white/60">
          {authMessage ? (
            <button
              type="button"
              onClick={onAuthAction}
              className="inline-flex items-center gap-1 text-groovely-peach-300 hover:text-white transition-colors"
            >
              <ArrowRight size={14} />
              {authMessage}
            </button>
          ) : (
            <span className="hidden sm:block">Press Enter to send • Shift + Enter for a new line</span>
          )}
          {!authMessage && (
            <span className="ml-auto text-white/40">Press Enter to send • Shift + Enter for newline</span>
          )}
        </div>
      </div>
    </div>
  );
}


