// src/middleware.ts
// 정적 빌드(output: 'static')에서는 미들웨어가 실행되지 않습니다.
// 인증 가드는 클라이언트 사이드 JS 또는 백엔드 API 서버에서 처리하세요.

import { defineMiddleware } from 'astro:middleware';

export const onRequest = defineMiddleware((_context, next) => next());
