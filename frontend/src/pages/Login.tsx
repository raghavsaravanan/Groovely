import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '../components/ios';
import { errorShakeVariants, successVariants } from '../animations';
import { Mail, Lock, Sparkles, CheckCircle2 } from 'lucide-react';
import { Logo } from '../components/Logo';
import { supabase } from '../lib/supabase';

type AuthMode = 'signin' | 'signup' | 'forgot';

export function Login() {
  const [mode, setMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const navigate = useNavigate();
  const { signIn, signUp, requestPasswordReset } = useAuth();

  const isSignUp = mode === 'signup';
  const isForgot = mode === 'forgot';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isForgot) {
        const { error } = await requestPasswordReset(email);
        if (error) {
          setError(error.message);
        } else {
          setShowSuccess(true);
          setTimeout(() => {
            setShowSuccess(false);
            setMode('signin');
          }, 1500);
        }
      } else if (isSignUp) {
        const { error } = await signUp(email, password);
        if (error) {
          setError(error.message);
        } else {
          setShowSuccess(true);
          setTimeout(() => navigate('/create-profile'), 1000);
        }
      } else {
        const { error } = await signIn(email, password);
        if (error) {
          setError(error.message);
        } else {
          setShowSuccess(true);
          // After sign-in, check if profile exists in database
          // Wait a bit for auth state to update, then check profile
          setTimeout(async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
              // Check if profile exists in database
              const { data: profileData } = await supabase
                .from('profiles')
                .select('id')
                .eq('id', user.id)
                .maybeSingle();
              
              if (profileData) {
                // Profile exists - go to video feed
                navigate('/feed');
              } else {
                // No profile - go to create profile
                navigate('/create-profile');
              }
            } else {
              // Fallback: if user not found, go to create profile
              navigate('/create-profile');
            }
          }, 1000);
        }
      }
    } catch (err) {
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden bg-groovely-dark-bg">
      {/* Subtle gradient mesh - Groovely palette */}
      <div className="absolute inset-0">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-groovely-peach-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-groovely-purple-500/10 rounded-full blur-3xl" />
      </div>

      <div className="relative min-h-screen flex items-center justify-center px-6 py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="w-full max-w-md"
        >
          {/* Logo and Header */}
          <motion.div
            className="text-center mb-ios-8"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <div className="flex justify-center mb-ios-4">
              <Logo size={60} animated />
            </div>
            <h1 className="text-4xl font-bold text-white font-heading mb-2">Groovely</h1>
            <p className="font-subtext text-white/70">
              {isForgot
                ? 'RESET YOUR PASSWORD TO KEEP DANCING'
                : isSignUp
                  ? 'CREATE YOUR ACCOUNT TO MOVE DIFFERENT'
                  : 'WELCOME BACK, DANCER'}
            </p>
          </motion.div>

          {/* Auth Card - Matching Home page style */}
          <motion.div
            variants={error ? errorShakeVariants : undefined}
            animate={error ? 'shake' : undefined}
            className="bg-groovely-dark-card rounded-3xl p-8 shadow-2xl border border-groovely-dark-border relative overflow-hidden"
          >
            {/* subtle corner glow */}
            <div className="pointer-events-none absolute -top-24 -left-24 w-72 h-72 rounded-full bg-groovely-peach-500/10 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-24 -right-24 w-72 h-72 rounded-full bg-groovely-purple-500/10 blur-3xl" />
            {/* Error Message */}
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mb-6 p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl font-medium"
                >
                  {error}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Success Animation */}
            <AnimatePresence>
              {showSuccess && (
                <motion.div
                  variants={successVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  className="absolute inset-0 flex items-center justify-center bg-groovely-dark-card rounded-3xl z-10"
                >
                  <div className="text-center">
                    <motion.div
                      className="w-20 h-20 mx-auto mb-4 bg-gradient-to-br from-groovely-peach-500 to-groovely-purple-500 rounded-full flex items-center justify-center shadow-2xl"
                      animate={{ rotate: 360 }}
                      transition={{ duration: 0.5 }}
                    >
                      <CheckCircle2 size={40} className="text-white" />
                    </motion.div>
                    <p className="text-2xl font-bold text-white font-heading">Success!</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Email Input */}
              <div>
                <label htmlFor="email" className="block text-sm font-semibold text-white mb-2 font-body">
                  Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-white/40" />
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full pl-12 pr-4 py-4 bg-groovely-dark-surface border border-groovely-dark-border rounded-xl text-white placeholder-white/40 focus:ring-2 focus:ring-groovely-pink-500 focus:border-transparent transition-all text-base"
                    placeholder="your@email.com"
                  />
                </div>
              </div>

              {/* Password Input */}
              {!isForgot && (
                <div>
                  <label htmlFor="password" className="block text-sm font-semibold text-white mb-2 font-body">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-white/40" />
                    <input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={6}
                      className="w-full pl-12 pr-4 py-4 bg-groovely-dark-surface border border-groovely-dark-border rounded-xl text-white placeholder-white/40 focus:ring-2 focus:ring-groovely-pink-500 focus:border-transparent transition-all text-base"
                      placeholder="••••••••"
                    />
                  </div>
                  {!isSignUp && (
                    <div className="text-right mt-2">
                      <button
                        type="button"
                        className="text-xs text-groovely-pink-300 hover:text-white transition-colors"
                        onClick={() => {
                          setMode('forgot');
                          setError('');
                          setShowSuccess(false);
                        }}
                      >
                        Forgot password?
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Submit Button */}
              <Button
                type="submit"
                disabled={loading}
                loading={loading}
                variant="primary"
                size="lg"
                fullWidth
                className="liquid-glass-button !mt-6"
              >
                <Sparkles size={18} className="mr-2" />
                {isForgot ? 'Send Reset Email' : isSignUp ? 'Create Account' : 'Sign In'}
              </Button>
            </form>

            {!isForgot && (
              <>
                {/* Divider */}
                <div className="relative my-6">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-groovely-dark-border"></div>
                  </div>
                  <div className="relative flex justify-center text-ios-caption-1">
                    <span className="px-2 bg-groovely-dark-card text-white/50 font-subtext">or</span>
                  </div>
                </div>

                {/* Toggle Sign In/Up */}
                <div className="text-center">
                  <button
                    onClick={() => {
                      setMode(isSignUp ? 'signin' : 'signup');
                      setError('');
                    }}
                    className="text-groovely-pink-400 hover:text-groovely-pink-300 font-semibold text-base transition-colors"
                  >
                    {isSignUp
                      ? 'Already have an account? Sign in'
                      : "Don't have an account? Sign up"}
                  </button>
                </div>
              </>
            )}

            {isForgot && (
              <div className="text-center mt-6">
                <button
                  onClick={() => {
                    setMode('signin');
                    setError('');
                    setShowSuccess(false);
                  }}
                  className="text-groovely-pink-400 hover:text-groovely-pink-300 font-semibold text-base transition-colors"
                >
                  Back to sign in
                </button>
              </div>
            )}

          </motion.div>

          {/* Footer Tagline */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
            className="text-center text-xs text-white/60 mt-6 font-subtext"
          >
            Dance The Ranks. Connect Through Movement.
          </motion.p>
        </motion.div>
      </div>
    </div>
  );
}
