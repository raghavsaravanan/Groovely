import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Star, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from './ios';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

interface RatingPopupProps {
  isOpen: boolean;
  onClose: () => void;
  onRatingSubmit: (rating: number) => void;
}

export function RatingPopup({ isOpen, onClose, onRatingSubmit }: RatingPopupProps) {
  const navigate = useNavigate();
  const [rating, setRating] = useState<number>(0);
  const [hoveredRating, setHoveredRating] = useState<number>(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Reset state when popup opens
  useEffect(() => {
    if (isOpen) {
      setRating(0);
      setHoveredRating(0);
      setSubmitting(false);
      setSubmitted(false);
    }
  }, [isOpen]);

  const handleStarClick = async (value: number) => {
    try {
      await Haptics.impact({ style: ImpactStyle.Light });
    } catch (e) {
      // Haptics not available
    }
    setRating(value);
  };

  const handleSubmit = async () => {
    if (rating === 0) return;

    setSubmitting(true);
    try {
      // Haptic feedback
      try {
        await Haptics.notification({ type: NotificationType.Success });
      } catch (e) {
        // Haptics not available
      }

      // Submit rating
      onRatingSubmit(rating);
      setSubmitted(true);

      // Close after a short delay
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (error) {
      console.error('Error submitting rating:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleFeedback = () => {
    onClose();
    navigate('/feedback');
  };

  if (!isOpen) return null;

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
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100]"
            onClick={onClose}
          />

          {/* Popup */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="fixed inset-0 z-[101] flex items-center justify-center p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-groovely-dark-card border border-groovely-dark-border rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
              {submitted ? (
                // Success State
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="p-8 text-center"
                >
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.2, type: 'spring', stiffness: 200, damping: 15 }}
                    className="w-16 h-16 bg-gradient-to-br from-groovely-peach-500 to-groovely-purple-500 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg"
                  >
                    <Star size={32} className="text-white fill-white" />
                  </motion.div>
                  <h3 className="text-xl font-bold text-white font-heading mb-2">
                    Thank You!
                  </h3>
                  <p className="text-groovely-dark-text-secondary">
                    Your feedback helps us improve.
                  </p>
                </motion.div>
              ) : (
                // Rating Form
                <>
                  {/* Header */}
                  <div className="p-6 pb-4">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <h3 className="text-2xl font-bold text-white font-heading mb-2">
                          Rate Your Experience
                        </h3>
                        <p className="text-groovely-dark-text-secondary">
                          How would you rate Groovely so far?
                        </p>
                      </div>
                      <button
                        onClick={onClose}
                        className="flex-shrink-0 p-2 hover:bg-groovely-dark-surface rounded-lg transition-colors text-groovely-dark-text-secondary hover:text-white"
                      >
                        <X size={20} />
                      </button>
                    </div>

                    {/* Star Rating */}
                    <div className="flex justify-center gap-2 mb-6 py-4">
                      {[1, 2, 3, 4, 5].map((value) => (
                        <motion.button
                          key={value}
                          onClick={() => handleStarClick(value)}
                          onMouseEnter={() => setHoveredRating(value)}
                          onMouseLeave={() => setHoveredRating(0)}
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: 0.95 }}
                          className="focus:outline-none"
                        >
                          <Star
                            size={40}
                            className={`transition-all duration-200 ${
                              (hoveredRating >= value || rating >= value)
                                ? 'text-groovely-peach-400 fill-groovely-peach-400'
                                : 'text-groovely-dark-border hover:text-groovely-peach-400/50'
                            }`}
                          />
                        </motion.button>
                      ))}
                    </div>

                    {rating > 0 && (
                      <motion.p
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-center text-sm text-groovely-peach-400 font-semibold mb-4"
                      >
                        {rating === 5 && "Excellent! We're thrilled you love it!"}
                        {rating === 4 && "Great! We're glad you like it!"}
                        {rating === 3 && "Good! Help us make it better."}
                        {rating === 2 && "We appreciate your feedback!"}
                        {rating === 1 && "We'd love to hear more about how we can improve."}
                      </motion.p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="p-6 pt-0 flex gap-3 border-t border-groovely-dark-border">
                    {rating > 0 && rating < 4 && (
                      <Button
                        onClick={handleFeedback}
                        variant="outline"
                        size="md"
                        className="!border-groovely-dark-border !text-groovely-dark-text-secondary hover:!bg-groovely-dark-surface"
                      >
                        Share Feedback
                      </Button>
                    )}
                    {rating === 0 ? (
                      <Button
                        onClick={onClose}
                        disabled={submitting}
                        variant="outline"
                        size="md"
                        fullWidth
                        className="!border-groovely-dark-border !text-groovely-dark-text-secondary hover:!bg-groovely-dark-surface disabled:!opacity-50"
                      >
                        Maybe Later
                      </Button>
                    ) : (
                      <Button
                        onClick={handleSubmit}
                        disabled={submitting}
                        variant="primary"
                        size="md"
                        fullWidth={rating >= 4}
                        loading={submitting}
                        className="!bg-gradient-to-r !from-groovely-peach-500 !to-groovely-purple-500 disabled:!opacity-50"
                      >
                        Submit
                      </Button>
                    )}
                  </div>
                </>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
