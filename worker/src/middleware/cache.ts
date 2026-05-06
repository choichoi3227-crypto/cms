import { IRequest } from 'itty-router';
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
  
  // Try cache
  const cacheKey = `page:${url.pathname}${url.search}`;
  const cached = await env.CACHE.get(cacheKey, 'text');
  
  if (cached) {
    const [headers, body] = cached.split('\n---BODY---\n');
    const parsedHeaders = JSON.parse(headers);
    return new Response(body, {
      status: 200,
      headers: { ...parsedHeaders, 'X-Cache': 'HIT' }
    });
  }
  
  return undefined;
}

export async function cacheResponse(
  cacheKey: string,
  response: Response,
  env: Env,
  ttl = 300
): Promise<void> {
  const headers: Record<string, string> = {};
  response.headers.forEach((v, k) => { headers[k] = v; });
  const body = await response.clone().text();
  const cached = JSON.stringify(headers) + '\n---BODY---\n' + body;
  await env.CACHE.put(`page:${cacheKey}`, cached, { expirationTtl: ttl });
}
