import { Env, WPPost, WPUser, WPTerm, WPOption, WPComment } from '../types/env';

export class WPDB {
  constructor(private db: D1Database, private options: KVNamespace) {}

  // ─── Options ──────────────────────────────────────────────────────
  async getOption(name: string, defaultValue = ''): Promise<string> {
    // Check KV cache first
    const cached = await this.options.get(`opt:${name}`);
    if (cached !== null) return cached;
    
    const row = await this.db.prepare(
      'SELECT option_value FROM wp_options WHERE option_name = ?'
    ).bind(name).first<{ option_value: string }>();
    
    const value = row?.option_value ?? defaultValue;
    
    // Cache autoloaded options
    if (value) await this.options.put(`opt:${name}`, value, { expirationTtl: 3600 });
    
    return value;
  }

  async updateOption(name: string, value: string, autoload = 'yes'): Promise<void> {
    await this.db.prepare(
      `INSERT INTO wp_options (option_name, option_value, autoload) VALUES (?, ?, ?)
       ON CONFLICT(option_name) DO UPDATE SET option_value = excluded.option_value`
    ).bind(name, value, autoload).run();
    await this.options.put(`opt:${name}`, value, { expirationTtl: 3600 });
  }

  async deleteOption(name: string): Promise<void> {
    await this.db.prepare('DELETE FROM wp_options WHERE option_name = ?').bind(name).run();
    await this.options.delete(`opt:${name}`);
  }

  // ─── Posts ────────────────────────────────────────────────────────
  async getPost(id: number): Promise<WPPost | null> {
    return await this.db.prepare(
      'SELECT * FROM wp_posts WHERE ID = ?'
    ).bind(id).first<WPPost>();
  }

  async getPostBySlug(slug: string, type = 'post'): Promise<WPPost | null> {
    return await this.db.prepare(
      'SELECT * FROM wp_posts WHERE post_name = ? AND post_type = ? AND post_status != "trash"'
    ).bind(slug, type).first<WPPost>();
  }

  async getPosts(args: {
    post_type?: string;
    post_status?: string;
    posts_per_page?: number;
    offset?: number;
    orderby?: string;
    order?: string;
    author?: number;
    search?: string;
    category?: number;
    tag?: number;
  } = {}): Promise<WPPost[]> {
    const {
      post_type = 'post',
      post_status = 'publish',
      posts_per_page = 10,
      offset = 0,
      orderby = 'date',
      order = 'DESC',
      author,
      search
    } = args;

    let query = 'SELECT * FROM wp_posts WHERE post_type = ? AND post_status = ?';
    const binds: unknown[] = [post_type, post_status];

    if (author) { query += ' AND post_author = ?'; binds.push(author); }
    if (search) { query += ' AND (post_title LIKE ? OR post_content LIKE ?)'; binds.push(`%${search}%`, `%${search}%`); }

    const orderMap: Record<string, string> = {
      date: 'post_date', modified: 'post_modified', title: 'post_title',
      ID: 'ID', menu_order: 'menu_order', rand: 'RANDOM()'
    };
    const col = orderMap[orderby] || 'post_date';
    const dir = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    query += ` ORDER BY ${col} ${dir} LIMIT ? OFFSET ?`;
    binds.push(posts_per_page, offset);

    const result = await this.db.prepare(query).bind(...binds).all<WPPost>();
    return result.results;
  }

  async insertPost(post: Partial<WPPost>): Promise<number> {
    const now = new Date().toISOString().replace('T', ' ').split('.')[0];
    const result = await this.db.prepare(`
      INSERT INTO wp_posts (
        post_author, post_date, post_date_gmt, post_content, post_title,
        post_excerpt, post_status, comment_status, ping_status, post_name,
        post_type, post_modified, post_modified_gmt, post_parent, guid, menu_order
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      post.post_author ?? 1,
      post.post_date ?? now,
      post.post_date_gmt ?? now,
      post.post_content ?? '',
      post.post_title ?? '',
      post.post_excerpt ?? '',
      post.post_status ?? 'draft',
      post.comment_status ?? 'open',
      post.ping_status ?? 'open',
      post.post_name ?? '',
      post.post_type ?? 'post',
      post.post_modified ?? now,
      post.post_modified_gmt ?? now,
      post.post_parent ?? 0,
      '',
      post.menu_order ?? 0
    ).run();
    
    const id = Number(result.meta.last_row_id);
    
    // Update guid
    const siteUrl = await this.getOption('siteurl');
    await this.db.prepare('UPDATE wp_posts SET guid = ? WHERE ID = ?')
      .bind(`${siteUrl}/?p=${id}`, id).run();
    
    return id;
  }

  async updatePost(id: number, data: Partial<WPPost>): Promise<void> {
    const now = new Date().toISOString().replace('T', ' ').split('.')[0];
    const fields: string[] = [];
    const vals: unknown[] = [];

    if (data.post_title !== undefined) { fields.push('post_title = ?'); vals.push(data.post_title); }
    if (data.post_content !== undefined) { fields.push('post_content = ?'); vals.push(data.post_content); }
    if (data.post_excerpt !== undefined) { fields.push('post_excerpt = ?'); vals.push(data.post_excerpt); }
    if (data.post_status !== undefined) { fields.push('post_status = ?'); vals.push(data.post_status); }
    if (data.post_name !== undefined) { fields.push('post_name = ?'); vals.push(data.post_name); }
    if (data.post_author !== undefined) { fields.push('post_author = ?'); vals.push(data.post_author); }
    if (data.post_date !== undefined) { fields.push('post_date = ?'); vals.push(data.post_date); }
    if (data.menu_order !== undefined) { fields.push('menu_order = ?'); vals.push(data.menu_order); }
    if (data.comment_status !== undefined) { fields.push('comment_status = ?'); vals.push(data.comment_status); }

    fields.push('post_modified = ?'); vals.push(now);
    fields.push('post_modified_gmt = ?'); vals.push(now);

    if (!fields.length) return;
    vals.push(id);

    await this.db.prepare(
      `UPDATE wp_posts SET ${fields.join(', ')} WHERE ID = ?`
    ).bind(...vals).run();
  }

  async deletePost(id: number, force = false): Promise<void> {
    if (force) {
      await this.db.prepare('DELETE FROM wp_posts WHERE ID = ?').bind(id).run();
      await this.db.prepare('DELETE FROM wp_postmeta WHERE post_id = ?').bind(id).run();
    } else {
      await this.db.prepare('UPDATE wp_posts SET post_status = "trash" WHERE ID = ?').bind(id).run();
    }
  }

  // ─── Post Meta ────────────────────────────────────────────────────
  async getPostMeta(postId: number, key: string, single = true): Promise<string | string[]> {
    const rows = await this.db.prepare(
      'SELECT meta_value FROM wp_postmeta WHERE post_id = ? AND meta_key = ?'
    ).bind(postId, key).all<{ meta_value: string }>();
    
    if (single) return rows.results[0]?.meta_value ?? '';
    return rows.results.map(r => r.meta_value);
  }

  async updatePostMeta(postId: number, key: string, value: string): Promise<void> {
    const existing = await this.db.prepare(
      'SELECT meta_id FROM wp_postmeta WHERE post_id = ? AND meta_key = ?'
    ).bind(postId, key).first<{ meta_id: number }>();
    
    if (existing) {
      await this.db.prepare(
        'UPDATE wp_postmeta SET meta_value = ? WHERE post_id = ? AND meta_key = ?'
      ).bind(value, postId, key).run();
    } else {
      await this.db.prepare(
        'INSERT INTO wp_postmeta (post_id, meta_key, meta_value) VALUES (?, ?, ?)'
      ).bind(postId, key, value).run();
    }
  }

  async deletePostMeta(postId: number, key: string): Promise<void> {
    await this.db.prepare(
      'DELETE FROM wp_postmeta WHERE post_id = ? AND meta_key = ?'
    ).bind(postId, key).run();
  }

  // ─── Users ────────────────────────────────────────────────────────
  async getUser(id: number): Promise<WPUser | null> {
    return await this.db.prepare(
      'SELECT * FROM wp_users WHERE ID = ?'
    ).bind(id).first<WPUser>();
  }

  async getUserByLogin(login: string): Promise<(WPUser & { user_pass: string }) | null> {
    return await this.db.prepare(
      'SELECT * FROM wp_users WHERE user_login = ?'
    ).bind(login).first<WPUser & { user_pass: string }>();
  }

  async getUserByEmail(email: string): Promise<WPUser | null> {
    return await this.db.prepare(
      'SELECT * FROM wp_users WHERE user_email = ?'
    ).bind(email).first<WPUser>();
  }

  async getUserMeta(userId: number, key: string): Promise<string> {
    const row = await this.db.prepare(
      'SELECT meta_value FROM wp_usermeta WHERE user_id = ? AND meta_key = ?'
    ).bind(userId, key).first<{ meta_value: string }>();
    return row?.meta_value ?? '';
  }

  async updateUserMeta(userId: number, key: string, value: string): Promise<void> {
    const existing = await this.db.prepare(
      'SELECT umeta_id FROM wp_usermeta WHERE user_id = ? AND meta_key = ?'
    ).bind(userId, key).first();
    
    if (existing) {
      await this.db.prepare(
        'UPDATE wp_usermeta SET meta_value = ? WHERE user_id = ? AND meta_key = ?'
      ).bind(value, userId, key).run();
    } else {
      await this.db.prepare(
        'INSERT INTO wp_usermeta (user_id, meta_key, meta_value) VALUES (?, ?, ?)'
      ).bind(userId, key, value).run();
    }
  }

  // ─── Terms / Taxonomy ─────────────────────────────────────────────
  async getTerms(taxonomy: string): Promise<WPTerm[]> {
    const result = await this.db.prepare(`
      SELECT t.term_id, t.name, t.slug, t.term_group,
             tt.term_taxonomy_id, tt.taxonomy, tt.description, tt.parent, tt.count
      FROM wp_terms t
      JOIN wp_term_taxonomy tt ON t.term_id = tt.term_id
      WHERE tt.taxonomy = ?
      ORDER BY t.name ASC
    `).bind(taxonomy).all<WPTerm>();
    return result.results;
  }

  async getPostTerms(postId: number, taxonomy: string): Promise<WPTerm[]> {
    const result = await this.db.prepare(`
      SELECT t.term_id, t.name, t.slug, t.term_group,
             tt.term_taxonomy_id, tt.taxonomy, tt.description, tt.parent, tt.count
      FROM wp_terms t
      JOIN wp_term_taxonomy tt ON t.term_id = tt.term_id
      JOIN wp_term_relationships tr ON tt.term_taxonomy_id = tr.term_taxonomy_id
      WHERE tr.object_id = ? AND tt.taxonomy = ?
    `).bind(postId, taxonomy).all<WPTerm>();
    return result.results;
  }

  async insertTerm(name: string, taxonomy: string, args: { slug?: string; description?: string; parent?: number } = {}): Promise<number> {
    const slug = args.slug || name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    
    const existing = await this.db.prepare(
      'SELECT term_id FROM wp_terms WHERE slug = ?'
    ).bind(slug).first<{ term_id: number }>();
    
    if (existing) return existing.term_id;
    
    const termResult = await this.db.prepare(
      'INSERT INTO wp_terms (name, slug, term_group) VALUES (?, ?, 0)'
    ).bind(name, slug).run();
    
    const termId = Number(termResult.meta.last_row_id);
    
    await this.db.prepare(
      'INSERT INTO wp_term_taxonomy (term_id, taxonomy, description, parent, count) VALUES (?, ?, ?, ?, 0)'
    ).bind(termId, taxonomy, args.description ?? '', args.parent ?? 0).run();
    
    return termId;
  }

  async setPostTerms(postId: number, termIds: number[], taxonomy: string): Promise<void> {
    // Get term_taxonomy_ids
    const ttRows = await this.db.prepare(
      `SELECT term_taxonomy_id FROM wp_term_taxonomy WHERE term_id IN (${termIds.map(() => '?').join(',')}) AND taxonomy = ?`
    ).bind(...termIds, taxonomy).all<{ term_taxonomy_id: number }>();
    
    // Delete old relationships
    const oldTTs = await this.db.prepare(`
      SELECT tr.term_taxonomy_id FROM wp_term_relationships tr
      JOIN wp_term_taxonomy tt ON tr.term_taxonomy_id = tt.term_taxonomy_id
      WHERE tr.object_id = ? AND tt.taxonomy = ?
    `).bind(postId, taxonomy).all<{ term_taxonomy_id: number }>();
    
    for (const old of oldTTs.results) {
      await this.db.prepare('DELETE FROM wp_term_relationships WHERE object_id = ? AND term_taxonomy_id = ?')
        .bind(postId, old.term_taxonomy_id).run();
    }
    
    // Insert new
    for (const tt of ttRows.results) {
      await this.db.prepare(
        'INSERT OR IGNORE INTO wp_term_relationships (object_id, term_taxonomy_id) VALUES (?, ?)'
      ).bind(postId, tt.term_taxonomy_id).run();
    }
    
    // Update counts
    for (const tt of ttRows.results) {
      await this.db.prepare(`
        UPDATE wp_term_taxonomy SET count = (
          SELECT COUNT(*) FROM wp_term_relationships tr
          JOIN wp_posts p ON tr.object_id = p.ID
          WHERE tr.term_taxonomy_id = ? AND p.post_status = 'publish'
        ) WHERE term_taxonomy_id = ?
      `).bind(tt.term_taxonomy_id, tt.term_taxonomy_id).run();
    }
  }

  // ─── Comments ─────────────────────────────────────────────────────
  async getComments(postId: number, status = 'approve'): Promise<WPComment[]> {
    const result = await this.db.prepare(
      'SELECT * FROM wp_comments WHERE comment_post_ID = ? AND comment_approved = ? ORDER BY comment_date ASC'
    ).bind(postId, status).all<WPComment>();
    return result.results;
  }

  // ─── Count helpers ────────────────────────────────────────────────
  async countPosts(type = 'post', status = 'publish'): Promise<number> {
    const row = await this.db.prepare(
      'SELECT COUNT(*) as cnt FROM wp_posts WHERE post_type = ? AND post_status = ?'
    ).bind(type, status).first<{ cnt: number }>();
    return row?.cnt ?? 0;
  }
}

export function createDB(env: Env): WPDB {
  return new WPDB(env.DB, env.OPTIONS);
}
