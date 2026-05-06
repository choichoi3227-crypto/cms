import { WPPost, SessionData } from '../types/env';
import { PluginRegistry } from '../utils/plugins';
import { generateNonce } from '../utils/crypto';

interface GutenbergOptions {
  post: WPPost | null;
  postType: string;
  siteName: string;
  siteUrl: string;
  nonce: string;
  session: SessionData;
  metaBoxes: any[];
  registry: PluginRegistry;
}

export function GUTENBERG_HTML(opts: GutenbergOptions): string {
  const { post, postType, siteName, siteUrl, nonce, session, metaBoxes, registry } = opts;
  const postId = post?.ID || 0;
  const isNew = !postId;
  const pageTitle = isNew ? '새 글 쓰기' : '글 편집';
  const isPage = postType === 'page';

  const metaBoxesHTML = metaBoxes.map(m => {
    const content = typeof m.callback === 'function' ? m.callback(post || {}) : '';
    return `<div id="${m.id}" class="postbox ${m.context}-sortables">
      <div class="postbox-header">
        <h2 class="hndle ui-sortable-handle">${m.title}</h2>
        <div class="handle-actions"><button type="button" class="handlediv button-link" aria-expanded="true"><span class="toggle-indicator" aria-hidden="true"></span></button></div>
      </div>
      <div class="inside">${content}</div>
    </div>`;
  }).join('');

  const adminStyles = registry.getAllAdminStyles();
  const adminScripts = registry.getAllAdminScripts();

  return `<!DOCTYPE html>
<html lang="ko-KR" class="wp-toolbar">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${post?.post_title || '(제목 없음)'} &mdash; ${siteName} &#8212; CF-WordPress</title>

<!-- WordPress core styles -->
<link rel="stylesheet" href="/wp-admin/css/common.min.css"/>
<link rel="stylesheet" href="/wp-admin/css/wp-admin.min.css"/>
<link rel="stylesheet" href="/wp-admin/css/colors/blue/colors.min.css"/>
<link rel="stylesheet" href="/wp-admin/css/dashicons.min.css"/>
<link rel="stylesheet" href="/wp-admin/css/edit.min.css"/>
<link rel="stylesheet" href="/wp-admin/css/media.min.css"/>
<link rel="stylesheet" href="/wp-admin/css/admin-menu.min.css"/>

<!-- Gutenberg / Block Editor styles -->
<link rel="stylesheet" href="/wp-includes/css/dist/block-editor/style.min.css"/>
<link rel="stylesheet" href="/wp-includes/css/dist/components/style.min.css"/>
<link rel="stylesheet" href="/wp-includes/css/dist/block-library/style.min.css"/>
<link rel="stylesheet" href="/wp-includes/css/dist/block-library/editor.min.css"/>
<link rel="stylesheet" href="/wp-includes/css/dist/format-library/style.min.css"/>
<link rel="stylesheet" href="/wp-includes/css/dist/editor/style.min.css"/>

${adminStyles.map(s => `<link rel="stylesheet" href="${s.src}"/>`).join('\n')}

<style>
/* ── CF-WP Gutenberg Override Styles ── */
:root{
  --wp-admin-theme-color:#2271b1;
  --wp-admin-theme-color-darker-10:#135e96;
  --wp-admin-theme-color-darker-20:#0a4b78;
  --wp-admin-border-width-focus:2px;
}

/* Editor layout */
html{height:auto}
body{background:#1e1e1e;height:auto;min-height:100vh}
body.gutenberg-editor-page{height:100vh;overflow:hidden}
#wpwrap{height:100%;min-height:100%}
#wpcontent{padding-left:0;margin-left:0}
#wpadminbar{position:fixed;top:0;width:100%;z-index:99999}
.block-editor__container{padding-top:32px}

/* Custom editor shell */
.cfwp-editor-shell{display:flex;flex-direction:column;height:100vh;background:#fff}
.cfwp-editor-header{
  position:fixed;top:32px;left:0;right:0;z-index:100;
  height:56px;background:#fff;border-bottom:1px solid #ddd;
  display:flex;align-items:center;padding:0 .5rem;gap:.5rem;
  box-shadow:0 1px 3px rgba(0,0,0,.1)
}
.cfwp-editor-body{display:flex;flex:1;margin-top:88px;height:calc(100vh - 88px);overflow:hidden}
.cfwp-editor-sidebar-left{
  width:280px;flex-shrink:0;border-right:1px solid #ddd;
  overflow-y:auto;background:#fff;display:flex;flex-direction:column
}
.cfwp-editor-main{flex:1;overflow-y:auto;background:#f0f0f1}
.cfwp-editor-sidebar-right{
  width:280px;flex-shrink:0;border-left:1px solid #ddd;
  overflow-y:auto;background:#fff
}

/* Editor canvas */
.cfwp-canvas{max-width:840px;margin:2rem auto;background:#fff;min-height:80vh;
  border-radius:2px;box-shadow:0 0 0 1px rgba(0,0,0,.1);padding:4rem 5rem}
.cfwp-canvas .editor-styles-wrapper{font-size:16px;line-height:1.8;color:#1a1a1a}
.cfwp-title-input{
  width:100%;border:none;outline:none;font-size:2rem;font-weight:700;
  line-height:1.4;color:#1a1a1a;padding:0;margin-bottom:1rem;
  font-family:inherit;resize:none;overflow:hidden
}
.cfwp-title-input::placeholder{color:#ccc}

/* Block toolbar */
.block-editor-block-toolbar{
  background:#fff;border:1px solid #ddd;border-radius:2px;
  display:flex;align-items:center;padding:0 4px;box-shadow:0 2px 6px rgba(0,0,0,.1)
}
.components-toolbar-group{display:flex;align-items:center}
.components-button{
  display:inline-flex;align-items:center;justify-content:center;
  padding:6px 8px;border:none;background:none;cursor:pointer;
  border-radius:2px;font-size:13px;line-height:1;color:#1e1e1e;
  min-width:36px;height:36px
}
.components-button:hover{background:#f0f0f0}
.components-button.is-pressed{background:#1e1e1e;color:#fff}
.components-button.is-primary{background:#2271b1;color:#fff}
.components-button.is-primary:hover{background:#135e96}

/* Inserter */
.block-editor-inserter__main-area{overflow-y:auto}

/* Blocks */
.wp-block{position:relative}
.wp-block:hover>.block-editor-block-list__block-selection-button{opacity:1}
.block-editor-block-list__block{margin:1em 0}
[data-block]{outline:none}
[data-block]:focus,[data-block].is-selected{outline:1.5px solid var(--wp-admin-theme-color)}

/* Sidebar tabs */
.cfwp-sidebar-tabs{display:flex;border-bottom:1px solid #ddd}
.cfwp-sidebar-tab{flex:1;padding:.75rem;border:none;background:none;cursor:pointer;
  font-size:.85rem;font-weight:600;color:#666;border-bottom:2px solid transparent}
.cfwp-sidebar-tab.active{color:#2271b1;border-bottom-color:#2271b1}
.cfwp-sidebar-panel{padding:1rem;display:none}
.cfwp-sidebar-panel.active{display:block}

/* Post settings panels */
.cfwp-panel{border-bottom:1px solid #ddd}
.cfwp-panel-header{
  display:flex;align-items:center;justify-content:space-between;
  padding:.75rem 1rem;cursor:pointer;font-weight:600;font-size:.85rem
}
.cfwp-panel-header:hover{background:#f9f9f9}
.cfwp-panel-content{padding:.75rem 1rem;display:none}
.cfwp-panel-content.open{display:block}

/* Status select */
.cfwp-status-row{display:flex;justify-content:space-between;align-items:center;padding:.4rem 0;font-size:.85rem}
.cfwp-status-row label{color:#666}

/* Block inserter button floating */
.cfwp-inserter-button{
  position:fixed;bottom:2rem;right:2rem;width:48px;height:48px;
  background:#2271b1;color:#fff;border:none;border-radius:50%;
  font-size:1.5rem;cursor:pointer;box-shadow:0 2px 10px rgba(0,0,0,.2);
  display:flex;align-items:center;justify-content:center;z-index:50
}
.cfwp-inserter-button:hover{background:#135e96;transform:scale(1.05)}

/* Slash command popup */
.cfwp-slash-popup{
  position:absolute;background:#fff;border:1px solid #ddd;border-radius:4px;
  box-shadow:0 4px 20px rgba(0,0,0,.15);padding:.5rem;min-width:280px;
  z-index:1000;max-height:320px;overflow-y:auto
}
.cfwp-slash-item{
  display:flex;align-items:center;gap:.75rem;padding:.5rem .75rem;
  border-radius:3px;cursor:pointer;font-size:.9rem
}
.cfwp-slash-item:hover,.cfwp-slash-item.active{background:#f0f6fc}
.cfwp-slash-icon{width:36px;height:36px;display:flex;align-items:center;justify-content:center;
  background:#f0f0f0;border-radius:4px;font-size:1rem;flex-shrink:0}
.cfwp-slash-name{font-weight:600;font-size:.9rem}
.cfwp-slash-desc{font-size:.75rem;color:#666}

/* Metaboxes area */
.cfwp-metaboxes{max-width:840px;margin:0 auto 2rem;padding:0 5rem}
.cfwp-metaboxes-section{margin-bottom:1rem}

/* Format toolbar */
.cfwp-format-toolbar{
  background:#fff;border:1px solid #ddd;border-radius:3px;
  padding:2px;display:inline-flex;gap:2px;box-shadow:0 2px 8px rgba(0,0,0,.12)
}
.cfwp-format-btn{
  padding:4px 8px;border:none;background:none;cursor:pointer;border-radius:2px;
  font-size:13px;min-width:28px;height:28px;display:flex;align-items:center;justify-content:center
}
.cfwp-format-btn:hover{background:#f0f0f0}
.cfwp-format-btn.active{background:#2271b1;color:#fff}
</style>
</head>

<body class="wp-admin wp-core-ui post-php post-type-${postType} gutenberg-editor-page admin-color-blue">
<div id="wpwrap">

<!-- Admin bar -->
<div id="wpadminbar">
  <div class="quicklinks">
    <ul id="wp-toolbar">
      <li><a class="ab-item" href="/wp-admin/"><svg viewBox="0 0 20 20" width="20" height="20" fill="currentColor"><path d="M10 0C4.5 0 0 4.5 0 10s4.5 10 10 10 10-4.5 10-10S15.5 0 10 0zM2 10c0-1.2.3-2.4.7-3.4L6.6 17C3.8 15.5 2 12.9 2 10zm8 8c-.8 0-1.6-.1-2.4-.3l2.5-7.4 2.6 7.1c.1.2.2.3.3.4-.3.1-.7.2-1 .2zm1.1-11.9L13.5 14l.6-2.1c.3-.8.4-1.5.4-2.1 0-.8-.3-1.4-.6-1.9-.4-.6-.7-1.1-.7-1.7 0-.7.5-1.3 1.2-1.3h.1c-1.1-1-2.6-1.9-4.5-1.9-2.3 0-4.4 1.2-5.6 3h.4c.7 0 1.8-.1 1.8-.1.4 0 .4.5 0 .5 0 0-.4 0-.8.1l2.5 7.4 1.5-4.5-1.1-2.9c-.4 0-.7-.1-.7-.1-.4 0-.3-.5 0-.5 0 0 1.1.1 1.8.1.7 0 1.8-.1 1.8-.1.4 0 .4.5 0 .5l-.8.1z"/></svg></a></li>
      <li><a class="ab-item" href="/wp-admin/edit.php${isPage ? '?post_type=page' : ''}">← ${isPage ? '페이지' : '글'} 목록</a></li>
      <li id="wp-admin-bar-user-info"><a class="ab-item" href="/wp-admin/profile.php">${session.userLogin}</a></li>
    </ul>
  </div>
</div>

<!-- Editor shell -->
<div id="wpcontent">
  <div id="wpbody">
    <div id="wpbody-content">

      <!-- ── Top toolbar ── -->
      <div class="cfwp-editor-header" id="editor-header">
        <!-- Hamburger / back -->
        <button class="components-button" title="블록 삽입" onclick="toggleInserter()" id="btn-inserter" style="font-size:1.2rem">⊕</button>
        <button class="components-button" title="도구 전환">✏️</button>
        <button class="components-button" title="실행 취소" onclick="document.execCommand('undo')" id="btn-undo">↩</button>
        <button class="components-button" title="다시 실행" onclick="document.execCommand('redo')" id="btn-redo">↪</button>

        <div style="flex:1;display:flex;align-items:center;justify-content:center;gap:.5rem">
          <span id="save-indicator" style="font-size:.8rem;color:#888">초안</span>
        </div>

        <!-- Right side buttons -->
        <button class="components-button" onclick="previewPost()" title="미리보기">👁 미리보기</button>
        <select id="post-status-select" style="font-size:.85rem;padding:.3rem .5rem;border:1px solid #ddd;border-radius:3px">
          <option value="draft" ${post?.post_status === 'draft' ? 'selected' : ''}>초안</option>
          <option value="publish" ${post?.post_status === 'publish' ? 'selected' : ''}>발행됨</option>
          <option value="private">비공개</option>
          <option value="pending">검토 대기</option>
        </select>
        <button class="components-button is-primary" onclick="savePost()" id="btn-publish" style="padding:.4rem 1rem">
          ${post?.post_status === 'publish' ? '업데이트' : '발행'}
        </button>
        <button class="components-button" onclick="toggleSidebar()" id="btn-settings" title="설정">⚙️</button>
        <button class="components-button" title="도움말">?</button>
      </div>

      <!-- ── Editor body ── -->
      <div class="cfwp-editor-body">

        <!-- Left sidebar: Block inserter (hidden by default) -->
        <div class="cfwp-editor-sidebar-left" id="inserter-panel" style="display:none;position:fixed;top:88px;left:0;bottom:0;z-index:99;box-shadow:2px 0 8px rgba(0,0,0,.1)">
          <div style="padding:.75rem 1rem;border-bottom:1px solid #ddd;font-weight:700;display:flex;justify-content:space-between">
            <span>블록 추가</span>
            <button onclick="toggleInserter()" style="border:none;background:none;cursor:pointer;font-size:1.1rem">✕</button>
          </div>
          <div style="padding:.75rem">
            <input type="search" id="block-search" placeholder="블록 검색..." style="width:100%;padding:.5rem;border:1px solid #ddd;border-radius:3px"
              oninput="filterBlocks(this.value)"/>
          </div>
          <div id="block-categories" style="overflow-y:auto;flex:1">
            ${generateBlockInserterHTML()}
          </div>
        </div>

        <!-- Main canvas -->
        <div class="cfwp-editor-main" id="editor-main" onclick="handleCanvasClick(event)">
          <div class="cfwp-canvas" id="editor-canvas">
            <div class="editor-styles-wrapper">
              <textarea id="post-title-input" class="cfwp-title-input" placeholder="제목 추가" rows="1"
                oninput="autoResizeTitle(this);markDirty()">${post?.post_title || ''}</textarea>
              <div id="block-editor" class="block-editor-block-list__layout" contenteditable="false">
                ${generateInitialBlocks(post?.post_content || '')}
              </div>
              <div id="cfwp-add-block-hint" style="padding:1rem 0;color:#ccc;cursor:pointer" onclick="insertBlock('paragraph')" title="클릭하거나 / 입력으로 블록 추가">
                클릭하여 쓰거나, <kbd>/</kbd>를 눌러 블록을 선택하세요
              </div>
            </div>
          </div>

          <!-- Metaboxes below editor -->
          ${metaBoxesHTML ? `<div class="cfwp-metaboxes" id="metaboxes-area">
            ${metaBoxesHTML}
          </div>` : ''}
        </div>

        <!-- Right sidebar: Post settings -->
        <div class="cfwp-editor-sidebar-right" id="editor-sidebar">
          <div class="cfwp-sidebar-tabs">
            <button class="cfwp-sidebar-tab active" onclick="switchTab('post')" id="tab-post">게시물</button>
            <button class="cfwp-sidebar-tab" onclick="switchTab('block')" id="tab-block">블록</button>
          </div>

          <!-- Post tab -->
          <div class="cfwp-sidebar-panel active" id="panel-post">
            <!-- Status & Visibility -->
            <div class="cfwp-panel">
              <div class="cfwp-panel-header" onclick="togglePanel(this)">
                상태 및 공개 여부 <span>▾</span>
              </div>
              <div class="cfwp-panel-content open">
                <div class="cfwp-status-row">
                  <label>공개 여부</label>
                  <select id="visibility-select" style="font-size:.85rem">
                    <option value="publish">공개</option>
                    <option value="private">비공개</option>
                    <option value="password">비밀번호 보호</option>
                  </select>
                </div>
                <div class="cfwp-status-row">
                  <label>발행일</label>
                  <input type="datetime-local" id="publish-date" style="font-size:.8rem;border:1px solid #ddd;border-radius:2px;padding:.2rem .4rem"
                    value="${post?.post_date?.replace(' ', 'T').substring(0, 16) || new Date().toISOString().substring(0, 16)}"/>
                </div>
                <div class="cfwp-status-row">
                  <label>작성자</label>
                  <span>${session.userLogin}</span>
                </div>
                <div class="cfwp-status-row" style="padding-top:.5rem;border-top:1px solid #f0f0f0">
                  <button class="components-button" style="color:#b32d2e;font-size:.85rem" onclick="moveToTrash()">휴지통으로 이동</button>
                </div>
              </div>
            </div>

            <!-- Permalink -->
            <div class="cfwp-panel">
              <div class="cfwp-panel-header" onclick="togglePanel(this)">고유주소 <span>▾</span></div>
              <div class="cfwp-panel-content">
                <div style="font-size:.85rem;color:#666;margin-bottom:.5rem">URL 슬러그</div>
                <input type="text" id="post-slug" value="${post?.post_name || ''}" style="width:100%;font-size:.85rem;border:1px solid #ddd;border-radius:3px;padding:.4rem .6rem" placeholder="슬러그"/>
                <div style="font-size:.75rem;color:#888;margin-top:.4rem">${siteUrl}/<span id="slug-preview">${post?.post_name || ''}</span>/</div>
              </div>
            </div>

            <!-- Categories -->
            ${!isPage ? `<div class="cfwp-panel">
              <div class="cfwp-panel-header" onclick="togglePanel(this)">카테고리 <span>▾</span></div>
              <div class="cfwp-panel-content">
                <div id="category-list" style="max-height:200px;overflow-y:auto">
                  <label><input type="checkbox" value="1" checked/> 미분류</label>
                </div>
                <div style="margin-top:.75rem">
                  <a href="#" style="font-size:.85rem" onclick="showNewCategoryForm()">+ 새 카테고리 추가</a>
                  <div id="new-category-form" style="display:none;margin-top:.5rem">
                    <input type="text" id="new-cat-name" placeholder="카테고리 이름" style="width:100%;font-size:.85rem;border:1px solid #ddd;border-radius:3px;padding:.3rem .5rem"/>
                    <button onclick="addCategory()" class="components-button" style="margin-top:.25rem;font-size:.8rem;background:#2271b1;color:#fff;padding:.25rem .75rem;border-radius:3px">추가</button>
                  </div>
                </div>
              </div>
            </div>

            <!-- Tags -->
            <div class="cfwp-panel">
              <div class="cfwp-panel-header" onclick="togglePanel(this)">태그 <span>▾</span></div>
              <div class="cfwp-panel-content">
                <div class="components-form-token-field">
                  <input type="text" id="tag-input" placeholder="태그 추가" style="width:100%;font-size:.85rem;border:1px solid #ddd;border-radius:3px;padding:.4rem .6rem"
                    onkeydown="handleTagInput(event)"/>
                  <div id="tag-list" style="display:flex;flex-wrap:wrap;gap:.25rem;margin-top:.4rem"></div>
                </div>
              </div>
            </div>` : ''}

            <!-- Featured Image -->
            <div class="cfwp-panel">
              <div class="cfwp-panel-header" onclick="togglePanel(this)">대표 이미지 <span>▾</span></div>
              <div class="cfwp-panel-content">
                <div id="featured-image-container">
                  <button class="components-button is-secondary" style="width:100%" onclick="openMediaModal('featured')">대표 이미지 설정</button>
                </div>
              </div>
            </div>

            <!-- Excerpt -->
            <div class="cfwp-panel">
              <div class="cfwp-panel-header" onclick="togglePanel(this)">발췌문 <span>▾</span></div>
              <div class="cfwp-panel-content">
                <textarea id="post-excerpt" rows="4" style="width:100%;border:1px solid #ddd;border-radius:3px;padding:.4rem .6rem;font-size:.85rem;resize:vertical" placeholder="수동 발췌문 (선택 사항)">${post?.post_excerpt || ''}</textarea>
              </div>
            </div>

            <!-- Discussion -->
            <div class="cfwp-panel">
              <div class="cfwp-panel-header" onclick="togglePanel(this)">토론 <span>▾</span></div>
              <div class="cfwp-panel-content">
                <label style="font-size:.85rem"><input type="checkbox" id="comment-status" ${post?.comment_status !== 'closed' ? 'checked' : ''}/> 댓글 허용</label><br/>
                <label style="font-size:.85rem"><input type="checkbox" id="ping-status" ${post?.ping_status !== 'closed' ? 'checked' : ''}/> 핑 허용</label>
              </div>
            </div>

          </div><!-- /panel-post -->

          <!-- Block tab -->
          <div class="cfwp-sidebar-panel" id="panel-block">
            <div id="block-settings-content">
              <p style="font-size:.85rem;color:#888;text-align:center;padding:2rem">블록을 선택하면 설정이 여기에 표시됩니다.</p>
            </div>
          </div>
        </div>
      </div>

    </div><!-- /wpbody-content -->
  </div><!-- /wpbody -->
</div><!-- /wpcontent -->
</div><!-- /wpwrap -->

<!-- Media modal -->
<div id="media-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:10000;display:none">
  <div style="background:#fff;margin:2rem auto;max-width:900px;border-radius:4px;overflow:hidden;max-height:85vh;display:flex;flex-direction:column">
    <div style="padding:1rem 1.5rem;border-bottom:1px solid #ddd;display:flex;justify-content:space-between;align-items:center">
      <h2 style="margin:0">미디어 선택</h2>
      <button onclick="closeMediaModal()" style="border:none;background:none;font-size:1.5rem;cursor:pointer">✕</button>
    </div>
    <div style="display:flex;flex:1;overflow:hidden">
      <div style="flex:1;padding:1rem;overflow-y:auto" id="media-modal-grid"></div>
      <div style="width:240px;border-left:1px solid #ddd;padding:1rem;font-size:.85rem" id="media-modal-details"></div>
    </div>
    <div style="padding:1rem;border-top:1px solid #ddd;text-align:right">
      <button class="components-button is-secondary" onclick="closeMediaModal()">취소</button>
      <button class="components-button is-primary" onclick="insertSelectedMedia()" style="margin-left:.5rem">선택 삽입</button>
    </div>
  </div>
</div>

<!-- Slash command popup -->
<div id="slash-popup" class="cfwp-slash-popup" style="display:none"></div>

<script src="/wp-includes/js/jquery/jquery.min.js"></script>
<script>
// ════════════════════════════════════════════════════════════════════
// CF-WordPress Gutenberg Editor Engine
// ════════════════════════════════════════════════════════════════════

var cfwpEditor = {
  postId: ${postId},
  postType: '${postType}',
  isDirty: false,
  saving: false,
  selectedBlockEl: null,
  mediaCallback: null,
  selectedMediaId: null,
  blocks: [],
  ajaxurl: '/wp-admin/admin-ajax.php',
  restUrl: '/wp-json/wp/v2/',
  nonce: '${nonce}',
  siteUrl: '${siteUrl}',
};

// ── Dirty state tracking ──────────────────────────────────────────
function markDirty() {
  cfwpEditor.isDirty = true;
  document.getElementById('save-indicator').textContent = '저장되지 않은 변경사항';
  document.getElementById('save-indicator').style.color = '#996800';
}

function markClean() {
  cfwpEditor.isDirty = false;
  document.getElementById('save-indicator').textContent = '저장됨';
  document.getElementById('save-indicator').style.color = '#2e7d32';
  setTimeout(() => {
    if (!cfwpEditor.isDirty)
      document.getElementById('save-indicator').textContent = '${post?.post_status === 'publish' ? '발행됨' : '초안'}';
    document.getElementById('save-indicator').style.color = '#888';
  }, 3000);
}

// ── Title auto-resize ─────────────────────────────────────────────
function autoResizeTitle(el) {
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}
window.addEventListener('load', () => {
  const t = document.getElementById('post-title-input');
  if (t) autoResizeTitle(t);
});

// ── Tab switching ─────────────────────────────────────────────────
function switchTab(name) {
  document.querySelectorAll('.cfwp-sidebar-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.cfwp-sidebar-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('tab-' + name).classList.add('active');
  document.getElementById('panel-' + name).classList.add('active');
}

// ── Panel toggling ────────────────────────────────────────────────
function togglePanel(header) {
  const content = header.nextElementSibling;
  content.classList.toggle('open');
  header.querySelector('span').textContent = content.classList.contains('open') ? '▾' : '▸';
}

// ── Sidebar toggle ────────────────────────────────────────────────
function toggleSidebar() {
  const sidebar = document.getElementById('editor-sidebar');
  sidebar.style.display = sidebar.style.display === 'none' ? '' : 'none';
}

// ── Inserter ──────────────────────────────────────────────────────
function toggleInserter() {
  const panel = document.getElementById('inserter-panel');
  const main = document.getElementById('editor-main');
  const isVisible = panel.style.display !== 'none';
  panel.style.display = isVisible ? 'none' : 'flex';
  panel.style.flexDirection = 'column';
  main.style.marginLeft = isVisible ? '0' : '280px';
}

function filterBlocks(q) {
  const items = document.querySelectorAll('.cfwp-block-inserter-item');
  const lq = q.toLowerCase();
  items.forEach(el => {
    const name = el.dataset.name || '';
    el.style.display = !q || name.includes(lq) ? '' : 'none';
  });
}

// ── Block insertion ───────────────────────────────────────────────
const BLOCK_DEFINITIONS = {
  paragraph:     { icon:'¶', name:'단락', category:'text', html: () => '<p data-block="paragraph" class="wp-block" contenteditable="true"><br/></p>' },
  heading:       { icon:'H', name:'제목', category:'text', html: (l=2) => '<h'+l+' data-block="heading" class="wp-block" contenteditable="true" data-level="'+l+'"><br/></h'+l+'>' },
  image:         { icon:'🖼', name:'이미지', category:'media', html: () => '<figure data-block="image" class="wp-block wp-block-image"><img src="" alt=""/><button onclick="openMediaModal(\'block\')" style="display:block;margin:.5rem auto" class="components-button is-secondary">이미지 선택</button></figure>' },
  gallery:       { icon:'🖼🖼', name:'갤러리', category:'media', html: () => '<figure data-block="gallery" class="wp-block wp-block-gallery"><div class="blocks-gallery-grid"></div><button onclick="openMediaModal(\'gallery\')" class="components-button is-secondary">이미지 추가</button></figure>' },
  list:          { icon:'☰', name:'목록', category:'text', html: () => '<ul data-block="list" class="wp-block wp-block-list" contenteditable="true"><li>목록 항목 1</li><li>목록 항목 2</li></ul>' },
  'ordered-list':{ icon:'1.', name:'순서 있는 목록', category:'text', html: () => '<ol data-block="ordered-list" class="wp-block wp-block-list" contenteditable="true"><li>첫 번째</li><li>두 번째</li></ol>' },
  quote:         { icon:'"', name:'인용', category:'text', html: () => '<blockquote data-block="quote" class="wp-block wp-block-quote" contenteditable="true"><p>인용문 내용</p></blockquote>' },
  code:          { icon:'<>', name:'코드', category:'text', html: () => '<pre data-block="code" class="wp-block wp-block-code"><code contenteditable="true">코드를 입력하세요</code></pre>' },
  separator:     { icon:'—', name:'구분선', category:'layout', html: () => '<hr data-block="separator" class="wp-block wp-block-separator"/>' },
  spacer:        { icon:'↕', name:'여백', category:'layout', html: () => '<div data-block="spacer" class="wp-block wp-block-spacer" style="height:100px" contenteditable="false"></div>' },
  table:         { icon:'⊞', name:'표', category:'text', html: () => '<figure data-block="table" class="wp-block wp-block-table"><table contenteditable="true"><thead><tr><th>열 1</th><th>열 2</th></tr></thead><tbody><tr><td>내용</td><td>내용</td></tr></tbody></table></figure>' },
  button:        { icon:'[  ]', name:'버튼', category:'design', html: () => '<div data-block="button" class="wp-block wp-block-buttons"><div class="wp-block-button"><a class="wp-block-button__link" href="#" contenteditable="true">버튼 텍스트</a></div></div>' },
  columns:       { icon:'⧠⧠', name:'열', category:'layout', html: () => '<div data-block="columns" class="wp-block wp-block-columns"><div class="wp-block-column" contenteditable="true"><p>열 1</p></div><div class="wp-block-column" contenteditable="true"><p>열 2</p></div></div>' },
  cover:         { icon:'🖼+T', name:'커버', category:'media', html: () => '<div data-block="cover" class="wp-block wp-block-cover" style="background:#1e1e1e;min-height:300px;display:flex;align-items:center;justify-content:center"><p class="wp-block-cover__inner-container" style="color:#fff;font-size:2rem" contenteditable="true">커버 텍스트</p></div>' },
  video:         { icon:'▶', name:'동영상', category:'media', html: () => '<figure data-block="video" class="wp-block wp-block-video"><video controls src=""></video></figure>' },
  audio:         { icon:'🔊', name:'오디오', category:'media', html: () => '<figure data-block="audio" class="wp-block wp-block-audio"><audio controls src=""></audio></figure>' },
  embed:         { icon:'🔗', name:'임베드', category:'embeds', html: () => '<figure data-block="embed" class="wp-block wp-block-embed"><div class="wp-block-embed__wrapper"><input type="url" placeholder="임베드할 URL을 입력하세요" style="width:100%;padding:.5rem;border:1px solid #ddd" onchange="embedUrl(this)"/></div></figure>' },
  html:          { icon:'<>', name:'사용자 정의 HTML', category:'text', html: () => '<div data-block="html" class="wp-block"><textarea placeholder="HTML 입력..." style="width:100%;min-height:100px;border:1px solid #ddd;padding:.5rem;font-family:monospace;font-size:.85rem" oninput="markDirty()"></textarea></div>' },
  pullquote:     { icon:'"', name:'끌어온 인용', category:'text', html: () => '<figure data-block="pullquote" class="wp-block wp-block-pullquote"><blockquote contenteditable="true"><p>인용문 내용</p><cite>출처</cite></blockquote></figure>' },
  verse:         { icon:'♫', name:'운문', category:'text', html: () => '<pre data-block="verse" class="wp-block wp-block-verse" contenteditable="true">운문 내용</pre>' },
  preformatted:  { icon:'{}', name:'서식 있는 텍스트', category:'text', html: () => '<pre data-block="preformatted" class="wp-block wp-block-preformatted" contenteditable="true">서식 있는 텍스트</pre>' },
  'media-text':  { icon:'🖼+T', name:'미디어 & 텍스트', category:'layout', html: () => '<div data-block="media-text" class="wp-block wp-block-media-text"><figure class="wp-block-media-text__media"><img src="" alt=""/></figure><div class="wp-block-media-text__content" contenteditable="true"><p>텍스트</p></div></div>' },
  group:         { icon:'□', name:'그룹', category:'layout', html: () => '<div data-block="group" class="wp-block wp-block-group"><div class="wp-block-group__inner-container" contenteditable="true"><p>그룹 내용</p></div></div>' },
  search:        { icon:'🔍', name:'검색', category:'widgets', html: () => '<div data-block="search" class="wp-block wp-block-search"><form><input type="search" placeholder="검색..."/><button type="submit">검색</button></form></div>' },
  'social-links':{ icon:'↗', name:'소셜 아이콘', category:'widgets', html: () => '<ul data-block="social-links" class="wp-block wp-block-social-links"><li class="wp-social-link wp-social-link-twitter"><a href="#">Twitter</a></li></ul>' },
  shortcode:     { icon:'[…]', name:'단축코드', category:'widgets', html: () => '<div data-block="shortcode" class="wp-block"><input type="text" placeholder="[shortcode]" style="width:100%;border:1px solid #ddd;padding:.5rem;font-family:monospace" oninput="markDirty()"/></div>' },
  more:          { icon:'···', name:'더 보기', category:'layout', html: () => '<div data-block="more" class="wp-block" style="border-top:1px dashed #ccc;text-align:center;padding:.25rem;color:#888;font-size:.85rem">더 보기</div>' },
};

const BLOCK_CATEGORIES = {
  text: '텍스트',
  media: '미디어',
  design: '디자인',
  layout: '레이아웃',
  widgets: '위젯',
  embeds: '임베드',
};

function insertBlock(type, afterEl) {
  const def = BLOCK_DEFINITIONS[type];
  if (!def) return;

  const html = def.html();
  const editor = document.getElementById('block-editor');
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  const newBlock = tmp.firstElementChild;

  if (newBlock) {
    newBlock.addEventListener('click', (e) => { e.stopPropagation(); selectBlock(newBlock); });
    newBlock.addEventListener('input', markDirty);
    newBlock.addEventListener('keydown', (e) => handleBlockKeydown(e, newBlock));

    if (afterEl && afterEl.parentNode === editor) {
      editor.insertBefore(newBlock, afterEl.nextSibling);
    } else {
      editor.appendChild(newBlock);
    }

    // Focus editable
    const editable = newBlock.querySelector('[contenteditable="true"]');
    if (editable) { editable.focus(); placeCursorAtEnd(editable); }
    selectBlock(newBlock);
    markDirty();
    closeSlashPopup();
    const hint = document.getElementById('cfwp-add-block-hint');
    if (hint) hint.style.display = 'none';
  }
}

function placeCursorAtEnd(el) {
  const range = document.createRange();
  const sel = window.getSelection();
  range.selectNodeContents(el);
  range.collapse(false);
  sel?.removeAllRanges();
  sel?.addRange(range);
}

function selectBlock(el) {
  document.querySelectorAll('[data-block].is-selected').forEach(b => b.classList.remove('is-selected'));
  if (el) {
    el.classList.add('is-selected');
    cfwpEditor.selectedBlockEl = el;
    updateBlockSettings(el);
    switchTab('block');
  }
}

function updateBlockSettings(el) {
  const type = el.dataset.block;
  const panel = document.getElementById('block-settings-content');
  const settings = generateBlockSettings(type, el);
  panel.innerHTML = settings;
}

function generateBlockSettings(type, el) {
  switch(type) {
    case 'heading':
      const level = el.tagName?.toLowerCase().replace('h','') || '2';
      return '<div style="padding:.5rem"><label style="font-size:.85rem;font-weight:600">제목 수준</label><div style="display:flex;gap:.25rem;margin-top:.5rem">' +
        [1,2,3,4,5,6].map(l => '<button class="components-button'+(level==l?' is-pressed':'')+'" onclick="changeHeadingLevel('+l+')" style="font-size:.8rem;min-width:2rem">H'+l+'</button>').join('') +
        '</div></div>';
    case 'image':
      return '<div style="padding:.5rem"><label style="font-size:.85rem;font-weight:600">이미지 설정</label><div style="margin-top:.5rem"><label style="font-size:.8rem">대체 텍스트</label><input type="text" style="width:100%;margin-top:.2rem;font-size:.85rem;border:1px solid #ddd;border-radius:2px;padding:.3rem"/></div><div style="margin-top:.5rem"><label style="font-size:.8rem">정렬</label><div style="display:flex;gap:.25rem;margin-top:.2rem"><button class="components-button">◀</button><button class="components-button">—</button><button class="components-button">▶</button></div></div></div>';
    case 'paragraph':
      return '<div style="padding:.5rem"><label style="font-size:.85rem;font-weight:600">색상 설정</label><div style="margin-top:.5rem;display:flex;gap:.25rem;flex-wrap:wrap">' +
        ['#000','#fff','#2271b1','#d63638','#46b450','#996800'].map(c =>
          '<button onclick="applyColor(\''+c+'\')" style="width:24px;height:24px;background:'+c+';border:1px solid #ddd;border-radius:2px;cursor:pointer"></button>'
        ).join('') + '</div><div style="margin-top:.5rem"><label style="font-size:.8rem">드롭 캡</label><input type="checkbox" onchange="toggleDropCap(this.checked)"/></div></div>';
    default:
      return '<div style="padding:1rem;font-size:.85rem;color:#666"><strong>'+type+'</strong> 블록<br/><br/><div><label>추가 CSS 클래스</label><input type="text" style="width:100%;margin-top:.4rem;border:1px solid #ddd;border-radius:2px;padding:.3rem;font-size:.85rem" placeholder="클래스 이름"/></div></div>';
  }
}

function changeHeadingLevel(level) {
  const el = cfwpEditor.selectedBlockEl;
  if (!el || !el.tagName.match(/^H[1-6]$/i)) return;
  const newEl = document.createElement('h'+level);
  newEl.innerHTML = el.innerHTML;
  newEl.dataset.block = 'heading';
  newEl.className = el.className;
  newEl.contentEditable = 'true';
  newEl.dataset.level = level;
  newEl.addEventListener('click', (e) => { e.stopPropagation(); selectBlock(newEl); });
  newEl.addEventListener('input', markDirty);
  el.parentNode.replaceChild(newEl, el);
  cfwpEditor.selectedBlockEl = newEl;
  markDirty();
  updateBlockSettings(newEl);
}

function applyColor(color) {
  const el = cfwpEditor.selectedBlockEl;
  if (el) { el.style.color = color; markDirty(); }
}

function toggleDropCap(on) {
  const el = cfwpEditor.selectedBlockEl;
  if (el) { el.classList.toggle('has-drop-cap', on); markDirty(); }
}

// ── Slash command ─────────────────────────────────────────────────
let slashTarget = null;

function handleBlockKeydown(e, blockEl) {
  if (e.key === '/') {
    const sel = window.getSelection();
    const range = sel?.getRangeAt(0);
    if (!range) return;
    const rect = range.getBoundingClientRect();
    showSlashPopup(rect.left, rect.bottom + window.scrollY, blockEl);
    return;
  }
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    insertBlock('paragraph', blockEl);
  }
  if (e.key === 'Backspace') {
    const editable = blockEl.querySelector('[contenteditable]') || blockEl;
    if (editable.textContent === '' || editable.innerHTML === '<br>') {
      e.preventDefault();
      const prev = blockEl.previousElementSibling;
      blockEl.remove();
      if (prev) selectBlock(prev);
      markDirty();
    }
  }
}

function showSlashPopup(x, y, targetBlock) {
  slashTarget = targetBlock;
  const popup = document.getElementById('slash-popup');
  popup.style.display = 'block';
  popup.style.left = Math.min(x, window.innerWidth - 300) + 'px';
  popup.style.top = y + 'px';
  renderSlashItems('');
  setTimeout(() => {
    const firstItem = popup.querySelector('.cfwp-slash-item');
    if (firstItem) firstItem.classList.add('active');
  }, 0);
}

function closeSlashPopup() {
  document.getElementById('slash-popup').style.display = 'none';
  slashTarget = null;
}

function renderSlashItems(q) {
  const popup = document.getElementById('slash-popup');
  const lq = q.toLowerCase();
  const filtered = Object.entries(BLOCK_DEFINITIONS).filter(([k, v]) =>
    !q || v.name.includes(lq) || k.includes(lq)
  ).slice(0, 10);

  popup.innerHTML = filtered.map(([key, def]) =>
    '<div class="cfwp-slash-item" data-type="'+key+'" onclick="insertBlock(\''+key+'\', slashTarget);closeSlashPopup()">'+
    '<div class="cfwp-slash-icon">'+def.icon+'</div>'+
    '<div><div class="cfwp-slash-name">'+def.name+'</div>'+
    '<div class="cfwp-slash-desc">'+BLOCK_CATEGORIES[def.category]+'</div></div>'+
    '</div>'
  ).join('');
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeSlashPopup();
});

document.addEventListener('click', (e) => {
  if (!e.target.closest('#slash-popup')) closeSlashPopup();
  if (!e.target.closest('[data-block]')) {
    document.querySelectorAll('[data-block].is-selected').forEach(b => b.classList.remove('is-selected'));
    cfwpEditor.selectedBlockEl = null;
  }
});

function handleCanvasClick(e) {
  const block = e.target.closest('[data-block]');
  if (block) selectBlock(block);
}

// ── Content serialization ─────────────────────────────────────────
function serializeContent() {
  const editor = document.getElementById('block-editor');
  const blocks = Array.from(editor.querySelectorAll('[data-block]'));
  return blocks.map(block => serializeBlock(block)).join('\n\n');
}

function serializeBlock(el) {
  const type = el.dataset.block;
  const innerHTML = el.innerHTML || '';

  switch(type) {
    case 'paragraph': return '<!-- wp:paragraph -->\n<p>' + el.innerHTML + '</p>\n<!-- /wp:paragraph -->';
    case 'heading':
      const level = el.tagName.replace(/H/i, '') || '2';
      return '<!-- wp:heading {"level":'+level+'} -->\n<h'+level+'>'+el.innerHTML+'</h'+level+'>\n<!-- /wp:heading -->';
    case 'image':
      const img = el.querySelector('img');
      return '<!-- wp:image -->\n<figure class="wp-block-image">'+(img ? img.outerHTML : '')+'</figure>\n<!-- /wp:image -->';
    case 'list':
      return '<!-- wp:list -->\n<ul class="wp-block-list">'+el.innerHTML+'</ul>\n<!-- /wp:list -->';
    case 'ordered-list':
      return '<!-- wp:list {"ordered":true} -->\n<ol class="wp-block-list">'+el.innerHTML+'</ol>\n<!-- /wp:list -->';
    case 'quote':
      return '<!-- wp:quote -->\n'+el.outerHTML+'\n<!-- /wp:quote -->';
    case 'code':
      const code = el.querySelector('code');
      return '<!-- wp:code -->\n<pre class="wp-block-code"><code>'+(code ? code.innerHTML : '')+'</code></pre>\n<!-- /wp:code -->';
    case 'separator': return '<!-- wp:separator -->\n<hr class="wp-block-separator"/>\n<!-- /wp:separator -->';
    case 'spacer':
      const h = el.style.height || '100px';
      return '<!-- wp:spacer {"height":"'+h+'"} -->\n<div class="wp-block-spacer" style="height:'+h+'" aria-hidden="true"></div>\n<!-- /wp:spacer -->';
    case 'table':
      const table = el.querySelector('table');
      return '<!-- wp:table -->\n<figure class="wp-block-table">'+(table ? table.outerHTML : '')+'</figure>\n<!-- /wp:table -->';
    case 'button':
      return '<!-- wp:buttons -->\n<div class="wp-block-buttons">'+el.innerHTML+'</div>\n<!-- /wp:buttons -->';
    case 'html':
      const textarea = el.querySelector('textarea');
      return '<!-- wp:html -->\n'+(textarea ? textarea.value : '')+ '\n<!-- /wp:html -->';
    case 'cover':
      return '<!-- wp:cover -->\n'+el.outerHTML+'\n<!-- /wp:cover -->';
    case 'columns':
      return '<!-- wp:columns -->\n'+el.outerHTML+'\n<!-- /wp:columns -->';
    case 'group':
      return '<!-- wp:group -->\n'+el.outerHTML+'\n<!-- /wp:group -->';
    case 'pullquote':
      return '<!-- wp:pullquote -->\n'+el.outerHTML+'\n<!-- /wp:pullquote -->';
    case 'verse':
      return '<!-- wp:verse -->\n<pre class="wp-block-verse">'+el.innerHTML+'</pre>\n<!-- /wp:verse -->';
    case 'preformatted':
      return '<!-- wp:preformatted -->\n'+el.outerHTML+'\n<!-- /wp:preformatted -->';
    case 'more':
      return '<!-- wp:more --><!--more--><!-- /wp:more -->';
    case 'embed':
      const embedInput = el.querySelector('input[type="url"]');
      const url = embedInput ? embedInput.value : '';
      return '<!-- wp:embed {"url":"'+url+'"} -->\n<figure class="wp-block-embed"><div class="wp-block-embed__wrapper">'+url+'</div></figure>\n<!-- /wp:embed -->';
    default:
      return '<!-- wp:'+type+' -->\n'+el.outerHTML+'\n<!-- /wp:'+type+' -->';
  }
}

// ── Save / Publish ────────────────────────────────────────────────
async function savePost(publish) {
  if (cfwpEditor.saving) return;
  cfwpEditor.saving = true;
  document.getElementById('btn-publish').textContent = '저장 중...';
  document.getElementById('btn-publish').disabled = true;

  const content = serializeContent();
  const title = document.getElementById('post-title-input').value;
  const excerpt = document.getElementById('post-excerpt')?.value || '';
  const slug = document.getElementById('post-slug')?.value || '';
  const status = document.getElementById('post-status-select').value;
  const date = document.getElementById('publish-date')?.value || '';

  const payload = {
    title, content, excerpt, status,
    slug: slug || title.toLowerCase().replace(/[^a-z0-9가-힣]/g, '-').replace(/-+/g, '-'),
    date: date ? date.replace('T', ' ') : undefined,
    comment_status: document.getElementById('comment-status')?.checked ? 'open' : 'closed',
    ping_status: document.getElementById('ping-status')?.checked ? 'open' : 'closed',
    type: cfwpEditor.postType,
  };

  try {
    const url = cfwpEditor.postId
      ? cfwpEditor.restUrl + (cfwpEditor.postType === 'page' ? 'pages' : 'posts') + '/' + cfwpEditor.postId
      : cfwpEditor.restUrl + (cfwpEditor.postType === 'page' ? 'pages' : 'posts');
    const method = cfwpEditor.postId ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-WP-Nonce': cfwpEditor.nonce },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      const data = await res.json();
      if (!cfwpEditor.postId && data.id) {
        cfwpEditor.postId = data.id;
        history.pushState({}, '', '/wp-admin/post.php?post=' + data.id + '&action=edit');
      }
      markClean();
      document.getElementById('btn-publish').textContent = status === 'publish' ? '업데이트' : '발행';
    } else {
      const err = await res.json().catch(() => ({}));
      alert('저장 실패: ' + (err.message || res.status));
    }
  } catch(e) {
    alert('오류: ' + e.message);
  } finally {
    cfwpEditor.saving = false;
    document.getElementById('btn-publish').disabled = false;
  }
}

// Auto-save every 60 seconds
setInterval(() => { if (cfwpEditor.isDirty) savePost(); }, 60000);

// Keyboard shortcut
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); savePost(); }
});

function previewPost() {
  const content = serializeContent();
  const title = document.getElementById('post-title-input').value;
  const win = window.open('', '_blank');
  win.document.write('<html><head><title>미리보기: '+title+'</title></head><body style="max-width:840px;margin:2rem auto;font-family:sans-serif"><h1>'+title+'</h1>'+content+'</body></html>');
}

function moveToTrash() {
  if (!cfwpEditor.postId) { history.back(); return; }
  if (!confirm('정말 휴지통으로 이동하시겠습니까?')) return;
  fetch(cfwpEditor.restUrl + (cfwpEditor.postType === 'page' ? 'pages' : 'posts') + '/' + cfwpEditor.postId, {
    method: 'DELETE', headers: { 'X-WP-Nonce': cfwpEditor.nonce }
  }).then(() => { location.href = '/wp-admin/edit.php' + (cfwpEditor.postType === 'page' ? '?post_type=page' : ''); });
}

// ── Media modal ───────────────────────────────────────────────────
function openMediaModal(target) {
  cfwpEditor.mediaCallback = target;
  const modal = document.getElementById('media-modal');
  modal.style.display = 'flex';
  loadMediaItems();
}

function closeMediaModal() {
  document.getElementById('media-modal').style.display = 'none';
  cfwpEditor.selectedMediaId = null;
}

async function loadMediaItems() {
  const grid = document.getElementById('media-modal-grid');
  grid.innerHTML = '불러오는 중...';
  try {
    const res = await fetch('/wp-json/wp/v2/media?per_page=40');
    const items = await res.json();
    grid.innerHTML = '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:.5rem">' +
      items.map(item =>
        '<div class="media-item" data-id="'+item.id+'" data-url="'+(item.source_url||'')+'" data-alt="'+(item.alt_text||'')+'" '+
        'onclick="selectMedia(this)" '+
        'style="cursor:pointer;border:2px solid transparent;border-radius:3px;overflow:hidden;aspect-ratio:1">'+
        '<img src="'+(item.source_url||'')+'" style="width:100%;height:100%;object-fit:cover"/></div>'
      ).join('') + '</div>';
    if (!items.length) grid.innerHTML = '<p style="text-align:center;padding:2rem">미디어가 없습니다. <a href="/wp-admin/media-new.php">업로드하세요</a></p>';
  } catch(e) { grid.innerHTML = '<p>미디어를 불러오지 못했습니다.</p>'; }
}

function selectMedia(el) {
  document.querySelectorAll('.media-item').forEach(m => m.style.borderColor = 'transparent');
  el.style.borderColor = '#2271b1';
  cfwpEditor.selectedMediaId = { id: el.dataset.id, url: el.dataset.url, alt: el.dataset.alt };
  document.getElementById('media-modal-details').innerHTML = '<img src="'+el.dataset.url+'" style="width:100%;margin-bottom:.5rem"/><p style="font-size:.8rem">ID: '+el.dataset.id+'</p>';
}

function insertSelectedMedia() {
  const m = cfwpEditor.selectedMediaId;
  if (!m) { alert('미디어를 선택하세요.'); return; }

  if (cfwpEditor.mediaCallback === 'featured') {
    document.getElementById('featured-image-container').innerHTML =
      '<img src="'+m.url+'" style="width:100%;border-radius:3px;margin-bottom:.5rem"/>' +
      '<button class="components-button" style="width:100%;color:#b32d2e;font-size:.8rem" onclick="document.getElementById(\'featured-image-container\').innerHTML=\'<button onclick=openMediaModal(\\\"featured\\\") class=components-button>대표 이미지 설정</button>\'">대표 이미지 제거</button>';
  } else if (cfwpEditor.mediaCallback === 'block' && cfwpEditor.selectedBlockEl) {
    const img = cfwpEditor.selectedBlockEl.querySelector('img');
    if (img) { img.src = m.url; img.alt = m.alt; }
    const btn = cfwpEditor.selectedBlockEl.querySelector('button');
    if (btn) btn.remove();
    markDirty();
  }

  closeMediaModal();
}

// ── Tags ──────────────────────────────────────────────────────────
var postTags = [];
function handleTagInput(e) {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault();
    const val = e.target.value.trim().replace(/,$/, '');
    if (val && !postTags.includes(val)) {
      postTags.push(val);
      renderTags();
    }
    e.target.value = '';
  }
}
function renderTags() {
  const list = document.getElementById('tag-list');
  if (!list) return;
  list.innerHTML = postTags.map((t,i) =>
    '<span style="background:#e0e0e0;padding:.15rem .5rem;border-radius:3px;font-size:.8rem;display:flex;align-items:center;gap:.25rem">'+
    t+'<button onclick="removeTag('+i+')" style="border:none;background:none;cursor:pointer;font-size:.8rem;line-height:1">×</button></span>'
  ).join('');
}
function removeTag(i) { postTags.splice(i, 1); renderTags(); }

// ── Category ──────────────────────────────────────────────────────
function showNewCategoryForm() {
  const f = document.getElementById('new-category-form');
  if (f) f.style.display = f.style.display === 'none' ? '' : 'none';
}
async function addCategory() {
  const name = document.getElementById('new-cat-name')?.value.trim();
  if (!name) return;
  const fd = new FormData(); fd.append('action','add-category'); fd.append('tag-name',name);
  const res = await fetch('/wp-admin/admin-ajax.php', { method:'POST', body:fd });
  const data = await res.json();
  if (data.success) {
    const list = document.getElementById('category-list');
    if (list) list.innerHTML += '<label><input type="checkbox" value="'+data.data.term_id+'" checked/> '+name+'</label>';
    document.getElementById('new-cat-name').value = '';
    document.getElementById('new-category-form').style.display = 'none';
  }
}

// ── Embed URL ────────────────────────────────────────────────────
function embedUrl(input) {
  const url = input.value;
  if (!url) return;
  const wrapper = input.closest('[data-block="embed"]').querySelector('.wp-block-embed__wrapper');
  let embedHtml = url;
  if (url.includes('youtube.com') || url.includes('youtu.be')) {
    const vid = url.match(/(?:v=|youtu\.be\/)([^&?]+)/)?.[1];
    if (vid) embedHtml = '<iframe src="https://www.youtube.com/embed/'+vid+'" width="100%" height="315" frameborder="0" allowfullscreen></iframe>';
  }
  wrapper.innerHTML = embedHtml;
  markDirty();
}

// Initialize blocks from existing content
${generateInitBlocksScript(post?.post_content || '')}

// Initialize
document.querySelectorAll('[data-block]').forEach(el => {
  el.addEventListener('click', (e) => { e.stopPropagation(); selectBlock(el); });
  el.addEventListener('input', markDirty);
  el.addEventListener('keydown', (e) => handleBlockKeydown(e, el));
});

// Slug auto-update
document.getElementById('post-title-input')?.addEventListener('input', function() {
  const slug = this.value.toLowerCase()
    .replace(/[가-힣]+/g, s => s)
    .replace(/[^a-z0-9가-힣]/g, '-')
    .replace(/-+/g, '-').replace(/^-|-$/g, '');
  const slugEl = document.getElementById('post-slug');
  const previewEl = document.getElementById('slug-preview');
  if (slugEl && !slugEl.value) slugEl.value = slug;
  if (previewEl) previewEl.textContent = slug;
});
</script>

${adminScripts.map(s => `<script src="${s.src}"></script>`).join('\n')}
</body>
</html>`;
}

function generateBlockInserterHTML(): string {
  const categories: Record<string, Array<[string, any]>> = {};
  const BLOCK_CATEGORIES: Record<string, string> = {
    text: '텍스트', media: '미디어', design: '디자인',
    layout: '레이아웃', widgets: '위젯', embeds: '임베드'
  };

  // Just output a simple structure that JS will populate
  return Object.entries(BLOCK_CATEGORIES).map(([cat, label]) => `
    <div class="block-category">
      <div style="padding:.5rem 1rem;font-size:.75rem;font-weight:700;text-transform:uppercase;color:#888;letter-spacing:.05em">${label}</div>
      <div class="block-list" id="cat-${cat}" style="padding:0 .5rem">
        <!-- Populated by JS -->
      </div>
    </div>
  `).join('') + `
  <script>
  const BLOCK_DEFS = ${JSON.stringify(Object.entries({
    paragraph: { icon: '¶', name: '단락', category: 'text' },
    heading: { icon: 'H', name: '제목', category: 'text' },
    image: { icon: '🖼', name: '이미지', category: 'media' },
    gallery: { icon: '⊞', name: '갤러리', category: 'media' },
    list: { icon: '☰', name: '목록', category: 'text' },
    quote: { icon: '"', name: '인용', category: 'text' },
    code: { icon: '<>', name: '코드', category: 'text' },
    separator: { icon: '—', name: '구분선', category: 'layout' },
    table: { icon: '⊞', name: '표', category: 'text' },
    button: { icon: '□', name: '버튼', category: 'design' },
    columns: { icon: '⧠⧠', name: '열', category: 'layout' },
    cover: { icon: '🖼', name: '커버', category: 'media' },
    video: { icon: '▶', name: '동영상', category: 'media' },
    audio: { icon: '🔊', name: '오디오', category: 'media' },
    embed: { icon: '🔗', name: '임베드', category: 'embeds' },
    html: { icon: '<>', name: '사용자 정의 HTML', category: 'text' },
    search: { icon: '🔍', name: '검색', category: 'widgets' },
    shortcode: { icon: '[…]', name: '단축코드', category: 'widgets' },
    more: { icon: '···', name: '더 보기', category: 'layout' },
    spacer: { icon: '↕', name: '여백', category: 'layout' },
    group: { icon: '□', name: '그룹', category: 'layout' },
    pullquote: { icon: '"', name: '끌어온 인용', category: 'text' },
    verse: { icon: '♫', name: '운문', category: 'text' },
  }).reduce((acc, [k, v]) => { acc[k] = v; return acc; }, {} as any))};

  Object.entries(BLOCK_DEFS).forEach(([key, def]) => {
    const container = document.getElementById('cat-' + def.category);
    if (container) {
      const item = document.createElement('div');
      item.className = 'cfwp-block-inserter-item';
      item.dataset.name = def.name.toLowerCase() + ' ' + key;
      item.style.cssText = 'display:flex;align-items:center;gap:.5rem;padding:.4rem .5rem;cursor:pointer;border-radius:3px;font-size:.85rem';
      item.innerHTML = '<span style="width:28px;height:28px;display:flex;align-items:center;justify-content:center;background:#f0f0f0;border-radius:3px;font-size:.9rem">'+def.icon+'</span>'+def.name;
      item.addEventListener('click', () => { insertBlock(key); });
      item.addEventListener('mouseover', () => { item.style.background = '#f0f6fc'; });
      item.addEventListener('mouseout', () => { item.style.background = ''; });
      container.appendChild(item);
    }
  });
  <\/script>`;
}

function generateInitialBlocks(content: string): string {
  if (!content) return '';
  // Parse WP block comments and render as editable blocks
  const blocks = content.split(/\n\n+/).filter(Boolean);
  return blocks.map(block => {
    const match = block.match(/<!-- wp:(\S+?)(?:\s+({[^}]+}))?\s*-->([\s\S]*?)<!-- \/wp:\S+ -->/);
    if (!match) {
      // Freeform
      return `<p data-block="paragraph" class="wp-block" contenteditable="true">${block.replace(/<!--[^>]*-->/g, '').trim()}</p>`;
    }
    const [, name, , inner] = match;
    const cleanName = name.includes('/') ? name.split('/')[1] : name;
    const cleanInner = inner?.trim() || '';

    switch(cleanName) {
      case 'paragraph': return `<p data-block="paragraph" class="wp-block" contenteditable="true">${cleanInner.replace(/<\/?p>/g, '')}</p>`;
      case 'heading':
        const levelMatch = block.match(/"level":(\d)/);
        const level = levelMatch ? levelMatch[1] : '2';
        return `<h${level} data-block="heading" class="wp-block" contenteditable="true" data-level="${level}">${cleanInner.replace(/<\/?h[1-6]>/g, '')}</h${level}>`;
      case 'list':
        const ordered = block.includes('"ordered":true');
        return `<${ordered ? 'ol' : 'ul'} data-block="${ordered ? 'ordered-list' : 'list'}" class="wp-block wp-block-list" contenteditable="true">${cleanInner.replace(/<\/?[ou]l[^>]*>/g, '')}</${ordered ? 'ol' : 'ul'}>`;
      case 'quote':
        return `<blockquote data-block="quote" class="wp-block wp-block-quote" contenteditable="true">${cleanInner}</blockquote>`;
      case 'code':
        return `<pre data-block="code" class="wp-block wp-block-code"><code contenteditable="true">${cleanInner.replace(/<\/?(?:pre|code)[^>]*>/g, '')}</code></pre>`;
      case 'separator':
        return `<hr data-block="separator" class="wp-block wp-block-separator"/>`;
      case 'image':
        return `<figure data-block="image" class="wp-block wp-block-image">${cleanInner}</figure>`;
      case 'table':
        return `<figure data-block="table" class="wp-block wp-block-table"><table contenteditable="true">${cleanInner.replace(/<\/?(?:figure|table)[^>]*>/g, '')}</table></figure>`;
      default:
        return `<div data-block="${cleanName}" class="wp-block" contenteditable="true">${cleanInner}</div>`;
    }
  }).join('\n');
}

function generateInitBlocksScript(content: string): string {
  return `// Content loaded from DB`;
}
