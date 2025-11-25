import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'src/main.jsx'),
      },
      output: {
        entryFileNames: 'popup.js',
        assetFileNames: '[name].[ext]',
        format: 'es'
      }
    }
  }
});
