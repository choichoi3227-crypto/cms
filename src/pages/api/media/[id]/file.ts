// src/pages/api/media/[id]/file.ts
// GET /api/media/:id/file → D1 청크에서 파일 서빙 (R2 없을 때 fallback)
export const prerender = false;
import { getSessionUser } from '../../auth/me';

export async function GET({ request, env, params }: { request: Request; env: any; params: any }) {
  try {
    const db = env.DB as D1Database;
    const id = parseInt(params.id);
    if (isNaN(id)) return new Response('잘못된 ID', { status: 400 });

    // 공개 접근 허용 (attachment는 보통 공개)
    const post = await db.prepare(
      "SELECT post_title, post_mime_type FROM wp_posts WHERE ID = ? AND post_type = 'attachment'"
    ).bind(id).first<any>();
    if (!post) return new Response('파일을 찾을 수 없습니다.', { status: 404 });

    // 청크 조합
    const { results: chunks } = await db.prepare(
      'SELECT data FROM wp_media_chunks WHERE post_id = ? ORDER BY chunk_index ASC'
    ).bind(id).all<any>();

    if (!chunks || chunks.length === 0) return new Response('파일 데이터 없음', { status: 404 });

    const base64   = chunks.map((c: any) => c.data).join('');
    const binaryStr = atob(base64);
    const bytes    = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

    return new Response(bytes, {
      status: 200,
      headers: {
        'Content-Type':        post.post_mime_type || 'application/octet-stream',
        'Content-Disposition': `inline; filename="${encodeURIComponent(post.post_title)}"`,
        'Cache-Control':       'public, max-age=31536000',
      },
    });
  } catch (e: any) {
    return new Response('서버 오류: ' + e.message, { status: 500 });
  }
}
