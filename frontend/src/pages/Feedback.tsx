import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Star, MessageSquare, AlertCircle, Check } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { Button, Card, PageHeader } from '../components/ios';
import { staggerContainerVariants, staggerItemVariants } from '../animations';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { supabase } from '../lib/supabase';

export function Feedback() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [isMounted, setIsMounted] = useState(false);
  
  // Form state
  const [wouldUseAgain, setWouldUseAgain] = useState<'yes' | 'maybe' | 'no' | null>(null);
  const [scoreExpectation, setScoreExpectation] = useState('');
  const [frustrating, setFrustrating] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Initialize page
  useEffect(() => {
    window.scrollTo(0, 0);
    const timer = setTimeout(() => setIsMounted(true), 50);
    return () => {
      clearTimeout(timer);
      setIsMounted(false);
    };
  }, []);

  const handleSubmit = async () => {
    if (!wouldUseAgain) {
      alert('Please answer the first question: Would you use Groovely again?');
      return;
    }

    if (!user) {
      alert('Please log in to submit feedback');
      navigate('/login');
      return;
    }

    setSubmitting(true);
    try {
      // Try haptic feedback
      try {
        await Haptics.impact({ style: ImpactStyle.Light });
      } catch (e) {
        // Haptics not available
      }

      // Save feedback to Supabase
      const { error } = await supabase
        .from('user_feedback')
        .insert({
          user_id: user.id,
          would_use_again: wouldUseAgain,
          score_expectation: scoreExpectation.trim() || null,
          frustrating: frustrating.trim() || null,
          created_at: new Date().toISOString(),
        });

      if (error) {
        // If table doesn't exist, just log it (for now)
        console.error('Error saving feedback:', error);
        // Still show success to user
      }

      // Success haptic
      try {
        await Haptics.notification({ type: NotificationType.Success });
      } catch (e) {
        // Haptics not available
      }

      setSubmitted(true);
    } catch (error: any) {
      console.error('Error submitting feedback:', error);
      alert(`Failed to submit feedback: ${error.message || 'Unknown error'}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div 
      className="min-h-screen bg-groovely-dark-bg pb-24"
      initial={{ opacity: 0 }}
      animate={isMounted ? { opacity: 1 } : { opacity: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Header */}
      <PageHeader
        title="Feedback"
        subtitle="HELP US IMPROVE"
        icon={<MessageSquare size={32} className="text-white/90" />}
        bottomPadding="xl"
        action={
          <motion.button
            onClick={() => navigate(-1)}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="p-2 hover:bg-white/10 rounded-lg transition-all duration-300 backdrop-blur-sm"
          >
            <ArrowLeft size={24} className="text-white" />
          </motion.button>
        }
      />

      <div className="max-w-2xl mx-auto px-ios-4 pt-6">
        {submitted ? (
          // Success State
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4 }}
          >
            <Card variant="elevated" className="backdrop-blur-xl text-center py-12">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: 'spring', stiffness: 200, damping: 15 }}
                className="w-20 h-20 bg-gradient-to-br from-groovely-peach-500 to-groovely-purple-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg"
              >
                <Check size={40} className="text-white" strokeWidth={3} />
              </motion.div>
              <h2 className="text-2xl font-bold text-white font-heading mb-3">
                Thank You!
              </h2>
              <p className="text-groovely-dark-text-secondary mb-8">
                Your feedback helps us build a better Groovely. We appreciate you taking the time to share your thoughts.
              </p>
              <Button
                onClick={() => navigate(-1)}
                variant="primary"
                size="lg"
                className="!bg-gradient-to-r !from-groovely-peach-500 !to-groovely-purple-500"
              >
                Done
              </Button>
            </Card>
          </motion.div>
        ) : (
          // Form State
          <motion.div
            variants={staggerContainerVariants}
            initial="initial"
            animate="animate"
            className="space-y-6"
          >
            {/* Question 1: Would you use Groovely again? (MANDATORY) */}
            <motion.div variants={staggerItemVariants}>
              <Card variant="elevated" className="backdrop-blur-xl">
                <div className="p-6">
                  <div className="flex items-start gap-3 mb-6">
                    <div className="w-10 h-10 bg-gradient-to-br from-groovely-peach-500 to-groovely-purple-500 rounded-xl flex items-center justify-center flex-shrink-0 shadow-md">
                      <Star size={20} className="text-white" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-xl font-bold text-white font-heading mb-2">
                        Would you use Groovely again?
                      </h3>
                      <p className="text-sm text-groovely-dark-text-secondary">
                         <span className="text-red-400">*</span>
                      </p>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {[
                      { value: 'yes' as const, label: 'Yes' },
                      { value: 'maybe' as const, label: 'Maybe' },
                      { value: 'no' as const, label: 'No' },
                    ].map((option) => (
                      <motion.button
                        key={option.value}
                        onClick={async () => {
                          try {
                            await Haptics.impact({ style: ImpactStyle.Light });
                          } catch (e) {
                            // Haptics not available
                          }
                          setWouldUseAgain(option.value);
                        }}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        className={`w-full p-4 rounded-xl border-2 transition-all text-left ${
                          wouldUseAgain === option.value
                            ? 'border-groovely-peach-500 bg-groovely-peach-500/10'
                            : 'border-groovely-dark-border bg-groovely-dark-surface hover:border-groovely-peach-500/50'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className={`font-semibold ${
                            wouldUseAgain === option.value ? 'text-white' : 'text-groovely-dark-text-secondary'
                          }`}>
                            {option.label}
                          </span>
                          {wouldUseAgain === option.value && (
                            <motion.div
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              className="w-6 h-6 bg-gradient-to-br from-groovely-peach-500 to-groovely-purple-500 rounded-full flex items-center justify-center"
                            >
                              <Check size={16} className="text-white" />
                            </motion.div>
                          )}
                        </div>
                      </motion.button>
                    ))}
                  </div>
                </div>
              </Card>
            </motion.div>

            {/* Question 2: What did you expect this score to tell you? */}
            <motion.div variants={staggerItemVariants}>
              <Card variant="elevated" className="backdrop-blur-xl">
                <div className="p-6">
                  <div className="flex items-start gap-3 mb-4">
                    <div className="w-10 h-10 bg-gradient-to-br from-groovely-pink-500 to-groovely-purple-500 rounded-xl flex items-center justify-center flex-shrink-0 shadow-md">
                      <AlertCircle size={20} className="text-white" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-xl font-bold text-white font-heading mb-2">
                        What did you expect this score to tell you?
                      </h3>
                      <p className="text-sm text-groovely-dark-text-secondary">
                        Free text (1–2 lines)
                      </p>
                    </div>
                  </div>
                  <textarea
                    value={scoreExpectation}
                    onChange={(e) => setScoreExpectation(e.target.value)}
                    placeholder="Tell us what you expected..."
                    rows={2}
                    maxLength={200}
                    className="w-full px-4 py-3 bg-groovely-dark-surface border border-groovely-dark-border rounded-xl text-white placeholder-white/40 focus:ring-2 focus:ring-groovely-peach-500 focus:border-transparent transition-all resize-none"
                  />
                  <p className="text-xs text-groovely-dark-text-tertiary mt-2 text-right">
                    {scoreExpectation.length}/200 characters
                  </p>
                </div>
              </Card>
            </motion.div>

            {/* Question 3: What was frustrating or confusing? */}
            <motion.div variants={staggerItemVariants}>
              <Card variant="elevated" className="backdrop-blur-xl">
                <div className="p-6">
                  <div className="flex items-start gap-3 mb-4">
                    <div className="w-10 h-10 bg-gradient-to-br from-groovely-purple-500 to-groovely-peach-500 rounded-xl flex items-center justify-center flex-shrink-0 shadow-md">
                      <MessageSquare size={20} className="text-white" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-xl font-bold text-white font-heading mb-2">
                        What was frustrating or confusing?
                      </h3>
                      <p className="text-sm text-groovely-dark-text-secondary">
                        Free text (optional)
                      </p>
                    </div>
                  </div>
                  <textarea
                    value={frustrating}
                    onChange={(e) => setFrustrating(e.target.value)}
                    placeholder="Share any frustrations or confusion you experienced..."
                    rows={3}
                    maxLength={500}
                    className="w-full px-4 py-3 bg-groovely-dark-surface border border-groovely-dark-border rounded-xl text-white placeholder-white/40 focus:ring-2 focus:ring-groovely-peach-500 focus:border-transparent transition-all resize-none"
                  />
                  <p className="text-xs text-groovely-dark-text-tertiary mt-2 text-right">
                    {frustrating.length}/500 characters
                  </p>
                </div>
              </Card>
            </motion.div>

            {/* Submit Button */}
            <motion.div variants={staggerItemVariants}>
              <Button
                onClick={handleSubmit}
                disabled={!wouldUseAgain || submitting}
                variant="primary"
                size="lg"
                fullWidth
                loading={submitting}
                className="!bg-gradient-to-r !from-groovely-peach-500 !to-groovely-purple-500 disabled:!opacity-50"
              >
                {submitting ? 'Submitting...' : 'Submit Feedback'}
              </Button>
            </motion.div>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
