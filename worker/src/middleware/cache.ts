import { IRequest } from '../router';
import { Env } from '../types/env';

export async function cacheMiddleware(
  request: IRequest,
  env: Env,
  ctx: ExecutionContext
): Promise<Response | undefined> {
  // Only cache GET requests for public pages
  if (request.method !== 'GET') return undefined;
  
  const url = new URL(request.url);
  
  // Don't cache admin or API routes
  if (url.pathname.startsWith('/wp-admin') || 
      url.pathname.startsWith('/wp-json') ||
      url.pathname.startsWith('/api') ||
      url.pathname === '/wp-login.php') {
    return undefined;
  }
  
  // Don't cache for logged-in users
  const cookie = request.headers.get('Cookie') || '';
  if (cookie.includes('wordpress_logged_in_')) return undefined;
  
  const generation = await getCacheGeneration(env);
  // A generation is advanced by the Durable Object on content changes. This
  // avoids expensive/non-atomic KV prefix deletion and prevents stale reads.
  const cacheKey = `page:v${generation}:${url.pathname}${url.search}`;
  const cached = await env.CACHE.get(cacheKey, 'text');
  
  if (cached) {
    try {
      const [headers, body] = cached.split('\n---BODY---\n');
      const parsedHeaders = JSON.parse(headers);
      return new Response(body, {
        status: 200,
        headers: { ...parsedHeaders, 'X-Cache': 'HIT' }
      });
    } catch {
      // A damaged entry must never make a public page unavailable.
      await env.CACHE.delete(cacheKey);
    }
  }
  
  return undefined;
}

export async function cacheResponse(
  cacheKey: string,
  response: Response,
  env: Env,
  ttl = 300
): Promise<void> {
  if (!response.ok || response.headers.has('Set-Cookie')) return;
  const headers: Record<string, string> = {};
  response.headers.forEach((v, k) => { headers[k] = v; });
  const body = await response.clone().text();
  const cached = JSON.stringify(headers) + '\n---BODY---\n' + body;
  const generation = await getCacheGeneration(env);
  await env.CACHE.put(`page:v${generation}:${cacheKey}`, cached, { expirationTtl: ttl });
}

/** Invalidate all page keys logically and return after the new generation is durable. */
export async function purgePageCache(env: Env): Promise<void> {
  const id = env.CACHE_COORDINATOR.idFromName('site');
  const response = await env.CACHE_COORDINATOR.get(id).fetch('https://cache.internal/purge', { method: 'POST' });
  if (!response.ok) throw new Error('Cache purge failed');
}

async function getCacheGeneration(env: Env): Promise<number> {
  try {
    const id = env.CACHE_COORDINATOR.idFromName('site');
    const response = await env.CACHE_COORDINATOR.get(id).fetch('https://cache.internal/generation');
    if (!response.ok) return 1;
    const body = await response.json() as { generation?: number };
    return Number.isSafeInteger(body.generation) && body.generation! > 0 ? body.generation! : 1;
  } catch {
    return 1;
  }
}
