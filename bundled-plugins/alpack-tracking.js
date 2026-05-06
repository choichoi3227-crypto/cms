/**
 * AL Pack (PressLearn) - Analytics & Social Tracking Script
 * Frontend tracking for CF-WordPress
 */

(function () {
  'use strict';

  const ALPACK = {
    ajaxUrl: (window.cfwp && cfwp.ajaxurl) || '/wp-admin/admin-ajax.php',
    siteUrl: (window.cfwp && cfwp.siteUrl) || window.location.origin,
    postId: 0,
    sessionId: '',
    scrollDepths: [25, 50, 75, 90, 100],
    trackedScrollDepths: new Set(),
    startTime: Date.now(),

    init: function () {
      // Get post ID from body class
      const bodyClasses = document.body.className;
      const postMatch = bodyClasses.match(/postid-(\d+)/);
      if (postMatch) this.postId = parseInt(postMatch[1]);

      // Generate session ID
      this.sessionId = sessionStorage.getItem('alpack_sid') || this.generateId();
      sessionStorage.setItem('alpack_sid', this.sessionId);

      // Track pageview
      this.trackPageview();

      // Track scroll depth
      this.initScrollTracking();

      // Track time on page
      this.initTimeTracking();

      // Track clicks
      this.initClickTracking();

      // Social share buttons
      this.initSocialShare();

      // Click protection (invalid clicks)
      this.initClickProtection();
    },

    generateId: function () {
      return Math.random().toString(36).substring(2) + Date.now().toString(36);
    },

    trackPageview: function () {
      const fd = new FormData();
      fd.append('action', 'presslearn_track_pageview');
      fd.append('post_id', this.postId);
      fd.append('referrer', document.referrer);
      fd.append('session_id', this.sessionId);
      fd.append('page', window.location.pathname);

      // Use sendBeacon for reliability
      if (navigator.sendBeacon) {
        const data = new URLSearchParams();
        data.append('action', 'presslearn_track_pageview');
        data.append('post_id', this.postId);
        data.append('session_id', this.sessionId);
        navigator.sendBeacon(this.ajaxUrl, data);
      } else {
        fetch(this.ajaxUrl, { method: 'POST', body: fd, keepalive: true }).catch(() => {});
      }
    },

    initScrollTracking: function () {
      let ticking = false;

      const checkScroll = () => {
        const scrollTop = window.scrollY;
        const docHeight = document.documentElement.scrollHeight - window.innerHeight;
        if (docHeight <= 0) return;

        const pct = Math.round((scrollTop / docHeight) * 100);

        this.scrollDepths.forEach(depth => {
          if (pct >= depth && !this.trackedScrollDepths.has(depth)) {
            this.trackedScrollDepths.add(depth);
            this.sendEvent('scroll_depth', { depth, post_id: this.postId });
          }
        });
      };

      window.addEventListener('scroll', () => {
        if (!ticking) {
          requestAnimationFrame(() => { checkScroll(); ticking = false; });
          ticking = true;
        }
      }, { passive: true });
    },

    initTimeTracking: function () {
      // Track time on page when leaving
      window.addEventListener('beforeunload', () => {
        const timeSpent = Math.round((Date.now() - this.startTime) / 1000);
        if (timeSpent < 3) return; // Ignore bounces < 3s

        const data = new URLSearchParams();
        data.append('action', 'presslearn_track_pageview');
        data.append('event', 'time_on_page');
        data.append('time_spent', timeSpent);
        data.append('post_id', this.postId);
        data.append('session_id', this.sessionId);

        if (navigator.sendBeacon) {
          navigator.sendBeacon(this.ajaxUrl, data);
        }
      });
    },

    initClickTracking: function () {
      document.addEventListener('click', (e) => {
        const link = e.target.closest('a');
        if (!link) return;

        const href = link.href || '';
        const isExternal = href && !href.startsWith(this.siteUrl) && href.startsWith('http');
        const isDownload = link.hasAttribute('download') || /\.(pdf|doc|docx|xls|xlsx|zip|mp4|mp3)$/i.test(href);

        if (isExternal) {
          this.sendEvent('external_link', { url: href, post_id: this.postId });
        }
        if (isDownload) {
          this.sendEvent('download', { url: href, post_id: this.postId });
        }
      });
    },

    sendEvent: function (event, data) {
      const fd = new FormData();
      fd.append('action', 'presslearn_track_pageview');
      fd.append('event', event);
      Object.entries(data).forEach(([k, v]) => fd.append(k, v));
      fetch(this.ajaxUrl, { method: 'POST', body: fd, keepalive: true }).catch(() => {});
    },

    initSocialShare: function () {
      // Create social share buttons if enabled
      const shareData = {
        url: encodeURIComponent(window.location.href),
        title: encodeURIComponent(document.title),
      };

      const shareLinks = {
        kakao: `https://sharer.kakao.com/talk/friends/picker/link?app_key=YOUR_KAKAO_KEY&url=${shareData.url}`,
        naver: `https://share.naver.com/web/shareView?url=${shareData.url}&title=${shareData.title}`,
        facebook: `https://www.facebook.com/sharer/sharer.php?u=${shareData.url}`,
        twitter: `https://twitter.com/intent/tweet?url=${shareData.url}&text=${shareData.title}`,
        line: `https://social-plugins.line.me/lineit/share?url=${shareData.url}`,
      };

      // Find or create share container
      let shareContainer = document.querySelector('.alpack-social-share');
      if (!shareContainer && this.postId) {
        const entry = document.querySelector('.entry-content, .post-content, article .content');
        if (entry) {
          shareContainer = document.createElement('div');
          shareContainer.className = 'alpack-social-share';
          shareContainer.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin:20px 0;padding:15px 0;border-top:1px solid #eee;border-bottom:1px solid #eee';

          const buttons = [
            { id: 'naver', icon: 'N', label: '네이버', color: '#03c75a' },
            { id: 'kakao', icon: 'K', label: '카카오', color: '#fee500' },
            { id: 'facebook', icon: 'f', label: '페이스북', color: '#1877f2' },
            { id: 'twitter', icon: '𝕏', label: 'X (트위터)', color: '#000' },
            { id: 'line', icon: 'L', label: '라인', color: '#00b900' },
          ];

          shareContainer.innerHTML = buttons.map(b =>
            `<a href="${shareLinks[b.id]}" target="_blank" rel="noopener"
              style="display:inline-flex;align-items:center;gap:5px;padding:7px 14px;border-radius:4px;background:${b.color};color:${b.id === 'kakao' ? '#3c1e1e' : '#fff'};text-decoration:none;font-size:13px;font-weight:600"
              onclick="alpackTrackShare('${b.id}')">
              <span style="font-size:15px">${b.icon}</span> ${b.label}
            </a>`
          ).join('');

          entry.insertAdjacentElement('afterend', shareContainer);

          window.alpackTrackShare = (platform) => {
            this.sendEvent('social_share', { platform, post_id: this.postId });
          };
        }
      }
    },

    initClickProtection: function () {
      // Detect and block rapid/suspicious clicks on ad areas
      const adSelectors = [
        'ins.adsbygoogle',
        '[data-ad-client]',
        '.ad-container',
        '#ad-wrapper',
        '.adsense',
      ];

      let clickCounts = {};
      let suspiciousIps = new Set();

      document.addEventListener('click', (e) => {
        const isAdArea = adSelectors.some(sel => e.target.closest(sel));
        if (!isAdArea) return;

        const now = Date.now();
        const key = `${Math.floor(now / 5000)}`; // 5-second windows
        clickCounts[key] = (clickCounts[key] || 0) + 1;

        // More than 3 clicks on ads in 5 seconds = suspicious
        if (clickCounts[key] > 3) {
          e.preventDefault();
          e.stopPropagation();
          this.sendEvent('invalid_click_blocked', { post_id: this.postId });
          console.warn('[AL Pack] Suspicious click pattern detected and blocked');
        }

        // Clean old keys
        Object.keys(clickCounts).forEach(k => {
          if (parseInt(k) < Math.floor(now / 5000) - 5) delete clickCounts[k];
        });
      }, true);
    }
  };

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => ALPACK.init());
  } else {
    ALPACK.init();
  }

  // Expose for external use
  window.ALPACK = ALPACK;
})();
