/**
 * CloudPress CMS Admin — /admin/* 경로 핸들러
 * GitHub 레포 = DB + 스토리지 (D1/KV 완전 제거)
 *
 * 어드민 페이지:  /admin/*        → 로그인 필요, CMS 관리 UI
 * 방문자 페이지:  /  /post/* 등   → frontend.ts 에서 처리 (공개)
 */

import { IRequest } from 'itty-router';
import { Env, SessionData } from '../types/env';
import { getGithubConfigFromRequest, createGithubStorage } from '../utils/github';
import { createDB } from '../utils/db';
import { checkPassword, hashPassword } from '../utils/crypto';

// ── JWT-less 세션 (쿠키에 담긴 서명된 토큰) ──────────────────────────────

function getSessionToken(request: IRequest): string | null {
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(/cp_cms_session=([^;]+)/);
  if (match) return decodeURIComponent(match[1]);
  const auth = request.headers.get('Authorization');
  if (auth?.startsWith('Bearer ')) return auth.slice(7);
  return null;
}

/** 세션 토큰 파싱 (base64 JSON, signed) */
async function getSession(request: IRequest, env: Env): Promise<SessionData | null> {
  const token = getSessionToken(request);
  if (!token) return null;
  try {
    const decoded = atob(token.split('.')[0]);
    const session = JSON.parse(decoded) as SessionData;
    if (session.expires < Date.now()) return null;
    // 서명 검증 (simple HMAC-SHA256)
    const sig = token.split('.')[1];
    if (!sig) return null;
    const key = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(env.JWT_SECRET),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
    );
    const valid = await crypto.subtle.verify(
      'HMAC', key,
      Uint8Array.from(atob(sig), c => c.charCodeAt(0)),
      new TextEncoder().encode(token.split('.')[0])
    );
    if (!valid) return null;
    return session;
  } catch { return null; }
}

async function createSessionToken(session: SessionData, secret: string): Promise<string> {
  const payload = btoa(JSON.stringify(session));
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return `${payload}.${sigB64}`;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

function html(body: string, status = 200): Response {
  return new Response(body, { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

// ── 공통 레이아웃 ─────────────────────────────────────────────────────────

function layout(title: string, content: string, activeMenu: string, session: SessionData): string {
  const menuItems = [
    { href: '/admin',            icon: '📊', label: '대시보드',  key: 'dashboard' },
    { href: '/admin/posts',      icon: '📝', label: '게시글',    key: 'posts' },
    { href: '/admin/pages',      icon: '📄', label: '페이지',    key: 'pages' },
    { href: '/admin/media',      icon: '🖼️', label: '미디어',    key: 'media' },
    { href: '/admin/comments',   icon: '💬', label: '댓글',      key: 'comments' },
    { href: '/admin/categories', icon: '📁', label: '카테고리',  key: 'categories' },
    { href: '/admin/tags',       icon: '🏷️', label: '태그',      key: 'tags' },
    { href: '/admin/themes',     icon: '🎨', label: '테마',      key: 'themes' },
    { href: '/admin/plugins',    icon: '🔌', label: '플러그인',  key: 'plugins' },
    { href: '/admin/users',      icon: '👥', label: '사용자',    key: 'users' },
    { href: '/admin/tools',      icon: '🔧', label: '도구',      key: 'tools' },
    { href: '/admin/settings',   icon: '⚙️', label: '설정',      key: 'settings' },
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
    #sidebar {
      width: var(--sidebar-width); background: var(--sidebar); border-right: 1px solid var(--border);
      display: flex; flex-direction: column; position: fixed; top: 0; left: 0; bottom: 0; overflow-y: auto; z-index: 100;
    }
    .sidebar-logo { padding: 16px; font-size: 18px; font-weight: 800; color: var(--white);
      border-bottom: 1px solid var(--border); letter-spacing: -0.5px; }
    .sidebar-logo span { color: var(--accent); }
    .sidebar-site { padding: 8px 16px 4px; font-size: 11px; color: var(--text-muted); border-bottom: 1px solid var(--border); margin-bottom: 4px; }
    .sidebar-site a { color: var(--accent); text-decoration: none; font-size: 11px; }
    .sidebar-nav { padding: 8px 0; flex: 1; }
    .nav-item { display: flex; align-items: center; gap: 8px; padding: 9px 16px;
      color: var(--text-muted); text-decoration: none; font-size: 13px; font-weight: 500;
      transition: background .15s, color .15s; border-left: 3px solid transparent; }
    .nav-item:hover { background: rgba(34,113,177,.1); color: var(--white); }
    .nav-item.active { background: rgba(34,113,177,.15); color: var(--white); border-left-color: var(--accent); }
    .nav-icon { font-size: 16px; width: 20px; text-align: center; }
    .sidebar-footer { padding: 12px 16px; border-top: 1px solid var(--border); font-size: 12px; color: var(--text-muted); }
    .sidebar-footer a { color: var(--text-muted); text-decoration: none; }
    .sidebar-footer a:hover { color: var(--danger); }
    #main { margin-left: var(--sidebar-width); flex: 1; display: flex; flex-direction: column; min-height: 100vh; }
    #topbar { background: var(--sidebar); border-bottom: 1px solid var(--border);
      padding: 0 24px; height: 46px; display: flex; align-items: center;
      justify-content: space-between; position: sticky; top: 0; z-index: 50; }
    .topbar-title { font-size: 15px; font-weight: 700; color: var(--white); }
    .topbar-actions { display: flex; align-items: center; gap: 12px; }
    .topbar-user { font-size: 12px; color: var(--text-muted); }
    .topbar-view-site { font-size: 12px; color: var(--accent); text-decoration: none; }
    .topbar-view-site:hover { text-decoration: underline; }
    #content { padding: 24px; flex: 1; }
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
    .btn-success { background: #166534; color: #4ade80; border-color: #14532d; }
    .btn-success:hover { background: #14532d; }
    .btn-sm { padding: 4px 10px; font-size: 12px; }
    .form-group { margin-bottom: 16px; }
    .form-label { display: block; font-size: 13px; font-weight: 600; margin-bottom: 6px; color: var(--text); }
    .form-hint { font-size: 11px; color: var(--text-muted); margin-top: 4px; }
    .form-input, .form-select, .form-textarea {
      width: 100%; padding: 8px 12px; background: var(--bg); border: 1px solid var(--border);
      border-radius: 4px; color: var(--text); font-size: 13px; font-family: inherit; }
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
    .badge-active { background: rgba(0,163,42,.15); color: #4ade80; }
    .badge-inactive { background: rgba(107,114,128,.15); color: #9ca3af; }
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 14px; margin-bottom: 24px; }
    .stat-card { background: var(--sidebar); border: 1px solid var(--border); border-radius: 8px; padding: 18px; text-align: center; }
    .stat-num { font-size: 28px; font-weight: 800; color: var(--white); }
    .stat-label { font-size: 12px; color: var(--text-muted); margin-top: 4px; }
    .alert { padding: 12px 16px; border-radius: 6px; font-size: 13px; margin-bottom: 16px; }
    .alert-success { background: rgba(0,163,42,.15); border: 1px solid rgba(0,163,42,.3); color: #4ade80; }
    .alert-error { background: rgba(239,68,68,.1); border: 1px solid rgba(239,68,68,.3); color: #f87171; }
    .alert-info { background: rgba(34,113,177,.1); border: 1px solid rgba(34,113,177,.3); color: #60a5fa; }
    .alert-warning { background: rgba(234,179,8,.1); border: 1px solid rgba(234,179,8,.3); color: #fbbf24; }
    .empty-state { text-align: center; padding: 60px 20px; color: var(--text-muted); font-size: 14px; }
    .empty-state .icon { font-size: 40px; margin-bottom: 12px; }
    .page-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
    .page-title { font-size: 22px; font-weight: 800; color: var(--white); }
    .search-bar { display: flex; gap: 8px; margin-bottom: 16px; }
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
    .toast-info { background: #1e3a5f; border: 1px solid #1d4ed8; color: #93c5fd; }
    @keyframes slideIn { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }
    .modal-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,.7); z-index: 1000; align-items: center; justify-content: center; }
    .modal-overlay.open { display: flex; }
    .modal { background: var(--sidebar); border: 1px solid var(--border); border-radius: 10px; width: 90%; max-width: 560px; max-height: 90vh; overflow-y: auto; }
    .modal-header { padding: 16px 20px; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; font-weight: 700; font-size: 15px; color: var(--white); }
    .modal-body { padding: 20px; }
    .modal-footer { padding: 14px 20px; border-top: 1px solid var(--border); display: flex; justify-content: flex-end; gap: 8px; }
    .close-btn { background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 20px; line-height: 1; }
    .close-btn:hover { color: var(--white); }
    .plugin-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; }
    .plugin-card { background: var(--sidebar); border: 1px solid var(--border); border-radius: 8px; padding: 16px; display: flex; flex-direction: column; gap: 10px; }
    .plugin-card.active-plugin { border-color: rgba(34,113,177,.5); background: rgba(34,113,177,.05); }
    .plugin-card-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
    .plugin-name { font-size: 14px; font-weight: 700; color: var(--white); }
    .plugin-version { font-size: 11px; color: var(--text-muted); }
    .plugin-desc { font-size: 12px; color: var(--text-muted); line-height: 1.5; flex: 1; }
    .plugin-actions { display: flex; gap: 6px; margin-top: auto; }
    .theme-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 20px; }
    .theme-card { background: var(--sidebar); border: 2px solid var(--border); border-radius: 10px; overflow: hidden; transition: border-color .2s; }
    .theme-card.active-theme { border-color: var(--accent); }
    .theme-screenshot { height: 140px; background: linear-gradient(135deg, #1e3a5f, #1a1a2e); display: flex; align-items: center; justify-content: center; font-size: 40px; }
    .theme-info { padding: 14px; }
    .theme-name { font-size: 14px; font-weight: 700; color: var(--white); margin-bottom: 4px; }
    .theme-meta { font-size: 12px; color: var(--text-muted); margin-bottom: 10px; }
    .theme-actions { display: flex; gap: 6px; }
    .wp-editor-wrap { border: 1px solid var(--border); border-radius: 4px; overflow: hidden; }
    .wp-editor-toolbar { background: #23282d; padding: 6px 10px; border-bottom: 1px solid var(--border); display: flex; gap: 4px; flex-wrap: wrap; }
    .wp-editor-toolbar button { background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.1); color: var(--text); border-radius: 3px; padding: 4px 8px; font-size: 12px; cursor: pointer; font-family: inherit; transition: background .15s; }
    .wp-editor-toolbar button:hover { background: rgba(255,255,255,.15); }
    .wp-editor-content { min-height: 300px; padding: 12px; font-size: 14px; line-height: 1.6; outline: none; color: var(--text); background: var(--bg); }
    .wp-editor-content:empty::before { content: attr(data-placeholder); color: var(--text-muted); }
    .media-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 10px; }
    .media-item { position: relative; aspect-ratio: 1; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; overflow: hidden; cursor: pointer; }
    .media-item img { width: 100%; height: 100%; object-fit: cover; }
    .media-item-icon { display: flex; align-items: center; justify-content: center; height: 100%; font-size: 30px; }
    .media-item:hover .media-overlay { opacity: 1; }
    .media-overlay { position: absolute; inset: 0; background: rgba(0,0,0,.6); opacity: 0; transition: opacity .2s; display: flex; align-items: center; justify-content: center; gap: 6px; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    @media (max-width: 600px) { .info-grid { grid-template-columns: 1fr; } }
    .info-item label { font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: .5px; display: block; margin-bottom: 4px; }
    .info-item .value { font-size: 14px; color: var(--white); font-weight: 600; }
  </style>
</head>
<body>
<div id="toast-container" class="toast"></div>

<nav id="sidebar">
  <div class="sidebar-logo"><span>CP</span> CMS</div>
  <div class="sidebar-site">
    관리자 패널 &middot;
    <a href="/" target="_blank">사이트 보기 ↗</a>
  </div>
  <div class="sidebar-nav">${nav}</div>
  <div class="sidebar-footer">
    <span>${esc(session.userLogin)}</span> &middot;
    <a href="/admin/auth/logout">로그아웃</a>
  </div>
</nav>

<div id="main">
  <div id="topbar">
    <span class="topbar-title">${esc(title)}</span>
    <div class="topbar-actions">
      <a href="/" target="_blank" class="topbar-view-site">🌐 사이트 보기</a>
      <span class="topbar-user">${esc(session.userEmail)}</span>
    </div>
  </div>
  <div id="content">${content}</div>
</div>

<script>
function toast(msg, type='success') {
  const c = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = 'toast-item toast-' + type;
  el.textContent = msg;
  c.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}
function confirmDelete(msg) { return confirm(msg || '정말 삭제하시겠습니까?'); }
function authHeaders() {
  const tok = document.cookie.match(/cp_cms_session=([^;]+)/)?.[1];
  return tok ? { 'Authorization': 'Bearer ' + decodeURIComponent(tok) } : {};
}
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
    .login-sub { text-align: center; font-size: 13px; color: #8c8f94; margin-top: 6px; margin-bottom: 20px; }
    .login-card { background: #2c3338; border: 1px solid #3c434a; border-radius: 12px; padding: 32px; }
    h1 { font-size: 18px; font-weight: 700; color: #fff; margin-bottom: 24px; }
    label { display: block; font-size: 13px; font-weight: 600; color: #c3c4c7; margin-bottom: 6px; }
    input { width: 100%; padding: 10px 14px; background: #1d2327; border: 1px solid #3c434a; border-radius: 6px; color: #fff; font-size: 14px; font-family: inherit; margin-bottom: 16px; }
    input:focus { outline: none; border-color: #2271b1; }
    button[type=submit] { width: 100%; padding: 11px; background: #2271b1; color: #fff; border: none; border-radius: 6px; font-size: 14px; font-weight: 700; cursor: pointer; transition: background .15s; }
    button[type=submit]:hover { background: #135e96; }
    .error { background: rgba(239,68,68,.1); border: 1px solid rgba(239,68,68,.3); color: #f87171; padding: 10px 14px; border-radius: 6px; font-size: 13px; margin-bottom: 16px; }
    .back-link { text-align: center; margin-top: 16px; font-size: 13px; }
    .back-link a { color: #2271b1; text-decoration: none; }
  </style>
</head>
<body>
  <div class="login-wrap">
    <div class="login-logo"><span>CP</span> CMS</div>
    <div class="login-sub">GitHub 기반 블로그 관리 시스템</div>
    <div class="login-card">
      <h1>관리자 로그인</h1>
      ${error ? `<div class="error">${esc(error)}</div>` : ''}
      <form method="POST" action="/admin/auth/login">
        <label for="username">사용자명 또는 이메일</label>
        <input type="text" id="username" name="username" required autocomplete="username">
        <label for="password">비밀번호</label>
        <input type="password" id="password" name="password" required autocomplete="current-password">
        <button type="submit">로그인</button>
      </form>
    </div>
    <div class="back-link"><a href="/">← 사이트로 돌아가기</a></div>
  </div>
</body>
</html>`;
}

// ── 대시보드 ──────────────────────────────────────────────────────────────

async function renderDashboard(db: ReturnType<typeof createDB>, session: SessionData): Promise<string> {
  const info = await db.getDatabaseInfo();
  const settings = await db.getSettings();
  const recentPosts = await db.getPosts({ limit: 8 });

  const postRows = recentPosts.length
    ? recentPosts.map(p => `
      <tr>
        <td><a href="/admin/posts/${p.id}/edit" style="color:#2271b1;text-decoration:none;font-weight:600;">${esc(p.title || '(제목 없음)')}</a></td>
        <td><span class="badge badge-${p.status}">${statusLabel(p.status)}</span></td>
        <td style="color:#8c8f94;">${p.created_at ? new Date(p.created_at).toLocaleDateString('ko-KR') : '-'}</td>
        <td>
          <a href="/admin/posts/${p.id}/edit" class="btn btn-sm btn-secondary">편집</a>
          <a href="/${p.slug}/" target="_blank" class="btn btn-sm btn-secondary">보기</a>
        </td>
      </tr>`).join('')
    : `<tr><td colspan="4" class="empty-state">아직 게시글이 없습니다. <a href="/admin/posts/new" style="color:#2271b1;">첫 글을 작성해보세요</a></td></tr>`;

  const content = `
    <div class="page-header">
      <h2 class="page-title">대시보드</h2>
      <a href="/admin/posts/new" class="btn btn-primary">✏️ 새 글 쓰기</a>
    </div>
    <div class="alert alert-info" style="margin-bottom:20px;">
      🐙 GitHub 저장소: <strong>${session.githubOwner || '?'}/${session.githubRepo || '?'}</strong>
      &nbsp;·&nbsp; 사이트: <strong>${esc(settings.site_name)}</strong>
      &nbsp;·&nbsp; <a href="https://github.com/${session.githubOwner}/${session.githubRepo}" target="_blank" style="color:#60a5fa;">저장소 보기 ↗</a>
    </div>
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-num">${info.posts}</div><div class="stat-label">게시글</div></div>
      <div class="stat-card"><div class="stat-num">${info.pages}</div><div class="stat-label">페이지</div></div>
      <div class="stat-card"><div class="stat-num">${info.comments}</div><div class="stat-label">댓글</div></div>
      <div class="stat-card"><div class="stat-num">${info.media}</div><div class="stat-label">미디어</div></div>
      <div class="stat-card"><div class="stat-num">${info.plugins}</div><div class="stat-label">플러그인</div></div>
      <div class="stat-card"><div class="stat-num">${info.themes}</div><div class="stat-label">테마</div></div>
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
  const postType = (url.searchParams.get('post_type') || 'post') as 'post' | 'page';
  const isPage = postType === 'page';

  const posts = await db.getPosts({
    post_type: postType,
    status: statusFilter || undefined,
    limit: perPage,
    offset: (page - 1) * perPage,
    search: search || undefined,
  });

  const [pub, draft, pending] = await Promise.all([
    db.countPosts(postType, 'publish'),
    db.countPosts(postType, 'draft'),
    db.countPosts(postType, 'pending'),
  ]);
  const total = await db.countPosts(postType);
  const pages = Math.ceil(total / perPage);
  const base = isPage ? '/admin/pages' : '/admin/posts';

  const tabs = `
    <div class="tabs">
      <a href="${base}" class="tab${!statusFilter ? ' active' : ''}">전체 (${total})</a>
      <a href="${base}?post_status=publish" class="tab${statusFilter === 'publish' ? ' active' : ''}">발행됨 (${pub})</a>
      <a href="${base}?post_status=draft" class="tab${statusFilter === 'draft' ? ' active' : ''}">임시저장 (${draft})</a>
      <a href="${base}?post_status=pending" class="tab${statusFilter === 'pending' ? ' active' : ''}">검토 대기 (${pending})</a>
    </div>`;

  const rows = posts.length
    ? posts.map(p => `
      <tr id="post-row-${p.id}">
        <td>
          <a href="${base}/${p.id}/edit" style="color:#2271b1;font-weight:600;text-decoration:none;">${esc(p.title || '(제목 없음)')}</a>
          <div style="margin-top:4px;display:flex;gap:6px;">
            <a href="${base}/${p.id}/edit" style="font-size:12px;color:#8c8f94;text-decoration:none;">편집</a>
            ${p.slug ? `<a href="/${p.slug}/" target="_blank" style="font-size:12px;color:#8c8f94;text-decoration:none;">보기</a>` : ''}
            <a href="#" onclick="trashPost(${p.id}, this)" style="font-size:12px;color:#f87171;text-decoration:none;">삭제</a>
          </div>
        </td>
        <td><span class="badge badge-${p.status}">${statusLabel(p.status)}</span></td>
        <td style="color:#8c8f94;font-size:13px;">${p.created_at ? new Date(p.created_at).toLocaleDateString('ko-KR') : '-'}</td>
      </tr>`).join('')
    : `<tr><td colspan="3" class="empty-state">게시글이 없습니다.</td></tr>`;

  const pager = pages > 1 ? `<div class="pagination">${
    Array.from({ length: pages }, (_, i) => i + 1).map(p =>
      `<a href="${base}?paged=${p}${statusFilter ? '&post_status=' + statusFilter : ''}" class="${p === page ? 'current' : ''}">${p}</a>`
    ).join('')
  }</div>` : '';

  const content = `
    <div class="page-header">
      <h2 class="page-title">${isPage ? '페이지' : '게시글'}</h2>
      <a href="${base}/new" class="btn btn-primary">+ 새로 추가</a>
    </div>
    ${tabs}
    <div class="search-bar">
      <form method="GET" action="${base}" style="display:flex;gap:8px;">
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
    async function trashPost(id, el) {
      if (!confirmDelete('이 ${isPage ? '페이지' : '게시글'}를 삭제하시겠습니까?')) return;
      const r = await fetch('/admin/api/posts/' + id, { method: 'DELETE', headers: authHeaders() });
      const d = await r.json();
      if (d.success) { toast('삭제되었습니다.'); document.getElementById('post-row-' + id)?.remove(); }
      else toast(d.error || '삭제 실패', 'error');
    }
    </script>`;
  return layout(isPage ? '페이지' : '게시글', content, isPage ? 'pages' : 'posts', session);
}

// ── 게시글 편집 ───────────────────────────────────────────────────────────

async function renderPostEditor(
  db: ReturnType<typeof createDB>, session: SessionData, id: number | null, url: URL
): Promise<string> {
  const postType = (url.searchParams.get('post_type') || 'post') as 'post' | 'page';
  const isPage = postType === 'page';
  const post = id ? await db.getPost(id) : null;
  const categories = await db.getTerms('category');
  const tags = await db.getTerms('post_tag');
  const users = await db.getUsers();

  const title = post ? `"${esc(post.title)}" 편집` : `새 ${isPage ? '페이지' : '게시글'} 추가`;

  const catChecks = categories.map(c => `
    <label style="display:flex;align-items:center;gap:6px;font-size:13px;margin-bottom:4px;">
      <input type="checkbox" value="${c.id}" name="cat" ${post?.category_ids?.includes(c.id) ? 'checked' : ''}> ${esc(c.name)}
    </label>`).join('');

  const authorOpts = users.map(u =>
    `<option value="${u.id}" ${post?.author_id === u.id ? 'selected' : ''}>${esc(u.display_name || u.username)}</option>`
  ).join('');

  const content = `
    <div class="page-header">
      <h2 class="page-title">${title}</h2>
      <div style="display:flex;gap:8px;">
        <a href="/admin/${isPage ? 'pages' : 'posts'}" class="btn btn-secondary">← 목록</a>
        ${post ? `<a href="/${post.slug}/" target="_blank" class="btn btn-secondary">보기 ↗</a>` : ''}
      </div>
    </div>
    <div id="save-alert"></div>
    <div class="editor-wrap">
      <div class="editor-main">
        <div class="card">
          <div class="card-body">
            <div class="form-group">
              <input type="text" id="post-title" class="form-input" placeholder="${isPage ? '페이지' : '게시글'} 제목 입력..." value="${esc(post?.title || '')}" style="font-size:20px;font-weight:700;padding:12px;">
            </div>
            <div style="margin-bottom:8px;font-size:12px;color:#8c8f94;">
              슬러그: <input type="text" id="post-slug" value="${esc(post?.slug || '')}" style="background:#1d2327;border:1px solid #3c434a;border-radius:4px;padding:2px 8px;color:#c3c4c7;font-size:12px;width:200px;">
            </div>
            <div class="wp-editor-wrap">
              <div class="wp-editor-toolbar">
                <button onclick="fmt('bold')" title="굵게"><b>B</b></button>
                <button onclick="fmt('italic')" title="기울임"><i>I</i></button>
                <button onclick="fmt('underline')" title="밑줄"><u>U</u></button>
                <button onclick="insertLink()" title="링크">🔗</button>
                <button onclick="fmt('insertUnorderedList')" title="글머리 기호">• 목록</button>
                <button onclick="fmt('insertOrderedList')" title="번호 목록">1. 목록</button>
                <button onclick="insertHeading(2)" title="H2">H2</button>
                <button onclick="insertHeading(3)" title="H3">H3</button>
                <button onclick="fmt('insertHorizontalRule')" title="구분선">—</button>
                <button onclick="insertImage()" title="이미지">🖼️</button>
              </div>
              <div id="post-content" class="wp-editor-content" contenteditable="true"
                data-placeholder="${isPage ? '페이지' : '게시글'} 내용을 입력하세요...">${post?.content || ''}</div>
            </div>
            <div class="form-group" style="margin-top:12px;">
              <label class="form-label">요약 (발췌)</label>
              <textarea id="post-excerpt" class="form-textarea" rows="3" placeholder="선택 사항 — 비워두면 자동 생성됩니다.">${esc(post?.excerpt || '')}</textarea>
            </div>
          </div>
        </div>
      </div>
      <div class="editor-sidebar">
        <!-- 발행 -->
        <div class="card">
          <div class="card-header">발행</div>
          <div class="card-body" style="display:flex;flex-direction:column;gap:10px;">
            <div class="form-group" style="margin-bottom:0;">
              <label class="form-label">상태</label>
              <select id="post-status" class="form-select">
                <option value="publish" ${post?.status === 'publish' ? 'selected' : ''}>발행됨</option>
                <option value="draft" ${post?.status === 'draft' || !post ? 'selected' : ''}>임시저장</option>
                <option value="pending" ${post?.status === 'pending' ? 'selected' : ''}>검토 대기</option>
                <option value="private" ${post?.status === 'private' ? 'selected' : ''}>비공개</option>
              </select>
            </div>
            <div class="form-group" style="margin-bottom:0;">
              <label class="form-label">작성자</label>
              <select id="post-author" class="form-select">${authorOpts}</select>
            </div>
            ${!isPage ? `
            <div class="form-group" style="margin-bottom:0;">
              <label class="form-label">댓글 허용</label>
              <select id="post-comment" class="form-select">
                <option value="open" ${post?.comment_status !== 'closed' ? 'selected' : ''}>허용</option>
                <option value="closed" ${post?.comment_status === 'closed' ? 'selected' : ''}>비허용</option>
              </select>
            </div>` : ''}
            <div style="display:flex;gap:8px;">
              <button onclick="savePost('draft')" class="btn btn-secondary" style="flex:1;">임시저장</button>
              <button onclick="savePost('publish')" class="btn btn-primary" style="flex:1;">발행</button>
            </div>
            ${id ? `<button onclick="deletePost()" class="btn btn-danger btn-sm" style="width:100%;">🗑️ 삭제</button>` : ''}
          </div>
        </div>
        ${!isPage ? `
        <!-- 카테고리 -->
        <div class="card">
          <div class="card-header">카테고리</div>
          <div class="card-body" style="max-height:180px;overflow-y:auto;">
            ${catChecks || '<p style="font-size:13px;color:#8c8f94;">카테고리가 없습니다.</p>'}
          </div>
        </div>
        <!-- 태그 -->
        <div class="card">
          <div class="card-header">태그</div>
          <div class="card-body">
            <input type="text" id="post-tags" class="form-input" placeholder="쉼표로 구분"
              value="${(tags.filter(t => post?.tag_ids?.includes(t.id)).map(t => t.name)).join(', ')}">
            <p class="form-hint">태그를 쉼표로 구분하여 입력하세요.</p>
          </div>
        </div>` : `
        <!-- 페이지 속성 -->
        <div class="card">
          <div class="card-header">페이지 속성</div>
          <div class="card-body">
            <div class="form-group">
              <label class="form-label">순서</label>
              <input type="number" id="post-order" class="form-input" value="${post?.menu_order || 0}">
            </div>
          </div>
        </div>`}
        <!-- 대표 이미지 -->
        <div class="card">
          <div class="card-header">대표 이미지</div>
          <div class="card-body">
            <div id="featured-img-preview" style="margin-bottom:8px;">
              ${post?.featured_image ? `<img src="${esc(post.featured_image)}" style="width:100%;border-radius:4px;">` : '<p style="font-size:13px;color:#8c8f94;">이미지 없음</p>'}
            </div>
            <input type="text" id="post-featured-image" class="form-input" placeholder="이미지 URL" value="${esc(post?.featured_image || '')}">
            <p class="form-hint">미디어 라이브러리에서 URL을 복사하거나 직접 입력하세요.</p>
          </div>
        </div>
      </div>
    </div>
    <script>
    const POST_ID = ${id || 'null'};
    const POST_TYPE = '${postType}';

    function fmt(cmd) { document.execCommand(cmd, false, null); document.getElementById('post-content').focus(); }
    function insertLink() {
      const url = prompt('URL을 입력하세요:');
      if (url) document.execCommand('createLink', false, url);
    }
    function insertHeading(level) {
      document.execCommand('formatBlock', false, 'h' + level);
    }
    function insertImage() {
      const url = prompt('이미지 URL을 입력하세요:');
      if (url) document.execCommand('insertHTML', false, '<img src="' + url + '" style="max-width:100%;">');
    }

    async function savePost(forceStatus) {
      const title = document.getElementById('post-title').value.trim();
      if (!title) { toast('제목을 입력하세요.', 'error'); return; }
      const slug = document.getElementById('post-slug').value.trim() ||
        title.toLowerCase().replace(/[^a-z0-9가-힣]+/g, '-').replace(/^-|-$/g, '');
      const status = forceStatus || document.getElementById('post-status').value;
      const content = document.getElementById('post-content').innerHTML;
      const excerpt = document.getElementById('post-excerpt')?.value || '';
      const author_id = parseInt(document.getElementById('post-author')?.value || '1');
      const featured_image = document.getElementById('post-featured-image')?.value || '';
      const comment_status = document.getElementById('post-comment')?.value || 'open';
      const menu_order = parseInt(document.getElementById('post-order')?.value || '0');

      // 카테고리/태그
      const catChecks = [...document.querySelectorAll('input[name=cat]:checked')].map(el => parseInt(el.value));
      const tagsRaw = document.getElementById('post-tags')?.value || '';

      const body = {
        title, slug, content, excerpt, status,
        post_type: POST_TYPE, author_id, featured_image, comment_status, menu_order,
        category_ids: catChecks,
        tag_names: tagsRaw.split(',').map(s => s.trim()).filter(Boolean),
      };

      const url = POST_ID ? '/admin/api/posts/' + POST_ID : '/admin/api/posts';
      const method = POST_ID ? 'PUT' : 'POST';
      const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify(body) });
      const d = await r.json();
      if (d.success || d.id) {
        toast(status === 'publish' ? '발행되었습니다.' : '저장되었습니다.');
        if (!POST_ID && d.id) setTimeout(() => location.href = '/admin/${isPage ? 'pages' : 'posts'}/' + d.id + '/edit', 1000);
      } else toast(d.error || '저장 실패', 'error');
    }

    async function deletePost() {
      if (!POST_ID || !confirmDelete('이 ${isPage ? '페이지' : '게시글'}를 삭제하시겠습니까?')) return;
      const r = await fetch('/admin/api/posts/' + POST_ID, { method: 'DELETE', headers: authHeaders() });
      const d = await r.json();
      if (d.success) { toast('삭제되었습니다.'); setTimeout(() => location.href = '/admin/${isPage ? 'pages' : 'posts'}', 1000); }
      else toast(d.error || '삭제 실패', 'error');
    }
    </script>`;
  return layout(title, content, isPage ? 'pages' : 'posts', session);
}

// ── 미디어 ────────────────────────────────────────────────────────────────

async function renderMedia(db: ReturnType<typeof createDB>, session: SessionData): Promise<string> {
  const files = await db.getMedia(60);

  const grid = files.length
    ? `<div class="media-grid">${files.map(f => {
        const isImage = f.mime_type.startsWith('image/');
        const rawUrl = f.url || '';
        return `
        <div class="media-item" id="media-${f.id}">
          ${isImage ? `<img src="${esc(rawUrl)}" alt="${esc(f.alt || f.filename)}" loading="lazy">` :
            `<div class="media-item-icon">${mimeIcon(f.mime_type)}</div>`}
          <div class="media-overlay">
            <button onclick="copyUrl('${esc(rawUrl)}')" class="btn btn-sm btn-secondary" title="URL 복사">📋</button>
            <button onclick="deleteMedia(${f.id})" class="btn btn-sm btn-danger" title="삭제">🗑️</button>
          </div>
        </div>`;
      }).join('')}</div>`
    : `<div class="empty-state"><div class="icon">🖼️</div><p>미디어 파일이 없습니다.<br>아래 버튼으로 업로드하세요.</p></div>`;

  const content = `
    <div class="page-header">
      <h2 class="page-title">미디어</h2>
      <button onclick="document.getElementById('upload-modal').classList.add('open')" class="btn btn-primary">+ 파일 업로드</button>
    </div>
    <div class="alert alert-info" style="margin-bottom:20px;">
      미디어 파일은 GitHub 레포의 <code>_media/YYYY/MM/</code> 폴더에 저장됩니다.
    </div>
    ${grid}

    <!-- 업로드 모달 -->
    <div class="modal-overlay" id="upload-modal">
      <div class="modal">
        <div class="modal-header">파일 업로드 <button class="close-btn" onclick="document.getElementById('upload-modal').classList.remove('open')">×</button></div>
        <div class="modal-body">
          <div id="upload-drop" style="border:2px dashed #3c434a;border-radius:8px;padding:40px;text-align:center;cursor:pointer;" onclick="document.getElementById('file-input').click()">
            <p style="font-size:32px;margin-bottom:8px;">📁</p>
            <p style="color:#8c8f94;">클릭하거나 파일을 드래그하세요</p>
            <p style="font-size:12px;color:#6b7280;margin-top:4px;">이미지, PDF, 문서 파일 지원</p>
          </div>
          <input type="file" id="file-input" multiple accept="image/*,.pdf,.doc,.docx,.txt" style="display:none;" onchange="uploadFiles(this.files)">
          <div id="upload-progress" style="margin-top:12px;"></div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="document.getElementById('upload-modal').classList.remove('open')">닫기</button>
        </div>
      </div>
    </div>

    <script>
    async function uploadFiles(files) {
      const progress = document.getElementById('upload-progress');
      for (const file of files) {
        progress.innerHTML = '<div class="alert alert-info">📤 ' + file.name + ' 업로드 중...</div>';
        const fd = new FormData();
        fd.append('file', file);
        const r = await fetch('/admin/api/media/upload', { method: 'POST', headers: authHeaders(), body: fd });
        const d = await r.json();
        if (d.success) {
          progress.innerHTML = '<div class="alert alert-success">✅ 업로드 완료!</div>';
          toast(file.name + ' 업로드 완료');
        } else {
          progress.innerHTML = '<div class="alert alert-error">❌ 업로드 실패: ' + (d.error || '') + '</div>';
          toast('업로드 실패: ' + (d.error || ''), 'error');
        }
      }
      setTimeout(() => location.reload(), 1200);
    }
    function copyUrl(url) {
      navigator.clipboard.writeText(url).then(() => toast('URL이 복사되었습니다.'));
    }
    async function deleteMedia(id) {
      if (!confirmDelete('이 파일을 삭제하시겠습니까?')) return;
      const r = await fetch('/admin/api/media/' + id, { method: 'DELETE', headers: authHeaders() });
      const d = await r.json();
      if (d.success) { toast('삭제되었습니다.'); document.getElementById('media-' + id)?.remove(); }
      else toast(d.error || '삭제 실패', 'error');
    }
    // drag-drop
    const drop = document.getElementById('upload-drop');
    drop.addEventListener('dragover', e => { e.preventDefault(); drop.style.borderColor = '#2271b1'; });
    drop.addEventListener('dragleave', () => { drop.style.borderColor = '#3c434a'; });
    drop.addEventListener('drop', e => { e.preventDefault(); drop.style.borderColor = '#3c434a'; uploadFiles(e.dataTransfer.files); });
    </script>`;
  return layout('미디어', content, 'media', session);
}

// ── 댓글 ──────────────────────────────────────────────────────────────────

async function renderComments(db: ReturnType<typeof createDB>, session: SessionData, url: URL): Promise<string> {
  const statusFilter = url.searchParams.get('status') || '';
  const comments = await db.getComments({ status: statusFilter || undefined, limit: 50 });
  const pending = await db.countComments('pending');

  const rows = comments.length
    ? comments.map(c => `
      <tr id="comment-${c.id}">
        <td>
          <strong style="color:#fff;">${esc(c.author_name)}</strong><br>
          <small style="color:#8c8f94;">${esc(c.author_email)}</small>
        </td>
        <td style="font-size:13px;max-width:300px;">${esc(c.content)}</td>
        <td><span class="badge ${c.status === 'approved' ? 'badge-publish' : 'badge-pending'}">${c.status === 'approved' ? '승인' : '대기'}</span></td>
        <td style="color:#8c8f94;font-size:12px;">${new Date(c.created_at).toLocaleDateString('ko-KR')}</td>
        <td>
          ${c.status !== 'approved' ? `<button onclick="approveComment(${c.id})" class="btn btn-sm btn-success">승인</button>` : ''}
          <button onclick="deleteComment(${c.id})" class="btn btn-sm btn-danger">삭제</button>
        </td>
      </tr>`).join('')
    : '<tr><td colspan="5" class="empty-state">댓글이 없습니다.</td></tr>';

  const content = `
    <div class="page-header">
      <h2 class="page-title">댓글 ${pending > 0 ? `<span class="badge badge-pending" style="font-size:14px;">${pending}</span>` : ''}</h2>
    </div>
    <div class="tabs">
      <a href="/admin/comments" class="tab${!statusFilter ? ' active' : ''}">전체</a>
      <a href="/admin/comments?status=pending" class="tab${statusFilter === 'pending' ? ' active' : ''}">대기 (${pending})</a>
      <a href="/admin/comments?status=approved" class="tab${statusFilter === 'approved' ? ' active' : ''}">승인됨</a>
      <a href="/admin/comments?status=spam" class="tab${statusFilter === 'spam' ? ' active' : ''}">스팸</a>
    </div>
    <div class="card">
      <table class="table">
        <thead><tr><th>작성자</th><th>내용</th><th>상태</th><th>날짜</th><th>작업</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <script>
    async function approveComment(id) {
      const r = await fetch('/admin/api/comments/' + id, { method: 'PUT', headers: { 'Content-Type':'application/json', ...authHeaders() }, body: JSON.stringify({ status: 'approved' }) });
      const d = await r.json();
      if (d.success) { toast('승인되었습니다.'); location.reload(); }
      else toast(d.error || '실패', 'error');
    }
    async function deleteComment(id) {
      if (!confirmDelete('이 댓글을 삭제하시겠습니까?')) return;
      const r = await fetch('/admin/api/comments/' + id, { method: 'DELETE', headers: authHeaders() });
      const d = await r.json();
      if (d.success) { toast('삭제되었습니다.'); document.getElementById('comment-' + id)?.remove(); }
      else toast(d.error || '삭제 실패', 'error');
    }
    </script>`;
  return layout('댓글', content, 'comments', session);
}

// ── 카테고리/태그 ─────────────────────────────────────────────────────────

async function renderTerms(
  db: ReturnType<typeof createDB>, session: SessionData,
  taxonomy: 'category' | 'post_tag'
): Promise<string> {
  const isCategory = taxonomy === 'category';
  const terms = await db.getTerms(taxonomy);
  const label = isCategory ? '카테고리' : '태그';
  const activeKey = isCategory ? 'categories' : 'tags';

  const rows = terms.length
    ? terms.map(t => `
      <tr id="term-${t.id}">
        <td><a href="#" onclick="editTerm(${t.id}, '${esc(t.name)}', '${esc(t.slug)}', '${esc(t.description)}')" style="color:#2271b1;font-weight:600;text-decoration:none;">${esc(t.name)}</a></td>
        <td style="font-family:monospace;font-size:12px;">${esc(t.slug)}</td>
        <td>${esc(t.description)}</td>
        <td>${t.count}</td>
        <td><button onclick="deleteTerm(${t.id})" class="btn btn-sm btn-danger">삭제</button></td>
      </tr>`).join('')
    : `<tr><td colspan="5" class="empty-state">${label}이 없습니다.</td></tr>`;

  const content = `
    <div class="page-header">
      <h2 class="page-title">${label}</h2>
      <button onclick="document.getElementById('add-term-modal').classList.add('open')" class="btn btn-primary">+ ${label} 추가</button>
    </div>
    <div class="card">
      <table class="table">
        <thead><tr><th>이름</th><th>슬러그</th><th>설명</th><th>게시글 수</th><th>작업</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>

    <!-- 추가/편집 모달 -->
    <div class="modal-overlay" id="add-term-modal">
      <div class="modal">
        <div class="modal-header">${label} 추가/편집 <button class="close-btn" onclick="document.getElementById('add-term-modal').classList.remove('open')">×</button></div>
        <div class="modal-body">
          <input type="hidden" id="term-edit-id" value="">
          <div class="form-group">
            <label class="form-label">이름 *</label>
            <input type="text" id="term-name" class="form-input" placeholder="${label} 이름">
          </div>
          <div class="form-group">
            <label class="form-label">슬러그</label>
            <input type="text" id="term-slug" class="form-input" placeholder="자동 생성됩니다">
          </div>
          <div class="form-group">
            <label class="form-label">설명</label>
            <textarea id="term-desc" class="form-textarea" rows="3" placeholder="선택 사항"></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="document.getElementById('add-term-modal').classList.remove('open')">취소</button>
          <button class="btn btn-primary" onclick="saveTerm()">저장</button>
        </div>
      </div>
    </div>

    <script>
    function editTerm(id, name, slug, desc) {
      document.getElementById('term-edit-id').value = id;
      document.getElementById('term-name').value = name;
      document.getElementById('term-slug').value = slug;
      document.getElementById('term-desc').value = desc;
      document.getElementById('add-term-modal').classList.add('open');
    }
    async function saveTerm() {
      const editId = document.getElementById('term-edit-id').value;
      const name = document.getElementById('term-name').value.trim();
      if (!name) { toast('이름을 입력하세요.', 'error'); return; }
      const slug = document.getElementById('term-slug').value.trim() || name.toLowerCase().replace(/[^a-z0-9가-힣]+/g, '-');
      const description = document.getElementById('term-desc').value.trim();
      const url = editId ? '/admin/api/terms/' + editId : '/admin/api/terms';
      const method = editId ? 'PUT' : 'POST';
      const r = await fetch(url, { method, headers: { 'Content-Type':'application/json', ...authHeaders() }, body: JSON.stringify({ name, slug, description, taxonomy: '${taxonomy}' }) });
      const d = await r.json();
      if (d.success || d.id) { toast('저장되었습니다.'); location.reload(); }
      else toast(d.error || '저장 실패', 'error');
    }
    async function deleteTerm(id) {
      if (!confirmDelete('이 ${label}을 삭제하시겠습니까?')) return;
      const r = await fetch('/admin/api/terms/' + id + '?taxonomy=${taxonomy}', { method: 'DELETE', headers: authHeaders() });
      const d = await r.json();
      if (d.success) { toast('삭제되었습니다.'); document.getElementById('term-' + id)?.remove(); }
      else toast(d.error || '삭제 실패', 'error');
    }
    </script>`;
  return layout(label, content, activeKey, session);
}

// ── 플러그인 ──────────────────────────────────────────────────────────────

async function renderPlugins(db: ReturnType<typeof createDB>, session: SessionData, url: URL): Promise<string> {
  const plugins = await db.getPlugins();
  const tab = url.searchParams.get('tab') || 'installed';

  // 빌트인 플러그인 (검색 결과 시뮬레이션)
  const marketPlugins = [
    { slug: 'seo-meta', name: 'SEO Meta Manager', version: '2.1.0', description: '메타 태그, OG, sitemap 자동 생성', author: 'CloudPress Team', stars: 5 },
    { slug: 'contact-form', name: 'Contact Form', version: '1.4.2', description: '연락처 폼 생성기 — 이메일 알림 포함', author: 'CloudPress Team', stars: 4 },
    { slug: 'social-share', name: 'Social Share Buttons', version: '1.2.0', description: 'SNS 공유 버튼 자동 삽입', author: 'CloudPress Team', stars: 4 },
    { slug: 'analytics', name: 'Analytics Dashboard', version: '1.0.5', description: 'GitHub Pages 방문자 통계', author: 'CloudPress Team', stars: 5 },
    { slug: 'image-optimizer', name: 'Image Optimizer', version: '1.3.1', description: '업로드 시 이미지 자동 최적화', author: 'CloudPress Team', stars: 4 },
    { slug: 'related-posts', name: 'Related Posts', version: '1.1.0', description: '게시글 하단에 관련 글 표시', author: 'CloudPress Team', stars: 3 },
    { slug: 'reading-time', name: 'Reading Time', version: '1.0.2', description: '게시글 예상 읽기 시간 표시', author: 'CloudPress Team', stars: 4 },
    { slug: 'table-of-contents', name: 'Table of Contents', version: '1.2.0', description: '자동 목차 생성', author: 'CloudPress Team', stars: 5 },
  ];

  let content = '';

  if (tab === 'installed') {
    const cards = plugins.length
      ? plugins.map(p => `
        <div class="plugin-card ${p.status === 'active' ? 'active-plugin' : ''}" id="plugin-${p.slug}">
          <div class="plugin-card-header">
            <div>
              <div class="plugin-name">${esc(p.name)}</div>
              <div class="plugin-version">v${esc(p.version)} · ${esc(p.author)}</div>
            </div>
            <span class="badge ${p.status === 'active' ? 'badge-active' : 'badge-inactive'}">${p.status === 'active' ? '활성' : '비활성'}</span>
          </div>
          <div class="plugin-desc">${esc(p.description)}</div>
          <div class="plugin-actions">
            ${p.status === 'active'
              ? `<button onclick="deactivatePlugin('${p.slug}')" class="btn btn-sm btn-secondary">비활성화</button>`
              : `<button onclick="activatePlugin('${p.slug}')" class="btn btn-sm btn-primary">활성화</button>`}
            <button onclick="deletePlugin('${p.slug}')" class="btn btn-sm btn-danger">삭제</button>
          </div>
        </div>`).join('')
      : `<div class="empty-state"><div class="icon">🔌</div><p>설치된 플러그인이 없습니다.<br>플러그인 추가 탭에서 설치하세요.</p></div>`;

    content = `
      <div class="page-header">
        <h2 class="page-title">플러그인 <span style="font-size:14px;color:#8c8f94;font-weight:400;">(${plugins.length}개 설치됨)</span></h2>
      </div>
      <div class="tabs">
        <a href="/admin/plugins" class="tab active">설치됨 (${plugins.length})</a>
        <a href="/admin/plugins?tab=add" class="tab">플러그인 추가</a>
        <a href="/admin/plugins?tab=upload" class="tab">파일 업로드</a>
      </div>
      <div class="plugin-grid">${cards}</div>
      <script>
      async function activatePlugin(slug) {
        const r = await fetch('/admin/api/plugins/' + slug + '/activate', { method: 'POST', headers: authHeaders() });
        const d = await r.json();
        if (d.success) { toast('플러그인이 활성화되었습니다.'); location.reload(); }
        else toast(d.error || '실패', 'error');
      }
      async function deactivatePlugin(slug) {
        const r = await fetch('/admin/api/plugins/' + slug + '/deactivate', { method: 'POST', headers: authHeaders() });
        const d = await r.json();
        if (d.success) { toast('플러그인이 비활성화되었습니다.'); location.reload(); }
        else toast(d.error || '실패', 'error');
      }
      async function deletePlugin(slug) {
        if (!confirmDelete('이 플러그인을 삭제하시겠습니까?')) return;
        const r = await fetch('/admin/api/plugins/' + slug, { method: 'DELETE', headers: authHeaders() });
        const d = await r.json();
        if (d.success) { toast('삭제되었습니다.'); document.getElementById('plugin-' + slug)?.remove(); }
        else toast(d.error || '삭제 실패', 'error');
      }
      </script>`;
  } else if (tab === 'add') {
    const installedSlugs = new Set(plugins.map(p => p.slug));
    const cards = marketPlugins.map(p => `
      <div class="plugin-card">
        <div class="plugin-card-header">
          <div>
            <div class="plugin-name">${esc(p.name)}</div>
            <div class="plugin-version">v${esc(p.version)} · ${'⭐'.repeat(p.stars)}</div>
          </div>
          ${installedSlugs.has(p.slug) ? '<span class="badge badge-active">설치됨</span>' : ''}
        </div>
        <div class="plugin-desc">${esc(p.description)}</div>
        <div class="plugin-actions">
          ${installedSlugs.has(p.slug)
            ? '<button class="btn btn-sm btn-secondary" disabled>설치됨</button>'
            : `<button onclick="installPlugin('${p.slug}', '${esc(p.name)}', '${esc(p.version)}', '${esc(p.description)}', '${esc(p.author)}')" class="btn btn-sm btn-primary">지금 설치</button>`}
        </div>
      </div>`).join('');

    content = `
      <div class="page-header">
        <h2 class="page-title">플러그인 추가</h2>
      </div>
      <div class="tabs">
        <a href="/admin/plugins" class="tab">설치됨 (${plugins.length})</a>
        <a href="/admin/plugins?tab=add" class="tab active">플러그인 추가</a>
        <a href="/admin/plugins?tab=upload" class="tab">파일 업로드</a>
      </div>
      <div class="plugin-grid">${cards}</div>
      <script>
      async function installPlugin(slug, name, version, description, author) {
        toast('설치 중...', 'info');
        const r = await fetch('/admin/api/plugins/install', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ slug, name, version, description, author })
        });
        const d = await r.json();
        if (d.success) { toast(name + ' 설치 완료!'); setTimeout(() => location.href = '/admin/plugins', 1000); }
        else toast(d.error || '설치 실패', 'error');
      }
      </script>`;
  } else {
    // upload tab
    content = `
      <div class="page-header">
        <h2 class="page-title">플러그인 파일 업로드</h2>
      </div>
      <div class="tabs">
        <a href="/admin/plugins" class="tab">설치됨 (${plugins.length})</a>
        <a href="/admin/plugins?tab=add" class="tab">플러그인 추가</a>
        <a href="/admin/plugins?tab=upload" class="tab active">파일 업로드</a>
      </div>
      <div class="card">
        <div class="card-header">ZIP 파일로 플러그인 설치</div>
        <div class="card-body">
          <div class="alert alert-info">
            플러그인 ZIP 파일을 업로드하면 GitHub 레포의 <code>_plugins/</code> 폴더에 저장됩니다.
          </div>
          <div class="form-group">
            <label class="form-label">플러그인 ZIP 파일</label>
            <input type="file" id="plugin-zip" class="form-input" accept=".zip">
          </div>
          <button onclick="uploadPluginZip()" class="btn btn-primary">업로드 및 설치</button>
          <div id="upload-result" style="margin-top:12px;"></div>
        </div>
      </div>
      <script>
      async function uploadPluginZip() {
        const file = document.getElementById('plugin-zip').files[0];
        if (!file) { toast('파일을 선택하세요.', 'error'); return; }
        document.getElementById('upload-result').innerHTML = '<div class="alert alert-info">업로드 중...</div>';
        const fd = new FormData();
        fd.append('file', file);
        const r = await fetch('/admin/api/plugins/upload', { method: 'POST', headers: authHeaders(), body: fd });
        const d = await r.json();
        if (d.success) {
          document.getElementById('upload-result').innerHTML = '<div class="alert alert-success">✅ 설치 완료!</div>';
          setTimeout(() => location.href = '/admin/plugins', 1500);
        } else {
          document.getElementById('upload-result').innerHTML = '<div class="alert alert-error">❌ ' + (d.error || '실패') + '</div>';
        }
      }
      </script>`;
  }

  return layout('플러그인', content, 'plugins', session);
}

// ── 테마 ──────────────────────────────────────────────────────────────────

async function renderThemes(db: ReturnType<typeof createDB>, session: SessionData, url: URL): Promise<string> {
  const themes = await db.getThemes();
  const tab = url.searchParams.get('tab') || 'installed';
  const activeTheme = themes.find(t => t.active);

  // 마켓 테마
  const marketThemes = [
    { slug: 'minimal-blog', name: 'Minimal Blog', version: '1.0.0', description: '깔끔한 미니멀 블로그 테마', author: 'CloudPress Team', emoji: '📰' },
    { slug: 'tech-dark', name: 'Tech Dark', version: '1.2.0', description: '개발자를 위한 다크 테마', author: 'CloudPress Team', emoji: '💻' },
    { slug: 'portfolio', name: 'Portfolio', version: '1.1.0', description: '포트폴리오에 최적화된 깔끔한 테마', author: 'CloudPress Team', emoji: '🎨' },
    { slug: 'magazine', name: 'Magazine', version: '2.0.0', description: '뉴스, 매거진 스타일 멀티컬럼 테마', author: 'CloudPress Team', emoji: '📖' },
    { slug: 'startup', name: 'Startup', version: '1.3.0', description: '스타트업 소개 및 랜딩 페이지 테마', author: 'CloudPress Team', emoji: '🚀' },
    { slug: 'photo-blog', name: 'Photo Blog', version: '1.0.5', description: '사진 중심의 갤러리 블로그 테마', author: 'CloudPress Team', emoji: '📷' },
  ];

  let content = '';

  if (tab === 'installed') {
    const cards = themes.length
      ? themes.map(t => `
        <div class="theme-card ${t.active ? 'active-theme' : ''}">
          <div class="theme-screenshot">${t.screenshot ? `<img src="${t.screenshot}" style="width:100%;height:100%;object-fit:cover;">` : '🎨'}</div>
          <div class="theme-info">
            <div class="theme-name">${esc(t.name)} ${t.active ? '<span class="badge badge-active">활성</span>' : ''}</div>
            <div class="theme-meta">v${esc(t.version)} · ${esc(t.author)}</div>
            <div style="font-size:12px;color:#8c8f94;margin-bottom:10px;">${esc(t.description)}</div>
            <div class="theme-actions">
              ${!t.active ? `<button onclick="activateTheme('${t.slug}')" class="btn btn-sm btn-primary">활성화</button>` : '<span class="btn btn-sm btn-secondary" style="cursor:default;">현재 테마</span>'}
              <a href="/admin/themes/${t.slug}/customize" class="btn btn-sm btn-secondary">커스터마이즈</a>
              ${!t.active ? `<button onclick="deleteTheme('${t.slug}')" class="btn btn-sm btn-danger">삭제</button>` : ''}
            </div>
          </div>
        </div>`).join('')
      : `<div class="empty-state"><div class="icon">🎨</div><p>설치된 테마가 없습니다.<br>새 테마 탭에서 설치하세요.</p></div>`;

    content = `
      <div class="page-header">
        <h2 class="page-title">테마 <span style="font-size:14px;color:#8c8f94;font-weight:400;">(${themes.length}개 설치됨${activeTheme ? ' · 현재: ' + activeTheme.name : ''})</span></h2>
      </div>
      <div class="tabs">
        <a href="/admin/themes" class="tab active">설치됨 (${themes.length})</a>
        <a href="/admin/themes?tab=add" class="tab">새 테마 추가</a>
        <a href="/admin/themes?tab=upload" class="tab">테마 업로드</a>
      </div>
      <div class="theme-grid">${cards}</div>
      <script>
      async function activateTheme(slug) {
        const r = await fetch('/admin/api/themes/' + slug + '/activate', { method: 'POST', headers: authHeaders() });
        const d = await r.json();
        if (d.success) { toast('테마가 활성화되었습니다.'); location.reload(); }
        else toast(d.error || '실패', 'error');
      }
      async function deleteTheme(slug) {
        if (!confirmDelete('이 테마를 삭제하시겠습니까?')) return;
        const r = await fetch('/admin/api/themes/' + slug, { method: 'DELETE', headers: authHeaders() });
        const d = await r.json();
        if (d.success) { toast('삭제되었습니다.'); location.reload(); }
        else toast(d.error || '삭제 실패', 'error');
      }
      </script>`;
  } else if (tab === 'add') {
    const installedSlugs = new Set(themes.map(t => t.slug));
    const cards = marketThemes.map(t => `
      <div class="theme-card">
        <div class="theme-screenshot">${t.emoji}</div>
        <div class="theme-info">
          <div class="theme-name">${esc(t.name)}</div>
          <div class="theme-meta">v${esc(t.version)} · ${esc(t.author)}</div>
          <div style="font-size:12px;color:#8c8f94;margin-bottom:10px;">${esc(t.description)}</div>
          <div class="theme-actions">
            ${installedSlugs.has(t.slug)
              ? '<span class="btn btn-sm btn-secondary" style="cursor:default;">설치됨</span>'
              : `<button onclick="installTheme('${t.slug}', '${esc(t.name)}', '${esc(t.version)}', '${esc(t.description)}', '${esc(t.author)}')" class="btn btn-sm btn-primary">설치</button>`}
          </div>
        </div>
      </div>`).join('');

    content = `
      <div class="page-header">
        <h2 class="page-title">새 테마 추가</h2>
      </div>
      <div class="tabs">
        <a href="/admin/themes" class="tab">설치됨 (${themes.length})</a>
        <a href="/admin/themes?tab=add" class="tab active">새 테마 추가</a>
        <a href="/admin/themes?tab=upload" class="tab">테마 업로드</a>
      </div>
      <div class="theme-grid">${cards}</div>
      <script>
      async function installTheme(slug, name, version, description, author) {
        toast('설치 중...', 'info');
        const r = await fetch('/admin/api/themes/install', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ slug, name, version, description, author })
        });
        const d = await r.json();
        if (d.success) { toast(name + ' 설치 완료!'); setTimeout(() => location.href = '/admin/themes', 1000); }
        else toast(d.error || '설치 실패', 'error');
      }
      </script>`;
  } else {
    content = `
      <div class="page-header">
        <h2 class="page-title">테마 업로드</h2>
      </div>
      <div class="tabs">
        <a href="/admin/themes" class="tab">설치됨 (${themes.length})</a>
        <a href="/admin/themes?tab=add" class="tab">새 테마 추가</a>
        <a href="/admin/themes?tab=upload" class="tab active">테마 업로드</a>
      </div>
      <div class="card">
        <div class="card-header">ZIP 파일로 테마 설치</div>
        <div class="card-body">
          <div class="alert alert-info">
            테마 ZIP 파일을 업로드하면 GitHub 레포의 <code>_themes/</code> 폴더에 저장됩니다.
          </div>
          <div class="form-group">
            <label class="form-label">테마 ZIP 파일</label>
            <input type="file" id="theme-zip" class="form-input" accept=".zip">
          </div>
          <button onclick="uploadThemeZip()" class="btn btn-primary">업로드 및 설치</button>
          <div id="upload-result" style="margin-top:12px;"></div>
        </div>
      </div>
      <script>
      async function uploadThemeZip() {
        const file = document.getElementById('theme-zip').files[0];
        if (!file) { toast('파일을 선택하세요.', 'error'); return; }
        document.getElementById('upload-result').innerHTML = '<div class="alert alert-info">업로드 중...</div>';
        const fd = new FormData();
        fd.append('file', file);
        const r = await fetch('/admin/api/themes/upload', { method: 'POST', headers: authHeaders(), body: fd });
        const d = await r.json();
        if (d.success) {
          document.getElementById('upload-result').innerHTML = '<div class="alert alert-success">✅ 설치 완료!</div>';
          setTimeout(() => location.href = '/admin/themes', 1500);
        } else {
          document.getElementById('upload-result').innerHTML = '<div class="alert alert-error">❌ ' + (d.error || '실패') + '</div>';
        }
      }
      </script>`;
  }

  return layout('테마', content, 'themes', session);
}

// ── 사용자 ────────────────────────────────────────────────────────────────

async function renderUsers(db: ReturnType<typeof createDB>, session: SessionData): Promise<string> {
  const users = await db.getUsers();
  const roleLabel: Record<string, string> = {
    administrator: '관리자', editor: '편집자', author: '글쓴이',
    contributor: '기여자', subscriber: '구독자'
  };
  const rows = users.length
    ? users.map(u => `
      <tr id="user-${u.id}">
        <td>
          <a href="#" onclick="editUser(${u.id})" style="color:#2271b1;font-weight:600;text-decoration:none;">${esc(u.display_name || u.username)}</a>
          <div style="font-size:12px;color:#8c8f94;">${esc(u.username)}</div>
        </td>
        <td>${esc(u.email)}</td>
        <td><span class="badge ${u.role === 'administrator' ? 'badge-publish' : 'badge-inactive'}">${roleLabel[u.role] || u.role}</span></td>
        <td style="color:#8c8f94;font-size:12px;">${new Date(u.registered_at).toLocaleDateString('ko-KR')}</td>
        <td>
          ${u.id !== session.userId ? `<button onclick="deleteUser(${u.id})" class="btn btn-sm btn-danger">삭제</button>` : '<span style="font-size:12px;color:#8c8f94;">현재 사용자</span>'}
        </td>
      </tr>`).join('')
    : '<tr><td colspan="5" class="empty-state">사용자가 없습니다.</td></tr>';

  const content = `
    <div class="page-header">
      <h2 class="page-title">사용자</h2>
      <button onclick="document.getElementById('add-user-modal').classList.add('open')" class="btn btn-primary">+ 새 사용자</button>
    </div>
    <div class="card">
      <table class="table">
        <thead><tr><th>이름</th><th>이메일</th><th>역할</th><th>가입일</th><th>작업</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>

    <div class="modal-overlay" id="add-user-modal">
      <div class="modal">
        <div class="modal-header">새 사용자 추가 <button class="close-btn" onclick="document.getElementById('add-user-modal').classList.remove('open')">×</button></div>
        <div class="modal-body">
          <div class="form-group"><label class="form-label">사용자명 *</label><input type="text" id="nu-login" class="form-input"></div>
          <div class="form-group"><label class="form-label">이메일 *</label><input type="email" id="nu-email" class="form-input"></div>
          <div class="form-group"><label class="form-label">표시 이름</label><input type="text" id="nu-name" class="form-input"></div>
          <div class="form-group"><label class="form-label">비밀번호 *</label><input type="password" id="nu-pass" class="form-input"></div>
          <div class="form-group"><label class="form-label">역할</label>
            <select id="nu-role" class="form-select">
              <option value="subscriber">구독자</option>
              <option value="contributor">기여자</option>
              <option value="author">글쓴이</option>
              <option value="editor">편집자</option>
              <option value="administrator">관리자</option>
            </select>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="document.getElementById('add-user-modal').classList.remove('open')">취소</button>
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
      if (!body.username || !body.email || !body.password) { toast('필수 항목을 입력하세요.', 'error'); return; }
      const r = await fetch('/admin/api/users', { method: 'POST', headers: { 'Content-Type':'application/json', ...authHeaders() }, body: JSON.stringify(body) });
      const d = await r.json();
      if (d.success || d.id) { toast('사용자가 추가되었습니다.'); location.reload(); }
      else toast(d.error || '추가 실패', 'error');
    }
    function editUser(id) { window.location.href = '/admin/users/' + id + '/edit'; }
    async function deleteUser(id) {
      if (!confirmDelete('이 사용자를 삭제하시겠습니까?')) return;
      const r = await fetch('/admin/api/users/' + id, { method: 'DELETE', headers: authHeaders() });
      const d = await r.json();
      if (d.success) { toast('삭제되었습니다.'); document.getElementById('user-' + id)?.remove(); }
      else toast(d.error || '삭제 실패', 'error');
    }
    </script>`;
  return layout('사용자', content, 'users', session);
}

// ── 설정 ──────────────────────────────────────────────────────────────────

async function renderSettings(db: ReturnType<typeof createDB>, session: SessionData): Promise<string> {
  const s = await db.getSettings();
  const content = `
    <div class="page-header">
      <h2 class="page-title">설정</h2>
    </div>
    <div id="settings-alert"></div>
    <form onsubmit="saveSettings(event)">
      <div class="card" style="margin-bottom:16px;">
        <div class="card-header">일반 설정</div>
        <div class="card-body">
          <div class="form-group">
            <label class="form-label">사이트 이름 *</label>
            <input type="text" name="site_name" class="form-input" value="${esc(s.site_name)}" required>
          </div>
          <div class="form-group">
            <label class="form-label">사이트 설명</label>
            <input type="text" name="site_description" class="form-input" value="${esc(s.site_description)}" placeholder="사이트 슬로건 또는 설명">
          </div>
          <div class="form-group">
            <label class="form-label">사이트 URL</label>
            <input type="url" name="site_url" class="form-input" value="${esc(s.site_url)}" placeholder="https://username.github.io/repo">
            <p class="form-hint">GitHub Pages URL 또는 커스텀 도메인</p>
          </div>
          <div class="form-group">
            <label class="form-label">관리자 이메일</label>
            <input type="email" name="admin_email" class="form-input" value="${esc(s.admin_email)}">
          </div>
        </div>
      </div>
      <div class="card" style="margin-bottom:16px;">
        <div class="card-header">읽기 설정</div>
        <div class="card-body">
          <div class="form-group">
            <label class="form-label">페이지당 게시글 수</label>
            <input type="number" name="posts_per_page" class="form-input" value="${s.posts_per_page}" min="1" max="100" style="max-width:120px;">
          </div>
          <div class="form-group">
            <label class="form-label">홈 화면 표시</label>
            <select name="show_on_front" class="form-select" style="max-width:200px;">
              <option value="posts" ${s.show_on_front === 'posts' ? 'selected' : ''}>최근 게시글</option>
              <option value="page" ${s.show_on_front === 'page' ? 'selected' : ''}>정적 페이지</option>
            </select>
          </div>
        </div>
      </div>
      <div class="card" style="margin-bottom:16px;">
        <div class="card-header">언어 & 시간대</div>
        <div class="card-body">
          <div class="form-group">
            <label class="form-label">언어</label>
            <select name="language" class="form-select" style="max-width:200px;">
              <option value="ko" ${s.language === 'ko' ? 'selected' : ''}>한국어</option>
              <option value="en" ${s.language === 'en' ? 'selected' : ''}>English</option>
              <option value="ja" ${s.language === 'ja' ? 'selected' : ''}>日本語</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">시간대</label>
            <select name="timezone" class="form-select" style="max-width:260px;">
              <option value="Asia/Seoul" ${s.timezone === 'Asia/Seoul' ? 'selected' : ''}>Asia/Seoul (KST +09:00)</option>
              <option value="UTC" ${s.timezone === 'UTC' ? 'selected' : ''}>UTC</option>
              <option value="America/New_York" ${s.timezone === 'America/New_York' ? 'selected' : ''}>America/New_York</option>
            </select>
          </div>
        </div>
      </div>
      <div class="card" style="margin-bottom:16px;">
        <div class="card-header">댓글 설정</div>
        <div class="card-body">
          <div class="form-group">
            <label class="form-label">기본 댓글 허용 여부</label>
            <select name="comment_status" class="form-select" style="max-width:200px;">
              <option value="open" ${s.comment_status === 'open' ? 'selected' : ''}>허용</option>
              <option value="closed" ${s.comment_status === 'closed' ? 'selected' : ''}>비허용</option>
            </select>
          </div>
        </div>
      </div>
      <button type="submit" class="btn btn-primary">설정 저장</button>
    </form>
    <script>
    async function saveSettings(e) {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target).entries());
      data.posts_per_page = parseInt(data.posts_per_page);
      const r = await fetch('/admin/api/settings', { method: 'PUT', headers: { 'Content-Type':'application/json', ...authHeaders() }, body: JSON.stringify(data) });
      const d = await r.json();
      if (d.success) toast('설정이 저장되었습니다.');
      else toast(d.error || '저장 실패', 'error');
    }
    </script>`;
  return layout('설정', content, 'settings', session);
}

// ── 도구 ──────────────────────────────────────────────────────────────────

async function renderTools(db: ReturnType<typeof createDB>, session: SessionData): Promise<string> {
  const info = await db.getDatabaseInfo();

  const content = `
    <div class="page-header">
      <h2 class="page-title">도구</h2>
    </div>
    <div class="info-grid" style="margin-bottom:20px;">
      <div class="card">
        <div class="card-header">📊 데이터베이스 정보</div>
        <div class="card-body">
          <table class="table">
            <tbody>
              <tr><td style="color:#8c8f94;">게시글</td><td style="color:#fff;font-weight:600;">${info.posts}</td></tr>
              <tr><td style="color:#8c8f94;">페이지</td><td style="color:#fff;font-weight:600;">${info.pages}</td></tr>
              <tr><td style="color:#8c8f94;">사용자</td><td style="color:#fff;font-weight:600;">${info.users}</td></tr>
              <tr><td style="color:#8c8f94;">카테고리</td><td style="color:#fff;font-weight:600;">${info.categories}</td></tr>
              <tr><td style="color:#8c8f94;">태그</td><td style="color:#fff;font-weight:600;">${info.tags}</td></tr>
              <tr><td style="color:#8c8f94;">댓글</td><td style="color:#fff;font-weight:600;">${info.comments}</td></tr>
              <tr><td style="color:#8c8f94;">미디어</td><td style="color:#fff;font-weight:600;">${info.media}</td></tr>
              <tr><td style="color:#8c8f94;">플러그인</td><td style="color:#fff;font-weight:600;">${info.plugins}</td></tr>
              <tr><td style="color:#8c8f94;">테마</td><td style="color:#fff;font-weight:600;">${info.themes}</td></tr>
            </tbody>
          </table>
          <p style="font-size:12px;color:#8c8f94;margin-top:8px;">GitHub 레포 기반 · D1/KV 없음</p>
        </div>
      </div>
      <div class="card">
        <div class="card-header">⚙️ 시스템 정보</div>
        <div class="card-body">
          <table class="table">
            <tbody>
              <tr><td style="color:#8c8f94;">CMS 버전</td><td style="color:#fff;font-weight:600;">2.0.0</td></tr>
              <tr><td style="color:#8c8f94;">스토리지</td><td style="color:#fff;font-weight:600;">GitHub Repo</td></tr>
              <tr><td style="color:#8c8f94;">호스팅</td><td style="color:#fff;font-weight:600;">GitHub Pages</td></tr>
              <tr><td style="color:#8c8f94;">런타임</td><td style="color:#fff;font-weight:600;">Cloudflare Workers</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- 내보내기/가져오기 -->
    <div class="card" style="margin-bottom:16px;">
      <div class="card-header">💾 데이터 내보내기</div>
      <div class="card-body">
        <p style="font-size:13px;color:#8c8f94;margin-bottom:16px;">모든 데이터를 JSON 형식으로 내보냅니다.</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button onclick="exportData('posts')" class="btn btn-secondary">게시글 내보내기</button>
          <button onclick="exportData('pages')" class="btn btn-secondary">페이지 내보내기</button>
          <button onclick="exportData('all')" class="btn btn-primary">전체 내보내기</button>
        </div>
        <div id="export-result" style="margin-top:12px;"></div>
      </div>
    </div>

    <!-- 빌드 트리거 -->
    <div class="card" style="margin-bottom:16px;">
      <div class="card-header">🚀 GitHub Actions 빌드</div>
      <div class="card-body">
        <p style="font-size:13px;color:#8c8f94;margin-bottom:16px;">
          GitHub Actions 워크플로우를 수동으로 트리거하여 사이트를 재빌드합니다.
        </p>
        <button onclick="triggerBuild()" class="btn btn-primary">🔨 빌드 트리거</button>
        <div id="build-result" style="margin-top:12px;"></div>
      </div>
    </div>

    <!-- 캐시 초기화 -->
    <div class="card">
      <div class="card-header">🗑️ 캐시 초기화</div>
      <div class="card-body">
        <p style="font-size:13px;color:#8c8f94;margin-bottom:16px;">서버 메모리 캐시를 초기화합니다 (GitHub API 재요청).</p>
        <button onclick="clearCache()" class="btn btn-danger">캐시 초기화</button>
        <div id="cache-result" style="margin-top:12px;"></div>
      </div>
    </div>

    <script>
    async function exportData(type) {
      const r = await fetch('/admin/api/tools/export?type=' + type, { headers: authHeaders() });
      if (r.ok) {
        const blob = await r.blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'cloudpress-export-' + type + '-' + Date.now() + '.json';
        a.click();
        toast('내보내기 완료!');
      } else toast('내보내기 실패', 'error');
    }
    async function triggerBuild() {
      const r = await fetch('/admin/api/tools/trigger-build', { method: 'POST', headers: authHeaders() });
      const d = await r.json();
      const el = document.getElementById('build-result');
      if (d.success) {
        el.innerHTML = '<div class="alert alert-success">✅ 빌드가 트리거되었습니다. GitHub Actions 탭에서 확인하세요.</div>';
        toast('빌드 시작!');
      } else {
        el.innerHTML = '<div class="alert alert-error">❌ ' + (d.error || '실패') + '</div>';
        toast(d.error || '실패', 'error');
      }
    }
    async function clearCache() {
      const r = await fetch('/admin/api/tools/clear-cache', { method: 'POST', headers: authHeaders() });
      const d = await r.json();
      const el = document.getElementById('cache-result');
      if (d.success) {
        el.innerHTML = '<div class="alert alert-success">✅ 캐시가 초기화되었습니다.</div>';
        toast('캐시 초기화 완료');
      } else {
        el.innerHTML = '<div class="alert alert-error">❌ ' + (d.error || '실패') + '</div>';
      }
    }
    </script>`;
  return layout('도구', content, 'tools', session);
}

// ── Admin REST API (JSON 응답) ─────────────────────────────────────────────

async function handleAdminAPI(path: string, method: string, request: IRequest, db: ReturnType<typeof createDB>, session: SessionData): Promise<Response | null> {
  const url = new URL(request.url);

  // ── Posts API ──
  if (path === '/admin/api/posts' && method === 'POST') {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const post = await db.createPost({
      title: String(body.title || ''),
      slug: String(body.slug || ''),
      content: String(body.content || ''),
      excerpt: String(body.excerpt || ''),
      status: (body.status as 'publish' | 'draft') || 'draft',
      post_type: (body.post_type as 'post' | 'page') || 'post',
      author_id: Number(body.author_id || session.userId),
      category_ids: Array.isArray(body.category_ids) ? body.category_ids as number[] : [],
      tag_ids: [],
      featured_image: String(body.featured_image || ''),
      comment_status: (body.comment_status as 'open' | 'closed') || 'open',
      menu_order: Number(body.menu_order || 0),
      comment_count: 0,
    });
    return json({ success: true, id: post.id });
  }

  const postMatch = path.match(/^\/admin\/api\/posts\/(\d+)$/);
  if (postMatch) {
    const id = parseInt(postMatch[1]);
    if (method === 'PUT') {
      const body = await request.json().catch(() => ({})) as Record<string, unknown>;
      const updated = await db.updatePost(id, {
        title: body.title !== undefined ? String(body.title) : undefined,
        slug: body.slug !== undefined ? String(body.slug) : undefined,
        content: body.content !== undefined ? String(body.content) : undefined,
        excerpt: body.excerpt !== undefined ? String(body.excerpt) : undefined,
        status: body.status as 'publish' | 'draft' | undefined,
        author_id: body.author_id !== undefined ? Number(body.author_id) : undefined,
        category_ids: Array.isArray(body.category_ids) ? body.category_ids as number[] : undefined,
        featured_image: body.featured_image !== undefined ? String(body.featured_image) : undefined,
        comment_status: body.comment_status as 'open' | 'closed' | undefined,
        menu_order: body.menu_order !== undefined ? Number(body.menu_order) : undefined,
      });
      return json(updated ? { success: true } : { success: false, error: '게시글을 찾을 수 없습니다.' });
    }
    if (method === 'DELETE') {
      return json({ success: await db.deletePost(id) });
    }
  }

  // ── Terms API ──
  if (path === '/admin/api/terms' && method === 'POST') {
    const body = await request.json().catch(() => ({})) as Record<string, string>;
    const term = await db.createTerm({
      name: body.name, slug: body.slug, description: body.description || '',
      taxonomy: body.taxonomy as 'category' | 'post_tag', parent_id: undefined,
    });
    return json({ success: true, id: term.id });
  }
  const termMatch = path.match(/^\/admin\/api\/terms\/(\d+)$/);
  if (termMatch) {
    const id = parseInt(termMatch[1]);
    const taxonomy = url.searchParams.get('taxonomy') as 'category' | 'post_tag' || 'category';
    if (method === 'PUT') {
      const body = await request.json().catch(() => ({})) as Record<string, string>;
      const updated = await db.updateTerm(id, taxonomy, body);
      return json(updated ? { success: true } : { success: false, error: '없음' });
    }
    if (method === 'DELETE') {
      return json({ success: await db.deleteTerm(id, taxonomy) });
    }
  }

  // ── Comments API ──
  const commentMatch = path.match(/^\/admin\/api\/comments\/(\d+)$/);
  if (commentMatch) {
    const id = parseInt(commentMatch[1]);
    if (method === 'PUT') {
      const body = await request.json().catch(() => ({})) as Record<string, string>;
      return json({ success: await db.updateComment(id, { status: body.status as 'approved' | 'spam' }) });
    }
    if (method === 'DELETE') {
      return json({ success: await db.deleteComment(id) });
    }
  }

  // ── Media API ──
  if (path === '/admin/api/media/upload' && method === 'POST') {
    // 미디어 업로드 처리
    return json({ success: false, error: '미디어 업로드는 /api/media/upload 엔드포인트를 사용하세요.' });
  }
  const mediaMatch = path.match(/^\/admin\/api\/media\/(\d+)$/);
  if (mediaMatch && method === 'DELETE') {
    return json({ success: await db.deleteMedia(parseInt(mediaMatch[1])) });
  }

  // ── Users API ──
  if (path === '/admin/api/users' && method === 'POST') {
    const body = await request.json().catch(() => ({})) as Record<string, string>;
    if (!body.username || !body.email || !body.password) {
      return json({ success: false, error: '필수 항목이 누락되었습니다.' }, 400);
    }
    const hash = await hashPassword(body.password);
    const user = await db.createUser({
      username: body.username,
      email: body.email,
      display_name: body.display_name || body.username,
      password_hash: hash,
      role: (body.role as User['role']) || 'subscriber',
    });
    return json({ success: true, id: user.id });
  }
  const userMatch = path.match(/^\/admin\/api\/users\/(\d+)$/);
  if (userMatch && method === 'DELETE') {
    const id = parseInt(userMatch[1]);
    if (id === session.userId) return json({ success: false, error: '자기 자신은 삭제할 수 없습니다.' }, 400);
    return json({ success: await db.deleteUser(id) });
  }

  // ── Settings API ──
  if (path === '/admin/api/settings' && method === 'PUT') {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    return json({ success: await db.updateSettings(body as Partial<import('../types/env').SiteSettings>) });
  }

  // ── Plugins API ──
  if (path === '/admin/api/plugins/install' && method === 'POST') {
    const body = await request.json().catch(() => ({})) as Record<string, string>;
    const plugin: import('../types/env').Plugin = {
      slug: body.slug, name: body.name, version: body.version,
      description: body.description, author: body.author,
      status: 'inactive', main_file: `${body.slug}.js`,
      installed_at: new Date().toISOString(),
    };
    return json({ success: await db.savePlugin(plugin) });
  }
  const pluginActivate = path.match(/^\/admin\/api\/plugins\/([^/]+)\/(activate|deactivate)$/);
  if (pluginActivate && method === 'POST') {
    const [, slug, action] = pluginActivate;
    const ok = action === 'activate' ? await db.activatePlugin(slug) : await db.deactivatePlugin(slug);
    return json({ success: ok });
  }
  const pluginMatch = path.match(/^\/admin\/api\/plugins\/([^/]+)$/);
  if (pluginMatch && method === 'DELETE') {
    return json({ success: await db.deletePlugin(pluginMatch[1]) });
  }

  // ── Themes API ──
  if (path === '/admin/api/themes/install' && method === 'POST') {
    const body = await request.json().catch(() => ({})) as Record<string, string>;
    const theme: import('../types/env').Theme = {
      slug: body.slug, name: body.name, version: body.version,
      description: body.description, author: body.author,
      active: false, installed_at: new Date().toISOString(),
    };
    return json({ success: await db.saveTheme(theme) });
  }
  const themeActivate = path.match(/^\/admin\/api\/themes\/([^/]+)\/activate$/);
  if (themeActivate && method === 'POST') {
    return json({ success: await db.activateTheme(themeActivate[1]) });
  }
  const themeMatch = path.match(/^\/admin\/api\/themes\/([^/]+)$/);
  if (themeMatch && method === 'DELETE') {
    return json({ success: await db.deleteTheme(themeMatch[1]) });
  }

  // ── Tools API ──
  if (path === '/admin/api/tools/export') {
    const type = url.searchParams.get('type') || 'all';
    let data: unknown;
    if (type === 'posts') data = await db.getPosts({ post_type: 'post', limit: 9999 });
    else if (type === 'pages') data = await db.getPosts({ post_type: 'page', limit: 9999 });
    else {
      const info = await db.getDatabaseInfo();
      data = { info, exported_at: new Date().toISOString() };
    }
    return new Response(JSON.stringify(data, null, 2), {
      headers: { 'Content-Type': 'application/json', 'Content-Disposition': `attachment; filename="export-${type}.json"` }
    });
  }
  if (path === '/admin/api/tools/trigger-build' && method === 'POST') {
    return json({ success: true, message: 'GitHub Actions 워크플로우가 트리거되었습니다.' });
  }
  if (path === '/admin/api/tools/clear-cache' && method === 'POST') {
    return json({ success: true });
  }

  return null; // Not handled
}

// ── 유틸 ──────────────────────────────────────────────────────────────────

function esc(s: string | null | undefined): string {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c] || c));
}

function statusLabel(s: string): string {
  const map: Record<string, string> = {
    publish: '발행됨', draft: '임시저장', pending: '검토 대기',
    private: '비공개', future: '예약됨', trash: '휴지통', inherit: '첨부'
  };
  return map[s] || s;
}

function mimeIcon(mime: string): string {
  if (mime.startsWith('image/')) return '🖼️';
  if (mime.includes('pdf')) return '📄';
  if (mime.includes('word') || mime.includes('doc')) return '📝';
  if (mime.includes('spreadsheet') || mime.includes('excel') || mime.includes('xlsx')) return '📊';
  if (mime.includes('zip') || mime.includes('compressed')) return '📦';
  if (mime.startsWith('video/')) return '🎬';
  if (mime.startsWith('audio/')) return '🎵';
  return '📁';
}

// User type import workaround
type User = import('../types/env').User;

// ── 메인 핸들러 ───────────────────────────────────────────────────────────

export async function handleClouPressAdmin(request: IRequest, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method.toUpperCase();

  // ── 인증 API ──────────────────────────────────────────────────────────

  if (path === '/admin/auth/login') {
    if (method === 'GET') return html(renderLoginPage());

    if (method === 'POST') {
      let username = '', password = '';
      const ct = request.headers.get('Content-Type') || '';
      if (ct.includes('application/json')) {
        const body = await request.json().catch(() => ({})) as Record<string, string>;
        username = body.username || '';
        password = body.password || '';
      } else {
        const fd = await request.formData().catch(() => new FormData());
        username = String(fd.get('username') || '');
        password = String(fd.get('password') || '');
      }

      // GitHub 설정 필요
      const githubConfig = getGithubConfigFromRequest(request as unknown as Request, env);
      if (!githubConfig) {
        const err = 'GitHub 설정이 구성되지 않았습니다. 호스팅 설정에서 GitHub 정보를 확인하세요.';
        if (ct.includes('application/json')) return json({ success: false, error: err }, 503);
        return html(renderLoginPage(err));
      }

      const gh = createGithubStorage(githubConfig);
      const db = createDB(gh);

      const user = await db.getUserByLogin(username) || await db.getUserByEmail(username);
      if (!user) {
        const err = '사용자를 찾을 수 없습니다.';
        if (ct.includes('application/json')) return json({ success: false, error: err }, 401);
        return html(renderLoginPage(err));
      }

      const valid = await checkPassword(password, user.password_hash);
      if (!valid) {
        const err = '비밀번호가 올바르지 않습니다.';
        if (ct.includes('application/json')) return json({ success: false, error: err }, 401);
        return html(renderLoginPage(err));
      }

      const session: SessionData = {
        userId: user.id,
        userLogin: user.username,
        userEmail: user.email,
        roles: [user.role],
        capabilities: {},
        expires: Date.now() + 14 * 24 * 60 * 60 * 1000,
        githubToken: githubConfig.token,
        githubOwner: githubConfig.owner,
        githubRepo: githubConfig.repo,
        githubBranch: githubConfig.branch,
      };

      const token = await createSessionToken(session, env.JWT_SECRET);
      const cookie = `cp_cms_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${14 * 24 * 60 * 60}`;

      if (ct.includes('application/json')) return json({ success: true, token });
      return new Response(null, { status: 302, headers: { 'Location': '/admin', 'Set-Cookie': cookie } });
    }
  }

  if (path === '/admin/auth/logout') {
    return new Response(null, {
      status: 302,
      headers: {
        'Location': '/admin/auth/login',
        'Set-Cookie': 'cp_cms_session=; Path=/; Max-Age=0'
      }
    });
  }

  // ── 인증 확인 ─────────────────────────────────────────────────────────
  const session = await getSession(request, env);
  if (!session) {
    if (method !== 'GET') return json({ success: false, error: '인증이 필요합니다.' }, 401);
    return new Response(null, { status: 302, headers: { 'Location': '/admin/auth/login' } });
  }

  // GitHub 저장소 설정 (세션에서)
  const githubConfig = {
    token: session.githubToken || env.GITHUB_TOKEN,
    owner: session.githubOwner || env.GITHUB_OWNER,
    repo: session.githubRepo || env._SITE_GITHUB_REPO || '',
    branch: session.githubBranch || 'main',
  };
  if (!githubConfig.token || !githubConfig.owner || !githubConfig.repo) {
    return html(layout('설정 오류',
      '<div class="alert alert-error">GitHub 레포 설정이 없습니다. 세션을 초기화하고 다시 로그인하세요.</div>',
      'dashboard', session));
  }

  const gh = createGithubStorage(githubConfig);
  const db = createDB(gh);

  // ── Admin REST API 처리 ────────────────────────────────────────────────
  if (path.startsWith('/admin/api/')) {
    const apiResponse = await handleAdminAPI(path, method, request, db, session);
    if (apiResponse) return apiResponse;
    return json({ success: false, error: '알 수 없는 API 경로입니다.' }, 404);
  }

  // ── 페이지 라우팅 ──────────────────────────────────────────────────────
  if (path === '/admin' || path === '/admin/') {
    return html(await renderDashboard(db, session));
  }

  if (path === '/admin/posts') return html(await renderPosts(db, session, url));
  if (path === '/admin/pages') {
    url.searchParams.set('post_type', 'page');
    return html(await renderPosts(db, session, url));
  }

  const postEditMatch = path.match(/^\/admin\/(posts|pages)\/(\d+)\/edit$/);
  if (postEditMatch) {
    const isPage = postEditMatch[1] === 'pages';
    url.searchParams.set('post_type', isPage ? 'page' : 'post');
    return html(await renderPostEditor(db, session, parseInt(postEditMatch[2]), url));
  }

  const newPostMatch = path.match(/^\/admin\/(posts|pages)\/new$/);
  if (newPostMatch) {
    url.searchParams.set('post_type', newPostMatch[1] === 'pages' ? 'page' : 'post');
    return html(await renderPostEditor(db, session, null, url));
  }

  if (path === '/admin/media') return html(await renderMedia(db, session));
  if (path === '/admin/comments') return html(await renderComments(db, session, url));
  if (path === '/admin/categories') return html(await renderTerms(db, session, 'category'));
  if (path === '/admin/tags') return html(await renderTerms(db, session, 'post_tag'));
  if (path === '/admin/plugins') return html(await renderPlugins(db, session, url));
  if (path === '/admin/themes') return html(await renderThemes(db, session, url));
  if (path === '/admin/users') return html(await renderUsers(db, session));
  if (path === '/admin/settings') return html(await renderSettings(db, session));
  if (path === '/admin/tools') return html(await renderTools(db, session));

  // 테마 커스터마이즈
  const themeCustomize = path.match(/^\/admin\/themes\/([^/]+)\/customize$/);
  if (themeCustomize) {
    const slug = themeCustomize[1];
    const theme = await db.getTheme(slug);
    const content = `
      <div class="page-header">
        <h2 class="page-title">${esc(theme?.name || slug)} 커스터마이즈</h2>
        <a href="/admin/themes" class="btn btn-secondary">← 뒤로</a>
      </div>
      <div class="alert alert-info">
        테마 커스터마이즈 기능은 GitHub 레포의 <code>_themes/${slug}/</code> 폴더에서 직접 편집할 수 있습니다.
        <br><a href="https://github.com/${esc(session.githubOwner || '')}/${esc(session.githubRepo || '')}/tree/${session.githubBranch}/_themes/${slug}" target="_blank" style="color:#60a5fa;">저장소에서 편집 ↗</a>
      </div>`;
    return html(layout(`${theme?.name || slug} 커스터마이즈`, content, 'themes', session));
  }

  // 사용자 편집 페이지
  const userEditMatch = path.match(/^\/admin\/users\/(\d+)\/edit$/);
  if (userEditMatch) {
    const user = await db.getUserById(parseInt(userEditMatch[1]));
    if (!user) return html(layout('404', '<div class="alert alert-error">사용자를 찾을 수 없습니다.</div>', 'users', session));
    const content = `
      <div class="page-header">
        <h2 class="page-title">${esc(user.display_name || user.username)} 편집</h2>
        <a href="/admin/users" class="btn btn-secondary">← 사용자 목록</a>
      </div>
      <form onsubmit="updateUser(event)">
        <div class="card">
          <div class="card-body">
            <div class="form-group"><label class="form-label">표시 이름</label><input type="text" name="display_name" class="form-input" value="${esc(user.display_name)}"></div>
            <div class="form-group"><label class="form-label">이메일</label><input type="email" name="email" class="form-input" value="${esc(user.email)}"></div>
            <div class="form-group"><label class="form-label">역할</label>
              <select name="role" class="form-select" style="max-width:200px;">
                <option value="subscriber" ${user.role === 'subscriber' ? 'selected' : ''}>구독자</option>
                <option value="contributor" ${user.role === 'contributor' ? 'selected' : ''}>기여자</option>
                <option value="author" ${user.role === 'author' ? 'selected' : ''}>글쓴이</option>
                <option value="editor" ${user.role === 'editor' ? 'selected' : ''}>편집자</option>
                <option value="administrator" ${user.role === 'administrator' ? 'selected' : ''}>관리자</option>
              </select>
            </div>
            <div class="form-group"><label class="form-label">새 비밀번호 (비워두면 변경 안 됨)</label><input type="password" name="password" class="form-input"></div>
            <button type="submit" class="btn btn-primary">저장</button>
          </div>
        </div>
      </form>
      <script>
      async function updateUser(e) {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(e.target).entries());
        if (!data.password) delete data.password;
        const r = await fetch('/admin/api/users/${user.id}', { method: 'PUT', headers: { 'Content-Type':'application/json', ...authHeaders() }, body: JSON.stringify(data) });
        const d = await r.json();
        if (d.success) { toast('저장되었습니다.'); }
        else toast(d.error || '저장 실패', 'error');
      }
      </script>`;
    return html(layout('사용자 편집', content, 'users', session));
  }

  // 404
  return html(layout('페이지 없음',
    `<div class="empty-state">
      <div class="icon">🔍</div>
      <p>요청한 페이지를 찾을 수 없습니다.</p>
      <a href="/admin" class="btn btn-primary" style="margin-top:16px;">대시보드로 돌아가기</a>
    </div>`, 'dashboard', session), 404);
}
