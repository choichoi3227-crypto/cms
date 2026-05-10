export interface Env {
  // D1 Database (CloudPress CMS DB)
  DB: D1Database;

  // KV Namespaces
  CACHE: KVNamespace;
  SESSIONS: KVNamespace;   // 세션 저장소 (wrangler: SESSIONS)
  OPTIONS: KVNamespace;    // WordPress 옵션 캐시

  // Secrets (wrangler secret put)
  JWT_SECRET: string;
  ENCRYPTION_KEY: string;

  // Vars
  APP_ENV: string;
  APP_VERSION: string;
  SITE_URL: string;        // CloudPress 플랫폼 기본 URL
  WP_TABLE_PREFIX: string; // 테이블 접두사 (기본: wp_)
  GITHUB_OWNER: string;    // GitHub 스토리지 오너
  GITHUB_REPO: string;     // GitHub 스토리지 저장소
}

export interface WPUser {
  ID: number;
  user_login: string;
  user_pass: string;
  user_email: string;
  user_registered: string;
  display_name: string;
  user_nicename: string;
  user_url: string;
  user_status: number;
}

export interface WPPost {
  ID: number;
  post_author: number;
  post_date: string;
  post_date_gmt: string;
  post_content: string;
  post_title: string;
  post_excerpt: string;
  post_status: string;
  comment_status: string;
  ping_status: string;
  post_name: string;
  post_type: string;
  post_modified: string;
  post_modified_gmt: string;
  post_parent: number;
  guid: string;
  menu_order: number;
  post_mime_type: string;
  comment_count: number;
}

export interface WPTerm {
  term_id: number;
  name: string;
  slug: string;
  term_group: number;
  term_taxonomy_id: number;
  taxonomy: string;
  description: string;
  parent: number;
  count: number;
}

export interface WPOption {
  option_id: number;
  option_name: string;
  option_value: string;
  autoload: string;
}

export interface WPComment {
  comment_ID: number;
  comment_post_ID: number;
  comment_author: string;
  comment_author_email: string;
  comment_author_url: string;
  comment_author_IP: string;
  comment_date: string;
  comment_date_gmt: string;
  comment_content: string;
  comment_karma: number;
  comment_approved: string;
  comment_agent: string;
  comment_type: string;
  comment_parent: number;
  user_id: number;
}

export interface SessionData {
  userId: number;
  userLogin: string;
  userEmail: string;
  roles: string[];
  capabilities: Record<string, boolean>;
  expires: number;
}

export interface GithubConfig {
  token: string;
  owner: string;
  repo: string;
  branch: string;
}

export interface Plugin {
  slug: string;
  name: string;
  version: string;
  description: string;
  author: string;
  status: 'active' | 'inactive';
  files: Record<string, string>;
  mainFile: string;
}

export interface Theme {
  slug: string;
  name: string;
  version: string;
  description: string;
  author: string;
  screenshot?: string;
  active: boolean;
  files: Record<string, string>;
}

export interface BlockData {
  blockName: string;
  attrs: Record<string, unknown>;
  innerBlocks: BlockData[];
  innerHTML: string;
  innerContent: (string | null)[];
}

// CloudPress 플랫폼 사이트 정보 (cloud-press DB)
export interface CloudPressSite {
  id: string;
  user_id: string;
  site_name: string;
  primary_domain: string;
  custom_domain?: string;
  php_version: string;
  status: 'active' | 'suspended' | 'pending';
  plan: string;
  storage_used: number;
  created_at: string;
}
