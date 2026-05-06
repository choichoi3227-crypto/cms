import { IRequest } from 'itty-router';
import { Env } from '../types/env';
import { hashPassword } from '../utils/crypto';
import { GitHubStorage } from '../utils/github';
import { INSTALL_HTML } from '../admin/install-page';

export async function handleInstall(request: IRequest, env: Env): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === 'GET') {
    // Check if already installed
    const installed = await env.OPTIONS.get('opt:siteurl');
    if (installed) {
      return Response.redirect(`${url.origin}/wp-admin/`, 302);
    }
    return new Response(INSTALL_HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }

  if (request.method === 'POST') {
    const body = await request.json().catch(() => null) as Record<string, string> | null;
    if (!body) return jsonError('Invalid JSON', 400);

    const step = body.step || url.pathname.split('/').pop();

    if (step === 'validate-github') {
      return handleValidateGithub(body, env);
    }
    if (step === 'init' || url.pathname.endsWith('/init')) {
      return handleDoInstall(body, env, url.origin);
    }
  }

  return new Response('Not Found', { status: 404 });
}

async function handleValidateGithub(body: Record<string, string>, env: Env): Promise<Response> {
  const { github_token, github_repo } = body;
  if (!github_token) return jsonError('GitHub token required');

  const github = new GitHubStorage({
    token: github_token,
    owner: '',
    repo: github_repo || 'cfwp-storage',
    branch: 'main'
  });

  const user = await github.getAuthenticatedUser();
  if (!user) return jsonError('Invalid GitHub token');

  return jsonOk({ login: user.login, email: user.email });
}

async function handleDoInstall(
  body: Record<string, string>,
  env: Env,
  origin: string
): Promise<Response> {
  const {
    site_url, site_title, admin_user, admin_email, admin_password,
    github_token, github_repo, github_branch = 'main',
    plugins = ''
  } = body;

  // Validate required fields
  if (!site_title || !admin_user || !admin_email || !admin_password) {
    return jsonError('필수 항목이 누락되었습니다.');
  }

  const siteUrl = site_url || origin;

  try {
    // ── 1. Set up GitHub storage ───────────────────────────────────
    let githubOwner = '';
    if (github_token) {
      const github = new GitHubStorage({ token: github_token, owner: '', repo: github_repo || 'cfwp-storage', branch: github_branch });
      const user = await github.getAuthenticatedUser();
      if (!user) return jsonError('GitHub 토큰이 유효하지 않습니다.');
      githubOwner = user.login;

      // Create repo if not exists
      const repoName = github_repo || 'cfwp-storage';
      const repoInfo = await github.getRepoInfo();
      if (!repoInfo) {
        await github.createRepo(repoName, 'CF-WordPress Storage', true);
      }

      // Save GitHub config
      await env.OPTIONS.put('opt:github_token', github_token);
      await env.OPTIONS.put('opt:github_owner', githubOwner);
      await env.OPTIONS.put('opt:github_repo', repoName);
      await env.OPTIONS.put('opt:github_branch', github_branch);
    }

    // ── 2. Run D1 migrations ───────────────────────────────────────
    await runMigrations(env.DB);

    // ── 3. Create admin user ───────────────────────────────────────
    const hashedPw = await hashPassword(admin_password);
    const now = new Date().toISOString().replace('T', ' ').split('.')[0];

    await env.DB.prepare(`
      INSERT INTO wp_users (user_login, user_pass, user_email, user_registered, display_name, user_nicename, user_url, user_status)
      VALUES (?, ?, ?, ?, ?, ?, '', 0)
    `).bind(admin_user, hashedPw, admin_email, now, admin_user, admin_user.toLowerCase()).run();

    const userRow = await env.DB.prepare('SELECT ID FROM wp_users WHERE user_login = ?').bind(admin_user).first<{ ID: number }>();
    const userId = userRow?.ID || 1;

    // Set admin capabilities
    const caps = JSON.stringify({ administrator: true });
    await env.DB.prepare('INSERT INTO wp_usermeta (user_id, meta_key, meta_value) VALUES (?, ?, ?)')
      .bind(userId, 'wp_capabilities', caps).run();
    await env.DB.prepare('INSERT INTO wp_usermeta (user_id, meta_key, meta_value) VALUES (?, ?, ?)')
      .bind(userId, 'wp_user_level', '10').run();

    // ── 4. Save core options ──────────────────────────────────────
    const optionsToSave = [
      ['siteurl', siteUrl],
      ['home', siteUrl],
      ['blogname', site_title],
      ['blogdescription', 'WordPress로 구동되는 블로그'],
      ['admin_email', admin_email],
      ['template', 'twentytwentyfour'],
      ['stylesheet', 'twentytwentyfour'],
      ['posts_per_page', '10'],
      ['permalink_structure', '/%postname%/'],
      ['upload_path', ''],
      ['wp_user_roles', JSON.stringify(defaultRoles())],
      ['active_plugins', JSON.stringify(getSelectedPlugins(plugins))],
      ['db_version', '56657'],
      ['initial_db_version', '56657'],
      ['wp_user_roles', JSON.stringify(defaultRoles())],
    ];

    for (const [name, value] of optionsToSave) {
      await env.DB.prepare(
        `INSERT INTO wp_options (option_name, option_value, autoload) VALUES (?, ?, 'yes')
         ON CONFLICT(option_name) DO UPDATE SET option_value = excluded.option_value`
      ).bind(name, value).run();
      await env.OPTIONS.put(`opt:${name}`, value);
    }

    // ── 5. Create default content ─────────────────────────────────
    await env.DB.prepare(`
      INSERT INTO wp_posts (post_author, post_date, post_date_gmt, post_content, post_title,
        post_excerpt, post_status, comment_status, ping_status, post_name, post_type,
        post_modified, post_modified_gmt, post_parent, guid, menu_order)
      VALUES (?, ?, ?, ?, 'Hello world!', '', 'publish', 'open', 'open', 'hello-world', 'post', ?, ?, 0, ?, 0)
    `).bind(userId, now, now, 
      '<!-- wp:paragraph -->\n<p>WordPress에 오신 것을 환영합니다. 이것은 첫 번째 게시물입니다. 편집하거나 삭제하고 글쓰기를 시작하세요!</p>\n<!-- /wp:paragraph -->',
      now, now, `${siteUrl}/?p=1`).run();

    await env.DB.prepare(`
      INSERT INTO wp_posts (post_author, post_date, post_date_gmt, post_content, post_title,
        post_excerpt, post_status, comment_status, ping_status, post_name, post_type,
        post_modified, post_modified_gmt, post_parent, guid, menu_order)
      VALUES (?, ?, ?, ?, '샘플 페이지', '', 'publish', 'open', 'open', 'sample-page', 'page', ?, ?, 0, ?, 2)
    `).bind(userId, now, now,
      '<!-- wp:paragraph -->\n<p>이것은 샘플 페이지입니다. 블로그 게시물과 달리 페이지는 "내 소개" 또는 "연락처" 정보와 같은 정적 콘텐츠에 적합합니다.</p>\n<!-- /wp:paragraph -->',
      now, now, `${siteUrl}/?page_id=2`).run();

    // Default term (category)
    await env.DB.prepare('INSERT INTO wp_terms (name, slug, term_group) VALUES (?, ?, 0)').bind('미분류', 'uncategorized', 0).run();
    await env.DB.prepare('INSERT INTO wp_term_taxonomy (term_id, taxonomy, description, parent, count) VALUES (1, ?, "", 0, 1)').bind('category').run();
    await env.DB.prepare('INSERT INTO wp_term_relationships (object_id, term_taxonomy_id) VALUES (1, 1)').run();
    await env.OPTIONS.put('opt:default_category', '1');

    // ── 6. Flush options to KV ───────────────────────────────────
    await env.OPTIONS.put('opt:installed', '1');

    return jsonOk({ 
      message: '설치 완료!',
      redirect: '/wp-admin/',
      site_url: siteUrl
    });

  } catch (err) {
    console.error('Install error:', err);
    return jsonError(`설치 실패: ${String(err)}`, 500);
  }
}

async function runMigrations(db: D1Database): Promise<void> {
  // Create all WordPress tables
  const statements = [
    `CREATE TABLE IF NOT EXISTS wp_options (
      option_id INTEGER PRIMARY KEY AUTOINCREMENT,
      option_name TEXT NOT NULL UNIQUE,
      option_value TEXT NOT NULL DEFAULT '',
      autoload TEXT NOT NULL DEFAULT 'yes'
    )`,
    `CREATE TABLE IF NOT EXISTS wp_users (
      ID INTEGER PRIMARY KEY AUTOINCREMENT,
      user_login TEXT NOT NULL DEFAULT '',
      user_pass TEXT NOT NULL DEFAULT '',
      user_nicename TEXT NOT NULL DEFAULT '',
      user_email TEXT NOT NULL DEFAULT '',
      user_url TEXT NOT NULL DEFAULT '',
      user_registered TEXT NOT NULL DEFAULT '',
      user_activation_key TEXT NOT NULL DEFAULT '',
      user_status INTEGER NOT NULL DEFAULT 0,
      display_name TEXT NOT NULL DEFAULT ''
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS wp_users_login ON wp_users(user_login)`,
    `CREATE TABLE IF NOT EXISTS wp_usermeta (
      umeta_id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL DEFAULT 0,
      meta_key TEXT DEFAULT NULL,
      meta_value TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS wp_usermeta_user_id ON wp_usermeta(user_id)`,
    `CREATE INDEX IF NOT EXISTS wp_usermeta_meta_key ON wp_usermeta(meta_key)`,
    `CREATE TABLE IF NOT EXISTS wp_posts (
      ID INTEGER PRIMARY KEY AUTOINCREMENT,
      post_author INTEGER NOT NULL DEFAULT 0,
      post_date TEXT NOT NULL DEFAULT '',
      post_date_gmt TEXT NOT NULL DEFAULT '',
      post_content TEXT NOT NULL DEFAULT '',
      post_title TEXT NOT NULL DEFAULT '',
      post_excerpt TEXT NOT NULL DEFAULT '',
      post_status TEXT NOT NULL DEFAULT 'publish',
      comment_status TEXT NOT NULL DEFAULT 'open',
      ping_status TEXT NOT NULL DEFAULT 'open',
      post_password TEXT NOT NULL DEFAULT '',
      post_name TEXT NOT NULL DEFAULT '',
      to_ping TEXT NOT NULL DEFAULT '',
      pinged TEXT NOT NULL DEFAULT '',
      post_modified TEXT NOT NULL DEFAULT '',
      post_modified_gmt TEXT NOT NULL DEFAULT '',
      post_content_filtered TEXT NOT NULL DEFAULT '',
      post_parent INTEGER NOT NULL DEFAULT 0,
      guid TEXT NOT NULL DEFAULT '',
      menu_order INTEGER NOT NULL DEFAULT 0,
      post_type TEXT NOT NULL DEFAULT 'post',
      post_mime_type TEXT NOT NULL DEFAULT '',
      comment_count INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE INDEX IF NOT EXISTS wp_posts_type_status ON wp_posts(post_type, post_status)`,
    `CREATE INDEX IF NOT EXISTS wp_posts_post_name ON wp_posts(post_name)`,
    `CREATE INDEX IF NOT EXISTS wp_posts_author ON wp_posts(post_author)`,
    `CREATE TABLE IF NOT EXISTS wp_postmeta (
      meta_id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL DEFAULT 0,
      meta_key TEXT DEFAULT NULL,
      meta_value TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS wp_postmeta_post_id ON wp_postmeta(post_id)`,
    `CREATE INDEX IF NOT EXISTS wp_postmeta_meta_key ON wp_postmeta(meta_key)`,
    `CREATE TABLE IF NOT EXISTS wp_terms (
      term_id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL DEFAULT '',
      slug TEXT NOT NULL DEFAULT '',
      term_group INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS wp_terms_slug ON wp_terms(slug)`,
    `CREATE TABLE IF NOT EXISTS wp_term_taxonomy (
      term_taxonomy_id INTEGER PRIMARY KEY AUTOINCREMENT,
      term_id INTEGER NOT NULL DEFAULT 0,
      taxonomy TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      parent INTEGER NOT NULL DEFAULT 0,
      count INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS wp_term_taxonomy_term ON wp_term_taxonomy(term_id, taxonomy)`,
    `CREATE TABLE IF NOT EXISTS wp_term_relationships (
      object_id INTEGER NOT NULL DEFAULT 0,
      term_taxonomy_id INTEGER NOT NULL DEFAULT 0,
      term_order INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (object_id, term_taxonomy_id)
    )`,
    `CREATE TABLE IF NOT EXISTS wp_termmeta (
      meta_id INTEGER PRIMARY KEY AUTOINCREMENT,
      term_id INTEGER NOT NULL DEFAULT 0,
      meta_key TEXT DEFAULT NULL,
      meta_value TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS wp_comments (
      comment_ID INTEGER PRIMARY KEY AUTOINCREMENT,
      comment_post_ID INTEGER NOT NULL DEFAULT 0,
      comment_author TEXT NOT NULL DEFAULT '',
      comment_author_email TEXT NOT NULL DEFAULT '',
      comment_author_url TEXT NOT NULL DEFAULT '',
      comment_author_IP TEXT NOT NULL DEFAULT '',
      comment_date TEXT NOT NULL DEFAULT '',
      comment_date_gmt TEXT NOT NULL DEFAULT '',
      comment_content TEXT NOT NULL DEFAULT '',
      comment_karma INTEGER NOT NULL DEFAULT 0,
      comment_approved TEXT NOT NULL DEFAULT '1',
      comment_agent TEXT NOT NULL DEFAULT '',
      comment_type TEXT NOT NULL DEFAULT 'comment',
      comment_parent INTEGER NOT NULL DEFAULT 0,
      user_id INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE INDEX IF NOT EXISTS wp_comments_post ON wp_comments(comment_post_ID)`,
    `CREATE TABLE IF NOT EXISTS wp_commentmeta (
      meta_id INTEGER PRIMARY KEY AUTOINCREMENT,
      comment_id INTEGER NOT NULL DEFAULT 0,
      meta_key TEXT DEFAULT NULL,
      meta_value TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS wp_links (
      link_id INTEGER PRIMARY KEY AUTOINCREMENT,
      link_url TEXT NOT NULL DEFAULT '',
      link_name TEXT NOT NULL DEFAULT '',
      link_image TEXT NOT NULL DEFAULT '',
      link_target TEXT NOT NULL DEFAULT '',
      link_description TEXT NOT NULL DEFAULT '',
      link_visible TEXT NOT NULL DEFAULT 'Y',
      link_owner INTEGER NOT NULL DEFAULT 1,
      link_rating INTEGER NOT NULL DEFAULT 0,
      link_updated TEXT NOT NULL DEFAULT '',
      link_rel TEXT NOT NULL DEFAULT '',
      link_notes TEXT NOT NULL DEFAULT '',
      link_rss TEXT NOT NULL DEFAULT ''
    )`,
    `CREATE TABLE IF NOT EXISTS wp_presslearn_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      time TEXT NOT NULL DEFAULT '',
      event TEXT NOT NULL DEFAULT '',
      details TEXT NOT NULL DEFAULT ''
    )`,
  ];

  for (const sql of statements) {
    await db.prepare(sql).run().catch(() => {}); // Ignore if already exists
  }
}

function getSelectedPlugins(plugins: string): string[] {
  if (!plugins) return [];
  return plugins.split(',').map(p => p.trim()).filter(Boolean);
}

function defaultRoles(): Record<string, unknown> {
  return {
    administrator: {
      name: '관리자',
      capabilities: {
        switch_themes: true, edit_themes: true, activate_plugins: true,
        edit_plugins: true, edit_users: true, edit_files: true,
        manage_options: true, moderate_comments: true, manage_categories: true,
        manage_links: true, upload_files: true, import: true, unfiltered_html: true,
        edit_posts: true, edit_others_posts: true, edit_published_posts: true,
        publish_posts: true, edit_pages: true, read: true, level_10: true,
        level_9: true, level_8: true, level_7: true, level_6: true,
        level_5: true, level_4: true, level_3: true, level_2: true,
        level_1: true, level_0: true, edit_others_pages: true,
        edit_published_pages: true, publish_pages: true, delete_pages: true,
        delete_others_pages: true, delete_published_pages: true,
        delete_posts: true, delete_others_posts: true, delete_published_posts: true,
        delete_private_posts: true, edit_private_posts: true, read_private_posts: true,
        delete_private_pages: true, edit_private_pages: true, read_private_pages: true,
        delete_users: true, create_users: true, unfiltered_upload: true,
        edit_dashboard: true, update_plugins: true, delete_plugins: true,
        install_plugins: true, update_themes: true, install_themes: true,
        update_core: true, list_users: true, remove_users: true, promote_users: true,
        edit_theme_options: true, delete_themes: true, export: true
      }
    },
    editor: {
      name: '편집자',
      capabilities: {
        moderate_comments: true, manage_categories: true, manage_links: true,
        upload_files: true, unfiltered_html: true, edit_posts: true,
        edit_others_posts: true, edit_published_posts: true, publish_posts: true,
        edit_pages: true, read: true, level_7: true, edit_others_pages: true,
        edit_published_pages: true, publish_pages: true, delete_pages: true,
        delete_others_pages: true, delete_published_pages: true,
        delete_posts: true, delete_others_posts: true, delete_published_posts: true,
        delete_private_posts: true, edit_private_posts: true, read_private_posts: true,
        delete_private_pages: true, edit_private_pages: true, read_private_pages: true
      }
    },
    author: {
      name: '글쓴이',
      capabilities: {
        upload_files: true, edit_posts: true, edit_published_posts: true,
        publish_posts: true, delete_posts: true, delete_published_posts: true,
        read: true, level_2: true
      }
    },
    contributor: {
      name: '기고자',
      capabilities: { edit_posts: true, delete_posts: true, read: true, level_1: true }
    },
    subscriber: {
      name: '구독자',
      capabilities: { read: true, level_0: true }
    }
  };
}

function jsonOk(data: unknown): Response {
  return new Response(JSON.stringify({ success: true, data }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

function jsonError(message: string, status = 400): Response {
  return new Response(JSON.stringify({ success: false, error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
