/**
 * AIBP Pro - AI Blog Posting Pro
 * Frontend metabox script for WordPress / CF-WordPress
 */

(function ($) {
  'use strict';

  const AIBP = {
    ajaxUrl: window.ajaxurl || '/wp-admin/admin-ajax.php',

    init: function () {
      this.bindTabs();
      this.bindGenerate();
      this.bindThumbnail();
      this.bindSEO();
      this.bindExpand();
    },

    bindTabs: function () {
      $(document).on('click', '.ai-blog-tab', function () {
        const tab = $(this).data('tab');
        $('.ai-blog-tab').removeClass('active');
        $(this).addClass('active');
        $('.ai-blog-tab-content').removeClass('active');
        $('.ai-blog-tab-content[data-content="' + tab + '"]').addClass('active');
      });
    },

    bindGenerate: function () {
      $(document).on('click', '#ai-blog-generate-btn', async function () {
        const $btn = $(this);
        const topic = $('#ai-blog-topic').val().trim();
        const type = $('#ai-blog-type').val();
        const model = $('#ai-blog-model').val();

        if (!topic) { alert('주제 키워드를 입력하세요.'); return; }

        $btn.text('생성 중...').prop('disabled', true);

        try {
          const fd = new FormData();
          fd.append('action', 'ai_blog_generate');
          fd.append('topic', topic);
          fd.append('type', type);
          fd.append('model', model);
          fd.append('nonce', typeof cfwp !== 'undefined' ? cfwp.nonce || '' : '');

          const res = await fetch(AIBP.ajaxUrl, { method: 'POST', body: fd });
          const data = await res.json();

          if (data.success && data.data.content) {
            AIBP.injectContent(data.data.title || topic, data.data.content);
            AIBP.showNotice('✓ AI 글 생성이 완료되었습니다!', 'success');
          } else {
            AIBP.showNotice('생성 실패: ' + (data.data || 'API 오류'), 'error');
          }
        } catch (e) {
          AIBP.showNotice('오류: ' + e.message, 'error');
        } finally {
          $btn.text('AI 글쓰기 시작').prop('disabled', false);
        }
      });
    },

    injectContent: function (title, content) {
      // CF-WordPress Gutenberg
      if (typeof cfwpEditor !== 'undefined') {
        const titleEl = document.getElementById('post-title-input');
        if (titleEl && !titleEl.value.trim()) {
          titleEl.value = title;
          if (typeof autoResizeTitle === 'function') autoResizeTitle(titleEl);
        }
        const editor = document.getElementById('block-editor');
        if (editor && typeof generateInitialBlocks === 'function') {
          editor.innerHTML = generateInitialBlocks(content);
          editor.querySelectorAll('[data-block]').forEach(el => {
            el.addEventListener('click', (e) => { e.stopPropagation(); if (typeof selectBlock === 'function') selectBlock(el); });
            el.addEventListener('input', () => { if (typeof markDirty === 'function') markDirty(); });
            el.addEventListener('keydown', (e) => { if (typeof handleBlockKeydown === 'function') handleBlockKeydown(e, el); });
          });
          if (typeof markDirty === 'function') markDirty();
        }
        return;
      }
      // Classic WordPress Gutenberg
      if (window.wp && wp.data) {
        try {
          const { dispatch } = wp.data;
          dispatch('core/editor').editPost({ title });
          dispatch('core/blocks').resetBlocks(wp.blocks.parse(content));
        } catch (e) {
          console.warn('Gutenberg injection failed:', e);
        }
      }
    },

    bindThumbnail: function () {
      $(document).on('click', '#ai-generate-thumb-btn', async function () {
        const $btn = $(this);
        const prompt = $('#ai-thumb-prompt').val().trim();
        if (!prompt) { alert('이미지 프롬프트를 입력하세요.'); return; }

        $btn.text('생성 중...').prop('disabled', true);
        $('#ai-thumb-preview').html('<p style="text-align:center;color:#888">이미지 생성 중...</p>');

        try {
          const fd = new FormData();
          fd.append('action', 'aibp_pollinations_generate');
          fd.append('prompt', prompt);

          const res = await fetch(AIBP.ajaxUrl, { method: 'POST', body: fd });
          const data = await res.json();

          if (data.success && data.data.image) {
            const img = $('<img/>').attr('src', data.data.image).css({ width: '100%', borderRadius: '4px', marginTop: '8px' });
            const useBtn = $('<button type="button" class="button" style="margin-top:8px;width:100%">대표 이미지로 설정</button>');
            useBtn.on('click', function () {
              AIBP.setFeaturedImage(data.data.image, prompt);
            });
            $('#ai-thumb-preview').html('').append(img).append(useBtn);
            AIBP.showNotice('✓ AI 이미지 생성 완료!', 'success');
          } else {
            $('#ai-thumb-preview').html('<p style="color:red">생성 실패</p>');
          }
        } catch (e) {
          $('#ai-thumb-preview').html('<p style="color:red">오류: ' + e.message + '</p>');
        } finally {
          $btn.text('AI 이미지 생성').prop('disabled', false);
        }
      });
    },

    setFeaturedImage: async function (imageDataUrl, altText) {
      // Convert base64 to blob and upload
      const blob = await fetch(imageDataUrl).then(r => r.blob());
      const file = new File([blob], 'ai-thumbnail-' + Date.now() + '.png', { type: 'image/png' });

      const fd = new FormData();
      fd.append('action', 'upload-attachment');
      fd.append('async-upload', file);
      fd.append('name', file.name);

      const res = await fetch(AIBP.ajaxUrl, { method: 'POST', body: fd });
      const data = await res.json();

      if (data.success && data.data.id) {
        // Set featured image via wp.media or REST API
        if (window.wp && wp.data) {
          try {
            wp.data.dispatch('core/editor').editPost({ featured_media: data.data.id });
            AIBP.showNotice('✓ 대표 이미지가 설정되었습니다!', 'success');
          } catch (e) {}
        }

        const container = document.getElementById('featured-image-container');
        if (container) {
          container.innerHTML = '<img src="' + data.data.url + '" style="width:100%;border-radius:3px;margin-bottom:8px"/>' +
            '<button class="components-button" style="width:100%;color:#b32d2e;font-size:.8rem">대표 이미지 제거</button>';
        }
      }
    },

    bindSEO: function () {
      $(document).on('click', '#ai-save-seo-btn', async function () {
        const $btn = $(this);
        let postId = 0;

        if (typeof cfwpEditor !== 'undefined') postId = cfwpEditor.postId;
        else if (typeof pagenow !== 'undefined' && $('#post_ID').val()) postId = parseInt($('#post_ID').val());

        if (!postId) {
          if (typeof savePost === 'function') await savePost();
          postId = typeof cfwpEditor !== 'undefined' ? cfwpEditor.postId : 0;
        }

        if (!postId) { alert('먼저 글을 저장하세요.'); return; }

        $btn.text('저장 중...').prop('disabled', true);

        const fd = new FormData();
        fd.append('action', 'ai_blog_save_seo_meta');
        fd.append('post_id', postId);
        fd.append('seo_title', $('#ai-seo-title').val() || '');
        fd.append('meta_desc', $('#ai-meta-desc').val() || '');
        fd.append('slug', $('#ai-slug').val() || '');
        fd.append('focus_keyword', $('#ai-focus-keyword').val() || '');

        const res = await fetch(AIBP.ajaxUrl, { method: 'POST', body: fd });
        const data = await res.json();

        AIBP.showNotice(data.success ? '✓ SEO 메타가 저장되었습니다.' : '저장 실패', data.success ? 'success' : 'error');
        $btn.text('SEO 저장').prop('disabled', false);
      });
    },

    bindExpand: function () {
      $(document).on('click', '#ai-expand-btn', async function () {
        const $btn = $(this);
        const postId = typeof cfwpEditor !== 'undefined' ? cfwpEditor.postId : 0;
        if (!postId) { alert('먼저 글을 저장하세요.'); return; }

        $btn.text('확장 중...').prop('disabled', true);
        const fd = new FormData();
        fd.append('action', 'ai_blog_expand_content');
        fd.append('post_id', postId);

        const res = await fetch(AIBP.ajaxUrl, { method: 'POST', body: fd });
        const data = await res.json();

        if (data.success && data.data.content) {
          AIBP.injectContent('', data.data.content);
          AIBP.showNotice('✓ 콘텐츠가 확장되었습니다!', 'success');
        }

        $btn.text('콘텐츠 확장').prop('disabled', false);
      });
    },

    showNotice: function (message, type) {
      if (typeof showAdminNotice === 'function') {
        showAdminNotice(message, type);
      } else {
        const colors = { success: '#46b450', error: '#dc3232', info: '#0073aa' };
        const notice = $('<div style="padding:8px 12px;border-radius:3px;margin:8px 0;font-size:13px;color:#fff;background:' + (colors[type] || '#333') + '">' + message + '</div>');
        $('#ai-blog-writer-container').prepend(notice);
        setTimeout(() => notice.fadeOut(() => notice.remove()), 4000);
      }
    }
  };

  $(document).ready(function () { AIBP.init(); });

})(window.jQuery || { fn: {}, ready: function(cb) { document.addEventListener('DOMContentLoaded', cb); }, on: function() {}, off: function() {} });
