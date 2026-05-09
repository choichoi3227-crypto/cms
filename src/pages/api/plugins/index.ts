// src/pages/api/plugins/index.ts
// GET    /api/plugins               → 설치된 플러그인 목록
// POST   /api/plugins               → zip 업로드 설치
// PUT    /api/plugins/:slug/activate   → 활성화
// PUT    /api/plugins/:slug/deactivate → 비활성화
// DELETE /api/plugins/:slug            → 삭제
export const prerender = false;
import { getSessionUser } from '../auth/me';

async function requireAdmin(req: Request, env: any) {
  const user = await getSessionUser(req, env);
  if (!user) throw Object.assign(new Error('인증이 필요합니다.'), { status: 401 });
  return user;
}

// ── GET: 플러그인 목록 ──────────────────────────────────────────────────────
export async function GET({ request, env }: { request: Request; env: any }) {
  try {
    await requireAdmin(request, env);
    const db = env.DB as D1Database;
    await ensurePluginsTable(db);

    const { results: plugins } = await db.prepare(
      'SELECT * FROM cloudpress_plugins ORDER BY plugin_name ASC'
    ).all<any>();

    return Response.json({ plugins: plugins || [] });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: e.status || 500 });
  }
}

// ── POST: zip 업로드 설치 또는 WordPress.org API 검색 설치 ────────────────
export async function POST({ request, env }: { request: Request; env: any }) {
  try {
    await requireAdmin(request, env);
    const db   = env.DB as D1Database;
    const body = await request.json() as any;
    await ensurePluginsTable(db);

    // ── WordPress.org 검색 결과에서 설치 ─────────────────────────────────
    if (body.source === 'wordpress_org') {
      return await installFromWordPressOrg(db, env, body);
    }

    // ── zip 파일 업로드 설치 ──────────────────────────────────────────────
    if (body.source === 'zip') {
      return await installFromZip(db, env, body);
    }

    return Response.json({ error: 'source는 wordpress_org 또는 zip이어야 합니다.' }, { status: 400 });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: e.status || 500 });
  }
}

// ── WordPress.org에서 플러그인 설치 ──────────────────────────────────────────
async function installFromWordPressOrg(db: D1Database, env: any, body: any) {
  const { slug } = body;
  if (!slug) return Response.json({ error: 'slug가 필요합니다.' }, { status: 400 });

  // WordPress.org API에서 플러그인 정보 조회
  const infoRes = await fetch(
    `https://api.wordpress.org/plugins/info/1.2/?action=plugin_information&request[slug]=${slug}&request[fields][sections]=0&request[fields][reviews]=0`
  );
  if (!infoRes.ok) return Response.json({ error: '플러그인을 찾을 수 없습니다.' }, { status: 404 });

  const info = await infoRes.json() as any;
  if (info.error) return Response.json({ error: info.error }, { status: 404 });

  // 플러그인 zip 다운로드
  const zipUrl  = info.download_link;
  const zipRes  = await fetch(zipUrl);
  if (!zipRes.ok) return Response.json({ error: 'zip 다운로드 실패' }, { status: 500 });

  const zipBuf  = await zipRes.arrayBuffer();
  const zipB64  = btoa(String.fromCharCode(...new Uint8Array(zipBuf)));

  return await savePluginZip(db, env, {
    slug:        info.slug,
    name:        info.name,
    version:     info.version,
    description: info.short_description || '',
    author:      info.author || '',
    author_url:  info.author_profile || '',
    plugin_url:  `https://wordpress.org/plugins/${slug}/`,
    requires_wp: info.requires || '',
    tested_up_to: info.tested || '',
    rating:      info.rating || 0,
    num_ratings: info.num_ratings || 0,
    active_installs: info.active_installs || 0,
    last_updated: info.last_updated || '',
    zipB64,
    zipSize: zipBuf.byteLength,
  });
}

// ── zip 파일에서 설치 ────────────────────────────────────────────────────────
async function installFromZip(db: D1Database, env: any, body: any) {
  const { filename, data, size } = body;
  if (!filename || !data) return Response.json({ error: 'filename과 data가 필요합니다.' }, { status: 400 });
  if (size > 50 * 1024 * 1024) return Response.json({ error: 'zip이 50MB를 초과합니다.' }, { status: 413 });

  // zip에서 플러그인 헤더 파싱
  const header = await parsePluginHeaderFromZip(data);
  const slug   = filename.replace('.zip', '').replace(/[^a-z0-9-]/gi, '-').toLowerCase();

  return await savePluginZip(db, env, {
    slug,
    name:        header.name || slug,
    version:     header.version || '1.0.0',
    description: header.description || '',
    author:      header.author || '',
    author_url:  header.author_uri || '',
    plugin_url:  header.plugin_uri || '',
    requires_wp: header.requires_at_least || '',
    tested_up_to: header.tested_up_to || '',
    rating:      0,
    num_ratings: 0,
    active_installs: 0,
    last_updated: new Date().toISOString(),
    zipB64: data,
    zipSize: size,
  });
}

// ── 플러그인 저장 (DB + GitHub) ───────────────────────────────────────────────
async function savePluginZip(db: D1Database, env: any, info: any) {
  const {
    slug, name, version, description, author, author_url,
    plugin_url, requires_wp, tested_up_to, rating, num_ratings,
    active_installs, last_updated, zipB64, zipSize
  } = info;

  // D1에 플러그인 메타 저장
  const existing = await db.prepare('SELECT id FROM cloudpress_plugins WHERE slug = ?').bind(slug).first<any>();

  const now = new Date().toISOString();
  if (existing) {
    await db.prepare(`
      UPDATE cloudpress_plugins SET
        plugin_name = ?, version = ?, description = ?, author = ?,
        plugin_url = ?, requires_wp = ?, tested_up_to = ?, updated_at = ?
      WHERE slug = ?
    `).bind(name, version, description, author, plugin_url, requires_wp, tested_up_to, now, slug).run();
  } else {
    await db.prepare(`
      INSERT INTO cloudpress_plugins
        (slug, plugin_name, version, description, author, author_url, plugin_url,
         requires_wp, tested_up_to, rating, num_ratings, active_installs,
         last_updated, is_active, installed_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,?)
    `).bind(
      slug, name, version, description, author, author_url, plugin_url,
      requires_wp, tested_up_to, rating, num_ratings, active_installs,
      last_updated, now, now
    ).run();
  }

  // zip 청크를 D1에 저장
  await db.prepare("DELETE FROM cloudpress_plugin_files WHERE slug = ?").bind(slug).run().catch(() => {});
  await ensurePluginFilesTable(db);

  const CHUNK = 500_000;
  const total = Math.ceil(zipB64.length / CHUNK);
  for (let i = 0; i < total; i++) {
    await db.prepare("INSERT INTO cloudpress_plugin_files (slug, chunk_index, data) VALUES (?,?,?)")
      .bind(slug, i, zipB64.slice(i * CHUNK, (i + 1) * CHUNK)).run();
  }

  // GitHub에도 업로드 (wp-content/plugins/slug/ 구조)
  if (env.GITHUB_TOKEN && env.GITHUB_OWNER && env.GITHUB_REPO) {
    uploadPluginToGitHub(env, slug, zipB64).catch(e => {
      console.error('[Plugin] GitHub 업로드 실패:', e.message);
    });
  }

  return Response.json({
    success: true,
    plugin: { slug, name, version, description, is_active: false },
    message: `${name} 설치 완료. 활성화하려면 활성화 버튼을 클릭하세요.`,
  }, { status: 201 });
}

// ── GitHub에 플러그인 파일 업로드 (백그라운드) ────────────────────────────────
async function uploadPluginToGitHub(env: any, slug: string, zipB64: string) {
  const owner = env.GITHUB_OWNER;
  const repo  = env.GITHUB_REPO;
  const token = env.GITHUB_TOKEN;

  // zip 파일 자체를 업로드 (wp-content/plugins/slug.zip)
  await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/wp-content/plugins/${slug}.zip`, {
    method: 'PUT',
    headers: { Authorization: `token ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'CloudPress/1.0' },
    body: JSON.stringify({
      message: `install plugin: ${slug}`,
      content: zipB64,
    }),
  }).then(async r => {
    if (!r.ok) throw new Error(await r.text());
  });
}

// ── 플러그인 zip에서 헤더 파싱 ───────────────────────────────────────────────
async function parsePluginHeaderFromZip(zipB64: string): Promise<Record<string, string>> {
  // zip에서 첫 번째 .php 파일의 WordPress 플러그인 헤더를 파싱
  try {
    const binaryStr = atob(zipB64);
    const bytes     = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

    const view   = new DataView(bytes.buffer);
    let   offset = 0;

    while (offset < bytes.length - 4) {
      const sig = view.getUint32(offset, true);
      if (sig !== 0x04034b50) break;

      const compression   = view.getUint16(offset + 8, true);
      const compressedSz  = view.getUint32(offset + 18, true);
      const fnLen         = view.getUint16(offset + 26, true);
      const extraLen      = view.getUint16(offset + 28, true);
      const fnStart       = offset + 30;
      const fnEnd         = fnStart + fnLen;
      const dataStart     = fnEnd + extraLen;
      const dataEnd       = dataStart + compressedSz;

      const filePath = new TextDecoder().decode(bytes.slice(fnStart, fnEnd));

      // 최상위 디렉토리 바로 아래 .php 파일 (플러그인 메인 파일)
      if (filePath.endsWith('.php') && filePath.split('/').length === 2 && compression === 8) {
        const compData = bytes.slice(dataStart, dataEnd);
        const ds       = new DecompressionStream('deflate-raw');
        const writer   = ds.writable.getWriter();
        const reader   = ds.readable.getReader();
        writer.write(compData); writer.close();

        const chunks: Uint8Array[] = [];
        let totalLen = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value); totalLen += value.length;
        }
        const fileData = new Uint8Array(totalLen);
        let pos = 0;
        for (const chunk of chunks) { fileData.set(chunk, pos); pos += chunk.length; }

        const text    = new TextDecoder().decode(fileData.slice(0, 8192));
        return parseWPPluginHeader(text);
      }

      offset = dataEnd;
    }
  } catch {}
  return {};
}

function parseWPPluginHeader(phpContent: string): Record<string, string> {
  const headerMap: Record<string, string> = {
    'Plugin Name':       'name',
    'Plugin URI':        'plugin_uri',
    'Description':       'description',
    'Version':           'version',
    'Author':            'author',
    'Author URI':        'author_uri',
    'Requires at least': 'requires_at_least',
    'Tested up to':      'tested_up_to',
    'Requires PHP':      'requires_php',
    'Text Domain':       'text_domain',
    'Domain Path':       'domain_path',
    'License':           'license',
    'Network':           'network',
  };

  const result: Record<string, string> = {};
  for (const [header, key] of Object.entries(headerMap)) {
    const match = phpContent.match(new RegExp(`\\*\\s*${header}:\\s*(.+)`, 'i'));
    if (match) result[key] = match[1].trim();
  }
  return result;
}

// ── 테이블 초기화 ─────────────────────────────────────────────────────────────
async function ensurePluginsTable(db: D1Database) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS cloudpress_plugins (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      slug             TEXT    UNIQUE NOT NULL,
      plugin_name      TEXT    NOT NULL DEFAULT '',
      version          TEXT    NOT NULL DEFAULT '',
      description      TEXT    NOT NULL DEFAULT '',
      author           TEXT    NOT NULL DEFAULT '',
      author_url       TEXT    NOT NULL DEFAULT '',
      plugin_url       TEXT    NOT NULL DEFAULT '',
      requires_wp      TEXT    NOT NULL DEFAULT '',
      tested_up_to     TEXT    NOT NULL DEFAULT '',
      rating           REAL    NOT NULL DEFAULT 0,
      num_ratings      INTEGER NOT NULL DEFAULT 0,
      active_installs  INTEGER NOT NULL DEFAULT 0,
      last_updated     TEXT    NOT NULL DEFAULT '',
      is_active        INTEGER NOT NULL DEFAULT 0,
      installed_at     TEXT    NOT NULL DEFAULT '',
      updated_at       TEXT    NOT NULL DEFAULT ''
    )
  `).run().catch(() => {});
}

async function ensurePluginFilesTable(db: D1Database) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS cloudpress_plugin_files (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      slug        TEXT    NOT NULL,
      chunk_index INTEGER NOT NULL,
      data        TEXT    NOT NULL,
      UNIQUE(slug, chunk_index)
    )
  `).run().catch(() => {});
}
