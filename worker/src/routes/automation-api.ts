import { IRequest } from '../router';
import { Env } from '../types/env';
import { API_SCOPES, ApiScope, authenticateApiToken, issueApiToken } from '../utils/api-tokens';

export async function handleAutomationAPI(request: IRequest, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace('/api/v1', '');
  if (path === '/health' && request.method === 'GET') return json({ ok: true, version: env.APP_VERSION });

  if (path === '/tokens' && request.method === 'POST') return createToken(request, env);
  const revoke = path.match(/^\/tokens\/(\d+)$/);
  if (revoke && request.method === 'DELETE') return revokeToken(request, env, Number(revoke[1]));

  const requiredScope: ApiScope = request.method === 'GET' ? 'site:read' : 'content:write';
  const token = await authenticateApiToken(request, env, requiredScope);
  if (!token) return json({ error: 'unauthorized', message: 'A valid API token with the required scope is required.' }, 401);
  if (path === '/site' && request.method === 'GET') {
    const rows = await env.DB.prepare("SELECT option_name, option_value FROM wp_options WHERE option_name IN ('blogname', 'siteurl', 'blogdescription')").all<{ option_name: string; option_value: string }>();
    return json({ site: Object.fromEntries(rows.results.map(row => [row.option_name, row.option_value])), token_type: token.type });
  }
  return json({ error: 'not_found' }, 404);
}

async function createToken(request: IRequest, env: Env): Promise<Response> {
  const session = await adminSession(request, env);
  if (!session) return json({ error: 'forbidden', message: 'Administrator session required to issue tokens.' }, 403);
  const body = await request.json().catch(() => null) as { name?: string; type?: string; scopes?: string[]; expires_at?: string } | null;
  if (!body?.name || (body.type !== 'public' && body.type !== 'secret')) return json({ error: 'invalid_request' }, 400);
  const scopes = (body.scopes || []).filter((scope): scope is ApiScope => API_SCOPES.includes(scope as ApiScope));
  if (!scopes.length) return json({ error: 'invalid_scopes', allowed: API_SCOPES }, 400);
  const token = await issueApiToken(env, { name: body.name.slice(0, 100), type: body.type, scopes, createdBy: session.userId, expiresAt: body.expires_at });
  return json({ token, type: body.type, scopes, warning: 'Copy this token now. It is never returned again.' }, 201);
}

async function revokeToken(request: IRequest, env: Env, id: number): Promise<Response> {
  if (!await adminSession(request, env)) return json({ error: 'forbidden' }, 403);
  await env.DB.prepare('UPDATE wp_api_tokens SET revoked_at = ? WHERE id = ?').bind(new Date().toISOString(), id).run();
  return json({ revoked: true });
}

async function adminSession(request: Request, env: Env): Promise<{ userId: number } | null> {
  const cookie = request.headers.get('Cookie') || '';
  const token = request.headers.get('X-WP-Nonce') || request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') || cookie.match(/wordpress_logged_in_[^=]+=([^;]+)/)?.[1]?.split('|')[2];
  if (!token) return null;
  const session = await env.SESSIONS.get<{ userId: number; roles: string[] }>(`session:${token}`, 'json');
  return session?.roles.includes('administrator') ? { userId: session.userId } : null;
}

function json(value: unknown, status = 200): Response { return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } }); }
