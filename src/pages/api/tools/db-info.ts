// src/pages/api/tools/db-info.ts
export const prerender = false;
import { getSessionUser } from '../auth/me';

export async function GET({ request, env }: { request: Request; env: any }) {
  try {
    await getSessionUser(request, env);
    const db = env.DB as D1Database;

    const [posts, pages, media, comments, users, terms] = await Promise.all([
      db.prepare("SELECT COUNT(*) as cnt FROM wp_posts WHERE post_type='post' AND post_status NOT IN ('auto-draft','trash')").first<any>(),
      db.prepare("SELECT COUNT(*) as cnt FROM wp_posts WHERE post_type='page' AND post_status NOT IN ('auto-draft','trash')").first<any>(),
      db.prepare("SELECT COUNT(*) as cnt FROM wp_posts WHERE post_type='attachment'").first<any>(),
      db.prepare("SELECT COUNT(*) as cnt FROM wp_comments").first<any>().catch(() => ({ cnt: 0 })),
      db.prepare("SELECT COUNT(*) as cnt FROM wp_users").first<any>(),
      db.prepare("SELECT COUNT(*) as cnt FROM wp_terms").first<any>().catch(() => ({ cnt: 0 })),
    ]);

    return Response.json({
      posts:    posts?.cnt    || 0,
      pages:    pages?.cnt    || 0,
      media:    media?.cnt    || 0,
      comments: comments?.cnt || 0,
      users:    users?.cnt    || 0,
      terms:    terms?.cnt    || 0,
    });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
