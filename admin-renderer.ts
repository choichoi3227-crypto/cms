import { SessionData } from '../types/env';
import { Env } from '../types/env';
import { WPDB } from '../utils/db';
import { PluginRegistry } from '../utils/plugins';
import { GitHubStorage } from '../utils/github';
import { generateNonce } from '../utils/crypto';
import { ADMIN_CSS } from './admin-css';
import { ADMIN_JS } from './admin-js';
import { GUTENBERG_HTML } from './gutenberg';

export async function renderAdminPage(
  path: string,
  url: URL,
  request: Request,
  session: SessionData,
  db: WPDB,
  env: Env,
  registry: PluginRegistry,
  github: GitHubStorage | null
): Promise<string> {
  const page = url.searchParams.get('page') || '';
  const postType = url.searchParams.get('post_type') || 'post';

  // Route to the right page
  let content = '';
  let pageTitle = 'WordPress 관리자';

  if (path.includes('index.php') || path.endsWith('/wp-admin/')) {
    content = await renderDashboard(db, env, session, registry);
    pageTitle = '대시보드';
  } else if (path.includes('edit.php')) {
    content = await renderPostList(db, env, session, postType, url);
    pageTitle = postType === 'page' ? '페이지' : '글';
  } else if (path.includes('post-new.php') || (path.includes('post.php') && url.searchParams.get('action') === 'edit')) {
    return await renderGutenbergEditor(path, url, db, env, session, registry);
  } else if (path.includes('post.php')) {
    return await renderGutenbergEditor(path, url, db, env, session, registry);
  } else if (path.includes('upload.php')) {
    content = await renderMediaLibrary(db, env, session, url);
    pageTitle = '미디어';
  } else if (path.includes('media-new.php')) {
    content = renderMediaUpload();
    pageTitle = '새 미디어 추가';
  } else if (path.includes('edit-comments.php')) {
    content = await renderComments(db, url);
    pageTitle = '댓글';
  } else if (path.includes('themes.php')) {
    if (url.searchParams.get('action') === 'customize') {
      content = await renderCustomizer(db);
      pageTitle = '테마 커스터마이저';
    } else {
      content = await renderThemes(db, env, url);
      pageTitle = '테마';
    }
  } else if (path.includes('theme-install.php')) {
    content = await renderThemeInstall();
    pageTitle = '테마 추가';
  } else if (path.includes('plugins.php')) {
    content = await renderPlugins(db, env, registry, url);
    pageTitle = '플러그인';
  } else if (path.includes('plugin-install.php')) {
    content = await renderPluginInstall(url);
    pageTitle = '플러그인 추가';
  } else if (path.includes('users.php')) {
    content = await renderUsers(db, url);
    pageTitle = '사용자';
  } else if (path.includes('user-new.php')) {
    content = renderNewUser();
    pageTitle = '새 사용자 추가';
  } else if (path.includes('profile.php') || path.includes('user-edit.php')) {
    content = await renderProfile(db, session);
    pageTitle = '프로필';
  } else if (path.includes('options-general.php')) {
    content = await renderSettingsGeneral(db, env);
    pageTitle = '일반 설정';
  } else if (path.includes('options-writing.php')) {
    content = await renderSettingsWriting(db);
    pageTitle = '쓰기 설정';
  } else if (path.includes('options-reading.php')) {
    content = await renderSettingsReading(db);
    pageTitle = '읽기 설정';
  } else if (path.includes('options-discussion.php')) {
    content = await renderSettingsDiscussion(db);
    pageTitle = '토론 설정';
  } else if (path.includes('options-media.php')) {
    content = await renderSettingsMedia(db);
    pageTitle = '미디어 설정';
  } else if (path.includes('options-permalink.php')) {
    content = await renderSettingsPermalink(db);
    pageTitle = '고유주소 설정';
  } else if (path.includes('options-privacy.php')) {
    content = renderSettingsPrivacy();
    pageTitle = '개인정보 설정';
  } else if (path.includes('nav-menus.php')) {
    content = await renderNavMenus(db, env);
    pageTitle = '메뉴';
  } else if (path.includes('widgets.php')) {
    content = await renderWidgets(db);
    pageTitle = '위젯';
  } else if (path.includes('edit-tags.php')) {
    content = await renderTaxonomy(db, url);
    pageTitle = url.searchParams.get('taxonomy') === 'category' ? '카테고리' : '태그';
  } else if (path.includes('tools.php')) {
    content = await renderTools(db, env);
    pageTitle = '도구';
  } else if (path.includes('import.php')) {
    content = renderImport();
    pageTitle = '가져오기';
  } else if (path.includes('export.php')) {
    content = renderExport();
    pageTitle = '내보내기';
  } else if (path.includes('update-core.php')) {
    content = renderUpdates();
    pageTitle = '업데이트';
  } else if (page) {
    // Plugin pages
    content = await renderPluginPage(page, url, request, db, env, session, registry);
    pageTitle = page;
  } else {
    content = '<div class="wrap"><h1>페이지를 찾을 수 없습니다</h1></div>';
  }

  return wrapAdminLayout(content, pageTitle, path, url, session, db, registry);
}

async function wrapAdminLayout(
  content: string,
  pageTitle: string,
  path: string,
  url: URL,
  session: SessionData,
  db: WPDB,
  registry: PluginRegistry
): Promise<string> {
  const siteName = await db.getOption('blogname', 'CF-WordPress');
  const siteUrl = await db.getOption('siteurl', '/');
  const nonce = generateNonce('wp_rest', session.userId);
  const pluginMenus = registry.getMenus();
  const pluginSubmenus = registry.getSubmenus();
  const activePlugins = JSON.parse(await db.getOption('active_plugins', '[]'));

  const postCount = await db.countPosts('post', 'publish');
  const pageCount = await db.countPosts('page', 'publish');
  const commentCount = await db['db'].prepare("SELECT COUNT(*) as c FROM wp_comments WHERE comment_approved = '0'").first<{c:number}>().then(r => r?.c ?? 0);

  return `<!DOCTYPE html>
<html lang="ko-KR" class="${path.includes('post.php') || path.includes('post-new.php') ? 'wp-toolbar' : ''}">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${pageTitle} &lsaquo; ${siteName} &#8212; CF-WordPress</title>
<link rel="stylesheet" href="/wp-admin/css/common.min.css"/>
<link rel="stylesheet" href="/wp-admin/css/wp-admin.min.css"/>
<link rel="stylesheet" href="/wp-admin/css/colors/blue/colors.min.css"/>
<link rel="stylesheet" href="/wp-admin/css/dashicons.min.css"/>
<link rel="stylesheet" href="/wp-admin/css/admin-menu.min.css"/>
<link rel="stylesheet" href="/wp-admin/css/dashboard.min.css"/>
<link rel="stylesheet" href="/wp-admin/css/list-tables.min.css"/>
<link rel="stylesheet" href="/wp-admin/css/edit.min.css"/>
<link rel="stylesheet" href="/wp-admin/css/media.min.css"/>
<link rel="stylesheet" href="/wp-admin/css/themes.min.css"/>
<link rel="stylesheet" href="/wp-admin/css/about.min.css"/>
<link rel="stylesheet" href="/wp-admin/css/nav-menus.min.css"/>
<link rel="stylesheet" href="/wp-admin/css/widgets.min.css"/>
<link rel="stylesheet" href="/wp-admin/css/site-health.min.css"/>
${registry.getAllAdminStyles().map(s => `<link rel="stylesheet" href="${s.src}"/>`).join('\n')}
<style>${ADMIN_CSS}</style>
</head>
<body class="wp-admin wp-core-ui ${path.replace(/.*\//, '').replace('.php', '')} ${session.roles.includes('administrator') ? 'admin-color-blue' : ''}">
<div id="wpwrap">

<!-- ── Top admin bar ───────────────────────────────────────────────── -->
<div id="wpadminbar" class="nojq">
  <div class="quicklinks" tabindex="0">
    <ul id="wp-toolbar" role="navigation" aria-label="툴바">
      <li id="wp-admin-bar-root-default" class="menupop">
        <a class="ab-item ab-top-menu" href="/wp-admin/">
          <span class="ab-icon" aria-hidden="true">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" width="20" height="20"><path fill="currentColor" d="M10 0C4.5 0 0 4.5 0 10s4.5 10 10 10 10-4.5 10-10S15.5 0 10 0zM2 10c0-1.2.3-2.4.7-3.4L6.6 17C3.8 15.5 2 12.9 2 10zm8 8c-.8 0-1.6-.1-2.4-.3l2.5-7.4 2.6 7.1c.1.2.2.3.3.4-.3.1-.7.2-1 .2zm1.1-11.9L13.5 14l.6-2.1c.3-.8.4-1.5.4-2.1 0-.8-.3-1.4-.6-1.9-.4-.6-.7-1.1-.7-1.7 0-.7.5-1.3 1.2-1.3h.1c-1.1-1-2.6-1.9-4.5-1.9-2.3 0-4.4 1.2-5.6 3h.4c.7 0 1.8-.1 1.8-.1.4 0 .4.5 0 .5 0 0-.4 0-.8.1l2.5 7.4 1.5-4.5-1.1-2.9c-.4 0-.7-.1-.7-.1-.4 0-.3-.5 0-.5 0 0 1.1.1 1.8.1.7 0 1.8-.1 1.8-.1.4 0 .4.5 0 .5l-.8.1zM14 16.9l2.5-7.3c.5-1.2.6-2.1.6-3 0-.3 0-.6-.1-.9C18 7.1 18 8.5 18 10c0 2.7-1.5 5-3 5l-1 1.9z"/></svg>
          </span>
          <span class="screen-reader-text">CF-WP</span>
        </a>
        <div class="ab-sub-wrapper">
          <ul class="ab-submenu">
            <li><a href="${siteUrl}/" target="_blank">사이트 방문</a></li>
            <li><a href="${siteUrl}/">대시보드</a></li>
          </ul>
        </div>
      </li>
      <li id="wp-admin-bar-site-name" class="menupop">
        <a class="ab-item" href="/wp-admin/">${siteName}</a>
      </li>
      <li id="wp-admin-bar-comments">
        <a class="ab-item" href="/wp-admin/edit-comments.php">
          <span class="ab-icon dashicons dashicons-admin-comments" aria-hidden="true"></span>
          <span class="ab-label">${commentCount > 0 ? `<span class="awaiting-mod count-${commentCount}"><span class="pending-count">${commentCount}</span></span>` : ''}</span>
        </a>
      </li>
      <li id="wp-admin-bar-new-content" class="menupop">
        <a class="ab-item" href="/wp-admin/post-new.php">
          <span class="ab-icon" aria-hidden="true">+</span>
          <span class="ab-label">새로 추가</span>
        </a>
        <div class="ab-sub-wrapper">
          <ul class="ab-submenu">
            <li><a href="/wp-admin/post-new.php">글</a></li>
            <li><a href="/wp-admin/media-new.php">미디어</a></li>
            <li><a href="/wp-admin/post-new.php?post_type=page">페이지</a></li>
            <li><a href="/wp-admin/user-new.php">사용자</a></li>
          </ul>
        </div>
      </li>
      <li id="wp-admin-bar-my-account" class="menupop with-avatar">
        <a class="ab-item" href="/wp-admin/profile.php">
          <img class="avatar avatar-26 photo" src="https://secure.gravatar.com/avatar/?s=26&d=mm" width="26" height="26" alt=""/>
          ${session.userLogin}
        </a>
        <div class="ab-sub-wrapper">
          <ul class="ab-submenu">
            <li id="wp-admin-bar-user-info"><a href="/wp-admin/profile.php">${session.userLogin}<br/><em>${session.userEmail}</em></a></li>
            <li><a href="/wp-admin/profile.php">프로필 수정</a></li>
            <li><a href="/wp-login.php?action=logout">로그아웃</a></li>
          </ul>
        </div>
      </li>
    </ul>
  </div>
</div>

<!-- ── Sidebar menu ────────────────────────────────────────────────── -->
<div id="adminmenuwrap">
<div id="adminmenuback"></div>
<ul id="adminmenu">
  ${renderMenuItem('/wp-admin/index.php', 'dashicons-dashboard', '대시보드', path, [
    { href: '/wp-admin/index.php', label: '홈' },
    { href: '/wp-admin/update-core.php', label: '업데이트' },
  ])}
  <li class="wp-menu-separator"></li>
  ${renderMenuItem('/wp-admin/edit.php', 'dashicons-admin-post', '글', path, [
    { href: '/wp-admin/edit.php', label: '모든 글' },
    { href: '/wp-admin/post-new.php', label: '새 글 쓰기' },
    { href: '/wp-admin/edit-tags.php?taxonomy=category', label: '카테고리' },
    { href: '/wp-admin/edit-tags.php?taxonomy=post_tag', label: '태그' },
  ])}
  ${renderMenuItem('/wp-admin/upload.php', 'dashicons-admin-media', '미디어', path, [
    { href: '/wp-admin/upload.php', label: '라이브러리' },
    { href: '/wp-admin/media-new.php', label: '새 미디어 추가' },
  ])}
  ${renderMenuItem('/wp-admin/edit.php?post_type=page', 'dashicons-admin-page', '페이지', path, [
    { href: '/wp-admin/edit.php?post_type=page', label: '모든 페이지' },
    { href: '/wp-admin/post-new.php?post_type=page', label: '새 페이지 추가' },
  ])}
  ${renderMenuItem('/wp-admin/edit-comments.php', 'dashicons-admin-comments', `댓글 ${commentCount > 0 ? `<span class="awaiting-mod count-${commentCount}">${commentCount}</span>` : ''}`, path, [])}
  <li class="wp-menu-separator"></li>
  ${renderMenuItem('/wp-admin/themes.php', 'dashicons-admin-appearance', '외모', path, [
    { href: '/wp-admin/themes.php', label: '테마' },
    { href: '/wp-admin/customize.php', label: '커스터마이즈' },
    { href: '/wp-admin/widgets.php', label: '위젯' },
    { href: '/wp-admin/nav-menus.php', label: '메뉴' },
    { href: '/wp-admin/theme-editor.php', label: '테마 파일 편집기' },
  ])}
  ${renderMenuItem('/wp-admin/plugins.php', 'dashicons-admin-plugins', `플러그인 ${activePlugins.length > 0 ? '' : ''}`, path, [
    { href: '/wp-admin/plugins.php', label: '설치된 플러그인' },
    { href: '/wp-admin/plugin-install.php', label: '새 플러그인 추가' },
    { href: '/wp-admin/plugin-editor.php', label: '플러그인 파일 편집기' },
  ])}
  ${renderMenuItem('/wp-admin/users.php', 'dashicons-admin-users', '사용자', path, [
    { href: '/wp-admin/users.php', label: '모든 사용자' },
    { href: '/wp-admin/user-new.php', label: '새 사용자 추가' },
    { href: '/wp-admin/profile.php', label: '내 프로필' },
  ])}
  ${renderMenuItem('/wp-admin/tools.php', 'dashicons-admin-tools', '도구', path, [
    { href: '/wp-admin/tools.php', label: '사용 가능한 도구' },
    { href: '/wp-admin/import.php', label: '가져오기' },
    { href: '/wp-admin/export.php', label: '내보내기' },
    { href: '/wp-admin/site-health.php', label: '사이트 상태' },
    { href: '/wp-admin/export-personal-data.php', label: '개인정보 내보내기' },
    { href: '/wp-admin/erase-personal-data.php', label: '개인정보 지우기' },
  ])}
  ${renderMenuItem('/wp-admin/options-general.php', 'dashicons-admin-settings', '설정', path, [
    { href: '/wp-admin/options-general.php', label: '일반' },
    { href: '/wp-admin/options-writing.php', label: '쓰기' },
    { href: '/wp-admin/options-reading.php', label: '읽기' },
    { href: '/wp-admin/options-discussion.php', label: '토론' },
    { href: '/wp-admin/options-media.php', label: '미디어' },
    { href: '/wp-admin/options-permalink.php', label: '고유주소' },
    { href: '/wp-admin/options-privacy.php', label: '개인정보' },
  ])}
  <li class="wp-menu-separator"></li>
  ${pluginMenus.map(m => renderPluginMenuItem(m, pluginSubmenus.filter(s => s.parent === m.menuSlug), path)).join('')}
  <li id="collapse-button">
    <button type="button" id="collapse-menu" class="button-link"><span class="collapse-button-icon" aria-hidden="true"></span><span class="collapse-button-label">메뉴 접기</span></button>
  </li>
</ul>
</div>

<!-- ── Main content ────────────────────────────────────────────────── -->
<div id="wpcontent">
  <div id="wpbody" role="main">
    <div id="wpbody-content">
      ${content}
      <div class="clear"></div>
    </div>
  </div>
  <div id="wpfooter" role="contentinfo">
    <p id="footer-left">
      <a href="https://wordpress.org/" target="_blank">CF-WordPress</a> &mdash; 클라우드플레어 기반 WordPress 호환 CMS
    </p>
    <p id="footer-upgrade">버전 6.7.1</p>
  </div>
</div>
</div><!-- #wpwrap -->

<div id="screen-meta" class="metabox-prefs">
  <div id="contextual-help-wrap" class="hidden" tabindex="-1">
    <div id="contextual-help-back"></div>
    <div id="contextual-help-columns"></div>
  </div>
</div>

<script src="/wp-includes/js/jquery/jquery.min.js"></script>
<script src="/wp-includes/js/jquery/jquery-migrate.min.js"></script>
<script src="/wp-admin/js/common.min.js"></script>
<script src="/wp-admin/js/wp-a11y.min.js"></script>
<script>
var ajaxurl = '/wp-admin/admin-ajax.php';
var wpApiSettings = { root: '/wp-json/', nonce: '${nonce}' };
var pagenow = '${path.replace(/.*\//, '').replace('.php', '')}';
var adminpage = '${path.replace(/.*\//, '').replace('.php', '')}-php';
var userSettings = { uid: '${session.userId}', time: '${Date.now()}', dmem: '0' };
var autosaveL10n = { autosaveInterval: 60, savingLabel: '초안 저장 중...', savedLabel: '초안이 저장되었습니다.' };
</script>
${registry.getAllAdminScripts().map(s => `<script src="${s.src}"></script>`).join('\n')}
<script>${ADMIN_JS}</script>
</body>
</html>`;
}

function renderMenuItem(href: string, icon: string, label: string, currentPath: string, submenu: Array<{href: string; label: string}>): string {
  const isActive = currentPath.includes(href.split('?')[0]) || currentPath === href;
  const cls = isActive ? 'wp-has-submenu wp-menu-open current' : 'wp-has-submenu';

  return `<li class="${cls}">
    <a href="${href}" class="menu-top ${isActive ? 'current' : ''}">
      <div class="wp-menu-arrow"><div></div></div>
      <div class="wp-menu-image dashicons-before ${icon}" aria-hidden="true"><br/></div>
      <div class="wp-menu-name">${label}</div>
    </a>
    ${submenu.length ? `
    <ul class="wp-submenu wp-submenu-wrap">
      <li class="wp-submenu-head" aria-hidden="true">${label}</li>
      ${submenu.map(s => `<li class="${currentPath === s.href ? 'current' : ''}"><a href="${s.href}">${s.label}</a></li>`).join('')}
    </ul>` : ''}
  </li>`;
}

function renderPluginMenuItem(menu: any, submenus: any[], currentPath: string): string {
  const page = currentPath.includes('admin.php') ? new URL('http://x' + currentPath).searchParams.get('page') : '';
  const isActive = page === menu.menuSlug;

  return `<li class="${isActive ? 'current' : ''}">
    <a href="/wp-admin/admin.php?page=${menu.menuSlug}" class="menu-top">
      <div class="wp-menu-image dashicons-before ${menu.iconUrl?.startsWith('dashicons') ? menu.iconUrl : 'dashicons-admin-plugins'}" aria-hidden="true"><br/></div>
      <div class="wp-menu-name">${menu.menuTitle}</div>
    </a>
    ${submenus.length ? `<ul class="wp-submenu">
      <li class="wp-submenu-head">${menu.menuTitle}</li>
      ${submenus.map(s => `<li><a href="/wp-admin/admin.php?page=${s.menuSlug}">${s.menuTitle}</a></li>`).join('')}
    </ul>` : ''}
  </li>`;
}

// ─── Page renderers ───────────────────────────────────────────────────

async function renderDashboard(db: WPDB, env: Env, session: SessionData, registry: PluginRegistry): Promise<string> {
  const siteName = await db.getOption('blogname');
  const siteUrl = await db.getOption('siteurl');
  const postCount = await db.countPosts('post', 'publish');
  const pageCount = await db.countPosts('page', 'publish');
  const commentCount = await db['db'].prepare("SELECT COUNT(*) as c FROM wp_comments").first<{c:number}>().then(r => r?.c ?? 0);
  const draftCount = await db.countPosts('post', 'draft');
  const recentPosts = await db.getPosts({ posts_per_page: 5, post_status: 'publish' });

  return `<div class="wrap about-wrap">
  <div id="dashboard-widgets-wrap">
  <div id="dashboard-widgets" class="metabox-holder">

  <!-- Column 1 -->
  <div id="postbox-container-1" class="postbox-container">

    <!-- At a Glance -->
    <div id="dashboard_right_now" class="postbox">
      <div class="postbox-header"><h2 class="hndle">한눈에 보기</h2></div>
      <div class="inside">
        <div class="main">
          <ul>
            <li class="post-count"><a href="/wp-admin/edit.php"><span class="dashicons dashicons-admin-post"></span> ${postCount}개의 글</a></li>
            <li class="page-count"><a href="/wp-admin/edit.php?post_type=page"><span class="dashicons dashicons-admin-page"></span> ${pageCount}개의 페이지</a></li>
            <li class="comment-count"><a href="/wp-admin/edit-comments.php"><span class="dashicons dashicons-admin-comments"></span> ${commentCount}개의 댓글</a></li>
          </ul>
          <div class="versions">
            <p>현재 <a href="${siteUrl}/" target="_blank">${siteName}</a>를 실행 중입니다.
            <br/><a href="/wp-admin/update-core.php">CF-WordPress 6.7.1</a></p>
          </div>
        </div>
      </div>
    </div>

    <!-- Quick Draft -->
    <div id="dashboard_quick_press" class="postbox">
      <div class="postbox-header"><h2 class="hndle">빠른 초안</h2></div>
      <div class="inside">
        <form method="post" id="quick-press" action="/wp-admin/post.php">
          <div class="input-text-wrap"><input type="text" name="post_title" id="title" autocomplete="off" placeholder="제목"/></div>
          <div class="textarea-wrap">
            <label class="screen-reader-text" for="content">내용</label>
            <textarea name="content" id="content" placeholder="무슨 생각을 하고 있나요?" class="mce-editor"></textarea>
          </div>
          <p class="pressthis-submit">
            <button type="submit" name="action" value="post-quickpress-save" class="button button-primary">초안 저장</button>
          </p>
          <input type="hidden" name="action" value="post-quickpress-save"/>
          <input type="hidden" name="post_status" value="draft"/>
          <input type="hidden" name="post_type" value="post"/>
        </form>
      </div>
    </div>

  </div><!-- col 1 -->

  <!-- Column 2 -->
  <div id="postbox-container-2" class="postbox-container">

    <!-- Activity -->
    <div id="dashboard_activity" class="postbox">
      <div class="postbox-header"><h2 class="hndle">활동</h2></div>
      <div class="inside">
        <div id="latest-comments">
          <h3>최근 게시된 글</h3>
          <ul>
            ${recentPosts.map(p => `<li>
              <span class="post-com-count-wrapper">
                <strong><a href="/wp-admin/post.php?post=${p.ID}&action=edit" class="post-title">${p.post_title}</a></strong>
                <br/><span style="color:#888;font-size:.85em">${p.post_date?.split(' ')[0]}</span>
              </span>
            </li>`).join('')}
            ${!recentPosts.length ? '<li>아직 글이 없습니다. <a href="/wp-admin/post-new.php">첫 글을 작성해 보세요!</a></li>' : ''}
          </ul>
        </div>
      </div>
    </div>

    <!-- Welcome -->
    <div id="dashboard_primary" class="postbox">
      <div class="postbox-header"><h2 class="hndle">CF-WordPress에 오신 것을 환영합니다!</h2></div>
      <div class="inside welcome-panel">
        <div class="welcome-panel-content">
          <h2>시작하기</h2>
          <div class="welcome-panel-column-container">
            <div class="welcome-panel-column">
              <h3>다음 단계</h3>
              <ul>
                <li><a href="/wp-admin/post-new.php" class="button button-primary button-hero">✏️ 첫 블로그 글 작성</a></li>
                <li><a href="/wp-admin/themes.php">🎨 테마 변경</a></li>
                <li><a href="/wp-admin/options-general.php">⚙️ 사이트 설정</a></li>
                <li><a href="/wp-admin/plugins.php">🔌 플러그인 관리</a></li>
              </ul>
            </div>
            <div class="welcome-panel-column">
              <h3>기능 안내</h3>
              <ul>
                <li><span class="dashicons dashicons-yes"></span> WordPress REST API 완전 호환</li>
                <li><span class="dashicons dashicons-yes"></span> 구텐베르크 블록 에디터</li>
                <li><span class="dashicons dashicons-yes"></span> GitHub 파일 스토리지</li>
                <li><span class="dashicons dashicons-yes"></span> Cloudflare Edge 초고속 캐싱</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>

  </div><!-- col 2 -->
  </div><!-- #dashboard-widgets -->
  </div><!-- #dashboard-widgets-wrap -->
  </div>`;
}

async function renderPostList(db: WPDB, env: Env, session: SessionData, postType: string, url: URL): Promise<string> {
  const status = url.searchParams.get('post_status') || 'all';
  const search = url.searchParams.get('s') || '';
  const paged = parseInt(url.searchParams.get('paged') || '1');
  const perPage = 20;
  const offset = (paged - 1) * perPage;

  const posts = await db.getPosts({
    post_type: postType,
    post_status: status === 'all' ? 'any' : status as any,
    posts_per_page: perPage,
    offset,
    search: search || undefined
  });

  const totalPublish = await db.countPosts(postType, 'publish');
  const totalDraft = await db.countPosts(postType, 'draft');
  const totalTrash = await db.countPosts(postType, 'trash');
  const total = status === 'all' ? totalPublish + totalDraft : (status === 'publish' ? totalPublish : totalDraft);
  const totalPages = Math.ceil(total / perPage);

  const isPage = postType === 'page';
  const newUrl = isPage ? '/wp-admin/post-new.php?post_type=page' : '/wp-admin/post-new.php';
  const title = isPage ? '페이지' : '글';

  return `<div class="wrap">
  <h1 class="wp-heading-inline">${title}</h1>
  <a href="${newUrl}" class="page-title-action">새로 추가</a>
  ${search ? `<span class="subtitle">"${search}" 검색 결과</span>` : ''}
  <hr class="wp-header-end"/>

  <!-- Status tabs -->
  <ul class="subsubsub">
    <li><a href="/wp-admin/edit.php?post_type=${postType}" ${status === 'all' ? 'class="current"' : ''}>전체 <span class="count">(${totalPublish + totalDraft})</span></a> |</li>
    <li><a href="/wp-admin/edit.php?post_type=${postType}&post_status=publish" ${status === 'publish' ? 'class="current"' : ''}>발행됨 <span class="count">(${totalPublish})</span></a> |</li>
    <li><a href="/wp-admin/edit.php?post_type=${postType}&post_status=draft" ${status === 'draft' ? 'class="current"' : ''}>초안 <span class="count">(${totalDraft})</span></a> |</li>
    <li><a href="/wp-admin/edit.php?post_type=${postType}&post_status=trash" ${status === 'trash' ? 'class="current"' : ''}>휴지통 <span class="count">(${totalTrash})</span></a></li>
  </ul>

  <!-- Search -->
  <form id="posts-filter" method="get">
    <input type="hidden" name="post_type" value="${postType}"/>
    <p class="search-box">
      <input type="search" id="post-search-input" name="s" value="${search}" placeholder="${title} 검색"/>
      <input type="submit" id="search-submit" class="button" value="검색"/>
    </p>
  </form>

  <table class="wp-list-table widefat fixed striped ${isPage ? 'pages' : 'posts'}">
    <thead>
      <tr>
        <td class="manage-column column-cb check-column"><input id="cb-select-all-1" type="checkbox"/></td>
        <th class="manage-column column-title column-primary sortable">제목</th>
        <th class="manage-column column-author">작성자</th>
        ${!isPage ? '<th class="manage-column column-categories">카테고리</th>' : ''}
        ${!isPage ? '<th class="manage-column column-tags">태그</th><th class="manage-column column-comments">댓글</th>' : ''}
        <th class="manage-column column-date sortable">날짜</th>
      </tr>
    </thead>
    <tbody id="the-list">
      ${posts.length === 0 ? `<tr class="no-items"><td class="colspanchange" colspan="7">게시물이 없습니다.</td></tr>` : ''}
      ${posts.map(p => {
        const editUrl = `/wp-admin/post.php?post=${p.ID}&action=edit`;
        const statusLabel: Record<string, string> = { publish: '발행됨', draft: '초안', trash: '휴지통', future: '예약됨', private: '비공개', pending: '검토 대기' };
        const sLabel = statusLabel[p.post_status] || p.post_status;
        return `<tr id="post-${p.ID}" class="post-${p.ID} type-post status-${p.post_status}">
          <th scope="row" class="check-column"><input id="cb-select-${p.ID}" type="checkbox" name="post[]" value="${p.ID}"/></th>
          <td class="title column-title has-row-actions column-primary page-title">
            <strong><a class="row-title" href="${editUrl}">${p.post_title || '(제목 없음)'}</a></strong>
            ${p.post_status !== 'publish' ? `<span class="post-state">${sLabel}</span>` : ''}
            <div class="row-actions">
              <span class="edit"><a href="${editUrl}">편집</a> | </span>
              <span class="inline hide-if-no-js"><a href="#" class="editinline">빠른 편집</a> | </span>
              <span class="trash"><a href="/wp-admin/post.php?post=${p.ID}&action=trash" class="submitdelete">휴지통</a> | </span>
              <span class="view"><a href="/${p.post_name}/" target="_blank">보기</a></span>
            </div>
          </td>
          <td class="author column-author">${session.userLogin}</td>
          ${!isPage ? '<td class="categories column-categories">미분류</td><td class="tags column-tags">—</td><td class="comments column-comments">0</td>' : ''}
          <td class="date column-date">
            <abbr title="${p.post_date}">${p.post_date?.split(' ')[0]}</abbr>
          </td>
        </tr>`;
      }).join('')}
    </tbody>
  </table>

  <!-- Pagination -->
  ${totalPages > 1 ? `<div class="tablenav bottom">
    <div class="tablenav-pages">
      <span class="displaying-num">${total}개 항목</span>
      <span class="pagination-links">
        ${paged > 1 ? `<a class="prev-page" href="?post_type=${postType}&paged=${paged-1}">‹</a>` : '<span class="tablenav-pages-navspan button disabled" aria-hidden="true">‹</span>'}
        <span class="paging-input"><label for="current-page-selector" class="screen-reader-text">현재 페이지</label>
          <input class="current-page" id="current-page-selector" type="text" name="paged" value="${paged}" size="1" aria-describedby="table-paging">
          <span class="tablenav-paging-text"> / <span class="total-pages">${totalPages}</span></span>
        </span>
        ${paged < totalPages ? `<a class="next-page" href="?post_type=${postType}&paged=${paged+1}">›</a>` : '<span class="tablenav-pages-navspan button disabled" aria-hidden="true">›</span>'}
      </span>
    </div>
  </div>` : ''}
  </div>`;
}

async function renderGutenbergEditor(path: string, url: URL, db: WPDB, env: Env, session: SessionData, registry: PluginRegistry): Promise<string> {
  const postId = parseInt(url.searchParams.get('post') || '0');
  const postType = url.searchParams.get('post_type') || 'post';
  const post = postId ? await db.getPost(postId) : null;

  const siteName = await db.getOption('blogname');
  const siteUrl = await db.getOption('siteurl');
  const nonce = generateNonce('wp_rest', session.userId);
  const metaBoxes = registry.getMetaBoxes(postType);

  return GUTENBERG_HTML({ post, postType, siteName, siteUrl, nonce, session, metaBoxes, registry });
}

async function renderMediaLibrary(db: WPDB, env: Env, session: SessionData, url: URL): Promise<string> {
  const mediaItems = await db.getPosts({ post_type: 'attachment', post_status: 'inherit', posts_per_page: 60 });

  return `<div class="wrap">
  <h1 class="wp-heading-inline">미디어 라이브러리</h1>
  <a href="/wp-admin/media-new.php" class="page-title-action">새 미디어 추가</a>
  <hr class="wp-header-end"/>

  <div id="wp-media-grid" class="wp-list-table widefat fixed" data-columns="">
    <div id="media-attachment-filters" class="wp-filter hide-if-no-js">
      <ul class="filter-links">
        <li><a href="/wp-admin/upload.php" class="current">모두</a></li>
        <li><a href="/wp-admin/upload.php?post_mime_type=image">이미지</a></li>
        <li><a href="/wp-admin/upload.php?post_mime_type=video">비디오</a></li>
        <li><a href="/wp-admin/upload.php?post_mime_type=audio">오디오</a></li>
      </ul>
      <form class="search-form"><input type="search" name="s" placeholder="미디어 검색"/></form>
    </div>

    <div class="attachments-browser">
      <ul class="attachments">
        ${mediaItems.map(m => {
          const isImage = m.post_mime_type?.startsWith('image/');
          return `<li class="attachment" data-id="${m.ID}" data-type="${m.post_mime_type}">
            <div class="attachment-preview">
              <div class="thumbnail">
                ${isImage ? `<div class="centered"><img src="${m.guid}" draggable="false" alt=""/></div>` : `<div class="icon"><img src="/wp-admin/images/media/${m.post_mime_type?.split('/')[1] || 'default'}.png" alt=""/></div>`}
              </div>
              <button type="button" class="button-link check" tabindex="-1"><span class="media-modal-icon"></span></button>
            </div>
            <div class="attachment-details"><p>${m.post_title}</p></div>
          </li>`;
        }).join('')}
      </ul>
      ${!mediaItems.length ? '<p style="text-align:center;padding:2rem">미디어 파일이 없습니다. <a href="/wp-admin/media-new.php">파일을 업로드하세요.</a></p>' : ''}
    </div>
  </div>
  </div>`;
}

function renderMediaUpload(): string {
  return `<div class="wrap">
  <h1>미디어 추가</h1>
  <div id="plupload-upload-ui" class="hide-if-no-js">
    <div id="drag-drop-area" style="border:2px dashed #c3c4c7;border-radius:4px;padding:4rem;text-align:center;cursor:pointer">
      <div class="drag-drop-inside">
        <p class="drag-drop-info">파일을 여기에 끌어다 놓으세요</p>
        <p>또는</p>
        <p class="drag-drop-buttons">
          <label for="plupload-browse-button" class="button">파일 선택</label>
          <input type="file" id="plupload-browse-button" multiple style="display:none" onchange="handleFileUpload(this)"/>
        </p>
      </div>
    </div>
    <div id="plupload-status-bar" style="margin-top:1rem"></div>
  </div>
  <script>
  function handleFileUpload(input) {
    const files = Array.from(input.files);
    const bar = document.getElementById('plupload-status-bar');
    files.forEach(async file => {
      const fd = new FormData();
      fd.append('action', 'upload-attachment');
      fd.append('async-upload', file);
      fd.append('name', file.name);
      const res = await fetch('/wp-admin/admin-ajax.php', { method: 'POST', body: fd });
      const data = await res.json();
      if (data.success) {
        bar.innerHTML += '<p>✓ ' + file.name + ' 업로드 완료</p>';
      } else {
        bar.innerHTML += '<p>✗ ' + file.name + ' 업로드 실패</p>';
      }
    });
  }
  document.getElementById('drag-drop-area').addEventListener('dragover', e => { e.preventDefault(); e.currentTarget.style.background = '#f0f6fc'; });
  document.getElementById('drag-drop-area').addEventListener('dragleave', e => { e.currentTarget.style.background = ''; });
  document.getElementById('drag-drop-area').addEventListener('drop', e => {
    e.preventDefault(); e.currentTarget.style.background = '';
    const input = document.createElement('input'); input.type = 'file'; input.multiple = true;
    const dt = e.dataTransfer; if (!dt) return;
    const fake = { files: dt.files };
    handleFileUpload(fake);
  });
  </script>
  </div>`;
}

async function renderComments(db: WPDB, url: URL): Promise<string> {
  const status = url.searchParams.get('comment_status') || 'all';
  const comments = await db['db'].prepare(
    "SELECT c.*, p.post_title FROM wp_comments c LEFT JOIN wp_posts p ON c.comment_post_ID = p.ID ORDER BY c.comment_date DESC LIMIT 50"
  ).all<any>().then(r => r.results);

  return `<div class="wrap">
  <h1>댓글</h1>
  <ul class="subsubsub">
    <li><a href="/wp-admin/edit-comments.php" class="${status === 'all' ? 'current' : ''}">모두 <span class="count">(${comments.length})</span></a> |</li>
    <li><a href="/wp-admin/edit-comments.php?comment_status=moderated">검토 대기</a> |</li>
    <li><a href="/wp-admin/edit-comments.php?comment_status=approved">승인됨</a> |</li>
    <li><a href="/wp-admin/edit-comments.php?comment_status=spam">스팸</a></li>
  </ul>
  <table class="wp-list-table widefat fixed striped comments">
    <thead><tr>
      <td class="manage-column column-cb check-column"><input type="checkbox"/></td>
      <th class="manage-column column-author">작성자</th>
      <th class="manage-column column-comment has-row-actions column-primary">댓글</th>
      <th class="manage-column column-response">글</th>
      <th class="manage-column column-date">제출일</th>
    </tr></thead>
    <tbody>
      ${!comments.length ? '<tr><td colspan="5">댓글이 없습니다.</td></tr>' : ''}
      ${comments.map((c: any) => `<tr class="comment-item ${c.comment_approved === '0' ? 'unapproved' : ''}">
        <th scope="row" class="check-column"><input type="checkbox" name="delete_comments[]" value="${c.comment_ID}"/></th>
        <td class="author column-author">
          <strong>${c.comment_author}</strong><br/>
          <a href="mailto:${c.comment_author_email}">${c.comment_author_email}</a><br/>
          ${c.comment_author_IP}
        </td>
        <td class="comment column-comment has-row-actions column-primary">
          <div class="comment-author">${c.comment_content}</div>
          <div class="row-actions">
            <span class="approve">${c.comment_approved === '1' ? '<a href="#" onclick="commentAction(\'unapprove\','+c.comment_ID+')">승인 취소</a>' : '<a href="#" onclick="commentAction(\'approve\','+c.comment_ID+')">승인</a>'} | </span>
            <span class="edit"><a href="#">편집</a> | </span>
            <span class="spam"><a href="#" onclick="commentAction(\'spam\',${c.comment_ID})">스팸</a> | </span>
            <span class="delete"><a href="#" onclick="commentAction(\'delete\',${c.comment_ID})">삭제</a></span>
          </div>
        </td>
        <td class="response column-response"><a href="#">${c.post_title || ''}</a></td>
        <td class="date column-date">${c.comment_date?.split(' ')[0]}</td>
      </tr>`).join('')}
    </tbody>
  </table>
  <script>
  async function commentAction(action, id) {
    const fd = new FormData();
    fd.append('action', action + '-comment');
    fd.append('id', id);
    const res = await fetch('/wp-admin/admin-ajax.php', { method: 'POST', body: fd });
    location.reload();
  }
  </script>
  </div>`;
}

async function renderThemes(db: WPDB, env: Env, url: URL): Promise<string> {
  const activeTheme = await db.getOption('template', 'twentytwentyfour');

  return `<div class="wrap">
  <h1>테마 <a href="/wp-admin/theme-install.php" class="page-title-action">새 테마 추가</a></h1>
  <div id="wpbody-content">
  <div class="theme-browser">
    <div class="themes wp-clearfix">

      <!-- Active theme -->
      <div class="theme active" tabindex="0">
        <div class="theme-screenshot"><img src="https://i0.wp.com/themes.svn.wordpress.org/${activeTheme}/screenshot.png" alt="${activeTheme}"/></div>
        <span class="more-details">테마 세부정보</span>
        <div class="theme-overlay"></div>
        <div class="theme-author">현재 테마: <strong>${activeTheme}</strong></div>
        <div class="theme-actions">
          <a class="button button-primary customize load-customize hide-if-no-customize" href="/wp-admin/customize.php">커스터마이즈</a>
        </div>
      </div>

    </div>
    <p class="theme-install-php"><a href="/wp-admin/theme-install.php">더 많은 테마 찾아보기</a></p>
  </div>
  </div>
  </div>`;
}

async function renderThemeInstall(): Promise<string> {
  return `<div class="wrap">
  <h1>테마 추가</h1>
  <div class="wp-filter">
    <ul class="filter-links">
      <li><a href="#" class="current" id="filter-popular">인기</a></li>
      <li><a href="#" id="filter-latest">최신</a></li>
    </ul>
    <form class="search-form">
      <input type="search" id="theme-search-input" placeholder="테마 검색..." oninput="searchThemes(this.value)"/>
    </form>
  </div>
  <div id="theme-list" class="themes wp-clearfix">
    <div class="loading-themes">테마를 불러오는 중...</div>
  </div>
  <script>
  async function searchThemes(q) {
    const list = document.getElementById('theme-list');
    list.innerHTML = '<div class="loading-themes">검색 중...</div>';
    try {
      const res = await fetch('https://api.wordpress.org/themes/info/1.1/?action=query_themes&request[search]='+encodeURIComponent(q)+'&request[per_page]=12&request[fields][screenshot_url]=true');
      const data = await res.json();
      list.innerHTML = '';
      (data.themes || []).forEach(t => {
        list.innerHTML += '<div class="theme"><div class="theme-screenshot"><img src="'+t.screenshot_url+'" alt="'+t.name+'"/></div><div class="theme-author"><span>'+t.name+'</span></div><div class="theme-actions"><button class="button button-primary" onclick="installTheme(\''+t.slug+'\')">설치</button></div></div>';
      });
    } catch(e) { list.innerHTML = '<p>테마 목록을 불러오지 못했습니다.</p>'; }
  }
  async function installTheme(slug) {
    const fd = new FormData(); fd.append('action','install-theme'); fd.append('slug', slug);
    const res = await fetch('/wp-admin/admin-ajax.php', { method:'POST', body:fd });
    const data = await res.json();
    if(data.success) {
      if(confirm('테마를 활성화하시겠습니까?')) {
        const fd2 = new FormData(); fd2.append('action','activate-theme'); fd2.append('stylesheet',slug);
        await fetch('/wp-admin/admin-ajax.php', { method:'POST', body:fd2 });
        location.href = '/wp-admin/themes.php';
      }
    }
  }
  searchThemes('');
  </script>
  </div>`;
}

async function renderPlugins(db: WPDB, env: Env, registry: PluginRegistry, url: URL): Promise<string> {
  const activePluginsStr = await db.getOption('active_plugins', '[]');
  let activePlugins: string[] = [];
  try { activePlugins = JSON.parse(activePluginsStr); } catch {}

  const builtins = [
    { slug: 'wp-rocket', name: 'WP Rocket', version: '3.17.0', description: '페이지 캐싱, 파일 최적화, 미디어 지연 로딩으로 사이트 속도를 높입니다.', author: 'WP Media' },
    { slug: 'aibp-pro', name: 'AIBP Pro: AI Blog Posting', version: '1.2.2', description: 'AI로 SEO 최적화된 블로그 글과 썸네일을 자동 작성합니다.', author: 'jiji15899' },
    { slug: 'alpack', name: 'AL Pack', version: '1.3.1', description: '방문자 통계, 소셜 공유, 무효 클릭 차단 통합 플러그인.', author: 'PressLearn' },
    { slug: 'bridge-migration', name: 'Bridge Migration', version: '1.1.0', description: '기존 WordPress 사이트 데이터를 완벽하게 이전합니다. 모든 호스팅 지원.', author: 'Bridge Team' },
  ];

  return `<div class="wrap">
  <h1 class="wp-heading-inline">플러그인 <a href="/wp-admin/plugin-install.php" class="page-title-action">새 플러그인 추가</a></h1>
  <hr class="wp-header-end"/>
  <table class="wp-list-table widefat fixed striped plugins">
    <thead><tr>
      <td class="manage-column column-cb check-column"><input type="checkbox"/></td>
      <th class="manage-column column-name column-primary">플러그인</th>
      <th class="manage-column column-description">설명</th>
    </tr></thead>
    <tbody id="the-list">
      ${builtins.map(p => {
        const isActive = activePlugins.some(a => a.startsWith(p.slug));
        return `<tr class="${isActive ? 'active' : 'inactive'}">
          <th scope="row" class="check-column"><input type="checkbox" name="checked[]" value="${p.slug}/${p.slug}.php"/></th>
          <td class="plugin-title column-primary">
            <strong>${p.name}</strong>
            <div class="row-actions visible">
              ${isActive
                ? `<span class="deactivate"><a href="#" onclick="pluginAction('deactivate','${p.slug}/${p.slug}.php')">비활성화</a></span>`
                : `<span class="activate"><a href="#" onclick="pluginAction('activate','${p.slug}/${p.slug}.php')">활성화</a></span> | <span class="delete"><a href="#" onclick="pluginAction('delete','${p.slug}/${p.slug}.php')" style="color:#b32d2e">삭제</a></span>`}
              <span class="edit"> | <a href="/wp-admin/admin.php?page=${p.slug}-settings">설정</a></span>
            </div>
          </td>
          <td class="column-description desc">
            <div class="plugin-description"><p>${p.description}</p></div>
            <div class="second plugin-version-author-uri">
              버전 ${p.version} | 제작: ${p.author}
            </div>
          </td>
        </tr>`;
      }).join('')}
    </tbody>
  </table>
  <script>
  async function pluginAction(action, plugin) {
    const fd = new FormData();
    fd.append('action', action + '-plugin');
    fd.append('plugin', plugin);
    const res = await fetch('/wp-admin/admin-ajax.php', { method: 'POST', body: fd });
    const data = await res.json();
    if(data.success) location.reload();
    else alert('오류: ' + JSON.stringify(data));
  }
  </script>
  </div>`;
}

async function renderPluginInstall(url: URL): Promise<string> {
  const tab = url.searchParams.get('tab') || 'search';
  return `<div class="wrap">
  <h1>플러그인 추가</h1>
  <div class="wp-filter">
    <ul class="filter-links">
      <li><a href="/wp-admin/plugin-install.php?tab=popular" ${tab==='popular'?'class="current"':''}>인기</a></li>
      <li><a href="/wp-admin/plugin-install.php?tab=latest" ${tab==='latest'?'class="current"':''}>최신</a></li>
      <li><a href="/wp-admin/plugin-install.php?tab=search" ${tab==='search'?'class="current"':''}>검색</a></li>
      <li><a href="/wp-admin/plugin-install.php?tab=upload" ${tab==='upload'?'class="current"':''}>업로드</a></li>
    </ul>
    <form class="search-form" id="plugin-filter">
      <input type="search" id="search-plugins" name="s" placeholder="플러그인 검색..." oninput="searchPlugins(this.value)"/>
    </form>
  </div>

  ${tab === 'upload' ? `
  <div class="upload-plugin">
    <h2>플러그인 업로드</h2>
    <p>zip 파일로 압축된 플러그인이 있다면 업로드하여 설치할 수 있습니다.</p>
    <form method="post" enctype="multipart/form-data">
      <input type="file" name="pluginzip" accept=".zip" id="pluginzip"/>
      <button type="button" class="button button-primary" onclick="uploadPlugin()">지금 설치</button>
    </form>
    <script>
    async function uploadPlugin() {
      const file = document.getElementById('pluginzip').files[0];
      if(!file) { alert('파일을 선택하세요.'); return; }
      const fd = new FormData();
      fd.append('action', 'install-plugin-upload');
      fd.append('pluginzip', file);
      const res = await fetch('/wp-admin/admin-ajax.php', { method:'POST', body:fd });
      const data = await res.json();
      alert(data.success ? '설치 완료!' : '실패: '+JSON.stringify(data));
    }
    </script>
  </div>` : `
  <div id="plugin-list" class="plugin-install-tab-search"></div>
  <script>
  async function searchPlugins(q) {
    const list = document.getElementById('plugin-list');
    list.innerHTML = '<p>검색 중...</p>';
    try {
      const res = await fetch('https://api.wordpress.org/plugins/info/1.2/?action=query_plugins&request[search]='+encodeURIComponent(q||'wordpress')+'&request[per_page]=12');
      const data = await res.json();
      list.innerHTML = '<div class="plugins-grid">';
      (data.plugins||[]).forEach(p => {
        list.innerHTML += '<div class="plugin-card"><div class="plugin-card-top"><div class="name column-name"><h3>'+p.name+'</h3></div><div class="action-links"><a class="button button-primary" onclick="installPlugin(\''+p.slug+'\')">설치</a></div><div class="desc column-description"><p>'+p.short_description+'</p><p class="authors">제작: '+p.author+'</p></div></div><div class="plugin-card-bottom"><div class="column-rating"><span>★ '+(p.rating/20).toFixed(1)+'</span></div><div class="column-downloaded">'+Number(p.downloaded||0).toLocaleString()+'회 다운로드</div><div class="column-updated">버전 '+p.version+'</div></div></div>';
      });
      list.innerHTML += '</div>';
    } catch(e) { list.innerHTML = '<p>플러그인을 불러오지 못했습니다.</p>'; }
  }
  async function installPlugin(slug) {
    const fd = new FormData(); fd.append('action','install-plugin'); fd.append('slug',slug);
    const res = await fetch('/wp-admin/admin-ajax.php', { method:'POST', body:fd });
    const data = await res.json();
    if(data.success) alert('설치 완료! 플러그인 페이지에서 활성화하세요.');
    else alert('실패: '+JSON.stringify(data));
  }
  searchPlugins('');
  </script>`}
  </div>`;
}

async function renderUsers(db: WPDB, url: URL): Promise<string> {
  const users = await db['db'].prepare('SELECT * FROM wp_users ORDER BY ID ASC').all<any>().then(r => r.results);
  return `<div class="wrap">
  <h1>사용자 <a href="/wp-admin/user-new.php" class="page-title-action">새 사용자 추가</a></h1>
  <table class="wp-list-table widefat fixed striped users">
    <thead><tr>
      <td class="manage-column column-cb check-column"><input type="checkbox"/></td>
      <th class="manage-column column-username column-primary">사용자명</th>
      <th class="manage-column column-name">이름</th>
      <th class="manage-column column-email">이메일</th>
      <th class="manage-column column-role">권한 그룹</th>
      <th class="manage-column column-posts">글</th>
    </tr></thead>
    <tbody>
      ${users.map((u: any) => `<tr>
        <td><input type="checkbox" value="${u.ID}"/></td>
        <td class="username column-primary"><strong><a href="/wp-admin/user-edit.php?user_id=${u.ID}">${u.user_login}</a></strong>
          <div class="row-actions"><a href="/wp-admin/user-edit.php?user_id=${u.ID}">편집</a></div>
        </td>
        <td>${u.display_name}</td>
        <td><a href="mailto:${u.user_email}">${u.user_email}</a></td>
        <td>관리자</td>
        <td><a href="/wp-admin/edit.php?author=${u.ID}">0</a></td>
      </tr>`).join('')}
    </tbody>
  </table>
  </div>`;
}

function renderNewUser(): string {
  return `<div class="wrap">
  <h1>새 사용자 추가</h1>
  <form method="post" action="/api/users/create" id="createuser">
  <table class="form-table">
    <tr><th><label for="user_login">사용자명 *</label></th><td><input type="text" name="user_login" id="user_login" class="input" required/></td></tr>
    <tr><th><label for="email">이메일 *</label></th><td><input type="email" name="email" id="email" class="input" required/></td></tr>
    <tr><th><label for="first_name">이름</label></th><td><input type="text" name="first_name" id="first_name" class="input"/></td></tr>
    <tr><th><label for="last_name">성</label></th><td><input type="text" name="last_name" id="last_name" class="input"/></td></tr>
    <tr><th><label for="pass1">비밀번호</label></th><td><input type="password" name="pass1" id="pass1" class="input"/></td></tr>
    <tr><th><label for="role">권한 그룹</label></th>
      <td><select name="role" id="role">
        <option value="administrator">관리자</option>
        <option value="editor">편집자</option>
        <option value="author">글쓴이</option>
        <option value="contributor">기고자</option>
        <option value="subscriber" selected>구독자</option>
      </select></td>
    </tr>
  </table>
  <p class="submit"><input type="submit" name="createusernow" value="새 사용자 추가" class="button button-primary"/></p>
  </form>
  </div>`;
}

async function renderProfile(db: WPDB, session: SessionData): Promise<string> {
  const user = await db.getUser(session.userId);
  return `<div class="wrap">
  <h1>프로필</h1>
  <form id="your-profile" action="/api/users/${session.userId}/update" method="post">
  <h2>개인 설정</h2>
  <table class="form-table">
    <tr><th>관리자 색상</th><td>
      <fieldset><legend class="screen-reader-text"><span>관리자 색상</span></legend>
        <input type="radio" name="admin_color" id="default" value="default" checked/> <label for="default">기본</label>
        <input type="radio" name="admin_color" id="blue" value="blue"/> <label for="blue">파랑</label>
        <input type="radio" name="admin_color" id="midnight" value="midnight"/> <label for="midnight">미드나이트</label>
        <input type="radio" name="admin_color" id="sunrise" value="sunrise"/> <label for="sunrise">선라이즈</label>
      </fieldset>
    </td></tr>
  </table>
  <h2>이름</h2>
  <table class="form-table">
    <tr><th><label>사용자명</label></th><td><input type="text" value="${user?.user_login || ''}" disabled/><span class="description">사용자명은 변경할 수 없습니다.</span></td></tr>
    <tr><th><label for="first_name">이름</label></th><td><input type="text" name="first_name" id="first_name" value="" class="regular-text"/></td></tr>
    <tr><th><label for="last_name">성</label></th><td><input type="text" name="last_name" id="last_name" value="" class="regular-text"/></td></tr>
    <tr><th><label for="display_name">공개적으로 표시할 이름</label></th><td>
      <select name="display_name" id="display_name">
        <option value="${user?.user_login}">${user?.user_login}</option>
      </select>
    </td></tr>
  </table>
  <h2>연락처 정보</h2>
  <table class="form-table">
    <tr><th><label for="email">이메일 *</label></th><td><input type="email" name="email" id="email" value="${user?.user_email || ''}" class="regular-text" required/></td></tr>
    <tr><th><label for="url">웹사이트</label></th><td><input type="url" name="url" id="url" value="${user?.user_url || ''}" class="regular-text"/></td></tr>
  </table>
  <h2>계정 관리</h2>
  <table class="form-table">
    <tr><th><label for="pass1">새 비밀번호</label></th><td>
      <input type="password" name="pass1" id="pass1" class="regular-text"/>
      <p class="description">비밀번호를 변경하려면 새 비밀번호를 입력하세요. 그렇지 않으면 비워두세요.</p>
    </td></tr>
    <tr><th><label for="pass2">비밀번호 반복</label></th><td>
      <input type="password" name="pass2" id="pass2" class="regular-text"/>
    </td></tr>
  </table>
  <p class="submit"><input type="submit" name="submit" value="프로필 업데이트" class="button button-primary"/></p>
  </form>
  </div>`;
}

async function renderSettingsGeneral(db: WPDB, env: Env): Promise<string> {
  const blogname = await db.getOption('blogname');
  const blogdesc = await db.getOption('blogdescription');
  const siteurl = await db.getOption('siteurl');
  const adminEmail = await db.getOption('admin_email');
  const timezone = await db.getOption('timezone_string', 'Asia/Seoul');
  const dateFormat = await db.getOption('date_format', 'Y년 n월 j일');
  const timeFormat = await db.getOption('time_format', 'H:i');
  const language = await db.getOption('WPLANG', 'ko_KR');

  return `<div class="wrap">
  <h1>일반 설정</h1>
  <form method="post" action="/api/options/save" id="general-settings-form">
  <input type="hidden" name="nonce" value="general-settings"/>
  <table class="form-table">
    <tr><th scope="row"><label for="blogname">사이트 제목</label></th><td><input name="blogname" id="blogname" type="text" value="${blogname}" class="regular-text"/></td></tr>
    <tr><th scope="row"><label for="blogdescription">태그라인</label></th><td><input name="blogdescription" id="blogdescription" type="text" value="${blogdesc}" class="regular-text"/><p class="description">몇 마디로 사이트를 설명하세요.</p></td></tr>
    <tr><th scope="row"><label for="siteurl">워드프레스 주소 (URL)</label></th><td><input name="siteurl" id="siteurl" type="url" value="${siteurl}" class="regular-text"/></td></tr>
    <tr><th scope="row"><label for="home">사이트 주소 (URL)</label></th><td><input name="home" id="home" type="url" value="${siteurl}" class="regular-text"/></td></tr>
    <tr><th scope="row"><label for="admin_email">관리자 이메일 주소</label></th><td><input name="admin_email" id="admin_email" type="email" value="${adminEmail}" class="regular-text"/></td></tr>
    <tr><th scope="row">멤버십</th><td><label><input name="users_can_register" type="checkbox" value="1"/> 누구나 등록할 수 있습니다</label></td></tr>
    <tr><th scope="row"><label for="default_role">새 사용자 기본 권한 그룹</label></th>
      <td><select name="default_role" id="default_role">
        <option value="subscriber" selected>구독자</option>
        <option value="contributor">기고자</option>
        <option value="author">글쓴이</option>
        <option value="editor">편집자</option>
        <option value="administrator">관리자</option>
      </select></td>
    </tr>
    <tr><th scope="row"><label for="timezone_string">시간대</label></th>
      <td><select name="timezone_string" id="timezone_string">
        <option value="Asia/Seoul" ${timezone==='Asia/Seoul'?'selected':''}>서울</option>
        <option value="UTC" ${timezone==='UTC'?'selected':''}>UTC</option>
        <option value="America/New_York">동부 시간 (뉴욕)</option>
        <option value="Europe/London">런던</option>
      </select></td>
    </tr>
    <tr><th scope="row"><label for="date_format">날짜 형식</label></th>
      <td><input name="date_format" id="date_format" type="text" value="${dateFormat}" class="small-text"/></td>
    </tr>
    <tr><th scope="row"><label for="time_format">시간 형식</label></th>
      <td><input name="time_format" id="time_format" type="text" value="${timeFormat}" class="small-text"/></td>
    </tr>
    <tr><th scope="row">언어</th>
      <td><select name="WPLANG">
        <option value="ko_KR" ${language==='ko_KR'?'selected':''}>한국어</option>
        <option value="">English</option>
        <option value="ja">日本語</option>
        <option value="zh_CN">中文 (简体)</option>
      </select></td>
    </tr>
  </table>
  <p class="submit"><input type="submit" name="submit" class="button button-primary" value="변경사항 저장"/></p>
  </form>
  <script>
  document.getElementById('general-settings-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    const fd = new FormData(this);
    const data = Object.fromEntries(fd);
    const res = await fetch('/api/options/save', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) });
    const result = await res.json();
    if(result.success) { alert('변경사항이 저장되었습니다.'); location.reload(); }
    else alert('저장 실패: ' + JSON.stringify(result));
  });
  </script>
  </div>`;
}

async function renderSettingsWriting(db: WPDB): Promise<string> {
  return `<div class="wrap"><h1>쓰기 설정</h1>
  <form method="post" action="/api/options/save">
  <table class="form-table">
    <tr><th>기본 게시물 카테고리</th><td><select name="default_category"><option value="1">미분류</option></select></td></tr>
    <tr><th>기본 게시물 형식</th><td><select name="default_post_format"><option value="">표준</option><option value="aside">여담</option><option value="image">이미지</option></select></td></tr>
    <tr><th>XML-RPC</th><td><label><input type="checkbox" name="enable_xmlrpc" value="1" checked/> XML-RPC 게시를 활성화합니다</label></td></tr>
  </table>
  <p class="submit"><input type="submit" class="button button-primary" value="변경사항 저장"/></p>
  </form></div>`;
}

async function renderSettingsReading(db: WPDB): Promise<string> {
  const postsPerPage = await db.getOption('posts_per_page', '10');
  return `<div class="wrap"><h1>읽기 설정</h1>
  <form method="post" action="/api/options/save">
  <table class="form-table">
    <tr><th>홈페이지 표시</th><td>
      <p><label><input type="radio" name="show_on_front" value="posts" checked/> 최신 글</label></p>
      <p><label><input type="radio" name="show_on_front" value="page"/> 정적 페이지</label></p>
    </td></tr>
    <tr><th>최대 표시할 게시물 수</th><td><input name="posts_per_page" type="number" value="${postsPerPage}" class="small-text"/> 페이지</td></tr>
    <tr><th>검색 엔진 표시 여부</th><td><label><input type="checkbox" name="blog_public" value="1" checked/> 검색 엔진이 이 사이트를 색인하도록 허용합니다</label></td></tr>
  </table>
  <p class="submit"><input type="submit" class="button button-primary" value="변경사항 저장"/></p>
  </form></div>`;
}

async function renderSettingsDiscussion(db: WPDB): Promise<string> {
  return `<div class="wrap"><h1>토론 설정</h1>
  <form method="post" action="/api/options/save">
  <table class="form-table">
    <tr><th>기본 게시물 설정</th><td>
      <label><input type="checkbox" name="default_pingback_flag" value="1" checked/> 이 블로그의 링크를 알립니다</label><br/>
      <label><input type="checkbox" name="default_ping_status" value="1" checked/> 다른 블로그의 링크 알림을 허용합니다</label><br/>
      <label><input type="checkbox" name="default_comment_status" value="1" checked/> 댓글 허용</label>
    </td></tr>
    <tr><th>댓글 검토</th><td>
      <label><input type="checkbox" name="comment_moderation" value="1"/> 댓글이 표시되기 전에 수동으로 검토해야 합니다</label>
    </td></tr>
  </table>
  <p class="submit"><input type="submit" class="button button-primary" value="변경사항 저장"/></p>
  </form></div>`;
}

async function renderSettingsMedia(db: WPDB): Promise<string> {
  return `<div class="wrap"><h1>미디어 설정</h1>
  <form method="post" action="/api/options/save">
  <h2 class="title">이미지 크기</h2>
  <table class="form-table">
    <tr><th>썸네일 크기</th><td>너비 <input type="number" name="thumbnail_size_w" value="150" class="small-text"/> 높이 <input type="number" name="thumbnail_size_h" value="150" class="small-text"/></td></tr>
    <tr><th>중간 크기</th><td>최대 너비 <input type="number" name="medium_size_w" value="300" class="small-text"/> 최대 높이 <input type="number" name="medium_size_h" value="300" class="small-text"/></td></tr>
    <tr><th>대형 크기</th><td>최대 너비 <input type="number" name="large_size_w" value="1024" class="small-text"/> 최대 높이 <input type="number" name="large_size_h" value="1024" class="small-text"/></td></tr>
  </table>
  <p class="submit"><input type="submit" class="button button-primary" value="변경사항 저장"/></p>
  </form></div>`;
}

async function renderSettingsPermalink(db: WPDB): Promise<string> {
  const struct = await db.getOption('permalink_structure', '/%postname%/');
  return `<div class="wrap"><h1>고유주소 설정</h1>
  <form method="post" action="/api/options/save">
  <p>고유주소 설정을 변경하면 기존 URL이 더 이상 작동하지 않을 수 있습니다.</p>
  <h2 class="title">일반 설정</h2>
  <table class="form-table">
    <tr><th>일반</th><td>
      <p><label><input type="radio" name="permalink_structure" value="" ${struct===''?'checked':''}/> 기본</label> <code>${'/?p=123'}</code></p>
      <p><label><input type="radio" name="permalink_structure" value="/%year%/%monthnum%/%day%/%postname%/" ${struct.includes('%year%')?'checked':''}/> 날짜와 이름</label> <code>/2024/12/25/글-제목/</code></p>
      <p><label><input type="radio" name="permalink_structure" value="/%postname%/" ${struct==='/%postname%/'?'checked':''}/> 글 이름</label> <code>/글-제목/</code></p>
      <p><label><input type="radio" name="permalink_structure" value="custom"/> 사용자 정의 구조</label> <input name="permalink_structure_custom" type="text" value="${struct}" class="regular-text code"/></p>
    </td></tr>
  </table>
  <p class="submit"><input type="submit" class="button button-primary" value="변경사항 저장"/></p>
  </form></div>`;
}

function renderSettingsPrivacy(): string {
  return `<div class="wrap"><h1>개인정보 설정</h1>
  <div class="privacy-settings-wrapper">
    <p>사이트의 개인정보 처리방침 페이지를 선택하거나 새로 만드세요.</p>
    <table class="form-table">
      <tr><th>개인정보 처리방침 페이지</th><td>
        <select name="wp_page_for_privacy_policy"><option value="">— 선택 —</option></select>
        <button type="button" class="button">새 페이지 만들기</button>
      </td></tr>
    </table>
    <p><a href="https://ko.wordpress.org/support/article/privacy-settings/" target="_blank">개인정보 설정에 대해 알아보기</a></p>
  </div></div>`;
}

async function renderNavMenus(db: WPDB, env: Env): Promise<string> {
  return `<div class="wrap" id="nav-menus-frame">
  <h1>메뉴 <a href="/wp-admin/customize.php" class="page-title-action">커스터마이저에서 관리</a></h1>
  <div id="nav-menus-frame" class="wp-clearfix">
  <div id="menu-management-liquid">
    <div id="menu-management">
      <div class="menu-edit">
        <div class="nav-tabs-wrapper"><ul class="nav-tabs">
          <li class="tabs"><a class="nav-tab-link" href="#add-new-menu">새 메뉴 만들기</a></li>
          <li><a class="nav-tab-link" href="#select-nav-menu">기존 메뉴 편집</a></li>
        </ul></div>
        <form id="nav-menu-meta" class="nav-menu-meta">
          <input type="hidden" name="action" value="update"/>
          <div id="menu-name-group">
            <label for="menu-name">메뉴 이름<br/><input name="menu-name" id="menu-name" type="text" class="menu-name regular-text menu-item-textbox" placeholder="새 메뉴 이름"/></label>
            <button type="button" class="button-secondary" id="save-menu-header">메뉴 만들기</button>
          </div>
        </form>
      </div>
      <div class="manage-menus">
        <form id="nav-menu-settings">
          <div id="nav-menu-header">
            <div id="toolbar"><p class="howto">사이트에 표시할 메뉴를 구성하세요.</p></div>
          </div>
          <div id="post-body" class="metabox-holder columns-2">
            <div id="post-body-content">
              <ul class="menu ui-sortable" id="menu-to-edit"></ul>
              <div class="menu-settings">
                <h3>메뉴 설정</h3>
                <div class="menu-theme-locations">
                  <fieldset><legend>위치 표시</legend>
                    <label><input type="checkbox" name="menu-locations[primary]"/> 기본 메뉴</label><br/>
                    <label><input type="checkbox" name="menu-locations[secondary]"/> 보조 메뉴</label>
                  </fieldset>
                </div>
              </div>
            </div>
            <div id="postbox-container-1" class="postbox-container">
              <!-- Add pages -->
              <div class="postbox">
                <div class="postbox-header"><h2>페이지</h2></div>
                <div class="inside"><p>메뉴에 추가할 페이지를 선택하세요.</p></div>
              </div>
              <div class="postbox">
                <div class="postbox-header"><h2>사용자 정의 링크</h2></div>
                <div class="inside">
                  <label>URL: <input type="text" name="custom-url" placeholder="https://example.com"/></label>
                  <label>링크 텍스트: <input type="text" name="custom-link-name"/></label>
                  <button type="button" class="button">메뉴에 추가</button>
                </div>
              </div>
            </div>
          </div>
          <div id="nav-menu-footer"><button class="button button-primary" type="button">메뉴 저장</button></div>
        </form>
      </div>
    </div>
  </div>
  </div></div>`;
}

async function renderWidgets(db: WPDB): Promise<string> {
  return `<div class="wrap widgets-php">
  <h1>위젯</h1>
  <div class="widget-liquid-left">
    <div id="widgets-left">
      <div id="available-widgets" class="widgets-holder-wrap">
        <div class="sidebar-name"><h2>사용 가능한 위젯</h2></div>
        <div id="widget-list" class="widgets-chooser">
          ${['검색', '최근 글', '최근 댓글', '보관함', '카테고리', '태그 클라우드', '캘린더', '메타'].map(w =>
            `<div class="widget" id="widget-${w.toLowerCase()}">
              <div class="widget-top">
                <div class="widget-title-action">
                  <button type="button" class="widget-action hide-if-no-js button-link"><span>▼</span></button>
                </div>
                <div class="widget-title"><h3>${w}</h3></div>
              </div>
            </div>`
          ).join('')}
        </div>
      </div>
    </div>
  </div>
  <div class="widget-liquid-right">
    <div id="widgets-right">
      <div id="sidebar-0" class="widgets-holder-wrap">
        <div class="sidebar-name"><h2>사이드바</h2></div>
        <div class="inner-sidebar sortable-sidebar" id="sortable-sidebar-0">
          <p class="howto">위젯을 이 영역에 끌어다 놓으세요.</p>
        </div>
      </div>
    </div>
  </div>
  </div>`;
}

async function renderTaxonomy(db: WPDB, url: URL): Promise<string> {
  const taxonomy = url.searchParams.get('taxonomy') || 'post_tag';
  const isCategory = taxonomy === 'category';
  const terms = await db.getTerms(taxonomy);
  const label = isCategory ? '카테고리' : '태그';

  return `<div class="wrap">
  <h1>${label}</h1>
  <div id="col-container" class="wp-clearfix">
  <div id="col-left">
    <div class="col-wrap">
      <div class="form-wrap">
        <h2>${label} 추가</h2>
        <form id="addtag" method="post" action="/wp-admin/admin-ajax.php">
        <input type="hidden" name="action" value="${isCategory ? 'add-category' : 'add-tag'}"/>
        <input type="hidden" name="screen" value="edit-${taxonomy}"/>
        <div class="form-field form-required">
          <label for="tag-name">이름 *</label>
          <input name="tag-name" id="tag-name" type="text" value="" required/>
          <p>사이트에 표시될 이름입니다.</p>
        </div>
        <div class="form-field">
          <label for="tag-slug">슬러그</label>
          <input name="slug" id="tag-slug" type="text" value=""/>
          <p>URL에 사용되는 고유 이름입니다.</p>
        </div>
        ${isCategory ? `<div class="form-field">
          <label for="parent">상위 카테고리</label>
          <select name="parent" id="parent"><option value="-1">없음</option>
            ${terms.map(t => `<option value="${t.term_id}">${t.name}</option>`).join('')}
          </select>
        </div>` : ''}
        <div class="form-field">
          <label for="tag-description">설명</label>
          <textarea name="description" id="tag-description" rows="5" cols="40"></textarea>
        </div>
        <p class="submit">
          <input type="submit" name="publish" class="button button-primary" value="${label} 추가"/>
        </p>
        </form>
        <script>
        document.getElementById('addtag').addEventListener('submit', async function(e) {
          e.preventDefault();
          const fd = new FormData(this);
          const res = await fetch('/wp-admin/admin-ajax.php', { method:'POST', body:fd });
          const data = await res.json();
          if(data.success) location.reload();
          else alert('오류: ' + JSON.stringify(data));
        });
        </script>
      </div>
    </div>
  </div>
  <div id="col-right">
    <div class="col-wrap">
      <table class="wp-list-table widefat fixed striped tags">
        <thead><tr>
          <td class="manage-column column-cb check-column"><input type="checkbox"/></td>
          <th class="manage-column column-name column-primary">이름</th>
          <th class="manage-column column-slug">슬러그</th>
          <th class="manage-column column-posts">개수</th>
        </tr></thead>
        <tbody>
          ${!terms.length ? `<tr class="no-items"><td class="colspanchange" colspan="4">${label}가 없습니다.</td></tr>` : ''}
          ${terms.map(t => `<tr id="tag-${t.term_id}">
            <td><input type="checkbox" value="${t.term_id}"/></td>
            <td class="name column-primary"><strong><a href="#">${t.name}</a></strong>
              <div class="row-actions">
                <span class="edit"><a href="#">편집</a> | </span>
                <span class="delete"><a href="#" onclick="deleteTerm(${t.term_id})">삭제</a> | </span>
                <span class="view"><a href="/${taxonomy}/${t.slug}/">보기</a></span>
              </div>
            </td>
            <td>${t.slug}</td>
            <td>${t.count}</td>
          </tr>`).join('')}
        </tbody>
      </table>
      <script>
      async function deleteTerm(id) {
        if(!confirm('정말 삭제하시겠습니까?')) return;
        const fd = new FormData(); fd.append('action','delete-tag'); fd.append('taxonomy','${taxonomy}'); fd.append('id',id);
        const res = await fetch('/wp-admin/admin-ajax.php', { method:'POST', body:fd });
        location.reload();
      }
      </script>
    </div>
  </div>
  </div></div>`;
}

async function renderTools(db: WPDB, env: Env): Promise<string> {
  return `<div class="wrap">
  <h1>도구</h1>
  <div class="card">
    <h2>카테고리와 태그 변환기</h2>
    <p>카테고리를 태그로, 또는 태그를 카테고리로 변환합니다.</p>
    <a href="/wp-admin/import.php?import=categories" class="button">카테고리 및 태그 변환기</a>
  </div>
  <div class="card">
    <h2>가져오기</h2>
    <p>다른 시스템에서 게시물을 가져올 수 있습니다.</p>
    <a href="/wp-admin/import.php" class="button">가져오기 도구 보기</a>
  </div>
  <div class="card">
    <h2>내보내기</h2>
    <p>이 사이트의 콘텐츠를 XML 파일로 내보낼 수 있습니다.</p>
    <a href="/wp-admin/export.php" class="button">내보내기</a>
  </div>
  <div class="card">
    <h2>사이트 상태</h2>
    <p>WordPress 구성 및 사이트 상태를 확인합니다.</p>
    <a href="/wp-admin/site-health.php" class="button">사이트 상태 보기</a>
  </div>
  </div>`;
}

function renderImport(): string {
  const importers = [
    { name: 'Blogger', desc: 'Blogger에서 게시물, 댓글, 사용자를 가져옵니다.' },
    { name: 'LiveJournal', desc: 'LiveJournal 파일(.xml)에서 가져옵니다.' },
    { name: 'RSS', desc: 'RSS 피드에서 게시물을 가져옵니다.' },
    { name: 'Tumblr', desc: 'Tumblr에서 게시물 및 미디어를 가져옵니다.' },
    { name: 'WordPress', desc: 'WordPress 내보내기 파일(.xml)에서 게시물, 페이지 등을 가져옵니다.' },
  ];
  return `<div class="wrap">
  <h1>가져오기</h1>
  <p>다른 시스템이나 블로그 플랫폼에서 콘텐츠를 가져올 수 있습니다. 시작하려면 아래에서 시스템을 선택하세요.</p>
  <table class="widefat importers">
    <thead><tr><th>이름</th><th>설명</th><th>작업</th></tr></thead>
    <tbody>
      ${importers.map(i => `<tr><td><strong>${i.name}</strong></td><td>${i.desc}</td><td><a href="/wp-admin/plugin-install.php?tab=search&s=${i.name}+importer" class="button">지금 설치</a></td></tr>`).join('')}
    </tbody>
  </table>
  </div>`;
}

function renderExport(): string {
  return `<div class="wrap">
  <h1>내보내기</h1>
  <p>콘텐츠를 내보내면 XML 파일이 생성됩니다. <strong>WordPress 확장 RSS</strong>를 의미하는 WXR 파일이 생성되며, 게시물, 페이지, 댓글, 사용자 정의 필드, 카테고리, 태그가 포함됩니다.</p>
  <form method="post" action="/api/export">
  <fieldset>
    <legend>내보낼 항목</legend>
    <p><label><input type="radio" name="content" value="all" checked/> <strong>전체 콘텐츠</strong></label></p>
    <p><label><input type="radio" name="content" value="posts"/> <strong>게시물</strong></label></p>
    <p><label><input type="radio" name="content" value="pages"/> <strong>페이지</strong></label></p>
    <p><label><input type="radio" name="content" value="media"/> <strong>미디어</strong></label></p>
  </fieldset>
  <p class="submit"><input type="submit" name="submit" value="내보내기 파일 다운로드" class="button button-primary"/></p>
  </form>
  </div>`;
}

function renderUpdates(): string {
  return `<div class="wrap">
  <h1>CF-WordPress 업데이트</h1>
  <div class="update-core">
    <h2>현재 버전</h2>
    <p>CF-WordPress 6.7.1을 실행 중입니다.</p>
    <div class="card">
      <h3>최신 상태입니다!</h3>
      <p>CF-WordPress 6.7.1을 실행 중입니다. <a href="https://github.com/cf-wordpress" target="_blank">릴리스 정보</a></p>
    </div>
    <h2>플러그인</h2>
    <p>설치된 모든 플러그인이 최신 상태입니다.</p>
    <h2>테마</h2>
    <p>설치된 모든 테마가 최신 상태입니다.</p>
  </div>
  </div>`;
}

async function renderCustomizer(db: WPDB): Promise<string> {
  return `<div class="wrap">
  <h1>커스터마이저</h1>
  <p>커스터마이저는 현재 미리보기 모드로 작동합니다.</p>
  <iframe src="/" style="width:100%;height:80vh;border:1px solid #ccc"></iframe>
  </div>`;
}

async function renderPluginPage(page: string, url: URL, request: Request, db: WPDB, env: Env, session: SessionData, registry: PluginRegistry): Promise<string> {
  // Find plugin menu with this slug
  const allMenus = [...registry.getMenus(), ...registry.getSubmenus()];
  const menu = allMenus.find(m => m.menuSlug === page);

  if (menu && typeof menu.callback === 'function') {
    try {
      const content = await menu.callback(request, db, env, session);
      return typeof content === 'string' ? content : JSON.stringify(content);
    } catch (e) {
      return `<div class="wrap"><h1>플러그인 페이지 오류</h1><p>${String(e)}</p></div>`;
    }
  }

  return `<div class="wrap"><h1>페이지를 찾을 수 없습니다</h1><p>플러그인 페이지 "<code>${page}</code>"를 찾을 수 없습니다.</p></div>`;
}
