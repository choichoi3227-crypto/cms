// src/pages/api/plugin-menus.ts
// GET /api/plugin-menus → 플러그인이 등록한 관리자 메뉴 목록
// POST /api/plugin-menus → 플러그인이 메뉴 등록 (PHP 브릿지에서 호출)
export const prerender = false;
import { getSessionUser } from './auth/me';

export async function GET({ request, env }: { request: Request; env: any }) {
  try {
    await getSessionUser(request, env);
    const db = env.DB as D1Database;
    await ensureMenusTable(db);

    const { results: menus } = await db.prepare(
      'SELECT * FROM cloudpress_plugin_menus ORDER BY menu_position ASC, id ASC'
    ).all<any>();

    return Response.json({ menus: menus || [] });
  } catch (e: any) {
    return Response.json({ menus: [] }); // 실패해도 빈 배열 반환
  }
}

export async function POST({ request, env }: { request: Request; env: any }) {
  try {
    const db   = env.DB as D1Database;
    const body = await request.json() as any;
    await ensureMenusTable(db);

    const { plugin_slug, title, url, icon, position, parent_slug, capability } = body;
    if (!plugin_slug || !title || !url) {
      return Response.json({ error: 'plugin_slug, title, url은 필수입니다.' }, { status: 400 });
    }

    const existing = await db.prepare(
      'SELECT id FROM cloudpress_plugin_menus WHERE plugin_slug = ? AND url = ?'
    ).bind(plugin_slug, url).first<any>();

    if (existing) {
      await db.prepare(`UPDATE cloudpress_plugin_menus SET title=?,icon=?,menu_position=?,parent_slug=?,capability=? WHERE id=?`)
        .bind(title, icon||'🔌', position||80, parent_slug||'', capability||'manage_options', existing.id).run();
    } else {
      await db.prepare(`INSERT INTO cloudpress_plugin_menus (plugin_slug,title,url,icon,menu_position,parent_slug,capability) VALUES (?,?,?,?,?,?,?)`)
        .bind(plugin_slug, title, url, icon||'🔌', position||80, parent_slug||'', capability||'manage_options').run();
    }

    return Response.json({ success: true });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

async function ensureMenusTable(db: D1Database) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS cloudpress_plugin_menus (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      plugin_slug   TEXT    NOT NULL DEFAULT '',
      title         TEXT    NOT NULL DEFAULT '',
      url           TEXT    NOT NULL DEFAULT '',
      icon          TEXT    NOT NULL DEFAULT '🔌',
      menu_position INTEGER NOT NULL DEFAULT 80,
      parent_slug   TEXT    NOT NULL DEFAULT '',
      capability    TEXT    NOT NULL DEFAULT 'manage_options'
    )
  `).run().catch(() => {});
}
