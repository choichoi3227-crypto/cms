// astro.config.mjs — CloudPress CMS
// Astro는 /api/* REST 엔드포인트만 담당
// /admin/* UI는 Worker(cloudpress-admin.ts)가 순수 HTML5로 서빙
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  output: 'server',
  adapter: cloudflare({
    platformProxy: { enabled: true },
    imageService: 'passthrough',
    // Worker 엔트리포인트: worker/src/index.ts
    workerEntryPoint: './worker/src/index.ts',
  }),
  vite: {
    ssr: {
      external: ['node:buffer', 'node:crypto', 'node:stream', 'node:util'],
    },
    build: { minify: true },
  },
});
