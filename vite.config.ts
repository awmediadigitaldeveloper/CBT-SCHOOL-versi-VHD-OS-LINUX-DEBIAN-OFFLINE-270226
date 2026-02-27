import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// ==============================================================================
//  VITE CONFIG — CBT SCHOOL ENTERPRISE VHD EDITION
//  Build menghasilkan dist/ yang 100% standalone (tidak butuh CDN)
// ==============================================================================

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');

  return {
    // --- DEV SERVER ---
    server: {
      port: 3000,
      host: '0.0.0.0', // Bisa diakses dari LAN saat development
    },

    // --- PREVIEW SERVER (npm run preview) ---
    preview: {
      port: 3000,
      host: '0.0.0.0',
    },

    // --- PLUGINS ---
    plugins: [
      react(),
    ],

    // --- DEFINE GLOBAL CONSTANTS ---
    define: {
      // Expose Gemini API key ke process.env (untuk AIQuestionGenerator)
      'process.env.API_KEY':        JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      // Polyfill 'global' untuk library docx/mammoth yang expect Node.js environment
      'global': 'window',
    },

    // --- RESOLVE ALIASES ---
    resolve: {
      alias: {
        '@': path.resolve('.'),
      },
    },

    // --- OPTIMIZE DEPS ---
    // Pre-bundle library besar agar dev server cepat
    optimizeDeps: {
      include: [
        'mammoth',
        'docx',
        'exceljs',
        'react',
        'react-dom',
        '@supabase/supabase-js',
      ],
    },

    // --- BUILD PRODUCTION ---
    build: {
      outDir: 'dist',
      // Chunk size warning threshold (library seperti exceljs memang besar)
      chunkSizeWarningLimit: 2000,
      rollupOptions: {
        output: {
          // Manual chunk splitting untuk performa loading yang lebih baik
          manualChunks: {
            // Core React
            'vendor-react': ['react', 'react-dom'],
            // Supabase client
            'vendor-supabase': ['@supabase/supabase-js'],
            // Lucide icons (banyak icons, pisahkan)
            'vendor-icons': ['lucide-react'],
            // Library dokumen (besar, load on demand)
            'vendor-docs': ['docx', 'mammoth', 'exceljs'],
            // Animasi
            'vendor-motion': ['motion'],
            // AI Generator (opsional, hanya butuh internet)
            'vendor-ai': ['@google/genai'],
          },
        },
      },
    },
  };
});
