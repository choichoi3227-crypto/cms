/**
 * CloudPress CMS — GitHub Storage DB
 * D1 Database 완전 제거, GitHub 레포 = DB + 스토리지
 *
 * 데이터 구조 (_db/ 폴더):
 *   _db/settings.json      사이트 설정
 *   _db/posts/index.json   포스트 인덱스 (ID, title, slug, status, dates...)
 *   _db/posts/{id}.json    개별 포스트 전문
 *   _db/users.json         사용자 목록
 *   _db/categories.json    카테고리
 *   _db/tags.json          태그
 *   _db/comments.json      댓글
 *   _db/media.json         미디어 파일 목록
 *   _db/plugins.json       플러그인 설치 정보
 *   _db/themes.json        테마 설치 정보
 */

import { GitHubStorage } from './github';
import {
  SiteSettings, Post, User, Term, Comment, MediaFile, Plugin, Theme
} from '../types/env';

// 기본 설정값
const DEFAULT_SETTINGS: SiteSettings = {
  site_name: 'CloudPress Site',
  site_description: 'Just another CloudPress site',
  site_url: '',
  admin_email: '',
  posts_per_page: 10,
  active_theme: 'default',
  show_on_front: 'posts',
  language: 'ko',
  timezone: 'Asia/Seoul',
  date_format: 'YYYY-MM-DD',
  comment_status: 'open',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

export class GithubDB {
  private cache: Map<string, { data: unknown; ts: number }> = new Map();
  private readonly CACHE_TTL = 30_000; // 30s in-memory cache

  constructor(private gh: GitHubStorage) {}

  // ─── Low-level JSON helpers ───────────────────────────────────────────

  private async readJSON<T>(path: string, fallback: T): Promise<T> {
    const cached = this.cache.get(path);
    if (cached && Date.now() - cached.ts < this.CACHE_TTL) return cached.data as T;

    const raw = await this.gh.readFile(path);
    if (!raw) return fallback;
    try {
      const data = JSON.parse(raw) as T;
      this.cache.set(path, { data, ts: Date.now() });
      return data;
    } catch {
      return fallback;
    }
  }

  private async writeJSON<T>(path: string, data: T, message?: string): Promise<boolean> {
    const ok = await this.gh.writeFile(path, JSON.stringify(data, null, 2), message);
    if (ok) this.cache.set(path, { data, ts: Date.now() });
    return ok;
  }

  private invalidate(path: string) {
    this.cache.delete(path);
  }

  // ─── Settings ─────────────────────────────────────────────────────────

  async getSettings(): Promise<SiteSettings> {
    return this.readJSON<SiteSettings>('_db/settings.json', DEFAULT_SETTINGS);
  }

  async updateSettings(patch: Partial<SiteSettings>): Promise<boolean> {
    const current = await this.getSettings();
    const updated = { ...current, ...patch, updated_at: new Date().toISOString() };
    return this.writeJSON('_db/settings.json', updated, 'Update site settings');
  }

  async getOption(name: keyof SiteSettings, fallback = ''): Promise<string> {
    const s = await this.getSettings();
    return String((s as Record<string, unknown>)[name] ?? fallback);
  }

  // ─── Posts ────────────────────────────────────────────────────────────

  private async getPostIndex(): Promise<Post[]> {
    return this.readJSON<Post[]>('_db/posts/index.json', []);
  }

  private async savePostIndex(posts: Post[]): Promise<boolean> {
    return this.writeJSON('_db/posts/index.json', posts, 'Update post index');
  }

  async getPosts(args: {
    post_type?: 'post' | 'page';
    status?: string;
    limit?: number;
    offset?: number;
    search?: string;
    category_id?: number;
    tag_id?: number;
    author_id?: number;
    orderby?: 'date' | 'title' | 'menu_order';
    order?: 'ASC' | 'DESC';
  } = {}): Promise<Post[]> {
    const {
      post_type, status, limit = 20, offset = 0,
      search, category_id, tag_id, author_id,
      orderby = 'date', order = 'DESC'
    } = args;

    let posts = await this.getPostIndex();

    if (post_type) posts = posts.filter(p => p.post_type === post_type);
    if (status && status !== 'any') posts = posts.filter(p => p.status === status);
    else if (!status) posts = posts.filter(p => p.status !== 'trash');
    if (search) {
      const q = search.toLowerCase();
      posts = posts.filter(p => p.title.toLowerCase().includes(q) || p.excerpt.toLowerCase().includes(q));
    }
    if (category_id) posts = posts.filter(p => p.category_ids.includes(category_id));
    if (tag_id) posts = posts.filter(p => p.tag_ids.includes(tag_id));
    if (author_id) posts = posts.filter(p => p.author_id === author_id);

    // Sort
    posts.sort((a, b) => {
      let va: string | number, vb: string | number;
      if (orderby === 'title') { va = a.title; vb = b.title; }
      else if (orderby === 'menu_order') { va = a.menu_order; vb = b.menu_order; }
      else { va = a.created_at; vb = b.created_at; }
      return order === 'DESC' ? (va > vb ? -1 : 1) : (va < vb ? -1 : 1);
    });

    return posts.slice(offset, offset + limit);
  }

  async countPosts(post_type = 'post', status?: string): Promise<number> {
    let posts = await this.getPostIndex();
    if (post_type) posts = posts.filter(p => p.post_type === post_type);
    if (status) posts = posts.filter(p => p.status === status);
    return posts.length;
  }

  async getPost(id: number): Promise<Post | null> {
    const full = await this.readJSON<Post | null>(`_db/posts/${id}.json`, null);
    if (full) return full;
    // fallback: check index
    const index = await this.getPostIndex();
    return index.find(p => p.id === id) || null;
  }

  async getPostBySlug(slug: string): Promise<Post | null> {
    const index = await this.getPostIndex();
    const p = index.find(i => i.slug === slug);
    if (!p) return null;
    return this.getPost(p.id);
  }

  async createPost(data: Omit<Post, 'id' | 'created_at' | 'updated_at'>): Promise<Post> {
    const index = await this.getPostIndex();
    const id = (index.reduce((m, p) => Math.max(m, p.id), 0) + 1);
    const now = new Date().toISOString();
    const post: Post = {
      ...data, id, created_at: now, updated_at: now,
      published_at: data.status === 'publish' ? now : undefined,
    };
    // Write full post
    await this.gh.writeFile(`_db/posts/${id}.json`, JSON.stringify(post, null, 2), `Create post: ${post.title}`);
    // Update index (store metadata only)
    const meta: Post = { ...post, content: '' };
    await this.savePostIndex([...index, meta]);
    return post;
  }

  async updatePost(id: number, data: Partial<Post>): Promise<Post | null> {
    const existing = await this.getPost(id);
    if (!existing) return null;
    const updated: Post = {
      ...existing, ...data, id,
      updated_at: new Date().toISOString(),
      published_at: data.status === 'publish' && !existing.published_at
        ? new Date().toISOString() : existing.published_at,
    };
    await this.gh.writeFile(`_db/posts/${id}.json`, JSON.stringify(updated, null, 2), `Update post: ${updated.title}`);
    // Update index
    const index = await this.getPostIndex();
    const newIndex = index.map(p => p.id === id ? { ...updated, content: '' } : p);
    await this.savePostIndex(newIndex);
    this.invalidate(`_db/posts/${id}.json`);
    return updated;
  }

  async deletePost(id: number): Promise<boolean> {
    const index = await this.getPostIndex();
    const newIndex = index.filter(p => p.id !== id);
    await this.savePostIndex(newIndex);
    await this.gh.deleteFile(`_db/posts/${id}.json`, `Delete post #${id}`);
    this.invalidate(`_db/posts/${id}.json`);
    return true;
  }

  // ─── Users ────────────────────────────────────────────────────────────

  async getUsers(): Promise<User[]> {
    return this.readJSON<User[]>('_db/users.json', []);
  }

  async getUserById(id: number): Promise<User | null> {
    const users = await this.getUsers();
    return users.find(u => u.id === id) || null;
  }

  async getUserByLogin(login: string): Promise<User | null> {
    const users = await this.getUsers();
    return users.find(u => u.username === login) || null;
  }

  async getUserByEmail(email: string): Promise<User | null> {
    const users = await this.getUsers();
    return users.find(u => u.email === email) || null;
  }

  async createUser(data: Omit<User, 'id' | 'registered_at'>): Promise<User> {
    const users = await this.getUsers();
    const id = (users.reduce((m, u) => Math.max(m, u.id), 0) + 1);
    const user: User = { ...data, id, registered_at: new Date().toISOString() };
    await this.writeJSON('_db/users.json', [...users, user], `Create user: ${user.username}`);
    return user;
  }

  async updateUser(id: number, data: Partial<User>): Promise<User | null> {
    const users = await this.getUsers();
    const idx = users.findIndex(u => u.id === id);
    if (idx < 0) return null;
    users[idx] = { ...users[idx], ...data };
    await this.writeJSON('_db/users.json', users, `Update user #${id}`);
    return users[idx];
  }

  async deleteUser(id: number): Promise<boolean> {
    const users = await this.getUsers();
    await this.writeJSON('_db/users.json', users.filter(u => u.id !== id), `Delete user #${id}`);
    return true;
  }

  // ─── Terms (Categories / Tags) ────────────────────────────────────────

  async getTerms(taxonomy: 'category' | 'post_tag'): Promise<Term[]> {
    const path = taxonomy === 'category' ? '_db/categories.json' : '_db/tags.json';
    return this.readJSON<Term[]>(path, []);
  }

  async getTermById(id: number, taxonomy: 'category' | 'post_tag'): Promise<Term | null> {
    const terms = await this.getTerms(taxonomy);
    return terms.find(t => t.id === id) || null;
  }

  async createTerm(data: Omit<Term, 'id' | 'count'>): Promise<Term> {
    const path = data.taxonomy === 'category' ? '_db/categories.json' : '_db/tags.json';
    const terms = await this.readJSON<Term[]>(path, []);
    const id = (terms.reduce((m, t) => Math.max(m, t.id), 0) + 1);
    const term: Term = { ...data, id, count: 0 };
    await this.writeJSON(path, [...terms, term], `Create ${data.taxonomy}: ${data.name}`);
    return term;
  }

  async updateTerm(id: number, taxonomy: 'category' | 'post_tag', data: Partial<Term>): Promise<Term | null> {
    const path = taxonomy === 'category' ? '_db/categories.json' : '_db/tags.json';
    const terms = await this.readJSON<Term[]>(path, []);
    const idx = terms.findIndex(t => t.id === id);
    if (idx < 0) return null;
    terms[idx] = { ...terms[idx], ...data };
    await this.writeJSON(path, terms, `Update term #${id}`);
    return terms[idx];
  }

  async deleteTerm(id: number, taxonomy: 'category' | 'post_tag'): Promise<boolean> {
    const path = taxonomy === 'category' ? '_db/categories.json' : '_db/tags.json';
    const terms = await this.readJSON<Term[]>(path, []);
    await this.writeJSON(path, terms.filter(t => t.id !== id), `Delete term #${id}`);
    return true;
  }

  // ─── Comments ─────────────────────────────────────────────────────────

  async getComments(args: { post_id?: number; status?: string; limit?: number } = {}): Promise<Comment[]> {
    const { post_id, status, limit = 50 } = args;
    let comments = await this.readJSON<Comment[]>('_db/comments.json', []);
    if (post_id) comments = comments.filter(c => c.post_id === post_id);
    if (status) comments = comments.filter(c => c.status === status);
    return comments.slice(0, limit);
  }

  async countComments(status?: string): Promise<number> {
    let comments = await this.readJSON<Comment[]>('_db/comments.json', []);
    if (status) comments = comments.filter(c => c.status === status);
    return comments.length;
  }

  async createComment(data: Omit<Comment, 'id' | 'created_at'>): Promise<Comment> {
    const comments = await this.readJSON<Comment[]>('_db/comments.json', []);
    const id = (comments.reduce((m, c) => Math.max(m, c.id), 0) + 1);
    const comment: Comment = { ...data, id, created_at: new Date().toISOString() };
    await this.writeJSON('_db/comments.json', [...comments, comment], 'New comment');
    return comment;
  }

  async updateComment(id: number, data: Partial<Comment>): Promise<boolean> {
    const comments = await this.readJSON<Comment[]>('_db/comments.json', []);
    const idx = comments.findIndex(c => c.id === id);
    if (idx < 0) return false;
    comments[idx] = { ...comments[idx], ...data };
    return this.writeJSON('_db/comments.json', comments, `Update comment #${id}`);
  }

  async deleteComment(id: number): Promise<boolean> {
    const comments = await this.readJSON<Comment[]>('_db/comments.json', []);
    return this.writeJSON('_db/comments.json', comments.filter(c => c.id !== id), `Delete comment #${id}`);
  }

  // ─── Media ────────────────────────────────────────────────────────────

  async getMedia(limit = 50, offset = 0): Promise<MediaFile[]> {
    const all = await this.readJSON<MediaFile[]>('_db/media.json', []);
    return all.slice(offset, offset + limit);
  }

  async getMediaById(id: number): Promise<MediaFile | null> {
    const all = await this.readJSON<MediaFile[]>('_db/media.json', []);
    return all.find(m => m.id === id) || null;
  }

  async addMedia(data: Omit<MediaFile, 'id' | 'uploaded_at'>): Promise<MediaFile> {
    const all = await this.readJSON<MediaFile[]>('_db/media.json', []);
    const id = (all.reduce((m, f) => Math.max(m, f.id), 0) + 1);
    const file: MediaFile = { ...data, id, uploaded_at: new Date().toISOString() };
    await this.writeJSON('_db/media.json', [file, ...all], `Upload media: ${file.filename}`);
    return file;
  }

  async deleteMedia(id: number): Promise<boolean> {
    const all = await this.readJSON<MediaFile[]>('_db/media.json', []);
    const file = all.find(m => m.id === id);
    if (file) await this.gh.deleteFile(file.path, `Delete media #${id}`).catch(() => {});
    return this.writeJSON('_db/media.json', all.filter(m => m.id !== id), `Delete media #${id}`);
  }

  // ─── Plugins ──────────────────────────────────────────────────────────

  async getPlugins(): Promise<Plugin[]> {
    return this.readJSON<Plugin[]>('_db/plugins.json', []);
  }

  async getPlugin(slug: string): Promise<Plugin | null> {
    const plugins = await this.getPlugins();
    return plugins.find(p => p.slug === slug) || null;
  }

  async savePlugin(plugin: Plugin): Promise<boolean> {
    const plugins = await this.getPlugins();
    const idx = plugins.findIndex(p => p.slug === plugin.slug);
    if (idx >= 0) plugins[idx] = plugin;
    else plugins.push(plugin);
    return this.writeJSON('_db/plugins.json', plugins, `Plugin: ${plugin.slug}`);
  }

  async deletePlugin(slug: string): Promise<boolean> {
    const plugins = await this.getPlugins();
    return this.writeJSON('_db/plugins.json', plugins.filter(p => p.slug !== slug), `Remove plugin: ${slug}`);
  }

  async activatePlugin(slug: string): Promise<boolean> {
    const p = await this.getPlugin(slug);
    if (!p) return false;
    return this.savePlugin({ ...p, status: 'active' });
  }

  async deactivatePlugin(slug: string): Promise<boolean> {
    const p = await this.getPlugin(slug);
    if (!p) return false;
    return this.savePlugin({ ...p, status: 'inactive' });
  }

  // ─── Themes ───────────────────────────────────────────────────────────

  async getThemes(): Promise<Theme[]> {
    return this.readJSON<Theme[]>('_db/themes.json', []);
  }

  async getTheme(slug: string): Promise<Theme | null> {
    const themes = await this.getThemes();
    return themes.find(t => t.slug === slug) || null;
  }

  async getActiveTheme(): Promise<Theme | null> {
    const themes = await this.getThemes();
    return themes.find(t => t.active) || null;
  }

  async activateTheme(slug: string): Promise<boolean> {
    const themes = await this.getThemes();
    if (!themes.find(t => t.slug === slug)) return false;
    const updated = themes.map(t => ({ ...t, active: t.slug === slug }));
    const ok = await this.writeJSON('_db/themes.json', updated, `Activate theme: ${slug}`);
    if (ok) await this.updateSettings({ active_theme: slug });
    return ok;
  }

  async saveTheme(theme: Theme): Promise<boolean> {
    const themes = await this.getThemes();
    const idx = themes.findIndex(t => t.slug === theme.slug);
    if (idx >= 0) themes[idx] = theme;
    else themes.push(theme);
    return this.writeJSON('_db/themes.json', themes, `Theme: ${theme.slug}`);
  }

  async deleteTheme(slug: string): Promise<boolean> {
    const themes = await this.getThemes();
    return this.writeJSON('_db/themes.json', themes.filter(t => t.slug !== slug), `Remove theme: ${slug}`);
  }

  // ─── Database info (for tools page) ──────────────────────────────────

  async getDatabaseInfo(): Promise<{
    posts: number; pages: number; users: number;
    categories: number; tags: number; comments: number; media: number;
    plugins: number; themes: number;
  }> {
    const [index, users, cats, tags, comments, media, plugins, themes] = await Promise.all([
      this.getPostIndex(),
      this.getUsers(),
      this.getTerms('category'),
      this.getTerms('post_tag'),
      this.readJSON<Comment[]>('_db/comments.json', []),
      this.readJSON<MediaFile[]>('_db/media.json', []),
      this.getPlugins(),
      this.getThemes(),
    ]);
    return {
      posts: index.filter(p => p.post_type === 'post').length,
      pages: index.filter(p => p.post_type === 'page').length,
      users: users.length,
      categories: cats.length,
      tags: tags.length,
      comments: comments.length,
      media: media.length,
      plugins: plugins.length,
      themes: themes.length,
    };
  }
}

/** GithubDB 팩토리 */
export function createDB(gh: GitHubStorage): GithubDB {
  return new GithubDB(gh);
}
