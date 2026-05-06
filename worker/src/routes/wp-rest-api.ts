import { IRequest } from 'itty-router';
import { Env } from '../types/env';
import { createDB } from '../utils/db';
import { generateNonce } from '../utils/crypto';
import { parseBlocks, renderBlocks } from '../utils/blocks';
import { corsHeaders } from '../middleware/cors';
import { buildPluginRegistry } from './admin-api';

export async function handleWPAPI(request: IRequest, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace('/wp-json', '');
  const db = createDB(env);
  const method = request.method.toUpperCase();

  // CORS headers for all responses
  const cors = corsHeaders(request);

  // ── Root discovery ─────────────────────────────────────────────
  if (path === '/' || path === '') {
    return json(buildRootResponse(url.origin), cors);
  }

  // ── Namespace: /wp/v2 ──────────────────────────────────────────
  if (!path.startsWith('/wp/v2')) {
    return json({ code: 'rest_no_route', message: 'No route found', data: { status: 404 } }, cors, 404);
  }

  const route = path.replace('/wp/v2', '');
  const session = await getSessionFromRequest(request, env);

  // ─── Posts ───────────────────────────────────────────────────────
  if (route === '/posts' || route === '/posts/') {
    if (method === 'GET') return handleGetPosts(url, db, cors, 'post');
    if (method === 'POST') {
      if (!session) return json({ code: 'rest_forbidden', message: '인증이 필요합니다.', data: { status: 401 } }, cors, 401);
      return handleCreatePost(request, db, env, session, cors, 'post');
    }
  }

  const postMatch = route.match(/^\/posts\/(\d+)$/);
  if (postMatch) {
    const id = parseInt(postMatch[1]);
    if (method === 'GET') return handleGetPost(id, db, cors, 'post');
    if (method === 'PUT' || method === 'PATCH') {
      if (!session) return json({ code: 'rest_forbidden', message: '인증 필요', data: { status: 401 } }, cors, 401);
      return handleUpdatePost(id, request, db, cors, session);
    }
    if (method === 'DELETE') {
      if (!session) return json({ code: 'rest_forbidden', message: '인증 필요', data: { status: 401 } }, cors, 401);
      return handleDeletePost(id, url, db, cors);
    }
  }

  // ─── Pages ───────────────────────────────────────────────────────
  if (route === '/pages' || route === '/pages/') {
    if (method === 'GET') return handleGetPosts(url, db, cors, 'page');
    if (method === 'POST') {
      if (!session) return json({ code: 'rest_forbidden', message: '인증 필요', data: { status: 401 } }, cors, 401);
      return handleCreatePost(request, db, env, session, cors, 'page');
    }
  }

  const pageMatch = route.match(/^\/pages\/(\d+)$/);
  if (pageMatch) {
    const id = parseInt(pageMatch[1]);
    if (method === 'GET') return handleGetPost(id, db, cors, 'page');
    if (method === 'PUT' || method === 'PATCH') {
      if (!session) return json({ code: 'rest_forbidden', message: '인증 필요', data: { status: 401 } }, cors, 401);
      return handleUpdatePost(id, request, db, cors, session);
    }
    if (method === 'DELETE') {
      if (!session) return json({ code: 'rest_forbidden', message: '인증 필요', data: { status: 401 } }, cors, 401);
      return handleDeletePost(id, url, db, cors);
    }
  }

  // ─── Media ───────────────────────────────────────────────────────
  if (route === '/media' || route === '/media/') {
    if (method === 'GET') return handleGetMedia(url, db, cors);
    if (method === 'POST') {
      if (!session) return json({ code: 'rest_forbidden', message: '인증 필요', data: { status: 401 } }, cors, 401);
      return handleUploadMedia(request, db, env, session, cors);
    }
  }

  const mediaMatch = route.match(/^\/media\/(\d+)$/);
  if (mediaMatch) {
    const id = parseInt(mediaMatch[1]);
    if (method === 'GET') return handleGetMediaItem(id, db, cors);
    if (method === 'DELETE') {
      await db.deletePost(id, true);
      return json({}, cors, 200);
    }
  }

  // ─── Categories ──────────────────────────────────────────────────
  if (route === '/categories' || route === '/categories/') {
    if (method === 'GET') return handleGetTerms(url, db, cors, 'category');
    if (method === 'POST') {
      if (!session) return json({ code: 'rest_forbidden', message: '인증 필요', data: { status: 401 } }, cors, 401);
      return handleCreateTerm(request, db, cors, 'category');
    }
  }

  const catMatch = route.match(/^\/categories\/(\d+)$/);
  if (catMatch) {
    const id = parseInt(catMatch[1]);
    if (method === 'GET') return handleGetTerm(id, db, cors, 'category');
    if (method === 'PUT' || method === 'PATCH') return handleUpdateTerm(id, request, db, cors);
    if (method === 'DELETE') {
      await db['db'].prepare('DELETE FROM wp_term_taxonomy WHERE term_id = ?').bind(id).run();
      await db['db'].prepare('DELETE FROM wp_terms WHERE term_id = ?').bind(id).run();
      return json({ deleted: true }, cors);
    }
  }

  // ─── Tags ─────────────────────────────────────────────────────────
  if (route === '/tags' || route === '/tags/') {
    if (method === 'GET') return handleGetTerms(url, db, cors, 'post_tag');
    if (method === 'POST') {
      if (!session) return json({ code: 'rest_forbidden', message: '인증 필요', data: { status: 401 } }, cors, 401);
      return handleCreateTerm(request, db, cors, 'post_tag');
    }
  }

  const tagMatch = route.match(/^\/tags\/(\d+)$/);
  if (tagMatch) {
    const id = parseInt(tagMatch[1]);
    if (method === 'GET') return handleGetTerm(id, db, cors, 'post_tag');
  }

  // ─── Users ────────────────────────────────────────────────────────
  if (route === '/users' || route === '/users/') {
    if (method === 'GET') return handleGetUsers(url, db, cors, session);
    if (method === 'POST') {
      if (!session?.roles.includes('administrator')) return json({ code: 'rest_forbidden', message: '인증 필요', data: { status: 403 } }, cors, 403);
      return handleCreateUser(request, db, cors);
    }
  }

  if (route === '/users/me') {
    if (!session) return json({ code: 'rest_not_logged_in', message: '로그인이 필요합니다', data: { status: 401 } }, cors, 401);
    const user = await db.getUser(session.userId);
    return json(formatUser(user!, session.roles), cors);
  }

  const userMatch = route.match(/^\/users\/(\d+)$/);
  if (userMatch) {
    const id = parseInt(userMatch[1]);
    if (method === 'GET') {
      const user = await db.getUser(id);
      if (!user) return json({ code: 'rest_user_invalid_id', message: '사용자를 찾을 수 없습니다.', data: { status: 404 } }, cors, 404);
      return json(formatUser(user, []), cors);
    }
    if (method === 'PUT' || method === 'PATCH') {
      return handleUpdateUser(id, request, db, cors);
    }
  }

  // ─── Comments ─────────────────────────────────────────────────────
  if (route === '/comments' || route === '/comments/') {
    if (method === 'GET') return handleGetComments(url, db, cors);
    if (method === 'POST') return handleCreateComment(request, db, cors, session);
  }

  const commentMatch = route.match(/^\/comments\/(\d+)$/);
  if (commentMatch) {
    const id = parseInt(commentMatch[1]);
    if (method === 'GET') {
      const row = await db['db'].prepare('SELECT * FROM wp_comments WHERE comment_ID = ?').bind(id).first<any>();
      if (!row) return json({ code: 'rest_comment_invalid_id', message: '댓글 없음', data: { status: 404 } }, cors, 404);
      return json(formatComment(row), cors);
    }
  }

  // ─── Settings (admin only) ─────────────────────────────────────────
  if (route === '/settings') {
    if (!session?.roles.includes('administrator')) return json({ code: 'rest_forbidden', message: '권한 없음', data: { status: 403 } }, cors, 403);
    if (method === 'GET') return handleGetSettings(db, cors);
    if (method === 'POST' || method === 'PUT') return handleUpdateSettings(request, db, env, cors);
  }

  // ─── Block types ───────────────────────────────────────────────────
  if (route === '/block-types' || route.startsWith('/block-types/')) {
    return json(getBlockTypes(), cors);
  }

  // ─── Block renderer ────────────────────────────────────────────────
  if (route === '/block-renderer' || route.startsWith('/block-renderer/')) {
    if (method === 'GET' || method === 'POST') {
      const blockName = route.replace('/block-renderer/', '').replace('/', '/');
      const body = method === 'POST' ? await request.json().catch(() => ({})) as any : {};
      return json({ rendered: `<div class="wp-block-${blockName.replace('/', '-')}">${body.attributes?.content || ''}</div>` }, cors);
    }
  }

  // ─── Taxonomies ────────────────────────────────────────────────────
  if (route === '/taxonomies') {
    return json({
      category: { name: '카테고리', slug: 'category', hierarchical: true, types: ['post'] },
      post_tag: { name: '태그', slug: 'post_tag', hierarchical: false, types: ['post'] },
    }, cors);
  }

  // ─── Post types ────────────────────────────────────────────────────
  if (route === '/types') {
    return json({
      post: { name: '글', slug: 'post', rest_base: 'posts', hierarchical: false },
      page: { name: '페이지', slug: 'page', rest_base: 'pages', hierarchical: true },
      attachment: { name: '미디어', slug: 'attachment', rest_base: 'media', hierarchical: false },
    }, cors);
  }

  // ─── Statuses ──────────────────────────────────────────────────────
  if (route === '/statuses') {
    return json({
      publish: { name: '발행됨', slug: 'publish', public: true },
      draft: { name: '초안', slug: 'draft', public: false },
      private: { name: '비공개', slug: 'private', public: false },
      pending: { name: '검토 대기', slug: 'pending', public: false },
      trash: { name: '휴지통', slug: 'trash', public: false },
    }, cors);
  }

  // ─── Search ────────────────────────────────────────────────────────
  if (route === '/search') {
    const q = url.searchParams.get('search') || '';
    const posts = await db.getPosts({ search: q, posts_per_page: 20 });
    const siteUrl = await db.getOption('siteurl');
    return json(posts.map(p => ({
      id: p.ID, title: p.post_title, url: `${siteUrl}/${p.post_name}/`,
      type: 'post', subtype: p.post_type
    })), cors);
  }

  // Not found
  return json({ code: 'rest_no_route', message: 'No route found for ' + method + ' ' + route, data: { status: 404 } }, cors, 404);
}

// ── Handler implementations ──────────────────────────────────────────

async function handleGetPosts(url: URL, db: ReturnType<typeof createDB>, cors: HeadersInit, type: string): Promise<Response> {
  const perPage = Math.min(parseInt(url.searchParams.get('per_page') || '10'), 100);
  const page = parseInt(url.searchParams.get('page') || '1');
  const search = url.searchParams.get('search') || '';
  const status = url.searchParams.get('status') || 'publish';
  const authorId = url.searchParams.get('author') ? parseInt(url.searchParams.get('author')!) : undefined;
  const categoryId = url.searchParams.get('categories') ? parseInt(url.searchParams.get('categories')!) : undefined;
  const orderby = url.searchParams.get('orderby') || 'date';
  const order = url.searchParams.get('order') || 'desc';

  const posts = await db.getPosts({
    post_type: type,
    post_status: status as any,
    posts_per_page: perPage,
    offset: (page - 1) * perPage,
    search: search || undefined,
    author: authorId,
    orderby,
    order: order.toUpperCase()
  });

  const total = await db.countPosts(type, status);
  const siteUrl = await db.getOption('siteurl');
  const totalPages = Math.ceil(total / perPage);

  const headers = {
    ...cors as Record<string, string>,
    'Content-Type': 'application/json',
    'X-WP-Total': String(total),
    'X-WP-TotalPages': String(totalPages)
  };

  return new Response(JSON.stringify(posts.map(p => formatPost(p, siteUrl))), { headers });
}

async function handleGetPost(id: number, db: ReturnType<typeof createDB>, cors: HeadersInit, type: string): Promise<Response> {
  const post = await db.getPost(id);
  if (!post || post.post_type !== type) {
    return json({ code: 'rest_post_invalid_id', message: '존재하지 않는 게시물입니다.', data: { status: 404 } }, cors, 404);
  }
  const siteUrl = await db.getOption('siteurl');
  return json(formatPost(post, siteUrl), cors);
}

async function handleCreatePost(
  request: IRequest, db: ReturnType<typeof createDB>, env: Env, session: any, cors: HeadersInit, type: string
): Promise<Response> {
  const body = await request.json().catch(() => ({})) as Record<string, any>;
  const now = new Date().toISOString().replace('T', ' ').split('.')[0];
  const siteUrl = await db.getOption('siteurl');

  const title = typeof body.title === 'object' ? body.title.raw || body.title.rendered || '' : (body.title || '');
  const content = typeof body.content === 'object' ? body.content.raw || '' : (body.content || '');
  const excerpt = typeof body.excerpt === 'object' ? body.excerpt.raw || '' : (body.excerpt || '');

  let slug = body.slug || title.toLowerCase()
    .replace(/[^a-z0-9가-힣\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();

  const postDate = body.date ? body.date.replace('T', ' ') : now;

  const id = await db.insertPost({
    post_author: session.userId,
    post_date: postDate,
    post_date_gmt: postDate,
    post_content: content,
    post_title: title,
    post_excerpt: excerpt,
    post_status: body.status || 'draft',
    post_name: slug,
    post_type: type,
    comment_status: body.comment_status || 'open',
    ping_status: body.ping_status || 'open',
    menu_order: body.menu_order || 0,
    post_parent: body.parent || 0,
  });

  // Handle categories/tags
  if (body.categories?.length) await db.setPostTerms(id, body.categories, 'category');
  if (body.tags?.length) await db.setPostTerms(id, body.tags, 'post_tag');

  // Handle meta
  if (body.meta) {
    for (const [key, value] of Object.entries(body.meta)) {
      await db.updatePostMeta(id, key, String(value));
    }
  }

  const post = await db.getPost(id);
  return json(formatPost(post!, siteUrl), cors, 201);
}

async function handleUpdatePost(id: number, request: IRequest, db: ReturnType<typeof createDB>, cors: HeadersInit, session: any): Promise<Response> {
  const body = await request.json().catch(() => ({})) as Record<string, any>;
  const post = await db.getPost(id);
  if (!post) return json({ code: 'rest_post_invalid_id', message: '게시물 없음', data: { status: 404 } }, cors, 404);

  const title = typeof body.title === 'object' ? body.title.raw || body.title.rendered : body.title;
  const content = typeof body.content === 'object' ? body.content.raw : body.content;
  const excerpt = typeof body.excerpt === 'object' ? body.excerpt.raw : body.excerpt;

  await db.updatePost(id, {
    ...(title !== undefined && { post_title: title }),
    ...(content !== undefined && { post_content: content }),
    ...(excerpt !== undefined && { post_excerpt: excerpt }),
    ...(body.status && { post_status: body.status }),
    ...(body.slug && { post_name: body.slug }),
    ...(body.date && { post_date: body.date.replace('T', ' ') }),
    ...(body.menu_order !== undefined && { menu_order: body.menu_order }),
    ...(body.comment_status && { comment_status: body.comment_status }),
    ...(body.ping_status && { ping_status: body.ping_status }),
  });

  if (body.categories) await db.setPostTerms(id, body.categories, 'category');
  if (body.tags) await db.setPostTerms(id, body.tags, 'post_tag');

  if (body.meta) {
    for (const [key, value] of Object.entries(body.meta)) {
      await db.updatePostMeta(id, key, String(value));
    }
  }

  const updated = await db.getPost(id);
  const siteUrl = await db.getOption('siteurl');
  return json(formatPost(updated!, siteUrl), cors);
}

async function handleDeletePost(id: number, url: URL, db: ReturnType<typeof createDB>, cors: HeadersInit): Promise<Response> {
  const force = url.searchParams.get('force') === 'true';
  const post = await db.getPost(id);
  if (!post) return json({ code: 'rest_post_invalid_id', message: '게시물 없음', data: { status: 404 } }, cors, 404);
  const siteUrl = await db.getOption('siteurl');
  const previous = formatPost(post, siteUrl);
  await db.deletePost(id, force);
  return json({ deleted: force, previous }, cors);
}

async function handleGetMedia(url: URL, db: ReturnType<typeof createDB>, cors: HeadersInit): Promise<Response> {
  const perPage = parseInt(url.searchParams.get('per_page') || '10');
  const page = parseInt(url.searchParams.get('page') || '1');
  const items = await db.getPosts({
    post_type: 'attachment',
    post_status: 'inherit',
    posts_per_page: perPage,
    offset: (page - 1) * perPage
  });
  const siteUrl = await db.getOption('siteurl');
  return json(items.map(m => formatMedia(m, siteUrl)), cors);
}

async function handleGetMediaItem(id: number, db: ReturnType<typeof createDB>, cors: HeadersInit): Promise<Response> {
  const item = await db.getPost(id);
  if (!item || item.post_type !== 'attachment') return json({ code: 'rest_post_invalid_id', message: '미디어 없음', data: { status: 404 } }, cors, 404);
  const siteUrl = await db.getOption('siteurl');
  return json(formatMedia(item, siteUrl), cors);
}

async function handleUploadMedia(request: IRequest, db: ReturnType<typeof createDB>, env: Env, session: any, cors: HeadersInit): Promise<Response> {
  // Delegate to admin ajax handler logic
  return json({ error: 'Use /wp-admin/admin-ajax.php for uploads' }, cors, 400);
}

async function handleGetTerms(url: URL, db: ReturnType<typeof createDB>, cors: HeadersInit, taxonomy: string): Promise<Response> {
  const terms = await db.getTerms(taxonomy);
  const perPage = parseInt(url.searchParams.get('per_page') || '100');
  return json(terms.slice(0, perPage).map(t => formatTerm(t)), cors);
}

async function handleGetTerm(id: number, db: ReturnType<typeof createDB>, cors: HeadersInit, taxonomy: string): Promise<Response> {
  const rows = await db['db'].prepare(`
    SELECT t.term_id, t.name, t.slug, t.term_group,
           tt.term_taxonomy_id, tt.taxonomy, tt.description, tt.parent, tt.count
    FROM wp_terms t JOIN wp_term_taxonomy tt ON t.term_id = tt.term_id
    WHERE t.term_id = ? AND tt.taxonomy = ?
  `).bind(id, taxonomy).first<any>();
  if (!rows) return json({ code: 'rest_term_invalid', message: '존재하지 않습니다.', data: { status: 404 } }, cors, 404);
  return json(formatTerm(rows), cors);
}

async function handleCreateTerm(request: IRequest, db: ReturnType<typeof createDB>, cors: HeadersInit, taxonomy: string): Promise<Response> {
  const body = await request.json().catch(() => ({})) as Record<string, any>;
  const { name, slug, description, parent } = body;
  if (!name) return json({ code: 'rest_term_name_required', message: '이름이 필요합니다', data: { status: 400 } }, cors, 400);
  const termId = await db.insertTerm(name, taxonomy, { slug, description, parent });
  const term = await db.getTerms(taxonomy).then(terms => terms.find(t => t.term_id === termId));
  return json(term ? formatTerm(term) : { term_id: termId, name, slug: slug || name.toLowerCase().replace(/\s+/g, '-') }, cors, 201);
}

async function handleUpdateTerm(id: number, request: IRequest, db: ReturnType<typeof createDB>, cors: HeadersInit): Promise<Response> {
  const body = await request.json().catch(() => ({})) as Record<string, any>;
  if (body.name) await db['db'].prepare('UPDATE wp_terms SET name = ? WHERE term_id = ?').bind(body.name, id).run();
  if (body.description) await db['db'].prepare('UPDATE wp_term_taxonomy SET description = ? WHERE term_id = ?').bind(body.description, id).run();
  const row = await db['db'].prepare(`
    SELECT t.term_id, t.name, t.slug, t.term_group, tt.term_taxonomy_id, tt.taxonomy, tt.description, tt.parent, tt.count
    FROM wp_terms t JOIN wp_term_taxonomy tt ON t.term_id = tt.term_id WHERE t.term_id = ?
  `).bind(id).first<any>();
  return json(row ? formatTerm(row) : {}, cors);
}

async function handleGetUsers(url: URL, db: ReturnType<typeof createDB>, cors: HeadersInit, session: any): Promise<Response> {
  const users = await db['db'].prepare('SELECT * FROM wp_users ORDER BY ID ASC LIMIT 100').all<any>().then(r => r.results);
  return json(users.map(u => formatUser(u, [])), cors);
}

async function handleCreateUser(request: IRequest, db: ReturnType<typeof createDB>, cors: HeadersInit): Promise<Response> {
  const body = await request.json().catch(() => ({})) as Record<string, any>;
  const { username, email, password, role = 'subscriber', display_name } = body;
  if (!username || !email || !password) return json({ code: 'rest_missing_callback_param', message: '필수 파라미터 누락', data: { status: 400 } }, cors, 400);

  const { hashPassword } = await import('../utils/crypto');
  const hashedPw = await hashPassword(password);
  const now = new Date().toISOString().replace('T', ' ').split('.')[0];

  await db['db'].prepare(
    'INSERT INTO wp_users (user_login, user_pass, user_email, user_registered, display_name, user_nicename, user_url, user_status) VALUES (?, ?, ?, ?, ?, ?, "", 0)'
  ).bind(username, hashedPw, email, now, display_name || username, username.toLowerCase()).run();

  const user = await db.getUserByLogin(username);
  if (!user) return json({ code: 'rest_error', message: '사용자 생성 실패', data: { status: 500 } }, cors, 500);

  await db.updateUserMeta(user.ID, 'wp_capabilities', JSON.stringify({ [role]: true }));
  return json(formatUser(user, [role]), cors, 201);
}

async function handleUpdateUser(id: number, request: IRequest, db: ReturnType<typeof createDB>, cors: HeadersInit): Promise<Response> {
  const body = await request.json().catch(() => ({})) as Record<string, any>;
  const fields: string[] = [], vals: unknown[] = [];
  if (body.email) { fields.push('user_email = ?'); vals.push(body.email); }
  if (body.display_name) { fields.push('display_name = ?'); vals.push(body.display_name); }
  if (body.url) { fields.push('user_url = ?'); vals.push(body.url); }
  if (body.password) {
    const { hashPassword } = await import('../utils/crypto');
    const hashed = await hashPassword(body.password);
    fields.push('user_pass = ?'); vals.push(hashed);
  }
  if (fields.length) {
    vals.push(id);
    await db['db'].prepare(`UPDATE wp_users SET ${fields.join(', ')} WHERE ID = ?`).bind(...vals).run();
  }
  const user = await db.getUser(id);
  return json(user ? formatUser(user, []) : {}, cors);
}

async function handleGetComments(url: URL, db: ReturnType<typeof createDB>, cors: HeadersInit): Promise<Response> {
  const postId = url.searchParams.get('post') ? parseInt(url.searchParams.get('post')!) : null;
  const perPage = parseInt(url.searchParams.get('per_page') || '10');
  let query = 'SELECT * FROM wp_comments WHERE comment_approved = "1"';
  const binds: unknown[] = [];
  if (postId) { query += ' AND comment_post_ID = ?'; binds.push(postId); }
  query += ` ORDER BY comment_date DESC LIMIT ${perPage}`;
  const comments = await db['db'].prepare(query).bind(...binds).all<any>().then(r => r.results);
  return json(comments.map(formatComment), cors);
}

async function handleCreateComment(request: IRequest, db: ReturnType<typeof createDB>, cors: HeadersInit, session: any): Promise<Response> {
  const body = await request.json().catch(() => ({})) as Record<string, any>;
  const { post, content, author_name, author_email, author_url, parent } = body;
  if (!post || !content) return json({ code: 'rest_comment_content_required', message: '내용 필요', data: { status: 400 } }, cors, 400);
  const now = new Date().toISOString().replace('T', ' ').split('.')[0];
  const result = await db['db'].prepare(
    'INSERT INTO wp_comments (comment_post_ID, comment_author, comment_author_email, comment_author_url, comment_content, comment_date, comment_date_gmt, comment_approved, comment_parent, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(post, author_name || 'Anonymous', author_email || '', author_url || '', content, now, now, '1', parent || 0, session?.userId || 0).run();
  return json({ id: result.meta.last_row_id, post, content: { rendered: content }, status: 'approved' }, cors, 201);
}

async function handleGetSettings(db: ReturnType<typeof createDB>, cors: HeadersInit): Promise<Response> {
  return json({
    title: await db.getOption('blogname'),
    description: await db.getOption('blogdescription'),
    url: await db.getOption('siteurl'),
    email: await db.getOption('admin_email'),
    timezone: await db.getOption('timezone_string', 'Asia/Seoul'),
    date_format: await db.getOption('date_format', 'Y년 n월 j일'),
    time_format: await db.getOption('time_format', 'H:i'),
    posts_per_page: parseInt(await db.getOption('posts_per_page', '10')),
    language: await db.getOption('WPLANG', 'ko_KR'),
    use_smilies: false,
    default_category: 1,
    default_post_format: '',
  }, cors);
}

async function handleUpdateSettings(request: IRequest, db: ReturnType<typeof createDB>, env: Env, cors: HeadersInit): Promise<Response> {
  const body = await request.json().catch(() => ({})) as Record<string, any>;
  const mappings: Record<string, string> = {
    title: 'blogname', description: 'blogdescription', url: 'siteurl',
    email: 'admin_email', timezone: 'timezone_string', date_format: 'date_format',
    time_format: 'time_format', posts_per_page: 'posts_per_page', language: 'WPLANG'
  };
  for (const [key, optName] of Object.entries(mappings)) {
    if (body[key] !== undefined) {
      await db.updateOption(optName, String(body[key]));
    }
  }
  return handleGetSettings(db, cors);
}

// ── Formatters ────────────────────────────────────────────────────────

function formatPost(post: any, siteUrl: string): Record<string, unknown> {
  const blocks = parseBlocks(post.post_content || '');
  const rendered = renderBlocks(blocks, { siteUrl });
  return {
    id: post.ID,
    date: post.post_date,
    date_gmt: post.post_date_gmt,
    guid: { rendered: post.guid || `${siteUrl}/?p=${post.ID}`, raw: post.guid },
    modified: post.post_modified,
    modified_gmt: post.post_modified_gmt,
    slug: post.post_name,
    status: post.post_status,
    type: post.post_type,
    link: `${siteUrl}/${post.post_name}/`,
    title: { raw: post.post_title, rendered: post.post_title },
    content: { raw: post.post_content, rendered, protected: false, block_version: 1 },
    excerpt: { raw: post.post_excerpt, rendered: post.post_excerpt, protected: false },
    author: post.post_author,
    featured_media: 0,
    comment_status: post.comment_status,
    ping_status: post.ping_status,
    sticky: false,
    template: '',
    format: 'standard',
    meta: {},
    categories: [],
    tags: [],
    _links: {
      self: [{ href: `${siteUrl}/wp-json/wp/v2/posts/${post.ID}` }],
      collection: [{ href: `${siteUrl}/wp-json/wp/v2/posts` }],
      about: [{ href: `${siteUrl}/wp-json/wp/v2/types/post` }],
    }
  };
}

function formatMedia(item: any, siteUrl: string): Record<string, unknown> {
  return {
    id: item.ID, date: item.post_date, slug: item.post_name, status: item.post_status,
    type: 'attachment', link: item.guid, title: { raw: item.post_title, rendered: item.post_title },
    author: item.post_author, caption: { raw: item.post_excerpt, rendered: item.post_excerpt },
    alt_text: '', media_type: item.post_mime_type?.startsWith('image/') ? 'image' : 'file',
    mime_type: item.post_mime_type, source_url: item.guid,
    media_details: { file: item.post_name, filesize: 0, sizes: { full: { source_url: item.guid } } },
    _links: { self: [{ href: `${siteUrl}/wp-json/wp/v2/media/${item.ID}` }] }
  };
}

function formatTerm(t: any): Record<string, unknown> {
  return {
    id: t.term_id, count: t.count, description: t.description || '',
    link: `/?${t.taxonomy === 'category' ? 'category' : 'tag'}/${t.slug}/`,
    name: t.name, slug: t.slug, taxonomy: t.taxonomy,
    parent: t.parent || 0, meta: [],
    _links: { self: [{ href: `/wp-json/wp/v2/${t.taxonomy === 'category' ? 'categories' : 'tags'}/${t.term_id}` }] }
  };
}

function formatUser(user: any, roles: string[]): Record<string, unknown> {
  return {
    id: user.ID, name: user.display_name, url: user.user_url || '',
    description: '', link: `/?author=${user.ID}`,
    slug: user.user_nicename, avatar_urls: {
      '24': `https://secure.gravatar.com/avatar/?s=24&d=mm`,
      '48': `https://secure.gravatar.com/avatar/?s=48&d=mm`,
      '96': `https://secure.gravatar.com/avatar/?s=96&d=mm`,
    },
    meta: [], roles, capabilities: {},
    extra_capabilities: {},
    email: user.user_email, registered_date: user.user_registered,
    _links: { self: [{ href: `/wp-json/wp/v2/users/${user.ID}` }] }
  };
}

function formatComment(c: any): Record<string, unknown> {
  return {
    id: c.comment_ID, post: c.comment_post_ID, parent: c.comment_parent,
    author: c.user_id, author_name: c.comment_author, author_url: c.comment_author_url,
    author_email: c.comment_author_email, author_ip: c.comment_author_IP,
    date: c.comment_date, date_gmt: c.comment_date_gmt,
    content: { raw: c.comment_content, rendered: `<p>${c.comment_content}</p>` },
    link: `#comment-${c.comment_ID}`, status: c.comment_approved === '1' ? 'approved' : 'hold',
    type: c.comment_type || 'comment', author_avatar_urls: { '48': '' }, meta: []
  };
}

function getBlockTypes(): unknown[] {
  const blocks = [
    'core/paragraph', 'core/heading', 'core/image', 'core/gallery', 'core/list',
    'core/quote', 'core/pullquote', 'core/code', 'core/preformatted', 'core/html',
    'core/separator', 'core/spacer', 'core/table', 'core/buttons', 'core/button',
    'core/columns', 'core/column', 'core/group', 'core/cover', 'core/media-text',
    'core/audio', 'core/video', 'core/embed', 'core/search', 'core/social-links',
    'core/social-link', 'core/verse', 'core/more', 'core/details', 'core/shortcode',
    'core/block', 'core/navigation', 'core/navigation-link', 'core/site-title',
    'core/site-logo', 'core/post-title', 'core/post-content', 'core/post-excerpt',
    'core/post-date', 'core/post-featured-image', 'core/post-author', 'core/template-part',
    'core/archives', 'core/categories', 'core/latest-posts', 'core/latest-comments', 'core/tag-cloud',
  ];
  return blocks.map(name => ({ name, title: name.split('/')[1].replace(/-/g, ' '), category: 'text', icon: 'block-default', keywords: [], attributes: {}, supports: {}, styles: [], variations: [] }));
}

function buildRootResponse(origin: string): unknown {
  return {
    name: 'CF-WordPress',
    description: 'WordPress-compatible CMS on Cloudflare',
    url: origin,
    home: origin,
    gmt_offset: 9,
    timezone_string: 'Asia/Seoul',
    namespaces: ['oembed/1.0', 'wp/v2'],
    authentication: { 'application-passwords': { endpoints: { authorization: `${origin}/wp-admin/authorize-application.php` } } },
    routes: {
      '/wp/v2': { namespace: 'wp/v2', methods: ['GET'] },
      '/wp/v2/posts': { namespace: 'wp/v2', methods: ['GET', 'POST'] },
      '/wp/v2/posts/(?P<id>[\\d]+)': { namespace: 'wp/v2', methods: ['GET', 'PUT', 'PATCH', 'DELETE'] },
      '/wp/v2/pages': { namespace: 'wp/v2', methods: ['GET', 'POST'] },
      '/wp/v2/pages/(?P<id>[\\d]+)': { namespace: 'wp/v2', methods: ['GET', 'PUT', 'PATCH', 'DELETE'] },
      '/wp/v2/media': { namespace: 'wp/v2', methods: ['GET', 'POST'] },
      '/wp/v2/categories': { namespace: 'wp/v2', methods: ['GET', 'POST'] },
      '/wp/v2/tags': { namespace: 'wp/v2', methods: ['GET', 'POST'] },
      '/wp/v2/users': { namespace: 'wp/v2', methods: ['GET', 'POST'] },
      '/wp/v2/users/me': { namespace: 'wp/v2', methods: ['GET', 'PUT'] },
      '/wp/v2/comments': { namespace: 'wp/v2', methods: ['GET', 'POST'] },
      '/wp/v2/settings': { namespace: 'wp/v2', methods: ['GET', 'PUT'] },
      '/wp/v2/search': { namespace: 'wp/v2', methods: ['GET'] },
      '/wp/v2/types': { namespace: 'wp/v2', methods: ['GET'] },
      '/wp/v2/statuses': { namespace: 'wp/v2', methods: ['GET'] },
      '/wp/v2/taxonomies': { namespace: 'wp/v2', methods: ['GET'] },
      '/wp/v2/block-types': { namespace: 'wp/v2', methods: ['GET'] },
    },
    _links: { up: [{ href: origin }] }
  };
}

// ── Auth helper ───────────────────────────────────────────────────────

async function getSessionFromRequest(request: IRequest, env: Env): Promise<any | null> {
  const token = extractToken(request);
  if (!token) return null;
  return await env.SESSIONS.get(`session:${token}`, 'json').catch(() => null);
}

function extractToken(request: IRequest): string | null {
  const auth = request.headers.get('Authorization');
  if (auth?.startsWith('Bearer ')) return auth.slice(7);
  const nonce = request.headers.get('X-WP-Nonce');
  if (nonce) return nonce;
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(/wordpress_logged_in_[^=]+=([^;]+)/);
  if (match) return decodeURIComponent(match[1]).split('|')[2] || null;
  return null;
}

// ── Utility ───────────────────────────────────────────────────────────

function json(data: unknown, cors: HeadersInit = {}, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...(cors as Record<string, string>) }
  });
}
