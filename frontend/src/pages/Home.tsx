import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useScroll, useTransform, useMotionValue, useSpring, animate } from 'framer-motion';
import { Play, Trophy, Users, Video, Sparkles, Crown, ArrowRight, Zap, TrendingUp, ChevronDown, Medal, Star, MessageSquare } from 'lucide-react';
import { Logo } from '../components/Logo';
import { BUILD_LAST_UPDATED } from '../buildInfo';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

// Enhanced cursor glow with gradient colors
function CursorGlow() {
  const cursorX = useMotionValue(-100);
  const cursorY = useMotionValue(-100);

  const springConfig = { damping: 25, stiffness: 150 };
  const cursorXSpring = useSpring(cursorX, springConfig);
  const cursorYSpring = useSpring(cursorY, springConfig);

  useEffect(() => {
    const moveCursor = (e: MouseEvent) => {
      cursorX.set(e.clientX - 200);
      cursorY.set(e.clientY - 200);
    };

    window.addEventListener('mousemove', moveCursor);
    return () => window.removeEventListener('mousemove', moveCursor);
  }, [cursorX, cursorY]);

  return (
    <motion.div
      className="pointer-events-none fixed inset-0 z-0"
      style={{
        x: cursorXSpring,
        y: cursorYSpring,
      }}
    >
      <div
        className="w-[400px] h-[400px] rounded-full opacity-20 blur-[100px]"
        style={{
          background: 'radial-gradient(circle, rgba(255, 140, 90, 0.4) 0%, rgba(236, 72, 153, 0.3) 50%, rgba(168, 85, 247, 0.2) 100%)',
        }}
      />
    </motion.div>
  );
}

// Cinematic scroll section with perfect parallax and reveal animations
function ScrollSection({ 
  children, 
  className = '',
  depth = 0,
}: { 
  children: React.ReactNode; 
  className?: string;
  depth?: number;
}) {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start 0.95", "end 0.05"]  // Trigger earlier for faster response
  });

  // Multi-layered parallax for cinematic depth - faster transitions
  const baseOpacity = useTransform(scrollYProgress, [0, 0.1, 0.9, 1], [0, 1, 1, 0]);
  const baseY = useTransform(scrollYProgress, [0, 0.1, 0.9, 1], [40, 0, 0, -30]);
  const baseScale = useTransform(scrollYProgress, [0, 0.1, 0.9, 1], [0.96, 1, 1, 0.98]);
  
  // Depth-based parallax multiplier for layered effect
  const depthMultiplier = 1 + (depth * 0.3);
  const y = useTransform(baseY, (val) => val * depthMultiplier);
  const opacity = baseOpacity;
  const scale = baseScale;

  return (
    <motion.div
      ref={ref}
      style={{ 
        opacity, 
        y, 
        scale,
        transition: 'transform 0.03s ease-out, opacity 0.03s ease-out'
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// Cinematic Feature Card with layered depth and perfect timing
function FeatureCard({
  icon: Icon,
  title,
  description,
  gradient,
  preview: Preview,
  delay = 0,
  onClick,
  reverse = false,
}: {
  icon: any;
  title: string;
  description: string;
  gradient: string;
  preview: React.ReactNode;
  delay?: number;
  onClick?: () => void;
  reverse?: boolean;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const arrowX = useMotionValue(0);
  const arrowXSpring = useSpring(arrowX, { 
    stiffness: 100, 
    damping: 15,
    mass: 0.5
  });
  const easePremium: any = [0.25, 0.1, 0.25, 1];
  const easeOutCubic: any = [0.4, 0, 0.2, 1];

  // Continuous animation when not hovered
  useEffect(() => {
    if (isHovered) {
      arrowX.set(6);
      return;
    }

    let animationFrame: number | null = null;
    let startTime: number | null = null;
    const duration = 1500; // 1.5 seconds
    let cancelled = false;

    const animate = (timestamp: number) => {
      if (cancelled) return;
      
      if (startTime === null) {
        startTime = timestamp;
      }
      
      const elapsed = timestamp - startTime;
      const progress = (elapsed % duration) / duration;
      
      // Smooth sine wave: 0 -> 4 -> 0
      const value = Math.sin(progress * Math.PI) * 4;
      arrowX.set(value);

      animationFrame = requestAnimationFrame(animate);
    };

    animationFrame = requestAnimationFrame(animate);
    return () => {
      cancelled = true;
      if (animationFrame !== null) {
        cancelAnimationFrame(animationFrame);
      }
    };
  }, [isHovered, arrowX]);
  
  return (
    <ScrollSection depth={reverse ? 0.5 : 0}>
      <motion.div
        initial={{ opacity: 0, y: 60 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.05 }}  // Trigger with less visibility needed
        transition={{ duration: 0.4, delay: delay * 0.3, ease: easePremium }}
        className="mb-48"
      >
        <div className={`flex flex-col ${reverse ? 'lg:flex-row-reverse' : 'lg:flex-row'} gap-16 items-center max-w-7xl mx-auto px-6`}>
          {/* Preview Section with cinematic depth */}
          <motion.div
            initial={{ opacity: 0, x: reverse ? 60 : -60, scale: 0.95 }}
            whileInView={{ opacity: 1, x: 0, scale: 1 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.4, delay: (delay + 0.25) * 0.3, ease: easeOutCubic }}
            className="flex-1"
          >
            <motion.div 
              className="relative group"
              whileHover={{ scale: 1.02 }}
              transition={{ duration: 0.4, ease: easePremium }}
            >
              <motion.div 
                className={`absolute inset-0 ${gradient} opacity-20 blur-3xl rounded-3xl`}
                animate={{
                  opacity: [0.2, 0.3, 0.2],
                }}
                transition={{
                  duration: 4,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
              />
              <motion.div 
                className="relative bg-groovely-dark-card border border-groovely-dark-border rounded-3xl overflow-hidden shadow-2xl"
                whileHover={{ 
                  borderColor: 'rgba(255, 140, 90, 0.3)',
                  boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
                }}
                transition={{ duration: 0.4, ease: easePremium }}
              >
                {Preview}
              </motion.div>
            </motion.div>
          </motion.div>

          {/* Content Section with staggered reveal */}
          <motion.div
            initial={{ opacity: 0, x: reverse ? -60 : 60 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, amount: 0.05 }}  // Trigger earlier
            transition={{ duration: 0.4, delay: (delay + 0.15) * 0.3, ease: easeOutCubic }}
            className="flex-1"
          >
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              whileInView={{ scale: 1, rotate: 0 }}
              viewport={{ once: true }}
              transition={{ 
                type: 'spring', 
                stiffness: 300, 
                damping: 25,
                delay: (delay + 0.1) * 0.3
              }}
              className={`w-16 h-16 rounded-2xl ${gradient} flex items-center justify-center mb-6`}
            >
              <Icon size={32} className="text-white" />
            </motion.div>
            <motion.h2 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.35, delay: (delay + 0.2) * 0.3, ease: easePremium }}
              className="text-5xl md:text-6xl font-bold text-white mb-6 font-heading leading-tight"
            >
              {title}
            </motion.h2>
            <motion.p 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.35, delay: (delay + 0.3) * 0.3, ease: easePremium }}
              className="text-xl text-groovely-dark-text-secondary mb-8 leading-relaxed font-body"
            >
              {description}
            </motion.p>
            <motion.button
              onClick={onClick}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.3, delay: (delay + 0.4) * 0.3, ease: easePremium }}
              onHoverStart={() => setIsHovered(true)}
              onHoverEnd={() => setIsHovered(false)}
              whileHover={{ 
                scale: 1.05, 
                borderColor: 'rgba(255, 140, 90, 0.5)',
                transition: { 
                  duration: 0.3, 
                  ease: easePremium
                }
              }}
              whileTap={{ scale: 0.98 }}
              className="group inline-flex items-center gap-3 px-8 py-4 rounded-xl bg-groovely-dark-card border border-groovely-dark-border text-white font-body transition-colors duration-300"
            >
              Learn More
              <motion.div
                style={{ x: arrowXSpring }}
              >
                <ArrowRight size={20} className="text-white" />
              </motion.div>
            </motion.button>
          </motion.div>
        </div>
      </motion.div>
    </ScrollSection>
  );
}

export function Home() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [showNav, setShowNav] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [gradientsAnimated, setGradientsAnimated] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [communityStats, setCommunityStats] = useState({ dancers: 0, routines: 0 });
  
  // Initialize scroll hook - ensure it starts at 0
  const { scrollY } = useScroll();

  // Helper function to handle navigation based on auth state
  const handleNavigation = (authenticatedPath: string, skipScroll: boolean = false) => {
    if (user) {
      if (skipScroll) {
        // Navigate immediately without scrolling
        navigate(authenticatedPath);
      } else {
        // Smooth scroll to top before navigation for seamless transition
        window.scrollTo({ top: 0, behavior: 'smooth' });
        // Small delay to allow scroll animation to start
        setTimeout(() => {
          navigate(authenticatedPath);
        }, 100);
      }
    } else {
      navigate('/login');
    }
  };

  // Cinematic easing curves - perfectly tuned for movie-like motion
  const easePremium: any = [0.25, 0.1, 0.25, 1]; // Smooth ease-in-out
  const easeOutExpo: any = [0.16, 1, 0.3, 1]; // Premium exponential ease-out
  const easeInOutCubic: any = [0.4, 0, 0.2, 1]; // Smooth cubic
  
  // Orchestrated opening animation variants - perfectly synchronized cinematic reveal
  const heroVariants = {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.2,
      },
    },
  };

  // Logo: cinematic entrance from top with elegant scale and blur
  const logoVariants = {
    hidden: { 
      opacity: 0, 
      y: -80, 
      scale: 0.75,
      filter: 'blur(20px)',
    },
    visible: { 
      opacity: 1, 
      y: 0, 
      scale: 1,
      filter: 'blur(0px)',
      transition: { 
        duration: 1.1,
        ease: easeOutExpo,
      } 
    },
  };

  // Heading "Dance": powerful entrance from left with blur and scale
  const headingLeftVariants = {
    hidden: { 
      opacity: 0, 
      x: -100, 
      scale: 0.9,
      filter: 'blur(15px)',
    },
    visible: { 
      opacity: 1, 
      x: 0, 
      scale: 1,
      filter: 'blur(0px)',
      transition: { 
        duration: 1,
        ease: easeOutExpo,
      } 
    },
  };

  // Heading "Better": powerful entrance from right with blur and scale
  const headingRightVariants = {
    hidden: { 
      opacity: 0, 
      x: 100, 
      scale: 0.9,
      filter: 'blur(15px)',
    },
    visible: { 
      opacity: 1, 
      x: 0, 
      scale: 1,
      filter: 'blur(0px)',
      transition: { 
        duration: 1,
        ease: easeOutExpo,
      } 
    },
  };

  // Subtitle: elegant fade and slide from bottom with blur
  const subtitleVariants = {
    hidden: { 
      opacity: 0, 
      y: 50,
      filter: 'blur(10px)',
    },
    visible: { 
      opacity: 1, 
      y: 0,
      filter: 'blur(0px)',
      transition: { 
        duration: 0.9, 
        ease: easeOutExpo,
      } 
    },
  };

  // CTA Button: dramatic entrance with scale, blur, and slight rotation
  const ctaVariants = {
    hidden: { 
      opacity: 0, 
      y: 60, 
      scale: 0.85,
      rotate: -2,
      filter: 'blur(12px)',
    },
    visible: { 
      opacity: 1, 
      y: 0, 
      scale: 1,
      rotate: 0,
      filter: 'blur(0px)',
      transition: { 
        duration: 0.95,
        ease: easeOutExpo,
      } 
    },
  };

  // Badges: cinematic staggered entrance with blur and scale
  const badgeVariants = {
    hidden: (i: number) => ({
      opacity: 0,
      y: i === 0 ? -40 : i === 1 ? 40 : -25,
      x: i === 0 ? -40 : i === 1 ? 40 : 0,
      scale: 0.8,
      filter: 'blur(10px)',
    }),
    visible: (i: number) => ({
      opacity: 1,
      y: 0,
      x: 0,
      scale: 1,
      filter: 'blur(0px)',
      transition: {
        duration: 0.8,
        ease: easeOutExpo,
        delay: 0.12 * i,
      },
    }),
  };

  // Scroll indicator: subtle fade in with blur
  const scrollIndicatorVariants = {
    hidden: { 
      opacity: 0, 
      y: 30,
      filter: 'blur(8px)',
    },
    visible: { 
      opacity: 1, 
      y: 0,
      filter: 'blur(0px)',
      transition: { 
        duration: 0.85, 
        ease: easeOutExpo,
        delay: 0.5,
      } 
    },
  };

  // Cinematic hero parallax with multi-layer depth
  const heroY = useTransform(scrollY, [0, 800], [0, 150]);
  const heroOpacity = useTransform(scrollY, [0, 600], [1, 0]);
  const heroScale = useTransform(scrollY, [0, 800], [1, 0.95]);
  
  // Multi-layered parallax for background gradients - creates depth
  const gradient1Y = useTransform(scrollY, [0, 800], [0, 250]);
  // Ensure opacity stays at 1 for a small scroll range to prevent dimming during initial animation
  const gradient1OpacityScroll = useTransform(scrollY, [0, 50, 600], [1, 1, 0]);
  const gradient1Scale = useTransform(scrollY, [0, 800], [1, 1.2]);
  
  const gradient2Y = useTransform(scrollY, [0, 800], [0, -250]);
  const gradient2OpacityScroll = useTransform(scrollY, [0, 50, 600], [1, 1, 0]);
  const gradient2Scale = useTransform(scrollY, [0, 800], [1, 1.15]);
  
  const gradient3Y = useTransform(scrollY, [0, 800], [0, 120]);
  const gradient3OpacityScroll = useTransform(scrollY, [0, 50, 600], [0.7, 0.7, 0]);
  const gradient3Scale = useTransform(scrollY, [0, 800], [1, 1.1]);
  
  // Motion values for initial opacity animation
  const gradient1OpacityAnimated = useMotionValue(0);
  const gradient2OpacityAnimated = useMotionValue(0);
  const gradient3OpacityAnimated = useMotionValue(0);
  
  // Track when animations are complete for smooth transition
  const [, setAnimationsReady] = useState(false);
  
  // Combined opacity: use animated value until complete, then seamlessly switch to scroll-based
  // The scroll opacity transform maintains full brightness for first 50px to prevent dimming
  const gradient1Opacity = useTransform(
    [gradient1OpacityAnimated, gradient1OpacityScroll],
    (values) => {
      const [animated, scroll] = values as [number, number];
      // During animation, use animated value
      // Once animation reaches 1, use scroll-based (which is 1 at scroll 0-50px)
      // This ensures smooth, seamless transition without dimming
      return animated >= 1 ? scroll : animated;
    }
  );
  
  const gradient2Opacity = useTransform(
    [gradient2OpacityAnimated, gradient2OpacityScroll],
    (values) => {
      const [animated, scroll] = values as [number, number];
      return animated >= 1 ? scroll : animated;
    }
  );
  
  const gradient3Opacity = useTransform(
    [gradient3OpacityAnimated, gradient3OpacityScroll],
    (values) => {
      const [animated, scroll] = values as [number, number];
      const normalizedAnimated = animated * 0.7;
      // Once normalized animated reaches 0.7, use scroll-based (which is 0.7 at scroll 0-50px)
      return normalizedAnimated >= 0.7 ? scroll : normalizedAnimated;
    }
  );
  
  // Animate opacity motion values when mounted with smooth animations
  useEffect(() => {
    if (isMounted) {
      // Use easeInOutCubic for smooth, predictable animations that reach exactly 1.0
      const easeConfig = {
        duration: 2,
        ease: easeInOutCubic,
      };
      
      // Animate gradient1: 0 -> 1
      const anim1 = animate(gradient1OpacityAnimated, 1, easeConfig);
      
      // Animate gradient2: 0 -> 1 with delay
      const timer2 = setTimeout(() => {
        animate(gradient2OpacityAnimated, 1, easeConfig);
      }, 150);
      
      // Animate gradient3: 0 -> 1 with delay (will be normalized to 0.7)
      const timer3 = setTimeout(() => {
        animate(gradient3OpacityAnimated, 1, easeConfig);
      }, 300);
      
      // Ensure values reach exactly 1.0 after animation completes
      const finalizeTimer = setTimeout(() => {
        gradient1OpacityAnimated.set(1);
        gradient2OpacityAnimated.set(1);
        gradient3OpacityAnimated.set(1);
        setAnimationsReady(true);
      }, 2500); // Slightly after animation duration to ensure completion
      
      return () => {
        anim1.stop();
        clearTimeout(timer2);
        clearTimeout(timer3);
        clearTimeout(finalizeTimer);
      };
    } else {
      gradient1OpacityAnimated.set(0);
      gradient2OpacityAnimated.set(0);
      gradient3OpacityAnimated.set(0);
      setAnimationsReady(false);
    }
  }, [isMounted, gradient1OpacityAnimated, gradient2OpacityAnimated, gradient3OpacityAnimated]);

  // Reset scroll and start animations on mount
  useEffect(() => {
    // Disable browser scroll restoration
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }
    
    // Reset scroll position immediately
    window.scrollTo(0, 0);
    if (document.documentElement) {
      document.documentElement.scrollTop = 0;
    }
    if (document.body) {
      document.body.scrollTop = 0;
    }
    
    // Trigger animations after DOM is ready - use triple RAF for perfect timing
    const animationFrame = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setIsMounted(true);
        });
      });
    });
    
    // Start continuous gradient animations after hero animations complete
    // Timing synchronized with hero animation sequence (0.2 + 0.1*5 + 1.1 ≈ 1.8s)
    const gradientTimer = setTimeout(() => {
      setGradientsAnimated(true);
    }, 2200);
    
    return () => {
      cancelAnimationFrame(animationFrame);
      clearTimeout(gradientTimer);
    };
  }, []);

  // Show navigation on scroll
  useEffect(() => {
    const unsubscribe = scrollY.onChange((latest) => {
      setShowNav(latest > 100);
    });
    return () => unsubscribe();
  }, [scrollY]);

  useEffect(() => {
    let cancelled = false;

    const fetchHomeData = async () => {
      try {
        const [profilesCount, routinesCount] = await Promise.all([
          supabase
            .from('profiles')
            .select('id', { count: 'exact', head: true }),
          supabase
            .from('routines')
            .select('id', { count: 'exact', head: true }),
        ]);

        if (!cancelled) {
          setCommunityStats({
            dancers: profilesCount.count || 0,
            routines: routinesCount.count || 0,
          });
        }
      } catch (err) {
        console.error('Failed to load home stats', err);
      }
    };

    fetchHomeData();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div ref={containerRef} className="relative min-h-screen bg-groovely-dark-bg text-white overflow-hidden">
      {/* Cursor glow effect */}
      <CursorGlow />

      {/* Cinematic Navigation with smooth reveal */}
      <motion.nav
        initial={{ y: -100, opacity: 0 }}
        animate={{ 
          y: showNav ? 0 : -100,
          opacity: showNav ? 1 : 0 
        }}
        transition={{ 
          type: 'spring', 
          stiffness: 400, 
          damping: 30,
          mass: 0.8
        }}
        className="fixed top-6 left-1/2 -translate-x-1/2 z-50 px-6 py-3 bg-groovely-dark-surface/90 backdrop-blur-3xl rounded-full border border-groovely-dark-border shadow-2xl"
        >
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-3 cursor-default">
              <Logo size={32} animated={false} disableHover={true} />
              <span className="text-xl font-bold text-white font-heading tracking-tight">
                Groovely
              </span>
            </div>
            <motion.button
              onClick={() => handleNavigation(user ? '/feed' : '/explore')}
              whileHover={{ scale: 1.05, boxShadow: '0 10px 25px -5px rgba(255, 140, 90, 0.4)' }}
              whileTap={{ scale: 0.95 }}
              transition={{ duration: 0.3, ease: easePremium }}
              className="px-6 py-2.5 rounded-full btn-gradient-smooth text-white font-heading font-semibold text-sm tracking-wide shadow-lg shadow-groovely-peach-500/30 cursor-pointer z-20"
              style={{ pointerEvents: 'auto' }}
            >
              {user ? "Let's Dance" : 'Get Started'}
            </motion.button>
        </div>
      </motion.nav>

      {/* Hero Section */}
      <section className="relative min-h-screen flex flex-col items-center justify-center px-6 overflow-hidden pb-32 pt-20">
        {/* Cinematic multi-layer gradient background with synchronized entrance */}
        <div className="absolute inset-0 overflow-hidden">
          <motion.div
            initial={{ scale: 0.7, filter: 'blur(60px)' }}
            animate={isMounted ? { 
              scale: 1,
              filter: 'blur(40px)',
              x: gradientsAnimated ? [0, 30, 0] : 0,
            } : { scale: 0.7, filter: 'blur(60px)' }}
            transition={gradientsAnimated ? {
              scale: { duration: 2, ease: easeInOutCubic },
              filter: { duration: 2, ease: easeInOutCubic },
              x: { duration: 20, repeat: Infinity, ease: 'easeInOut', delay: 2.2 },
            } : { 
              scale: { duration: 2, ease: easeInOutCubic },
              filter: { duration: 2, ease: easeInOutCubic },
            }}
            style={{ 
              y: gradient1Y, 
              opacity: gradient1Opacity,
              scale: gradient1Scale,
              background: 'radial-gradient(circle, rgba(255, 140, 90, 0.2) 0%, transparent 70%)',
            }}
            className="absolute top-1/4 left-1/4 w-[600px] h-[600px] rounded-full blur-3xl"
          />
          <motion.div
            initial={{ scale: 0.7, filter: 'blur(60px)' }}
            animate={isMounted ? { 
              scale: 1,
              filter: 'blur(40px)',
              x: gradientsAnimated ? [0, -30, 0] : 0,
            } : { scale: 0.7, filter: 'blur(60px)' }}
            transition={gradientsAnimated ? {
              scale: { duration: 2, delay: 0.15, ease: easeInOutCubic },
              filter: { duration: 2, delay: 0.15, ease: easeInOutCubic },
              x: { duration: 25, repeat: Infinity, ease: 'easeInOut', delay: 2.35 },
            } : { 
              scale: { duration: 2, delay: 0.15, ease: easeInOutCubic },
              filter: { duration: 2, delay: 0.15, ease: easeInOutCubic },
            }}
            style={{ 
              y: gradient2Y, 
              opacity: gradient2Opacity,
              scale: gradient2Scale,
              background: 'radial-gradient(circle, rgba(168, 85, 247, 0.2) 0%, transparent 70%)',
            }}
            className="absolute bottom-1/4 right-1/4 w-[600px] h-[600px] rounded-full blur-3xl"
          />
          <motion.div
            initial={{ scale: 0.7, filter: 'blur(60px)' }}
            animate={isMounted ? { 
              scale: gradientsAnimated ? [1, 1.1, 1] : 1,
              filter: 'blur(40px)',
            } : { scale: 0.7, filter: 'blur(60px)' }}
            transition={gradientsAnimated ? {
              scale: { repeat: Infinity, duration: 8, ease: 'easeInOut', delay: 2.5 },
              filter: { duration: 2, delay: 0.3, ease: easeInOutCubic },
            } : { 
              scale: { duration: 2, delay: 0.3, ease: easeInOutCubic },
              filter: { duration: 2, delay: 0.3, ease: easeInOutCubic },
            }}
            style={{ 
              y: gradient3Y, 
              opacity: gradient3Opacity,
              scale: gradient3Scale,
              background: 'radial-gradient(circle, rgba(236, 72, 153, 0.15) 0%, transparent 70%)',
            }}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full blur-3xl"
          />
        </div>

        {/* Ambient flares - synchronized with hero content */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8, filter: 'blur(40px)' }}
          animate={isMounted ? { 
            opacity: 1, 
            scale: 1,
            filter: 'blur(30px)',
          } : { 
            opacity: 0, 
            scale: 0.8,
            filter: 'blur(40px)',
          }}
          transition={{ duration: 1.5, delay: 0.5, ease: easeOutExpo }}
          className="absolute top-1/3 left-1/3 w-[380px] h-[380px] rounded-full bg-groovely-pink-500/10 blur-3xl ambient-pulse"
          aria-hidden
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.8, filter: 'blur(40px)' }}
          animate={isMounted ? { 
            opacity: 1, 
            scale: 1,
            filter: 'blur(30px)',
          } : { 
            opacity: 0, 
            scale: 0.8,
            filter: 'blur(40px)',
          }}
          transition={{ duration: 1.5, delay: 0.6, ease: easeOutExpo }}
          className="absolute bottom-1/3 right-1/3 w-[320px] h-[320px] rounded-full bg-groovely-peach-500/10 blur-3xl ambient-pulse"
          aria-hidden
        />

        {/* Hero Content with synchronized cinematic reveal */}
        <motion.div
          style={{ y: heroY, opacity: heroOpacity, scale: heroScale, pointerEvents: 'auto' }}
          className="relative z-10 w-full max-w-5xl mx-auto text-center flex flex-col items-center justify-center"
          variants={heroVariants}
          initial="hidden"
          animate={isMounted ? "visible" : "hidden"}
        >
          {/* Logo: elegant entrance without spinning */}
          <motion.div 
            variants={logoVariants}
            className="mb-12 flex justify-center items-center"
          >
            <Logo size={140} animated={false} disableHover={true} />
          </motion.div>

          {/* Main Heading with synchronized entrance */}
          <motion.h1
            className="text-6xl md:text-8xl lg:text-9xl font-bold mb-8 text-white font-heading tracking-tight leading-[1.05]"
          >
            <motion.span
              variants={headingLeftVariants}
              className="inline-block"
            >
              Uniting
            </motion.span>
            {' '}
            <motion.span 
              variants={headingRightVariants}
              className="bg-clip-text text-transparent bg-gradient-to-r from-groovely-peach-400 via-groovely-pink-400 to-groovely-purple-400 inline-block"
              style={{
                backgroundSize: '200% 100%',
              }}
              animate={isMounted ? {
                backgroundPosition: ['0%', '100%', '0%'],
              } : {
                backgroundPosition: '0%',
              }}
              transition={{
                backgroundPosition: {
                  duration: 5,
                  repeat: Infinity,
                  ease: 'linear',
                  delay: 1.5, // Start after entrance animation completes
                },
              }}
            >
              Dance
            </motion.span>
          </motion.h1>

          {/* Subtitle: comes from bottom */}
          <motion.p
            variants={subtitleVariants}
            className="text-sm md:text-base text-groovely-dark-text-secondary mb-16 font-subtext max-w-2xl mx-auto leading-relaxed"
          >
            Dance The Ranks. Connect Through Movement.
          </motion.p>

          {/* CTA Button and Badges - perfectly aligned with symmetrical spacing */}
          <div className="w-full flex flex-col items-center gap-12">
            {/* CTA Button: comes from bottom-right diagonal */}
            <motion.div 
              variants={ctaVariants} 
              className="flex justify-center items-center w-full"
            >
              <motion.button
                onClick={() => handleNavigation(user ? '/feed' : '/explore')}
                whileHover={{ scale: 1.05, y: -2 }}
                whileTap={{ scale: 0.98 }}
                className="group relative px-12 py-6 rounded-2xl btn-gradient-smooth btn-pulse text-white font-heading font-bold text-lg tracking-wide overflow-hidden shadow-2xl shadow-groovely-pink-500/40 cursor-pointer z-20"
                style={{ pointerEvents: 'auto' }}
                transition={{ duration: 0.3, ease: easePremium }}
              >
                <span className="relative z-10 flex items-center justify-center gap-3">
                  <motion.div
                    animate={isMounted ? { rotate: [0, 10, -10, 0] } : { rotate: 0 }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
                  >
                    <Play size={24} className="group-hover:scale-110 transition-transform duration-300" />
                  </motion.div>
                  {"LETS DANCE"}
                </span>
                <motion.div
                  className="absolute inset-0 bg-gradient-to-r from-groovely-purple-500 via-groovely-pink-500 to-groovely-peach-500"
                  initial={{ x: '-100%' }}
                  whileHover={{ x: '100%' }}
                  transition={{ duration: 0.6, ease: easePremium }}
                />
              </motion.button>
            </motion.div>

            {/* Badges: come from different angles in sequence */}
            <motion.div
              className="flex justify-center items-center w-full"
            >
              <div className="flex justify-center items-center gap-3 flex-nowrap px-4 mx-auto">
                {[
                  { icon: Sparkles, text: 'AI CRITIQUE IN SECONDS', color: 'text-groovely-peach-400' },
                  { icon: Crown, text: 'BUILD YOUR CREW & DOMINATE', color: 'text-groovely-pink-400' },
                  { icon: TrendingUp, text: 'COMPETE AGAINST THE WORLD', color: 'text-groovely-purple-400' },
                ].map((badge, index) => (
                  <motion.div
                    key={index}
                    variants={badgeVariants}
                    custom={index}
                    className="px-5 py-2.5 rounded-full bg-white/5 border border-groovely-dark-border/40 text-white flex items-center justify-center gap-2 backdrop-blur-md"
                  >
                    <badge.icon size={16} className={badge.color} />
                    <span className="text-xs font-subtext whitespace-nowrap font-medium">
                      {badge.text}
                    </span>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          </div>
        </motion.div>

        {/* Cinematic scroll indicator - positioned below badges with proper spacing */}
        <motion.div
          variants={scrollIndicatorVariants}
          initial="hidden"
          animate={isMounted ? "visible" : "hidden"}
          className="absolute bottom-12 left-0 right-0 flex justify-center z-10"
        >
          <motion.div
            animate={{ y: [0, 8, 0] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: [0.4, 0, 0.2, 1] }}
            className="flex flex-col items-center gap-3 cursor-pointer group"
            whileHover={{ 
              scale: 1.1, 
              y: 4,
              transition: { duration: 0.3, ease: easePremium }
            }}
            onClick={() => {
              window.scrollTo({ top: window.innerHeight, behavior: 'smooth' });
            }}
          >
            <motion.span 
              className="text-xs text-groovely-dark-text-tertiary font-subtext tracking-wider group-hover:text-groovely-peach-400 transition-colors duration-300"
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            >
              DISCOVER MORE
            </motion.span>
            <motion.div 
              className="w-6 h-10 rounded-full border-2 border-groovely-dark-border/50 flex items-start justify-center p-2 backdrop-blur-sm group-hover:border-groovely-peach-500/50 transition-all duration-300"
              whileHover={{ 
                borderColor: 'rgba(255, 140, 90, 0.6)',
                boxShadow: '0 0 20px rgba(255, 140, 90, 0.3)'
              }}
            >
              <motion.div
                animate={{ y: [0, 14, 0], opacity: [1, 0.3, 1] }}
                transition={{ duration: 1.8, repeat: Infinity, ease: [0.4, 0, 0.2, 1] }}
                className="w-3 h-3 text-groovely-peach-500 flex items-center justify-center group-hover:text-groovely-peach-400 transition-colors duration-300"
              >
                <ChevronDown size={14} />
              </motion.div>
            </motion.div>
          </motion.div>
        </motion.div>
      </section>

      {/* Features Section - Premium Scroll Experience */}
      <section className="relative py-32">
        <div className="max-w-7xl mx-auto">
          {/* Cinematic Section Header */}
          <ScrollSection depth={0.3}>
            <div className="text-center mb-48 px-6">
              <motion.h2
                initial={{ opacity: 0, y: 40, scale: 0.95 }}
                whileInView={{ opacity: 1, y: 0, scale: 1 }}
                viewport={{ once: true, amount: 0.05 }}  // Trigger earlier
                transition={{ duration: 0.4, ease: easePremium }}
                className="text-6xl md:text-7xl font-bold text-white mb-8 font-heading"
              >
                Everything You Need
              </motion.h2>
              <motion.p
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.35, delay: 0.05, ease: easePremium }}
                className="text-sm text-groovely-dark-text-secondary font-subtext max-w-3xl mx-auto tracking-wide"
              >
                POWERFUL TOOLS TO PERFECT YOUR CRAFT AND CONNECT WITH DANCERS WORLDWIDE
              </motion.p>
            </div>
          </ScrollSection>

          {/* AI Critique Feature */}
          <FeatureCard
            icon={Sparkles}
            title="AI Critique"
            description="Get instant, detailed feedback on your performance. Our advanced AI analyzes timing, angle accuracy, and synchronization to provide actionable insights that help you improve faster than ever before."
            gradient="bg-gradient-to-br from-groovely-peach-500 to-groovely-pink-500"
            preview={
              <div className="aspect-[16/10] bg-groovely-dark-card border border-groovely-dark-border rounded-3xl overflow-hidden">
                {/* Header */}
                <div className="bg-groovely-dark-surface/95 backdrop-blur-md border-b border-groovely-dark-border/50 px-6 py-4">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-lg font-bold text-white font-heading">Explore</h3>
                      <p className="text-xs text-white/60 font-subtext">DISCOVER • CONNECT • COMPETE</p>
                    </div>
                  </div>
                  {/* Search Bar */}
                  <div className="relative mb-3">
                    <div className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-white/40">
                      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                    </div>
                    <div className="w-full pl-10 pr-4 py-2 bg-groovely-dark-card border border-groovely-dark-border rounded-full text-sm text-white/60">Search videos...</div>
                  </div>
                  {/* Tabs */}
                  <div className="flex gap-2">
                    {['Videos', 'Users', 'Dance Crews'].map((tab, i) => (
                      <div key={tab} className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                        i === 0 ? 'bg-gradient-to-r from-groovely-peach-500 to-groovely-purple-500 text-white' : 'text-white/60'
                      }`}>
                        {tab}
                      </div>
                    ))}
                  </div>
                </div>
                {/* Video Feed Preview */}
                <div className="p-6 h-full flex items-center justify-center bg-gradient-to-b from-groovely-dark-bg to-groovely-dark-card">
                  <div className="w-full max-w-md">
                    <div className="relative aspect-video bg-black rounded-xl overflow-hidden mb-4 shadow-2xl">
                      <div className="absolute inset-0 bg-gradient-to-tr from-groovely-purple-500/20 to-groovely-peach-500/20" />
                      <div className="absolute bottom-4 left-4 right-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-groovely-peach-500 to-groovely-pink-500" />
                            <span className="text-sm font-semibold text-white">@dancer</span>
                          </div>
                          <div className="flex items-center gap-3 text-white/80">
                            <div className="flex items-center gap-1"><svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg><span className="text-xs">1.2k</span></div>
                            <div className="flex items-center gap-1"><svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M21 15.46l-5.27-.61-2.52 2.52a15.045 15.045 0 01-6.59-6.59l2.53-2.53L8.54 3H3.03C2.45 13.18 10.82 21.55 21 20.97v-5.51z"/></svg><span className="text-xs">89</span></div>
                          </div>
                        </div>
                        <div className="text-xs text-white/70 font-subtext mb-2">Amazing routine! 🔥</div>
                        <div className="flex items-center gap-2">
                          <div className="px-2 py-1 bg-white/10 rounded-full text-xs text-white/80">#HipHop</div>
                          <div className="px-2 py-1 bg-white/10 rounded-full text-xs text-white/80">#Dance</div>
                        </div>
                      </div>
                      {/* AI Score Badge */}
                      <div className="absolute top-4 right-4 bg-gradient-to-r from-groovely-peach-500 to-groovely-purple-500 px-3 py-1.5 rounded-full shadow-lg">
                        <div className="flex items-center gap-1.5">
                          <Sparkles size={14} className="text-white" />
                          <span className="text-sm font-bold text-white">92</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            }
            delay={0}
            onClick={() => navigate('/explore')}
          />

          {/* Global Rankings Feature */}
          <FeatureCard
            icon={Trophy}
            title="Global Rankings"
            description="Compete on leaderboards and watch your rank climb as you perfect your moves. Track progress across multiple arenas and see how you stack up against dancers worldwide."
            gradient="bg-gradient-to-br from-groovely-pink-500 to-groovely-purple-500"
            preview={
              <div className="aspect-[16/10] bg-groovely-dark-card border border-groovely-dark-border rounded-3xl overflow-hidden">
                {/* Header */}
                <div className="bg-groovely-dark-surface/95 backdrop-blur-md border-b border-groovely-dark-border/50 px-6 py-4">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-lg font-bold text-white font-heading">Leaderboard</h3>
                      <p className="text-xs text-white/60 font-subtext">SEE WHERE YOU RANK</p>
                    </div>
                  </div>
                  {/* Time Window Selector */}
                  <div className="flex gap-2 mb-3">
                    {['Week', 'Month', 'All-time'].map((w, i) => (
                      <div key={w} className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                        i === 2 ? 'bg-white text-groovely-peach-600 shadow-lg font-semibold' : 'bg-white/20 text-white/60'
                      }`}>
                        {w}
                      </div>
                    ))}
                  </div>
                  {/* Tabs */}
                  <div className="flex gap-2">
                    {['Solo', 'Songs', 'Dance Crews'].map((tab, i) => (
                      <div key={tab} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                        i === 0 ? 'bg-gradient-to-r from-groovely-peach-500 to-groovely-purple-500 text-white' : 'text-white/60'
                      }`}>
                        {tab}
                      </div>
                    ))}
                  </div>
                </div>
                {/* Leaderboard List */}
                <div className="p-6 h-full overflow-y-auto">
                  <div className="space-y-2">
                    {[
                      { name: 'Nova', score: 12450, rank: 1, avatar: true },
                      { name: 'Blaze', score: 11230, rank: 2, avatar: true },
                      { name: 'Echo', score: 10120, rank: 3, avatar: true },
                      { name: 'Kairo', score: 9870, rank: 4, avatar: false },
                      { name: 'Zen', score: 9450, rank: 5, avatar: false },
                    ].map((user) => {
                      const BadgeIcon = user.rank === 1 ? Crown : user.rank <= 3 ? Medal : Star;
                      const badgeColor = user.rank === 1 ? 'from-yellow-400 to-yellow-600' : user.rank === 2 ? 'from-gray-300 to-gray-500' : user.rank === 3 ? 'from-orange-400 to-orange-600' : 'from-groovely-purple-500 to-groovely-peach-500';
                      return (
                        <div key={user.name} className="flex items-center justify-between p-3 bg-white/5 rounded-xl hover:bg-white/10 transition-colors">
                          <div className="flex items-center gap-4 flex-1">
                            {/* Rank Badge */}
                            <div className={`w-10 h-10 bg-gradient-to-br ${badgeColor} rounded-lg flex items-center justify-center ${
                              user.rank <= 3 ? 'shadow-lg' : ''
                            }`}>
                              {user.rank <= 3 ? (
                                <BadgeIcon size={20} className="text-white" />
                              ) : (
                                <span className="text-base font-bold text-white">{user.rank}</span>
                              )}
                            </div>
                            {/* Avatar */}
                            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-groovely-peach-500 to-groovely-purple-500 flex items-center justify-center text-white font-semibold">
                              {user.name[0]}
                            </div>
                            {/* User Info */}
                            <div className="flex-1">
                              <div className="text-sm font-semibold text-white font-heading">{user.name}</div>
                              <div className="text-xs text-white/50">@{user.name.toLowerCase()}</div>
                            </div>
                          </div>
                          {/* Score */}
                          <div className="text-right">
                            <div className="text-lg font-bold bg-gradient-to-r from-groovely-peach-500 to-groovely-purple-500 bg-clip-text text-transparent font-heading">
                              {user.score.toLocaleString()}
                            </div>
                            <div className="text-xs text-white/50">pts</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            }
            delay={0.1}
            reverse
            onClick={() => navigate('/leaderboard')}
          />

          {/* Clans & Community Feature */}
          <FeatureCard
            icon={Users}
            title="Dance Crews"
            description="Join forces with dancers worldwide. Create crews, chat with your crew, collaborate on routines, and dominate the leaderboards together. Build lasting connections in the dance community."
            gradient="bg-gradient-to-br from-groovely-purple-500 to-groovely-peach-500"
            preview={
              <div className="aspect-[16/10] bg-groovely-dark-card border border-groovely-dark-border rounded-3xl overflow-hidden">
                {/* Header */}
                <div className="bg-groovely-dark-surface/95 backdrop-blur-md border-b border-groovely-dark-border/50 px-6 py-4">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-lg font-bold text-white font-heading">Explore</h3>
                      <p className="text-xs text-white/60 font-subtext">DISCOVER • CONNECT • COMPETE</p>
                    </div>
                  </div>
                  {/* Search Bar */}
                  <div className="relative mb-3">
                    <div className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-white/40">
                      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                    </div>
                    <div className="w-full pl-10 pr-4 py-2 bg-groovely-dark-card border border-groovely-dark-border rounded-full text-sm text-white/60">Search crews...</div>
                  </div>
                  {/* Tabs */}
                  <div className="flex gap-2">
                    {['Videos', 'Users', 'Dance Crews'].map((tab, i) => (
                      <div key={tab} className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                        i === 2 ? 'bg-gradient-to-r from-groovely-peach-500 to-groovely-purple-500 text-white' : 'text-white/60'
                      }`}>
                        {tab}
                      </div>
                    ))}
                  </div>
                </div>
                {/* Crew Cards Grid */}
                <div className="p-6 h-full overflow-y-auto">
                  <div className="mb-4">
                    <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-groovely-peach-500 to-groovely-purple-500 rounded-full text-sm font-semibold text-white">
                      <Crown size={16} />
                      Build Your Crew
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    {[
                      { name: 'Groove Titans', members: 128, score: 45230, avatar: true },
                      { name: 'Tempo Tribe', members: 87, score: 38920, avatar: true },
                      { name: 'Rhythm Rebels', members: 156, score: 52100, avatar: false },
                    ].map((crew) => (
                      <div key={crew.name} className="bg-white/5 rounded-xl p-4 hover:bg-white/10 transition-colors cursor-pointer border border-groovely-dark-border">
                        {/* Crew Avatar */}
                        <div className="w-16 h-16 mx-auto mb-3 bg-gradient-to-br from-groovely-purple-500 to-groovely-peach-500 rounded-2xl flex items-center justify-center shadow-lg">
                          {crew.avatar ? (
                            <Users size={24} className="text-white" />
                          ) : (
                            <span className="text-2xl font-bold text-white">{crew.name[0]}</span>
                          )}
                        </div>
                        {/* Crew Info */}
                        <h4 className="text-base font-bold text-white text-center mb-2 font-heading truncate">{crew.name}</h4>
                        {/* Stats */}
                        <div className="flex justify-center gap-4 mb-3 pb-3 border-b border-white/10">
                          <div className="text-center">
                            <div className="text-sm font-bold bg-gradient-to-r from-groovely-peach-500 via-groovely-pink-500 to-groovely-purple-500 bg-clip-text text-transparent font-heading">
                              {crew.score.toLocaleString()}
                            </div>
                            <div className="text-xs text-white/50">Score</div>
                          </div>
                          <div className="text-center">
                            <div className="text-sm font-bold text-white font-heading">{crew.members}</div>
                            <div className="text-xs text-white/50">Members</div>
                          </div>
                        </div>
                        {/* Join Button */}
                        <div className="w-full px-3 py-2 bg-gradient-to-r from-groovely-peach-500 to-groovely-purple-500 rounded-lg text-center text-sm font-semibold text-white">
                          Join
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            }
            delay={0.2}
            onClick={() => navigate('/crews')}
          />

          {/* Endless Library Feature */}
          <FeatureCard
            icon={Video}
            title="Endless Library"
            description="Ever-growing collection of dance routines across every style. From hip-hop to ballet, contemporary to breaking, there's always something new to master. Discover routines from top choreographers worldwide."
            gradient="bg-gradient-to-br from-groovely-peach-500 to-groovely-purple-500"
            preview={
              <div className="aspect-[16/10] bg-groovely-dark-card border border-groovely-dark-border rounded-3xl overflow-hidden">
                {/* Header */}
                <div className="bg-groovely-dark-surface/95 backdrop-blur-md border-b border-groovely-dark-border/50 px-6 py-4">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-lg font-bold text-white font-heading">Explore</h3>
                      <p className="text-xs text-white/60 font-subtext">DISCOVER • CONNECT • COMPETE</p>
                    </div>
                  </div>
                  {/* Search Bar */}
                  <div className="relative mb-3">
                    <div className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-white/40">
                      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                    </div>
                    <div className="w-full pl-10 pr-4 py-2 bg-groovely-dark-card border border-groovely-dark-border rounded-full text-sm text-white/60">Search videos...</div>
                  </div>
                  {/* Tabs */}
                  <div className="flex gap-2">
                    {['Videos', 'Users', 'Dance Crews'].map((tab, i) => (
                      <div key={tab} className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                        i === 0 ? 'bg-gradient-to-r from-groovely-peach-500 to-groovely-purple-500 text-white' : 'text-white/60'
                      }`}>
                        {tab}
                      </div>
                    ))}
                  </div>
                </div>
                {/* Video Grid Preview */}
                <div className="p-6 h-full overflow-y-auto">
                  <div className="grid grid-cols-3 gap-3">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className="relative aspect-video bg-black rounded-xl overflow-hidden group cursor-pointer">
                        <div className="absolute inset-0 bg-gradient-to-tr from-groovely-purple-500/30 via-groovely-pink-500/20 to-groovely-peach-500/30" />
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                            <Play size={20} className="text-white ml-1" />
                          </div>
                        </div>
                        <div className="absolute bottom-2 left-2 right-2">
                          <div className="flex items-center gap-1.5 mb-1">
                            <div className="w-5 h-5 rounded-full bg-gradient-to-br from-groovely-peach-500 to-groovely-purple-500" />
                            <span className="text-xs font-semibold text-white truncate">@dancer{i + 1}</span>
                          </div>
                          <div className="flex items-center gap-2 text-white/80 text-xs">
                            <span className="flex items-center gap-1">
                              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
                              {(Math.random() * 1000 + 100).toFixed(0)}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 text-center">
                    <div className="text-xs text-white/60 font-subtext">BROWSE • SAVE • MASTER</div>
                  </div>
                </div>
              </div>
            }
            delay={0.3}
            reverse
            onClick={() => navigate('/explore')}
          />

          {/* Real-time Feedback Feature */}
          <FeatureCard
            icon={Zap}
            title="Detailed Feedback"
            description="See your performance score after your routine. Understand what makes a great routine and refine your technique with immediate, actionable feedback that adapts to your skill level."
            gradient="bg-gradient-to-br from-groovely-pink-500 to-groovely-peach-500"
            preview={
              <div className="aspect-[16/10] bg-groovely-dark-card border border-groovely-dark-border rounded-3xl overflow-hidden">
                {/* Header */}
                <div className="bg-groovely-dark-surface/95 backdrop-blur-md border-b border-groovely-dark-border/50 px-6 py-4">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-lg font-bold text-white font-heading">Explore</h3>
                      <p className="text-xs text-white/60 font-subtext">DISCOVER • CONNECT • COMPETE</p>
                    </div>
                  </div>
                  {/* Search Bar */}
                  <div className="relative mb-3">
                    <div className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-white/40">
                      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                    </div>
                    <div className="w-full pl-10 pr-4 py-2 bg-groovely-dark-card border border-groovely-dark-border rounded-full text-sm text-white/60">Search videos...</div>
                  </div>
                  {/* Tabs */}
                  <div className="flex gap-2">
                    {['Videos', 'Users', 'Dance Crews'].map((tab, i) => (
                      <div key={tab} className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                        i === 0 ? 'bg-gradient-to-r from-groovely-peach-500 to-groovely-purple-500 text-white' : 'text-white/60'
                      }`}>
                        {tab}
                      </div>
                    ))}
                  </div>
                </div>
                {/* Video with Live Feedback Overlay */}
                <div className="p-6 h-full flex items-center justify-center bg-gradient-to-b from-groovely-dark-bg to-groovely-dark-card">
                  <div className="w-full max-w-2xl">
                    <div className="relative aspect-video bg-black rounded-xl overflow-hidden shadow-2xl">
                      <div className="absolute inset-0 bg-gradient-to-tr from-groovely-purple-500/30 via-groovely-pink-500/20 to-groovely-peach-500/30" />
                      {/* Live Score Badge - Top Right */}
                      <div className="absolute top-4 right-4 bg-gradient-to-r from-groovely-peach-500 to-groovely-purple-500 px-4 py-2 rounded-full shadow-lg flex items-center gap-2">
                        <Zap size={16} className="text-white animate-pulse" />
                        <div>
                          <div className="text-xs text-white/80 font-subtext">Live Score</div>
                          <div className="text-xl font-bold text-white font-heading">88</div>
                        </div>
                      </div>
                      {/* Metrics Overlay - Bottom */}
                      <div className="absolute bottom-4 left-4 right-4">
                        <div className="grid grid-cols-3 gap-3">
                          {["Timing", "Energy", "Flow"].map((m, i) => (
                            <div key={m} className="bg-black/60 backdrop-blur-md rounded-xl p-3 border border-white/10">
                              <div className="text-xs text-white/70 font-subtext mb-2">{m.toUpperCase()}</div>
                              <div className="h-2 bg-white/10 rounded-full overflow-hidden mb-1">
                                <div className={`h-full ${i===0?'w-5/6':i===1?'w-4/5':'w-2/3'} bg-gradient-to-r from-groovely-pink-500 to-groovely-purple-500`} />
                              </div>
                              <div className="text-sm font-bold text-white font-heading">
                                {i === 0 ? '92%' : i === 1 ? '85%' : '78%'}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                      {/* Play Button Center */}
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-20 h-20 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center border-2 border-white/30">
                          <Play size={32} className="text-white ml-1" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            }
            delay={0.4}
            onClick={() => navigate('/explore')}
          />

          {/* Track Progress Feature */}
          <FeatureCard
            icon={TrendingUp}
            title="Track Progress"
            description="Watch your skills improve over time with detailed analytics. See your growth across all metrics, track your best performances, and set goals to push yourself further."
            gradient="bg-gradient-to-br from-groovely-purple-500 to-groovely-pink-500"
            preview={
              <div className="aspect-[16/10] bg-groovely-dark-card border border-groovely-dark-border rounded-3xl overflow-hidden">
                {/* Header */}
                <div className="bg-groovely-dark-surface/95 backdrop-blur-md border-b border-groovely-dark-border/50 px-6 py-4">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-lg font-bold text-white font-heading">Profile</h3>
                      <p className="text-xs text-white/60 font-subtext">YOUR DANCE JOURNEY</p>
                    </div>
                  </div>
                  {/* Tabs */}
                  <div className="flex gap-2 overflow-x-auto">
                    {['Attempts', 'Routines', 'Drafts', 'Favorites', 'Crews'].map((tab, i) => (
                      <div key={tab} className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                        i === 0 ? 'bg-gradient-to-r from-groovely-peach-500 to-groovely-purple-500 text-white' : 'text-white/60'
                      }`}>
                        {tab}
                      </div>
                    ))}
                  </div>
                </div>
                {/* Profile Content */}
                <div className="p-6 h-full overflow-y-auto">
                  {/* Stats Cards */}
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    <div className="bg-white/5 rounded-xl p-3 text-center border border-groovely-dark-border">
                      <div className="text-lg font-bold bg-gradient-to-r from-groovely-peach-500 to-groovely-purple-500 bg-clip-text text-transparent font-heading">+12%</div>
                      <div className="text-xs text-white/60 font-subtext mt-1">THIS MONTH</div>
                    </div>
                    <div className="bg-white/5 rounded-xl p-3 text-center border border-groovely-dark-border">
                      <div className="text-lg font-bold text-white font-heading">96</div>
                      <div className="text-xs text-white/60 font-subtext mt-1">BEST SCORE</div>
                    </div>
                    <div className="bg-white/5 rounded-xl p-3 text-center border border-groovely-dark-border">
                      <div className="text-lg font-bold text-white font-heading">18</div>
                      <div className="text-xs text-white/60 font-subtext mt-1">ROUTINES</div>
                    </div>
                  </div>
                  {/* Progress Chart */}
                  <div className="bg-white/5 rounded-xl p-4 mb-4 border border-groovely-dark-border">
                    <div className="text-sm font-semibold text-white mb-3 font-heading">Score Progress</div>
                    <div className="h-24 grid grid-cols-6 gap-2 items-end">
                      {[20, 40, 55, 70, 85, 90].map((h, i) => (
                        <div key={i} className="relative">
                          <div className="bg-gradient-to-t from-groovely-peach-500 to-groovely-purple-500 rounded-t-md transition-all" style={{ height: `${h}%` }} />
                          <div className="text-[8px] text-white/50 text-center mt-1">{i + 1}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                  {/* Video Grid */}
                  <div className="grid grid-cols-3 gap-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="relative aspect-video bg-black rounded-lg overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-tr from-groovely-purple-500/30 to-groovely-peach-500/30" />
                        <div className="absolute top-1 right-1">
                          <div className="px-1.5 py-0.5 bg-black/60 backdrop-blur-sm rounded text-xs font-semibold text-white">
                            {85 + i * 3}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            }
            delay={0.5}
            reverse
            onClick={() => navigate('/profile')}
          />
            </div>
      </section>

      {/* Cinematic CTA Section */}
      <section className="relative pt-0 pb-48 px-6 overflow-hidden">
        {/* Subtle background gradient layer - consistent with hero section */}
        <div className="absolute inset-0 overflow-hidden">
          <motion.div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full blur-3xl"
            style={{
              background: 'radial-gradient(circle, rgba(255, 140, 90, 0.08) 0%, rgba(168, 85, 247, 0.06) 50%, transparent 70%)',
            }}
            animate={{
              scale: [1, 1.05, 1],
              opacity: [0.5, 0.7, 0.5],
            }}
            transition={{
              duration: 12,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />
        </div>
        <div className="max-w-4xl mx-auto relative z-10">
          <ScrollSection depth={0.2}>
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 40 }}
              whileInView={{ opacity: 1, scale: 1, y: 0 }}
              viewport={{ once: true, amount: 0.05 }}  // Trigger earlier
              transition={{ duration: 0.4, ease: easePremium }}
              className="relative overflow-hidden rounded-3xl bg-groovely-dark-card border border-groovely-dark-border p-16 shadow-2xl backdrop-blur-sm"
            >
              <div className="relative z-10 text-center">
                <motion.h2 
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.35, ease: easePremium }}
                  className="text-5xl md:text-6xl font-bold text-white mb-6 font-heading"
                >
                  Ready to Dance?
                </motion.h2>
                <motion.p 
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.35, delay: 0.03, ease: easePremium }}
                  className="text-xl text-groovely-dark-text-secondary mb-12 max-w-2xl mx-auto font-body leading-relaxed"
                >
                  Join {communityStats.dancers > 0 ? communityStats.dancers.toLocaleString() : 'thousands of'} dancers perfecting their craft across {communityStats.routines > 0 ? communityStats.routines.toLocaleString() : 'hundreds of'} routines
                </motion.p>
                <motion.button
                  onClick={() => handleNavigation(user ? '/feed' : '/explore', true)}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.3, delay: 0.06, ease: easePremium }}
                  whileHover={{ scale: 1.05, y: -2 }}
                  whileTap={{ scale: 0.98 }}
                  className="group relative px-12 py-6 rounded-2xl btn-gradient-smooth btn-pulse text-white font-heading font-bold text-lg tracking-wide overflow-hidden shadow-2xl shadow-groovely-pink-500/40 cursor-pointer z-20"
                  style={{ pointerEvents: 'auto' }}
                >
                  <span className="relative z-10 flex items-center gap-3">
                    <motion.div
                      animate={{ rotate: [0, 10, -10, 0] }}
                      transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                    >
                      <Play size={24} className="group-hover:scale-110 transition-transform duration-300" />
                    </motion.div>
                    {user ? "Let's Dance" : 'Get Started'}
                  </span>
                  <motion.div
                    className="absolute inset-0 bg-gradient-to-r from-groovely-purple-500 via-groovely-pink-500 to-groovely-peach-500"
                    initial={{ x: '-100%' }}
                    whileHover={{ x: '100%' }}
                    transition={{ duration: 0.6, ease: easePremium }}
                  />
                </motion.button>
              </div>
            </motion.div>
          </ScrollSection>
        </div>
      </section>

      {/* Cinematic Footer */}
      <motion.footer 
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, amount: 0.3 }}
        transition={{ duration: 0.35, ease: easePremium }}
        className="border-t border-groovely-dark-border py-20 bg-groovely-dark-bg"
      >
        <div className="max-w-6xl mx-auto px-6 text-center">
          <motion.div 
            className="flex justify-center mb-8"
            initial={{ scale: 0.9, opacity: 0 }}
            whileInView={{ scale: 1, opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.3, ease: easePremium }}
          >
            <Logo size={48} animated={false} disableHover={true} />
          </motion.div>
          <motion.p 
            className="mb-3 text-lg text-white font-heading font-bold tracking-wide"
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.3, delay: 0.03, ease: easePremium }}
          >
            Dance The Ranks. Connect Through Movement.
          </motion.p>
          <motion.div 
            className="text-groovely-dark-text-tertiary text-sm font-body flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-3"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.3, delay: 0.06, ease: easePremium }}
          >
            <span>© 2025 Groovely. All rights reserved.</span>
            {BUILD_LAST_UPDATED && (
              <span className="text-xs sm:text-sm text-groovely-dark-text-secondary">
                • Last Updated: {BUILD_LAST_UPDATED}
              </span>
            )}
          </motion.div>
          
          {/* Feedback Button */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.3, delay: 0.09, ease: easePremium }}
            className="mt-8"
          >
            <motion.button
              onClick={async () => {
                try {
                  await Haptics.impact({ style: ImpactStyle.Light });
                } catch (e) {
                  // Haptics not available
                }
                if (user) {
                  navigate('/feedback');
                } else {
                  navigate('/login');
                }
              }}
              whileHover={{ scale: 1.05, y: -2 }}
              whileTap={{ scale: 0.98 }}
              className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-groovely-peach-500/80 to-groovely-purple-500/80 hover:from-groovely-peach-500 hover:to-groovely-purple-500 rounded-xl text-white font-semibold text-sm shadow-lg shadow-groovely-pink-500/30 border border-white/20 backdrop-blur-sm transition-all duration-300"
            >
              <MessageSquare size={18} />
              <span>Share Your Feedback</span>
            </motion.button>
          </motion.div>
        </div>
      </motion.footer>
    </div>
  );
}
