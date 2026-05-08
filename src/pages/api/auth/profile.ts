// src/pages/api/auth/profile.ts
export const prerender = false;
import { getSessionUser } from './me';

export async function PUT({ request, env }: { request: Request; env: any }) {
  try {
    const user = await getSessionUser(request, env);
    if (!user) return Response.json({ error: '인증이 필요합니다.' }, { status: 401 });

    const db   = env.DB as D1Database;
    const body = await request.json() as any;

    const updates: string[] = [];
    const values: any[]     = [];

    if (body.display_name) { updates.push('display_name = ?'); values.push(body.display_name); }
    if (body.user_email)   { updates.push('user_email = ?');   values.push(body.user_email);   }

    if (updates.length) {
      await db.prepare(`UPDATE wp_users SET ${updates.join(', ')} WHERE ID = ?`)
        .bind(...values, user.ID).run();
    }

    if (body.description !== undefined) {
      const existing = await db.prepare(
        "SELECT umeta_id FROM wp_usermeta WHERE user_id = ? AND meta_key = 'description' LIMIT 1"
      ).bind(user.ID).first<any>();

      if (existing) {
        await db.prepare("UPDATE wp_usermeta SET meta_value = ? WHERE umeta_id = ?")
          .bind(body.description, existing.umeta_id).run();
      } else {
        await db.prepare("INSERT INTO wp_usermeta (user_id, meta_key, meta_value) VALUES (?,?,?)")
          .bind(user.ID, 'description', body.description).run();
      }
    }

    const updated = await db.prepare(
      'SELECT ID, user_login, user_email, display_name FROM wp_users WHERE ID = ?'
    ).bind(user.ID).first<any>();

    return Response.json({ success: true, user: updated });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
