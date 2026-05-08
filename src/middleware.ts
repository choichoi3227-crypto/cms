// src/middleware.ts
// /admin/* 와 /api/* 경로에 대한 인증 가드
import { defineMiddleware } from 'astro:middleware';

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;

  // 인증 없이 접근 가능한 경로
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

  // /admin/* 또는 /api/* 는 인증 필요
  if (pathname.startsWith('/admin') || pathname.startsWith('/api/')) {
    const cookie = context.request.headers.get('cookie') || '';
    const token  = cookie
      .split(';')
      .map(c => c.trim())
      .find(c => c.startsWith('cp_cms_session='))
      ?.slice('cp_cms_session='.length);

    if (!token) {
      if (pathname.startsWith('/api/')) {
        return new Response(
          JSON.stringify({ error: '인증이 필요합니다.' }),
          { status: 401, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return context.redirect('/login', 302);
    }

    // JWT 만료 체크
    try {
      const parts = token.split('.');
      if (parts.length !== 3) throw new Error('invalid');
      const payload = JSON.parse(
        atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))
      );
      if (payload.exp < Math.floor(Date.now() / 1000)) throw new Error('expired');
    } catch {
      if (pathname.startsWith('/api/')) {
        return new Response(
          JSON.stringify({ error: '세션이 만료되었습니다.' }),
          { status: 401, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return context.redirect('/login', 302);
    }
  }

  return next();
});
