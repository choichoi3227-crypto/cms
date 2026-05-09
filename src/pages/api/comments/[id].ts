// src/pages/api/comments/[id].ts
export const prerender = false;
import { getSessionUser } from '../auth/me';

async function requireAdmin(req: Request, env: any) {
  const user = await getSessionUser(req, env);
  if (!user) throw Object.assign(new Error('인증이 필요합니다.'), { status: 401 });
  return user;
}

export async function PUT({ request, env, params }: { request: Request; env: any; params: any }) {
  try {
    await requireAdmin(request, env);
    const db  = env.DB as D1Database;
    const id  = parseInt(params.id);
    const url = new URL(request.url);
    const body = await request.json().catch(() => ({}) as any) as any;
    const action = url.searchParams.get('action') || body.action;

    const comment = await db.prepare('SELECT * FROM wp_comments WHERE comment_ID = ?').bind(id).first<any>();
    if (!comment) return Response.json({ error: '댓글을 찾을 수 없습니다.' }, { status: 404 });

    const actionMap: Record<string, string> = {
      approve:   '1',
      unapprove: '0',
      spam:      'spam',
      trash:     'trash',
      restore:   '1',
    };

    if (action === 'edit') {
      if (!body.comment_content) return Response.json({ error: '내용이 필요합니다.' }, { status: 400 });
      await db.prepare('UPDATE wp_comments SET comment_content = ? WHERE comment_ID = ?')
        .bind(body.comment_content, id).run();
      return Response.json({ success: true, message: '댓글이 수정되었습니다.' });
    }

    if (action in actionMap) {
      const newStatus = actionMap[action];
      await db.prepare('UPDATE wp_comments SET comment_approved = ? WHERE comment_ID = ?')
        .bind(newStatus, id).run();

      // post comment_count 업데이트
      await db.prepare(`
        UPDATE wp_posts SET comment_count = (
          SELECT COUNT(*) FROM wp_comments
          WHERE comment_post_ID = ? AND comment_approved = '1'
        ) WHERE ID = ?
      `).bind(comment.comment_post_ID, comment.comment_post_ID).run().catch(() => {});

      const messages: Record<string, string> = {
        approve: '댓글이 승인되었습니다.', unapprove: '댓글 승인이 취소되었습니다.',
        spam: '댓글이 스팸으로 표시되었습니다.', trash: '댓글이 휴지통으로 이동되었습니다.',
        restore: '댓글이 복구되었습니다.',
      };
      return Response.json({ success: true, message: messages[action] || '완료.' });
    }

    return Response.json({ error: '알 수 없는 action입니다.' }, { status: 400 });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: e.status || 500 });
  }
}

export async function DELETE({ request, env, params }: { request: Request; env: any; params: any }) {
  try {
    await requireAdmin(request, env);
    const db  = env.DB as D1Database;
    const id  = parseInt(params.id);
    const comment = await db.prepare('SELECT comment_post_ID FROM wp_comments WHERE comment_ID = ?').bind(id).first<any>();
    if (!comment) return Response.json({ error: '댓글을 찾을 수 없습니다.' }, { status: 404 });
    await db.prepare('DELETE FROM wp_comments WHERE comment_ID = ?').bind(id).run();
    await db.prepare(`UPDATE wp_posts SET comment_count = (SELECT COUNT(*) FROM wp_comments WHERE comment_post_ID = ? AND comment_approved = '1') WHERE ID = ?`)
      .bind(comment.comment_post_ID, comment.comment_post_ID).run().catch(() => {});
    return Response.json({ success: true });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: e.status || 500 });
  }
}
