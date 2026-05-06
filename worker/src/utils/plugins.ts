/**
 * WordPress Plugin Engine
 * Converts WordPress PHP plugins to run in Cloudflare Workers via a compatibility layer
 */

import { Env } from '../types/env';
import { WPDB } from './db';
import { GitHubStorage } from './github';

export interface PluginHook {
  tag: string;
  callback: string | Function;
  priority: number;
  acceptedArgs: number;
}

export interface PluginFilter extends PluginHook {
  type: 'filter';
}

export interface PluginAction extends PluginHook {
  type: 'action';
}

export interface PluginMenu {
  pageTitle: string;
  menuTitle: string;
  capability: string;
  menuSlug: string;
  callback: Function;
  iconUrl?: string;
  position?: number;
  parent?: string;
}

export interface MetaBox {
  id: string;
  title: string;
  callback: Function;
  screen: string | string[];
  context: string;
  priority: string;
}

export interface AjaxHandler {
  action: string;
  callback: Function;
  requireAuth: boolean;
}

export interface PluginRuntime {
  slug: string;
  name: string;
  version: string;
  hooks: { actions: Record<string, PluginAction[]>; filters: Record<string, PluginFilter[]> };
  menus: PluginMenu[];
  submenus: PluginMenu[];
  metaBoxes: MetaBox[];
  ajaxHandlers: AjaxHandler[];
  adminScripts: Array<{ handle: string; src: string; deps: string[]; ver: string; }>;
  adminStyles: Array<{ handle: string; src: string; deps: string[]; ver: string; }>;
  frontScripts: Array<{ handle: string; src: string; deps: string[]; ver: string; }>;
  frontStyles: Array<{ handle: string; src: string; deps: string[]; ver: string; }>;
  settings: Record<string, unknown>;
  data: Record<string, unknown>;
}

/**
 * Plugin registry - manages all active plugins
 */
export class PluginRegistry {
  private plugins: Map<string, PluginRuntime> = new Map();
  private actions: Record<string, PluginAction[]> = {};
  private filters: Record<string, PluginFilter[]> = {};

  registerPlugin(runtime: PluginRuntime): void {
    this.plugins.set(runtime.slug, runtime);

    // Merge hooks
    for (const [tag, actions] of Object.entries(runtime.hooks.actions)) {
      if (!this.actions[tag]) this.actions[tag] = [];
      this.actions[tag].push(...actions);
      this.actions[tag].sort((a, b) => a.priority - b.priority);
    }
    for (const [tag, filters] of Object.entries(runtime.hooks.filters)) {
      if (!this.filters[tag]) this.filters[tag] = [];
      this.filters[tag].push(...filters);
      this.filters[tag].sort((a, b) => a.priority - b.priority);
    }
  }

  async doAction(tag: string, ...args: unknown[]): Promise<void> {
    const handlers = this.actions[tag] || [];
    for (const handler of handlers) {
      if (typeof handler.callback === 'function') {
        await handler.callback(...args.slice(0, handler.acceptedArgs));
      }
    }
  }

  async applyFilters(tag: string, value: unknown, ...args: unknown[]): Promise<unknown> {
    const handlers = this.filters[tag] || [];
    let result = value;
    for (const handler of handlers) {
      if (typeof handler.callback === 'function') {
        result = await handler.callback(result, ...args.slice(0, handler.acceptedArgs - 1));
      }
    }
    return result;
  }

  getMenus(): PluginMenu[] {
    return Array.from(this.plugins.values()).flatMap(p => p.menus);
  }

  getSubmenus(): PluginMenu[] {
    return Array.from(this.plugins.values()).flatMap(p => p.submenus);
  }

  getMetaBoxes(screen: string): MetaBox[] {
    return Array.from(this.plugins.values())
      .flatMap(p => p.metaBoxes)
      .filter(m => {
        if (Array.isArray(m.screen)) return m.screen.includes(screen);
        return m.screen === screen || m.screen === 'post';
      });
  }

  getAjaxHandler(action: string): AjaxHandler | undefined {
    for (const plugin of this.plugins.values()) {
      const handler = plugin.ajaxHandlers.find(h => h.action === action);
      if (handler) return handler;
    }
    return undefined;
  }

  getAllAdminScripts(): Array<{ handle: string; src: string; deps: string[]; ver: string }> {
    return Array.from(this.plugins.values()).flatMap(p => p.adminScripts);
  }

  getAllAdminStyles(): Array<{ handle: string; src: string; deps: string[]; ver: string }> {
    return Array.from(this.plugins.values()).flatMap(p => p.adminStyles);
  }

  getPlugin(slug: string): PluginRuntime | undefined {
    return this.plugins.get(slug);
  }

  getAll(): PluginRuntime[] {
    return Array.from(this.plugins.values());
  }
}

/**
 * WordPress API compatibility shim
 * Translates WordPress PHP API calls to our JS runtime
 */
export function createWPCompat(db: WPDB, env: Env, registry: PluginRegistry) {
  return {
    // Hooks
    add_action: (tag: string, cb: Function, priority = 10, acceptedArgs = 1) => {
      // Registered dynamically
    },
    add_filter: (tag: string, cb: Function, priority = 10, acceptedArgs = 1) => {},
    do_action: (tag: string, ...args: unknown[]) => registry.doAction(tag, ...args),
    apply_filters: (tag: string, value: unknown, ...args: unknown[]) => registry.applyFilters(tag, value, ...args),

    // Options
    get_option: (name: string, def = '') => db.getOption(name, def),
    update_option: (name: string, value: string) => db.updateOption(name, value),
    delete_option: (name: string) => db.deleteOption(name),
    add_option: (name: string, value: string) => db.updateOption(name, value),

    // Posts
    get_post: (id: number) => db.getPost(id),
    get_posts: (args: Record<string, unknown>) => db.getPosts(args as any),
    wp_insert_post: (data: Record<string, unknown>) => db.insertPost(data as any),
    wp_update_post: (data: Record<string, unknown>) => {
      const id = data.ID as number;
      return db.updatePost(id, data as any).then(() => id);
    },
    wp_delete_post: (id: number, force = false) => db.deletePost(id, force),

    // Post meta
    get_post_meta: (id: number, key: string, single = true) => db.getPostMeta(id, key, single),
    update_post_meta: (id: number, key: string, value: string) => db.updatePostMeta(id, key, value),
    delete_post_meta: (id: number, key: string) => db.deletePostMeta(id, key),
    add_post_meta: (id: number, key: string, value: string) => db.updatePostMeta(id, key, value),

    // Users
    get_user_by: async (field: string, value: string | number) => {
      if (field === 'login') return db.getUserByLogin(String(value));
      if (field === 'email') return db.getUserByEmail(String(value));
      if (field === 'id' || field === 'ID') return db.getUser(Number(value));
      return null;
    },
    get_current_user_id: () => 0, // Set per-request

    // Terms
    get_terms: (args: { taxonomy: string }) => db.getTerms(args.taxonomy),
    wp_set_post_terms: (postId: number, terms: number[], taxonomy: string) => db.setPostTerms(postId, terms, taxonomy),

    // Misc
    home_url: async (path = '') => {
      const url = await db.getOption('siteurl');
      return url + path;
    },
    site_url: async (path = '') => {
      const url = await db.getOption('siteurl');
      return url + path;
    },
    plugins_url: (path: string, plugin: string) => `/wp-content/plugins/${path}`,
    content_url: (path = '') => `/wp-content/${path}`,
    includes_url: (path = '') => `/wp-includes/${path}`,
    admin_url: (path = '') => `/wp-admin/${path}`,

    // Sanitization
    sanitize_text_field: (str: string) => str.replace(/<[^>]*>/g, '').trim(),
    sanitize_email: (email: string) => email.toLowerCase().trim(),
    sanitize_key: (key: string) => key.toLowerCase().replace(/[^a-z0-9_-]/g, ''),
    esc_html: (str: string) => str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    esc_attr: (str: string) => str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    esc_url: (url: string) => encodeURI(url),
    wp_kses_post: (html: string) => html, // Allow all for now
    absint: (n: unknown) => Math.abs(parseInt(String(n), 10)),
    intval: (n: unknown) => parseInt(String(n), 10),

    // Nonces
    wp_create_nonce: (action: string) => crypto.randomUUID().substring(0, 10),
    wp_verify_nonce: (nonce: string, action: string) => true,
    check_admin_referer: (action: string) => true,
    check_ajax_referer: (action: string) => true,

    // Notices
    add_action_notice: (type: string, message: string) => {},

    // HTTP API
    wp_remote_get: async (url: string, args: Record<string, unknown> = {}) => {
      const res = await fetch(url, { headers: args.headers as HeadersInit });
      const body = await res.text();
      return { response: { code: res.status }, body };
    },
    wp_remote_post: async (url: string, args: Record<string, unknown> = {}) => {
      const res = await fetch(url, {
        method: 'POST',
        headers: args.headers as HeadersInit,
        body: args.body as string
      });
      const body = await res.text();
      return { response: { code: res.status }, body };
    },
    wp_remote_retrieve_body: (response: { body: string }) => response.body,
    wp_remote_retrieve_response_code: (response: { response: { code: number } }) => response.response.code,

    // Date/time
    current_time: (type: string) => {
      const now = new Date();
      if (type === 'timestamp') return Math.floor(now.getTime() / 1000);
      return now.toISOString().replace('T', ' ').split('.')[0];
    },
    wp_date: (format: string, timestamp: number) => new Date(timestamp * 1000).toISOString(),

    // Misc helpers
    is_wp_error: (obj: unknown) => obj instanceof Error,
    wp_die: (message: string) => { throw new Error(message); },
    __: (text: string, domain?: string) => text,
    _e: (text: string, domain?: string) => text,
    _n: (single: string, plural: string, n: number) => n === 1 ? single : plural,
    sprintf: (format: string, ...args: unknown[]) => {
      let i = 0;
      return format.replace(/%s/g, () => String(args[i++])).replace(/%d/g, () => String(args[i++]));
    },
  };
}

/**
 * Load built-in plugins and convert to runtime format
 */
export async function loadBuiltinPlugin(
  slug: string,
  db: WPDB,
  env: Env,
  github: GitHubStorage | null
): Promise<PluginRuntime | null> {
  switch (slug) {
    case 'aibp-pro': return createAIBPRuntime(db, env);
    case 'alpack': return createAlpackRuntime(db, env);
    case 'bridge-migration': return createBridgeMigrationRuntime(db, env);
    case 'wp-rocket': return createWPRocketRuntime(db, env);
    default: return null;
  }
}

// ─── AIBP Pro runtime ─────────────────────────────────────────────
function createAIBPRuntime(db: WPDB, env: Env): PluginRuntime {
  return {
    slug: 'aibp-pro',
    name: 'AIBP Pro: AI Blog Posting',
    version: '1.2.2',
    hooks: { actions: {}, filters: {} },
    menus: [{
      pageTitle: 'AIBP Pro 설정',
      menuTitle: 'AIBP Pro',
      capability: 'manage_options',
      menuSlug: 'aibp-pro-settings',
      callback: async (req: Request) => renderAIBPSettingsPage(db, env),
      iconUrl: 'dashicons-edit-large',
      position: 80
    }],
    submenus: [],
    metaBoxes: [{
      id: 'ai-blog-writer-box',
      title: 'AI 블로그 작성기 Pro',
      callback: (post: Record<string, unknown>) => renderAIBPMetabox(post),
      screen: 'post',
      context: 'side',
      priority: 'high'
    }],
    ajaxHandlers: [
      { action: 'ai_blog_generate', callback: handleAIBPGenerate(db, env), requireAuth: true },
      { action: 'ai_blog_generate_thumbnail', callback: handleAIBPThumbnail(db, env), requireAuth: true },
      { action: 'aibp_pollinations_generate', callback: handleAIBPPollinations(env), requireAuth: true },
      { action: 'ai_blog_save_seo_meta', callback: handleAIBPSaveMeta(db), requireAuth: true },
      { action: 'ai_blog_generate_schema', callback: handleAIBPSchema(env), requireAuth: true },
      { action: 'ai_blog_expand_content', callback: handleAIBPExpand(env), requireAuth: true },
    ],
    adminScripts: [{
      handle: 'aibp-pro-script',
      src: '/wp-content/plugins/aibp-pro/assets/script-pro.js',
      deps: ['jquery', 'wp-blocks'],
      ver: '1.2.2'
    }],
    adminStyles: [{
      handle: 'aibp-pro-style',
      src: '/wp-content/plugins/aibp-pro/assets/style-pro.css',
      deps: [],
      ver: '1.2.2'
    }],
    frontScripts: [],
    frontStyles: [],
    settings: {},
    data: {}
  };
}

function handleAIBPGenerate(db: WPDB, env: Env) {
  return async (req: Request, formData: FormData) => {
    const topic = String(formData.get('topic') || '');
    const type = String(formData.get('type') || 'informational');
    const model = String(formData.get('model') || 'gpt-4o-mini');
    const apiKey = await db.getOption('aibp_api_key');
    const endpoint = await db.getOption('aibp_api_endpoint') || 'https://api.openai.com/v1/chat/completions';

    if (!apiKey) return { success: false, data: 'API 키가 설정되지 않았습니다.' };

    const systemPrompt = `당신은 SEO 최적화된 한국어 블로그 글을 작성하는 전문가입니다. H2/H3 구조, strong/u 태그를 균형있게 사용하며, 애드센스 정책을 준수하는 고품질 콘텐츠를 작성합니다.`;
    const userPrompt = `주제: ${topic}\n유형: ${type}\n\n워드프레스 구텐베르크 블록 포맷(<!-- wp:heading -->, <!-- wp:paragraph --> 등)으로 완전한 블로그 포스트를 작성해주세요. 최소 1500자 이상.`;

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
          max_tokens: 4000,
          temperature: 0.7
        })
      });
      const data = await res.json() as { choices: Array<{ message: { content: string } }> };
      const content = data.choices?.[0]?.message?.content || '';
      return { success: true, data: { content, title: topic } };
    } catch (e) {
      return { success: false, data: String(e) };
    }
  };
}

function handleAIBPThumbnail(db: WPDB, env: Env) {
  return async (req: Request, formData: FormData) => {
    const prompt = String(formData.get('prompt') || '');
    const workerUrl = 'https://aibp100.jiji15899.workers.dev';
    try {
      const res = await fetch(`${workerUrl}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt })
      });
      const data = await res.json();
      return { success: true, data };
    } catch (e) {
      return { success: false, data: String(e) };
    }
  };
}

function handleAIBPPollinations(env: Env) {
  return async (req: Request, formData: FormData) => {
    const prompt = String(formData.get('prompt') || '');
    const workerUrl = 'https://aibp100.jiji15899.workers.dev';
    try {
      const res = await fetch(`${workerUrl}?prompt=${encodeURIComponent(prompt)}`);
      const blob = await res.arrayBuffer();
      const b64 = btoa(String.fromCharCode(...new Uint8Array(blob)));
      return { success: true, data: { image: `data:image/png;base64,${b64}` } };
    } catch (e) {
      return { success: false, data: String(e) };
    }
  };
}

function handleAIBPSaveMeta(db: WPDB) {
  return async (req: Request, formData: FormData) => {
    const postId = parseInt(String(formData.get('post_id') || '0'));
    const fields: Record<string, string> = {
      '_ai_seo_title': String(formData.get('seo_title') || ''),
      '_ai_meta_desc': String(formData.get('meta_desc') || ''),
      '_ai_slug': String(formData.get('slug') || ''),
      '_ai_focus_keyword': String(formData.get('focus_keyword') || ''),
    };
    for (const [key, value] of Object.entries(fields)) {
      await db.updatePostMeta(postId, key, value);
    }
    return { success: true, data: 'SEO 메타 저장됨' };
  };
}

function handleAIBPSchema(env: Env) {
  return async (req: Request, formData: FormData) => {
    const content = String(formData.get('content') || '');
    return { success: true, data: { schema: '{}' } };
  };
}

function handleAIBPExpand(env: Env) {
  return async (req: Request, formData: FormData) => {
    return { success: true, data: { content: '' } };
  };
}

function renderAIBPSettingsPage(db: WPDB, env: Env): string {
  return `<div class="wrap"><h1>AIBP Pro 설정</h1><form method="post" action="/wp-admin/admin-ajax.php"><input type="hidden" name="action" value="aibp_save_settings"/><table class="form-table"><tr><th>API 키</th><td><input type="password" name="aibp_api_key" class="regular-text"/></td></tr><tr><th>API 엔드포인트</th><td><input type="text" name="aibp_api_endpoint" class="regular-text" value="https://api.openai.com/v1/chat/completions"/></td></tr></table><p class="submit"><input type="submit" class="button-primary" value="저장"/></p></form></div>`;
}

function renderAIBPMetabox(post: Record<string, unknown>): string {
  return `<div id="ai-blog-writer-container" data-post-id="${post.ID}">
    <div class="ai-blog-tabs">
      <button type="button" class="ai-blog-tab active" data-tab="content">AI 글쓰기</button>
      <button type="button" class="ai-blog-tab" data-tab="seo">SEO</button>
      <button type="button" class="ai-blog-tab" data-tab="thumbnail">AI 썸네일</button>
    </div>
    <div class="ai-blog-tab-content active" data-content="content">
      <div class="ai-blog-input-group">
        <label>주제 키워드</label>
        <input type="text" id="ai-blog-topic" class="widefat" placeholder="예: 민생회복지원금"/>
      </div>
      <div class="ai-blog-input-group">
        <label>글 유형</label>
        <select id="ai-blog-type" class="widefat">
          <option value="informational">정보성</option>
          <option value="review">리뷰</option>
          <option value="tutorial">튜토리얼</option>
          <option value="news">뉴스</option>
        </select>
      </div>
      <div class="ai-blog-input-group">
        <label>AI 모델</label>
        <select id="ai-blog-model" class="widefat">
          <option value="gpt-4o-mini">GPT-4o Mini</option>
          <option value="gpt-4o">GPT-4o</option>
          <option value="claude-3-5-sonnet-20241022">Claude 3.5 Sonnet</option>
        </select>
      </div>
      <button type="button" id="ai-blog-generate-btn" class="button button-primary widefat">AI 글쓰기 시작</button>
    </div>
    <div class="ai-blog-tab-content" data-content="seo">
      <div class="ai-blog-input-group">
        <label>SEO 제목</label>
        <input type="text" id="ai-seo-title" class="widefat" name="_ai_seo_title"/>
      </div>
      <div class="ai-blog-input-group">
        <label>메타 설명</label>
        <textarea id="ai-meta-desc" class="widefat" rows="3" name="_ai_meta_desc"></textarea>
      </div>
      <div class="ai-blog-input-group">
        <label>포커스 키워드</label>
        <input type="text" id="ai-focus-keyword" class="widefat" name="_ai_focus_keyword"/>
      </div>
      <button type="button" id="ai-save-seo-btn" class="button widefat">SEO 저장</button>
    </div>
    <div class="ai-blog-tab-content" data-content="thumbnail">
      <div class="ai-blog-input-group">
        <label>이미지 프롬프트</label>
        <textarea id="ai-thumb-prompt" class="widefat" rows="3" placeholder="썸네일 이미지 설명..."></textarea>
      </div>
      <button type="button" id="ai-generate-thumb-btn" class="button button-primary widefat">AI 이미지 생성</button>
      <div id="ai-thumb-preview"></div>
    </div>
  </div>`;
}

// ─── Alpack runtime ───────────────────────────────────────────────
function createAlpackRuntime(db: WPDB, env: Env): PluginRuntime {
  return {
    slug: 'alpack',
    name: 'AL Pack',
    version: '1.3.1',
    hooks: { actions: {}, filters: {} },
    menus: [{
      pageTitle: 'AL Pack',
      menuTitle: 'AL Pack',
      capability: 'manage_options',
      menuSlug: 'alpack-settings',
      callback: async () => renderAlpackPage(db),
      iconUrl: 'dashicons-chart-bar',
      position: 81
    }],
    submenus: [
      { pageTitle: '설정', menuTitle: '설정', capability: 'manage_options', menuSlug: 'alpack-settings', callback: async () => renderAlpackPage(db), parent: 'alpack-settings' },
      { pageTitle: '통계', menuTitle: '통계', capability: 'manage_options', menuSlug: 'alpack-analytics', callback: async () => renderAlpackAnalytics(db), parent: 'alpack-settings' },
      { pageTitle: '소셜 공유', menuTitle: '소셜 공유', capability: 'manage_options', menuSlug: 'alpack-social', callback: async () => `<div class="wrap"><h1>소셜 공유 설정</h1></div>`, parent: 'alpack-settings' },
    ],
    metaBoxes: [],
    ajaxHandlers: [
      { action: 'presslearn_track_pageview', callback: handleAlpackPageview(db), requireAuth: false },
      { action: 'presslearn_get_analytics', callback: handleAlpackGetAnalytics(db), requireAuth: true },
      { action: 'presslearn_save_settings', callback: handleAlpackSaveSettings(db), requireAuth: true },
    ],
    adminScripts: [{ handle: 'alpack-admin', src: '/wp-content/plugins/alpack/assets/js/admin.js', deps: ['jquery', 'chart-js'], ver: '1.3.1' }],
    adminStyles: [{ handle: 'alpack-admin-css', src: '/wp-content/plugins/alpack/assets/css/admin.css', deps: [], ver: '1.3.1' }],
    frontScripts: [{ handle: 'alpack-tracking', src: '/wp-content/plugins/alpack/assets/js/analytics-tracking.js', deps: [], ver: '1.3.1' }],
    frontStyles: [],
    settings: {},
    data: {}
  };
}

function handleAlpackPageview(db: WPDB) {
  return async (req: Request, formData: FormData) => {
    const postId = parseInt(String(formData.get('post_id') || '0'));
    const now = new Date().toISOString().replace('T', ' ').split('.')[0];
    try {
      await db['db'].prepare(
        'INSERT INTO wp_presslearn_logs (time, event, details) VALUES (?, ?, ?)'
      ).bind(now, 'pageview', JSON.stringify({ post_id: postId })).run();
    } catch {}
    return { success: true };
  };
}

function handleAlpackGetAnalytics(db: WPDB) {
  return async (req: Request, formData: FormData) => {
    return { success: true, data: { views: [], posts: [] } };
  };
}

function handleAlpackSaveSettings(db: WPDB) {
  return async (req: Request, formData: FormData) => {
    const settings = ['analytics_enabled', 'social_share_enabled', 'scroll_depth_enabled', 'click_protection_enabled'];
    for (const key of settings) {
      const val = formData.get(`presslearn_${key}`) ? 'yes' : 'no';
      await db.updateOption(`presslearn_${key}`, val);
    }
    return { success: true, data: '설정 저장됨' };
  };
}

function renderAlpackPage(db: WPDB): string {
  return `<div class="wrap alpack-admin"><h1>AL Pack 설정</h1>
    <nav class="nav-tab-wrapper">
      <a class="nav-tab nav-tab-active" href="?page=alpack-settings">기본 설정</a>
      <a class="nav-tab" href="?page=alpack-analytics">통계</a>
      <a class="nav-tab" href="?page=alpack-social">소셜 공유</a>
    </nav>
    <form method="post" action="/wp-admin/admin-ajax.php">
    <input type="hidden" name="action" value="presslearn_save_settings"/>
    <table class="form-table">
      <tr><th>통계 수집</th><td><input type="checkbox" name="presslearn_analytics_enabled" value="1"/></td></tr>
      <tr><th>소셜 공유 버튼</th><td><input type="checkbox" name="presslearn_social_share_enabled" value="1"/></td></tr>
      <tr><th>스크롤 깊이 추적</th><td><input type="checkbox" name="presslearn_scroll_depth_enabled" value="1"/></td></tr>
      <tr><th>무효 클릭 차단</th><td><input type="checkbox" name="presslearn_click_protection_enabled" value="1"/></td></tr>
    </table>
    <p class="submit"><input type="submit" class="button-primary" value="저장"/></p>
    </form></div>`;
}

function renderAlpackAnalytics(db: WPDB): string {
  return `<div class="wrap"><h1>AL Pack 통계</h1><div id="alpack-analytics-chart"></div></div>`;
}

// ─── Bridge Migration runtime ─────────────────────────────────────
function createBridgeMigrationRuntime(db: WPDB, env: Env): PluginRuntime {
  return {
    slug: 'bridge-migration',
    name: 'Bridge Migration',
    version: '1.1.0',
    hooks: { actions: {}, filters: {} },
    menus: [{
      pageTitle: 'Bridge Migration',
      menuTitle: 'Bridge Migration',
      capability: 'manage_options',
      menuSlug: 'bridge-migration',
      callback: async () => renderBridgePage(),
      iconUrl: 'dashicons-migrate',
      position: 82
    }],
    submenus: [],
    metaBoxes: [],
    ajaxHandlers: [
      { action: 'bridge_migration_export', callback: handleBridgeExport(db, env), requireAuth: true },
      { action: 'bridge_migration_import', callback: handleBridgeImport(db, env), requireAuth: true },
      { action: 'bridge_migration_create_backup', callback: handleBridgeBackup(db, env), requireAuth: true },
      { action: 'bridge_migration_get_backup_list', callback: handleBridgeBackupList(db, env), requireAuth: true },
      { action: 'bridge_migration_restore_backup', callback: handleBridgeRestore(db, env), requireAuth: true },
    ],
    adminScripts: [],
    adminStyles: [],
    frontScripts: [],
    frontStyles: [],
    settings: {},
    data: {}
  };
}

function handleBridgeExport(db: WPDB, env: Env) {
  return async (req: Request, formData: FormData) => {
    const components = formData.getAll('components');
    const exportData: Record<string, unknown> = { version: '1.1.0', timestamp: Date.now() };

    if (components.includes('posts')) {
      const posts = await db.getPosts({ posts_per_page: 1000, post_status: 'any' as any });
      exportData.posts = posts;
    }
    if (components.includes('options')) {
      const opts = await db['db'].prepare('SELECT option_name, option_value FROM wp_options LIMIT 500').all();
      exportData.options = opts.results;
    }
    if (components.includes('users')) {
      const users = await db['db'].prepare('SELECT * FROM wp_users').all();
      exportData.users = users.results;
    }

    return { success: true, data: { export: JSON.stringify(exportData), filename: `bridge-export-${Date.now()}.json` } };
  };
}

function handleBridgeImport(db: WPDB, env: Env) {
  return async (req: Request, formData: FormData) => {
    const file = formData.get('import_file');
    if (!file) return { success: false, data: '파일이 없습니다.' };
    try {
      const content = typeof file === 'string' ? file : await (file as File).text();
      const data = JSON.parse(content);
      let imported = 0;

      if (data.posts) {
        for (const post of data.posts) {
          await db.insertPost(post);
          imported++;
        }
      }
      if (data.options) {
        for (const opt of data.options) {
          await db.updateOption(opt.option_name, opt.option_value);
        }
      }
      return { success: true, data: { imported } };
    } catch (e) {
      return { success: false, data: String(e) };
    }
  };
}

function handleBridgeBackup(db: WPDB, env: Env) {
  return async (req: Request, formData: FormData) => {
    const timestamp = Date.now();
    const name = `backup-${new Date().toISOString().split('T')[0]}-${timestamp}`;
    const posts = await db.getPosts({ posts_per_page: 5000, post_status: 'any' as any });
    const backup = { name, timestamp, posts, version: '1.1.0' };
    await env.OPTIONS.put(`backup:${timestamp}`, JSON.stringify(backup), { expirationTtl: 30 * 24 * 3600 });
    return { success: true, data: { backup_id: timestamp, name } };
  };
}

function handleBridgeBackupList(db: WPDB, env: Env) {
  return async () => {
    const list = await env.OPTIONS.list({ prefix: 'backup:' });
    return { success: true, data: { backups: list.keys.map(k => ({ id: k.name.replace('backup:', ''), name: k.name })) } };
  };
}

function handleBridgeRestore(db: WPDB, env: Env) {
  return async (req: Request, formData: FormData) => {
    const id = String(formData.get('backup_id') || '');
    const raw = await env.OPTIONS.get(`backup:${id}`);
    if (!raw) return { success: false, data: '백업을 찾을 수 없습니다.' };
    const backup = JSON.parse(raw);
    let restored = 0;
    for (const post of backup.posts || []) {
      await db.updatePost(post.ID, post);
      restored++;
    }
    return { success: true, data: { restored } };
  };
}

function renderBridgePage(): string {
  return `<div class="wrap bridge-migration-wrap">
    <h1>Bridge Migration</h1>
    <div class="bridge-tabs">
      <button class="bridge-tab active" data-tab="export">내보내기</button>
      <button class="bridge-tab" data-tab="import">가져오기</button>
      <button class="bridge-tab" data-tab="backup">백업/복원</button>
    </div>
    <div class="bridge-tab-content active" id="bridge-export">
      <h2>사이트 내보내기</h2>
      <p>내보낼 항목을 선택하세요:</p>
      <label><input type="checkbox" name="components" value="posts" checked/> 게시글/페이지</label><br/>
      <label><input type="checkbox" name="components" value="options" checked/> 사이트 설정</label><br/>
      <label><input type="checkbox" name="components" value="users"/> 사용자</label><br/>
      <label><input type="checkbox" name="components" value="media"/> 미디어</label><br/>
      <br/>
      <button class="button button-primary" id="bridge-export-btn">내보내기 시작</button>
      <div id="bridge-export-progress"></div>
    </div>
    <div class="bridge-tab-content" id="bridge-import" style="display:none">
      <h2>사이트 가져오기</h2>
      <input type="file" id="bridge-import-file" accept=".json,.zip"/>
      <br/><br/>
      <button class="button button-primary" id="bridge-import-btn">가져오기 시작</button>
      <div id="bridge-import-progress"></div>
    </div>
    <div class="bridge-tab-content" id="bridge-backup" style="display:none">
      <h2>백업 관리</h2>
      <button class="button button-primary" id="bridge-create-backup-btn">새 백업 생성</button>
      <div id="bridge-backup-list"></div>
    </div>
  </div>`;
}

// ─── WP Rocket runtime ────────────────────────────────────────────
function createWPRocketRuntime(db: WPDB, env: Env): PluginRuntime {
  return {
    slug: 'wp-rocket',
    name: 'WP Rocket',
    version: '3.17.0',
    hooks: {
      actions: {},
      filters: {
        'the_content': [{
          tag: 'the_content',
          callback: async (content: string) => {
            // Add lazy loading to images
            return content.replace(/<img\s/g, '<img loading="lazy" ');
          },
          priority: 10,
          acceptedArgs: 1,
          type: 'filter'
        }]
      }
    },
    menus: [{
      pageTitle: 'WP Rocket',
      menuTitle: 'WP Rocket',
      capability: 'manage_options',
      menuSlug: 'wprocket',
      callback: async () => renderWPRocketPage(db),
      iconUrl: '/wp-content/plugins/wp-rocket/assets/img/icon-128x128.png',
      position: 83
    }],
    submenus: [],
    metaBoxes: [],
    ajaxHandlers: [
      { action: 'rocket_clear_cache', callback: handleRocketClearCache(env), requireAuth: true },
      { action: 'rocket_save_settings', callback: handleRocketSaveSettings(db), requireAuth: true },
    ],
    adminScripts: [],
    adminStyles: [{ handle: 'wpr-admin', src: '/wp-content/plugins/wp-rocket/assets/css/wpr-admin.min.css', deps: [], ver: '3.17.0' }],
    frontScripts: [],
    frontStyles: [],
    settings: {},
    data: {}
  };
}

function handleRocketClearCache(env: Env) {
  return async () => {
    const list = await env.CACHE.list({ prefix: 'page:' });
    await Promise.all(list.keys.map(k => env.CACHE.delete(k.name)));
    return { success: true, data: `${list.keys.length}개 캐시 삭제됨` };
  };
}

function handleRocketSaveSettings(db: WPDB) {
  return async (req: Request, formData: FormData) => {
    const settings = ['cache_enabled', 'minify_js', 'minify_css', 'lazy_load', 'defer_js'];
    for (const key of settings) {
      await db.updateOption(`wprocket_${key}`, formData.get(key) ? '1' : '0');
    }
    return { success: true, data: '설정 저장됨' };
  };
}

function renderWPRocketPage(db: WPDB): string {
  return `<div class="wrap wpr-admin">
    <div class="wpr-header">
      <img src="/wp-content/plugins/wp-rocket/assets/img/logo-cloudflare.svg" alt="WP Rocket" style="height:40px"/>
      <h1>WP Rocket 설정</h1>
    </div>
    <div class="wpr-tabs">
      <a class="wpr-tab active" href="#cache">캐시</a>
      <a class="wpr-tab" href="#optimization">최적화</a>
      <a class="wpr-tab" href="#media">미디어</a>
      <a class="wpr-tab" href="#cdn">CDN</a>
    </div>
    <form id="wpr-settings-form">
    <div class="wpr-section" id="cache">
      <h2>캐시 설정</h2>
      <table class="form-table">
        <tr><th>페이지 캐시 활성화</th><td><input type="checkbox" name="cache_enabled" checked/></td></tr>
        <tr><th>캐시 수명 (시간)</th><td><input type="number" name="cache_lifespan" value="10" class="small-text"/></td></tr>
      </table>
    </div>
    <div class="wpr-section" id="optimization" style="display:none">
      <h2>파일 최적화</h2>
      <table class="form-table">
        <tr><th>CSS 압축</th><td><input type="checkbox" name="minify_css" checked/></td></tr>
        <tr><th>JS 압축</th><td><input type="checkbox" name="minify_js" checked/></td></tr>
        <tr><th>JS 지연 로딩</th><td><input type="checkbox" name="defer_js" checked/></td></tr>
      </table>
    </div>
    <div class="wpr-section" id="media" style="display:none">
      <h2>미디어</h2>
      <table class="form-table">
        <tr><th>이미지 지연 로딩</th><td><input type="checkbox" name="lazy_load" checked/></td></tr>
      </table>
    </div>
    <p class="submit">
      <button type="button" class="button button-primary" id="wpr-save-btn">설정 저장</button>
      <button type="button" class="button" id="wpr-clear-cache-btn">캐시 비우기</button>
    </p>
    </form>
  </div>`;
}
