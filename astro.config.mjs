// astro.config.mjs — CloudPress CMS
// @astrojs/cloudflare v11 + Astro v4 호환
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  output: 'server',
  adapter: cloudflare({
    platformProxy: {
      enabled: true,
    },
    imageService: 'passthrough',
  }),
  // 미들웨어를 통한 인증 가드 활성화
  // src/middleware.ts 가 자동으로 감지됩니다.
  vite: {
    ssr: {
      external: ['node:buffer', 'node:crypto', 'node:stream', 'node:util'],
      noExternal: ['@php-wasm/web'],
    },
    define: {
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production'),
    },
    build: {
      minify: true,
    },
  },
});
