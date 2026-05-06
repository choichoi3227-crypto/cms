/**
 * CF-WordPress: WordPress-compatible CMS on Cloudflare Workers
 * Main entry point
 */

import { Router, IRequest } from 'itty-router';
import { handleInstall } from './routes/install';
import { handleAdminAPI } from './routes/admin-api';
import { handlePublicAPI } from './routes/public-api';
import { handleWPAPI } from './routes/wp-rest-api';
import { handleFrontend } from './routes/frontend';
import { handleMedia } from './routes/media';
import { handlePluginProxy } from './routes/plugin-proxy';
import { authMiddleware } from './middleware/auth';
import { corsMiddleware } from './middleware/cors';
import { cacheMiddleware } from './middleware/cache';
import { Env } from './types/env';

const router = Router<IRequest, [Env, ExecutionContext]>();

// ─── CORS preflight ───────────────────────────────────────────────
router.options('*', corsMiddleware);

// ─── Installation ─────────────────────────────────────────────────
router.get('/wp-setup', handleInstall);
router.post('/wp-setup/init', handleInstall);
router.all('/wp-setup/*', handleInstall);

// ─── WordPress REST API (v2 compatible) ───────────────────────────
router.all('/wp-json/*', corsMiddleware, handleWPAPI);

// ─── Admin AJAX (WordPress compatible) ────────────────────────────
router.post('/wp-admin/admin-ajax.php', authMiddleware, handleAdminAPI);
router.all('/wp-admin/admin-post.php', authMiddleware, handleAdminAPI);

// ─── Admin panel ──────────────────────────────────────────────────
router.get('/wp-admin', authMiddleware, handleAdminAPI);
router.get('/wp-admin/', authMiddleware, handleAdminAPI);
router.all('/wp-admin/*', authMiddleware, handleAdminAPI);

// ─── wp-login ─────────────────────────────────────────────────────
router.all('/wp-login.php', handleAdminAPI);

// ─── Media / uploads ──────────────────────────────────────────────
router.get('/wp-content/uploads/*', handleMedia);
router.get('/wp-content/plugins/*', handlePluginProxy);
router.get('/wp-content/themes/*', handlePluginProxy);

// ─── Public API (internal) ────────────────────────────────────────
router.all('/api/*', handlePublicAPI);

// ─── Frontend (public site) ───────────────────────────────────────
router.get('*', cacheMiddleware, handleFrontend);
router.all('*', handleFrontend);

// ─── Default export ───────────────────────────────────────────────
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      // Check if installed
      const installed = await env.OPTIONS.get('siteurl');
      const url = new URL(request.url);
      
      if (!installed && !url.pathname.startsWith('/wp-setup') && !url.pathname.startsWith('/api/')) {
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
    // Cron jobs: cache purge, scheduled posts, etc.
    ctx.waitUntil(handleScheduled(event, env));
  }
};

async function handleScheduled(event: ScheduledEvent, env: Env): Promise<void> {
  const now = new Date().toISOString();
  // Publish scheduled posts
  await env.DB.prepare(
    `UPDATE wp_posts SET post_status = 'publish' WHERE post_status = 'future' AND post_date <= ?`
  ).bind(now).run();
}
