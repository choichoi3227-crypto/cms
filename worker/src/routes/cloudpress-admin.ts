/**
 * CloudPress CMS Admin — /admin/* 경로 핸들러
 * Astro → 순수 HTML5 변환
 * CloudPress 플랫폼(DB・스토리지・사이트・도메인) 완전 통합
 */

import { IRequest } from 'itty-router';
import { Env, SessionData } from '../types/env';
import { createDB } from '../utils/db';
import { checkPassword } from '../utils/crypto';

// ── 세션 헬퍼 ─────────────────────────────────────────────────────────────
function getSessionToken(request: IRequest): string | null {
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(/cp_cms_session=([^;]+)/);
  if (match) return decodeURIComponent(match[1]);
  const auth = request.headers.get('Authorization');
  if (auth?.startsWith('Bearer ')) return auth.slice(7);
  return null;
}

async function getSession(request: IRequest, env: Env): Promise<SessionData | null> {
  const token = getSessionToken(request);
  if (!token) return null;
  try {
    const session = await env.SESSIONS.get<SessionData>(`cms:${token}`, 'json');
    if (!session || session.expires < Date.now()) return null;
    return session;
  } catch { return null; }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    }
  });
}

// ── HTML 레이아웃 ─────────────────────────────────────────────────────────
function layout(title: string, content: string, activeMenu: string, session: SessionData): string {
  const menuItems = [
    { href: '/admin', icon: '📊', label: '대시보드', key: 'dashboard' },
    { href: '/admin/posts', icon: '📝', label: '게시글', key: 'posts' },
    { href: '/admin/pages', icon: '📄', label: '페이지', key: 'pages' },
    { href: '/admin/media', icon: '🖼️', label: '미디어', key: 'media' },
    { href: '/admin/comments', icon: '💬', label: '댓글', key: 'comments' },
    { href: '/admin/categories', icon: '📁', label: '카테고리', key: 'categories' },
    { href: '/admin/tags', icon: '🏷️', label: '태그', key: 'tags' },
    { href: '/admin/themes', icon: '🎨', label: '테마', key: 'themes' },
    { href: '/admin/plugins', icon: '🔌', label: '플러그인', key: 'plugins' },
    { href: '/admin/users', icon: '👥', label: '사용자', key: 'users' },
    { href: '/admin/tools', icon: '🔧', label: '도구', key: 'tools' },
    { href: '/admin/settings', icon: '⚙️', label: '설정', key: 'settings' },
  ];

  const nav = menuItems.map(m => `
    <a href="${m.href}" class="nav-item${activeMenu === m.key ? ' active' : ''}">
      <span class="nav-icon">${m.icon}</span>
      <span class="nav-label">${m.label}</span>
    </a>`).join('');

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} — CloudPress CMS</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --bg: #1d2327; --sidebar: #2c3338; --border: #3c434a;
      --text: #c3c4c7; --text-muted: #8c8f94; --accent: #2271b1;
      --accent-hover: #135e96; --danger: #b32d2e; --success: #00a32a;
      --warning: #dba617; --white: #fff;
      --sidebar-width: 200px;
    }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: var(--bg); color: var(--text); min-height: 100vh; display: flex; }
    /* Sidebar */
    #sidebar {
      width: var(--sidebar-width); background: var(--sidebar); border-right: 1px solid var(--border);
      display: flex; flex-direction: column; position: fixed; top: 0; left: 0; bottom: 0; overflow-y: auto; z-index: 100;
    }
    .sidebar-logo {
      padding: 16px; font-size: 18px; font-weight: 800; color: var(--white);
      border-bottom: 1px solid var(--border); letter-spacing: -0.5px;
    }
    .sidebar-logo span { color: var(--accent); }
    .sidebar-nav { padding: 8px 0; flex: 1; }
    .nav-item {
      display: flex; align-items: center; gap: 8px; padding: 9px 16px;
      color: var(--text-muted); text-decoration: none; font-size: 13px; font-weight: 500;
      transition: background .15s, color .15s; border-left: 3px solid transparent;
    }
    .nav-item:hover { background: rgba(34,113,177,.1); color: var(--white); }
    .nav-item.active { background: rgba(34,113,177,.15); color: var(--white); border-left-color: var(--accent); }
    .nav-icon { font-size: 16px; width: 20px; text-align: center; }
    .sidebar-footer { padding: 12px 16px; border-top: 1px solid var(--border); font-size: 12px; color: var(--text-muted); }
    .sidebar-footer a { color: var(--text-muted); text-decoration: none; }
    .sidebar-footer a:hover { color: var(--danger); }
    /* Main */
    #main { margin-left: var(--sidebar-width); flex: 1; display: flex; flex-direction: column; min-height: 100vh; }
    #topbar {
      background: var(--sidebar); border-bottom: 1px solid var(--border);
      padding: 0 24px; height: 46px; display: flex; align-items: center;
      justify-content: space-between; position: sticky; top: 0; z-index: 50;
    }
    .topbar-title { font-size: 15px; font-weight: 700; color: var(--white); }
    .topbar-user { font-size: 12px; color: var(--text-muted); }
    #content { padding: 24px; flex: 1; }
    /* Components */
    .card { background: var(--sidebar); border: 1px solid var(--border); border-radius: 8px; overflow: hidden; margin-bottom: 20px; }
    .card-header { padding: 14px 18px; border-bottom: 1px solid var(--border); font-weight: 700; font-size: 14px; color: var(--white); display: flex; align-items: center; justify-content: space-between; }
    .card-body { padding: 18px; }
    .btn { display: inline-flex; align-items: center; gap: 6px; padding: 7px 14px; border-radius: 4px; font-size: 13px; font-weight: 600; cursor: pointer; border: 1px solid transparent; text-decoration: none; transition: all .15s; }
    .btn-primary { background: var(--accent); color: var(--white); border-color: var(--accent-hover); }
    .btn-primary:hover { background: var(--accent-hover); }
    .btn-secondary { background: transparent; color: var(--text); border-color: var(--border); }
    .btn-secondary:hover { background: rgba(255,255,255,.05); }
    .btn-danger { background: transparent; color: #f87171; border-color: #7f1d1d; }
    .btn-danger:hover { background: rgba(248,113,113,.1); }
    .btn-sm { padding: 4px 10px; font-size: 12px; }
    .form-group { margin-bottom: 16px; }
    .form-label { display: block; font-size: 13px; font-weight: 600; margin-bottom: 6px; color: var(--text); }
    .form-input, .form-select, .form-textarea {
      width: 100%; padding: 8px 12px; background: var(--bg); border: 1px solid var(--border);
      border-radius: 4px; color: var(--text); font-size: 13px; font-family: inherit;
    }
    .form-input:focus, .form-select:focus, .form-textarea:focus { outline: none; border-color: var(--accent); }
    .form-textarea { resize: vertical; min-height: 120px; }
    .table { width: 100%; border-collapse: collapse; font-size: 13px; }
    .table th, .table td { padding: 10px 14px; border-bottom: 1px solid var(--border); text-align: left; }
    .table th { font-weight: 700; color: var(--text-muted); font-size: 11px; text-transform: uppercase; letter-spacing: .5px; }
    .table tr:hover td { background: rgba(255,255,255,.02); }
    .table tr:last-child td { border-bottom: none; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 20px; font-size: 11px; font-weight: 700; }
    .badge-publish { background: rgba(0,163,42,.15); color: #4ade80; }
    .badge-draft { background: rgba(139,92,246,.15); color: #a78bfa; }
    .badge-pending { background: rgba(234,179,8,.15); color: #fbbf24; }
    .badge-private { background: rgba(239,68,68,.15); color: #f87171; }
    .badge-future { background: rgba(34,113,177,.15); color: #60a5fa; }
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 14px; margin-bottom: 24px; }
    .stat-card { background: var(--sidebar); border: 1px solid var(--border); border-radius: 8px; padding: 18px; text-align: center; }
    .stat-num { font-size: 28px; font-weight: 800; color: var(--white); }
    .stat-label { font-size: 12px; color: var(--text-muted); margin-top: 4px; }
    .alert { padding: 12px 16px; border-radius: 6px; font-size: 13px; margin-bottom: 16px; }
    .alert-success { background: rgba(0,163,42,.15); border: 1px solid rgba(0,163,42,.3); color: #4ade80; }
    .alert-error { background: rgba(239,68,68,.1); border: 1px solid rgba(239,68,68,.3); color: #f87171; }
    .alert-info { background: rgba(34,113,177,.1); border: 1px solid rgba(34,113,177,.3); color: #60a5fa; }
    .empty-state { text-align: center; padding: 60px 20px; color: var(--text-muted); font-size: 14px; }
    .empty-state .icon { font-size: 40px; margin-bottom: 12px; }
    .page-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
    .page-title { font-size: 22px; font-weight: 800; color: var(--white); }
    .search-bar { display: flex; gap: 8px; margin-bottom: 16px; }
    .search-bar input { flex: 1; max-width: 280px; }
    input[type=checkbox] { width: 16px; height: 16px; cursor: pointer; }
    .pagination { display: flex; gap: 6px; justify-content: center; margin-top: 20px; }
    .pagination a, .pagination span { padding: 6px 12px; border-radius: 4px; font-size: 13px; font-weight: 600; border: 1px solid var(--border); color: var(--text); text-decoration: none; }
    .pagination a:hover { background: rgba(255,255,255,.05); }
    .pagination .current { background: var(--accent); border-color: var(--accent); color: var(--white); }
    .tabs { display: flex; gap: 2px; border-bottom: 1px solid var(--border); margin-bottom: 20px; }
    .tab { padding: 8px 16px; font-size: 13px; font-weight: 600; color: var(--text-muted); text-decoration: none; border-bottom: 2px solid transparent; transition: all .15s; }
    .tab:hover, .tab.active { color: var(--white); border-bottom-color: var(--accent); }
    .editor-wrap { display: grid; grid-template-columns: 1fr 280px; gap: 16px; }
    .editor-main { display: flex; flex-direction: column; gap: 12px; }
    .editor-sidebar { display: flex; flex-direction: column; gap: 12px; }
    @media (max-width: 768px) {
      #sidebar { transform: translateX(-100%); transition: transform .3s; }
      #sidebar.open { transform: translateX(0); }
      #main { margin-left: 0; }
      .editor-wrap { grid-template-columns: 1fr; }
    }
    .spinner { display: inline-block; width: 16px; height: 16px; border: 2px solid rgba(255,255,255,.3); border-top-color: var(--white); border-radius: 50%; animation: spin .6s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .toast { position: fixed; top: 20px; right: 20px; z-index: 9999; display: flex; flex-direction: column; gap: 8px; pointer-events: none; }
    .toast-item { padding: 12px 18px; border-radius: 6px; font-size: 13px; font-weight: 600; min-width: 220px; pointer-events: all; animation: slideIn .3s ease; }
    .toast-success { background: #14532d; border: 1px solid #166534; color: #4ade80; }
    .toast-error { background: #7f1d1d; border: 1px solid #991b1b; color: #fca5a5; }
    @keyframes slideIn { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }
    .modal-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,.7); z-index: 1000; align-items: center; justify-content: center; }
    .modal-overlay.open { display: flex; }
    .modal { background: var(--sidebar); border: 1px solid var(--border); border-radius: 10px; width: 90%; max-width: 560px; max-height: 90vh; overflow-y: auto; }
    .modal-header { padding: 16px 20px; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; font-weight: 700; font-size: 15px; color: var(--white); }
    .modal-body { padding: 20px; }
    .modal-footer { padding: 14px 20px; border-top: 1px solid var(--border); display: flex; justify-content: flex-end; gap: 8px; }
    .close-btn { background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 20px; line-height: 1; }
    .close-btn:hover { color: var(--white); }
    /* Rich text editor */
    .wp-editor-wrap { border: 1px solid var(--border); border-radius: 4px; overflow: hidden; }
    .wp-editor-toolbar { background: #23282d; padding: 6px 10px; border-bottom: 1px solid var(--border); display: flex; gap: 4px; flex-wrap: wrap; }
    .wp-editor-toolbar button { background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.1); color: var(--text); border-radius: 3px; padding: 4px 8px; font-size: 12px; cursor: pointer; font-family: inherit; transition: background .15s; }
    .wp-editor-toolbar button:hover { background: rgba(255,255,255,.15); }
    .wp-editor-content { min-height: 300px; padding: 12px; font-size: 14px; line-height: 1.6; outline: none; color: var(--text); background: var(--bg); }
    .wp-editor-content:empty::before { content: attr(data-placeholder); color: var(--text-muted); }
  </style>
</head>
<body>
<div id="toast-container" class="toast"></div>

<!-- Sidebar -->
<nav id="sidebar">
  <div class="sidebar-logo"><span>CP</span> CMS</div>
  <div class="sidebar-nav">${nav}</div>
  <div class="sidebar-footer">
    <span>${session.userLogin}</span> &middot;
    <a href="/admin/auth/logout">로그아웃</a>
  </div>
</nav>

<!-- Main -->
<div id="main">
  <div id="topbar">
    <span class="topbar-title">${title}</span>
    <span class="topbar-user">${session.userEmail}</span>
  </div>
  <div id="content">${content}</div>
</div>

<script>
// Toast notifications
function toast(msg, type='success') {
  const c = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = 'toast-item toast-' + type;
  el.textContent = msg;
  c.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}
// Confirm wrapper
function confirmDelete(msg) { return confirm(msg || '정말 삭제하시겠습니까?'); }
// Mobile sidebar toggle
const sidebar = document.getElementById('sidebar');
document.addEventListener('keydown', e => { if (e.key === 'Escape' && sidebar.classList.contains('open')) sidebar.classList.remove('open'); });
</script>
</body>
</html>`;
}

// ── 로그인 페이지 ─────────────────────────────────────────────────────────
function renderLoginPage(error = ''): string {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>로그인 — CloudPress CMS</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #1d2327; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; }
    .login-wrap { width: 100%; max-width: 360px; }
    .login-logo { text-align: center; margin-bottom: 28px; font-size: 36px; font-weight: 900; color: #fff; letter-spacing: -1px; }
    .login-logo span { color: #2271b1; }
    .login-card { background: #2c3338; border: 1px solid #3c434a; border-radius: 12px; padding: 32px; }
    h1 { font-size: 20px; font-weight: 700; color: #fff; margin-bottom: 24px; }
    label { display: block; font-size: 13px; font-weight: 600; color: #c3c4c7; margin-bottom: 6px; }
    input { width: 100%; padding: 10px 14px; background: #1d2327; border: 1px solid #3c434a; border-radius: 6px; color: #fff; font-size: 14px; font-family: inherit; margin-bottom: 16px; }
    input:focus { outline: none; border-color: #2271b1; }
    button[type=submit] { width: 100%; padding: 11px; background: #2271b1; color: #fff; border: none; border-radius: 6px; font-size: 14px; font-weight: 700; cursor: pointer; transition: background .15s; }
    button[type=submit]:hover { background: #135e96; }
    .error { background: rgba(239,68,68,.1); border: 1px solid rgba(239,68,68,.3); color: #f87171; padding: 10px 14px; border-radius: 6px; font-size: 13px; margin-bottom: 16px; }
  </style>
</head>
<body>
  <div class="login-wrap">
    <div class="login-logo"><span>CP</span> CMS</div>
    <div class="login-card">
      <h1>관리자 로그인</h1>
      ${error ? `<div class="error">${error}</div>` : ''}
      <form method="POST" action="/admin/auth/login">
        <label for="username">사용자명 또는 이메일</label>
        <input type="text" id="username" name="username" required autocomplete="username">
        <label for="password">비밀번호</label>
        <input type="password" id="password" name="password" required autocomplete="current-password">
        <button type="submit">로그인</button>
      </form>
    </div>
  </div>
</body>
</html>`;
}

// ── 대시보드 ──────────────────────────────────────────────────────────────
async function renderDashboard(db: ReturnType<typeof createDB>, env: Env, session: SessionData): Promise<string> {
  const [posts, pages, drafts, comments] = await Promise.all([
    db.countPosts('post', 'publish'),
    db.countPosts('page', 'publish'),
    db.countPosts('post', 'draft'),
    env.DB.prepare("SELECT COUNT(*) as c FROM wp_comments WHERE comment_approved='0'")
      .first<{ c: number }>().then(r => r?.c ?? 0).catch(() => 0),
  ]);
  const recentPosts = await db.getPosts({ posts_per_page: 8 }).catch(() => []);
  const siteName = await db.getOption('blogname', 'CloudPress Site');
  const siteUrl = await db.getOption('siteurl', '');

  const postRows = recentPosts.length
    ? recentPosts.map(p => `
      <tr>
        <td><a href="/admin/posts/${p.ID}/edit" style="color:#2271b1;text-decoration:none;font-weight:600;">${esc(p.post_title || '(제목 없음)')}</a></td>
        <td><span class="badge badge-${p.post_status}">${statusLabel(p.post_status)}</span></td>
        <td style="color:#8c8f94;">${p.post_date ? new Date(p.post_date).toLocaleDateString('ko-KR') : '-'}</td>
        <td>
          <a href="/admin/posts/${p.ID}/edit" class="btn btn-sm btn-secondary">편집</a>
          <a href="${siteUrl}/${p.post_name}/" target="_blank" class="btn btn-sm btn-secondary">보기</a>
        </td>
      </tr>`).join('')
    : `<tr><td colspan="4" class="empty-state">아직 게시글이 없습니다. <a href="/admin/posts/new" style="color:#2271b1;">첫 글을 작성해보세요</a></td></tr>`;

  const content = `
    <div class="page-header">
      <h2 class="page-title">대시보드</h2>
      <a href="/admin/posts/new" class="btn btn-primary">✏️ 새 글 쓰기</a>
    </div>
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-num">${posts}</div><div class="stat-label">게시글</div></div>
      <div class="stat-card"><div class="stat-num">${pages}</div><div class="stat-label">페이지</div></div>
      <div class="stat-card"><div class="stat-num">${drafts}</div><div class="stat-label">임시저장</div></div>
      <div class="stat-card"><div class="stat-num" style="${comments > 0 ? 'color:#fbbf24' : ''}">${comments}</div><div class="stat-label">승인 대기 댓글</div></div>
    </div>
    <div class="card">
      <div class="card-header">
        최근 게시글
        <a href="/admin/posts" class="btn btn-sm btn-secondary">모두 보기</a>
      </div>
      <table class="table">
        <thead><tr><th>제목</th><th>상태</th><th>날짜</th><th>작업</th></tr></thead>
        <tbody>${postRows}</tbody>
      </table>
    </div>`;
  return layout('대시보드', content, 'dashboard', session);
}

// ── 게시글 목록 ───────────────────────────────────────────────────────────
async function renderPosts(db: ReturnType<typeof createDB>, session: SessionData, url: URL): Promise<string> {
  const page = parseInt(url.searchParams.get('paged') || '1');
  const perPage = 20;
  const statusFilter = url.searchParams.get('post_status') || '';
  const search = url.searchParams.get('s') || '';
  const postType = url.searchParams.get('post_type') || 'post';

  const posts = await db.getPosts({
    post_type: postType,
    post_status: statusFilter || 'any' as any,
    posts_per_page: perPage,
    offset: (page - 1) * perPage,
    search: search || undefined,
  }).catch(() => []);

  const [pub, draft, pending] = await Promise.all([
    db.countPosts(postType, 'publish'),
    db.countPosts(postType, 'draft'),
    db.countPosts(postType, 'pending'),
  ]);
  const total = pub + draft + pending;
  const pages = Math.ceil(total / perPage);
  const siteUrl = await db.getOption('siteurl', '');
  const isPage = postType === 'page';

  const tabs = `
    <div class="tabs">
      <a href="/admin/${isPage ? 'pages' : 'posts'}" class="tab${!statusFilter ? ' active' : ''}">전체 (${total})</a>
      <a href="/admin/${isPage ? 'pages' : 'posts'}?post_status=publish" class="tab${statusFilter === 'publish' ? ' active' : ''}">발행됨 (${pub})</a>
      <a href="/admin/${isPage ? 'pages' : 'posts'}?post_status=draft" class="tab${statusFilter === 'draft' ? ' active' : ''}">임시저장 (${draft})</a>
    </div>`;

  const rows = posts.length
    ? posts.map(p => `
      <tr>
        <td>
          <a href="/admin/${isPage ? 'pages' : 'posts'}/${p.ID}/edit" style="color:#2271b1;font-weight:600;text-decoration:none;">${esc(p.post_title || '(제목 없음)')}</a>
          <div style="margin-top:4px;display:flex;gap:6px;">
            <a href="/admin/${isPage ? 'pages' : 'posts'}/${p.ID}/edit" style="font-size:12px;color:#8c8f94;text-decoration:none;">편집</a>
            ${p.post_name ? `<a href="${siteUrl}/${p.post_name}/" target="_blank" style="font-size:12px;color:#8c8f94;text-decoration:none;">보기</a>` : ''}
            <a href="#" onclick="deletePost(${p.ID}, this)" style="font-size:12px;color:#f87171;text-decoration:none;">삭제</a>
          </div>
        </td>
        <td><span class="badge badge-${p.post_status}">${statusLabel(p.post_status)}</span></td>
        <td style="color:#8c8f94;font-size:13px;">${p.post_date ? new Date(p.post_date).toLocaleDateString('ko-KR') : '-'}</td>
      </tr>`).join('')
    : `<tr><td colspan="3" class="empty-state">게시글이 없습니다.</td></tr>`;

  const pager = pages > 1 ? `<div class="pagination">${
    Array.from({ length: pages }, (_, i) => i + 1).map(p =>
      `<a href="/admin/${isPage ? 'pages' : 'posts'}?paged=${p}${statusFilter ? '&post_status=' + statusFilter : ''}" class="${p === page ? 'current' : ''}">${p}</a>`
    ).join('')
  }</div>` : '';

  const content = `
    <div class="page-header">
      <h2 class="page-title">${isPage ? '페이지' : '게시글'}</h2>
      <a href="/admin/${isPage ? 'pages' : 'posts'}/new" class="btn btn-primary">+ 새로 추가</a>
    </div>
    ${tabs}
    <div class="search-bar">
      <form method="GET" action="/admin/${isPage ? 'pages' : 'posts'}" style="display:flex;gap:8px;">
        <input class="form-input" type="search" name="s" placeholder="검색..." value="${esc(search)}" style="max-width:240px;">
        <button class="btn btn-secondary" type="submit">검색</button>
      </form>
    </div>
    <div class="card">
      <table class="table">
        <thead><tr><th>제목</th><th>상태</th><th>날짜</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    ${pager}
    <script>
    async function deletePost(id, el) {
      if (!confirmDelete('이 게시글을 삭제하시겠습니까?')) return;
      el.textContent = '...';
      const r = await fetch('/api/posts/' + id, { method: 'DELETE', headers: authHeaders() });
      const d = await r.json();
      if (d.success) { toast('삭제되었습니다.'); el.closest('tr').remove(); }
      else { toast(d.error || '삭제 실패', 'error'); el.textContent = '삭제'; }
    }
    function authHeaders() {
      const tok = getCookie('cp_cms_session');
      return tok ? { 'Authorization': 'Bearer ' + tok } : {};
    }
    function getCookie(n) { return document.cookie.match(new RegExp('(?:^|; )' + n + '=([^;]*)'))?.map(m => decodeURIComponent(m[1]))[1] || ''; }
    </script>`;

  return layout(isPage ? '페이지' : '게시글', content, isPage ? 'pages' : 'posts', session);
}

// ── 글 편집기 ──────────────────────────────────────────────────────────────
async function renderPostEditor(db: ReturnType<typeof createDB>, session: SessionData, postId: number | null, url: URL): Promise<string> {
  const postType = url.searchParams.get('post_type') || 'post';
  const isPage = postType === 'page';
  let post = postId ? await db.getPost(postId).catch(() => null) : null;
  const categories = await db.getTerms('category').catch(() => []);
  const tags = await db.getTerms('post_tag').catch(() => []);

  const title = post ? (post.post_title || '') : '';
  const postContent = post ? (post.post_content || '') : '';
  const postStatus = post ? (post.post_status || 'draft') : 'draft';
  const slug = post ? (post.post_name || '') : '';

  const content = `
    <div class="page-header">
      <h2 class="page-title">${postId ? '게시글 편집' : '새 글 쓰기'}</h2>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-secondary" onclick="saveDraft()">임시저장</button>
        <button class="btn btn-primary" onclick="publishPost()">발행</button>
      </div>
    </div>
    <div id="save-result"></div>
    <div class="editor-wrap">
      <div class="editor-main">
        <div class="card">
          <div class="card-body">
            <input type="text" id="post-title" class="form-input" placeholder="제목을 입력하세요..." value="${esc(title)}"
              style="font-size:22px;font-weight:700;border:none;background:transparent;padding:8px 0;margin-bottom:12px;">
            <div id="post-slug-wrap" style="font-size:12px;color:#8c8f94;margin-bottom:12px;">
              고유주소: <span id="slug-preview" style="color:#2271b1;">${esc(slug)}</span>
            </div>
            <div class="wp-editor-wrap">
              <div class="wp-editor-toolbar">
                <button onclick="fmt('bold')" title="굵게"><b>B</b></button>
                <button onclick="fmt('italic')" title="기울임"><i>I</i></button>
                <button onclick="fmt('underline')" title="밑줄"><u>U</u></button>
                <button onclick="fmt('strikeThrough')" title="취소선"><s>S</s></button>
                <button onclick="fmtBlock('h2')" title="제목2">H2</button>
                <button onclick="fmtBlock('h3')" title="제목3">H3</button>
                <button onclick="fmt('insertUnorderedList')" title="목록">≡</button>
                <button onclick="fmt('insertOrderedList')" title="번호목록">1.</button>
                <button onclick="insertLink()" title="링크">🔗</button>
                <button onclick="insertImage()" title="이미지">🖼</button>
                <button onclick="fmt('removeFormat')" title="서식 제거">✕</button>
              </div>
              <div id="editor" class="wp-editor-content" contenteditable="true"
                data-placeholder="내용을 입력하세요...">${postContent}</div>
            </div>
          </div>
        </div>
      </div>
      <div class="editor-sidebar">
        <div class="card">
          <div class="card-header">발행</div>
          <div class="card-body">
            <div class="form-group">
              <label class="form-label">상태</label>
              <select id="post-status" class="form-select">
                <option value="draft"${postStatus === 'draft' ? ' selected' : ''}>임시저장</option>
                <option value="publish"${postStatus === 'publish' ? ' selected' : ''}>발행됨</option>
                <option value="pending"${postStatus === 'pending' ? ' selected' : ''}>검토 대기</option>
                <option value="private"${postStatus === 'private' ? ' selected' : ''}>비공개</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">발행일</label>
              <input type="datetime-local" id="post-date" class="form-input"
                value="${post?.post_date ? post.post_date.replace(' ', 'T').slice(0, 16) : ''}">
            </div>
            <div style="display:flex;gap:8px;margin-top:8px;">
              <button class="btn btn-secondary" style="flex:1" onclick="saveDraft()">임시저장</button>
              <button class="btn btn-primary" style="flex:1" onclick="publishPost()">발행</button>
            </div>
            ${postId ? `<div style="margin-top:10px;">
              <button class="btn btn-danger btn-sm" onclick="deleteThisPost()">삭제</button>
            </div>` : ''}
          </div>
        </div>
        ${!isPage ? `<div class="card">
          <div class="card-header">카테고리</div>
          <div class="card-body">
            ${categories.map(cat => `
              <label style="display:flex;align-items:center;gap:8px;margin-bottom:8px;font-size:13px;cursor:pointer;">
                <input type="checkbox" class="cat-check" value="${cat.term_id}">
                ${esc(cat.name)}
              </label>`).join('') || '<p style="font-size:13px;color:#8c8f94;">카테고리가 없습니다.</p>'}
          </div>
        </div>
        <div class="card">
          <div class="card-header">태그</div>
          <div class="card-body">
            <input type="text" id="tags-input" class="form-input" placeholder="태그 입력 후 Enter" style="margin-bottom:8px;">
            <div id="tags-list" style="display:flex;flex-wrap:wrap;gap:6px;"></div>
          </div>
        </div>` : ''}
        <div class="card">
          <div class="card-header">발췌문</div>
          <div class="card-body">
            <textarea id="post-excerpt" class="form-textarea" style="min-height:80px;" placeholder="발췌문 (없으면 자동 생성)">${esc(post?.post_excerpt || '')}</textarea>
          </div>
        </div>
      </div>
    </div>
    <script>
    const POST_ID = ${postId || 'null'};
    const POST_TYPE = '${postType}';
    const tags = new Set();

    function fmt(cmd) { document.execCommand(cmd, false); document.getElementById('editor').focus(); }
    function fmtBlock(tag) { document.execCommand('formatBlock', false, '<' + tag + '>'); document.getElementById('editor').focus(); }
    function insertLink() {
      const url = prompt('URL을 입력하세요:');
      if (url) { document.execCommand('createLink', false, url); document.getElementById('editor').focus(); }
    }
    function insertImage() {
      const url = prompt('이미지 URL을 입력하세요:');
      if (url) { document.execCommand('insertImage', false, url); document.getElementById('editor').focus(); }
    }

    // Slug from title
    const titleEl = document.getElementById('post-title');
    const slugPrev = document.getElementById('slug-preview');
    if (titleEl && slugPrev && !POST_ID) {
      titleEl.addEventListener('input', () => {
        const slug = titleEl.value.toLowerCase().replace(/[^a-z0-9가-힣]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
        slugPrev.textContent = slug || '(제목에서 자동 생성)';
      });
    }

    // Tags
    const tagsInput = document.getElementById('tags-input');
    if (tagsInput) {
      tagsInput.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ',') {
          e.preventDefault();
          const v = tagsInput.value.trim().replace(/,$/, '');
          if (v && !tags.has(v)) {
            tags.add(v);
            renderTags();
            tagsInput.value = '';
          }
        }
      });
    }
    function renderTags() {
      const el = document.getElementById('tags-list');
      if (!el) return;
      el.innerHTML = [...tags].map(t =>
        '<span style="background:rgba(34,113,177,.2);color:#60a5fa;padding:3px 8px;border-radius:20px;font-size:12px;display:flex;align-items:center;gap:4px;">' +
        t + '<button onclick="removeTag(\'' + t + '\')" style="background:none;border:none;color:#60a5fa;cursor:pointer;padding:0;line-height:1;">×</button></span>'
      ).join('');
    }
    function removeTag(t) { tags.delete(t); renderTags(); }

    async function savePost(status) {
      const title = document.getElementById('post-title').value;
      const content = document.getElementById('editor').innerHTML;
      const excerpt = document.getElementById('post-excerpt')?.value || '';
      const dateEl = document.getElementById('post-date');
      const postDate = dateEl?.value ? dateEl.value.replace('T', ' ') + ':00' : undefined;
      const cats = [...document.querySelectorAll('.cat-check:checked')].map(el => parseInt(el.value));

      const body = { title, content, status, post_type: POST_TYPE, excerpt, tags: [...tags], categories: cats };
      if (postDate) body.date = postDate;

      const res = await fetch(POST_ID ? '/api/posts/' + POST_ID : '/api/posts', {
        method: POST_ID ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(body)
      });
      const d = await res.json();
      if (d.success || d.id || d.ID) {
        toast(status === 'publish' ? '발행되었습니다.' : '저장되었습니다.');
        if (!POST_ID && (d.id || d.ID)) {
          setTimeout(() => location.href = '/admin/${isPage ? 'pages' : 'posts'}/' + (d.id || d.ID) + '/edit', 1000);
        }
      } else { toast(d.error || '저장 실패', 'error'); }
    }

    function saveDraft() { savePost('draft'); }
    function publishPost() {
      const sel = document.getElementById('post-status');
      savePost(sel ? sel.value : 'publish');
    }
    async function deleteThisPost() {
      if (!confirmDelete('이 게시글을 삭제하시겠습니까?')) return;
      const r = await fetch('/api/posts/' + POST_ID, { method: 'DELETE', headers: authHeaders() });
      const d = await r.json();
      if (d.success) { toast('삭제되었습니다.'); setTimeout(() => location.href = '/admin/${isPage ? 'pages' : 'posts'}', 1000); }
      else toast(d.error || '삭제 실패', 'error');
    }
    function authHeaders() {
      const tok = getCookie('cp_cms_session');
      return tok ? { 'Authorization': 'Bearer ' + tok } : {};
    }
    function getCookie(n) { return document.cookie.match(new RegExp('(?:^|; )' + n + '=([^;]*)'))?.map(m => decodeURIComponent(m[1]))[1] || ''; }
    </script>`;

  return layout(postId ? '게시글 편집' : '새 글 쓰기', content, isPage ? 'pages' : 'posts', session);
}

// ── 미디어 ────────────────────────────────────────────────────────────────
async function renderMedia(db: ReturnType<typeof createDB>, session: SessionData, url: URL): Promise<string> {
  const page = parseInt(url.searchParams.get('paged') || '1');
  const perPage = 24;
  const media = await db.getPosts({
    post_type: 'attachment', post_status: 'inherit' as any,
    posts_per_page: perPage, offset: (page - 1) * perPage
  }).catch(() => []);
  const total = await db.countPosts('attachment', 'inherit');
  const siteUrl = await db.getOption('siteurl', '');

  const grid = media.length
    ? `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:12px;">
        ${media.map(m => {
          const ext = (m.post_mime_type || '').split('/')[0];
          const isImg = ext === 'image';
          const src = `${siteUrl}/wp-content/uploads/${m.post_name || m.guid}`;
          return `<div style="background:#23282d;border:1px solid #3c434a;border-radius:6px;overflow:hidden;cursor:pointer;" onclick="showMedia(${m.ID}, '${esc(m.post_title || '')}', '${src}')">
            ${isImg
              ? `<img src="${src}" alt="${esc(m.post_title || '')}" style="width:100%;height:110px;object-fit:cover;" onerror="this.style.display='none'">`
              : `<div style="height:110px;display:flex;align-items:center;justify-content:center;font-size:32px;">${ext === 'video' ? '🎥' : ext === 'audio' ? '🎵' : '📄'}</div>`
            }
            <div style="padding:8px;font-size:11px;color:#8c8f94;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(m.post_title || m.post_name || '')}</div>
          </div>`;
        }).join('')}
      </div>`
    : '<div class="empty-state"><div class="icon">🖼️</div><p>미디어 파일이 없습니다.</p></div>';

  const content = `
    <div class="page-header">
      <h2 class="page-title">미디어 라이브러리</h2>
      <button class="btn btn-primary" onclick="document.getElementById('upload-form').style.display='block'">+ 파일 추가</button>
    </div>
    <div id="upload-form" style="display:none;" class="card">
      <div class="card-header">파일 업로드</div>
      <div class="card-body">
        <div id="drop-zone" style="border:2px dashed #3c434a;border-radius:8px;padding:40px;text-align:center;cursor:pointer;transition:border .2s;"
          ondragover="event.preventDefault();this.style.borderColor='#2271b1'"
          ondragleave="this.style.borderColor='#3c434a'"
          ondrop="handleDrop(event)" onclick="document.getElementById('file-input').click()">
          <div style="font-size:32px;margin-bottom:8px;">📤</div>
          <p style="color:#8c8f94;font-size:14px;">파일을 드래그하거나 클릭하여 업로드</p>
        </div>
        <input type="file" id="file-input" multiple style="display:none" onchange="uploadFiles(this.files)">
        <div id="upload-progress" style="margin-top:12px;"></div>
      </div>
    </div>
    ${grid}
    <div id="media-modal" class="modal-overlay">
      <div class="modal">
        <div class="modal-header"><span id="modal-title">미디어</span><button class="close-btn" onclick="closeModal()">×</button></div>
        <div class="modal-body" id="modal-body"></div>
        <div class="modal-footer">
          <button class="btn btn-danger btn-sm" onclick="deleteMedia(currentMediaId)">삭제</button>
          <button class="btn btn-secondary" onclick="closeModal()">닫기</button>
        </div>
      </div>
    </div>
    <script>
    let currentMediaId = null;
    function showMedia(id, title, url) {
      currentMediaId = id;
      document.getElementById('modal-title').textContent = title || 'Media';
      const isImg = /\\.(jpg|jpeg|png|gif|webp|svg)$/i.test(url);
      document.getElementById('modal-body').innerHTML = isImg
        ? '<img src="' + url + '" style="max-width:100%;border-radius:4px;margin-bottom:12px;">'
          + '<p style="font-size:13px;color:#8c8f94;">URL: <input class="form-input" value="' + url + '" readonly onclick="this.select()" style="margin-top:6px;"></p>'
        : '<p style="font-size:14px;">' + title + '</p><p style="font-size:13px;color:#8c8f94;margin-top:6px;"><a href="' + url + '" style="color:#2271b1;" target="_blank">파일 열기</a></p>';
      document.getElementById('media-modal').classList.add('open');
    }
    function closeModal() { document.getElementById('media-modal').classList.remove('open'); }
    async function deleteMedia(id) {
      if (!id || !confirmDelete('이 미디어를 삭제하시겠습니까?')) return;
      const r = await fetch('/api/posts/' + id, { method: 'DELETE', headers: authHeaders() });
      const d = await r.json();
      if (d.success) { toast('삭제되었습니다.'); closeModal(); location.reload(); }
      else toast(d.error || '삭제 실패', 'error');
    }
    async function uploadFiles(files) {
      const prog = document.getElementById('upload-progress');
      for (const file of files) {
        prog.innerHTML = '<div class="alert alert-info">업로드 중: ' + file.name + '</div>';
        const fd = new FormData();
        fd.append('file', file);
        const r = await fetch('/api/media/upload', { method: 'POST', headers: authHeaders(), body: fd });
        const d = await r.json();
        if (d.success || d.url) { toast(file.name + ' 업로드 완료'); }
        else { toast(file.name + ' 업로드 실패: ' + (d.error || ''), 'error'); }
      }
      prog.innerHTML = '';
      location.reload();
    }
    function handleDrop(e) {
      e.preventDefault();
      document.getElementById('drop-zone').style.borderColor = '#3c434a';
      uploadFiles(e.dataTransfer.files);
    }
    function authHeaders() {
      const tok = getCookie('cp_cms_session');
      return tok ? { 'Authorization': 'Bearer ' + tok } : {};
    }
    function getCookie(n) { return document.cookie.match(new RegExp('(?:^|; )' + n + '=([^;]*)'))?.map(m => decodeURIComponent(m[1]))[1] || ''; }
    </script>`;
  return layout('미디어 라이브러리', content, 'media', session);
}

// ── 설정 ──────────────────────────────────────────────────────────────────
async function renderSettings(db: ReturnType<typeof createDB>, session: SessionData): Promise<string> {
  const opts: Record<string, string> = {};
  const keys = ['blogname', 'blogdescription', 'siteurl', 'home', 'admin_email',
    'posts_per_page', 'timezone_string', 'date_format', 'WPLANG',
    'users_can_register', 'blog_public', 'default_comment_status'];
  for (const k of keys) opts[k] = await db.getOption(k, '').catch(() => '');

  const content = `
    <div class="page-header"><h2 class="page-title">설정</h2></div>
    <div id="save-result"></div>
    <div class="tabs">
      <a href="#general" class="tab active" onclick="showTab('general',this)">일반</a>
      <a href="#reading" class="tab" onclick="showTab('reading',this)">읽기</a>
      <a href="#discussion" class="tab" onclick="showTab('discussion',this)">토론</a>
      <a href="#cloudpress" class="tab" onclick="showTab('cloudpress',this)">CloudPress 연동</a>
    </div>
    <!-- 일반 -->
    <div id="tab-general" class="tab-content">
    <form onsubmit="saveSettings(event,'general')">
      <div class="card"><div class="card-header">일반 설정</div><div class="card-body">
        <div class="form-group"><label class="form-label">사이트 이름</label>
          <input name="blogname" class="form-input" value="${esc(opts.blogname)}"></div>
        <div class="form-group"><label class="form-label">태그라인 (설명)</label>
          <input name="blogdescription" class="form-input" value="${esc(opts.blogdescription)}"></div>
        <div class="form-group"><label class="form-label">사이트 URL</label>
          <input name="siteurl" class="form-input" value="${esc(opts.siteurl)}"></div>
        <div class="form-group"><label class="form-label">홈 URL</label>
          <input name="home" class="form-input" value="${esc(opts.home)}"></div>
        <div class="form-group"><label class="form-label">관리자 이메일</label>
          <input name="admin_email" type="email" class="form-input" value="${esc(opts.admin_email)}"></div>
        <div class="form-group"><label class="form-label">언어</label>
          <select name="WPLANG" class="form-select">
            <option value="ko_KR"${opts.WPLANG === 'ko_KR' ? ' selected' : ''}>한국어</option>
            <option value=""${!opts.WPLANG ? ' selected' : ''}>English</option>
            <option value="ja"${opts.WPLANG === 'ja' ? ' selected' : ''}>日本語</option>
          </select></div>
        <div class="form-group"><label class="form-label">시간대</label>
          <input name="timezone_string" class="form-input" value="${esc(opts.timezone_string || 'Asia/Seoul')}"></div>
      </div></div>
      <button type="submit" class="btn btn-primary">설정 저장</button>
    </form>
    </div>
    <!-- 읽기 -->
    <div id="tab-reading" class="tab-content" style="display:none">
    <form onsubmit="saveSettings(event,'reading')">
      <div class="card"><div class="card-header">읽기 설정</div><div class="card-body">
        <div class="form-group"><label class="form-label">페이지당 게시글 수</label>
          <input name="posts_per_page" type="number" class="form-input" value="${esc(opts.posts_per_page || '10')}" style="max-width:100px;"></div>
        <div class="form-group"><label class="form-label">검색엔진 공개</label>
          <select name="blog_public" class="form-select" style="max-width:240px;">
            <option value="1"${opts.blog_public !== '0' ? ' selected' : ''}>공개</option>
            <option value="0"${opts.blog_public === '0' ? ' selected' : ''}>비공개</option>
          </select></div>
      </div></div>
      <button type="submit" class="btn btn-primary">설정 저장</button>
    </form>
    </div>
    <!-- 토론 -->
    <div id="tab-discussion" class="tab-content" style="display:none">
    <form onsubmit="saveSettings(event,'discussion')">
      <div class="card"><div class="card-header">토론 설정</div><div class="card-body">
        <div class="form-group"><label class="form-label">댓글 허용</label>
          <select name="default_comment_status" class="form-select" style="max-width:200px;">
            <option value="open"${opts.default_comment_status === 'open' ? ' selected' : ''}>허용</option>
            <option value="closed"${opts.default_comment_status !== 'open' ? ' selected' : ''}>비허용</option>
          </select></div>
      </div></div>
      <button type="submit" class="btn btn-primary">설정 저장</button>
    </form>
    </div>
    <!-- CloudPress 연동 -->
    <div id="tab-cloudpress" class="tab-content" style="display:none">
    <div class="card"><div class="card-header">CloudPress 플랫폼 정보</div><div class="card-body">
      <div id="cp-info"><div class="spinner"></div></div>
    </div></div>
    </div>

    <script>
    function showTab(name, el) {
      document.querySelectorAll('.tab-content').forEach(t => t.style.display = 'none');
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.getElementById('tab-' + name).style.display = 'block';
      el.classList.add('active');
      if (name === 'cloudpress') loadCPInfo();
      return false;
    }
    async function saveSettings(e, tab) {
      e.preventDefault();
      const fd = new FormData(e.target);
      const body = Object.fromEntries(fd.entries());
      const r = await fetch('/api/options/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(body)
      });
      const d = await r.json();
      if (d.saved || d.success) toast('설정이 저장되었습니다.');
      else toast(d.error || '저장 실패', 'error');
    }
    async function loadCPInfo() {
      const el = document.getElementById('cp-info');
      try {
        const r = await fetch('/api/cloudpress/site-info');
        const d = await r.json();
        el.innerHTML = '<table class="table"><tbody>'
          + '<tr><th>사이트 URL</th><td>' + (d.siteUrl || '-') + '</td></tr>'
          + '<tr><th>사이트 이름</th><td>' + (d.siteName || '-') + '</td></tr>'
          + '<tr><th>활성 테마</th><td>' + (d.activeTheme || '-') + '</td></tr>'
          + '<tr><th>호스트</th><td>' + (d.host || '-') + '</td></tr>'
          + '</tbody></table>';
      } catch { el.innerHTML = '<p style="color:#8c8f94;">정보를 불러올 수 없습니다.</p>'; }
    }
    function authHeaders() {
      const tok = getCookie('cp_cms_session');
      return tok ? { 'Authorization': 'Bearer ' + tok } : {};
    }
    function getCookie(n) { return document.cookie.match(new RegExp('(?:^|; )' + n + '=([^;]*)'))?.map(m => decodeURIComponent(m[1]))[1] || ''; }
    </script>`;
  return layout('설정', content, 'settings', session);
}

// ── 사용자 목록 ───────────────────────────────────────────────────────────
async function renderUsers(db: ReturnType<typeof createDB>, session: SessionData): Promise<string> {
  const users = await db.getAllUsers().catch(() => []);

  const rows = users.length
    ? users.map((u: any) => `
      <tr>
        <td style="font-weight:600;color:#c3c4c7;">${esc(u.display_name || u.user_login)}</td>
        <td style="color:#8c8f94;">${esc(u.user_login)}</td>
        <td style="color:#8c8f94;">${esc(u.user_email)}</td>
        <td><span class="badge badge-publish">${esc(u.user_role || 'subscriber')}</span></td>
        <td style="color:#8c8f94;font-size:12px;">${u.user_registered ? new Date(u.user_registered).toLocaleDateString('ko-KR') : '-'}</td>
        <td>
          <a href="/admin/users/${u.ID}/edit" class="btn btn-sm btn-secondary">편집</a>
          ${u.ID !== session.userId ? `<button class="btn btn-sm btn-danger" onclick="deleteUser(${u.ID})">삭제</button>` : ''}
        </td>
      </tr>`).join('')
    : '<tr><td colspan="6" class="empty-state">사용자가 없습니다.</td></tr>';

  const content = `
    <div class="page-header">
      <h2 class="page-title">사용자</h2>
      <button class="btn btn-primary" onclick="document.getElementById('new-user-modal').classList.add('open')">+ 새 사용자 추가</button>
    </div>
    <div class="card">
      <table class="table">
        <thead><tr><th>이름</th><th>사용자명</th><th>이메일</th><th>역할</th><th>가입일</th><th>작업</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div id="new-user-modal" class="modal-overlay">
      <div class="modal">
        <div class="modal-header">새 사용자 추가<button class="close-btn" onclick="this.closest('.modal-overlay').classList.remove('open')">×</button></div>
        <div class="modal-body">
          <div class="form-group"><label class="form-label">사용자명</label><input id="nu-login" class="form-input" required></div>
          <div class="form-group"><label class="form-label">이메일</label><input id="nu-email" type="email" class="form-input" required></div>
          <div class="form-group"><label class="form-label">표시이름</label><input id="nu-name" class="form-input"></div>
          <div class="form-group"><label class="form-label">비밀번호</label><input id="nu-pass" type="password" class="form-input" required></div>
          <div class="form-group"><label class="form-label">역할</label>
            <select id="nu-role" class="form-select">
              <option value="subscriber">구독자</option>
              <option value="author">작성자</option>
              <option value="editor">편집자</option>
              <option value="administrator">관리자</option>
            </select></div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').classList.remove('open')">취소</button>
          <button class="btn btn-primary" onclick="createUser()">추가</button>
        </div>
      </div>
    </div>
    <script>
    async function createUser() {
      const body = {
        username: document.getElementById('nu-login').value,
        email: document.getElementById('nu-email').value,
        display_name: document.getElementById('nu-name').value,
        password: document.getElementById('nu-pass').value,
        role: document.getElementById('nu-role').value,
      };
      const r = await fetch('/api/users/create', { method: 'POST', headers: {'Content-Type':'application/json', ...authHeaders()}, body: JSON.stringify(body) });
      const d = await r.json();
      if (d.success || d.id) { toast('사용자가 추가되었습니다.'); location.reload(); }
      else toast(d.error || '추가 실패', 'error');
    }
    async function deleteUser(id) {
      if (!confirmDelete('이 사용자를 삭제하시겠습니까?')) return;
      const r = await fetch('/api/users/' + id + '/update', {
        method: 'POST', headers: {'Content-Type':'application/json', ...authHeaders()},
        body: JSON.stringify({ action: 'delete' })
      });
      const d = await r.json();
      if (d.success) { toast('삭제되었습니다.'); location.reload(); }
      else toast(d.error || '삭제 실패', 'error');
    }
    function authHeaders() {
      const tok = getCookie('cp_cms_session');
      return tok ? { 'Authorization': 'Bearer ' + tok } : {};
    }
    function getCookie(n) { return document.cookie.match(new RegExp('(?:^|; )' + n + '=([^;]*)'))?.map(m => decodeURIComponent(m[1]))[1] || ''; }
    </script>`;
  return layout('사용자', content, 'users', session);
}

// ── 유틸 ──────────────────────────────────────────────────────────────────
function esc(s: string | null | undefined): string {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c));
}

function statusLabel(s: string): string {
  const map: Record<string, string> = { publish: '발행됨', draft: '임시저장', pending: '검토 대기', private: '비공개', future: '예약됨', trash: '휴지통', inherit: '첨부' };
  return map[s] || s;
}

// ── 메인 핸들러 ───────────────────────────────────────────────────────────
export async function handleClouPressAdmin(request: IRequest, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method.toUpperCase();

  // ── 인증 API ──────────────────────────────────────────────────────────
  if (path === '/admin/auth/login') {
    if (method === 'GET') return new Response(renderLoginPage(), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    if (method === 'POST') {
      const db = createDB(env);
      let username = '', password = '';
      const ct = request.headers.get('Content-Type') || '';
      if (ct.includes('application/json')) {
        const body = await request.json().catch(() => ({})) as Record<string, string>;
        username = body.username || body.log || '';
        password = body.password || body.pwd || '';
      } else {
        const fd = await request.formData().catch(() => new FormData());
        username = String(fd.get('username') || fd.get('log') || '');
        password = String(fd.get('password') || fd.get('pwd') || '');
      }
      const user = await db.getUserByLogin(username) || await db.getUserByEmail(username);
      if (!user) {
        if (ct.includes('application/json')) return json({ success: false, error: '사용자를 찾을 수 없습니다.' }, 401);
        return new Response(renderLoginPage('사용자를 찾을 수 없습니다.'), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      }
      const valid = await checkPassword(password, user.user_pass);
      if (!valid) {
        if (ct.includes('application/json')) return json({ success: false, error: '비밀번호가 올바르지 않습니다.' }, 401);
        return new Response(renderLoginPage('비밀번호가 올바르지 않습니다.'), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      }
      const capsMeta = await db.getUserMeta(user.ID, 'wp_capabilities').catch(() => '{}');
      let roles = ['subscriber'];
      try { const caps = JSON.parse(capsMeta); roles = Object.keys(caps).filter(k => caps[k]); } catch {}
      const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
      const session: SessionData = { userId: user.ID, userLogin: user.user_login, userEmail: user.user_email, roles, capabilities: {}, expires: Date.now() + 14 * 24 * 60 * 60 * 1000 };
      await env.SESSIONS.put(`cms:${token}`, JSON.stringify(session), { expirationTtl: 14 * 24 * 60 * 60 });
      const cookie = `cp_cms_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${14 * 24 * 60 * 60}`;
      if (ct.includes('application/json')) return json({ success: true, token });
      return new Response(null, { status: 302, headers: { 'Location': '/admin', 'Set-Cookie': cookie } });
    }
  }

  if (path === '/admin/auth/logout') {
    const token = getSessionToken(request);
    if (token) await env.SESSIONS.delete(`cms:${token}`).catch(() => {});
    return new Response(null, { status: 302, headers: { 'Location': '/admin/auth/login', 'Set-Cookie': 'cp_cms_session=; Path=/; Max-Age=0' } });
  }

  // ── 인증 필요 라우트 ──────────────────────────────────────────────────
  const session = await getSession(request, env);
  if (!session) {
    return new Response(null, { status: 302, headers: { 'Location': '/admin/auth/login' } });
  }

  const db = createDB(env);

  // ── 라우팅 ────────────────────────────────────────────────────────────
  if (path === '/admin' || path === '/admin/') {
    return html(await renderDashboard(db, env, session));
  }

  if (path === '/admin/posts') {
    return html(await renderPosts(db, session, url));
  }

  if (path === '/admin/pages') {
    url.searchParams.set('post_type', 'page');
    return html(await renderPosts(db, session, url));
  }

  const postEditMatch = path.match(/^\/admin\/(posts|pages)\/(\d+)\/edit$/);
  if (postEditMatch) {
    const postType = postEditMatch[1] === 'pages' ? 'page' : 'post';
    url.searchParams.set('post_type', postType);
    return html(await renderPostEditor(db, session, parseInt(postEditMatch[2]), url));
  }

  const newPostMatch = path.match(/^\/admin\/(posts|pages)\/new$/);
  if (newPostMatch) {
    const postType = newPostMatch[1] === 'pages' ? 'page' : 'post';
    url.searchParams.set('post_type', postType);
    return html(await renderPostEditor(db, session, null, url));
  }

  if (path === '/admin/media') {
    return html(await renderMedia(db, session, url));
  }

  if (path === '/admin/settings') {
    return html(await renderSettings(db, session));
  }

  if (path === '/admin/users') {
    return html(await renderUsers(db, session));
  }

  // 기타 페이지 (comments, categories, tags, themes, plugins, tools)
  if (path === '/admin/comments') {
    const comments = await env.DB.prepare(
      "SELECT c.*, p.post_title FROM wp_comments c LEFT JOIN wp_posts p ON c.comment_post_ID = p.ID ORDER BY c.comment_date DESC LIMIT 50"
    ).all<any>().then(r => r.results).catch(() => []);
    const rows = comments.length
      ? comments.map((c: any) => `<tr>
          <td><a href="#" style="color:#2271b1;font-weight:600;text-decoration:none;">${esc(c.comment_author)}</a><br><small style="color:#8c8f94;">${esc(c.comment_author_email)}</small></td>
          <td style="font-size:13px;max-width:300px;">${esc(c.comment_content)}</td>
          <td><a href="/admin/posts/${c.comment_post_ID}/edit" style="color:#8c8f94;font-size:12px;text-decoration:none;">${esc(c.post_title || '#' + c.comment_post_ID)}</a></td>
          <td><span class="badge ${c.comment_approved === '1' ? 'badge-publish' : 'badge-pending'}">${c.comment_approved === '1' ? '승인' : '대기'}</span></td>
          <td style="color:#8c8f94;font-size:12px;">${new Date(c.comment_date).toLocaleDateString('ko-KR')}</td>
        </tr>`).join('')
      : '<tr><td colspan="5" class="empty-state">댓글이 없습니다.</td></tr>';

    const content = `<div class="page-header"><h2 class="page-title">댓글</h2></div>
      <div class="card"><table class="table"><thead><tr><th>작성자</th><th>내용</th><th>게시글</th><th>상태</th><th>날짜</th></tr></thead>
      <tbody>${rows}</tbody></table></div>`;
    return html(layout('댓글', content, 'comments', session));
  }

  // 404 for unknown /admin/* routes
  return html(layout('페이지 없음', '<div class="empty-state"><div class="icon">🔍</div><p>요청한 페이지를 찾을 수 없습니다.</p><a href="/admin" class="btn btn-primary" style="margin-top:16px;">대시보드로 돌아가기</a></div>', 'dashboard', session));
}

function html(body: string): Response {
  return new Response(body, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
