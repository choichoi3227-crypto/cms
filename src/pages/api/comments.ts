// src/pages/api/comments.ts + [id].ts combined helper
// GET  /api/comments        → 댓글 목록
// PUT  /api/comments/:id    → 승인/비승인/스팸/편집
// DELETE /api/comments/:id  → 삭제
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
    const db     = env.DB as D1Database;
    const url    = new URL(request.url);
    const status  = url.searchParams.get('status') || 'all';
    const search  = url.searchParams.get('search') || '';
    const perPage = Math.min(100, parseInt(url.searchParams.get('per_page') || '50'));
    const page    = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
    const offset  = (page - 1) * perPage;

    await ensureCommentsTable(db);

    let where = '1=1';
    const binds: any[] = [];

    if (status === 'all')  { where += " AND c.comment_approved IN ('0','1')"; }
    else if (status === 'spam')  { where += " AND c.comment_approved = 'spam'"; }
    else if (status === 'trash') { where += " AND c.comment_approved = 'trash'"; }
    else { where += ` AND c.comment_approved = ?`; binds.push(status); }

    if (search) {
      where += ' AND (c.comment_content LIKE ? OR c.comment_author LIKE ? OR c.comment_author_email LIKE ?)';
      binds.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    const { results: comments } = await db.prepare(`
      SELECT c.*, p.post_title
      FROM wp_comments c
      LEFT JOIN wp_posts p ON c.comment_post_ID = p.ID
      WHERE ${where}
      ORDER BY c.comment_date DESC
      LIMIT ? OFFSET ?
    `).bind(...binds, perPage, offset).all<any>();

    // 카운트
    const [totalAll, totalPending, totalApproved, totalSpam, totalTrash] = await Promise.all([
      db.prepare("SELECT COUNT(*) as cnt FROM wp_comments WHERE comment_approved IN ('0','1')").first<any>(),
      db.prepare("SELECT COUNT(*) as cnt FROM wp_comments WHERE comment_approved = '0'").first<any>(),
      db.prepare("SELECT COUNT(*) as cnt FROM wp_comments WHERE comment_approved = '1'").first<any>(),
      db.prepare("SELECT COUNT(*) as cnt FROM wp_comments WHERE comment_approved = 'spam'").first<any>(),
      db.prepare("SELECT COUNT(*) as cnt FROM wp_comments WHERE comment_approved = 'trash'").first<any>(),
    ]);

    return Response.json({
      comments:      comments || [],
      total_all:     totalAll?.cnt     || 0,
      total_pending:  totalPending?.cnt  || 0,
      total_approved: totalApproved?.cnt || 0,
      total_spam:    totalSpam?.cnt    || 0,
      total_trash:   totalTrash?.cnt   || 0,
    });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: e.status || 500 });
  }
}

async function ensureCommentsTable(db: D1Database) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS wp_comments (
      comment_ID           INTEGER PRIMARY KEY AUTOINCREMENT,
      comment_post_ID      INTEGER NOT NULL DEFAULT 0,
      comment_author       TEXT    NOT NULL DEFAULT '',
      comment_author_email TEXT    NOT NULL DEFAULT '',
      comment_author_url   TEXT    NOT NULL DEFAULT '',
      comment_author_IP    TEXT    NOT NULL DEFAULT '',
      comment_date         TEXT    NOT NULL DEFAULT '',
      comment_date_gmt     TEXT    NOT NULL DEFAULT '',
      comment_content      TEXT    NOT NULL DEFAULT '',
      comment_karma        INTEGER NOT NULL DEFAULT 0,
      comment_approved     TEXT    NOT NULL DEFAULT '1',
      comment_agent        TEXT    NOT NULL DEFAULT '',
      comment_type         TEXT    NOT NULL DEFAULT 'comment',
      comment_parent       INTEGER NOT NULL DEFAULT 0,
      user_id              INTEGER NOT NULL DEFAULT 0
    )
  `).run().catch(() => {});
}
