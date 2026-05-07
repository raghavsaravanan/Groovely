import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Calendar, Zap } from 'lucide-react';
import { Season, UserSeasonStats, getActiveSeason, getUserSeasonStats } from '../lib/supabase';
import { Card, LoadingSpinner } from './ios';
import { useAuth } from '../contexts/AuthContext';

export function SeasonalProgress() {
  const { profile } = useAuth();
  const [season, setSeason] = useState<Season | null>(null);
  const [stats, setStats] = useState<UserSeasonStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile?.id) return;
    (async () => {
      setLoading(true);
      const activeSeason = await getActiveSeason();
      setSeason(activeSeason);
      if (activeSeason) {
        const seasonStats = await getUserSeasonStats(profile.id, activeSeason.id);
        setStats(seasonStats);
      } else {
        setStats(null);
      }
      setLoading(false);
    })();
  }, [profile?.id]);

  if (!profile) return null;

  return (
    <Card variant="elevated" className="mb-4">
      <div className="flex items-center gap-2 mb-3">
        <Calendar size={16} className="text-groovely-peach-400" />
        <span className="text-xs font-semibold text-groovely-dark-text-secondary uppercase tracking-[0.3em]">
          Seasonal Progress
        </span>
      </div>
      {loading && (
        <div className="flex items-center justify-center py-4">
          <LoadingSpinner />
        </div>
      )}
      {!loading && (
        <>
          <div className="flex items-center justify-between text-sm text-white/80 mb-2">
            <span>{season ? season.name : 'No active season'}</span>
            <span>{stats ? `${stats.seasonal_score.toLocaleString()} pts` : '0 pts'}</span>
          </div>
          <div className="h-2 bg-white/10 rounded-full overflow-hidden mb-2">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${Math.min((stats?.seasonal_score ?? 0) / 100, 1) * 100}%` }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
              className="h-full bg-gradient-to-r from-groovely-peach-500 to-groovely-purple-500 rounded-full"
            />
          </div>
          <div className="flex items-center justify-between text-xs text-groovely-dark-text-secondary">
            <span>Rank: {stats?.seasonal_rank ?? 'Unranked'}</span>
          </div>
        </>
      )}
    </Card>
  );
}

