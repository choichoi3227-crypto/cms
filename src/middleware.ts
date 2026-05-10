// src/middleware.ts
// Astro SSR 미들웨어 → Worker 통합 인증 가드
// /admin/* 경로는 Worker의 handleClouPressAdmin이 처리하므로
// Astro pages는 /api/* 엔드포인트만 남김

import { defineMiddleware } from 'astro:middleware';

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;

  // 공개 경로
  if (
    pathname === '/login' ||
    pathname === '/login/' ||
    pathname.startsWith('/api/auth/login') ||
    pathname.startsWith('/api/auth/logout') ||
    pathname.startsWith('/api/media/') ||
    pathname.startsWith('/_astro/') ||
    pathname === '/favicon.ico' ||
    pathname === '/robots.txt'
  ) {
    return next();
  }

  // /admin/* 는 Worker가 처리 (Astro는 개입 안 함)
  if (pathname.startsWith('/admin')) {
    return next();
  }

  // /api/* 는 세션 쿠키 또는 Authorization 헤더로 인증
  if (pathname.startsWith('/api/')) {
    const cookie = context.request.headers.get('cookie') || '';
    const auth = context.request.headers.get('authorization') || '';
    const hasSession = cookie.includes('cp_cms_session=') || auth.startsWith('Bearer ');
    if (!hasSession) {
      return new Response(JSON.stringify({ error: '인증이 필요합니다.', code: 'UNAUTHORIZED' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  return next();
});
