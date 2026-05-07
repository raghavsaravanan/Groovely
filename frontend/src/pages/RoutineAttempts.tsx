import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Play } from 'lucide-react';
import { supabase, Video as SupabaseVideo } from '../lib/supabase';
import { Button, Card, LoadingOverlay } from '../components/ios';
import { apiFetch, getApiBaseUrl } from '../lib/api';

const API_URL = getApiBaseUrl();

type RoutineSummary = {
  routine_id: string;
  title?: string;
  video_url: string;
  audio_url: string;
};

const resolveStaticUrl = (path: string | null | undefined) => {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  const base = API_URL.endsWith('/') ? API_URL.slice(0, -1) : API_URL;
  const normalised = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalised}`;
};

export function RoutineAttempts() {
  const { routineId } = useParams();
  const [routine, setRoutine] = useState<RoutineSummary | null>(null);
  const [attempts, setAttempts] = useState<SupabaseVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!routineId) {
        setError('Missing routine id.');
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const routineRes = await apiFetch(`/api/routines/${routineId}`);
        if (!routineRes.ok) {
          throw new Error(await routineRes.text());
        }
        const routineData: RoutineSummary = await routineRes.json();
        if (!active) return;
        setRoutine(routineData);

        // Fetch all attempt videos for this routine
        const { data: allAttemptVideos, error: attemptsError } = await supabase
          .from('videos')
          .select('*')
          .eq('routine_id', routineId)
          .eq('kind', 'attempt')
          .order('created_at', { ascending: false });

        if (attemptsError) {
          throw attemptsError;
        }

        if (!active) return;

        // Filter to only show published attempts (exclude drafts)
        if (allAttemptVideos && allAttemptVideos.length > 0) {
          // Get video URLs from attempt videos
          const videoUrls = allAttemptVideos.map(v => v.video_url).filter(Boolean);
          
          // Get published attempts for this routine
          const { data: publishedAttempts } = await supabase
            .from('attempts')
            .select('video_url')
            .eq('routine_id', routineId)
            .eq('status', 'published')
            .in('video_url', videoUrls);
          
          // Create set of published video URLs
          const publishedVideoUrls = new Set(
            publishedAttempts?.map((a: any) => a.video_url).filter(Boolean) || []
          );
          
          // Filter to only published attempts
          const publishedAttemptVideos = allAttemptVideos.filter(v => 
            v.video_url && publishedVideoUrls.has(v.video_url)
          );
          
          setAttempts(publishedAttemptVideos);
        } else {
          setAttempts([]);
        }
        setError(null);
      } catch (err) {
        console.error(err);
        if (active) {
          setError(err instanceof Error ? err.message : 'Failed to load attempts.');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [routineId]);

  return (
    <div className="min-h-screen bg-ios-background-secondary pb-24">
      <div className="bg-white border-b border-ios-gray-200 sticky top-0 z-20 backdrop-blur-ios">
        <div className="max-w-5xl mx-auto px-ios-6 py-ios-4 flex items-center gap-ios-4">
          <Link
            to="/explore"
            className="inline-flex items-center gap-ios-2 text-ios-gray-600 hover:text-ios-gray-900"
          >
            <ArrowLeft size={20} />
            Back
          </Link>
          <div>
            <h1 className="text-ios-title-2 font-bold text-ios-gray-900">
              {routine?.title || 'Routine Attempts'}
            </h1>
            <p className="text-ios-footnote text-ios-gray-600">
              Watch how other dancers performed this routine.
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-ios-6 py-ios-8 space-y-ios-6">
        {error && (
          <Card variant="outline" className="border-red-300 bg-red-50 text-red-700">
            {error}
          </Card>
        )}

        {routine && (
          <Card variant="elevated" className="overflow-hidden">
            <div className="grid gap-ios-4 md:grid-cols-[2fr,1fr]">
              <div className="bg-black rounded-ios-xl overflow-hidden">
                <video
                  controls
                  playsInline
                  className="w-full h-full object-contain bg-black"
                  src={resolveStaticUrl(routine.video_url)}
                />
              </div>
              <div className="flex flex-col justify-between gap-ios-4">
                <div>
                  <h2 className="text-ios-headline font-semibold text-ios-gray-900">
                    Reference Routine
                  </h2>
                  <p className="text-ios-body text-ios-gray-600">
                    Use this as your benchmark and post your own take.
                  </p>
                </div>
                <Link to={`/try/${routineId}`}>
                  <Button variant="primary" size="md" fullWidth>
                    <Play size={18} className="mr-2" />
                    Try This Dance
                  </Button>
                </Link>
              </div>
            </div>
          </Card>
        )}

        <Card variant="elevated">
          <div className="flex items-center justify-between mb-ios-4">
            <h3 className="text-ios-headline font-semibold text-ios-gray-900">
              Attempts ({attempts.length})
            </h3>
            <Link to={`/try/${routineId}`}>
              <Button variant="ghost" size="sm">
                Add Your Attempt
              </Button>
            </Link>
          </div>

          {attempts.length === 0 ? (
            <p className="text-ios-body text-ios-gray-600">
              No attempts posted yet. Be the first to try this routine!
            </p>
          ) : (
            <div className="grid gap-ios-4 md:grid-cols-2">
              {attempts.map((attempt) => (
                <div key={attempt.id} className="bg-ios-gray-100 rounded-ios-xl p-ios-4 space-y-ios-3">
                  <video
                    controls
                    playsInline
                    className="w-full rounded-ios-lg bg-black"
                    src={resolveStaticUrl(attempt.video_url)}
                  />
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-ios-gray-900">{attempt.title}</div>
                      <div className="text-ios-caption-1 text-ios-gray-500">
                        {new Date(attempt.created_at).toLocaleString()}
                      </div>
                    </div>
                    {typeof attempt.ai_score === 'number' && (
                      <div className="text-ios-caption-1 font-semibold text-ios-blue-500">
                        {attempt.ai_score.toFixed(1)}/100
                      </div>
                    )}
                  </div>
                  {attempt.ai_feedback && (
                    <div className="flex flex-wrap gap-ios-2">
                      {attempt.ai_feedback?.comparison_url && (
                        <a
                          href={attempt.ai_feedback.comparison_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-ios-caption-1 text-ios-blue-500 hover:underline"
                        >
                          Comparison
                        </a>
                      )}
                      {attempt.ai_feedback?.critique_url && (
                        <a
                          href={attempt.ai_feedback.critique_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-ios-caption-1 text-ios-blue-500 hover:underline"
                        >
                          Critique
                        </a>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {loading && <LoadingOverlay message="Loading attempts..." />}
    </div>
  );
}

