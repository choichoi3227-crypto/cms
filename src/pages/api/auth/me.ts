// src/pages/api/auth/me.ts
export const prerender = false;

export async function GET({ request, env }: { request: Request; env: any }) {
  try {
    const user = await getSessionUser(request, env);
    if (!user) return Response.json({ error: '인증이 필요합니다.' }, { status: 401 });

    const siteUrl = await env.DB.prepare("SELECT option_value FROM wp_options WHERE option_name='siteurl' LIMIT 1")
      .first<any>().then((r: any) => r?.option_value || '').catch(() => '');

    return Response.json({ user, site_url: siteUrl });
  } catch {
    return Response.json({ error: '서버 오류' }, { status: 500 });
  }
}

// ── 공통 세션 검증 유틸 (다른 API에서 import 가능) ──────────────────────────
export async function getSessionUser(request: Request, env: any): Promise<any | null> {
  const cookie = request.headers.get('cookie') || '';
  const token  = cookie.split(';').map(c=>c.trim()).find(c=>c.startsWith('cp_cms_session='))?.slice('cp_cms_session='.length);
  if (!token) return null;

  try {
    const payload = await verifyJwt(token, env.JWT_SECRET || 'dev-secret');
    if (!payload) return null;

    const user = await env.DB.prepare(
      'SELECT ID, user_login, user_email, display_name FROM wp_users WHERE ID = ? LIMIT 1'
    ).bind(payload.sub).first<any>().catch(() => null);

    return user || null;
  } catch { return null; }
}

async function verifyJwt(token: string, secret: string): Promise<any | null> {
  try {
    const [hB64, cB64, sigB64] = token.split('.');
    if (!hB64 || !cB64 || !sigB64) return null;

    const sigData = `${hB64}.${cB64}`;
    const key = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
    );
    const sig = Uint8Array.from(atob(sigB64.replace(/-/g,'+').replace(/_/g,'/')), c=>c.charCodeAt(0));
    const ok  = await crypto.subtle.verify('HMAC', key, sig, new TextEncoder().encode(sigData));
    if (!ok) return null;

    const claims = JSON.parse(atob(cB64.replace(/-/g,'+').replace(/_/g,'/')));
    if (claims.exp < Math.floor(Date.now()/1000)) return null;
    return claims;
  } catch { return null; }
}
