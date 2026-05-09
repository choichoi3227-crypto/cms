// src/pages/api/tools/clear-cache.ts
export const prerender = false;
import { getSessionUser } from '../auth/me';

export async function POST({ request, env }: { request: Request; env: any }) {
  try {
    await getSessionUser(request, env);
    // KV 캐시 키 목록 가져와서 삭제
    if (env.CACHE) {
      const list = await env.CACHE.list().catch(() => ({ keys: [] }));
      const keys = list?.keys || [];
      await Promise.all(keys.map((k: any) => env.CACHE.delete(k.name).catch(() => {})));
      return Response.json({ success: true, cleared: keys.length });
    }
    return Response.json({ success: true, cleared: 0, note: 'KV 캐시 없음' });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
