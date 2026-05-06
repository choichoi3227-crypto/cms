import { IRequest } from 'itty-router';
import { Env } from '../types/env';
import { createDB } from '../utils/db';
import { createGithubStorage } from '../utils/github';
import { renderTheme, ThemeContext } from '../utils/theme';
import { buildPluginRegistry } from './admin-api';
import { cacheResponse } from '../middleware/cache';

export async function handleFrontend(request: IRequest, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  const db = createDB(env);

  // Check installed
  const siteUrl = await db.getOption('siteurl', url.origin);
  const siteName = await db.getOption('blogname', 'CF-WordPress');
  const siteDescription = await db.getOption('blogdescription', '');
  const adminEmail = await db.getOption('admin_email', '');
  const activeTheme = await db.getOption('template', 'twentytwentyfour');
  const themeUrl = `${siteUrl}/wp-content/themes/${activeTheme}`;

  const github = await createGithubStorage(env.DB, env.OPTIONS);
  const registry = await buildPluginRegistry(db, env);

  let ctx2: ThemeContext = {
    siteUrl,
    siteName,
    siteDescription,
    adminEmail,
    themeName: activeTheme,
    themeUrl,
    pageType: 'home',
    query: Object.fromEntries(url.searchParams.entries())
  };

  const path = url.pathname;
  const search = url.searchParams.get('s');

  // ── Front page ───────────────────────────────────────────────────
  if (path === '/' || path === '') {
    const showOnFront = await db.getOption('show_on_front', 'posts');
    
    if (showOnFront === 'page') {
      const pageId = parseInt(await db.getOption('page_on_front', '0'));
      if (pageId) {
        const post = await db.getPost(pageId);
        if (post) {
          ctx2 = { ...ctx2, pageType: 'front-page', post };
        }
      }
    } else {
      const postsPerPage = parseInt(await db.getOption('posts_per_page', '10'));
      const posts = await db.getPosts({ posts_per_page: postsPerPage });
      ctx2 = { ...ctx2, pageType: 'home', posts };
    }
  }

  // ── Search ───────────────────────────────────────────────────────
  else if (search) {
    const posts = await db.getPosts({ search, posts_per_page: 10 });
    ctx2 = { ...ctx2, pageType: 'search', posts };
  }

  // ── Feed ─────────────────────────────────────────────────────────
  else if (path === '/feed/' || path === '/feed' || path === '/rss' || path === '/atom') {
    return renderFeed(db, siteUrl, siteName, siteDescription);
  }

  // ── Sitemap ──────────────────────────────────────────────────────
  else if (path === '/sitemap.xml' || path === '/sitemap_index.xml') {
    return renderSitemap(db, siteUrl);
  }

  // ── Robots.txt ───────────────────────────────────────────────────
  else if (path === '/robots.txt') {
    return new Response(`User-agent: *\nAllow: /\nSitemap: ${siteUrl}/sitemap.xml\n`, {
      headers: { 'Content-Type': 'text/plain' }
    });
  }

  // ── Category archive ─────────────────────────────────────────────
  else if (path.startsWith('/category/')) {
    const slug = path.replace('/category/', '').replace(/\/$/, '');
    const terms = await db.getTerms('category');
    const term = terms.find(t => t.slug === slug);
    if (term) {
      const posts = await db.getPosts({ posts_per_page: 10, category: term.term_id });
      ctx2 = { ...ctx2, pageType: 'category', posts };
    } else {
      ctx2 = { ...ctx2, pageType: '404' };
    }
  }

  // ── Tag archive ──────────────────────────────────────────────────
  else if (path.startsWith('/tag/')) {
    const slug = path.replace('/tag/', '').replace(/\/$/, '');
    const terms = await db.getTerms('post_tag');
    const term = terms.find(t => t.slug === slug);
    if (term) {
      const posts = await db.getPosts({ posts_per_page: 10, tag: term.term_id });
      ctx2 = { ...ctx2, pageType: 'tag', posts };
    } else {
      ctx2 = { ...ctx2, pageType: '404' };
    }
  }

  // ── Author archive ───────────────────────────────────────────────
  else if (path.startsWith('/author/')) {
    const login = path.replace('/author/', '').replace(/\/$/, '');
    const user = await db.getUserByLogin(login);
    if (user) {
      const posts = await db.getPosts({ posts_per_page: 10, author: user.ID });
      ctx2 = { ...ctx2, pageType: 'author', posts };
    } else {
      ctx2 = { ...ctx2, pageType: '404' };
    }
  }

  // ── Year/month/day archive ───────────────────────────────────────
  else if (/^\/\d{4}(\/\d{2})?(\/\d{2})?\/?$/.test(path)) {
    const posts = await db.getPosts({ posts_per_page: 10 });
    ctx2 = { ...ctx2, pageType: 'archive', posts };
  }

  // ── Page number (pagination) ─────────────────────────────────────
  else if (path.startsWith('/page/')) {
    const pageNum = parseInt(path.replace('/page/', '').replace(/\/$/, '')) || 1;
    const postsPerPage = parseInt(await db.getOption('posts_per_page', '10'));
    const posts = await db.getPosts({ posts_per_page: postsPerPage, offset: (pageNum - 1) * postsPerPage });
    ctx2 = { ...ctx2, pageType: 'home', posts };
  }

  // ── Single post or page ──────────────────────────────────────────
  else {
    // Try to resolve from permalink structure
    const slug = path.replace(/^\//, '').replace(/\/$/, '');
    
    // Try as page first
    let post = await db.getPostBySlug(slug, 'page');
    
    // Then as post
    if (!post) post = await db.getPostBySlug(slug, 'post');
    
    // Try ?p=ID or ?page_id=ID
    const pId = url.searchParams.get('p') || url.searchParams.get('page_id');
    if (!post && pId) post = await db.getPost(parseInt(pId));

    if (post) {
      // Apply filters (plugins)
      const filteredContent = await registry.applyFilters('the_content', post.post_content || '');
      post = { ...post, post_content: String(filteredContent) };

      ctx2 = {
        ...ctx2,
        pageType: post.post_type === 'page' ? 'page' : 'single',
        post
      };
    } else {
      ctx2 = { ...ctx2, pageType: '404' };
    }
  }

  // ── Run plugin action ─────────────────────────────────────────────
  await registry.doAction('wp', request);
  await registry.doAction('init', request);

  // ── Render theme ──────────────────────────────────────────────────
  const html = await renderTheme(ctx2, db, env, github, registry);

  const status = ctx2.pageType === '404' ? 404 : 200;
  const cacheControl = ctx2.pageType === '404' ? 'no-cache' : 'public, max-age=300, s-maxage=600';
  const headers: Record<string, string> = {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': cacheControl,
    'X-Powered-By': 'CF-WordPress/1.0',
    'X-Content-Type-Options': 'nosniff'
  };

  const response = new Response(html, { status, headers });

  // Cache successful pages in KV
  if (status === 200 && request.method === 'GET') {
    const cacheKey = url.pathname + url.search;
    ctx.waitUntil(cacheResponse(cacheKey, response.clone(), env, 300));
  }

  return response;
}

async function renderFeed(db: ReturnType<typeof createDB>, siteUrl: string, siteName: string, description: string): Promise<Response> {
  const posts = await db.getPosts({ posts_per_page: 20, post_status: 'publish' });
  const now = new Date().toUTCString();

  const items = posts.map(p => {
    const link = `${siteUrl}/${p.post_name}/`;
    const pubDate = new Date(p.post_date).toUTCString();
    const content = (p.post_content || '').replace(/<[^>]*>/g, '').substring(0, 500);
    return `
    <item>
      <title><![CDATA[${p.post_title}]]></title>
      <link>${link}</link>
      <guid isPermaLink="true">${link}</guid>
      <pubDate>${pubDate}</pubDate>
      <description><![CDATA[${p.post_excerpt || content}]]></description>
      <content:encoded><![CDATA[${p.post_content}]]></content:encoded>
    </item>`;
  }).join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:content="http://purl.org/rss/1.0/modules/content/"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>${siteName}</title>
  <link>${siteUrl}</link>
  <description>${description}</description>
  <language>ko-KR</language>
  <lastBuildDate>${now}</lastBuildDate>
  <atom:link href="${siteUrl}/feed/" rel="self" type="application/rss+xml"/>
  ${items}
</channel>
</rss>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=600'
    }
  });
}

async function renderSitemap(db: ReturnType<typeof createDB>, siteUrl: string): Promise<Response> {
  const posts = await db.getPosts({ posts_per_page: 1000, post_status: 'publish' });
  const pages = await db.getPosts({ post_type: 'page', posts_per_page: 1000, post_status: 'publish' });

  const allItems = [
    { url: siteUrl + '/', lastmod: new Date().toISOString().split('T')[0], priority: '1.0', freq: 'daily' },
    ...pages.map(p => ({ url: `${siteUrl}/${p.post_name}/`, lastmod: p.post_modified?.split(' ')[0] || '', priority: '0.8', freq: 'weekly' })),
    ...posts.map(p => ({ url: `${siteUrl}/${p.post_name}/`, lastmod: p.post_modified?.split(' ')[0] || '', priority: '0.6', freq: 'monthly' })),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  ${allItems.map(item => `
  <url>
    <loc>${item.url}</loc>
    <lastmod>${item.lastmod}</lastmod>
    <changefreq>${item.freq}</changefreq>
    <priority>${item.priority}</priority>
  </url>`).join('')}
</urlset>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600'
    }
  });
}
