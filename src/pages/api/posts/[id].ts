// src/pages/api/posts/[id].ts
// GET    /api/posts/:id  → 단일 글 조회
// PUT    /api/posts/:id  → 글 수정
// DELETE /api/posts/:id  → 글 삭제
export const prerender = false;
import { getSessionUser } from '../auth/me';

async function auth(req: Request, env: any) {
  const user = await getSessionUser(req, env);
  if (!user) throw Object.assign(new Error('인증이 필요합니다.'), { status: 401 });
  return user;
}

export async function GET({ request, env, params }: { request: Request; env: any; params: any }) {
  try {
    await auth(request, env);
    const db   = env.DB as D1Database;
    const id   = parseInt(params.id);
    if (isNaN(id)) return Response.json({ error: '잘못된 ID입니다.' }, { status: 400 });

    const post = await db.prepare('SELECT * FROM wp_posts WHERE ID = ?').bind(id).first<any>();
    if (!post) return Response.json({ error: '글을 찾을 수 없습니다.' }, { status: 404 });

    // 메타데이터 조회
    const { results: metas } = await db.prepare(
      'SELECT meta_key, meta_value FROM wp_postmeta WHERE post_id = ?'
    ).bind(id).all<any>();

    for (const m of metas || []) {
      (post as any)[m.meta_key] = m.meta_value;
    }

    return Response.json({ post });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: e.status || 500 });
  }
}

export async function PUT({ request, env, params }: { request: Request; env: any; params: any }) {
  try {
    await auth(request, env);
    const db   = env.DB as D1Database;
    const id   = parseInt(params.id);
    if (isNaN(id)) return Response.json({ error: '잘못된 ID입니다.' }, { status: 400 });

    const body = await request.json() as any;
    const now  = new Date().toISOString().replace('T',' ').slice(0,19);

    const post = await db.prepare('SELECT ID FROM wp_posts WHERE ID = ?').bind(id).first<any>();
    if (!post) return Response.json({ error: '글을 찾을 수 없습니다.' }, { status: 404 });

    const updates: string[] = ['post_modified = ?', 'post_modified_gmt = ?'];
    const values: any[] = [now, now];

    const allowedFields: Record<string, string> = {
      post_title: 'post_title', post_content: 'post_content', post_excerpt: 'post_excerpt',
      post_status: 'post_status', post_name: 'post_name', post_date: 'post_date',
      menu_order: 'menu_order',
    };

    for (const [bodyKey, dbKey] of Object.entries(allowedFields)) {
      if (body[bodyKey] !== undefined) {
        updates.push(`${dbKey} = ?`);
        values.push(body[bodyKey]);
      }
    }

    await db.prepare(`UPDATE wp_posts SET ${updates.join(', ')} WHERE ID = ?`)
      .bind(...values, id).run();

    // 메타데이터 업데이트
    const metaFields: Record<string, string> = {
      _thumbnail_url: '_thumbnail_url',
      _seo_title:     '_yoast_wpseo_title',
      _seo_desc:      '_yoast_wpseo_metadesc',
      tags_input:     'tags_input',
    };

    for (const [bodyKey, metaKey] of Object.entries(metaFields)) {
      if (body[bodyKey] !== undefined) {
        const existing = await db.prepare(
          'SELECT meta_id FROM wp_postmeta WHERE post_id = ? AND meta_key = ? LIMIT 1'
        ).bind(id, metaKey).first<any>();

        if (existing) {
          await db.prepare('UPDATE wp_postmeta SET meta_value = ? WHERE meta_id = ?')
            .bind(body[bodyKey], existing.meta_id).run();
        } else {
          await db.prepare('INSERT INTO wp_postmeta (post_id, meta_key, meta_value) VALUES (?,?,?)')
            .bind(id, metaKey, body[bodyKey]).run();
        }
      }
    }

    const updated = await db.prepare('SELECT * FROM wp_posts WHERE ID = ?').bind(id).first<any>();
    return Response.json({ success: true, post: updated });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: e.status || 500 });
  }
}

export async function DELETE({ request, env, params }: { request: Request; env: any; params: any }) {
  try {
    await auth(request, env);
    const db = env.DB as D1Database;
    const id = parseInt(params.id);
    if (isNaN(id)) return Response.json({ error: '잘못된 ID입니다.' }, { status: 400 });

    const post = await db.prepare('SELECT ID FROM wp_posts WHERE ID = ?').bind(id).first<any>();
    if (!post) return Response.json({ error: '글을 찾을 수 없습니다.' }, { status: 404 });

    await db.prepare('DELETE FROM wp_postmeta WHERE post_id = ?').bind(id).run().catch(()=>{});
    await db.prepare('DELETE FROM wp_posts WHERE ID = ?').bind(id).run();

    return Response.json({ success: true, deleted_id: id });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: e.status || 500 });
  }
}
