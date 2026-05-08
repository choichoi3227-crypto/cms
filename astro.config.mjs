// astro.config.mjs — CloudPress CMS
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  output: 'server',
  adapter: cloudflare({
    platformProxy: { enabled: true },
    imageService: 'passthrough',
  }),
  vite: {
    ssr: {
      external: ['node:buffer', 'node:crypto', 'node:stream', 'node:util'],
    },
    build: { minify: true },
  },
});
