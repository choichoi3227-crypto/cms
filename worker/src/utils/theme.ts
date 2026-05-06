import { Env, WPPost } from '../types/env';
import { WPDB } from './db';
import { GitHubStorage } from './github';
import { renderBlocks, parseBlocks } from './blocks';
import { PluginRegistry } from './plugins';

export interface ThemeContext {
  post?: WPPost;
  posts?: WPPost[];
  pageType: 'home' | 'single' | 'page' | 'archive' | 'category' | 'tag' | 'author' | 'search' | '404' | 'front-page';
  query?: Record<string, string>;
  siteUrl: string;
  themeName: string;
  themeUrl: string;
  siteName: string;
  siteDescription: string;
  adminEmail: string;
}

/**
 * Render a WordPress theme template
 */
export async function renderTheme(
  ctx: ThemeContext,
  db: WPDB,
  env: Env,
  github: GitHubStorage | null,
  registry: PluginRegistry
): Promise<string> {
  // Get active theme
  const activeTheme = await db.getOption('template') || 'twentytwentyfour';
  
  // Try to load theme from GitHub
  if (github) {
    const themeFiles = await loadThemeFiles(activeTheme, github);
    if (themeFiles) {
      return await renderThemeTemplate(ctx, themeFiles, db, env, registry);
    }
  }
  
  // Fallback: built-in minimal theme
  return renderBuiltinTheme(ctx, db, registry);
}

async function loadThemeFiles(
  slug: string,
  github: GitHubStorage
): Promise<Record<string, string> | null> {
  const basePath = `wp-content/themes/${slug}`;
  
  try {
    const indexPhp = await github.readFile(`${basePath}/index.php`);
    if (!indexPhp) return null;
    
    const files: Record<string, string> = { 'index.php': indexPhp };
    
    const toLoad = [
      'header.php', 'footer.php', 'sidebar.php', 'functions.php',
      'single.php', 'page.php', 'archive.php', 'home.php',
      'front-page.php', '404.php', 'search.php', 'style.css',
      'functions.php', 'category.php', 'tag.php', 'author.php'
    ];
    
    await Promise.all(toLoad.map(async f => {
      const content = await github.readFile(`${basePath}/${f}`);
      if (content) files[f] = content;
    }));
    
    return files;
  } catch {
    return null;
  }
}

async function renderThemeTemplate(
  ctx: ThemeContext,
  files: Record<string, string>,
  db: WPDB,
  env: Env,
  registry: PluginRegistry
): Promise<string> {
  // Select template based on page type
  const templateMap: Record<string, string[]> = {
    'front-page': ['front-page.php', 'home.php', 'index.php'],
    'home': ['home.php', 'index.php'],
    'single': ['single.php', 'index.php'],
    'page': ['page.php', 'index.php'],
    'category': ['category.php', 'archive.php', 'index.php'],
    'tag': ['tag.php', 'archive.php', 'index.php'],
    'author': ['author.php', 'archive.php', 'index.php'],
    'archive': ['archive.php', 'index.php'],
    'search': ['search.php', 'index.php'],
    '404': ['404.php', 'index.php'],
  };
  
  const candidates = templateMap[ctx.pageType] || ['index.php'];
  let template = '';
  for (const candidate of candidates) {
    if (files[candidate]) { template = files[candidate]; break; }
  }
  
  if (!template) template = files['index.php'] || '<html><body><?php the_content(); ?></body></html>';
  
  // PHP template rendering (simplified transpiler)
  return await transpilePhpTemplate(template, files, ctx, db, env, registry);
}

/**
 * Simplified PHP → HTML transpiler for WordPress themes
 * Handles the most common WordPress template tags
 */
async function transpilePhpTemplate(
  php: string,
  files: Record<string, string>,
  ctx: ThemeContext,
  db: WPDB,
  env: Env,
  registry: PluginRegistry
): Promise<string> {
  let html = php;

  // Remove PHP opening/closing tags
  html = html.replace(/<\?php/g, '<?').replace(/<\?=/g, '<?=');

  // Process get_header() / get_footer() / get_sidebar() includes
  const header = files['header.php'] || '';
  const footer = files['footer.php'] || '';
  const sidebar = files['sidebar.php'] || '';

  html = html.replace(/get_header\([^)]*\);?/g, header);
  html = html.replace(/get_footer\([^)]*\);?/g, footer);
  html = html.replace(/get_sidebar\([^)]*\);?/g, sidebar);

  // Process template tags
  const siteUrl = ctx.siteUrl;
  const themePath = `${siteUrl}/wp-content/themes/${ctx.themeName}`;

  const replacements: Array<[RegExp, string | ((m: string, ...args: string[]) => string)]> = [
    // URLs
    [/<?=?\s*bloginfo\('name'\)\s*;?\s*\?>/g, ctx.siteName],
    [/<?=?\s*bloginfo\('description'\)\s*;?\s*\?>/g, ctx.siteDescription],
    [/<?=?\s*bloginfo\('url'\)\s*;?\s*\?>/g, siteUrl],
    [/<?=?\s*get_bloginfo\('url'\)\s*;?\s*\?>/g, siteUrl],
    [/<?=?\s*bloginfo\('stylesheet_url'\)\s*;?\s*\?>/g, `${themePath}/style.css`],
    [/<?=?\s*bloginfo\('template_url'\)\s*;?\s*\?>/g, themePath],
    [/<?=?\s*get_template_directory_uri\(\)\s*;?\s*\?>/g, themePath],
    [/<?=?\s*get_stylesheet_directory_uri\(\)\s*;?\s*\?>/g, themePath],
    [/<?=?\s*home_url\(['"]?([^'")\s]*)['"]\s*\)\s*;?\s*\?>/g, (_, path) => siteUrl + path],
    [/<?=?\s*home_url\(\s*\)\s*;?\s*\?>/g, siteUrl],
    [/<?=?\s*site_url\(\s*\)\s*;?\s*\?>/g, siteUrl],
    [/<?=?\s*admin_url\(['"]([^'"]*)['"]\)\s*;?\s*\?>/g, (_, path) => `${siteUrl}/wp-admin/${path}`],

    // Head/body
    [/<?php\s+wp_head\(\)\s*;?\s*\?>/g, generateWPHead(ctx, db, env, registry)],
    [/<?php\s+wp_footer\(\s*\)\s*;?\s*\?>/g, generateWPFooter(ctx, registry)],
    [/<?php\s+body_class\([^)]*\)\s*;?\s*\?>/g, `class="${getBodyClasses(ctx).join(' ')}"`],
    [/<?php\s+language_attributes\(\s*\)\s*;?\s*\?>/g, 'lang="ko-KR"'],

    // Post data
    [/<?=?\s*the_title\(\s*\)\s*;?\s*\?>/g, ctx.post?.post_title || ''],
    [/<?=?\s*get_the_title\(\s*\)\s*;?\s*\?>/g, ctx.post?.post_title || ''],
    [/<?=?\s*the_excerpt\(\s*\)\s*;?\s*\?>/g, ctx.post?.post_excerpt || ''],
    [/<?php\s+the_content\(\s*\)\s*;?\s*\?>/g, ctx.post ? renderBlocks(parseBlocks(ctx.post.post_content || ''), { siteUrl }) : ''],
    [/<?=?\s*the_date\([^)]*\)\s*;?\s*\?>/g, ctx.post?.post_date?.split(' ')[0] || ''],
    [/<?=?\s*the_time\([^)]*\)\s*;?\s*\?>/g, ctx.post?.post_date?.split(' ')[1] || ''],
    [/<?=?\s*get_the_date\([^)]*\)\s*;?\s*\?>/g, ctx.post?.post_date?.split(' ')[0] || ''],
    [/<?=?\s*the_ID\(\s*\)\s*;?\s*\?>/g, String(ctx.post?.ID || '')],
    [/<?=?\s*get_the_ID\(\s*\)\s*;?\s*\?>/g, String(ctx.post?.ID || '')],
    [/<?=?\s*the_permalink\(\s*\)\s*;?\s*\?>/g, ctx.post ? `${siteUrl}/${ctx.post.post_name}/` : siteUrl],
    [/<?=?\s*get_permalink\(\s*\)\s*;?\s*\?>/g, ctx.post ? `${siteUrl}/${ctx.post.post_name}/` : siteUrl],
    [/<?=?\s*esc_url\(get_permalink\(\)\)\s*;?\s*\?>/g, ctx.post ? `${siteUrl}/${ctx.post.post_name}/` : siteUrl],

    // Navigation
    [/<?php\s+wp_nav_menu\([^)]*\)\s*;?\s*\?>/g, generateNavMenu(ctx, db)],
    [/<?php\s+the_post_thumbnail\([^)]*\)\s*;?\s*\?>/g, ''],

    // Comments
    [/<?php\s+comments_template\([^)]*\)\s*;?\s*\?>/g, ''],
    [/<?php\s+comment_form\([^)]*\)\s*;?\s*\?>/g, generateCommentForm(ctx)],

    // Search
    [/<?php\s+get_search_form\([^)]*\)\s*;?\s*\?>/g, generateSearchForm(siteUrl)],

    // Misc PHP strips
    [/<?php[^?]*\?>/g, ''],
    [/<?=[^?]*\?>/g, ''],
    [/<\?[^>]*>/g, ''],
  ];

  for (const [pattern, replacement] of replacements) {
    if (typeof replacement === 'string') {
      html = html.replace(pattern, replacement);
    } else {
      html = html.replace(pattern, replacement as any);
    }
  }

  return html;
}

function generateWPHead(ctx: ThemeContext, db: WPDB, env: Env, registry: PluginRegistry): string {
  const title = ctx.post?.post_title ? `${ctx.post.post_title} - ${ctx.siteName}` : ctx.siteName;
  const adminScripts = registry.getAllAdminScripts();
  const adminStyles = registry.getAllAdminStyles();
  
  const pluginStyles = adminStyles.map(s =>
    `<link rel="stylesheet" href="${s.src}" id="${s.handle}-css"/>`
  ).join('\n');
  
  const pluginScripts = adminScripts.map(s =>
    `<script src="${s.src}" id="${s.handle}-js"></script>`
  ).join('\n');

  return `<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${title}</title>
<link rel="stylesheet" href="${ctx.themeUrl}/style.css"/>
${pluginStyles}
<link rel="pingback" href="${ctx.siteUrl}/xmlrpc.php"/>
<script>var cfwp = ${JSON.stringify({ ajaxurl: '/wp-admin/admin-ajax.php', siteUrl: ctx.siteUrl, themeUrl: ctx.themeUrl })};</script>`;
}

function generateWPFooter(ctx: ThemeContext, registry: PluginRegistry): string {
  return `<script src="/wp-includes/js/jquery/jquery.min.js"></script>
<script src="/wp-includes/js/wp-embed.min.js"></script>
<script>
// WordPress compatibility shim
window.wp = window.wp || {};
window.ajaxurl = '/wp-admin/admin-ajax.php';
</script>`;
}

function getBodyClasses(ctx: ThemeContext): string[] {
  const classes = ['home'];
  if (ctx.pageType === 'single') classes.push('single', 'single-post');
  if (ctx.pageType === 'page') classes.push('page');
  if (ctx.pageType === 'home') classes.push('blog');
  if (ctx.pageType === 'archive') classes.push('archive');
  if (ctx.pageType === '404') classes.push('error404');
  if (ctx.pageType === 'search') classes.push('search');
  return classes;
}

function generateNavMenu(ctx: ThemeContext, db: WPDB): string {
  return `<nav class="main-navigation">
    <ul id="primary-menu">
      <li><a href="${ctx.siteUrl}/">홈</a></li>
    </ul>
  </nav>`;
}

function generateCommentForm(ctx: ThemeContext): string {
  return `<div id="respond">
    <h3>댓글 남기기</h3>
    <form action="/wp-comments-post.php" method="post">
      <p><label>이름 <input type="text" name="author" required/></label></p>
      <p><label>이메일 <input type="email" name="email" required/></label></p>
      <p><label>댓글 <textarea name="comment" required></textarea></label></p>
      <input type="hidden" name="comment_post_ID" value="${ctx.post?.ID || 0}"/>
      <p><input type="submit" value="댓글 등록"/></p>
    </form>
  </div>`;
}

function generateSearchForm(siteUrl: string): string {
  return `<form role="search" method="get" action="${siteUrl}/">
    <input type="search" name="s" placeholder="검색..."/>
    <button type="submit">검색</button>
  </form>`;
}

/**
 * Built-in minimal theme (fallback)
 */
async function renderBuiltinTheme(
  ctx: ThemeContext,
  db: WPDB,
  registry: PluginRegistry
): Promise<string> {
  const title = ctx.post?.post_title ? `${ctx.post.post_title} - ${ctx.siteName}` : ctx.siteName;
  const bodyClasses = getBodyClasses(ctx).join(' ');

  let mainContent = '';

  if (ctx.pageType === 'single' || ctx.pageType === 'page') {
    const post = ctx.post!;
    const content = renderBlocks(parseBlocks(post.post_content || ''), { siteUrl: ctx.siteUrl });
    mainContent = `
      <article id="post-${post.ID}" class="post-${post.ID} ${post.post_type} hentry">
        <header class="entry-header">
          <h1 class="entry-title">${post.post_title}</h1>
          <div class="entry-meta">
            <time class="entry-date">${post.post_date?.split(' ')[0]}</time>
          </div>
        </header>
        <div class="entry-content">${content}</div>
      </article>`;
  } else if (ctx.pageType === '404') {
    mainContent = `<div class="error-404 not-found"><h1>404 - 페이지를 찾을 수 없습니다</h1><p><a href="${ctx.siteUrl}/">홈으로 돌아가기</a></p></div>`;
  } else if (ctx.pageType === 'search') {
    const posts = ctx.posts || [];
    if (!posts.length) {
      mainContent = `<p>검색 결과가 없습니다.</p>`;
    } else {
      mainContent = posts.map(p => `
        <article class="post-${p.ID}">
          <h2><a href="${ctx.siteUrl}/${p.post_name}/">${p.post_title}</a></h2>
          <p>${p.post_excerpt || p.post_content?.substring(0, 200) || ''}</p>
        </article>`).join('');
    }
  } else {
    // Home/archive: list of posts
    const posts = ctx.posts || [];
    mainContent = posts.map(p => `
      <article class="post-${p.ID} post type-post status-publish hentry">
        <header class="entry-header">
          <h2 class="entry-title"><a href="${ctx.siteUrl}/${p.post_name}/">${p.post_title}</a></h2>
          <div class="entry-meta"><time>${p.post_date?.split(' ')[0]}</time></div>
        </header>
        <div class="entry-summary"><p>${p.post_excerpt || p.post_content?.substring(0, 200) || ''}...</p></div>
        <footer class="entry-footer"><a href="${ctx.siteUrl}/${p.post_name}/" class="more-link">더 읽기</a></footer>
      </article>`).join('');
  }

  const frontScripts = registry.getAll().flatMap(p => p.frontScripts);
  const frontStyles = registry.getAll().flatMap(p => p.frontStyles);

  return `<!DOCTYPE html>
<html lang="ko-KR">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${title}</title>
${frontStyles.map(s => `<link rel="stylesheet" href="${s.src}"/>`).join('\n')}
<style>
:root{--color-primary:#0073aa;--color-text:#1a1a1a;--color-bg:#fff;--color-border:#ddd;--max-width:1200px}
*,*::before,*::after{box-sizing:border-box}
body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen,Ubuntu,sans-serif;font-size:16px;line-height:1.75;color:var(--color-text);background:var(--color-bg)}
a{color:var(--color-primary);text-decoration:none}a:hover{text-decoration:underline}
img{max-width:100%;height:auto}
.site{display:flex;flex-direction:column;min-height:100vh}
.site-header{background:#fff;border-bottom:1px solid var(--color-border);padding:1rem 0}
.container{max-width:var(--max-width);margin:0 auto;padding:0 1.5rem}
.site-title{margin:0;font-size:1.5rem}<br/>.site-description{margin:.25rem 0 0;color:#666;font-size:.9rem}
.main-navigation ul{list-style:none;margin:0;padding:0;display:flex;gap:1.5rem}
.main-navigation a{color:var(--color-text);font-weight:500}
.site-content{flex:1;padding:3rem 0}
.content-area{max-width:840px}
article{margin-bottom:3rem;padding-bottom:3rem;border-bottom:1px solid var(--color-border)}
article:last-child{border-bottom:none}
.entry-title{font-size:1.75rem;margin:0 0 .5rem}
.entry-meta{color:#666;font-size:.85rem;margin-bottom:1rem}
.entry-content h1,.entry-content h2,.entry-content h3{margin-top:1.5em}
.entry-content p{margin:0 0 1.25em}
.entry-content img{border-radius:4px}
.entry-content ul,.entry-content ol{padding-left:1.5em}
.entry-content blockquote{border-left:4px solid var(--color-primary);margin:1.5em 0;padding:.5em 1.5em;color:#555;background:#f8f8f8}
.entry-content pre{background:#1a1a1a;color:#f8f8f8;padding:1em;border-radius:4px;overflow-x:auto}
.entry-content code{background:#f0f0f0;padding:.1em .3em;border-radius:2px;font-size:.9em}
.wp-block-image{margin:1.5em 0}
.wp-block-image img{border-radius:4px}
.wp-block-gallery{display:grid;grid-template-columns:repeat(3,1fr);gap:.5rem;margin:1.5em 0}
.wp-block-columns{display:flex;gap:1.5rem;margin:1.5em 0}
.wp-block-column{flex:1}
.wp-block-button .wp-block-button__link{display:inline-block;padding:.6em 1.5em;background:var(--color-primary);color:#fff;border-radius:4px}
.wp-block-separator{border:none;border-top:1px solid var(--color-border);margin:2em 0}
.wp-block-quote{border-left:4px solid var(--color-primary);padding:.5em 1.5em;margin:1.5em 0;background:#f8f8f8}
.more-link{display:inline-block;margin-top:.5rem;color:var(--color-primary);font-weight:500}
.site-footer{background:#1a1a1a;color:#fff;padding:2rem 0;margin-top:auto}
.site-footer a{color:#aaa}
.pagination{display:flex;gap:.5rem;justify-content:center;padding:2rem 0}
.page-numbers{display:inline-block;padding:.4em .8em;border:1px solid var(--color-border);border-radius:3px}
.page-numbers.current{background:var(--color-primary);color:#fff;border-color:var(--color-primary)}
@media(max-width:768px){.wp-block-columns{flex-direction:column}.wp-block-gallery{grid-template-columns:repeat(2,1fr)}}
</style>
<script>var cfwp={ajaxurl:'/wp-admin/admin-ajax.php',siteUrl:'${ctx.siteUrl}'};</script>
</head>
<body class="${bodyClasses}">
<div id="page" class="site">
  <header id="masthead" class="site-header">
    <div class="container">
      <div class="site-branding">
        <p class="site-title"><a href="${ctx.siteUrl}/" rel="home">${ctx.siteName}</a></p>
        <p class="site-description">${ctx.siteDescription}</p>
      </div>
      <nav class="main-navigation">
        <ul>
          <li><a href="${ctx.siteUrl}/">홈</a></li>
        </ul>
      </nav>
    </div>
  </header>
  <div id="content" class="site-content">
    <div class="container">
      <main id="primary" class="content-area">
        ${mainContent}
      </main>
    </div>
  </div>
  <footer id="colophon" class="site-footer">
    <div class="container">
      <div class="site-info">
        <span>${ctx.siteName} &copy; ${new Date().getFullYear()} &mdash; Powered by <a href="https://github.com/cf-wordpress">CF-WordPress</a></span>
      </div>
    </div>
  </footer>
</div>
${frontScripts.map(s => `<script src="${s.src}"></script>`).join('\n')}
<script src="/wp-includes/js/jquery/jquery.min.js" defer></script>
</body>
</html>`;
}
