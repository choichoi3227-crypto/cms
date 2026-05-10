/**
 * CloudPress CMS — Pure HTML5 Worker (Astro 제거)
 * WordPress 호환 CMS on Cloudflare Workers
 */

import { Router, IRequest } from 'itty-router';
import { handleInstall } from './routes/install';
import { handleAdminAPI } from './routes/admin-api';
import { handlePublicAPI } from './routes/public-api';
import { handleWPAPI } from './routes/wp-rest-api';
import { handleFrontend } from './routes/frontend';
import { handleMedia } from './routes/media';
import { authMiddleware } from './middleware/auth';
import { corsMiddleware } from './middleware/cors';
import { cacheMiddleware } from './middleware/cache';
import { handleClouPressAdmin } from './routes/cloudpress-admin';
import { Env } from './types/env';

const router = Router<IRequest, [Env, ExecutionContext]>();

// ─── CORS preflight ───────────────────────────────────────────────
router.options('*', corsMiddleware);

// ─── Installation ─────────────────────────────────────────────────
router.get('/wp-setup', handleInstall);
router.post('/wp-setup/init', handleInstall);
router.all('/wp-setup/*', handleInstall);

// ─── Health check ─────────────────────────────────────────────────
router.get('/api/health', async (_req: IRequest, env: Env) => {
  return new Response(JSON.stringify({ ok: true, version: env.APP_VERSION || '1.0.0' }), {
    headers: { 'Content-Type': 'application/json' }
  });
});

// ─── WordPress REST API (v2 compatible) ───────────────────────────
router.all('/wp-json/*', corsMiddleware, handleWPAPI);

// ─── Admin AJAX ───────────────────────────────────────────────────
router.post('/wp-admin/admin-ajax.php', authMiddleware, handleAdminAPI);
router.all('/wp-admin/admin-post.php', authMiddleware, handleAdminAPI);

// ─── Admin panel (순수 HTML5, Astro 없음) ─────────────────────────
router.get('/wp-admin', authMiddleware, handleAdminAPI);
router.get('/wp-admin/', authMiddleware, handleAdminAPI);
router.all('/wp-admin/*', authMiddleware, handleAdminAPI);

// ─── CloudPress Admin Panel /admin/* (순수 HTML5) ─────────────────────────
router.get('/admin', handleClouPressAdmin);
router.get('/admin/', handleClouPressAdmin);
router.all('/admin/auth/*', handleClouPressAdmin);
router.all('/admin/*', handleClouPressAdmin);

// ─── wp-login ─────────────────────────────────────────────────────
router.all('/wp-login.php', handleAdminAPI);

// ─── Media / uploads ──────────────────────────────────────────────
router.get('/wp-content/uploads/*', handleMedia);
router.get('/wp-content/plugins/*', async (req: IRequest, env: Env) => {
  return handleStaticPluginAsset(req, env);
});
router.get('/wp-content/themes/*', async (req: IRequest, env: Env) => {
  return handleStaticThemeAsset(req, env);
});

// ─── Public API ───────────────────────────────────────────────────
router.all('/api/*', corsMiddleware, handlePublicAPI);

// ─── Frontend (public site) ───────────────────────────────────────
router.get('*', cacheMiddleware, handleFrontend);
router.all('*', handleFrontend);

// ─── Static asset handlers ────────────────────────────────────────
async function handleStaticPluginAsset(req: IRequest, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname.replace('/wp-content/plugins/', '');
  // 플러그인 파일을 DB에서 조회
  try {
    const [slug, ...fileParts] = path.split('/');
    const filePath = fileParts.join('/');
    const row = await env.DB.prepare(
      `SELECT p.files FROM wp_posts p
       JOIN wp_postmeta pm ON p.ID = pm.post_id
       WHERE p.post_type = 'cp_plugin' AND p.post_name = ? AND p.post_status = 'publish'`
    ).bind(slug).first<{ files: string }>();

    if (row?.files) {
      const files = JSON.parse(row.files) as Record<string, string>;
      const content = files[filePath];
      if (content) {
        const mime = getMimeType(filePath);
        return new Response(content, { headers: { 'Content-Type': mime, 'Cache-Control': 'public, max-age=3600' } });
      }
    }
  } catch {}
  return new Response('Not Found', { status: 404 });
}

async function handleStaticThemeAsset(req: IRequest, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname.replace('/wp-content/themes/', '');
  try {
    const [slug, ...fileParts] = path.split('/');
    const filePath = fileParts.join('/');
    const row = await env.DB.prepare(
      `SELECT p.post_content FROM wp_posts p
       WHERE p.post_type = 'cp_theme' AND p.post_name = ? AND p.post_status = 'publish'`
    ).bind(`${slug}/${filePath}`).first<{ post_content: string }>();

    if (row?.post_content) {
      const mime = getMimeType(filePath);
      return new Response(row.post_content, { headers: { 'Content-Type': mime, 'Cache-Control': 'public, max-age=3600' } });
    }
  } catch {}
  return new Response('Not Found', { status: 404 });
}

function getMimeType(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase();
  const map: Record<string, string> = {
    js: 'application/javascript', css: 'text/css',
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    gif: 'image/gif', svg: 'image/svg+xml', ico: 'image/x-icon',
    woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf',
    json: 'application/json', xml: 'application/xml',
  };
  return map[ext || ''] || 'text/plain';
}

// ─── Default export ───────────────────────────────────────────────
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      const url = new URL(request.url);

      // 설치 여부 확인 (OPTIONS KV 사용)
      const installed = await env.OPTIONS.get('siteurl').catch(() => null);

      if (!installed &&
          !url.pathname.startsWith('/wp-setup') &&
          !url.pathname.startsWith('/api/') &&
          !url.pathname.startsWith('/wp-json/')) {
        return Response.redirect(`${url.origin}/wp-setup`, 302);
      }

      return await router.fetch(request, env, ctx) ?? new Response('Not Found', { status: 404 });
    } catch (err) {
      console.error('Worker error:', err);
      return new Response(JSON.stringify({ error: 'Internal Server Error', message: String(err) }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(handleScheduled(event, env));
  }
};

async function handleScheduled(_event: ScheduledEvent, env: Env): Promise<void> {
  const now = new Date().toISOString();
  // 예약 발행
  await env.DB.prepare(
    `UPDATE wp_posts SET post_status = 'publish', post_modified = ?, post_modified_gmt = ?
     WHERE post_status = 'future' AND post_date <= ?`
  ).bind(now, now, now).run().catch(() => {});
  // 옵션 캐시 갱신
  await env.OPTIONS.delete('opt:siteurl').catch(() => {});
}
