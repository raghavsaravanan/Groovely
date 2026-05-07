import { useState, useRef } from 'react';
import { Upload, Video, ArrowLeft, Sparkles, AlertCircle, Download } from 'lucide-react';
import { supabase, uploadToBucket, checkAchievementsSilently } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Button, Card, LoadingOverlay, PageHeader } from '../components/ios';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { analyzeVideo } from '../lib/aiAnalysis';

export function CreateVideo() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null;
    setVideoFile(f);
    setError(null);
    if (f && videoRef.current) {
      videoRef.current.src = URL.createObjectURL(f);
      try {
        await Haptics.impact({ style: ImpactStyle.Light });
      } catch (e) {
        // Haptics not available
      }
    }
  };

  const handleUpload = async () => {
    if (!user) {
      setError('Please log in to upload videos');
      return;
    }
    
    if (!videoFile || !title.trim()) {
      setError('Please select a video and enter a title');
      return;
    }
    
    try {
      await Haptics.impact({ style: ImpactStyle.Medium });
    } catch (e) {
      // Haptics not available
    }

    setUploading(true);
    setUploadProgress(10);
    setError(null);

    try {
      
      // Upload video

      // Analyze video with AI
      let aiScores = null;
      if (videoRef.current) {
        setUploadProgress(60);
        const duration = videoRef.current.duration && isFinite(videoRef.current.duration)
          ? videoRef.current.duration
          : undefined;
        
        try {
          aiScores = await analyzeVideo(videoFile, duration);
        } catch (analysisError: any) {
          // Continue without AI scores if analysis fails
        }
        setUploadProgress(80);
      }

      // Save video to database
      const videoData: any = {
        user_id: user.id,
        title: title.trim(),
        description: description.trim() || '',
        video_url: videoUrl,
      };

      // Store AI scores
      if (aiScores) {
        videoData.ai_score = Math.round(aiScores.overall * 10);
        videoData.ai_feedback = {
          timing: aiScores.timing,
          energy: aiScores.energy,
          technique: aiScores.technique,
          overall: aiScores.overall,
          feedback: aiScores.feedback,
        };
      }

      const { error: dbError } = await supabase.from('videos').insert(videoData);

      if (dbError) {
        console.error('Database error:', dbError);
        throw new Error(`Database error: ${dbError.message}`);
      }


      // Check for achievements (silently - don't block on this)
      await checkAchievementsSilently(user.id);

      // Success haptic
      try {
        await Haptics.notification({ type: NotificationType.Success });
      } catch (e) {
        // Haptics not available
      }

      // Navigate to profile to see the video
      setTimeout(() => {
        navigate('/profile');
      }, 1500);
    } catch (error: any) {
      console.error('Upload error:', error);
      const errorMessage = error?.message || error?.error || 'Failed to upload video.';
      
      // Provide helpful error messages
      if (errorMessage.includes('Bucket not found') || errorMessage.includes('does not exist')) {
        setError(
          `Storage bucket not found. Please create the "videos" bucket in Supabase Dashboard.\n\n` +
          `Go to: Storage > Buckets > New Bucket\n` +
          `Name: videos\n` +
          `Public: Yes\n\n` +
          `See SETUP_STORAGE.md for detailed instructions.`
        );
      } else if (errorMessage.includes('permission') || errorMessage.includes('policy')) {
        setError(
          `Permission denied. Please check storage policies in Supabase.\n\n` +
          `See SETUP_STORAGE.md for storage policy setup.`
        );
      } else {
        setError(`Upload failed: ${errorMessage}\n\nCheck browser console (F12) for details.`);
      }
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-groovely-dark-bg pb-24">
      <PageHeader
        title="Upload Video"
        subtitle="SHARE YOUR DANCE MOVES"
        icon={<Video size={32} className="text-white/90" />}
        bottomPadding="xl"
        maxWidth="2xl"
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

      <div className="max-w-2xl mx-auto px-ios-6 py-ios-8">
        {/* Error Message */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-ios-6"
          >
            <Card variant="outline" className="bg-red-50 border-red-200">
              <div className="flex items-start gap-ios-3">
                <AlertCircle size={20} className="text-red-500 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h3 className="text-ios-subheadline font-semibold text-red-900 mb-ios-1">
                    Upload Failed
                  </h3>
                  <p className="text-ios-caption-1 text-red-700 whitespace-pre-line">
                    {error}
                  </p>
                </div>
              </div>
            </Card>
          </motion.div>
        )}

        {/* Video Preview */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Card variant="elevated" padding="none" className="mb-ios-6 overflow-hidden">
            <div className="relative bg-black aspect-video">
              <video
                ref={videoRef}
                controls
                className="w-full h-full object-contain"
              />
              {!videoFile && (
                <div className="absolute inset-0 flex items-center justify-center bg-ios-gray-900/50 backdrop-blur-sm">
                  <div className="text-center text-white">
                    <Video size={48} className="mx-auto mb-ios-4 opacity-50" />
                    <p className="text-ios-body">No video selected</p>
                  </div>
                </div>
              )}
            </div>
          </Card>
        </motion.div>

        {/* Title Input */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card variant="elevated" className="mb-ios-4">
            <label className="block text-ios-subheadline font-medium text-ios-gray-700 mb-ios-2">
              Title *
            </label>
            <input
              className="w-full px-ios-4 py-ios-3 bg-ios-gray-50 border border-ios-gray-200 rounded-ios-lg text-ios-body focus:ring-2 focus:ring-ios-blue-500 focus:border-transparent transition-all"
              placeholder="Enter video title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </Card>
        </motion.div>

        {/* Description Input */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card variant="elevated" className="mb-ios-6">
            <label className="block text-ios-subheadline font-medium text-ios-gray-700 mb-ios-2">
              Description
            </label>
            <textarea
              className="w-full px-ios-4 py-ios-3 bg-ios-gray-50 border border-ios-gray-200 rounded-ios-lg text-ios-body focus:ring-2 focus:ring-ios-blue-500 focus:border-transparent transition-all resize-none"
              placeholder="Tell us about your dance..."
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Card>
        </motion.div>

        {/* Video Upload Button */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mb-ios-6"
        >
          <label className="cursor-pointer">
            <Card
              variant="outline"
              hoverable
              className="text-center py-ios-6"
            >
              <Upload size={32} className="mx-auto mb-ios-3 text-ios-blue-500" />
              <p className="text-ios-headline text-ios-gray-900">Choose Video</p>
              <p className="text-ios-caption-1 text-ios-gray-500 mt-ios-1">From your device</p>
            </Card>
            <input
              type="file"
              accept="video/*"
              className="hidden"
              onChange={handleFileSelect}
            />
          </label>
        </motion.div>

        {/* Download & Upload Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          {videoFile && (
            <Button
              onClick={async () => {
                try {
                  if (videoFile) {
                    const url = URL.createObjectURL(videoFile);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = videoFile.name || `dance-video-${Date.now()}.${videoFile.name.split('.').pop() || 'mp4'}`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                    
                    try {
                      await Haptics.notification({ type: NotificationType.Success });
                    } catch (e) {
                      // Haptics not available
                    }
                  }
                } catch (err) {
                  console.error('Failed to download video:', err);
                  setError('Failed to download video. Please try again.');
                }
              }}
              disabled={uploading}
              variant="secondary"
              size="lg"
              fullWidth
              className="mb-ios-3 !bg-ios-gray-100 !text-ios-gray-900 hover:!bg-ios-gray-200"
            >
              <Download size={18} className="mr-2" />
              Save Video to Device
            </Button>
          )}
          
          <Button
            onClick={handleUpload}
            disabled={!title || !videoFile || uploading}
            loading={uploading}
            variant="primary"
            size="lg"
            fullWidth
            className="!bg-gradient-to-r !from-ios-blue-500 !to-ios-purple-500 hover:!shadow-ios-glow-blue"
          >
            <Sparkles size={18} className="mr-2" />
            {uploading ? 'Uploading & Analyzing...' : 'Upload & Analyze'}
          </Button>

          {/* Info Card */}
          <Card variant="glass" className="bg-ios-blue-500/10 border-ios-blue-500/20 mt-ios-4">
            <div className="flex items-start gap-ios-3">
              <Sparkles size={20} className="text-ios-blue-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-ios-subheadline text-ios-gray-700 leading-relaxed">
                  Your video will be analyzed with AI and scored on Timing, Energy, and Technique (1-10 scale). 
                  The results will appear on your profile and in Explore.
                </p>
              </div>
            </div>
          </Card>
        </motion.div>
      </div>

      {/* Upload Progress Overlay */}
      <AnimatePresence>
        {uploading && (
          <LoadingOverlay 
            message={
              uploadProgress < 50 
                ? `Uploading video... ${uploadProgress}%`
                : uploadProgress < 80
                ? `Analyzing with AI... ${uploadProgress}%`
                : `Finalizing... ${uploadProgress}%`
            } 
          />
        )}
      </AnimatePresence>
    </div>
  );
}
