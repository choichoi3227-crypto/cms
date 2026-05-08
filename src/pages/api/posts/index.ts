// src/pages/api/posts/index.ts
// GET  /api/posts        → 글 목록
// POST /api/posts        → 글 생성
export const prerender = false;
import { getSessionUser } from '../auth/me';

async function auth(req: Request, env: any) {
  const user = await getSessionUser(req, env);
  if (!user) throw Object.assign(new Error('인증이 필요합니다.'), { status: 401 });
  return user;
}

export async function GET({ request, env }: { request: Request; env: any }) {
  try {
    await auth(request, env);
    const db  = env.DB as D1Database;
    const url = new URL(request.url);
    const postType = url.searchParams.get('post_type') || 'post';
    const status   = url.searchParams.get('status');
    const search   = url.searchParams.get('search') || '';
    const page     = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
    const perPage  = Math.min(200, parseInt(url.searchParams.get('per_page') || '20'));
    const offset   = (page - 1) * perPage;

    let where = `post_type = ? AND post_status != 'auto-draft'`;
    const bindings: any[] = [postType];

    if (status) { where += ` AND post_status = ?`; bindings.push(status); }
    else         { where += ` AND post_status IN ('publish','draft','private','pending')`; }

    if (search) {
      where += ` AND (post_title LIKE ? OR post_content LIKE ?)`;
      bindings.push(`%${search}%`, `%${search}%`);
    }

    const countRow = await db.prepare(`SELECT COUNT(*) as cnt FROM wp_posts WHERE ${where}`)
      .bind(...bindings).first<any>();
    const total = countRow?.cnt ?? 0;

    const { results: posts } = await db.prepare(
      `SELECT ID, post_title, post_status, post_name, post_date, post_type, post_excerpt, guid, post_mime_type
       FROM wp_posts WHERE ${where}
       ORDER BY post_date DESC LIMIT ? OFFSET ?`
    ).bind(...bindings, perPage, offset).all<any>();

    // 통계 (대시보드용)
    const [totalPosts, totalPages, totalMedia, totalComments] = await Promise.all([
      db.prepare("SELECT COUNT(*) as cnt FROM wp_posts WHERE post_type='post' AND post_status IN ('publish','draft')").first<any>(),
      db.prepare("SELECT COUNT(*) as cnt FROM wp_posts WHERE post_type='page' AND post_status IN ('publish','draft')").first<any>(),
      db.prepare("SELECT COUNT(*) as cnt FROM wp_posts WHERE post_type='attachment'").first<any>(),
      db.prepare("SELECT COUNT(*) as cnt FROM wp_comments").first<any>().catch(()=>({cnt:0})),
    ]);

    return Response.json({
      posts: posts || [],
      total,
      total_pages:    Math.ceil(total / perPage),
      total_posts:    totalPosts?.cnt ?? 0,
      total_pages_count: totalPages?.cnt ?? 0,
      total_media:    totalMedia?.cnt ?? 0,
      total_comments: totalComments?.cnt ?? 0,
    });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: e.status || 500 });
  }
}

export async function POST({ request, env }: { request: Request; env: any }) {
  try {
    const user = await auth(request, env);
    const db   = env.DB as D1Database;
    const body = await request.json() as any;

    const now       = new Date().toISOString().replace('T',' ').slice(0,19);
    const postName  = body.post_name || slugify(body.post_title || '');
    const postType  = body.post_type || 'post';
    const menuOrder = body.menu_order ?? 0;

    const result = await db.prepare(`
      INSERT INTO wp_posts
        (post_author, post_date, post_date_gmt, post_content, post_title, post_excerpt,
         post_status, post_name, post_type, comment_status, ping_status, menu_order,
         post_modified, post_modified_gmt, guid, post_mime_type, post_content_filtered, to_ping, pinged)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).bind(
      user.ID, now, now,
      body.post_content || '', body.post_title || '(제목 없음)', body.post_excerpt || '',
      body.post_status || 'draft', postName, postType,
      'open', 'open', menuOrder, now, now,
      '', '', '', '', ''
    ).run();

    const postId = result.meta?.last_row_id;

    // guid 업데이트
    await db.prepare("UPDATE wp_posts SET guid = ? WHERE ID = ?")
      .bind(`/?p=${postId}`, postId).run().catch(()=>{});

    // 메타데이터 저장
    const metas: [string, string][] = [];
    if (body._thumbnail_url) metas.push(['_thumbnail_url', body._thumbnail_url]);
    if (body._seo_title)     metas.push(['_yoast_wpseo_title', body._seo_title]);
    if (body._seo_desc)      metas.push(['_yoast_wpseo_metadesc', body._seo_desc]);
    if (body.tags_input)     metas.push(['tags_input', body.tags_input]);

    for (const [key, value] of metas) {
      await db.prepare("INSERT INTO wp_postmeta (post_id, meta_key, meta_value) VALUES (?,?,?)")
        .bind(postId, key, value).run().catch(()=>{});
    }

    const post = await db.prepare('SELECT * FROM wp_posts WHERE ID = ?').bind(postId).first<any>();
    return Response.json({ success: true, post }, { status: 201 });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: e.status || 500 });
  }
}

function slugify(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9가-힣\s-]/g,'').replace(/\s+/g,'-').replace(/-+/g,'-').slice(0,200) || `post-${Date.now()}`;
}
