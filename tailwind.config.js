/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: '#0F172A',
        primary: { DEFAULT: '#2563EB', hover: '#1D4ED8', soft: '#DBEAFE' },
        cyan2: '#06B6D4',
        success: { DEFAULT: '#16A34A', light: '#DCFCE7', soft: '#F0FDF4' },
        warning: { DEFAULT: '#F59E0B', light: '#FEF3C7', soft: '#FFFBEB' },
        danger: { DEFAULT: '#DC2626', light: '#FEE2E2', soft: '#FEF2F2' },
        info2: '#0284C7',
        violet2: '#7C3AED',
        page: '#F8FAFC',
        card: '#FFFFFF',
        border: '#E2E8F0',
        textprimary: '#0F172A',
        textsecondary: '#475569',
        textmuted: '#94A3B8',
        sidebar: { text: '#CBD5E1', active: '#FFFFFF' },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        display: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(15,23,42,0.04), 0 1px 3px rgba(15,23,42,0.06)',
        soft: '0 2px 8px -1px rgba(15,23,42,0.06), 0 4px 20px -4px rgba(15,23,42,0.10)',
        lift: '0 12px 32px -12px rgba(37,99,235,0.28), 0 4px 12px -4px rgba(15,23,42,0.12)',
        pop: '0 20px 50px -20px rgba(15,23,42,0.35)',
      },
      borderRadius: {
        card: '0.85rem',
        xl2: '1.25rem',
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(135deg, #2563EB 0%, #06B6D4 100%)',
        'brand-deep': 'linear-gradient(160deg, #0F172A 0%, #1E3A8A 100%)',
        'navy-grad': 'linear-gradient(180deg, #0F172A 0%, #101C3A 55%, #0F172A 100%)',
        'hero-glow': 'radial-gradient(80% 60% at 20% 0%, rgba(37,99,235,0.22) 0%, rgba(6,182,212,0.12) 40%, transparent 70%)',
      },
      animation: {
        fadeIn: 'fadeIn 0.25s ease-out',
        slideUp: 'slideUp 0.3s cubic-bezier(0.16,1,0.3,1)',
        scaleIn: 'scaleIn 0.18s ease-out',
        shimmer: 'shimmer 2.5s linear infinite',
      },
      keyframes: {
        fadeIn: { from: { opacity: 0 }, to: { opacity: 1 } },
        slideUp: { from: { opacity: 0, transform: 'translateY(10px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
        scaleIn: { from: { opacity: 0, transform: 'scale(0.96)' }, to: { opacity: 1, transform: 'scale(1)' } },
        shimmer: { '0%': { backgroundPosition: '-1000px 0' }, '100%': { backgroundPosition: '1000px 0' } },
      },
    },
  },
  plugins: [],
}