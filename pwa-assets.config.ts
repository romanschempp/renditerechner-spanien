import { defineConfig, minimal2023Preset as preset } from '@vite-pwa/assets-generator/config';

export default defineConfig({
  preset: { ...preset, maskable: { ...preset.maskable, resizeOptions: { background: '#1e4fa8' } }, apple: { ...preset.apple, resizeOptions: { background: '#1e4fa8' } } },
  images: ['public/icon.svg'],
});
