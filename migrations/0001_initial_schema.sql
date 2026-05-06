-- CF-WordPress D1 Migration: 0001_initial_schema.sql
-- Creates all WordPress-compatible tables

CREATE TABLE IF NOT EXISTS wp_options (
  option_id INTEGER PRIMARY KEY AUTOINCREMENT,
  option_name TEXT NOT NULL UNIQUE,
  option_value TEXT NOT NULL DEFAULT '',
  autoload TEXT NOT NULL DEFAULT 'yes'
);
CREATE INDEX IF NOT EXISTS wp_options_autoload ON wp_options(autoload);

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
CREATE UNIQUE INDEX IF NOT EXISTS wp_users_user_login_key ON wp_users(user_login);
CREATE INDEX IF NOT EXISTS wp_users_user_nicename ON wp_users(user_nicename);
CREATE INDEX IF NOT EXISTS wp_users_user_email ON wp_users(user_email);

CREATE TABLE IF NOT EXISTS wp_usermeta (
  umeta_id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL DEFAULT 0,
  meta_key TEXT DEFAULT NULL,
  meta_value TEXT
);
CREATE INDEX IF NOT EXISTS wp_usermeta_user_id ON wp_usermeta(user_id);
CREATE INDEX IF NOT EXISTS wp_usermeta_meta_key ON wp_usermeta(meta_key);

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
CREATE INDEX IF NOT EXISTS wp_posts_post_name ON wp_posts(post_name);
CREATE INDEX IF NOT EXISTS wp_posts_type_status ON wp_posts(post_type, post_status);
CREATE INDEX IF NOT EXISTS wp_posts_post_parent ON wp_posts(post_parent);
CREATE INDEX IF NOT EXISTS wp_posts_post_author ON wp_posts(post_author);
CREATE INDEX IF NOT EXISTS wp_posts_post_date ON wp_posts(post_date);

CREATE TABLE IF NOT EXISTS wp_postmeta (
  meta_id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL DEFAULT 0,
  meta_key TEXT DEFAULT NULL,
  meta_value TEXT
);
CREATE INDEX IF NOT EXISTS wp_postmeta_post_id ON wp_postmeta(post_id);
CREATE INDEX IF NOT EXISTS wp_postmeta_meta_key ON wp_postmeta(meta_key);

CREATE TABLE IF NOT EXISTS wp_terms (
  term_id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL DEFAULT '',
  slug TEXT NOT NULL DEFAULT '',
  term_group INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS wp_terms_slug ON wp_terms(slug);
CREATE INDEX IF NOT EXISTS wp_terms_name ON wp_terms(name);

CREATE TABLE IF NOT EXISTS wp_term_taxonomy (
  term_taxonomy_id INTEGER PRIMARY KEY AUTOINCREMENT,
  term_id INTEGER NOT NULL DEFAULT 0,
  taxonomy TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  parent INTEGER NOT NULL DEFAULT 0,
  count INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS wp_term_taxonomy_term ON wp_term_taxonomy(term_id, taxonomy);
CREATE INDEX IF NOT EXISTS wp_term_taxonomy_taxonomy ON wp_term_taxonomy(taxonomy);

CREATE TABLE IF NOT EXISTS wp_term_relationships (
  object_id INTEGER NOT NULL DEFAULT 0,
  term_taxonomy_id INTEGER NOT NULL DEFAULT 0,
  term_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (object_id, term_taxonomy_id)
);
CREATE INDEX IF NOT EXISTS wp_term_relationships_term_taxonomy_id ON wp_term_relationships(term_taxonomy_id);

CREATE TABLE IF NOT EXISTS wp_termmeta (
  meta_id INTEGER PRIMARY KEY AUTOINCREMENT,
  term_id INTEGER NOT NULL DEFAULT 0,
  meta_key TEXT DEFAULT NULL,
  meta_value TEXT
);
CREATE INDEX IF NOT EXISTS wp_termmeta_term_id ON wp_termmeta(term_id);
CREATE INDEX IF NOT EXISTS wp_termmeta_meta_key ON wp_termmeta(meta_key);

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
CREATE INDEX IF NOT EXISTS wp_comments_comment_post_ID ON wp_comments(comment_post_ID);
CREATE INDEX IF NOT EXISTS wp_comments_comment_approved_date_gmt ON wp_comments(comment_approved, comment_date_gmt);
CREATE INDEX IF NOT EXISTS wp_comments_comment_date_gmt ON wp_comments(comment_date_gmt);
CREATE INDEX IF NOT EXISTS wp_comments_comment_parent ON wp_comments(comment_parent);
CREATE INDEX IF NOT EXISTS wp_comments_user_id ON wp_comments(user_id);

CREATE TABLE IF NOT EXISTS wp_commentmeta (
  meta_id INTEGER PRIMARY KEY AUTOINCREMENT,
  comment_id INTEGER NOT NULL DEFAULT 0,
  meta_key TEXT DEFAULT NULL,
  meta_value TEXT
);
CREATE INDEX IF NOT EXISTS wp_commentmeta_comment_id ON wp_commentmeta(comment_id);
CREATE INDEX IF NOT EXISTS wp_commentmeta_meta_key ON wp_commentmeta(meta_key);

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

CREATE TABLE IF NOT EXISTS wp_presslearn_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  time TEXT NOT NULL DEFAULT '',
  event TEXT NOT NULL DEFAULT '',
  details TEXT NOT NULL DEFAULT '',
  ip TEXT NOT NULL DEFAULT '',
  user_agent TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS wp_presslearn_logs_time ON wp_presslearn_logs(time);
CREATE INDEX IF NOT EXISTS wp_presslearn_logs_event ON wp_presslearn_logs(event);
