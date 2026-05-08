-- CloudPress CMS — schema.sql (완전판)
-- Cloudflare D1 (SQLite) 기반 WordPress 완전 호환 스키마
-- wrangler d1 execute cloudpress-cms-db --remote --file=schema.sql

CREATE TABLE IF NOT EXISTS wp_users (
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
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_login ON wp_users(user_login);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON wp_users(user_email);

CREATE TABLE IF NOT EXISTS wp_usermeta (
  umeta_id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL DEFAULT 0,
  meta_key TEXT,
  meta_value TEXT
);
CREATE INDEX IF NOT EXISTS idx_usermeta_user_id ON wp_usermeta(user_id);
CREATE INDEX IF NOT EXISTS idx_usermeta_key ON wp_usermeta(meta_key);

CREATE TABLE IF NOT EXISTS wp_posts (
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
);
CREATE INDEX IF NOT EXISTS idx_posts_type_status ON wp_posts(post_type, post_status);
CREATE INDEX IF NOT EXISTS idx_posts_name ON wp_posts(post_name);
CREATE INDEX IF NOT EXISTS idx_posts_author ON wp_posts(post_author);
CREATE INDEX IF NOT EXISTS idx_posts_date ON wp_posts(post_date DESC);
CREATE INDEX IF NOT EXISTS idx_posts_parent ON wp_posts(post_parent);

CREATE TABLE IF NOT EXISTS wp_postmeta (
  meta_id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL DEFAULT 0,
  meta_key TEXT,
  meta_value TEXT
);
CREATE INDEX IF NOT EXISTS idx_postmeta_post_id ON wp_postmeta(post_id);
CREATE INDEX IF NOT EXISTS idx_postmeta_key ON wp_postmeta(meta_key);

CREATE TABLE IF NOT EXISTS wp_options (
  option_id INTEGER PRIMARY KEY AUTOINCREMENT,
  option_name TEXT NOT NULL DEFAULT '',
  option_value TEXT NOT NULL DEFAULT '',
  autoload TEXT NOT NULL DEFAULT 'yes'
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_options_name ON wp_options(option_name);

CREATE TABLE IF NOT EXISTS wp_terms (
  term_id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL DEFAULT '',
  slug TEXT NOT NULL DEFAULT '',
  term_group INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_terms_slug ON wp_terms(slug);

CREATE TABLE IF NOT EXISTS wp_term_taxonomy (
  term_taxonomy_id INTEGER PRIMARY KEY AUTOINCREMENT,
  term_id INTEGER NOT NULL DEFAULT 0,
  taxonomy TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  parent INTEGER NOT NULL DEFAULT 0,
  count INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_term_taxonomy_term_id ON wp_term_taxonomy(term_id);
CREATE INDEX IF NOT EXISTS idx_term_taxonomy_taxonomy ON wp_term_taxonomy(taxonomy);

CREATE TABLE IF NOT EXISTS wp_term_relationships (
  object_id INTEGER NOT NULL DEFAULT 0,
  term_taxonomy_id INTEGER NOT NULL DEFAULT 0,
  term_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (object_id, term_taxonomy_id)
);

CREATE TABLE IF NOT EXISTS wp_termmeta (
  meta_id INTEGER PRIMARY KEY AUTOINCREMENT,
  term_id INTEGER NOT NULL DEFAULT 0,
  meta_key TEXT,
  meta_value TEXT
);
CREATE INDEX IF NOT EXISTS idx_termmeta_term_id ON wp_termmeta(term_id);

CREATE TABLE IF NOT EXISTS wp_comments (
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
);
CREATE INDEX IF NOT EXISTS idx_comments_post_id ON wp_comments(comment_post_ID);
CREATE INDEX IF NOT EXISTS idx_comments_approved ON wp_comments(comment_approved);

CREATE TABLE IF NOT EXISTS wp_commentmeta (
  meta_id INTEGER PRIMARY KEY AUTOINCREMENT,
  comment_id INTEGER NOT NULL DEFAULT 0,
  meta_key TEXT,
  meta_value TEXT
);
CREATE INDEX IF NOT EXISTS idx_commentmeta_comment_id ON wp_commentmeta(comment_id);

CREATE TABLE IF NOT EXISTS wp_links (
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
);

CREATE TABLE IF NOT EXISTS wp_media_chunks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL,
  chunk_index INTEGER NOT NULL,
  data TEXT NOT NULL,
  UNIQUE(post_id, chunk_index)
);
CREATE INDEX IF NOT EXISTS idx_media_chunks_post_id ON wp_media_chunks(post_id);

CREATE TABLE IF NOT EXISTS cloudpress_plugins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  plugin_name TEXT NOT NULL DEFAULT '',
  version TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  author TEXT NOT NULL DEFAULT '',
  author_url TEXT NOT NULL DEFAULT '',
  plugin_url TEXT NOT NULL DEFAULT '',
  requires_wp TEXT NOT NULL DEFAULT '',
  tested_up_to TEXT NOT NULL DEFAULT '',
  rating REAL NOT NULL DEFAULT 0,
  num_ratings INTEGER NOT NULL DEFAULT 0,
  active_installs INTEGER NOT NULL DEFAULT 0,
  last_updated TEXT NOT NULL DEFAULT '',
  is_active INTEGER NOT NULL DEFAULT 0,
  installed_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS cloudpress_plugin_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  data TEXT NOT NULL,
  UNIQUE(slug, chunk_index)
);
CREATE INDEX IF NOT EXISTS idx_plugin_files_slug ON cloudpress_plugin_files(slug);

CREATE TABLE IF NOT EXISTS cloudpress_themes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  theme_name TEXT NOT NULL DEFAULT '',
  version TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  author TEXT NOT NULL DEFAULT '',
  author_url TEXT NOT NULL DEFAULT '',
  theme_url TEXT NOT NULL DEFAULT '',
  screenshot_url TEXT NOT NULL DEFAULT '',
  requires_wp TEXT NOT NULL DEFAULT '',
  tested_up_to TEXT NOT NULL DEFAULT '',
  rating REAL NOT NULL DEFAULT 0,
  installed_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS cloudpress_theme_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  data TEXT NOT NULL,
  UNIQUE(slug, chunk_index)
);
CREATE INDEX IF NOT EXISTS idx_theme_files_slug ON cloudpress_theme_files(slug);

CREATE TABLE IF NOT EXISTS cloudpress_plugin_menus (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plugin_slug TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL DEFAULT '',
  icon TEXT NOT NULL DEFAULT '🔌',
  menu_position INTEGER NOT NULL DEFAULT 80,
  parent_slug TEXT NOT NULL DEFAULT '',
  capability TEXT NOT NULL DEFAULT 'manage_options'
);

CREATE TABLE IF NOT EXISTS cms_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS cms_zip_chunks (
  chunk_index INTEGER NOT NULL,
  data TEXT NOT NULL,
  PRIMARY KEY (chunk_index)
);

-- 기본 데이터
INSERT OR IGNORE INTO wp_options (option_name, option_value, autoload) VALUES
  ('siteurl',                'https://cloudpress-cms.pages.dev', 'yes'),
  ('home',                   'https://cloudpress-cms.pages.dev', 'yes'),
  ('blogname',               'CloudPress 사이트', 'yes'),
  ('blogdescription',        'WordPress on Cloudflare Workers', 'yes'),
  ('admin_email',            'admin@example.com', 'yes'),
  ('timezone_string',        'Asia/Seoul', 'yes'),
  ('date_format',            'Y년 n월 j일', 'yes'),
  ('time_format',            'g:i a', 'yes'),
  ('start_of_week',          '0', 'yes'),
  ('posts_per_page',         '10', 'yes'),
  ('posts_per_rss',          '10', 'yes'),
  ('blog_public',            '1', 'yes'),
  ('show_on_front',          'posts', 'yes'),
  ('default_category',       '1', 'yes'),
  ('default_post_format',    '0', 'yes'),
  ('default_comment_status', 'open', 'yes'),
  ('comment_moderation',     '0', 'yes'),
  ('show_avatars',           '1', 'yes'),
  ('avatar_default',         'mystery', 'yes'),
  ('WPLANG',                 'ko_KR', 'yes'),
  ('active_plugins',         '[]', 'yes'),
  ('template',               'twentytwentyfour', 'yes'),
  ('stylesheet',             'twentytwentyfour', 'yes'),
  ('current_theme',          'Twenty Twenty-Four', 'yes'),
  ('db_version',             '57155', 'yes'),
  ('blogcharset',            'UTF-8', 'yes'),
  ('permalink_structure',    '/%postname%/', 'yes'),
  ('thumbnail_size_w',       '150', 'yes'),
  ('thumbnail_size_h',       '150', 'yes'),
  ('medium_size_w',          '300', 'yes'),
  ('medium_size_h',          '300', 'yes'),
  ('large_size_w',           '1024', 'yes'),
  ('large_size_h',           '1024', 'yes');

INSERT OR IGNORE INTO wp_users (ID, user_login, user_pass, user_nicename, user_email, user_registered, display_name, user_status)
VALUES (1, 'admin', 'CHANGE_ME', 'admin', 'admin@example.com', datetime('now'), '관리자', 0);

INSERT OR IGNORE INTO wp_usermeta (user_id, meta_key, meta_value) VALUES
  (1, 'wp_capabilities',    '{"administrator":true}'),
  (1, 'wp_user_level',      '10'),
  (1, 'show_welcome_panel', '1'),
  (1, 'admin_color',        'fresh'),
  (1, 'show_admin_bar_front', 'true');

INSERT OR IGNORE INTO wp_terms (term_id, name, slug, term_group) VALUES (1, '미분류', 'uncategorized', 0);
INSERT OR IGNORE INTO wp_term_taxonomy (term_taxonomy_id, term_id, taxonomy, description, parent, count) VALUES (1, 1, 'category', '', 0, 1);

INSERT OR IGNORE INTO wp_posts (
  ID, post_author, post_date, post_date_gmt,
  post_content, post_title, post_excerpt,
  post_status, post_name, post_type,
  comment_status, ping_status, menu_order,
  post_modified, post_modified_gmt,
  guid, post_mime_type, post_content_filtered, to_ping, pinged
) VALUES (
  1, 1, datetime('now'), datetime('now'),
  '## CloudPress CMS에 오신 것을 환영합니다!

WordPress와 완전히 호환되는 CloudPress CMS입니다.

### 특징
- WordPress 플러그인/테마 설치 및 활성화
- Cloudflare D1 데이터베이스
- GitHub 자동 연동
- WordPress REST API 완전 호환',
  'CloudPress CMS에 오신 것을 환영합니다', '',
  'publish', 'hello-world', 'post',
  'open', 'open', 0,
  datetime('now'), datetime('now'),
  '/?p=1', '', '', '', ''
);

INSERT OR IGNORE INTO wp_term_relationships (object_id, term_taxonomy_id, term_order) VALUES (1, 1, 0);
