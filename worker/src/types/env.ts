/**
 * CloudPress CMS — GitHub-only 환경 타입
 * D1 Database, KV Namespace 의존 완전 제거
 * GitHub 레포 = DB + 스토리지
 */

export interface Env {
  // Secrets (wrangler secret put)
  JWT_SECRET: string;
  ENCRYPTION_KEY: string;

  // GitHub 인증 (호스팅 생성 시 per-site 토큰)
  GITHUB_TOKEN: string;        // 플랫폼 운영 GitHub PAT
  GITHUB_OWNER: string;        // 플랫폼 GitHub 계정

  // Vars
  APP_ENV: string;
  APP_VERSION: string;
  SITE_URL: string;            // CloudPress 플랫폼 URL

  // Per-site: 요청 컨텍스트에서 주입
  _SITE_GITHUB_TOKEN?: string;  // 사이트별 GitHub Token (헤더 or 쿠키에서)
  _SITE_GITHUB_OWNER?: string;  // 사이트 GitHub owner
  _SITE_GITHUB_REPO?: string;   // 사이트 GitHub repo
  _SITE_GITHUB_BRANCH?: string; // 사이트 branch (default: main)
}

// ─── GitHub 기반 데이터 타입 ─────────────────────────────────────────────

export interface GithubConfig {
  token: string;
  owner: string;
  repo: string;
  branch: string;
}

/** _db/settings.json 에 저장되는 사이트 설정 */
export interface SiteSettings {
  site_name: string;
  site_description: string;
  site_url: string;
  admin_email: string;
  posts_per_page: number;
  active_theme: string;
  show_on_front: 'posts' | 'page';
  page_on_front?: number;
  language: string;
  timezone: string;
  date_format: string;
  comment_status: 'open' | 'closed';
  created_at: string;
  updated_at: string;
}

/** _db/posts/*.json */
export interface Post {
  id: number;
  title: string;
  slug: string;
  content: string;
  excerpt: string;
  status: 'publish' | 'draft' | 'pending' | 'private' | 'trash';
  post_type: 'post' | 'page';
  author_id: number;
  category_ids: number[];
  tag_ids: number[];
  featured_image?: string;
  comment_status: 'open' | 'closed';
  created_at: string;
  updated_at: string;
  published_at?: string;
  menu_order: number;
  comment_count: number;
}

/** _db/users.json */
export interface User {
  id: number;
  username: string;
  email: string;
  display_name: string;
  password_hash: string;
  role: 'administrator' | 'editor' | 'author' | 'contributor' | 'subscriber';
  registered_at: string;
  bio?: string;
  avatar?: string;
}

/** _db/categories.json / tags.json */
export interface Term {
  id: number;
  name: string;
  slug: string;
  description: string;
  parent_id?: number;
  count: number;
  taxonomy: 'category' | 'post_tag';
}

/** _db/comments.json */
export interface Comment {
  id: number;
  post_id: number;
  author_name: string;
  author_email: string;
  author_url?: string;
  content: string;
  status: 'approved' | 'pending' | 'spam' | 'trash';
  parent_id?: number;
  created_at: string;
  user_id?: number;
}

/** _db/media.json */
export interface MediaFile {
  id: number;
  filename: string;
  original_name: string;
  path: string;           // _media/YYYY/MM/filename
  url?: string;           // raw.githubusercontent.com URL
  mime_type: string;
  size: number;
  alt?: string;
  caption?: string;
  width?: number;
  height?: number;
  uploaded_at: string;
  uploaded_by: number;
}

/** _db/plugins.json */
export interface Plugin {
  slug: string;
  name: string;
  version: string;
  description: string;
  author: string;
  status: 'active' | 'inactive';
  main_file: string;
  installed_at: string;
  settings?: Record<string, unknown>;
}

/** _db/themes.json */
export interface Theme {
  slug: string;
  name: string;
  version: string;
  description: string;
  author: string;
  screenshot?: string;
  active: boolean;
  installed_at: string;
}

/** 세션 (메모리/쿠키 JWT) */
export interface SessionData {
  userId: number;
  userLogin: string;
  userEmail: string;
  roles: string[];
  capabilities: Record<string, boolean>;
  expires: number;
  githubToken?: string;
  githubOwner?: string;
  githubRepo?: string;
  githubBranch?: string;
}

// ─── CloudPress 플랫폼 사이트 정보 ─────────────────────────────────────
export interface CloudPressSite {
  id: string;
  user_id: string;
  site_name: string;
  primary_domain: string;
  custom_domain?: string;
  status: 'active' | 'suspended' | 'pending';
  plan: string;
  github_owner: string;
  github_repo: string;
  github_branch: string;
  github_pages_url: string;
  storage_used: number;
  created_at: string;
}
