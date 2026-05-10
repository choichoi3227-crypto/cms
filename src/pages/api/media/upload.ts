// src/pages/api/media/upload.ts
// POST /api/media/upload → 파일을 D1(base64 청크) 또는 R2에 저장
export const prerender = false;
export async function POST({ request, env }: { request: Request; env: any }) {
  try {
    // 세션 인증
    const cookie = request.headers.get('Cookie') || '';
    const auth = request.headers.get('Authorization') || '';
    let token: string | null = null;
    const m = cookie.match(/cp_cms_session=([^;]+)/);
    if (m) token = decodeURIComponent(m[1]);
    else if (auth.startsWith('Bearer ')) token = auth.slice(7);
    if (!token) return Response.json({ error: '인증이 필요합니다.' }, { status: 401 });
    const session = await (env.SESSIONS as KVNamespace).get<any>(`cms:${token}`, 'json').catch(() => null);
    if (!session || session.expires < Date.now()) return Response.json({ error: '세션 만료' }, { status: 401 });
    const user = { ID: session.userId, user_login: session.userLogin, user_email: session.userEmail };

    const db   = env.DB as D1Database;
    const body = await request.json() as any;
    const { filename, mime_type, size, data } = body;

    if (!filename || !data) return Response.json({ error: 'filename과 data가 필요합니다.' }, { status: 400 });
    if (size > 10 * 1024 * 1024) return Response.json({ error: '파일 크기가 10MB를 초과합니다.' }, { status: 413 });

    // R2 버킷이 있으면 R2에 업로드
    let fileUrl = '';
    if (env.MEDIA) {
      try {
        const fileData = Uint8Array.from(atob(data), c => c.charCodeAt(0));
        const key      = `uploads/${Date.now()}-${sanitizeFilename(filename)}`;
        await env.MEDIA.put(key, fileData, { httpMetadata: { contentType: mime_type } });
        const siteUrl  = await db.prepare("SELECT option_value FROM wp_options WHERE option_name='siteurl'")
          .first<any>().then((r: any) => r?.option_value || '').catch(()=>'');
        fileUrl = `${siteUrl}/r2/${key}`;
      } catch (e: any) {
        console.error('R2 업로드 실패:', e.message);
      }
    }

    // D1에 attachment 포스트로 등록
    const now    = new Date().toISOString().replace('T',' ').slice(0,19);
    const title  = filename.replace(/\.[^.]+$/, '');
    const result = await db.prepare(`
      INSERT INTO wp_posts
        (post_author, post_date, post_date_gmt, post_content, post_title, post_excerpt,
         post_status, post_name, post_type, comment_status, ping_status, menu_order,
         post_modified, post_modified_gmt, guid, post_mime_type, post_content_filtered, to_ping, pinged)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).bind(
      user.ID, now, now, '', title, '',
      'inherit', sanitizeFilename(title), 'attachment',
      'open', 'closed', 0, now, now,
      fileUrl, mime_type || 'application/octet-stream', '', '', ''
    ).run();

    const attachId = result.meta?.last_row_id;

    // guid 업데이트
    if (fileUrl) {
      await db.prepare("UPDATE wp_posts SET guid = ? WHERE ID = ?").bind(fileUrl, attachId).run().catch(()=>{});
    }

    // 파일 크기 메타
    await db.prepare("INSERT INTO wp_postmeta (post_id, meta_key, meta_value) VALUES (?,?,?)")
      .bind(attachId, '_filesize', String(size)).run().catch(()=>{});

    // R2가 없으면 D1 청크에 저장
    if (!fileUrl && data) {
      await ensureMediaChunksTable(db);
      const CHUNK = 500_000;
      const totalChunks = Math.ceil(data.length / CHUNK);
      await db.prepare("DELETE FROM wp_media_chunks WHERE post_id = ?").bind(attachId).run().catch(()=>{});
      for (let i = 0; i < totalChunks; i++) {
        await db.prepare("INSERT INTO wp_media_chunks (post_id, chunk_index, data) VALUES (?,?,?)")
          .bind(attachId, i, data.slice(i * CHUNK, (i+1) * CHUNK)).run();
      }
      fileUrl = `/api/media/${attachId}/file`;
      await db.prepare("UPDATE wp_posts SET guid = ?, _attachment_url = ? WHERE ID = ?")
        .bind(fileUrl, fileUrl, attachId).run().catch(()=>{});
      await db.prepare("INSERT INTO wp_postmeta (post_id, meta_key, meta_value) VALUES (?,?,?) ON CONFLICT DO NOTHING")
        .bind(attachId, '_attachment_url', fileUrl).run().catch(()=>{});
    }

    const attachment = await db.prepare('SELECT * FROM wp_posts WHERE ID = ?').bind(attachId).first<any>();
    return Response.json({ success: true, attachment, url: fileUrl }, { status: 201 });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

function sanitizeFilename(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9._-]/g, '-').replace(/-+/g, '-');
}

async function ensureMediaChunksTable(db: D1Database) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS wp_media_chunks (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id     INTEGER NOT NULL,
      chunk_index INTEGER NOT NULL,
      data        TEXT NOT NULL,
      UNIQUE(post_id, chunk_index)
    )
  `).run().catch(()=>{});
}
