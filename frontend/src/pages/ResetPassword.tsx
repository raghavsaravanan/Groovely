import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button, Card } from '../components/ios';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Lock, Sparkles } from 'lucide-react';

export function ResetPassword() {
  const navigate = useNavigate();
  const { updatePassword } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    const ensureSession = async () => {
      const { data } = await supabase.auth.getSession();
      setSessionReady(!!data.session);
    };
    ensureSession();
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!password || password !== confirm) {
      setError('Passwords must match.');
      return;
    }
    setStatus('loading');
    setError(null);
    const { error } = await updatePassword(password);
    if (error) {
      setError(error.message);
      setStatus('idle');
      return;
    }
    setStatus('success');
    setTimeout(() => navigate('/login'), 1500);
  };

  return (
    <div className="min-h-screen bg-groovely-dark-bg flex items-center justify-center px-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-lg"
      >
        <Card variant="elevated" className="p-8 bg-groovely-dark-card border border-groovely-dark-border">
          <h1 className="text-3xl font-heading text-white mb-2">Reset Password</h1>
          <p className="text-white/70 mb-6">
            Enter a new password to secure your account.
          </p>
          {!sessionReady ? (
            <div className="text-white/60 text-sm">
              This link is invalid or expired. Request a new reset email from the login page.
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-sm font-semibold text-white mb-2 block">New Password</label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40" size={18} />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    minLength={6}
                    required
                    className="w-full pl-12 pr-4 py-4 bg-groovely-dark-surface border border-groovely-dark-border rounded-xl text-white placeholder-white/40 focus:ring-2 focus:ring-groovely-pink-500 focus:border-transparent transition-all"
                    placeholder="••••••••"
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-semibold text-white mb-2 block">Confirm Password</label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40" size={18} />
                  <input
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    minLength={6}
                    required
                    className="w-full pl-12 pr-4 py-4 bg-groovely-dark-surface border border-groovely-dark-border rounded-xl text-white placeholder-white/40 focus:ring-2 focus:ring-groovely-pink-500 focus:border-transparent transition-all"
                    placeholder="••••••••"
                  />
                </div>
              </div>
              {error && (
                <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 px-4 py-2 rounded-xl">
                  {error}
                </div>
              )}
              <Button
                type="submit"
                variant="primary"
                size="lg"
                fullWidth
                disabled={status === 'loading' || !sessionReady}
                loading={status === 'loading'}
              >
                <Sparkles size={18} className="mr-2" />
                {status === 'success' ? 'Password Updated' : 'Update Password'}
              </Button>
            </form>
          )}
        </Card>
      </motion.div>
    </div>
  );
}


