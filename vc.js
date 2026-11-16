/* =========================================================
   JustGo — vc.js  (CloudPiko-killer build)
   1) Kill network requests to CloudPiko / ad domains
   2) Neutralize setInterval / setTimeout / XHR used by the ad loader
   3) Hide any ad containers that slip through
   4) Vice City announcement toast
   ========================================================= */

/* ---------- 1. NETWORK-LEVEL AD BLOCK ---------- */
(function adBlockNetwork() {
  'use strict';

  /* Which URLs count as ads. Everything here gets its response blanked. */
  const AD_PATTERN = /(cloudpiko\.com|doubleclick\.net|googlesyndication\.com|googleadservices\.com|adservice\.google|adsystem\.com|facebook\.net\/.*\/audience|scorecardresearch\.com|criteo\.|taboola\.|outbrain\.|pubmatic\.|rubiconproject\.|openx\.net|smartadserver\.|casalemedia\.|adnxs\.com|yieldmo\.com|moatads\.|2mdn\.net|serving-sys\.com)/i;

  const isAd = (url) => AD_PATTERN.test(String(url || ''));

  /* --- XHR hook --- */
  const OrigXHR = window.XMLHttpRequest;
  const origOpen = OrigXHR.prototype.open;
  const origSend = OrigXHR.prototype.send;

  OrigXHR.prototype.open = function (method, url, ...rest) {
    this.__jgAdBlocked = isAd(url);
    return origOpen.call(this, method, url, ...rest);
  };
  OrigXHR.prototype.send = function (...args) {
    if (this.__jgAdBlocked) {
      // Silently abort — the ad script sees an empty response and gives up
      Object.defineProperty(this, 'readyState', { value: 4, configurable: true });
      Object.defineProperty(this, 'status',     { value: 204, configurable: true });
      Object.defineProperty(this, 'response',   { value: '', configurable: true });
      Object.defineProperty(this, 'responseText', { value: '', configurable: true });
      try { this.dispatchEvent(new Event('load')); this.dispatchEvent(new Event('loadend')); } catch (e) {}
      return;
    }
    return origSend.apply(this, args);
  };

  /* --- fetch hook --- */
  const origFetch = window.fetch;
  if (origFetch) {
    window.fetch = function (input, init) {
      const url = (typeof input === 'string') ? input : (input && input.url) || '';
      if (isAd(url)) {
        return Promise.resolve(new Response('', {
          status: 204,
          statusText: 'No Content',
          headers: { 'content-type': 'text/plain' }
        }));
      }
      return origFetch.call(this, input, init);
    };
  }

  /* --- Image / script / iframe src hook (covers dynamically-set src) --- */
  function blockNodeUrl(node) {
    if (!node || node.nodeType !== 1) return;
    const attr = node.getAttribute && (node.getAttribute('src') || node.getAttribute('data-src'));
    if (attr && isAd(attr)) {
      node.removeAttribute('src');
      node.removeAttribute('data-src');
      node.style.display = 'none';
    }
  }

  const mo = new MutationObserver(muts => {
    for (const m of muts) {
      if (m.type === 'attributes' && (m.attributeName === 'src' || m.attributeName === 'data-src')) {
        blockNodeUrl(m.target);
      } else if (m.type === 'childList') {
        m.addedNodes.forEach(n => {
          if (n.nodeType === 1) {
            blockNodeUrl(n);
            n.querySelectorAll && n.querySelectorAll('img,script,iframe').forEach(blockNodeUrl);
          }
        });
      }
    }
  });
  mo.observe(document.documentElement, {
    childList: true, subtree: true,
    attributes: true, attributeFilter: ['src', 'data-src']
  });

  console.log('[JustGo] adBlockNetwork armed');
})();


/* ---------- 2. NEUTRALIZE CLOUDPIKO TIMERS ---------- */
(function adBlockTimers() {
  'use strict';

  /* CloudPiko uses setInterval to re-inject. We hijack setInterval so that
     if the callback string contains "initSocialBar" / "loadWatch" / "loadCreative"
     / the hashed ad-id, we refuse to schedule it. */
  const AD_CB_PATTERN = /(initSocialBar|loadWatch|loadCreative|mountScripts|cloudpiko|7ed7435a30a8b56bbb77618df8f71f74)/i;

  const origSetInterval = window.setInterval;
  window.setInterval = function (fn, ms, ...args) {
    const src = typeof fn === 'function' ? fn.toString() : String(fn);
    if (AD_CB_PATTERN.test(src)) {
      console.warn('[JustGo] blocked ad setInterval:', src.slice(0, 80));
      return 0;
    }
    return origSetInterval.call(window, fn, ms, ...args);
  };

  const origSetTimeout = window.setTimeout;
  window.setTimeout = function (fn, ms, ...args) {
    const src = typeof fn === 'function' ? fn.toString() : String(fn);
    if (AD_CB_PATTERN.test(src)) {
      console.warn('[JustGo] blocked ad setTimeout:', src.slice(0, 80));
      return 0;
    }
    return origSetTimeout.call(window, fn, ms, ...args);
  };

  console.log('[JustGo] adBlockTimers armed');
})();


/* ---------- 3. DOM + CSS CLEANUP ---------- */
(function adBlockDom() {
  'use strict';

  const css = `
    [class^="pl-"][class*="__player_content"],
    [class^="pl-"][class*="__loading"],
    [class^="pl-"][class*="__play"],
    [id^="pl-"],
    [class*="cloudpiko"],
    img[src*="cloudpiko.com"],
    iframe[src*="cloudpiko.com"],
    ins.adsbygoogle,
    div[data-ad], div[data-ads] {
      display: none !important;
      visibility: hidden !important;
      opacity: 0 !important;
      pointer-events: none !important;
      height: 0 !important;
      max-height: 0 !important;
      overflow: hidden !important;
    }
  `;
  const style = document.createElement('style');
  style.id = 'jg-adblock-style';
  style.textContent = css;
  document.head.appendChild(style);

  function sweep(root) {
    if (!root || root.nodeType !== 1) return;
    const targets = root.querySelectorAll
      ? root.querySelectorAll('[class^="pl-"], [class*="cloudpiko"], img[src*="cloudpiko.com"]')
      : [];
    targets.forEach(el => {
      const cls = el.className || '';
      if (typeof cls === 'string' && /^pl-[a-f0-9]+__|cloudpiko/.test(cls)) {
        el.remove();
      }
    });
  }
  sweep(document);
  new MutationObserver(muts => {
    muts.forEach(m => m.addedNodes.forEach(n => n.nodeType === 1 && sweep(n)));
  }).observe(document.documentElement, { childList: true, subtree: true });

  console.log('[JustGo] adBlockDom armed');
})();


/* ---------- 4. VICE CITY TOAST ---------- */
(function viceCityToast() {
  'use strict';

  const STORAGE_KEY = 'jg_vc_snooze_until';
  const GAME_URL    = '/vicecity';
  const SNOOZE_MS   = 7 * 24 * 60 * 60 * 1000;
  const SHOW_DELAY  = 2000;

  const ICONS = {
    close: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
    clock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/></svg>`,
    coin:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9 9.5h4.5a2 2 0 0 1 0 4H10.5"/><path d="M12 7.5v9"/></svg>`,
    play:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="6 3 20 12 6 21 6 3"/></svg>`
  };

  const CSS = `
    #jgvc-toast {
      position: fixed; bottom: 24px; left: 50%;
      transform: translateX(-50%) translateY(20px);
      z-index: 9999;
      width: calc(100% - 32px); max-width: 380px;
      background: var(--bg-surface, #fff);
      border: 1px solid var(--border, #e5e7eb);
      border-radius: 16px;
      box-shadow: 0 24px 60px rgba(0,0,0,0.25);
      overflow: hidden;
      opacity: 0; pointer-events: none;
      transition: opacity .3s ease, transform .4s cubic-bezier(.22,1,.36,1);
    }
    #jgvc-toast.jgvc-open { opacity: 1; pointer-events: auto; transform: translateX(-50%) translateY(0); }
    .jgvc-close {
      position: absolute; top: 10px; right: 10px; z-index: 10;
      width: 28px; height: 28px;
      display: flex; align-items: center; justify-content: center;
      background: rgba(0,0,0,.35); color: #fff;
      border: 0; border-radius: 50%; cursor: pointer;
      backdrop-filter: blur(4px);
    }
    .jgvc-close:hover { background: rgba(0,0,0,.6); }
    .jgvc-close svg { width: 14px; height: 14px; }
    .jgvc-hero { position: relative; width: 100%; aspect-ratio: 21/9; background: #000; }
    .jgvc-hero img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .jgvc-hero::after {
      content: ""; position: absolute; inset: 0;
      background: linear-gradient(180deg, transparent 30%, rgba(0,0,0,.85) 100%);
      pointer-events: none;
    }
    .jgvc-hero-text { position: absolute; bottom: 12px; left: 16px; right: 16px; z-index: 2; }
    .jgvc-hero-text h2 {
      margin: 0; font-size: 20px; font-weight: 800;
      color: #fff; letter-spacing: -.5px; line-height: 1.1;
      text-shadow: 0 2px 8px rgba(0,0,0,.6);
    }
    .jgvc-body { padding: 14px 16px 16px; }
    .jgvc-pricing { display: flex; gap: 16px; margin-bottom: 14px; }
    .jgvc-plan { display: flex; flex-direction: column; gap: 2px; }
    .jgvc-plan-head {
      display: flex; align-items: center; gap: 4px;
      font-size: 10px; font-weight: 800; text-transform: uppercase;
      color: var(--text-muted, #6b7280); letter-spacing: .3px;
    }
    .jgvc-plan-head svg { width: 12px; height: 12px; }
    .jgvc-plan-price { font-size: 15px; font-weight: 800; color: var(--text, #111827); letter-spacing: -.3px; }
    .jgvc-plan-price small { font-size: 11px; font-weight: 600; color: var(--text-muted, #6b7280); letter-spacing: 0; }
    .jgvc-actions { display: flex; gap: 8px; align-items: center; }
    .jgvc-btn {
      display: flex; align-items: center; justify-content: center; gap: 6px;
      border-radius: 10px; font-family: inherit; border: 0; cursor: pointer;
      text-decoration: none; transition: transform .1s, background .2s;
    }
    .jgvc-btn:active { transform: scale(.98); }
    .jgvc-btn.primary {
      flex: 1; padding: 10px 14px;
      background: var(--primary, #1652c4); color: var(--primary-contrast, #fff);
      font-size: 13.5px; font-weight: 800;
      box-shadow: 0 4px 12px rgba(22,82,196,.25);
    }
    .jgvc-btn.primary svg { width: 14px; height: 14px; }
    .jgvc-btn.dismiss {
      padding: 10px 12px; background: transparent; color: var(--text-muted, #6b7280);
      font-size: 12px; font-weight: 700;
      border: 1.5px solid var(--border, #e5e7eb); white-space: nowrap;
    }
    @media (max-width: 400px) {
      .jgvc-actions { flex-direction: column; align-items: stretch; }
      .jgvc-btn.dismiss { order: 2; border: 0; padding: 6px; font-size: 11.5px; }
    }
  `;

  let toast = null, isOpen = false;

  function injectCss() {
    if (document.getElementById('jgvc-style')) return;
    const s = document.createElement('style');
    s.id = 'jgvc-style';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function build() {
    const el = document.createElement('div');
    el.id = 'jgvc-toast';
    el.innerHTML = `
      <div class="jgvc-hero">
        <button class="jgvc-close" type="button" aria-label="Close">${ICONS.close}</button>
        <img src="vc.jpg" alt="Vice City" loading="eager">
        <div class="jgvc-hero-text"><h2>Vice City is live</h2></div>
      </div>
      <div class="jgvc-body">
        <div class="jgvc-pricing">
          <div class="jgvc-plan">
            <div class="jgvc-plan-head" style="color:#16a34a;">${ICONS.clock} Free Daily</div>
            <div class="jgvc-plan-price">3 hrs<small>/day</small></div>
          </div>
          <div class="jgvc-plan">
            <div class="jgvc-plan-head" style="color:#f59e0b;">${ICONS.coin} After Free</div>
            <div class="jgvc-plan-price">₹1<small>/hour</small></div>
          </div>
        </div>
        <div class="jgvc-actions">
          <a href="${GAME_URL}" class="jgvc-btn primary">${ICONS.play} Play Now</a>
          <button type="button" class="jgvc-btn dismiss" data-snooze>Don't show again (7 days)</button>
        </div>
      </div>
    `;
    el.querySelector('.jgvc-close').addEventListener('click', hide);
    el.querySelector('[data-snooze]').addEventListener('click', () => {
      try { localStorage.setItem(STORAGE_KEY, String(Date.now() + SNOOZE_MS)); } catch (e) {}
      hide();
    });
    return el;
  }

  function show() {
    if (isOpen) return;
    injectCss();
    toast = build();
    document.body.appendChild(toast);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      toast.classList.add('jgvc-open');
      isOpen = true;
    }));
  }

  function hide() {
    if (!toast || !isOpen) return;
    isOpen = false;
    toast.classList.remove('jgvc-open');
    setTimeout(() => { if (toast && toast.parentNode) toast.parentNode.removeChild(toast); toast = null; }, 400);
  }

  function isSnoozed() {
    try { return parseInt(localStorage.getItem(STORAGE_KEY) || '0', 10) > Date.now(); }
    catch (e) { return false; }
  }

  function boot() { if (!isSnoozed()) setTimeout(show, SHOW_DELAY); }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();