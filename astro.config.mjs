// astro.config.mjs — CloudPress CMS (GitHub Pages 정적 배포용)
import { defineConfig } from 'astro/config';

export default defineConfig({
  output: 'static',
  vite: {
    build: { minify: true },
  },
});
