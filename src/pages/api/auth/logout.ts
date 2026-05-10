// src/pages/api/auth/logout.ts
export const prerender = false;

export async function POST({ request, env }: { request: Request; env: any }) {
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(/cp_cms_session=([^;]+)/);
  const token = match ? decodeURIComponent(match[1]) : null;

  if (token) {
    await (env.SESSIONS as KVNamespace).delete(`cms:${token}`).catch(() => {});
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': 'cp_cms_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax',
    },
  });
}
