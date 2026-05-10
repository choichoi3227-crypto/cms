import { IRequest } from 'itty-router';
import { Env } from '../types/env';
import { createDB } from '../utils/db';
import { hashPassword } from '../utils/crypto';

export async function handlePublicAPI(request: IRequest, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const route = url.pathname.replace('/api', '');
  const method = request.method.toUpperCase();

  const db = createDB(env);

  // ── Options save ──────────────────────────────────────────────────
  if (route === '/options/save' && method === 'POST') {
    return handleSaveOptions(request, db, env);
  }

  // ── Users ─────────────────────────────────────────────────────────
  if (route === '/users/create' && method === 'POST') {
    return handleCreateUser(request, db, env);
  }

  const userUpdateMatch = route.match(/^\/users\/(\d+)\/update$/);
  if (userUpdateMatch && method === 'POST') {
    const uid = parseInt(userUpdateMatch[1]);
    const body2 = await request.clone().json().catch(() => ({})) as Record<string, string>;
    if (body2.action === 'delete') {
      await db.deleteUser(uid).catch(() => {});
      return jsonOk({ success: true, message: '사용자가 삭제되었습니다.' });
    }
    return handleUpdateUser(uid, request, db);
  }

  // ── Export ────────────────────────────────────────────────────────
  if (route === '/export' && (method === 'GET' || method === 'POST')) {
    return handleExport(request, db, env);
  }

  // ── Health check ─────────────────────────────────────────────────
  if (route === '/health') {
    return jsonOk({ status: 'ok', version: '1.0.0', timestamp: new Date().toISOString() });
  }

  // ── Stats ─────────────────────────────────────────────────────────
  if (route === '/stats') {
    const postCount = await db.countPosts('post', 'publish');
    const pageCount = await db.countPosts('page', 'publish');
    const draftCount = await db.countPosts('post', 'draft');
    return jsonOk({ posts: postCount, pages: pageCount, drafts: draftCount });
  }

  // ── CloudPress 사이트 정보 조회 ─────────────────────────────────────
  if (route === '/cloudpress/site-info' && method === 'GET') {
    const host = new URL(request.url).hostname;
    try {
      const siteUrl = await env.OPTIONS.get('siteurl') || env.SITE_URL || url.origin;
      const siteName = await db.getOption('blogname', 'CloudPress Site');
      const siteDesc = await db.getOption('blogdescription', '');
      const activeTheme = await db.getOption('template', 'twentytwentyfour');
      return jsonOk({ siteUrl, siteName, siteDesc, activeTheme, host });
    } catch (e) {
      return jsonError('사이트 정보 조회 실패: ' + String(e), 500);
    }
  }

  // ── CloudPress 도메인 확인 ────────────────────────────────────────
  if (route === '/cloudpress/domain-check' && method === 'GET') {
    const domain = url.searchParams.get('domain') || '';
    if (!domain) return jsonError('domain 파라미터가 필요합니다.', 400);
    const siteUrl = await env.OPTIONS.get('siteurl') || '';
    const currentHost = new URL(siteUrl || url.origin).hostname;
    return jsonOk({ domain, current: currentHost, match: currentHost === domain });
  }

  // ── CloudPress 스토리지 사용량 ────────────────────────────────────
  if (route === '/cloudpress/storage-usage' && method === 'GET') {
    try {
      const mediaCount = await env.DB.prepare(
        "SELECT COUNT(*) as cnt, SUM(CAST(pm.meta_value AS INTEGER)) as total FROM wp_posts p LEFT JOIN wp_postmeta pm ON p.ID = pm.post_id AND pm.meta_key = '_wp_attachment_metadata' WHERE p.post_type = 'attachment'"
      ).first<{ cnt: number; total: number }>();
      return jsonOk({ media_count: mediaCount?.cnt || 0, storage_bytes: mediaCount?.total || 0 });
    } catch {
      return jsonOk({ media_count: 0, storage_bytes: 0 });
    }
  }

  // ── WordPress XML-RPC compatibility (stub) ────────────────────────
  if (route === '/xmlrpc') {
    return new Response('<?xml version="1.0"?><methodResponse><fault><value><struct><member><name>faultCode</name><value><int>403</int></value></member><member><name>faultString</name><value><string>XML-RPC services are disabled on this site.</string></value></member></struct></value></fault></methodResponse>', {
      headers: { 'Content-Type': 'text/xml' }
    });
  }

  return jsonError('Not Found', 404);
}

async function handleSaveOptions(request: IRequest, db: ReturnType<typeof createDB>, env: Env): Promise<Response> {
  const body = await request.json().catch(() => ({})) as Record<string, string>;

  const allowedOptions = [
    'blogname', 'blogdescription', 'siteurl', 'home', 'admin_email',
    'posts_per_page', 'permalink_structure', 'timezone_string',
    'date_format', 'time_format', 'WPLANG', 'default_role',
    'users_can_register', 'blog_public', 'comment_moderation',
    'default_comment_status', 'default_ping_status', 'default_pingback_flag',
    'default_category', 'default_post_format', 'thumbnail_size_w',
    'thumbnail_size_h', 'medium_size_w', 'medium_size_h',
    'large_size_w', 'large_size_h', 'upload_path',
    'wp_page_for_privacy_policy', 'show_on_front', 'page_on_front',
    'page_for_posts', 'enable_xmlrpc', 'cache_lifespan'
  ];

  const saved: string[] = [];
  for (const [key, value] of Object.entries(body)) {
    if (key === 'nonce' || key === '_method') continue;
    if (allowedOptions.includes(key)) {
      await db.updateOption(key, String(value));
      saved.push(key);
    }
  }

  return jsonOk({ saved, message: '설정이 저장되었습니다.' });
}

async function handleCreateUser(request: IRequest, db: ReturnType<typeof createDB>, env: Env): Promise<Response> {
  const body = await request.json().catch(() => ({})) as Record<string, string>;
  const user_login = body.username || body.user_login || '';
  const email = body.email || '';
  const pass1 = body.password || body.pass1 || '';
  const role = body.role || 'subscriber';
  const _display_name = body.display_name || body.first_name || user_login;

  if (!user_login || !email) return jsonError('사용자명과 이메일이 필요합니다.', 400);

  // Check duplicate
  const existing = await db.getUserByLogin(user_login);
  if (existing) return jsonError('이미 사용 중인 사용자명입니다.', 409);

  const existingEmail = await db.getUserByEmail(email);
  if (existingEmail) return jsonError('이미 사용 중인 이메일입니다.', 409);

  const password = pass1 || crypto.randomUUID().substring(0, 12);
  const hashedPw = await hashPassword(password);
  const now = new Date().toISOString().replace('T', ' ').split('.')[0];
  const displayName = _display_name || user_login;

  await db['db'].prepare(
    'INSERT INTO wp_users (user_login, user_pass, user_email, user_registered, display_name, user_nicename, user_url, user_status) VALUES (?, ?, ?, ?, ?, ?, "", 0)'
  ).bind(user_login, hashedPw, email, now, displayName, user_login.toLowerCase()).run();

  const user = await db.getUserByLogin(user_login);
  if (!user) return jsonError('사용자 생성 실패', 500);

  await db.updateUserMeta(user.ID, 'wp_capabilities', JSON.stringify({ [role]: true }));
  await db.updateUserMeta(user.ID, 'wp_user_level', role === 'administrator' ? '10' : '0');
  if (first_name) await db.updateUserMeta(user.ID, 'first_name', first_name);
  if (last_name) await db.updateUserMeta(user.ID, 'last_name', last_name);

  return jsonOk({ id: user.ID, login: user_login, email, role, message: '사용자가 생성되었습니다.' });
}

async function handleUpdateUser(userId: number, request: IRequest, db: ReturnType<typeof createDB>): Promise<Response> {
  const body = await request.json().catch(() => ({})) as Record<string, string>;
  const { email, first_name, last_name, url, pass1, pass2, display_name } = body;

  if (pass1 && pass1 !== pass2) return jsonError('비밀번호가 일치하지 않습니다.', 400);

  const fields: string[] = [], vals: unknown[] = [];
  if (email) { fields.push('user_email = ?'); vals.push(email); }
  if (display_name) { fields.push('display_name = ?'); vals.push(display_name); }
  if (url) { fields.push('user_url = ?'); vals.push(url); }
  if (pass1) {
    const hashed = await hashPassword(pass1);
    fields.push('user_pass = ?'); vals.push(hashed);
  }

  if (fields.length) {
    vals.push(userId);
    await db['db'].prepare(`UPDATE wp_users SET ${fields.join(', ')} WHERE ID = ?`).bind(...vals).run();
  }

  if (first_name) await db.updateUserMeta(userId, 'first_name', first_name);
  if (last_name) await db.updateUserMeta(userId, 'last_name', last_name);

  return jsonOk({ id: userId, message: '프로필이 업데이트되었습니다.' });
}

async function handleExport(request: IRequest, db: ReturnType<typeof createDB>, env: Env): Promise<Response> {
  let content = 'all';
  if (request.method === 'POST') {
    const fd = await request.formData().catch(() => new FormData());
    content = String(fd.get('content') || 'all');
  }

  const siteUrl = await db.getOption('siteurl');
  const siteName = await db.getOption('blogname');
  const adminEmail = await db.getOption('admin_email');
  const now = new Date().toISOString();

  let posts: any[] = [];
  if (content === 'all' || content === 'posts') {
    posts = [...posts, ...await db.getPosts({ post_type: 'post', post_status: 'publish', posts_per_page: 5000 })];
  }
  if (content === 'all' || content === 'pages') {
    posts = [...posts, ...await db.getPosts({ post_type: 'page', post_status: 'publish', posts_per_page: 1000 })];
  }
  if (content === 'all' || content === 'media') {
    posts = [...posts, ...await db.getPosts({ post_type: 'attachment', post_status: 'inherit', posts_per_page: 1000 })];
  }

  const items = await Promise.all(posts.map(async p => {
    const categories = await db.getPostTerms(p.ID, 'category');
    const tags = await db.getPostTerms(p.ID, 'post_tag');

    return `
  <item>
    <title>${escapeXml(p.post_title)}</title>
    <link>${siteUrl}/${p.post_name}/</link>
    <pubDate>${new Date(p.post_date).toUTCString()}</pubDate>
    <dc:creator><![CDATA[admin]]></dc:creator>
    <guid isPermaLink="false">${siteUrl}/?p=${p.ID}</guid>
    <description></description>
    <content:encoded><![CDATA[${p.post_content}]]></content:encoded>
    <excerpt:encoded><![CDATA[${p.post_excerpt}]]></excerpt:encoded>
    <wp:post_id>${p.ID}</wp:post_id>
    <wp:post_date><![CDATA[${p.post_date}]]></wp:post_date>
    <wp:post_date_gmt><![CDATA[${p.post_date_gmt}]]></wp:post_date_gmt>
    <wp:comment_status><![CDATA[${p.comment_status}]]></wp:comment_status>
    <wp:ping_status><![CDATA[${p.ping_status}]]></wp:ping_status>
    <wp:post_name><![CDATA[${p.post_name}]]></wp:post_name>
    <wp:status><![CDATA[${p.post_status}]]></wp:status>
    <wp:post_parent>${p.post_parent}</wp:post_parent>
    <wp:menu_order>${p.menu_order}</wp:menu_order>
    <wp:post_type><![CDATA[${p.post_type}]]></wp:post_type>
    ${categories.map(c => `<category domain="category" nicename="${c.slug}"><![CDATA[${c.name}]]></category>`).join('\n    ')}
    ${tags.map(t => `<category domain="post_tag" nicename="${t.slug}"><![CDATA[${t.name}]]></category>`).join('\n    ')}
  </item>`;
  }));

  const wxr = `<?xml version="1.0" encoding="UTF-8" ?>
<!-- This is a WordPress eXtended RSS file generated by CF-WordPress as an export of your site. -->
<!-- It contains information about your site's posts, pages, comments, categories, and other content. -->
<!-- You may use this file to transfer that content from one site to another. -->
<!-- To import this information into a WordPress site follow these steps: -->
<!-- 1. Log in to that site as an administrator. -->
<!-- 2. Go to Tools: Import in the WordPress admin panel. -->
<!-- 3. Install the "WordPress" importer from the list. -->
<!-- 4. Activate & Run Importer. -->
<!-- 5. Upload this file using the form provided on that page. -->
<!-- 6. You will first be asked to map the authors in this export file to users on the site. -->
<!--    For each author, you may choose to map to an existing user on the site or to create a new user. -->
<!-- 7. WordPress will then import each of the posts, pages, comments, categories, etc. contained in this file into your site. -->

<rss version="2.0"
  xmlns:excerpt="http://wordpress.org/export/1.2/excerpt/"
  xmlns:content="http://purl.org/rss/1.0/modules/content/"
  xmlns:wfw="http://wellformedweb.org/CommentAPI/"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:wp="http://wordpress.org/export/1.2/">

<channel>
  <title>${escapeXml(siteName)}</title>
  <link>${siteUrl}</link>
  <description></description>
  <pubDate>${new Date().toUTCString()}</pubDate>
  <language>ko-KR</language>
  <wp:wxr_version>1.2</wp:wxr_version>
  <wp:base_site_url>${siteUrl}</wp:base_site_url>
  <wp:base_blog_url>${siteUrl}</wp:base_blog_url>

  <wp:author>
    <wp:author_id>1</wp:author_id>
    <wp:author_login><![CDATA[admin]]></wp:author_login>
    <wp:author_email><![CDATA[${adminEmail}]]></wp:author_email>
    <wp:author_display_name><![CDATA[admin]]></wp:author_display_name>
    <wp:author_first_name><![CDATA[]]></wp:author_first_name>
    <wp:author_last_name><![CDATA[]]></wp:author_last_name>
  </wp:author>

  <generator>https://github.com/cf-wordpress</generator>
  ${items.join('')}
</channel>
</rss>`;

  return new Response(wxr, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Content-Disposition': `attachment; filename="cf-wordpress-export-${now.split('T')[0]}.xml"`
    }
  });
}

function escapeXml(str: string): string {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function jsonOk(data: unknown): Response {
  return new Response(JSON.stringify({ success: true, data }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

function jsonError(message: string, status = 400): Response {
  return new Response(JSON.stringify({ success: false, error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
