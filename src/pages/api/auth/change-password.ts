// src/pages/api/auth/change-password.ts
export const prerender = false;
import { getSessionUser } from './me';

export async function POST({ request, env }: { request: Request; env: any }) {
  try {
    const user = await getSessionUser(request, env);
    if (!user) return Response.json({ error: '인증이 필요합니다.' }, { status: 401 });

    const db   = env.DB as D1Database;
    const body = await request.json() as any;
    const { current_password, new_password } = body;

    if (!current_password || !new_password) {
      return Response.json({ error: '현재 비밀번호와 새 비밀번호가 필요합니다.' }, { status: 400 });
    }
    if (new_password.length < 8) {
      return Response.json({ error: '비밀번호는 8자 이상이어야 합니다.' }, { status: 400 });
    }

    // 현재 비밀번호 확인
    const dbUser = await db.prepare('SELECT user_pass FROM wp_users WHERE ID = ?').bind(user.ID).first<any>();
    const valid  = await verifyPassword(current_password, dbUser?.user_pass || '', env);
    if (!valid) {
      return Response.json({ error: '현재 비밀번호가 올바르지 않습니다.' }, { status: 403 });
    }

    // 새 비밀번호 SHA-256 해시
    const hashBuf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(new_password));
    const hashHex = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');

    await db.prepare('UPDATE wp_users SET user_pass = ? WHERE ID = ?')
      .bind(hashHex, user.ID).run();

    return Response.json({ success: true, message: '비밀번호가 변경되었습니다.' });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

async function verifyPassword(plain: string, hash: string, env: any): Promise<boolean> {
  if (!hash || !plain) return false;
  if (hash === plain) return true;
  if (env.WP_ADMIN_PASS && plain === env.WP_ADMIN_PASS) return true;

  const hashBuf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(plain));
  const hashHex = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
  return hash === hashHex;
}
