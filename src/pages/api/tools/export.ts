// src/pages/api/tools/export.ts
// GET /api/tools/export?what=all&format=xml|json
export const prerender = false;
import { getSessionUser } from '../auth/me';

export async function GET({ request, env }: { request: Request; env: any }) {
  try {
    await getSessionUser(request, env);
    const db     = env.DB as D1Database;
    const url    = new URL(request.url);
    const what   = url.searchParams.get('what') || 'all';
    const format = url.searchParams.get('format') || 'xml';

    // 데이터 수집
    const postTypes = what === 'all' ? ['post','page','attachment'] : [what === 'media' ? 'attachment' : what];
    const placeholders = postTypes.map(() => '?').join(',');
    const { results: posts } = await db.prepare(
      `SELECT * FROM wp_posts WHERE post_type IN (${placeholders}) AND post_status NOT IN ('auto-draft') ORDER BY post_date ASC`
    ).bind(...postTypes).all<any>();

    // 메타 데이터
    const postIds = (posts || []).map((p: any) => p.ID);
    let metas: any[] = [];
    if (postIds.length) {
      const chunkSize = 50;
      for (let i = 0; i < postIds.length; i += chunkSize) {
        const chunk = postIds.slice(i, i + chunkSize);
        const ph = chunk.map(() => '?').join(',');
        const { results } = await db.prepare(`SELECT * FROM wp_postmeta WHERE post_id IN (${ph})`).bind(...chunk).all<any>();
        metas = metas.concat(results || []);
      }
    }

    // 카테고리/태그
    const { results: terms } = await db.prepare(`
      SELECT t.*, tt.taxonomy, tt.description, tt.parent, tt.count
      FROM wp_terms t JOIN wp_term_taxonomy tt ON t.term_id = tt.term_id
      ORDER BY t.name ASC
    `).all<any>().catch(() => ({ results: [] }));

    // 사이트 옵션
    const siteUrl = await db.prepare("SELECT option_value FROM wp_options WHERE option_name='siteurl' LIMIT 1").first<any>().then(r => r?.option_value || '').catch(() => '');
    const blogName = await db.prepare("SELECT option_value FROM wp_options WHERE option_name='blogname' LIMIT 1").first<any>().then(r => r?.option_value || '').catch(() => '');
    const blogDesc = await db.prepare("SELECT option_value FROM wp_options WHERE option_name='blogdescription' LIMIT 1").first<any>().then(r => r?.option_value || '').catch(() => '');

    const now = new Date().toUTCString();

    if (format === 'json') {
      const exportData = {
        generator:   'CloudPress CMS 1.0',
        exported_at:  new Date().toISOString(),
        site_url:    siteUrl,
        blog_name:   blogName,
        posts:       posts || [],
        postmeta:    metas,
        terms:       terms || [],
      };
      return new Response(JSON.stringify(exportData, null, 2), {
        headers: {
          'Content-Type':        'application/json; charset=utf-8',
          'Content-Disposition': `attachment; filename="cloudpress-export-${new Date().toISOString().slice(0,10)}.json"`,
        },
      });
    }

    // WordPress WXR XML 형식
    const escXml = (s: string) => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
    const cdata  = (s: string) => `<![CDATA[${String(s||'')}]]>`;

    const termsXml = (terms || []).map((t: any) => {
      if (t.taxonomy === 'category') {
        return `    <wp:category>
      <wp:term_id>${t.term_id}</wp:term_id>
      <wp:category_nicename>${escXml(t.slug)}</wp:category_nicename>
      <wp:category_parent></wp:category_parent>
      <wp:cat_name>${cdata(t.name)}</wp:cat_name>
      <wp:category_description>${cdata(t.description||'')}</wp:category_description>
    </wp:category>`;
      }
      return `    <wp:tag>
      <wp:term_id>${t.term_id}</wp:term_id>
      <wp:tag_slug>${escXml(t.slug)}</wp:tag_slug>
      <wp:tag_name>${cdata(t.name)}</wp:tag_name>
    </wp:tag>`;
    }).join('\n');

    const metaMap: Record<number, any[]> = {};
    for (const m of metas) {
      if (!metaMap[m.post_id]) metaMap[m.post_id] = [];
      metaMap[m.post_id].push(m);
    }

    const itemsXml = (posts || []).map((p: any) => {
      const pMetas = metaMap[p.ID] || [];
      const metaXml = pMetas.map((m: any) =>
        `      <wp:postmeta><wp:meta_key>${cdata(m.meta_key)}</wp:meta_key><wp:meta_value>${cdata(m.meta_value)}</wp:meta_value></wp:postmeta>`
      ).join('\n');

      return `    <item>
      <title>${cdata(p.post_title)}</title>
      <link>${siteUrl}/?p=${p.ID}</link>
      <pubDate>${p.post_date ? new Date(p.post_date).toUTCString() : now}</pubDate>
      <dc:creator>${cdata('admin')}</dc:creator>
      <guid isPermaLink="false">${siteUrl}/?p=${p.ID}</guid>
      <description></description>
      <content:encoded>${cdata(p.post_content||'')}</content:encoded>
      <excerpt:encoded>${cdata(p.post_excerpt||'')}</excerpt:encoded>
      <wp:post_id>${p.ID}</wp:post_id>
      <wp:post_date>${cdata(p.post_date||'')}</wp:post_date>
      <wp:post_date_gmt>${cdata(p.post_date_gmt||'')}</wp:post_date_gmt>
      <wp:comment_status>${cdata(p.comment_status||'open')}</wp:comment_status>
      <wp:ping_status>${cdata(p.ping_status||'open')}</wp:ping_status>
      <wp:post_name>${cdata(p.post_name||'')}</wp:post_name>
      <wp:status>${cdata(p.post_status||'publish')}</wp:status>
      <wp:post_parent>${p.post_parent||0}</wp:post_parent>
      <wp:menu_order>${p.menu_order||0}</wp:menu_order>
      <wp:post_type>${cdata(p.post_type||'post')}</wp:post_type>
      <wp:post_password>${cdata(p.post_password||'')}</wp:post_password>
      <wp:is_sticky>0</wp:is_sticky>
${metaXml}
    </item>`;
    }).join('\n');

    const xml = `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0"
  xmlns:excerpt="http://wordpress.org/export/1.2/excerpt/"
  xmlns:content="http://purl.org/rss/1.0/modules/content/"
  xmlns:wfw="http://wellformedweb.org/CommentAPI/"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:wp="http://wordpress.org/export/1.2/">
  <channel>
    <title>${escXml(blogName)}</title>
    <link>${escXml(siteUrl)}</link>
    <description>${escXml(blogDesc)}</description>
    <pubDate>${now}</pubDate>
    <language>ko-KR</language>
    <wp:wxr_version>1.2</wp:wxr_version>
    <wp:base_site_url>${escXml(siteUrl)}</wp:base_site_url>
    <wp:base_blog_url>${escXml(siteUrl)}</wp:base_blog_url>
    <generator>https://cloudpress.dev/?v=1.0.0</generator>
${termsXml}
${itemsXml}
  </channel>
</rss>`;

    return new Response(xml, {
      headers: {
        'Content-Type':        'application/xml; charset=utf-8',
        'Content-Disposition': `attachment; filename="cloudpress-export-${new Date().toISOString().slice(0,10)}.xml"`,
      },
    });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
