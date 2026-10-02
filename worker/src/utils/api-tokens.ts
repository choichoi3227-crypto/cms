import { Env } from '../types/env';

export const API_SCOPES = ['site:read', 'content:read', 'content:write', 'users:manage'] as const;
export type ApiScope = typeof API_SCOPES[number];
type TokenRow = { id: number; token_type: 'public' | 'secret'; scopes: string; expires_at: string | null; revoked_at: string | null };

export async function issueApiToken(env: Env, input: { name: string; type: 'public' | 'secret'; scopes: ApiScope[]; createdBy: number; expiresAt?: string }): Promise<string> {
  const prefix = input.type === 'public' ? 'cp_pub_' : 'cp_sec_';
  const token = `${prefix}${randomToken()}`;
  await env.DB.prepare(
    'INSERT INTO wp_api_tokens (name, token_hash, token_type, scopes, created_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(input.name, await hashToken(token), input.type, JSON.stringify(input.scopes), input.createdBy, new Date().toISOString(), input.expiresAt || null).run();
  return token;
}

export async function authenticateApiToken(request: Request, env: Env, requiredScope: ApiScope): Promise<{ id: number; type: 'public' | 'secret'; scopes: ApiScope[] } | null> {
  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') || request.headers.get('X-API-Key') || '';
  if (!token.startsWith('cp_pub_') && !token.startsWith('cp_sec_')) return null;
  const row = await env.DB.prepare('SELECT id, token_type, scopes, expires_at, revoked_at FROM wp_api_tokens WHERE token_hash = ?').bind(await hashToken(token)).first<TokenRow>();
  if (!row || row.revoked_at || (row.expires_at && Date.parse(row.expires_at) <= Date.now())) return null;
  const scopes = JSON.parse(row.scopes) as ApiScope[];
  if (!scopes.includes(requiredScope)) return null;
  await env.DB.prepare('UPDATE wp_api_tokens SET last_used_at = ? WHERE id = ?').bind(new Date().toISOString(), row.id).run();
  return { id: row.id, type: row.token_type, scopes };
}

export async function hashToken(token: string): Promise<string> {
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, b => b.toString(36).padStart(2, '0')).join('');
}
