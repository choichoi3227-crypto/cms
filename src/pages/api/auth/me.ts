// src/pages/api/auth/me.ts
export const prerender = false;

export async function GET({ request, env }: { request: Request; env: any }) {
  const cookie = request.headers.get('Cookie') || '';
  const auth = request.headers.get('Authorization') || '';

  let token: string | null = null;
  const cookieMatch = cookie.match(/cp_cms_session=([^;]+)/);
  if (cookieMatch) token = decodeURIComponent(cookieMatch[1]);
  else if (auth.startsWith('Bearer ')) token = auth.slice(7);

  if (!token) {
    return Response.json({ error: '인증이 필요합니다.' }, { status: 401 });
  }

  const session = await (env.SESSIONS as KVNamespace).get<any>(`cms:${token}`, 'json').catch(() => null);
  if (!session || session.expires < Date.now()) {
    return Response.json({ error: '세션이 만료되었습니다.' }, { status: 401 });
  }

  return Response.json({
    success: true,
    user: {
      id: session.userId,
      username: session.userLogin,
      email: session.userEmail,
      roles: session.roles,
    },
  });
}
