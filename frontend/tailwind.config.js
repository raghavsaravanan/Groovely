/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      // Groovely Design System - Based on Logo Gradient
      colors: {
        groovely: {
          // Peach/Orange tones (from logo gradient start)
          peach: {
            50: '#FFF5F0',
            100: '#FFE8DC',
            200: '#FFD1B8',
            300: '#FFB894',
            400: '#FF9F70',
            500: '#FF8C5A', // Primary peach
            600: '#FF6B2E',
            700: '#E55A1F',
            800: '#CC4A15',
            900: '#B33A0A',
          },
          // Pink/Purple tones (from logo gradient end)
          pink: {
            50: '#FDF2F8',
            100: '#FCE7F3',
            200: '#FBCFE8',
            300: '#F9A8D4',
            400: '#F472B6',
            500: '#EC4899', // Primary pink
            600: '#DB2777',
            700: '#BE185D',
            800: '#9F1239',
            900: '#831843',
          },
          purple: {
            50: '#FAF5FF',
            100: '#F3E8FF',
            200: '#E9D5FF',
            300: '#D8B4FE',
            400: '#C084FC',
            500: '#A855F7', // Primary purple
            600: '#9333EA',
            700: '#7E22CE',
            800: '#6B21A8',
            900: '#581C87',
          },
          // Gradient combinations
          gradient: {
            start: '#FF8C5A', // Peach
            mid: '#EC4899',   // Pink
            end: '#A855F7',   // Purple
          },
          // Neutral grays
          gray: {
            50: '#FAFAFA',
            100: '#F5F5F5',
            200: '#E5E5E5',
            300: '#D4D4D4',
            400: '#A3A3A3',
            500: '#737373',
            600: '#525252',
            700: '#404040',
            800: '#262626',
            900: '#171717',
          },
          // Dark theme
          dark: {
            bg: '#0A0A0A',
            surface: '#141414',
            card: '#1A1A1A',
            border: '#262626',
            text: {
              primary: '#FFFFFF',
              secondary: '#D4D4D4',
              tertiary: '#A3A3A3',
            },
          },
        },
      },
      // Animation keyframes for premium effects
      keyframes: {
        'shine': {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'float': {
          '0%, 100%': { transform: 'translateY(0px) translateX(0px)' },
          '50%': { transform: 'translateY(-20px) translateX(10px)' },
        },
        'glow-pulse': {
          '0%, 100%': { opacity: '0.5', boxShadow: '0 0 20px rgba(0, 122, 255, 0.3)' },
          '50%': { opacity: '1', boxShadow: '0 0 40px rgba(0, 122, 255, 0.6)' },
        },
        'shimmer': {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
        'gradient-shift': {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
        'gradient-flow': {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '25%': { backgroundPosition: '100% 50%' },
          '50%': { backgroundPosition: '100% 100%' },
          '75%': { backgroundPosition: '0% 100%' },
        },
        'fade-in-up': {
          '0%': { opacity: '0', transform: 'translateY(30px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in-down': {
          '0%': { opacity: '0', transform: 'translateY(-30px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.9)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
      },
      animation: {
        'spin-slow': 'spin 3s linear infinite',
        'shine': 'shine 3s linear infinite',
        'float': 'float 6s ease-in-out infinite',
        'glow-pulse': 'glow-pulse 2s ease-in-out infinite',
        'shimmer': 'shimmer 2s infinite',
        'gradient-shift': 'gradient-shift 8s ease infinite',
        'fade-in-up': 'fade-in-up 0.6s ease-out',
        'fade-in-down': 'fade-in-down 0.6s ease-out',
        'scale-in': 'scale-in 0.4s ease-out',
      },
      // Typography - Multiple font options for different use cases
      fontFamily: {
        sans: [
          'Manrope',
          '-apple-system',
          'BlinkMacSystemFont',
          'SF Pro Display',
          'SF Pro Text',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        // Headings and titles - Klausen (elegant, premium)
        heading: [
          'Klausen',
          '-apple-system',
          'BlinkMacSystemFont',
          'SF Pro Display',
          'Helvetica Neue',
          'Arial',
          'serif',
        ],
        // Body text - Manrope (clean, readable)
        body: [
          'Manrope',
          '-apple-system',
          'BlinkMacSystemFont',
          'SF Pro Display',
          'SF Pro Text',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        // Alternative heading option - Klausen (elegant serif)
        klausen: [
          'Klausen',
          '-apple-system',
          'BlinkMacSystemFont',
          'SF Pro Display',
          'SF Pro Text',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        // Alternative body option - General Sans (versatile)
        general: [
          'General Sans',
          '-apple-system',
          'BlinkMacSystemFont',
          'SF Pro Display',
          'SF Pro Text',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
      },
      fontSize: {
        'ios-caption-2': ['11px', { lineHeight: '13px', fontWeight: '400' }],
        'ios-caption-1': ['12px', { lineHeight: '16px', fontWeight: '400' }],
        'ios-footnote': ['13px', { lineHeight: '18px', fontWeight: '400' }],
        'ios-subheadline': ['15px', { lineHeight: '20px', fontWeight: '400' }],
        'ios-body': ['17px', { lineHeight: '22px', fontWeight: '400' }],
        'ios-headline': ['17px', { lineHeight: '22px', fontWeight: '600' }],
        'ios-title-3': ['20px', { lineHeight: '25px', fontWeight: '400' }],
        'ios-title-2': ['22px', { lineHeight: '28px', fontWeight: '700' }],
        'ios-title-1': ['28px', { lineHeight: '34px', fontWeight: '700' }],
        'ios-large-title': ['34px', { lineHeight: '41px', fontWeight: '700' }],
      },
      // iOS Spacing - 8pt grid
      spacing: {
        'ios-1': '4px',
        'ios-2': '8px',
        'ios-3': '12px',
        'ios-4': '16px',
        'ios-5': '20px',
        'ios-6': '24px',
        'ios-7': '28px',
        'ios-8': '32px',
        'ios-9': '36px',
        'ios-10': '40px',
        'ios-12': '48px',
        'ios-16': '64px',
        'ios-20': '80px',
      },
      // iOS Border Radius
      borderRadius: {
        'ios-sm': '8px',
        'ios-md': '12px',
        'ios-lg': '16px',
        'ios-xl': '20px',
        'ios-2xl': '24px',
        'ios-3xl': '28px',
        'ios-full': '9999px',
      },
      // iOS Shadows and Glows
      boxShadow: {
        'ios-sm': '0 1px 3px 0 rgba(0, 0, 0, 0.08)',
        'ios-md': '0 4px 6px -1px rgba(0, 0, 0, 0.08), 0 2px 4px -1px rgba(0, 0, 0, 0.04)',
        'ios-lg': '0 10px 15px -3px rgba(0, 0, 0, 0.08), 0 4px 6px -2px rgba(0, 0, 0, 0.04)',
        'ios-xl': '0 20px 25px -5px rgba(0, 0, 0, 0.08), 0 10px 10px -5px rgba(0, 0, 0, 0.03)',
        'ios-glow-blue': '0 0 20px rgba(0, 122, 255, 0.3), 0 0 40px rgba(0, 122, 255, 0.15)',
        'ios-glow-green': '0 0 20px rgba(52, 199, 89, 0.3), 0 0 40px rgba(52, 199, 89, 0.15)',
        'ios-glow-purple': '0 0 20px rgba(175, 82, 222, 0.3), 0 0 40px rgba(175, 82, 222, 0.15)',
        'ios-inner': 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.06)',
      },
      // iOS Blur effects
      backdropBlur: {
        'ios': '20px',
        'ios-xl': '40px',
      },
      // iOS Animation durations
      transitionDuration: {
        'ios': '300ms',
        'ios-fast': '150ms',
        'ios-slow': '500ms',
      },
      // iOS Animation timing
      transitionTimingFunction: {
        'ios': 'cubic-bezier(0.4, 0, 0.2, 1)',
        'ios-bounce': 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
        'ios-ease-out': 'cubic-bezier(0, 0, 0.2, 1)',
        'ios-ease-in-out': 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
    },
  },
  plugins: [],
};
