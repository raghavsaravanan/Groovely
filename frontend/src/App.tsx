import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { TabBar } from './components/ios/TabBar';
import { LoadingSpinner } from './components/ios';
import { Home } from './pages/Home';
import { Login } from './pages/Login';
import { CreateProfile } from './pages/CreateProfile';
import { Explore } from './pages/Explore';
import { VideoFeed } from './pages/VideoFeed';
import { Leaderboard } from './pages/Leaderboard';
import { Profile } from './pages/Profile';
import { CreateRoutine } from './pages/CreateRoutine';
import { CreateVideo } from './pages/CreateVideo';
import { TryDance } from './pages/TryDance';
import { RoutineAttempts } from './pages/RoutineAttempts';
import { Clans } from './pages/Clans';
import { CrewDetail } from './pages/CrewDetail';
import { UserProfile } from './pages/UserProfile';
import { Settings } from './pages/Settings';
import { ProfileEdit } from './pages/ProfileEdit';
import { FollowList } from './pages/FollowList';
import { MyClans } from './pages/MyClans';
import { VideoDetail } from './pages/VideoDetail';
import { AnimatePresence, motion } from 'framer-motion';
import { pageVariants } from './animations';
import { ResetPassword } from './pages/ResetPassword';
import { Feedback } from './pages/Feedback';
import { AlphaBanner } from './components/AlphaBanner';
import { RatingPopup } from './components/RatingPopup';
import { FloatingFeedbackButton } from './components/FloatingFeedbackButton';
import { apiFetch } from './lib/api';
import { supabase } from './lib/supabase';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black text-white">
        <LoadingSpinner size="lg" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function LandingPage() {
  const { loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black text-white">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return <Home />;
}

function AppRoutes() {
  const location = useLocation();
  const [isInitialMount, setIsInitialMount] = useState(true);
  const hideTabBar = location.pathname === '/login' 
    || location.pathname === '/create-profile' 
    || location.pathname === '/'
    || location.pathname === '/settings'
    || location.pathname === '/profile/edit'
    || location.pathname === '/profile/follows'
    || location.pathname === '/profile/my-crews'
    || location.pathname === '/reset-password'
    || location.pathname === '/feedback'
    || location.pathname.startsWith('/user/');

  // Track if this is the initial mount
  useEffect(() => {
    if (isInitialMount) {
      setIsInitialMount(false);
    }
  }, [isInitialMount]);

  return (
    <div className="min-h-screen bg-groovely-dark-bg">
      <AnimatePresence 
        mode="wait" 
        initial={isInitialMount && location.pathname === '/'}
      >
        <Routes location={location} key={location.pathname}>
          <Route path="/" element={
            <motion.div
              initial={isInitialMount ? false : "initial"}
              animate="animate"
              exit="exit"
              variants={pageVariants}
              key="landing"
              style={{ minHeight: '100vh' }}
            >
              <LandingPage />
            </motion.div>
          } />
          <Route path="/login" element={
            <motion.div
              initial="initial"
              animate="animate"
              exit="exit"
              variants={pageVariants}
            >
              <Login />
            </motion.div>
          } />
          <Route path="/reset-password" element={
            <motion.div
              initial="initial"
              animate="animate"
              exit="exit"
              variants={pageVariants}
            >
              <ResetPassword />
            </motion.div>
          } />

          <Route path="/create-profile" element={
            <ProtectedRoute>
              <motion.div
                initial="initial"
                animate="animate"
                exit="exit"
                variants={pageVariants}
              >
                <CreateProfile />
              </motion.div>
            </ProtectedRoute>
          } />
          <Route path="/explore" element={
            <ProtectedRoute>
              <motion.div
                initial="initial"
                animate="animate"
                exit="exit"
                variants={pageVariants}
                style={{ minHeight: '100vh' }}
              >
                <Explore />
              </motion.div>
            </ProtectedRoute>
          } />
          <Route path="/feed" element={
            <ProtectedRoute>
              <motion.div
                initial="initial"
                animate="animate"
                exit="exit"
                variants={pageVariants}
                style={{ minHeight: '100vh' }}
              >
                <VideoFeed />
              </motion.div>
            </ProtectedRoute>
          } />
          <Route path="/leaderboard" element={
            <motion.div
              initial="initial"
              animate="animate"
              exit="exit"
              variants={pageVariants}
            >
              <Leaderboard />
            </motion.div>
          } />
          <Route path="/profile" element={
            <ProtectedRoute>
              <motion.div
                initial="initial"
                animate="animate"
                exit="exit"
                variants={pageVariants}
              >
                <Profile />
              </motion.div>
            </ProtectedRoute>
          } />

          {/* New pages */}
          <Route path="/create" element={
            <ProtectedRoute>
              <motion.div
                initial="initial"
                animate="animate"
                exit="exit"
                variants={pageVariants}
              >
                <CreateRoutine />
              </motion.div>
            </ProtectedRoute>
          } />
          <Route path="/create-video" element={
            <ProtectedRoute>
              <motion.div
                initial="initial"
                animate="animate"
                exit="exit"
                variants={pageVariants}
              >
                <CreateVideo />
              </motion.div>
            </ProtectedRoute>
          } />
          <Route path="/try/:routineId" element={
            <ProtectedRoute>
              <motion.div
                initial="initial"
                animate="animate"
                exit="exit"
                variants={pageVariants}
              >
                <TryDance />
              </motion.div>
            </ProtectedRoute>
          } />
          <Route path="/video/:videoId" element={
            <ProtectedRoute>
              <motion.div
                initial="initial"
                animate="animate"
                exit="exit"
                variants={pageVariants}
              >
                <VideoDetail />
              </motion.div>
            </ProtectedRoute>
          } />
          <Route path="/routine/:routineId/attempts" element={
            <ProtectedRoute>
              <motion.div
                initial="initial"
                animate="animate"
                exit="exit"
                variants={pageVariants}
              >
                <RoutineAttempts />
              </motion.div>
            </ProtectedRoute>
          } />
          <Route path="/crews" element={
            <ProtectedRoute>
              <motion.div
                initial="initial"
                animate="animate"
                exit="exit"
                variants={pageVariants}
              >
                <Clans />
              </motion.div>
            </ProtectedRoute>
          } />
          <Route path="/crew/:crewId" element={
            <ProtectedRoute>
              <motion.div
                initial="initial"
                animate="animate"
                exit="exit"
                variants={pageVariants}
              >
                <CrewDetail />
              </motion.div>
            </ProtectedRoute>
          } />

          {/* Profile & Settings pages */}
          <Route path="/user/:userId" element={
            <ProtectedRoute>
              <motion.div
                initial="initial"
                animate="animate"
                exit="exit"
                variants={pageVariants}
              >
                <UserProfile />
              </motion.div>
            </ProtectedRoute>
          } />
          <Route path="/settings" element={
            <ProtectedRoute>
              <motion.div
                initial="initial"
                animate="animate"
                exit="exit"
                variants={pageVariants}
              >
                <Settings />
              </motion.div>
            </ProtectedRoute>
          } />
          <Route path="/profile/edit" element={
            <ProtectedRoute>
              <motion.div
                initial="initial"
                animate="animate"
                exit="exit"
                variants={pageVariants}
              >
                <ProfileEdit />
              </motion.div>
            </ProtectedRoute>
          } />
          <Route path="/profile/follows" element={
            <ProtectedRoute>
              <motion.div
                initial="initial"
                animate="animate"
                exit="exit"
                variants={pageVariants}
              >
                <FollowList />
              </motion.div>
            </ProtectedRoute>
          } />
          <Route path="/profile/my-crews" element={
            <ProtectedRoute>
              <motion.div
                initial="initial"
                animate="animate"
                exit="exit"
                variants={pageVariants}
              >
                <MyClans />
              </motion.div>
            </ProtectedRoute>
          } />
          <Route path="/feedback" element={
            <ProtectedRoute>
              <motion.div
                initial="initial"
                animate="animate"
                exit="exit"
                variants={pageVariants}
              >
                <Feedback />
              </motion.div>
            </ProtectedRoute>
          } />
        </Routes>
      </AnimatePresence>
      
      {/* Show TabBar on all pages except login and create-profile */}
      {!hideTabBar && <TabBar />}
    </div>
  );
}
export default function App() {
  const [showRatingPopup, setShowRatingPopup] = useState(false);
  const [hasShownRating, setHasShownRating] = useState(false);

  // Wake up the Render backend on app initialization
  // This ensures the backend is ready when users interact with the app
  useEffect(() => {
    // Only wake up backend if we have an API URL configured
    const apiUrl = import.meta.env.VITE_API_URL;
    if (apiUrl && apiUrl.trim()) {
      // Make a health check request to wake up the Render service
      // This is fire-and-forget - we don't need to wait for the response
      // Render free tier services spin down after 15 min of inactivity
      apiFetch('/api/health').catch(() => {
        // Silently fail - backend might be starting up (takes ~30-60s on free tier)
        // This is just to wake it up, not to check if it's ready
      });
    } else {
      // Log a warning in development to help with debugging
      if (import.meta.env.DEV) {
        console.warn('VITE_API_URL not set - backend health check skipped. Set VITE_API_URL in Netlify environment variables.');
      }
    }
  }, []);

  // Show rating popup after user has been active for a bit
  useEffect(() => {
    // Check if we've already shown the rating popup
    const shownBefore = localStorage.getItem('groovely_rating_popup_shown');
    if (shownBefore === 'true') {
      setHasShownRating(true);
      return;
    }

    // Don't show immediately - wait until user has had some time to experience the app
    // Show after 2 minutes of activity, or after 5 page interactions
    let interactionCount = 0;
    let activityTimer: NodeJS.Timeout;

    const handleInteraction = () => {
      interactionCount++;
      
      // Show after 5 interactions OR after 2 minutes
      if (interactionCount >= 5 && !hasShownRating && !showRatingPopup) {
        setShowRatingPopup(true);
        localStorage.setItem('groovely_rating_popup_shown', 'true');
      }
    };

    // Listen for user interactions
    ['click', 'touchstart', 'keydown'].forEach(event => {
      window.addEventListener(event, handleInteraction, { once: false, passive: true });
    });

    // Also show after 2 minutes regardless of interactions
    activityTimer = setTimeout(() => {
      if (!hasShownRating && !showRatingPopup && interactionCount >= 1) {
        setShowRatingPopup(true);
        localStorage.setItem('groovely_rating_popup_shown', 'true');
      }
    }, 120000); // 2 minutes

    return () => {
      ['click', 'touchstart', 'keydown'].forEach(event => {
        window.removeEventListener(event, handleInteraction);
      });
      clearTimeout(activityTimer);
    };
  }, [hasShownRating, showRatingPopup]);

  const handleRatingSubmit = async (rating: number) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        // Save rating to Supabase (or handle as needed)
        const { error } = await supabase
          .from('user_feedback')
          .insert({
            user_id: user.id,
            rating: rating,
            created_at: new Date().toISOString(),
          });
        
        if (error) {
          // Table might not exist yet, that's okay - just log it
          console.log('Could not save rating (table may not exist):', error);
        }
      }
    } catch (error) {
      console.error('Error submitting rating:', error);
    }
  };

  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <AlphaBanner />
          <AppRoutes />
          <FloatingFeedbackButton />
          <RatingPopup
            isOpen={showRatingPopup}
            onClose={() => setShowRatingPopup(false)}
            onRatingSubmit={handleRatingSubmit}
          />
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}