// src/pages/api/terms.ts
// GET /api/terms?taxonomy=category|post_tag
export const prerender = false;
import { getSessionUser } from './auth/me';

export async function GET({ request, env }: { request: Request; env: any }) {
  try {
    const user = await getSessionUser(request, env);
    if (!user) return Response.json({ error: '인증이 필요합니다.' }, { status: 401 });

    const db       = env.DB as D1Database;
    const url      = new URL(request.url);
    const taxonomy = url.searchParams.get('taxonomy') || 'category';

    await ensureTermsTables(db);

    const { results: terms } = await db.prepare(`
      SELECT t.term_id, t.name, t.slug, tt.count
      FROM wp_terms t
      JOIN wp_term_taxonomy tt ON t.term_id = tt.term_id
      WHERE tt.taxonomy = ?
      ORDER BY t.name ASC
    `).bind(taxonomy).all<any>();

    return Response.json({ terms: terms || [], taxonomy });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

async function ensureTermsTables(db: D1Database) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS wp_terms (
      term_id    INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL DEFAULT '',
      slug       TEXT NOT NULL DEFAULT '',
      term_group INTEGER NOT NULL DEFAULT 0
    )
  `).run().catch(()=>{});

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS wp_term_taxonomy (
      term_taxonomy_id INTEGER PRIMARY KEY AUTOINCREMENT,
      term_id          INTEGER NOT NULL DEFAULT 0,
      taxonomy         TEXT NOT NULL DEFAULT '',
      description      TEXT NOT NULL DEFAULT '',
      parent           INTEGER NOT NULL DEFAULT 0,
      count            INTEGER NOT NULL DEFAULT 0
    )
  `).run().catch(()=>{});

  // 기본 미분류 카테고리
  const existing = await db.prepare("SELECT term_id FROM wp_terms WHERE slug='uncategorized' LIMIT 1")
    .first<any>().catch(()=>null);
  if (!existing) {
    await db.prepare("INSERT INTO wp_terms (name, slug) VALUES ('미분류', 'uncategorized')").run().catch(()=>{});
    const t = await db.prepare("SELECT term_id FROM wp_terms WHERE slug='uncategorized'").first<any>().catch(()=>null);
    if (t) {
      await db.prepare("INSERT INTO wp_term_taxonomy (term_id, taxonomy, count) VALUES (?, 'category', 0)")
        .bind(t.term_id).run().catch(()=>{});
    }
  }
}
