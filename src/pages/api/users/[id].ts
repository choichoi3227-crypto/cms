// src/pages/api/users/[id].ts
export const prerender = false;
import { getSessionUser } from '../auth/me';

async function requireAdmin(req: Request, env: any) {
  const user = await getSessionUser(req, env);
  if (!user) throw Object.assign(new Error('인증이 필요합니다.'), { status: 401 });
  return user;
}

export async function GET({ request, env, params }: { request: Request; env: any; params: any }) {
  try {
    await requireAdmin(request, env);
    const db = env.DB as D1Database;
    const user = await db.prepare(
      'SELECT ID,user_login,user_email,display_name,user_registered FROM wp_users WHERE ID=?'
    ).bind(params.id).first<any>();
    if (!user) return Response.json({ error: '사용자를 찾을 수 없습니다.' }, { status: 404 });
    const meta = await db.prepare("SELECT meta_value FROM wp_usermeta WHERE user_id=? AND meta_key='wp_capabilities' LIMIT 1")
      .bind(params.id).first<any>().catch(()=>null);
    let role = 'subscriber';
    try { role = Object.keys(JSON.parse(meta?.meta_value||'{}')).at(0)||'subscriber'; } catch {}
    return Response.json({ user: { ...user, role } });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: e.status || 500 });
  }
}

export async function PUT({ request, env, params }: { request: Request; env: any; params: any }) {
  try {
    const me = await requireAdmin(request, env);
    const db   = env.DB as D1Database;
    const body = await request.json() as any;
    const id   = parseInt(params.id);

    if (isNaN(id)) return Response.json({ error: '잘못된 ID' }, { status: 400 });

    const updates: string[] = [];
    const values: any[]     = [];
    if (body.display_name) { updates.push('display_name=?'); values.push(body.display_name); }
    if (body.user_email)   { updates.push('user_email=?');   values.push(body.user_email);   }
    if (body.user_pass) {
      const hb = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body.user_pass));
      const hx = Array.from(new Uint8Array(hb)).map(b=>b.toString(16).padStart(2,'0')).join('');
      updates.push('user_pass=?'); values.push(hx);
    }
    if (updates.length) {
      await db.prepare(`UPDATE wp_users SET ${updates.join(',')} WHERE ID=?`).bind(...values, id).run();
    }
    if (body.role) {
      const safeRole = ['administrator','editor','author','contributor','subscriber'].includes(body.role)?body.role:'subscriber';
      const caps     = JSON.stringify({ [safeRole]: true });
      const existing = await db.prepare("SELECT umeta_id FROM wp_usermeta WHERE user_id=? AND meta_key='wp_capabilities' LIMIT 1")
        .bind(id).first<any>();
      if (existing) await db.prepare("UPDATE wp_usermeta SET meta_value=? WHERE umeta_id=?").bind(caps, existing.umeta_id).run();
      else          await db.prepare("INSERT INTO wp_usermeta(user_id,meta_key,meta_value) VALUES(?,?,?)").bind(id,'wp_capabilities',caps).run();
    }
    return Response.json({ success: true });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: e.status||500 });
  }
}

export async function DELETE({ request, env, params }: { request: Request; env: any; params: any }) {
  try {
    const me = await requireAdmin(request, env);
    const db  = env.DB as D1Database;
    const id  = parseInt(params.id);
    if (id === me.ID) return Response.json({ error: '자기 자신은 삭제할 수 없습니다.' }, { status: 400 });
    await db.prepare('DELETE FROM wp_usermeta WHERE user_id=?').bind(id).run().catch(()=>{});
    await db.prepare('DELETE FROM wp_users WHERE ID=?').bind(id).run();
    return Response.json({ success: true });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: e.status||500 });
  }
}
