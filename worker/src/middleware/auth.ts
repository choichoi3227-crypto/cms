import { IRequest } from 'itty-router';
import { Env, SessionData } from '../types/env';

export async function authMiddleware(
  request: IRequest,
  env: Env,
  ctx: ExecutionContext
): Promise<Response | undefined> {
  const url = new URL(request.url);
  
  // wp-login.php is public
  if (url.pathname === '/wp-login.php') return undefined;
  
  // Check session cookie or Authorization header
  const sessionToken = getSessionToken(request);
  
  if (!sessionToken) {
    if (url.pathname.startsWith('/wp-admin/admin-ajax.php')) {
      // AJAX: return JSON error
      const action = (await request.clone().formData().catch(() => new FormData())).get('action');
      if (action && !requiresAuth(String(action))) return undefined;
      return new Response(JSON.stringify({ success: false, data: '-1' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    return redirectToLogin(url);
  }

  const session = await env.SESSIONS.get<SessionData>(`session:${sessionToken}`, 'json');
  
  if (!session || session.expires < Date.now()) {
    return redirectToLogin(url);
  }

  // Attach session to request
  (request as any).session = session;
  (request as any).sessionToken = sessionToken;
  
  return undefined;
}

function getSessionToken(request: IRequest): string | null {
  // Check Authorization: Bearer token
  const auth = request.headers.get('Authorization');
  if (auth?.startsWith('Bearer ')) return auth.slice(7);
  
  // Check cookie
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(/wordpress_logged_in_[^=]+=([^;]+)/);
  if (match) return decodeURIComponent(match[1]).split('|')[2] || null;
  
  // Check X-WP-Nonce style token
  const wpToken = request.headers.get('X-WP-Nonce');
  if (wpToken) return wpToken;
  
  return null;
}

function redirectToLogin(url: URL): Response {
  const redirect = encodeURIComponent(url.pathname + url.search);
  return Response.redirect(`${url.origin}/wp-login.php?redirect_to=${redirect}`, 302);
}

function requiresAuth(action: string): boolean {
  const publicActions = ['heartbeat', 'get_refreshed_fragments'];
  return !publicActions.includes(action);
}

export async function createSession(
  userId: number,
  userLogin: string,
  userEmail: string,
  roles: string[],
  env: Env
): Promise<string> {
  const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
  const session: SessionData = {
    userId,
    userLogin,
    userEmail,
    roles,
    capabilities: buildCapabilities(roles),
    expires: Date.now() + 14 * 24 * 60 * 60 * 1000 // 14 days
  };
  
  await env.SESSIONS.put(`session:${token}`, JSON.stringify(session), {
    expirationTtl: 14 * 24 * 60 * 60
  });
  
  return token;
}

export function buildCapabilities(roles: string[]): Record<string, boolean> {
  const caps: Record<string, boolean> = {};
  
  if (roles.includes('administrator')) {
    const adminCaps = [
      'activate_plugins', 'delete_others_pages', 'delete_others_posts',
      'delete_pages', 'delete_posts', 'delete_private_pages', 'delete_private_posts',
      'delete_published_pages', 'delete_published_posts', 'edit_dashboard',
      'edit_others_pages', 'edit_others_posts', 'edit_pages', 'edit_posts',
      'edit_private_pages', 'edit_private_posts', 'edit_published_pages',
      'edit_published_posts', 'edit_theme_options', 'export', 'import',
      'list_users', 'manage_categories', 'manage_links', 'manage_options',
      'moderate_comments', 'promote_users', 'publish_pages', 'publish_posts',
      'read_private_pages', 'read_private_posts', 'read', 'remove_users',
      'switch_themes', 'upload_files', 'customize', 'delete_site',
      'update_core', 'update_plugins', 'update_themes', 'install_plugins',
      'install_themes', 'delete_plugins', 'delete_themes', 'delete_users',
      'create_users', 'unfiltered_upload', 'unfiltered_html', 'edit_files',
      'edit_plugins', 'edit_themes', 'edit_users'
    ];
    adminCaps.forEach(cap => { caps[cap] = true; });
  }
  
  if (roles.includes('editor')) {
    const editorCaps = [
      'delete_others_pages', 'delete_others_posts', 'delete_pages', 'delete_posts',
      'delete_private_pages', 'delete_private_posts', 'delete_published_pages',
      'delete_published_posts', 'edit_others_pages', 'edit_others_posts',
      'edit_pages', 'edit_posts', 'edit_private_pages', 'edit_private_posts',
      'edit_published_pages', 'edit_published_posts', 'manage_categories',
      'manage_links', 'moderate_comments', 'publish_pages', 'publish_posts',
      'read', 'read_private_pages', 'read_private_posts', 'upload_files', 'unfiltered_html'
    ];
    editorCaps.forEach(cap => { caps[cap] = true; });
  }
  
  return caps;
}
