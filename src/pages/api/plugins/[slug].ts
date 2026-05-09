// src/pages/api/plugins/[slug].ts
// PUT    /api/plugins/:slug?action=activate   → 플러그인 활성화
// PUT    /api/plugins/:slug?action=deactivate → 플러그인 비활성화
// DELETE /api/plugins/:slug                   → 플러그인 삭제
export const prerender = false;
import { getSessionUser } from '../auth/me';

async function requireAdmin(req: Request, env: any) {
  const user = await getSessionUser(req, env);
  if (!user) throw Object.assign(new Error('인증이 필요합니다.'), { status: 401 });
  return user;
}

export async function PUT({ request, env, params }: { request: Request; env: any; params: any }) {
  try {
    await requireAdmin(request, env);
    const db   = env.DB as D1Database;
    const slug = params.slug;
    const url  = new URL(request.url);
    const action = url.searchParams.get('action') || (await request.json().catch(() => ({} as any)) as any).action;

    const plugin = await db.prepare('SELECT * FROM cloudpress_plugins WHERE slug = ?').bind(slug).first<any>();
    if (!plugin) return Response.json({ error: '플러그인을 찾을 수 없습니다.' }, { status: 404 });

    if (action === 'activate') {
      // 1. wp_options의 active_plugins에 추가
      await toggleActivePlugin(db, slug + '/' + slug + '.php', true);
      await db.prepare("UPDATE cloudpress_plugins SET is_active = 1 WHERE slug = ?").bind(slug).run();

      // 2. GitHub에 활성 플러그인 목록 동기화
      await syncActivePluginsToGitHub(db, env).catch(() => {});

      return Response.json({ success: true, message: `${plugin.plugin_name} 활성화 완료.` });
    }

    if (action === 'deactivate') {
      await toggleActivePlugin(db, slug + '/' + slug + '.php', false);
      await db.prepare("UPDATE cloudpress_plugins SET is_active = 0 WHERE slug = ?").bind(slug).run();
      await syncActivePluginsToGitHub(db, env).catch(() => {});
      return Response.json({ success: true, message: `${plugin.plugin_name} 비활성화 완료.` });
    }

    return Response.json({ error: '알 수 없는 action입니다.' }, { status: 400 });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: e.status || 500 });
  }
}

export async function DELETE({ request, env, params }: { request: Request; env: any; params: any }) {
  try {
    await requireAdmin(request, env);
    const db   = env.DB as D1Database;
    const slug = params.slug;

    // 활성화 상태면 먼저 비활성화
    const plugin = await db.prepare('SELECT * FROM cloudpress_plugins WHERE slug = ?').bind(slug).first<any>();
    if (!plugin) return Response.json({ error: '플러그인을 찾을 수 없습니다.' }, { status: 404 });

    if (plugin.is_active) {
      await toggleActivePlugin(db, slug + '/' + slug + '.php', false);
    }

    // D1에서 삭제
    await db.prepare("DELETE FROM cloudpress_plugin_files WHERE slug = ?").bind(slug).run().catch(() => {});
    await db.prepare("DELETE FROM cloudpress_plugins WHERE slug = ?").bind(slug).run();

    // GitHub에서도 삭제
    if (env.GITHUB_TOKEN && env.GITHUB_OWNER && env.GITHUB_REPO) {
      deletePluginFromGitHub(env, slug).catch(() => {});
    }

    return Response.json({ success: true, message: `${plugin.plugin_name} 삭제 완료.` });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: e.status || 500 });
  }
}

// ── wp_options active_plugins 토글 ───────────────────────────────────────────
async function toggleActivePlugin(db: D1Database, pluginFile: string, activate: boolean) {
  const row = await db.prepare(
    "SELECT option_value FROM wp_options WHERE option_name = 'active_plugins' LIMIT 1"
  ).first<any>().catch(() => null);

  let active: string[] = [];
  if (row?.option_value) {
    try { active = JSON.parse(row.option_value); } catch {}
    if (!Array.isArray(active)) active = [];
  }

  if (activate && !active.includes(pluginFile)) {
    active.push(pluginFile);
  } else if (!activate) {
    active = active.filter(p => p !== pluginFile);
  }

  const serialized = JSON.stringify(active);
  await db.prepare(`
    INSERT INTO wp_options (option_name, option_value, autoload) VALUES ('active_plugins', ?, 'yes')
    ON CONFLICT(option_name) DO UPDATE SET option_value = excluded.option_value
  `).bind(serialized).run();
}

// ── GitHub에 활성 플러그인 목록 동기화 ───────────────────────────────────────
async function syncActivePluginsToGitHub(db: D1Database, env: any) {
  if (!env.GITHUB_TOKEN || !env.GITHUB_OWNER || !env.GITHUB_REPO) return;

  const row = await db.prepare(
    "SELECT option_value FROM wp_options WHERE option_name = 'active_plugins' LIMIT 1"
  ).first<any>().catch(() => null);

  const content = btoa(JSON.stringify({ active_plugins: row?.option_value || '[]' }, null, 2));
  await fetch(
    `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/.cloudpress/active-plugins.json`,
    {
      method: 'PUT',
      headers: {
        Authorization: `token ${env.GITHUB_TOKEN}`,
        'Content-Type': 'application/json',
        'User-Agent': 'CloudPress/1.0',
      },
      body: JSON.stringify({ message: 'sync: active plugins', content }),
    }
  ).catch(() => {});
}

async function deletePluginFromGitHub(env: any, slug: string) {
  const owner = env.GITHUB_OWNER;
  const repo  = env.GITHUB_REPO;
  const token = env.GITHUB_TOKEN;

  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/wp-content/plugins/${slug}.zip`,
    { headers: { Authorization: `token ${token}`, 'User-Agent': 'CloudPress/1.0' } }
  ).then(r => r.json()).catch(() => null) as any;

  if (res?.sha) {
    await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/wp-content/plugins/${slug}.zip`,
      {
        method: 'DELETE',
        headers: { Authorization: `token ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'CloudPress/1.0' },
        body: JSON.stringify({ message: `delete plugin: ${slug}`, sha: res.sha }),
      }
    ).catch(() => {});
  }
}
