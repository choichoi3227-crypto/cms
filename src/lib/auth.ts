// src/lib/auth.ts
// 공통 세션 인증 헬퍼 (SESSIONS KV 사용)

export interface SessionUser {
  ID: number;
  user_login: string;
  user_email: string;
  roles: string[];
}

export async function getSessionUser(request: Request, env: any): Promise<SessionUser | null> {
  const cookie = request.headers.get('Cookie') || '';
  const auth = request.headers.get('Authorization') || '';

  let token: string | null = null;
  const cookieMatch = cookie.match(/cp_cms_session=([^;]+)/);
  if (cookieMatch) token = decodeURIComponent(cookieMatch[1]);
  else if (auth.startsWith('Bearer ')) token = auth.slice(7);

  if (!token) return null;

  try {
    const session = await (env.SESSIONS as KVNamespace).get<any>(`cms:${token}`, 'json');
    if (!session || session.expires < Date.now()) return null;
    return {
      ID: session.userId,
      user_login: session.userLogin,
      user_email: session.userEmail,
      roles: session.roles || ['subscriber'],
    };
  } catch {
    return null;
  }
}

export function requireAuth(user: SessionUser | null): Response | null {
  if (!user) return Response.json({ error: '인증이 필요합니다.' }, { status: 401 });
  return null;
}

export function requireAdmin(user: SessionUser | null): Response | null {
  if (!user) return Response.json({ error: '인증이 필요합니다.' }, { status: 401 });
  if (!user.roles.includes('administrator')) return Response.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
  return null;
}
