// src/middleware.ts
// /admin/* 경로에 대한 인증 가드
// 쿠키에 유효한 cp_cms_session 토큰이 없으면 /login 으로 리다이렉트

import { defineMiddleware } from 'astro:middleware';

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;

  // 보호가 필요 없는 경로
  const publicPaths = ['/login', '/api/auth/login', '/api/auth/logout'];
  const isPublic    = publicPaths.some(p => pathname === p || pathname.startsWith('/api/media/'));

  if (isPublic) return next();

  // /admin/* 경로만 인증 체크
  if (pathname.startsWith('/admin') || pathname.startsWith('/api/')) {
    const cookie   = context.request.headers.get('cookie') || '';
    const token    = cookie.split(';')
      .map(c => c.trim())
      .find(c => c.startsWith('cp_cms_session='))
      ?.slice('cp_cms_session='.length);

    if (!token) {
      // API 요청은 401, 페이지 요청은 리다이렉트
      if (pathname.startsWith('/api/')) {
        return new Response(JSON.stringify({ error: '인증이 필요합니다.' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return context.redirect('/login', 302);
    }

    // JWT 유효성 간단 확인 (만료 체크)
    try {
      const parts   = token.split('.');
      if (parts.length !== 3) throw new Error('invalid');
      const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
      if (payload.exp < Math.floor(Date.now() / 1000)) throw new Error('expired');
    } catch {
      if (pathname.startsWith('/api/')) {
        return new Response(JSON.stringify({ error: '세션이 만료되었습니다.' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return context.redirect('/login', 302);
    }
  }

  return next();
});
