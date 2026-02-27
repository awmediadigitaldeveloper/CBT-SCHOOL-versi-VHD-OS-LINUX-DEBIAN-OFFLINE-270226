/** @type {import('tailwindcss').Config} */
export default {
  // Scan semua file TypeScript/TSX untuk class detection
  content: [
    './index.html',
    './*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './screens/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
    './utils/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      // Font keluarga tambahan
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        serif: ['Times New Roman', 'Times', 'serif'],
        mono:  ['Courier New', 'Courier', 'monospace'],
      },
      // Animasi custom (sudah ada di index.html, ini backup via Tailwind)
      animation: {
        'fade-in':       'fade-in 0.2s ease-out forwards',
        'scale-up':      'scale-up 0.2s ease-out forwards',
        'slide-in-right': 'slide-in-right 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94) both',
      },
      keyframes: {
        'fade-in': {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'scale-up': {
          '0%':   { transform: 'scale(0.95)', opacity: '0.8' },
          '100%': { transform: 'scale(1)',    opacity: '1'   },
        },
        'slide-in-right': {
          'from': { transform: 'translateX(100%)', opacity: '0' },
          'to':   { transform: 'translateX(0)',    opacity: '1' },
        },
      },
    },
  },
  plugins: [],
};
