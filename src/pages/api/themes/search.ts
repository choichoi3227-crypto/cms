// src/pages/api/themes/search.ts
// GET /api/themes/search?q=keyword&browse=popular&page=1&per_page=12
export const prerender = false;
import { getSessionUser } from '../auth/me';

export async function GET({ request, env }: { request: Request; env: any }) {
  try {
    await getSessionUser(request, env);
    const url     = new URL(request.url);
    const q       = url.searchParams.get('q') || '';
    const browse  = url.searchParams.get('browse') || '';
    const page    = url.searchParams.get('page') || '1';
    const perPage = url.searchParams.get('per_page') || '12';

    const cacheKey = `wp_themes_search:${q}:${browse}:${page}:${perPage}`;
    if (env.CACHE) {
      const cached = await env.CACHE.get(cacheKey).catch(() => null);
      if (cached) return new Response(cached, { headers: { 'Content-Type': 'application/json', 'X-Cache': 'HIT' } });
    }

    let apiUrl: string;
    const base = 'https://api.wordpress.org/themes/info/1.2/?action=query_themes';
    if (browse) {
      apiUrl = `${base}&request[browse]=${browse}&request[page]=${page}&request[per_page]=${perPage}&request[fields][description]=0&request[fields][sections]=0&request[fields][screenshot_url]=1&request[fields][rating]=1&request[fields][active_installs]=1`;
    } else {
      apiUrl = `${base}&request[search]=${encodeURIComponent(q)}&request[page]=${page}&request[per_page]=${perPage}&request[fields][description]=0&request[fields][sections]=0&request[fields][screenshot_url]=1&request[fields][rating]=1&request[fields][active_installs]=1`;
    }

    const res = await fetch(apiUrl, { headers: { 'User-Agent': 'CloudPress/1.0' } });
    if (!res.ok) return Response.json({ error: 'WordPress.org API 오류' }, { status: 502 });

    const data   = await res.json() as any;
    const result = JSON.stringify({ themes: data.themes || [], info: data.info || {}, total: data.info?.results || 0 });

    if (env.CACHE) env.CACHE.put(cacheKey, result, { expirationTtl: 300 }).catch(() => {});
    return new Response(result, { headers: { 'Content-Type': 'application/json' } });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
