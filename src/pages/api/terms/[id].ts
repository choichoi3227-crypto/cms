// src/pages/api/terms/[id].ts
// DELETE /api/terms/:id?taxonomy=category
export const prerender = false;
import { getSessionUser } from '../auth/me';

export async function DELETE({ request, env, params }: { request: Request; env: any; params: any }) {
  try {
    const user = await getSessionUser(request, env);
    if (!user) return Response.json({ error: '인증이 필요합니다.' }, { status: 401 });

    const db       = env.DB as D1Database;
    const termId   = parseInt(params.id);
    const url      = new URL(request.url);
    const taxonomy = url.searchParams.get('taxonomy') || 'category';

    if (isNaN(termId)) return Response.json({ error: '잘못된 ID입니다.' }, { status: 400 });

    // 기본 카테고리(미분류) 보호
    const term = await db.prepare('SELECT * FROM wp_terms WHERE term_id = ?').bind(termId).first<any>();
    if (!term) return Response.json({ error: '항목을 찾을 수 없습니다.' }, { status: 404 });
    if (term.slug === 'uncategorized') return Response.json({ error: '기본 카테고리는 삭제할 수 없습니다.' }, { status: 400 });

    // 이 term에 연결된 게시글을 기본 카테고리로 이동
    const defaultTerm = await db.prepare("SELECT tt.term_taxonomy_id FROM wp_terms t JOIN wp_term_taxonomy tt ON t.term_id = tt.term_id WHERE t.slug='uncategorized' AND tt.taxonomy='category' LIMIT 1").first<any>().catch(() => null);
    if (defaultTerm) {
      const { results: ttRows } = await db.prepare('SELECT term_taxonomy_id FROM wp_term_taxonomy WHERE term_id = ?').bind(termId).all<any>();
      for (const tt of ttRows || []) {
        const { results: rels } = await db.prepare('SELECT object_id FROM wp_term_relationships WHERE term_taxonomy_id = ?').bind(tt.term_taxonomy_id).all<any>();
        for (const rel of rels || []) {
          // 기본 카테고리로 재연결
          await db.prepare('INSERT OR IGNORE INTO wp_term_relationships (object_id, term_taxonomy_id) VALUES (?,?)').bind(rel.object_id, defaultTerm.term_taxonomy_id).run().catch(() => {});
        }
      }
    }

    // 관계 삭제
    const { results: ttRows } = await db.prepare('SELECT term_taxonomy_id FROM wp_term_taxonomy WHERE term_id = ?').bind(termId).all<any>();
    for (const tt of ttRows || []) {
      await db.prepare('DELETE FROM wp_term_relationships WHERE term_taxonomy_id = ?').bind(tt.term_taxonomy_id).run().catch(() => {});
    }

    // termmeta, term_taxonomy, term 삭제
    await db.prepare('DELETE FROM wp_termmeta WHERE term_id = ?').bind(termId).run().catch(() => {});
    await db.prepare('DELETE FROM wp_term_taxonomy WHERE term_id = ?').bind(termId).run().catch(() => {});
    await db.prepare('DELETE FROM wp_terms WHERE term_id = ?').bind(termId).run();

    return Response.json({ success: true, message: '삭제되었습니다.' });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
