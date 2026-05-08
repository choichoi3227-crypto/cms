// src/pages/api/auth/logout.ts
export const prerender = false;

export async function POST() {
  const headers = new Headers();
  headers.append('Set-Cookie', 'cp_cms_session=; Path=/; HttpOnly; Max-Age=0; SameSite=Lax');
  headers.append('Content-Type', 'application/json');
  return new Response(JSON.stringify({ success: true }), { status: 200, headers });
}
