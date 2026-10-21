import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';
import { PALETTE_CSS } from './src/shared/palette.ts';

/**
 * The game is hosted on GitHub Pages at https://hielkehoeve.github.io/berby/, so every URL
 * (dev server, preview, manifest, service worker) lives under this base path.
 */
const BASE = '/berby/';

export default defineConfig({
  base: BASE,
  // host: true exposes the dev server on the LAN so a phone can open it.
  server: { host: true },
  preview: { host: true },
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      // Icons and the manifest are picked up by the workbox glob below, so neither includeAssets
      // nor the automatic manifest-icon inclusion is needed (both would duplicate entries).
      includeManifestIcons: false,
      manifest: {
        id: BASE,
        name: 'Berby',
        short_name: 'Berby',
        description: 'A glam pastel kart race on the Malibu coast. Three laps, you against Vix.',
        lang: 'en',
        theme_color: PALETTE_CSS.hotPink,
        background_color: PALETTE_CSS.cream,
        display: 'fullscreen',
        display_override: ['fullscreen', 'standalone'],
        orientation: 'landscape',
        start_url: BASE,
        scope: BASE,
        categories: ['games'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache everything the build emits so the game runs offline after the first load.
        // The plugin adds manifest.webmanifest itself, so it is not in this list.
        globPatterns: ['**/*.{js,css,html,svg,png,webp,glb,gltf,bin,mp3,ogg,m4a,wav}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
