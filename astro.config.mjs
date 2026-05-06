// astro.config.mjs — CloudPress CMS
// @astrojs/cloudflare v11 + Astro v4 호환
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  output: 'server',
  adapter: cloudflare({
    // v11에서는 mode 옵션 대신 platformProxy 사용
    platformProxy: {
      enabled: true,
    },
    imageService: 'passthrough',
  }),
  vite: {
    ssr: {
      // Cloudflare Workers 환경에서 외부 모듈 처리
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
