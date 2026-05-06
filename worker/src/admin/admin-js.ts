export const ADMIN_JS = `
/* ════════════════════════════════════════════════════════════════
   CF-WordPress Admin JS — WordPress-identical behaviour
   ════════════════════════════════════════════════════════════════ */

(function($){
  'use strict';

  /* ── Admin menu collapse ──────────────────────────────────── */
  var menuCollapsed = localStorage.getItem('cfwp_menu_collapsed') === '1';

  function applyMenuState() {
    if (menuCollapsed) {
      document.getElementById('adminmenuwrap').style.width = '36px';
      document.getElementById('wpcontent').style.marginLeft = '36px';
    } else {
      document.getElementById('adminmenuwrap').style.width = '160px';
      document.getElementById('wpcontent').style.marginLeft = '160px';
    }
  }

  var collapseBtn = document.getElementById('collapse-menu');
  if (collapseBtn) {
    collapseBtn.addEventListener('click', function() {
      menuCollapsed = !menuCollapsed;
      localStorage.setItem('cfwp_menu_collapsed', menuCollapsed ? '1' : '0');
      applyMenuState();
    });
  }

  applyMenuState();

  /* ── Postbox toggle ───────────────────────────────────────── */
  document.querySelectorAll('.handlediv').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var box = btn.closest('.postbox');
      if (box) box.classList.toggle('closed');
    });
  });

  /* ── Screen options / Help tabs ───────────────────────────── */
  document.querySelectorAll('.show-settings').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var wrap = document.getElementById('screen-meta');
      if (wrap) wrap.classList.toggle('hidden');
    });
  });

  /* ── Bulk actions ─────────────────────────────────────────── */
  var selectAll = document.getElementById('cb-select-all-1');
  if (selectAll) {
    selectAll.addEventListener('change', function() {
      document.querySelectorAll('input[name="post[]"], input[name="delete_comments[]"], input[name="checked[]"]')
        .forEach(function(cb) { cb.checked = selectAll.checked; });
    });
  }

  /* ── Heartbeat (keep session alive) ──────────────────────── */
  setInterval(function() {
    var fd = new FormData();
    fd.append('action', 'heartbeat');
    fd.append('_nonce', typeof wpApiSettings !== 'undefined' ? wpApiSettings.nonce : '');
    fetch('/wp-admin/admin-ajax.php', { method: 'POST', body: fd }).catch(function(){});
  }, 60000);

  /* ── Notice dismissal ─────────────────────────────────────── */
  document.querySelectorAll('.notice.is-dismissible').forEach(function(notice) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'notice-dismiss';
    btn.innerHTML = '<span class="screen-reader-text">이 알림 닫기</span>';
    btn.style.cssText = 'position:absolute;top:0;right:1px;padding:9px;background:none;border:none;cursor:pointer;color:inherit';
    btn.addEventListener('click', function() { notice.remove(); });
    notice.style.position = 'relative';
    notice.appendChild(btn);
  });

  /* ── Inline post edit (Quick Edit) ───────────────────────── */
  window.inlineEdit = {
    open: function(postId) {
      var row = document.getElementById('post-' + postId);
      if (!row) return;
      var title = row.querySelector('.row-title');
      var existing = document.getElementById('inline-edit-row');
      if (existing) existing.remove();

      var editRow = document.createElement('tr');
      editRow.id = 'inline-edit-row';
      editRow.innerHTML = '<td colspan="7"><div style="padding:10px;background:#f0f6fc;border:1px solid #c3c4c7;border-radius:3px">' +
        '<div style="display:flex;gap:15px;align-items:flex-start">' +
        '<div style="flex:1"><label style="font-weight:600;display:block;margin-bottom:4px">제목</label>' +
        '<input type="text" id="inline-title" value="' + (title ? title.textContent : '') + '" style="width:100%"/></div>' +
        '<div><label style="font-weight:600;display:block;margin-bottom:4px">상태</label>' +
        '<select id="inline-status"><option value="publish">발행됨</option><option value="draft">초안</option><option value="private">비공개</option></select></div>' +
        '</div>' +
        '<p style="margin-top:10px;display:flex;gap:8px">' +
        '<button class="button button-primary" onclick="inlineEdit.save(' + postId + ')">업데이트</button>' +
        '<button class="button" onclick="document.getElementById(\'inline-edit-row\').remove()">취소</button>' +
        '</p></div></td>';
      row.parentNode.insertBefore(editRow, row.nextSibling);
    },
    save: async function(postId) {
      var title = document.getElementById('inline-title').value;
      var status = document.getElementById('inline-status').value;
      var res = await fetch('/wp-json/wp/v2/posts/' + postId, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-WP-Nonce': wpApiSettings.nonce },
        body: JSON.stringify({ title: title, status: status })
      });
      if (res.ok) location.reload();
    }
  };

  document.querySelectorAll('.editinline').forEach(function(el) {
    el.addEventListener('click', function(e) {
      e.preventDefault();
      var row = el.closest('tr');
      var id = row ? row.id.replace('post-', '') : null;
      if (id) inlineEdit.open(parseInt(id));
    });
  });

  /* ── Options form save (General settings etc.) ────────────── */
  document.querySelectorAll('form[action="/api/options/save"]').forEach(function(form) {
    form.addEventListener('submit', async function(e) {
      e.preventDefault();
      var fd = new FormData(form);
      var data = {};
      fd.forEach(function(v, k) { data[k] = v; });
      try {
        var res = await fetch('/api/options/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        var result = await res.json();
        if (result.success) {
          showAdminNotice('설정이 저장되었습니다.', 'success');
        } else {
          showAdminNotice('저장 실패: ' + JSON.stringify(result), 'error');
        }
      } catch(err) {
        showAdminNotice('오류: ' + err.message, 'error');
      }
    });
  });

  /* ── Admin notice helper ──────────────────────────────────── */
  window.showAdminNotice = function(message, type) {
    var existing = document.querySelectorAll('.cfwp-admin-notice');
    existing.forEach(function(n) { n.remove(); });
    var notice = document.createElement('div');
    notice.className = 'notice notice-' + (type || 'info') + ' cfwp-admin-notice is-dismissible';
    notice.innerHTML = '<p>' + message + '</p>';
    notice.style.cssText = 'position:relative;padding:1px 12px;margin:5px 15px 15px 20px;border-left:4px solid;';
    var wrap = document.querySelector('.wrap h1') || document.querySelector('#wpbody-content');
    if (wrap && wrap.parentNode) {
      wrap.parentNode.insertBefore(notice, wrap.nextSibling);
    }
    var dismissBtn = document.createElement('button');
    dismissBtn.type = 'button';
    dismissBtn.className = 'notice-dismiss';
    dismissBtn.innerHTML = '✕';
    dismissBtn.style.cssText = 'position:absolute;top:4px;right:4px;background:none;border:none;cursor:pointer;font-size:16px;color:inherit;padding:0';
    dismissBtn.addEventListener('click', function() { notice.remove(); });
    notice.appendChild(dismissBtn);
    setTimeout(function() { if (notice.parentNode) notice.remove(); }, 5000);
  };

  /* ── Media upload drag and drop ───────────────────────────── */
  var dragArea = document.getElementById('drag-drop-area');
  if (dragArea) {
    dragArea.addEventListener('dragover', function(e) {
      e.preventDefault();
      dragArea.style.background = '#f0f6fc';
      dragArea.style.borderColor = '#2271b1';
    });
    dragArea.addEventListener('dragleave', function() {
      dragArea.style.background = '';
      dragArea.style.borderColor = '#c3c4c7';
    });
    dragArea.addEventListener('drop', function(e) {
      e.preventDefault();
      dragArea.style.background = '';
      dragArea.style.borderColor = '#c3c4c7';
      var files = e.dataTransfer.files;
      if (files.length) uploadFiles(Array.from(files));
    });
  }

  async function uploadFiles(files) {
    var bar = document.getElementById('plupload-status-bar');
    for (var i = 0; i < files.length; i++) {
      var file = files[i];
      if (bar) bar.innerHTML += '<p>업로드 중: ' + file.name + '...</p>';
      var fd = new FormData();
      fd.append('action', 'upload-attachment');
      fd.append('async-upload', file);
      fd.append('name', file.name);
      try {
        var res = await fetch('/wp-admin/admin-ajax.php', { method: 'POST', body: fd });
        var data = await res.json();
        if (bar) {
          bar.innerHTML += '<p style="color:' + (data.success ? 'green' : 'red') + '">' +
            (data.success ? '✓ ' : '✗ ') + file.name + (data.success ? ' 업로드 완료' : ' 실패') + '</p>';
        }
      } catch(err) {
        if (bar) bar.innerHTML += '<p style="color:red">✗ ' + file.name + ' 오류: ' + err.message + '</p>';
      }
    }
  }

  /* ── Permalink custom structure toggle ────────────────────── */
  var permaRadios = document.querySelectorAll('input[name="permalink_structure"]');
  permaRadios.forEach(function(radio) {
    radio.addEventListener('change', function() {
      var customInput = document.querySelector('input[name="permalink_structure_custom"]');
      if (customInput) {
        customInput.disabled = radio.value !== 'custom';
      }
    });
  });

  /* ── Theme tab navigation (install page) ──────────────────── */
  document.querySelectorAll('.wpr-tab').forEach(function(tab) {
    tab.addEventListener('click', function(e) {
      e.preventDefault();
      var target = tab.getAttribute('href');
      document.querySelectorAll('.wpr-section').forEach(function(s) { s.style.display = 'none'; });
      document.querySelectorAll('.wpr-tab').forEach(function(t) { t.classList.remove('active'); });
      var section = document.querySelector(target);
      if (section) section.style.display = '';
      tab.classList.add('active');
    });
  });

  /* ── Bridge migration tabs ────────────────────────────────── */
  document.querySelectorAll('.bridge-tab').forEach(function(tab) {
    tab.addEventListener('click', function() {
      var target = tab.dataset.tab;
      document.querySelectorAll('.bridge-tab').forEach(function(t) { t.classList.remove('active'); });
      document.querySelectorAll('.bridge-tab-content').forEach(function(c) { c.classList.remove('active'); });
      tab.classList.add('active');
      var content = document.getElementById('bridge-' + target);
      if (content) content.classList.add('active');
    });
  });

  /* ── Bridge export ────────────────────────────────────────── */
  var bridgeExportBtn = document.getElementById('bridge-export-btn');
  if (bridgeExportBtn) {
    bridgeExportBtn.addEventListener('click', async function() {
      var progress = document.getElementById('bridge-export-progress');
      if (progress) progress.innerHTML = '<p>내보내기 중...</p>';
      var components = Array.from(document.querySelectorAll('input[name="components"]:checked')).map(function(c) { return c.value; });
      var fd = new FormData();
      fd.append('action', 'bridge_migration_export');
      components.forEach(function(c) { fd.append('components', c); });
      try {
        var res = await fetch('/wp-admin/admin-ajax.php', { method: 'POST', body: fd });
        var data = await res.json();
        if (data.success && data.data.export) {
          var blob = new Blob([data.data.export], { type: 'application/json' });
          var url = URL.createObjectURL(blob);
          var a = document.createElement('a');
          a.href = url;
          a.download = data.data.filename || 'bridge-export.json';
          a.click();
          URL.revokeObjectURL(url);
          if (progress) progress.innerHTML = '<p style="color:green">✓ 내보내기 완료!</p>';
        }
      } catch(err) {
        if (progress) progress.innerHTML = '<p style="color:red">✗ 오류: ' + err.message + '</p>';
      }
    });
  }

  var bridgeImportBtn = document.getElementById('bridge-import-btn');
  if (bridgeImportBtn) {
    bridgeImportBtn.addEventListener('click', async function() {
      var file = document.getElementById('bridge-import-file').files[0];
      if (!file) { alert('파일을 선택하세요.'); return; }
      var progress = document.getElementById('bridge-import-progress');
      if (progress) progress.innerHTML = '<p>가져오기 중...</p>';
      var fd = new FormData();
      fd.append('action', 'bridge_migration_import');
      fd.append('import_file', file);
      try {
        var res = await fetch('/wp-admin/admin-ajax.php', { method: 'POST', body: fd });
        var data = await res.json();
        if (progress) {
          progress.innerHTML = data.success
            ? '<p style="color:green">✓ ' + data.data.imported + '개 항목 가져오기 완료!</p>'
            : '<p style="color:red">✗ ' + JSON.stringify(data.data) + '</p>';
        }
      } catch(err) {
        if (progress) progress.innerHTML = '<p style="color:red">✗ 오류: ' + err.message + '</p>';
      }
    });
  }

  var bridgeBackupBtn = document.getElementById('bridge-create-backup-btn');
  if (bridgeBackupBtn) {
    bridgeBackupBtn.addEventListener('click', async function() {
      var fd = new FormData();
      fd.append('action', 'bridge_migration_create_backup');
      try {
        var res = await fetch('/wp-admin/admin-ajax.php', { method: 'POST', body: fd });
        var data = await res.json();
        if (data.success) {
          alert('백업 생성 완료: ' + data.data.name);
          loadBackupList();
        }
      } catch(err) { alert('오류: ' + err.message); }
    });
    loadBackupList();
  }

  async function loadBackupList() {
    var list = document.getElementById('bridge-backup-list');
    if (!list) return;
    var fd = new FormData(); fd.append('action', 'bridge_migration_get_backup_list');
    var res = await fetch('/wp-admin/admin-ajax.php', { method: 'POST', body: fd });
    var data = await res.json();
    if (data.success && data.data.backups) {
      list.innerHTML = '<table class="wp-list-table widefat striped" style="margin-top:15px"><thead><tr><th>이름</th><th>작업</th></tr></thead><tbody>' +
        data.data.backups.map(function(b) {
          return '<tr><td>' + b.name + '</td><td><button class="button" onclick="restoreBackup(\'' + b.id + '\')">복원</button></td></tr>';
        }).join('') + '</tbody></table>';
    }
  }

  window.restoreBackup = async function(id) {
    if (!confirm('백업을 복원하면 현재 데이터가 덮어씌워집니다. 계속하시겠습니까?')) return;
    var fd = new FormData(); fd.append('action', 'bridge_migration_restore_backup'); fd.append('backup_id', id);
    var res = await fetch('/wp-admin/admin-ajax.php', { method: 'POST', body: fd });
    var data = await res.json();
    alert(data.success ? '복원 완료: ' + data.data.restored + '개 항목' : '복원 실패: ' + JSON.stringify(data.data));
  };

  /* ── WP Rocket settings ───────────────────────────────────── */
  var wprSaveBtn = document.getElementById('wpr-save-btn');
  if (wprSaveBtn) {
    wprSaveBtn.addEventListener('click', async function() {
      var form = document.getElementById('wpr-settings-form');
      var fd = new FormData(form);
      fd.append('action', 'rocket_save_settings');
      var res = await fetch('/wp-admin/admin-ajax.php', { method: 'POST', body: fd });
      var data = await res.json();
      showAdminNotice(data.success ? '✓ WP Rocket 설정이 저장되었습니다.' : '저장 실패', data.success ? 'success' : 'error');
    });
  }

  var wprClearBtn = document.getElementById('wpr-clear-cache-btn');
  if (wprClearBtn) {
    wprClearBtn.addEventListener('click', async function() {
      var fd = new FormData(); fd.append('action', 'rocket_clear_cache');
      var res = await fetch('/wp-admin/admin-ajax.php', { method: 'POST', body: fd });
      var data = await res.json();
      showAdminNotice(data.success ? '✓ ' + data.data : '캐시 삭제 실패', data.success ? 'success' : 'error');
    });
  }

  /* ── WP Rocket tabs ───────────────────────────────────────── */
  document.querySelectorAll('.wpr-tab').forEach(function(tab) {
    tab.addEventListener('click', function(e) {
      e.preventDefault();
      var target = tab.getAttribute('href');
      document.querySelectorAll('.wpr-section').forEach(function(s) { s.style.display = 'none'; });
      document.querySelectorAll('.wpr-tab').forEach(function(t) { t.classList.remove('active'); });
      if (target && target !== '#') {
        var el = document.querySelector(target);
        if (el) el.style.display = '';
      }
      tab.classList.add('active');
    });
  });

  /* ── AIBP Pro meta box ────────────────────────────────────── */
  /* Tab switching */
  document.querySelectorAll('.ai-blog-tab').forEach(function(tab) {
    tab.addEventListener('click', function() {
      var target = tab.dataset.tab;
      document.querySelectorAll('.ai-blog-tab').forEach(function(t) { t.classList.remove('active'); });
      document.querySelectorAll('.ai-blog-tab-content').forEach(function(c) { c.classList.remove('active'); });
      tab.classList.add('active');
      var content = document.querySelector('.ai-blog-tab-content[data-content="' + target + '"]');
      if (content) content.classList.add('active');
    });
  });

  /* Generate blog post */
  var aiBlogGenBtn = document.getElementById('ai-blog-generate-btn');
  if (aiBlogGenBtn) {
    aiBlogGenBtn.addEventListener('click', async function() {
      var topic = document.getElementById('ai-blog-topic').value.trim();
      if (!topic) { alert('주제를 입력하세요.'); return; }
      var type = document.getElementById('ai-blog-type').value;
      var model = document.getElementById('ai-blog-model').value;
      aiBlogGenBtn.textContent = '생성 중...';
      aiBlogGenBtn.disabled = true;

      var fd = new FormData();
      fd.append('action', 'ai_blog_generate');
      fd.append('topic', topic);
      fd.append('type', type);
      fd.append('model', model);

      try {
        var res = await fetch('/wp-admin/admin-ajax.php', { method: 'POST', body: fd });
        var data = await res.json();
        if (data.success && data.data.content) {
          /* Inject into Gutenberg editor if available */
          if (typeof cfwpEditor !== 'undefined') {
            var titleEl = document.getElementById('post-title-input');
            if (titleEl && !titleEl.value) { titleEl.value = data.data.title || topic; autoResizeTitle(titleEl); }
            var editor = document.getElementById('block-editor');
            if (editor) {
              editor.innerHTML = generateInitialBlocks(data.data.content);
              editor.querySelectorAll('[data-block]').forEach(function(el) {
                el.addEventListener('click', function(e) { e.stopPropagation(); selectBlock(el); });
                el.addEventListener('input', markDirty);
                el.addEventListener('keydown', function(e) { handleBlockKeydown(e, el); });
              });
              markDirty();
            }
          }
          showAdminNotice('✓ AI 글 생성 완료!', 'success');
        } else {
          alert('생성 실패: ' + (data.data || 'API 오류'));
        }
      } catch(err) {
        alert('오류: ' + err.message);
      } finally {
        aiBlogGenBtn.textContent = 'AI 글쓰기 시작';
        aiBlogGenBtn.disabled = false;
      }
    });
  }

  /* Generate thumbnail */
  var aiThumbBtn = document.getElementById('ai-generate-thumb-btn');
  if (aiThumbBtn) {
    aiThumbBtn.addEventListener('click', async function() {
      var prompt = document.getElementById('ai-thumb-prompt').value.trim();
      if (!prompt) { alert('프롬프트를 입력하세요.'); return; }
      aiThumbBtn.textContent = '생성 중...';
      aiThumbBtn.disabled = true;
      var fd = new FormData();
      fd.append('action', 'aibp_pollinations_generate');
      fd.append('prompt', prompt);
      try {
        var res = await fetch('/wp-admin/admin-ajax.php', { method: 'POST', body: fd });
        var data = await res.json();
        if (data.success && data.data.image) {
          var preview = document.getElementById('ai-thumb-preview');
          if (preview) preview.innerHTML = '<img src="' + data.data.image + '" style="width:100%;border-radius:3px;margin-top:8px"/>';
        } else {
          alert('생성 실패: ' + JSON.stringify(data.data));
        }
      } catch(err) { alert('오류: ' + err.message); }
      finally { aiThumbBtn.textContent = 'AI 이미지 생성'; aiThumbBtn.disabled = false; }
    });
  }

  /* Save SEO */
  var aiSaveSeoBtn = document.getElementById('ai-save-seo-btn');
  if (aiSaveSeoBtn) {
    aiSaveSeoBtn.addEventListener('click', async function() {
      var postId = document.querySelector('#ai-blog-writer-container')?.dataset.postId;
      if (!postId || postId === '0') {
        alert('먼저 글을 저장하세요.');
        if (typeof savePost === 'function') await savePost();
        postId = typeof cfwpEditor !== 'undefined' ? cfwpEditor.postId : 0;
      }
      var fd = new FormData();
      fd.append('action', 'ai_blog_save_seo_meta');
      fd.append('post_id', postId);
      fd.append('seo_title', document.getElementById('ai-seo-title')?.value || '');
      fd.append('meta_desc', document.getElementById('ai-meta-desc')?.value || '');
      fd.append('focus_keyword', document.getElementById('ai-focus-keyword')?.value || '');
      var res = await fetch('/wp-admin/admin-ajax.php', { method: 'POST', body: fd });
      var data = await res.json();
      showAdminNotice(data.success ? '✓ SEO 메타 저장됨' : '저장 실패', data.success ? 'success' : 'error');
    });
  }

  /* ── User new form ────────────────────────────────────────── */
  var createUserForm = document.getElementById('createuser');
  if (createUserForm) {
    createUserForm.addEventListener('submit', async function(e) {
      e.preventDefault();
      var fd = new FormData(createUserForm);
      var data = Object.fromEntries(fd);
      data.action = 'create-user';
      var res = await fetch('/api/users/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      var result = await res.json();
      if (result.success) {
        showAdminNotice('✓ 사용자가 추가되었습니다.', 'success');
        setTimeout(function() { location.href = '/wp-admin/users.php'; }, 1500);
      } else {
        showAdminNotice('추가 실패: ' + (result.error || JSON.stringify(result)), 'error');
      }
    });
  }

  /* ── Trash actions in post list ───────────────────────────── */
  document.querySelectorAll('a.submitdelete').forEach(function(link) {
    link.addEventListener('click', async function(e) {
      e.preventDefault();
      if (!confirm('정말 휴지통으로 이동하시겠습니까?')) return;
      var href = link.getAttribute('href') || '';
      var match = href.match(/post=(\d+)/);
      if (!match) return;
      var postId = match[1];
      var res = await fetch('/wp-json/wp/v2/posts/' + postId, {
        method: 'DELETE',
        headers: { 'X-WP-Nonce': typeof wpApiSettings !== 'undefined' ? wpApiSettings.nonce : '' }
      });
      if (res.ok) {
        var row = document.getElementById('post-' + postId);
        if (row) row.style.opacity = '0.5';
        showAdminNotice('✓ 휴지통으로 이동했습니다.', 'success');
        setTimeout(function() { location.reload(); }, 1000);
      }
    });
  });

  /* ── Alpack analytics load ────────────────────────────────── */
  if (document.getElementById('alpack-analytics-chart')) {
    (async function() {
      var fd = new FormData(); fd.append('action', 'presslearn_get_analytics');
      var res = await fetch('/wp-admin/admin-ajax.php', { method: 'POST', body: fd });
      var data = await res.json();
      // Render basic stats
      var container = document.getElementById('alpack-analytics-chart');
      if (container) {
        container.innerHTML = '<div style="padding:20px;background:#fff;border:1px solid #ddd;border-radius:4px">' +
          '<h3>방문 통계</h3><p style="color:#888">데이터를 수집 중입니다. 방문자가 생기면 여기에 통계가 표시됩니다.</p></div>';
      }
    })();
  }

  /* ── Quick press form (dashboard) ─────────────────────────── */
  var quickPressForm = document.getElementById('quick-press');
  if (quickPressForm) {
    quickPressForm.addEventListener('submit', async function(e) {
      e.preventDefault();
      var fd = new FormData(quickPressForm);
      var title = fd.get('post_title');
      var content = fd.get('content');
      if (!title) { alert('제목을 입력하세요.'); return; }
      var res = await fetch('/wp-json/wp/v2/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-WP-Nonce': wpApiSettings.nonce },
        body: JSON.stringify({ title: title, content: content, status: 'draft' })
      });
      if (res.ok) {
        var data = await res.json();
        showAdminNotice('✓ 초안이 저장되었습니다. <a href="/wp-admin/post.php?post=' + data.id + '&action=edit">편집하기</a>', 'success');
        quickPressForm.reset();
      } else {
        showAdminNotice('저장 실패', 'error');
      }
    });
  }

  /* ── Screen options toggling ──────────────────────────────── */
  var screenOptionsBtn = document.getElementById('show-settings-link');
  if (screenOptionsBtn) {
    screenOptionsBtn.addEventListener('click', function(e) {
      e.preventDefault();
      var panel = document.getElementById('screen-options-wrap');
      if (panel) panel.classList.toggle('hidden');
    });
  }

  /* ── Profile form ─────────────────────────────────────────── */
  var profileForm = document.getElementById('your-profile');
  if (profileForm) {
    profileForm.addEventListener('submit', async function(e) {
      e.preventDefault();
      var fd = new FormData(profileForm);
      var pass1 = fd.get('pass1'), pass2 = fd.get('pass2');
      if (pass1 && pass1 !== pass2) { alert('비밀번호가 일치하지 않습니다.'); return; }
      var data = {};
      fd.forEach(function(v, k) { if (v) data[k] = v; });
      var action = profileForm.getAttribute('action');
      var res = await fetch(action, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      var result = await res.json();
      showAdminNotice(result.success ? '✓ 프로필이 업데이트되었습니다.' : '업데이트 실패', result.success ? 'success' : 'error');
    });
  }

  /* ── Add tag form ─────────────────────────────────────────── */
  var addTagForm = document.getElementById('addtag');
  if (addTagForm) {
    addTagForm.addEventListener('submit', async function(e) {
      e.preventDefault();
      var fd = new FormData(addTagForm);
      var res = await fetch('/wp-admin/admin-ajax.php', { method: 'POST', body: fd });
      var data = await res.json();
      if (data.success) {
        location.reload();
      } else {
        showAdminNotice('추가 실패: ' + JSON.stringify(data), 'error');
      }
    });
  }

  /* ── Theme install search (auto-load) ─────────────────────── */
  if (document.getElementById('theme-search-input')) {
    searchThemes('');
  }

  /* ── Plugin search (auto-load) ────────────────────────────── */
  if (document.getElementById('plugin-list')) {
    searchPlugins('');
  }

  console.log('[CF-WordPress] Admin JS loaded');

})(window.jQuery || { fn: {} });
`;
