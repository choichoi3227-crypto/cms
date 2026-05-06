import { IRequest } from 'itty-router';
import { Env, SessionData } from '../types/env';
import { createDB } from '../utils/db';
import { createSession, authMiddleware } from '../middleware/auth';
import { checkPassword, generateNonce } from '../utils/crypto';
import { createGithubStorage } from '../utils/github';
import { PluginRegistry, loadBuiltinPlugin } from '../utils/plugins';
import { renderAdminPage } from '../admin/admin-renderer';

export async function handleAdminAPI(request: IRequest, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const db = createDB(env);

  // ── Login page ────────────────────────────────────────────────────
  if (path === '/wp-login.php') {
    return handleLogin(request, env, db, url);
  }

  // ── Logout ────────────────────────────────────────────────────────
  if (url.searchParams.get('action') === 'logout') {
    const token = getSessionToken(request);
    if (token) await env.SESSIONS.delete(`session:${token}`);
    return Response.redirect(`${url.origin}/wp-login.php?loggedout=true`, 302);
  }

  // ── Session check ─────────────────────────────────────────────────
  const session = (request as any).session as SessionData | undefined;
  if (!session) return Response.redirect(`${url.origin}/wp-login.php`, 302);

  // ── Plugin registry ───────────────────────────────────────────────
  const registry = await buildPluginRegistry(db, env);

  // ── Admin AJAX ────────────────────────────────────────────────────
  if (path === '/wp-admin/admin-ajax.php' || path === '/wp-admin/admin-post.php') {
    return handleAdminAjax(request, env, db, session, registry, url);
  }

  // ── Redirect /wp-admin → /wp-admin/index.php ─────────────────────
  if (path === '/wp-admin' || path === '/wp-admin/') {
    return Response.redirect(`${url.origin}/wp-admin/index.php`, 302);
  }

  // ── Render admin page ─────────────────────────────────────────────
  const github = await createGithubStorage(env.DB, env.OPTIONS);
  const html = await renderAdminPage(path, url, request, session, db, env, registry, github);
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

async function handleLogin(request: IRequest, env: Env, db: ReturnType<typeof createDB>, url: URL): Promise<Response> {
  const loggedOut = url.searchParams.get('loggedout') === 'true';
  const redirectTo = url.searchParams.get('redirect_to') || '/wp-admin/';

  if (request.method === 'POST') {
    const body = await request.formData().catch(() => new FormData());
    const login = String(body.get('log') || '');
    const password = String(body.get('pwd') || '');
    const rememberMe = body.get('rememberme') === 'forever';

    const user = await db.getUserByLogin(login) || await (async () => {
      // Try email login
      const u = await db.getUserByEmail(login);
      if (!u) return null;
      return db.getUserByLogin(u.user_login);
    })();

    if (!user) {
      return new Response(renderLoginPage(url.origin, 'invalid_username', redirectTo), {
        status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    }

    const valid = await checkPassword(password, user.user_pass);
    if (!valid) {
      return new Response(renderLoginPage(url.origin, 'incorrect_password', redirectTo), {
        status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    }

    // Build session
    const capsMeta = await db.getUserMeta(user.ID, 'wp_capabilities');
    let roles: string[] = ['subscriber'];
    try { const caps = JSON.parse(capsMeta); roles = Object.keys(caps).filter(k => caps[k]); } catch {}

    const token = await createSession(user.ID, user.user_login, user.user_email, roles, env);
    const ttl = rememberMe ? 14 * 24 * 60 * 60 : 2 * 24 * 60 * 60;
    const cookieVal = `${user.user_login}|${Date.now() + ttl * 1000}|${token}|${user.user_login}`;
    const cookie = [
      `wordpress_logged_in_cfwp=${encodeURIComponent(cookieVal)}`,
      `Path=/`, `HttpOnly`, `SameSite=Lax`,
      `Max-Age=${ttl}`
    ].join('; ');

    const dest = redirectTo.startsWith('/') ? `${url.origin}${redirectTo}` : redirectTo;
    return new Response(null, {
      status: 302,
      headers: { 'Location': dest, 'Set-Cookie': cookie }
    });
  }

  return new Response(renderLoginPage(url.origin, loggedOut ? 'loggedout' : '', redirectTo), {
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
}

async function handleAdminAjax(
  request: IRequest,
  env: Env,
  db: ReturnType<typeof createDB>,
  session: SessionData,
  registry: PluginRegistry,
  url: URL
): Promise<Response> {
  let action = url.searchParams.get('action') || '';
  let formData = new FormData();

  if (request.method === 'POST') {
    const ct = request.headers.get('Content-Type') || '';
    if (ct.includes('application/json')) {
      const json = await request.json().catch(() => ({})) as Record<string, string>;
      action = action || json.action || '';
      // Convert to FormData-like
      formData = new FormData();
      Object.entries(json).forEach(([k, v]) => formData.set(k, String(v)));
    } else {
      formData = await request.formData().catch(() => new FormData());
      action = action || String(formData.get('action') || '');
    }
  }

  // Built-in AJAX handlers
  switch (action) {
    case 'heartbeat':
      return jsonResponse({ success: true, data: { nonces: { heartbeat: generateNonce('heartbeat', session.userId) } } });

    case 'save-widget':
    case 'wp-remove-post-lock':
    case 'get-post-thumbnail-html':
      return jsonResponse({ success: true, data: '' });

    case 'wp_ajax_query-themes':
      return handleQueryThemes(formData, env);

    case 'query-themes':
      return handleQueryThemes(formData, env);

    case 'install-plugin':
      return handleInstallPlugin(formData, db, env, session);

    case 'activate-plugin':
      return handleActivatePlugin(formData, db, env);

    case 'deactivate-plugin':
      return handleDeactivatePlugin(formData, db, env);

    case 'delete-plugin':
      return handleDeletePlugin(formData, db, env);

    case 'install-theme':
      return handleInstallTheme(formData, db, env, session);

    case 'activate-theme':
      return handleActivateTheme(formData, db, env);

    case 'wp_ajax_upload-attachment':
    case 'upload-attachment':
      return handleUploadMedia(request, db, env, session);

    case 'add-tag':
      return handleAddTerm(formData, db, 'post_tag');

    case 'add-category':
      return handleAddTerm(formData, db, 'category');

    case 'delete-tag':
    case 'delete-category':
      return handleDeleteTerm(formData, db);

    case 'get-comments':
      return handleGetComments(formData, db);

    case 'edit-comment':
      return handleEditComment(formData, db, session);

    case 'delete-comment':
      return handleDeleteComment(formData, db, session);

    case 'approve-comment':
      return handleApproveComment(formData, db, '1');

    case 'unapprove-comment':
      return handleApproveComment(formData, db, '0');

    case 'spam-comment':
      return handleApproveComment(formData, db, 'spam');

    case 'wp-link-ajax':
      return handleLinkSearch(formData, db);

    case 'menu-save':
    case 'menu-locations-save':
      return handleMenuSave(formData, db, env);

    case 'media-form':
      return jsonResponse({ success: true, data: { id: 0 } });

    case 'search-plugins':
      return handleSearchPlugins(formData);

    case 'update-plugin':
    case 'update-theme':
      return jsonResponse({ success: true, data: { message: '최신 버전입니다.' } });
  }

  // Plugin AJAX handlers
  const pluginHandler = registry.getAjaxHandler(action);
  if (pluginHandler) {
    try {
      const result = await pluginHandler.callback(request, formData);
      return jsonResponse(result);
    } catch (e) {
      return jsonResponse({ success: false, data: String(e) });
    }
  }

  // nopriv handlers
  const noprivHandler = registry.getAjaxHandler(`nopriv_${action}`);
  if (noprivHandler) {
    try {
      const result = await noprivHandler.callback(request, formData);
      return jsonResponse(result);
    } catch (e) {
      return jsonResponse({ success: false, data: String(e) });
    }
  }

  return jsonResponse({ success: false, data: '-1' });
}

// ─── AJAX handler implementations ────────────────────────────────────

async function handleQueryThemes(formData: FormData, env: Env): Promise<Response> {
  const search = String(formData.get('request[search]') || '');
  try {
    const res = await fetch(`https://api.wordpress.org/themes/info/1.1/?action=query_themes&request[search]=${encodeURIComponent(search)}&request[per_page]=12&request[fields][screenshot_url]=true`);
    const data = await res.json();
    return jsonResponse({ success: true, data });
  } catch {
    return jsonResponse({ success: false, data: 'Failed to fetch themes' });
  }
}

async function handleInstallPlugin(formData: FormData, db: ReturnType<typeof createDB>, env: Env, session: SessionData): Promise<Response> {
  const slug = String(formData.get('slug') || '');
  if (!slug) return jsonResponse({ success: false, data: 'slug required' });

  try {
    // Fetch plugin info from WordPress.org
    const infoRes = await fetch(`https://api.wordpress.org/plugins/info/1.0/${slug}.json`);
    if (!infoRes.ok) return jsonResponse({ success: false, data: '플러그인을 찾을 수 없습니다.' });
    const info = await infoRes.json() as { name: string; version: string; download_link: string };

    // Download and store plugin metadata
    const activePlugins = JSON.parse(await db.getOption('active_plugins', '[]'));
    const pluginEntry = `${slug}/${slug}.php`;

    if (!activePlugins.includes(pluginEntry)) {
      // Store plugin info
      await db.updateOption(`plugin_${slug}_info`, JSON.stringify(info));
      await db.updateOption(`plugin_${slug}_version`, info.version || '1.0.0');
    }

    return jsonResponse({ success: true, data: { slug, name: info.name } });
  } catch (e) {
    return jsonResponse({ success: false, data: String(e) });
  }
}

async function handleActivatePlugin(formData: FormData, db: ReturnType<typeof createDB>, env: Env): Promise<Response> {
  const plugin = String(formData.get('plugin') || '');
  if (!plugin) return jsonResponse({ success: false, data: 'plugin required' });

  const slug = plugin.split('/')[0];
  const activePlugins = JSON.parse(await db.getOption('active_plugins', '[]'));
  if (!activePlugins.includes(plugin)) {
    activePlugins.push(plugin);
    await db.updateOption('active_plugins', JSON.stringify(activePlugins));
    await env.OPTIONS.put('opt:active_plugins', JSON.stringify(activePlugins));
  }
  return jsonResponse({ success: true, data: { activated: plugin } });
}

async function handleDeactivatePlugin(formData: FormData, db: ReturnType<typeof createDB>, env: Env): Promise<Response> {
  const plugin = String(formData.get('plugin') || '');
  let activePlugins = JSON.parse(await db.getOption('active_plugins', '[]'));
  activePlugins = activePlugins.filter((p: string) => p !== plugin);
  await db.updateOption('active_plugins', JSON.stringify(activePlugins));
  await env.OPTIONS.put('opt:active_plugins', JSON.stringify(activePlugins));
  return jsonResponse({ success: true });
}

async function handleDeletePlugin(formData: FormData, db: ReturnType<typeof createDB>, env: Env): Promise<Response> {
  const plugin = String(formData.get('plugin') || '');
  const slug = plugin.split('/')[0];
  let activePlugins = JSON.parse(await db.getOption('active_plugins', '[]'));
  activePlugins = activePlugins.filter((p: string) => p !== plugin);
  await db.updateOption('active_plugins', JSON.stringify(activePlugins));
  await db.deleteOption(`plugin_${slug}_info`);
  return jsonResponse({ success: true });
}

async function handleInstallTheme(formData: FormData, db: ReturnType<typeof createDB>, env: Env, session: SessionData): Promise<Response> {
  const slug = String(formData.get('slug') || '');
  if (!slug) return jsonResponse({ success: false, data: 'slug required' });
  try {
    const infoRes = await fetch(`https://api.wordpress.org/themes/info/1.1/?action=theme_information&request[slug]=${slug}`);
    const info = await infoRes.json() as { name: string; version: string; download_link: string };
    await db.updateOption(`theme_${slug}_info`, JSON.stringify(info));
    return jsonResponse({ success: true, data: { slug, name: info.name } });
  } catch (e) {
    return jsonResponse({ success: false, data: String(e) });
  }
}

async function handleActivateTheme(formData: FormData, db: ReturnType<typeof createDB>, env: Env): Promise<Response> {
  const stylesheet = String(formData.get('stylesheet') || '');
  if (!stylesheet) return jsonResponse({ success: false, data: 'stylesheet required' });
  await db.updateOption('template', stylesheet);
  await db.updateOption('stylesheet', stylesheet);
  await env.OPTIONS.put('opt:template', stylesheet);
  await env.OPTIONS.put('opt:stylesheet', stylesheet);
  return jsonResponse({ success: true });
}

async function handleUploadMedia(request: IRequest, db: ReturnType<typeof createDB>, env: Env, session: SessionData): Promise<Response> {
  try {
    const formData = await request.formData();
    const file = formData.get('async-upload') as File | null;
    if (!file) return jsonResponse({ success: false, data: 'No file' });

    const buffer = await file.arrayBuffer();
    const filename = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const mimeType = file.type || 'application/octet-stream';
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');

    const siteUrl = await db.getOption('siteurl');
    const github = await createGithubStorage(env.DB, env.OPTIONS);

    let fileUrl = '';
    if (github) {
      const path = await github.uploadMedia(filename, buffer, mimeType);
      if (path) fileUrl = github.getRawUrl(path);
    } else {
      // Store in KV as base64
      const b64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
      await env.CACHE.put(`media:${year}/${month}/${filename}`, b64, { expirationTtl: 365 * 24 * 3600 });
      fileUrl = `${siteUrl}/wp-content/uploads/${year}/${month}/${filename}`;
    }

    // Create attachment post
    const nowStr = now.toISOString().replace('T', ' ').split('.')[0];
    const attachId = await db.insertPost({
      post_author: session.userId,
      post_date: nowStr,
      post_date_gmt: nowStr,
      post_content: '',
      post_title: file.name,
      post_status: 'inherit',
      post_type: 'attachment',
      post_mime_type: mimeType,
      post_name: filename,
      guid: fileUrl,
    });

    await db.updatePostMeta(attachId, '_wp_attached_file', `${year}/${month}/${filename}`);
    await db.updatePostMeta(attachId, '_wp_attachment_metadata', JSON.stringify({
      width: 0, height: 0, file: `${year}/${month}/${filename}`,
      sizes: {}
    }));

    return jsonResponse({
      success: true,
      data: {
        id: attachId,
        url: fileUrl,
        type: mimeType,
        filename,
        title: file.name,
        caption: '',
        description: '',
        alt: '',
        sizes: { thumbnail: { url: fileUrl, width: 150, height: 150 } }
      }
    });
  } catch (e) {
    return jsonResponse({ success: false, data: String(e) });
  }
}

async function handleAddTerm(formData: FormData, db: ReturnType<typeof createDB>, taxonomy: string): Promise<Response> {
  const name = String(formData.get('tag-name') || formData.get('name') || '');
  if (!name) return jsonResponse({ success: false, data: '이름이 필요합니다.' });
  const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  const termId = await db.insertTerm(name, taxonomy, { slug });
  return jsonResponse({ success: true, data: { term_id: termId, name, slug, count: 0 } });
}

async function handleDeleteTerm(formData: FormData, db: ReturnType<typeof createDB>): Promise<Response> {
  const id = parseInt(String(formData.get('id') || '0'));
  if (!id) return jsonResponse({ success: false, data: 'id required' });
  await db['db'].prepare('DELETE FROM wp_term_taxonomy WHERE term_id = ?').bind(id).run();
  await db['db'].prepare('DELETE FROM wp_terms WHERE term_id = ?').bind(id).run();
  return jsonResponse({ success: true });
}

async function handleGetComments(formData: FormData, db: ReturnType<typeof createDB>): Promise<Response> {
  const postId = parseInt(String(formData.get('p') || '0'));
  const comments = await db.getComments(postId, '1');
  return jsonResponse({ success: true, data: { comments } });
}

async function handleEditComment(formData: FormData, db: ReturnType<typeof createDB>, session: SessionData): Promise<Response> {
  const id = parseInt(String(formData.get('comment_ID') || '0'));
  const content = String(formData.get('content') || '');
  await db['db'].prepare('UPDATE wp_comments SET comment_content = ? WHERE comment_ID = ?').bind(content, id).run();
  return jsonResponse({ success: true });
}

async function handleDeleteComment(formData: FormData, db: ReturnType<typeof createDB>, session: SessionData): Promise<Response> {
  const id = parseInt(String(formData.get('id') || '0'));
  await db['db'].prepare('DELETE FROM wp_comments WHERE comment_ID = ?').bind(id).run();
  return jsonResponse({ success: true });
}

async function handleApproveComment(formData: FormData, db: ReturnType<typeof createDB>, status: string): Promise<Response> {
  const id = parseInt(String(formData.get('id') || '0'));
  await db['db'].prepare('UPDATE wp_comments SET comment_approved = ? WHERE comment_ID = ?').bind(status, id).run();
  return jsonResponse({ success: true });
}

async function handleLinkSearch(formData: FormData, db: ReturnType<typeof createDB>): Promise<Response> {
  const s = String(formData.get('search') || '');
  const posts = await db.getPosts({ search: s, posts_per_page: 20 });
  return jsonResponse(posts.map(p => ({ ID: p.ID, title: p.post_title, permalink: `/${p.post_name}/` })));
}

async function handleMenuSave(formData: FormData, db: ReturnType<typeof createDB>, env: Env): Promise<Response> {
  const menu = JSON.stringify(Object.fromEntries(formData));
  await db.updateOption('nav_menu_data', menu);
  return jsonResponse({ success: true });
}

async function handleSearchPlugins(formData: FormData): Promise<Response> {
  const s = String(formData.get('s') || '');
  try {
    const res = await fetch(`https://api.wordpress.org/plugins/info/1.2/?action=query_plugins&request[search]=${encodeURIComponent(s)}&request[per_page]=12`);
    const data = await res.json();
    return jsonResponse({ success: true, data });
  } catch {
    return jsonResponse({ success: false, data: [] });
  }
}

// ─── Plugin registry builder ──────────────────────────────────────────

export async function buildPluginRegistry(db: ReturnType<typeof createDB>, env: Env): Promise<PluginRegistry> {
  const registry = new PluginRegistry();
  const activePluginsStr = await db.getOption('active_plugins', '[]');
  let activePlugins: string[] = [];
  try { activePlugins = JSON.parse(activePluginsStr); } catch {}

  // Load builtin plugins
  const builtins = ['aibp-pro', 'alpack', 'bridge-migration', 'wp-rocket'];
  for (const slug of builtins) {
    const pluginEntry = `${slug}/${slug}.php`;
    const altEntry = `${slug}/index.php`;
    if (activePlugins.some(p => p.startsWith(slug))) {
      const runtime = await loadBuiltinPlugin(slug, db, env, null);
      if (runtime) registry.registerPlugin(runtime);
    }
  }

  return registry;
}

// ─── Helpers ──────────────────────────────────────────────────────────

function getSessionToken(request: IRequest): string | null {
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(/wordpress_logged_in_[^=]+=([^;]+)/);
  if (match) return decodeURIComponent(match[1]).split('|')[2] || null;
  return null;
}

function jsonResponse(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json', 'X-Content-Type-Options': 'nosniff' }
  });
}

function renderLoginPage(origin: string, error: string, redirectTo: string): string {
  const errors: Record<string, string> = {
    invalid_username: '<strong>오류</strong>: 사용자명 또는 이메일이 잘못되었습니다.',
    incorrect_password: '<strong>오류</strong>: 입력하신 비밀번호가 맞지 않습니다.',
    loggedout: '로그아웃되었습니다.',
  };
  return `<!DOCTYPE html>
<html lang="ko-KR">
<head>
<meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>로그인 &lsaquo; CF-WordPress</title>
<link rel="stylesheet" href="/wp-admin/css/login.min.css"/>
<style>
body{background:#f0f0f1;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
.login{width:320px;margin:7% auto 0;padding:0}
.login h1 a{display:block;text-align:center;width:84px;height:84px;margin:0 auto 20px;
  background:url(/wp-admin/images/wordpress-logo.svg) center/84px no-repeat;text-indent:-9999px}
#loginform{margin-top:0;padding:26px 24px 46px;font-weight:400;overflow:hidden;background:#fff;
  border:1px solid #c3c4c7;border-radius:4px;box-shadow:0 1px 3px rgba(0,0,0,.04)}
.login label{display:block;font-size:14px;font-weight:600;margin-bottom:5px;color:#1d2327}
.login input[type=text],.login input[type=password]{width:100%;padding:8px 10px;font-size:14px;
  border:1px solid #c3c4c7;border-radius:4px;margin-bottom:16px;box-sizing:border-box;
  color:#1d2327;background:#fff}
.login input[type=text]:focus,.login input[type=password]:focus{border-color:#2271b1;box-shadow:0 0 0 1px #2271b1;outline:0}
.wp-core-ui .button-primary{background:#2271b1;border-color:#2271b1;color:#fff;padding:8px 12px;
  font-size:14px;border-radius:4px;cursor:pointer;width:100%;border:none;font-weight:400}
.wp-core-ui .button-primary:hover{background:#135e96}
#login_error,.message{border-left:4px solid #d63638;padding:8px 12px;margin:0 0 16px;background:#fcf0f1;
  border-radius:2px;font-size:13px;line-height:1.5}
.message{border-left-color:#46b450;background:#f0faf0}
.forgetmenot{float:left;font-size:13px;line-height:2}
.forgetmenot input{margin-right:5px}
.submit{float:right}
.login #nav,.login #backtoblog{text-align:center;margin-top:10px;font-size:13px}
.login #nav a,.login #backtoblog a{color:#2271b1;text-decoration:none}
.login #nav a:hover,.login #backtoblog a:hover{text-decoration:underline}
.login-action-login .login{margin-top:0;padding-top:5vh}
</style>
</head>
<body class="login no-js login-action-login wp-core-ui">
<div id="login">
  <h1><a href="${origin}" title="CF-WordPress" tabindex="-1">CF-WordPress</a></h1>
  ${error && errors[error] ? `<div id="login_error">${errors[error]}</div>` : ''}
  ${error === 'loggedout' ? `<p class="message">로그아웃되었습니다.</p>` : ''}
  <form name="loginform" id="loginform" action="/wp-login.php" method="post">
    <p>
      <label for="user_login">사용자명 또는 이메일 주소</label>
      <input type="text" name="log" id="user_login" class="input" value="" size="20" autocomplete="username" autofocus/>
    </p>
    <div class="user-pass-wrap">
      <label for="user_pass">비밀번호</label>
      <div class="wp-pwd">
        <input type="password" name="pwd" id="user_pass" class="input password-input" value="" size="20" autocomplete="current-password"/>
      </div>
    </div>
    <p class="forgetmenot"><label for="rememberme"><input name="rememberme" type="checkbox" id="rememberme" value="forever"/> 로그인 유지</label></p>
    <p class="submit">
      <input type="submit" name="wp-submit" id="wp-submit" class="button button-primary button-large" value="로그인"/>
      <input type="hidden" name="redirect_to" value="${redirectTo}"/>
      <input type="hidden" name="testcookie" value="1"/>
    </p>
  </form>
  <p id="nav">
    <a href="/wp-login.php?action=lostpassword">비밀번호를 잊으셨나요?</a>
  </p>
  <p id="backtoblog"><a href="${origin}/">&larr; ${origin.replace(/https?:\/\//, '')}(으)로 이동</a></p>
</div>
</body>
</html>`;
}
