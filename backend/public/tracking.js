/**
 * Fireside Visitor Tracking Pixel
 *
 * Installation: Add this script to your website:
 * <script src="https://your-api-domain.com/tracking.js" data-site="fireside"></script>
 */
(function() {
  'use strict';

  // Configuration - Use ngrok URL for production
  const API_ENDPOINT = window.FIRESIDE_API || 'https://unsuperseded-melani-nondemonstrably.ngrok-free.dev/api/visitors';
  const COOKIE_NAME = 'fireside_vid';
  const COOKIE_DAYS = 365;

  // Generate unique visitor ID
  function generateVisitorId() {
    return 'v_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
  }

  // Cookie helpers
  function setCookie(name, value, days) {
    const expires = new Date(Date.now() + days * 864e5).toUTCString();
    document.cookie = name + '=' + encodeURIComponent(value) + '; expires=' + expires + '; path=/; SameSite=Lax';
  }

  function getCookie(name) {
    const value = document.cookie.match('(^|;)\\s*' + name + '\\s*=\\s*([^;]+)');
    return value ? decodeURIComponent(value.pop()) : null;
  }

  // Get or create visitor ID
  function getVisitorId() {
    let vid = getCookie(COOKIE_NAME);
    if (!vid) {
      vid = generateVisitorId();
      setCookie(COOKIE_NAME, vid, COOKIE_DAYS);
    }
    return vid;
  }

  // Get URL parameters
  function getUrlParam(param) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(param);
  }

  // Get referrer
  function getReferrer() {
    const ref = document.referrer;
    if (!ref) return 'direct';
    try {
      const url = new URL(ref);
      if (url.hostname === window.location.hostname) return 'internal';
      return ref;
    } catch (e) {
      return ref;
    }
  }

  // Track page view
  function trackPageView(duration) {
    const data = {
      visitorId: getVisitorId(),
      page: window.location.pathname,
      title: document.title,
      referrer: getReferrer(),
      screenResolution: window.screen.width + 'x' + window.screen.height,
      utmSource: getUrlParam('utm_source'),
      utmMedium: getUrlParam('utm_medium'),
      utmCampaign: getUrlParam('utm_campaign'),
      duration: duration || 0
    };

    // Use sendBeacon for reliability (doesn't block page unload)
    if (navigator.sendBeacon) {
      navigator.sendBeacon(API_ENDPOINT + '/track', JSON.stringify(data));
    } else {
      fetch(API_ENDPOINT + '/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        keepalive: true
      }).catch(function() {});
    }
  }

  // Track form submission
  function trackForm(formData) {
    const data = {
      visitorId: getVisitorId(),
      name: formData.name || '',
      email: formData.email || '',
      phone: formData.phone || ''
    };

    fetch(API_ENDPOINT + '/form', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }).catch(function() {});
  }

  // Auto-capture form submissions
  function setupFormTracking() {
    document.addEventListener('submit', function(e) {
      const form = e.target;
      if (!form || form.tagName !== 'FORM') return;

      const formData = new FormData(form);
      const data = {};

      // Look for common field names
      const emailFields = ['email', 'e-mail', 'mail', 'user_email', 'contact_email'];
      const nameFields = ['name', 'full_name', 'fullname', 'your_name', 'contact_name', 'first_name'];
      const phoneFields = ['phone', 'telephone', 'tel', 'mobile', 'cell', 'phone_number'];

      for (const [key, value] of formData.entries()) {
        const lowerKey = key.toLowerCase();
        if (emailFields.some(f => lowerKey.includes(f))) data.email = value;
        if (nameFields.some(f => lowerKey.includes(f))) data.name = value;
        if (phoneFields.some(f => lowerKey.includes(f))) data.phone = value;
      }

      if (data.email || data.phone) {
        trackForm(data);
      }
    });
  }

  // Track time on page
  let pageStartTime = Date.now();

  function getTimeOnPage() {
    return Math.round((Date.now() - pageStartTime) / 1000);
  }

  // Initialize
  function init() {
    // Track initial page view
    trackPageView();

    // Setup form tracking
    setupFormTracking();

    // Track time on page when leaving
    window.addEventListener('beforeunload', function() {
      trackPageView(getTimeOnPage());
    });

    // Track visibility changes (tab switches)
    document.addEventListener('visibilitychange', function() {
      if (document.visibilityState === 'hidden') {
        trackPageView(getTimeOnPage());
      } else {
        pageStartTime = Date.now();
      }
    });

    // Expose API for manual tracking
    window.FiresideTracker = {
      track: trackPageView,
      trackForm: trackForm,
      getVisitorId: getVisitorId
    };
  }

  // Wait for DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
