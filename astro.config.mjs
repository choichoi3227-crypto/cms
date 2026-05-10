// astro.config.mjs — CloudPress CMS (Cloudflare Pages SSR 배포용)
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  output: 'server',
  adapter: cloudflare({
    platformProxy: {
      enabled: true,
    },
  }),
  vite: {
    build: { minify: true },
  },
});
