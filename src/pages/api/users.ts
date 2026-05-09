// src/pages/api/users.ts
// GET  /api/users  → 사용자 목록
// POST /api/users  → 사용자 생성
export const prerender = false;
import { getSessionUser } from './auth/me';

async function requireAdmin(req: Request, env: any) {
  const user = await getSessionUser(req, env);
  if (!user) throw Object.assign(new Error('인증이 필요합니다.'), { status: 401 });
  return user;
}

export async function GET({ request, env }: { request: Request; env: any }) {
  try {
    await requireAdmin(request, env);
    const db = env.DB as D1Database;

    const { results: users } = await db.prepare(`
      SELECT u.ID, u.user_login, u.user_email, u.display_name, u.user_registered,
             m.meta_value as role_meta,
             (SELECT COUNT(*) FROM wp_posts p WHERE p.post_author = u.ID AND p.post_status != 'auto-draft') as post_count
      FROM wp_users u
      LEFT JOIN wp_usermeta m ON u.ID = m.user_id AND m.meta_key = 'wp_capabilities'
      ORDER BY u.ID ASC
    `).all<any>();

    const parsed = (users || []).map(u => {
      let role = 'subscriber';
      if (u.role_meta) {
        try {
          const caps = JSON.parse(u.role_meta);
          role = Object.keys(caps)[0] || 'subscriber';
        } catch {}
      }
      return { ...u, role };
    });

    return Response.json({ users: parsed });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: e.status || 500 });
  }
}

export async function POST({ request, env }: { request: Request; env: any }) {
  try {
    await requireAdmin(request, env);
    const db   = env.DB as D1Database;
    const body = await request.json() as any;

    const { user_login, user_email, user_pass, display_name, role } = body;
    if (!user_login || !user_email || !user_pass) {
      return Response.json({ error: '사용자 이름, 이메일, 비밀번호가 필요합니다.' }, { status: 400 });
    }

    // 중복 확인
    const exists = await db.prepare(
      'SELECT ID FROM wp_users WHERE user_login = ? OR user_email = ?'
    ).bind(user_login, user_email).first<any>();
    if (exists) return Response.json({ error: '이미 사용 중인 사용자 이름 또는 이메일입니다.' }, { status: 409 });

    // 비밀번호 해시 (SHA-256)
    const hashBuf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(user_pass));
    const hashHex = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2,'0')).join('');

    const now = new Date().toISOString().replace('T',' ').slice(0,19);
    const result = await db.prepare(`
      INSERT INTO wp_users (user_login, user_pass, user_nicename, user_email, user_registered, display_name)
      VALUES (?,?,?,?,?,?)
    `).bind(user_login, hashHex, user_login.toLowerCase(), user_email, now, display_name || user_login).run();

    const userId = result.meta?.last_row_id;

    // 역할 메타 설정
    const safeRole = ['administrator','editor','author','contributor','subscriber'].includes(role) ? role : 'subscriber';
    const caps     = JSON.stringify({ [safeRole]: true });
    await db.prepare("INSERT INTO wp_usermeta (user_id, meta_key, meta_value) VALUES (?,?,?)")
      .bind(userId, 'wp_capabilities', caps).run();
    await db.prepare("INSERT INTO wp_usermeta (user_id, meta_key, meta_value) VALUES (?,?,?)")
      .bind(userId, 'wp_user_level', safeRole === 'administrator' ? '10' : safeRole === 'editor' ? '7' : '1').run();

    return Response.json({ success: true, user: { ID: userId, user_login, user_email, role: safeRole } }, { status: 201 });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: e.status || 500 });
  }
}
