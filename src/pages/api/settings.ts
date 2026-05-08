// src/pages/api/settings.ts
// GET /api/settings → WordPress 옵션 조회
// PUT /api/settings → WordPress 옵션 저장
export const prerender = false;
import { getSessionUser } from './auth/me';

export async function GET({ request, env }: { request: Request; env: any }) {
  try {
    const user = await getSessionUser(request, env);
    if (!user) return Response.json({ error: '인증이 필요합니다.' }, { status: 401 });

    const db = env.DB as D1Database;
    await ensureOptionsTable(db);

    const { results } = await db.prepare(
      "SELECT option_name, option_value FROM wp_options WHERE autoload = 'yes' ORDER BY option_name"
    ).all<any>();

    const options: Record<string, string> = {};
    for (const row of results || []) {
      options[row.option_name] = row.option_value;
    }

    return Response.json({ options });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function PUT({ request, env }: { request: Request; env: any }) {
  try {
    const user = await getSessionUser(request, env);
    if (!user) return Response.json({ error: '인증이 필요합니다.' }, { status: 401 });

    const db   = env.DB as D1Database;
    const body = await request.json() as any;
    const opts = body.options || {};

    await ensureOptionsTable(db);

    for (const [key, value] of Object.entries(opts)) {
      await db.prepare(`
        INSERT INTO wp_options (option_name, option_value, autoload) VALUES (?, ?, 'yes')
        ON CONFLICT(option_name) DO UPDATE SET option_value = excluded.option_value
      `).bind(key, String(value)).run();
    }

    return Response.json({ success: true, updated: Object.keys(opts).length });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

async function ensureOptionsTable(db: D1Database) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS wp_options (
      option_id    INTEGER PRIMARY KEY AUTOINCREMENT,
      option_name  TEXT UNIQUE NOT NULL DEFAULT '',
      option_value TEXT NOT NULL DEFAULT '',
      autoload     TEXT NOT NULL DEFAULT 'yes'
    )
  `).run().catch(()=>{});
}
