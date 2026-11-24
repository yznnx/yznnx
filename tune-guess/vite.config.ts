import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `base: './'` makes the build work both locally and on GitHub Pages (https://<user>.github.io/<repo>/).
// The dev server listens on 127.0.0.1 because Spotify only accepts loopback IPs (not "localhost")
// as plain-http redirect URIs.
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true },
});
