/*! BDStudyMaterial portal v1.0
 * Wiki.js-style knowledge portal drawn over the (untouched) JustGo app.
 * Install: put this file next to index.html and add ONE line inside <head>:
 *   <script src="wiki.js?v=1"></script>
 * Everything lives in a Shadow DOM, so JustGo's CSS/JS and this portal cannot affect each other.
 * Nothing about hidden/visible state is stored anywhere: a refresh always shows the portal.
 */
(function () {
'use strict';
if (window.__bds) return; window.__bds = 1;

var C = { api: 'https://theogo.miraheze.org/w/api.php', origin: 'https://theogo.miraheze.org', ttl: 6e5, page: 12, returnBtn: true, reshowMs: 3e5 };
var CATS = [
 ['theology','cross','Theology','Doctrine, God and the study of faith.',['theology','doctrine','God','revelation']],
 ['biblical','book','Biblical Studies','Interpretation, canon and background of Scripture.',['bible','hermeneutics','canon','exegesis']],
 ['ot','scroll','Old Testament','Law, history, wisdom and the prophets.',['Old Testament','Pentateuch','prophets','Psalms']],
 ['nt','star','New Testament','Gospels, Acts and the apostolic letters.',['New Testament','gospel','Paul','epistle']],
 ['ct','church','Christian Theology','Trinity, Christology, salvation and the church.',['Trinity','Christology','salvation','church']],
 ['ch','landmark','Church History','From the early church to the modern era.',['church history','Reformation','early church','council']],
 ['eth','scales','Christian Ethics','Moral theology and Christian life.',['Christian ethics','morality','sin','virtue']],
 ['lang','bubbles','Biblical Languages','Hebrew, Greek and Aramaic.',['Hebrew','Greek','Aramaic','grammar','vocabulary']],
 ['asg','note','Assignments','Essays, exam notes and coursework.',['assignment','essay','exam','question']],
 ['res','library','Study Resources','Syllabi, notes and reading lists.',['syllabus','notes','study','book']]
].map(function (a) { return { id: a[0], i: a[1], n: a[2], d: a[3], q: a[4] }; });

var R, host, ret, tm, cur = null, stack = [], tok = 0, mem = {}, vis = true, ino = [], _si = null;
var $ = function (s) { return R.querySelector(s); };
var h = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
var rj = function (o) { return h(JSON.stringify(o)); };
function ls(k, v) { try { if (v === undefined) return JSON.parse(localStorage.getItem(k)); localStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; } }
function fd(t) { try { return new Date(t).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }); } catch (e) { return ''; } }

/* ---------- Colourful SVG icons (sprite; no emojis) ---------- */
function G(id, a, b) { return '<linearGradient id="' + id + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + a + '"/><stop offset="1" stop-color="' + b + '"/></linearGradient>'; }
function S(id, body) { return '<symbol id="i-' + id + '" viewBox="0 0 24 24">' + body + '</symbol>'; }
var BOOK = '<path d="M2 5.5C5 4 8.5 4 12 6v14c-3.5-2-7-2-10-.5z" fill="url(#gB)"/><path d="M22 5.5C19 4 15.5 4 12 6v14c3.5-2 7-2 10-.5z" fill="#dbeafe" stroke="#3b82f6" stroke-width=".8"/><path d="M15.5 4.4v6.6l2-1.5 2 1.5V4.8z" fill="url(#gO)"/>';
var SPR = '<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>' + G('gB', '#60a5fa', '#1e40af') + G('gG', '#fde047', '#f59e0b') + G('gP', '#c084fc', '#6d28d9') + G('gR', '#fb7185', '#be123c') + G('gT', '#5eead4', '#0f766e') + G('gO', '#fdba74', '#ea580c') + '</defs>' +
 S('home', '<path d="M3 11.5 12 3l9 8.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" fill="url(#gB)"/><path d="M1.8 11.8 12 2.4l10.2 9.4" fill="none" stroke="url(#gO)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M9.5 21v-5.5a2.5 2.5 0 0 1 5 0V21z" fill="#fde047"/>') +
 S('cross', '<circle cx="12" cy="12" r="10.5" fill="#fde68a" opacity=".6"/><rect x="9.6" y="2.5" width="4.8" height="19" rx="1.6" fill="url(#gP)"/><rect x="4.5" y="7.5" width="15" height="4.8" rx="1.6" fill="url(#gP)"/>') +
 S('book', BOOK) + S('logo', '<rect width="24" height="24" rx="6" fill="#fff"/><g transform="translate(3.6 3.8) scale(.7)">' + BOOK + '</g>') +
 S('scroll', '<rect x="5" y="4" width="14" height="16" rx="1.5" fill="#fde7b0"/><rect x="3" y="2.2" width="18" height="4.2" rx="2.1" fill="url(#gO)"/><rect x="3" y="17.6" width="18" height="4.2" rx="2.1" fill="url(#gO)"/><path d="M8 10h8M8 13h8" stroke="#b45309" stroke-width="1.4" stroke-linecap="round"/>') +
 S('star', '<path d="m12 2 2.9 6.3 6.9.8-5.1 4.7 1.4 6.8-6.1-3.4-6.1 3.4 1.4-6.8-5.1-4.7 6.9-.8z" fill="url(#gG)" stroke="#d97706" stroke-width="1" stroke-linejoin="round"/>') +
 S('church', '<path d="M12 .8v4.2M10 2.6h4" stroke="#6d28d9" stroke-width="1.8" stroke-linecap="round"/><path d="M12 5.2 17.5 10H6.5z" fill="url(#gR)"/><rect x="5" y="10" width="14" height="11" rx="1" fill="url(#gB)"/><circle cx="12" cy="12.6" r="1.4" fill="#fde047"/><path d="M10 21v-4.2a2 2 0 0 1 4 0V21z" fill="#fde047"/>') +
 S('landmark', '<path d="M1.5 9 12 2.5 22.5 9z" fill="url(#gO)"/><rect x="4" y="10.5" width="3" height="8" fill="#fde7b0" stroke="#d97706" stroke-width=".8"/><rect x="10.5" y="10.5" width="3" height="8" fill="#fde7b0" stroke="#d97706" stroke-width=".8"/><rect x="17" y="10.5" width="3" height="8" fill="#fde7b0" stroke="#d97706" stroke-width=".8"/><rect x="2" y="18.8" width="20" height="3" rx="1" fill="url(#gB)"/>') +
 S('scales', '<path d="M12 4.5V19M7 20.5h10" stroke="#0f766e" stroke-width="2" stroke-linecap="round"/><path d="M3.5 7.5h17" stroke="#d97706" stroke-width="2" stroke-linecap="round"/><path d="M4.5 8 1.8 12.8M4.5 8l2.7 4.8M19.5 8l-2.7 4.8M19.5 8l2.7 4.8" stroke="#0f766e" stroke-width="1"/><path d="M1.2 12.8h6.6a3.3 3.3 0 0 1-6.6 0zM16.2 12.8h6.6a3.3 3.3 0 0 1-6.6 0z" fill="url(#gT)"/><circle cx="12" cy="4.4" r="2" fill="url(#gG)"/>') +
 S('bubbles', '<path d="M3 3h12a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H8.5L5 16v-3H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" fill="url(#gB)"/><path d="M9 10h12a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-1v3l-4-3H9a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2z" fill="url(#gO)" opacity=".95"/><path d="M4.5 6.5h8M4.5 9h5M11 14h8M11 17h5" stroke="#fff" stroke-width="1.3" stroke-linecap="round"/>') +
 S('note', '<rect x="4" y="4" width="16" height="18" rx="2.5" fill="url(#gT)"/><rect x="6.4" y="7" width="11.2" height="13" rx="1" fill="#fff"/><rect x="8.5" y="2" width="7" height="4" rx="1.5" fill="#fde047" stroke="#d97706"/><path d="M8.5 11h7M8.5 14h7M8.5 17h4" stroke="#0f766e" stroke-width="1.4" stroke-linecap="round"/>') +
 S('library', '<rect x="3" y="5" width="4.6" height="16" rx="1" fill="url(#gR)"/><rect x="8.6" y="3" width="4.6" height="18" rx="1" fill="url(#gB)"/><rect x="14.6" y="6" width="4.6" height="15" rx="1" fill="url(#gG)" transform="rotate(12 16.9 21)"/><rect x="1.5" y="20.5" width="21" height="2" rx="1" fill="#92400e"/>') +
 S('dice', '<rect x="3" y="3" width="18" height="18" rx="4.5" fill="url(#gP)"/><g fill="#fff"><circle cx="8" cy="8" r="1.7"/><circle cx="16" cy="8" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="8" cy="16" r="1.7"/><circle cx="16" cy="16" r="1.7"/></g>') +
 S('clock', '<circle cx="12" cy="12" r="10.5" fill="url(#gB)"/><circle cx="12" cy="12" r="8.3" fill="#fff"/><path d="M12 6.5V12l3.6 2.2" stroke="#ea580c" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>') +
 S('search', '<circle cx="10" cy="10" r="7" fill="#dbeafe" stroke="url(#gB)" stroke-width="2.6"/><path d="m15.6 15.6 6 6" stroke="url(#gO)" stroke-width="3.2" stroke-linecap="round"/>') +
 S('globe', '<circle cx="12" cy="12" r="10.5" fill="url(#gB)"/><path d="M5.5 8c2-2.6 4.4-2 5.6-.6s-1 3.4-3.2 3.4-3.4-.4-2.4-2.8zM13 14.2c2.2-1 5.2 0 5 2.2s-2.2 4-4.2 3-2.2-4-.8-5.2z" fill="#4ade80"/><ellipse cx="12" cy="12" rx="4.2" ry="10.5" fill="none" stroke="#fff" opacity=".55"/>') +
 S('flask', '<path d="M9 2h6v2h-1v5l6 10.4A2 2 0 0 1 18.3 22H5.7A2 2 0 0 1 4 19.4L10 9V4H9z" fill="#e0f2fe" stroke="#0369a1" stroke-width="1.4" stroke-linejoin="round"/><path d="M7.6 15h8.8l3 5.2a1.2 1.2 0 0 1-1 1.8H5.6a1.2 1.2 0 0 1-1-1.8z" fill="url(#gT)"/><circle cx="10.5" cy="18" r="1" fill="#fff"/><circle cx="14" cy="19" r=".8" fill="#fff"/>') +
 S('chat', '<path d="M4 3h16a2.5 2.5 0 0 1 2.5 2.5v9A2.5 2.5 0 0 1 20 17h-8l-5.5 4.5V17H4a2.5 2.5 0 0 1-2.5-2.5v-9A2.5 2.5 0 0 1 4 3z" fill="#fff"/><circle cx="7.5" cy="10" r="1.6" fill="#ef4444"/><circle cx="12" cy="10" r="1.6" fill="#f59e0b"/><circle cx="16.5" cy="10" r="1.6" fill="#22c55e"/>') +
 S('theme', '<circle cx="12" cy="12" r="10.5" fill="#312e81"/><path d="M12 1.5a10.5 10.5 0 0 1 0 21z" fill="url(#gG)"/><circle cx="7" cy="8" r="1" fill="#fff"/><circle cx="8.5" cy="15" r=".7" fill="#fff"/>') +
 S('menu', '<path d="M4 6h16" stroke="#fde047" stroke-width="2.4" stroke-linecap="round"/><path d="M4 12h16" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/><path d="M4 18h16" stroke="#93c5fd" stroke-width="2.4" stroke-linecap="round"/>') +
 S('doc', '<path d="M6 2h8l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" fill="url(#gB)"/><path d="M14 2v5h5z" fill="#93c5fd"/><path d="M8 12h8M8 15h8M8 18h5" stroke="#fff" stroke-width="1.4" stroke-linecap="round"/>') +
 S('folder', '<path d="M2 6a2 2 0 0 1 2-2h5l2 2.5h9a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z" fill="url(#gG)"/><path d="M2 10h20v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z" fill="#fbbf24"/>') +
 S('link', '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" fill="none" stroke="url(#gB)" stroke-width="2.6" stroke-linecap="round"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" fill="none" stroke="url(#gO)" stroke-width="2.6" stroke-linecap="round"/>') +
 S('ok', '<circle cx="12" cy="12" r="10.5" fill="#22c55e"/><path d="m7 12.5 3.2 3.2L17 9" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>') +
 S('bad', '<circle cx="12" cy="12" r="10.5" fill="#ef4444"/><path d="m8 8 8 8M16 8l-8 8" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>') + '</svg>';
function ic(n, s) { s = s || 20; return '<svg class="ic" width="' + s + '" height="' + s + '" viewBox="0 0 24 24" aria-hidden="true"><use href="#i-' + n + '"/></svg>'; }

/* ---------- API (CORS via origin=*, timeout, retry, memory+session cache) ---------- */
function tf(u, n) {
  var ac = new AbortController(), t = setTimeout(function () { ac.abort(); }, 15000);
  return fetch(u, { signal: ac.signal }).then(function (r) { clearTimeout(t); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .catch(function (e) { clearTimeout(t); if (n > 0) return new Promise(function (ok) { setTimeout(ok, 600); }).then(function () { return tf(u, n - 1); }); throw e; });
}
function api(p, ttl) {
  p = Object.assign({ format: 'json', formatversion: 2, origin: '*' }, p);
  var qs = new URLSearchParams(p).toString(), k = 'bds_c:' + qs, life = ttl || C.ttl, m = mem[k];
  if (m && Date.now() - m.t < life) return Promise.resolve(m.d);
  try { var s = JSON.parse(sessionStorage.getItem(k)); if (s && Date.now() - s.t < life) { mem[k] = s; return Promise.resolve(s.d); } } catch (e) {}
  return tf(C.api + '?' + qs, 2).then(function (d) {
    if (d.error) { var er = new Error(d.error.info); er.code = d.error.code; throw er; }
    var o = { t: Date.now(), d: d }; mem[k] = o; try { sessionStorage.setItem(k, JSON.stringify(o)); } catch (e) {} return d;
  });
}
function info() { return _si || (_si = api({ action: 'query', meta: 'siteinfo', siprop: 'statistics|rightsinfo|general' }, 36e5).catch(function () { _si = null; return null; })); }

/* ---------- Sanitiser for externally retrieved HTML (whitelist) ---------- */
var BAD = 'script,style,iframe,object,embed,form,input,button,textarea,select,svg,math,link,meta,base,noscript,template,audio,video,source,canvas,frame,frameset,applet,.mw-editsection,.noprint,.mw-empty-elt,.printfooter,.catlinks,.mw-collapsible-toggle';
var OK = new Set('p div span a b i u em strong sup sub h1 h2 h3 h4 h5 h6 ul ol li dl dt dd table thead tbody tfoot tr th td caption colgroup col img figure figcaption blockquote pre code br hr small big cite abbr s strike del ins mark center q kbd var samp ruby rt rp bdi bdo details summary'.split(' '));
var AT = new Set('href src alt title class id colspan rowspan width height lang dir scope start type headers'.split(' '));
var okHost = function (u) { return /^https?:$/.test(u.protocol) && /(^|\.)(wikitide\.net|miraheze\.org)$/.test(u.hostname); };
function fix(e, t) {
  var ss = t === 'img' ? e.getAttribute('srcset') : null;
  Array.prototype.slice.call(e.attributes).forEach(function (a) { if (!AT.has(a.name)) e.removeAttribute(a.name); });
  if (e.className && typeof e.className === 'string') e.className = e.className.replace(/[^\w\- ]/g, '');
  if (e.id) e.id = 'w-' + e.id;
  if (t === 'img') {
    var u; try { u = new URL(e.getAttribute('src') || '', C.origin); } catch (x) { e.remove(); return; }
    if (!okHost(u)) { e.replaceWith(document.createTextNode(e.alt ? '[' + e.alt + ']' : '')); return; }
    e.setAttribute('src', u.href);
    if (ss) e.setAttribute('srcset', ss.split(',').map(function (x) { var p = x.trim().split(/\s+/); try { var q = new URL(p[0], C.origin); if (!okHost(q)) return ''; p[0] = q.href; } catch (_) { return ''; } return p.join(' '); }).filter(Boolean).join(', '));
    e.setAttribute('loading', 'lazy'); e.setAttribute('decoding', 'async'); e.setAttribute('referrerpolicy', 'no-referrer'); return;
  }
  if (t !== 'a') return;
  var hr = e.getAttribute('href'); if (hr == null) return;
  if (hr[0] === '#') { var id = hr.slice(1); try { id = decodeURIComponent(id); } catch (x) {} e.setAttribute('data-anc', 'w-' + id); e.setAttribute('href', '#'); return; }
  var l; try { l = new URL(hr, C.origin); } catch (x) { e.removeAttribute('href'); return; }
  if (!/^(https?:|mailto:)$/.test(l.protocol)) { e.removeAttribute('href'); return; }
  var ti = null;
  if (l.origin === C.origin) {
    if (l.searchParams.get('redlink') === '1') { var sp = document.createElement('span'); sp.className = 'missing'; sp.append.apply(sp, e.childNodes); e.replaceWith(sp); return; }
    if (l.pathname.indexOf('/wiki/') === 0) { ti = l.pathname.slice(6); try { ti = decodeURIComponent(ti); } catch (x) {} }
    else if (l.pathname === '/w/index.php' && l.searchParams.get('title') && (!l.searchParams.get('action') || l.searchParams.get('action') === 'view')) ti = l.searchParams.get('title');
    if (ti) {
      ti = ti.replace(/_/g, ' ');
      if (/^Category:/i.test(ti)) { e.setAttribute('data-r', JSON.stringify({ t: 'tcat', a: ti.slice(9), tok: '', st: [] })); e.setAttribute('href', '#'); return; }
      if (!/^(File|Image|Media|Special|Template|Help|Talk|User|User talk|MediaWiki|Module|Project):/i.test(ti)) { e.setAttribute('data-r', JSON.stringify({ t: 'article', a: ti + (l.hash || ''), st: [] })); e.setAttribute('href', '#'); return; }
    }
  }
  e.setAttribute('href', l.href); e.setAttribute('target', '_blank'); e.setAttribute('rel', 'noopener noreferrer nofollow');
  if (l.origin !== C.origin) e.classList.add('ext');
}
function clean(html) {
  var r = new DOMParser().parseFromString(html, 'text/html').body;
  r.querySelectorAll(BAD).forEach(function (e) { e.remove(); });
  (function w(n) {
    Array.prototype.slice.call(n.children).forEach(function (e) {
      var t = e.tagName.toLowerCase(); w(e);
      if (!OK.has(t)) { e.replaceWith.apply(e, e.childNodes); return; }
      fix(e, t);
    });
  })(r);
  r.querySelectorAll('table').forEach(function (t) { if (!t.parentElement.closest('table')) { var w = document.createElement('div'); w.className = 'tw'; t.replaceWith(w); w.append(t); } });
  return r;
}
function snip(s) {
  var t = new DOMParser().parseFromString(String(s || '').replace(/<span class="searchmatch">/g, '\u0001').replace(/<\/span>/g, '\u0002'), 'text/html').body.textContent;
  return h(t).replace(/\u0001/g, '<mark>').replace(/\u0002/g, '</mark>');
}

/* ---------- UI helpers ---------- */
function card(t, sn, meta) { return '<a class="card" href="#" data-title="' + h(t) + '" data-r="' + rj({ t: 'article', a: t, st: [] }) + '"><div class="th">' + ic('doc', 30) + '</div><div class="cb"><b>' + h(t) + '</b><p>' + (sn || '') + '</p><small>' + (meta || '') + '</small></div></a>'; }
function enrich(ts) {
  ts = ts.slice(0, 20); if (!ts.length) return;
  api({ action: 'query', prop: 'pageimages|extracts', piprop: 'thumbnail', pithumbsize: 160, pilimit: 20, exintro: 1, explaintext: 1, exsentences: 2, exlimit: 20, titles: ts.join('|') }).then(function (d) {
    var cs = Array.prototype.slice.call(R.querySelectorAll('.card'));
    ((d.query || {}).pages || []).forEach(function (p) {
      cs.filter(function (c) { return c.dataset.title === p.title; }).forEach(function (c) {
        if (p.thumbnail) { var u = new URL(p.thumbnail.source, C.origin); if (okHost(u)) c.querySelector('.th').innerHTML = '<img loading="lazy" referrerpolicy="no-referrer" alt="" src="' + h(u.href) + '">'; }
        var pp = c.querySelector('p'); if (pp && !pp.textContent && p.extract) pp.textContent = p.extract;
      });
    });
  }).catch(function () {});
}
function bc(a) { return '<nav class="bc">' + a.map(function (x, i) { return (i ? '<span>›</span>' : '') + (x[1] ? '<a href="#" data-r="' + rj(x[1]) + '">' + h(x[0]) + '</a>' : '<em>' + h(x[0]) + '</em>'); }).join('') + '</nav>'; }
function cards(s) { return s.length ? '<div class="grid1">' + s.map(function (x) { return card(x.title, x.snippet ? snip(x.snippet) : '', x.wordcount ? x.wordcount + ' words · ' + fd(x.timestamp) : ''); }).join('') + '</div>' : '<p class="mu">Nothing found.</p>'; }
function pager(r, cont) {
  var o = '';
  if (r.st && r.st.length) o += '<button class="bt" data-r="' + rj(Object.assign({}, r, { tok: r.st[r.st.length - 1], st: r.st.slice(0, -1) })) + '">← Previous</button>';
  if (cont) o += '<button class="bt" data-r="' + rj(Object.assign({}, r, { tok: cont, st: (r.st || []).concat([r.tok || '']) })) + '">Next →</button>';
  return o ? '<div class="pg">' + o + '</div>' : '';
}
function addRecent(t) { var l = (ls('bds_recent') || []).filter(function (x) { return x.t !== t; }); l.unshift({ t: t, d: Date.now() }); ls('bds_recent', l.slice(0, 12)); }
function recentHtml(n) { var l = (ls('bds_recent') || []).slice(0, n); return l.length ? '<div class="chips">' + l.map(function (x) { return '<a class="chip" href="#" data-r="' + rj({ t: 'article', a: x.t, st: [] }) + '">' + h(x.t) + '</a>'; }).join('') + '</div>' : '<p class="mu">Articles you open will appear here.</p>'; }

/* ---------- Routing ---------- */
function nav(r, np) { if (!r.st) r.st = []; if (!np && cur) stack.push(cur); cur = r; render(); }
function back() { if (stack.length) { cur = stack.pop(); render(); } }
function render() {
  var tk = ++tok; $('.app').classList.remove('open'); $('#toc').innerHTML = ''; $('.wrap').classList.remove('ht');
  $('.pb').classList.add('on'); $('#main').innerHTML = '<div class="ld"><i></i><span>Loading from TheoGo…</span></div>';
  Array.prototype.forEach.call(R.querySelectorAll('.ni'), function (e) { var r = JSON.parse(e.dataset.r || '{}'); e.classList.toggle('on', r.t === cur.t && (r.a || '') === (cur.t === 'article' ? '' : cur.a || '')); });
  try { V[cur.t](cur, tk); } catch (e) { fail(e, tk); }
}
function put(tk, html, post) { if (tk !== tok) return; var m = $('#main'); m.innerHTML = html + foot(); m.scrollTop = 0; $('.pb').classList.remove('on'); if (post) post(); }
function foot() { return '<footer>BDStudyMaterial · Study content from <a target="_blank" rel="noopener" href="' + C.origin + '">TheoGo</a> under its own licence · <a href="#" data-act="diag">API status</a></footer>'; }
function fail(e, tk) {
  var c = (e && e.code) || '', m = /missingtitle|invalidtitle|nosuchpage/.test(c) ? ['Article not found', 'This page does not exist on TheoGo (it may have been renamed or deleted).'] : /denied|permission|private/.test(c) ? ['Not publicly accessible', 'TheoGo does not allow public reading of this page, so it cannot be shown here.'] : ['Couldn’t reach TheoGo', 'The request failed (' + h((e && e.message) || 'network error') + '). This can be a network problem or a CORS block.'];
  put(tk, '<div class="err"><h2>' + m[0] + '</h2><p>' + m[1] + '</p><p><button class="bt" data-act="retry">Retry</button> <a class="bt" target="_blank" rel="noopener" href="' + C.origin + '">Open TheoGo ↗</a> <button class="bt" data-act="diag">Run API test</button></p></div>');
}

var V = {};
V.home = function (r, tk) {
  Promise.all([info(), api({ action: 'query', list: 'allcategories', acprop: 'size', aclimit: 500 }).catch(function () { return null; }), api({ action: 'query', list: 'recentchanges', rcnamespace: 0, rctype: 'new|edit', rclimit: 40, rcprop: 'title|timestamp', rcshow: '!bot' }, 12e4).catch(function () { return null; })]).then(function (a) {
    var si = a[0], st = si && si.query.statistics, cats = a[1] && a[1].query.allcategories || [], rc = a[2] && a[2].query.recentchanges || [], seen = {}, lat = [];
    cats = cats.filter(function (c) { return c.size > 0; }).sort(function (x, y) { return y.size - x.size; }).slice(0, 14);
    rc.forEach(function (x) { if (!seen[x.title] && lat.length < 8) { seen[x.title] = 1; lat.push(x); } });
    var o = '<section class="hero"><h1>BDStudyMaterial</h1><p>Study theology, scripture and church history — live from the TheoGo wiki.</p><div class="sb big"><input id="hq" placeholder="Search articles…" autocomplete="off"><div class="sg" id="hsg" hidden></div></div>' +
      '<div class="chips"><button class="bt w" data-act="random">' + ic('dice', 18) + ' Random article</button><button class="bt w" data-act="pal">' + ic('search', 18) + ' Search · Ctrl+K</button></div>' +
      (st ? '<div class="stats"><span>' + ic('doc', 18) + ' <b>' + st.articles + '</b> articles</span><span>' + ic('library', 18) + ' <b>' + st.pages + '</b> pages</span><span>' + ic('note', 18) + ' <b>' + st.edits + '</b> edits</span></div>' : '<p class="warn">TheoGo could not be reached right now — subjects below will retry when you open them.</p>') + '</section>' +
      '<h2>Browse by subject</h2><div class="grid">' + CATS.map(function (c) { return '<a class="cc" href="#" data-r="' + rj({ t: 'cat', a: c.id, k: 0, tok: '', st: [] }) + '"><span>' + ic(c.i, 34) + '</span><b>' + c.n + '</b><p>' + c.d + '</p></a>'; }).join('') + '</div>';
    if (cats.length) o += '<h2>Popular TheoGo categories</h2><div class="chips">' + cats.map(function (c) { return '<a class="chip" href="#" data-r="' + rj({ t: 'tcat', a: c.category, tok: '', st: [] }) + '">' + h(c.category) + ' <small>' + c.size + '</small></a>'; }).join('') + '</div>';
    if (lat.length) o += '<h2>Latest on TheoGo</h2><div class="grid1">' + lat.map(function (x) { return card(x.title, '', 'Updated ' + fd(x.timestamp)); }).join('') + '</div>';
    o += '<h2>Recently viewed</h2>' + recentHtml(8);
    put(tk, o, function () { sug($('#hq'), $('#hsg')); enrich(lat.map(function (x) { return x.title; })); });
  }).catch(function (e) { fail(e, tk); });
};
V.cat = function (r, tk) {
  var c = CATS.filter(function (x) { return x.id === r.a; })[0], k = r.k || 0;
  api({ action: 'query', list: 'search', srsearch: c.q[k], srlimit: C.page, sroffset: r.tok || 0, srprop: 'snippet|wordcount|timestamp', srinfo: 'totalhits' }).then(function (d) {
    var s = d.query.search || [], x = d.query.searchinfo || {};
    var extra = c.id === 'res' ? '<div class="chips"><a class="chip" target="_blank" rel="noopener" href="' + C.origin + '/wiki/Main_Page">TheoGo main page ↗</a><a class="chip" href="library/">JustGo Library</a></div>' : '';
    put(tk, bc([['Home', { t: 'home' }], [c.n]]) + '<h1 class="hi">' + ic(c.i, 32) + ' ' + c.n + '</h1><p class="mu">' + c.d + '</p>' + extra +
      '<div class="chips">' + c.q.map(function (q, i) { return '<button class="chip ' + (i === k ? 'on' : '') + '" data-r="' + rj({ t: 'cat', a: c.id, k: i, tok: '', st: [] }) + '">' + h(q) + '</button>'; }).join('') + '</div>' +
      '<p class="mu">' + (x.totalhits || 0) + ' articles matching “' + h(c.q[k]) + '”</p>' + cards(s) + pager(r, (d.continue || {}).sroffset),
      function () { enrich(s.map(function (z) { return z.title; })); });
  }).catch(function (e) { fail(e, tk); });
};
V.search = function (r, tk) {
  api({ action: 'query', list: 'search', srsearch: r.a, srlimit: C.page, sroffset: r.tok || 0, srprop: 'snippet|wordcount|timestamp', srinfo: 'totalhits|suggestion' }).then(function (d) {
    var s = d.query.search || [], x = d.query.searchinfo || {};
    put(tk, bc([['Home', { t: 'home' }], ['Search']]) + '<h1>Search results</h1><p class="mu">' + (x.totalhits || 0) + ' results for <b>' + h(r.a) + '</b></p>' +
      (x.suggestion ? '<p>Did you mean <a href="#" data-r="' + rj({ t: 'search', a: x.suggestion, tok: '', st: [] }) + '">' + h(x.suggestion) + '</a>?</p>' : '') + cards(s) + pager(r, (d.continue || {}).sroffset),
      function () { enrich(s.map(function (z) { return z.title; })); });
  }).catch(function (e) { fail(e, tk); });
};
V.tcat = function (r, tk) {
  api({ action: 'query', list: 'categorymembers', cmtitle: 'Category:' + r.a, cmlimit: C.page, cmtype: 'page|subcat', cmcontinue: r.tok || undefined, cmprop: 'title|type' }).then(function (d) {
    var m = d.query.categorymembers || [], sc = m.filter(function (x) { return x.type === 'subcat'; }), pg = m.filter(function (x) { return x.type !== 'subcat'; });
    put(tk, bc([['Home', { t: 'home' }], ['Category'], [r.a]]) + '<h1>Category: ' + h(r.a) + '</h1>' +
      (sc.length ? '<div class="chips">' + sc.map(function (x) { return '<a class="chip" href="#" data-r="' + rj({ t: 'tcat', a: x.title.replace(/^Category:/, ''), tok: '', st: [] }) + '">' + ic('folder', 16) + ' ' + h(x.title.replace(/^Category:/, '')) + '</a>'; }).join('') + '</div>' : '') +
      (pg.length ? '<div class="grid1">' + pg.map(function (x) { return card(x.title, '', ''); }).join('') + '</div>' : '<p class="mu">No articles in this category.</p>') + pager(r, (d.continue || {}).cmcontinue),
      function () { enrich(pg.map(function (z) { return z.title; })); });
  }).catch(function (e) { fail(e, tk); });
};
V.recent = function (r, tk) {
  var l = ls('bds_recent') || [];
  put(tk, bc([['Home', { t: 'home' }], ['Recently viewed']]) + '<h1>Recently viewed</h1>' + (l.length ? '<div class="grid1">' + l.map(function (x) { return card(x.t, '', 'Viewed ' + fd(x.d)); }).join('') + '</div><p><button class="bt" data-act="clr">Clear history</button></p>' : '<p class="mu">Nothing yet — open an article and it will show here.</p>'), function () { enrich(l.map(function (x) { return x.t; })); });
};
V.article = function (r, tk) {
  var ti = r.a.split('#')[0], fr = r.a.split('#')[1];
  Promise.all([
    api({ action: 'parse', page: ti, prop: 'text|categories', redirects: 1, disableeditsection: 1, disablelimitreport: 1, disabletoc: 1 }, 18e5),
    api({ action: 'query', prop: 'revisions', rvprop: 'timestamp|user', titles: ti, redirects: 1 }, 18e5).catch(function () { return null; }),
    info()
  ]).then(function (a) {
    var p = a[0].parse, pg = a[1] && a[1].query.pages && a[1].query.pages[0], rv = pg && pg.revisions && pg.revisions[0], si = a[2], rights = si && si.query.rightsinfo;
    var t = p.title, body = clean(p.text), cats = (p.categories || []).filter(function (c) { return !c.hidden; }).map(function (c) { return c.category.replace(/_/g, ' '); });
    var hs = Array.prototype.slice.call(body.querySelectorAll('h2,h3,h4')), n = 0;
    var toc = hs.map(function (e) { if (!e.id) e.id = 'w-h' + (n++); return '<a class="l' + e.tagName[1] + '" href="#" data-anc="' + h(e.id) + '">' + h(e.textContent.replace(/\[edit\]/, '')) + '</a>'; }).join('');
    var words = body.textContent.trim().split(/\s+/).length, orig = C.origin + '/wiki/' + encodeURIComponent(t.replace(/ /g, '_')).replace(/%3A/g, ':'), hist = C.origin + '/w/index.php?title=' + encodeURIComponent(t) + '&action=history';
    var from = stack.length && stack[stack.length - 1].t === 'cat' ? CATS.filter(function (c) { return c.id === stack[stack.length - 1].a; })[0] : null;
    addRecent(t);
    put(tk, bc([['Home', { t: 'home' }]].concat(from ? [[from.n, { t: 'cat', a: from.id, k: 0, tok: '', st: [] }]] : [], [[t]])) +
      '<article class="art"><h1>' + h(t) + '</h1><div class="meta"><span>' + ic('clock', 16) + ' ' + Math.max(1, Math.round(words / 200)) + ' min read</span>' + (rv ? '<span>Last edited ' + fd(rv.timestamp) + ' by ' + h(rv.user) + '</span>' : '') + '</div>' +
      '<div class="acts"><button class="bt" data-act="back">← Back</button><a class="bt" target="_blank" rel="noopener" href="' + h(orig) + '">Original on TheoGo ↗</a><button class="bt" data-act="copy" data-t="' + h(t) + '">' + ic('link', 16) + ' Copy link</button></div>' +
      (t.toLowerCase() !== ti.replace(/_/g, ' ').toLowerCase() ? '<p class="mu">Redirected from “' + h(ti) + '”.</p>' : '') +
      (toc ? '<details class="mtoc"><summary>On this page</summary>' + toc + '</details>' : '') +
      '<div class="body">' + body.innerHTML + '</div>' +
      (cats.length ? '<div class="chips"><b>Categories:</b> ' + cats.map(function (c) { return '<a class="chip" href="#" data-r="' + rj({ t: 'tcat', a: c, tok: '', st: [] }) + '">' + h(c) + '</a>'; }).join('') + '</div>' : '') +
      '<div class="attr"><b>Source &amp; licence</b><p>This article comes from <a target="_blank" rel="noopener" href="' + h(orig) + '">TheoGo</a>, a community wiki. Text is available under ' + (rights ? '<a target="_blank" rel="noopener" href="' + h(rights.url) + '">' + h(rights.text) + '</a>' : 'the licence shown on TheoGo') + ' unless noted otherwise; authors are credited in the <a target="_blank" rel="noopener" href="' + h(hist) + '">page history</a>. Images belong to their owners — each file page on TheoGo states its licence. BDStudyMaterial shows the content unmodified apart from safety sanitising and layout.</p></div></article>' +
      '<section id="rel"></section>', function () {
        if (toc) { $('#toc').innerHTML = '<b>On this page</b>' + toc; $('.wrap').classList.add('ht'); }
        if (fr) { try { fr = decodeURIComponent(fr); } catch (x) {} jump('w-' + fr.replace(/ /g, '_')); }
        rel(t, cats).then(function (l) { if (tk === tok && l.length) { $('#rel').innerHTML = '<h2>Related articles</h2><div class="grid1">' + l.map(function (x) { return card(x.title, x.snippet ? snip(x.snippet) : '', ''); }).join('') + '</div>'; enrich(l.map(function (x) { return x.title; })); } });
      });
  }).catch(function (e) { fail(e, tk); });
};
function rel(ti, cats) {
  return Promise.all([cats[0] ? api({ action: 'query', list: 'categorymembers', cmtitle: 'Category:' + cats[0], cmlimit: 12, cmnamespace: 0 }).catch(function () { return null; }) : null, api({ action: 'query', list: 'search', srsearch: ti, srlimit: 8, srprop: 'snippet' }).catch(function () { return null; })]).then(function (a) {
    var seen = {}, o = [];
    ((a[0] && a[0].query.categorymembers) || []).concat((a[1] && a[1].query.search) || []).forEach(function (x) { if (x.title !== ti && !seen[x.title]) { seen[x.title] = 1; o.push(x); } });
    return o.slice(0, 6);
  });
}
function jump(id) { var e = Array.prototype.slice.call(R.querySelectorAll('.art [id]')).filter(function (x) { return x.id === id; })[0]; if (e) e.scrollIntoView({ behavior: 'smooth', block: 'start' }); }

/* ---------- Suggestions (opensearch) ---------- */
function sug(inp, box, done) {
  var t, i = -1, it = [];
  var hide = function () { box.hidden = true; i = -1; };
  var go = function (k) { hide(); if (done) done(); if (k >= 0 && it[k]) nav({ t: 'article', a: it[k], st: [] }); else if (inp.value.trim()) nav({ t: 'search', a: inp.value.trim(), tok: '', st: [] }); };
  var mark = function () { Array.prototype.forEach.call(box.children, function (c, j) { c.classList.toggle('on', j === i); }); };
  inp.addEventListener('input', function () {
    clearTimeout(t); var v = inp.value.trim(); if (v.length < 2) { hide(); return; }
    t = setTimeout(function () {
      api({ action: 'opensearch', search: v, limit: 8, namespace: 0 }, 12e4).then(function (d) {
        if (inp.value.trim() !== v) return; it = d[1] || []; i = -1;
        box.innerHTML = it.map(function (x, k) { return '<div class="si" data-k="' + k + '">' + h(x) + '</div>'; }).join('') + '<div class="si" data-k="-1">Search “' + h(v) + '” →</div>'; box.hidden = false;
      }).catch(function () { box.innerHTML = '<div class="si">Suggestions unavailable — press Enter to search</div>'; box.hidden = false; });
    }, 220);
  });
  inp.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); i = Math.min(i + 1, box.children.length - 1); mark(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); i = Math.max(i - 1, -1); mark(); }
    else if (e.key === 'Enter') { e.preventDefault(); go(i >= 0 && i < it.length ? i : -1); }
    else if (e.key === 'Escape') hide();
  });
  box.addEventListener('mousedown', function (e) { var s = e.target.closest('.si'); if (s && s.dataset.k != null) { e.preventDefault(); go(+s.dataset.k); } });
  inp.addEventListener('blur', function () { setTimeout(hide, 150); });
}

/* ---------- Palette, lightbox, diagnostics ---------- */
function pal(on) { var p = $('#pal'); p.hidden = !on; if (on) { var q = $('#pq'); q.value = ''; $('#psg').hidden = true; q.focus(); } }
function lb(im, href) {
  var s = im.src; if (/\/thumb\//.test(s)) s = s.replace('/thumb/', '/').replace(/\/[^\/]+$/, '');
  var l = $('#lb'); l.innerHTML = '<img referrerpolicy="no-referrer" alt="' + h(im.alt) + '" src="' + h(s) + '"><div><button class="bt w" data-act="lbx">Close ✕</button>' + (href ? ' <a class="bt w" target="_blank" rel="noopener" href="' + h(href) + '">File page &amp; licence ↗</a>' : '') + '</div>';
  l.querySelector('img').onerror = function () { this.onerror = null; this.src = im.src; }; l.hidden = false;
}
function diag() {
  var d = $('#dg'), b = d.querySelector('.pbx'), first = null; d.hidden = false;
  b.innerHTML = '<h3>TheoGo API status</h3><div id="dgl"></div><p class="mu">Page origin: ' + h(location.origin) + '</p><button class="bt" data-act="dgx">Close</button>';
  var T = [['CORS + siteinfo', function () { return { action: 'query', meta: 'siteinfo', siprop: 'general' }; }], ['Live search', function () { return { action: 'query', list: 'search', srsearch: 'bible', srlimit: 3 }; }, function (d) { first = d.query.search[0] && d.query.search[0].title; }],
    ['Article parse', function () { return { action: 'parse', page: first || 'Main Page', prop: 'text', redirects: 1 }; }], ['Categories', function () { return { action: 'query', list: 'allcategories', aclimit: 5 }; }], ['Suggestions', function () { return { action: 'opensearch', search: 'gen', limit: 3 }; }]];
  T.reduce(function (pr, x) {
    return pr.then(function () {
      var t0 = performance.now(), row = document.createElement('div'); $('#dgl').appendChild(row);
      return api(x[1](), -1).then(function (r) { if (x[2]) x[2](r); row.innerHTML = ic('ok', 18) + ' ' + h(x[0]) + ' — ' + Math.round(performance.now() - t0) + ' ms'; }).catch(function (e) { row.innerHTML = ic('bad', 18) + ' ' + h(x[0]) + ' — ' + h(e.message || e); });
    });
  }, Promise.resolve());
}

/* ---------- Show / hide (in-memory only, never persisted) ---------- */
function setInert(on) {
  if (on) Array.prototype.forEach.call(document.body.children, function (e) { if (e.tagName !== 'SCRIPT' && !e.inert) { e.inert = true; ino.push(e); } });
  else { ino.forEach(function (e) { e.inert = false; }); ino = []; }
}
function hide() { clearTimeout(tm); tm = setTimeout(show, C.reshowMs); vis = false; host.style.display = 'none'; setInert(false); if (C.returnBtn) ret.style.display = 'block'; try { window.dispatchEvent(new Event('resize')); } catch (e) {} }
function show() { clearTimeout(tm); vis = true; host.style.display = 'block'; ret.style.display = 'none'; setInert(true); }

/* ---------- Shell ---------- */
var CSS = ':host{all:initial}*{box-sizing:border-box}[hidden]{display:none!important}' +
'.app{--p:#144097;--bg:#fff;--fg:#1b2437;--mu:#667085;--bd:#e2e7f0;--sf:#f5f7fb;position:absolute;inset:0;display:flex;flex-direction:column;background:var(--bg);color:var(--fg);font:15px/1.6 Inter,-apple-system,"Segoe UI",Roboto,Arial,sans-serif}' +
'.app[data-t=dark]{--p:#7aa5f7;--bg:#0f1624;--fg:#e8ecf3;--mu:#97a4bb;--bd:#26324a;--sf:#172033}' +
'a{color:var(--p);text-decoration:none}a:hover{text-decoration:underline}button{font:inherit;color:inherit;cursor:pointer}h1{font-size:1.9rem;line-height:1.2;margin:.2em 0 .4em}h2{font-size:1.25rem;margin:1.6em 0 .6em}.mu{color:var(--mu)}' +
'header{height:56px;flex:none;background:#144097;color:#fff;display:flex;align-items:center;gap:10px;padding:0 12px;box-shadow:0 2px 8px #0003;z-index:5}.app[data-t=dark] header{background:#0d2a66}' +
'.logo{color:#fff;font-size:1.1rem;white-space:nowrap}.logo:hover{text-decoration:none}.ib{background:#ffffff1f;border:0;color:#fff;width:38px;height:38px;border-radius:10px;font-size:18px}.ib:hover{background:#ffffff38}' +
'.sb{position:relative;flex:1;max-width:560px;margin:0 auto}.sb input{width:100%;height:38px;border-radius:10px;border:1px solid transparent;padding:0 14px;font:inherit;background:#ffffff26;color:#fff;outline:0}.sb input::placeholder{color:#ffffffbb}.sb input:focus{background:#fff;color:#1b2437}.sb.big input{height:50px;font-size:1.05rem;background:#fff;color:#1b2437}.sb.big input::placeholder{color:#8a94a6}' +
'.sg{position:absolute;left:0;right:0;top:100%;margin-top:4px;background:var(--bg);color:var(--fg);border:1px solid var(--bd);border-radius:10px;box-shadow:0 10px 30px #0003;overflow:hidden;z-index:20}.si{padding:9px 14px;cursor:pointer}.si:hover,.si.on{background:var(--sf);color:var(--p)}' +
'.pb{position:absolute;left:0;top:56px;height:3px;width:0;background:#f59e0b;z-index:6;opacity:0}.pb.on{opacity:1;animation:pb 1.4s ease-in-out infinite}@keyframes pb{0%{width:0;left:0}50%{width:60%;left:20%}100%{width:0;left:100%}}' +
'.wrap{flex:1;display:grid;grid-template-columns:270px minmax(0,1fr);min-height:0}.wrap.ht{grid-template-columns:270px minmax(0,1fr) 230px}' +
'nav#nav{display:flex;flex-direction:column;background:var(--sf);border-right:1px solid var(--bd);overflow:auto;padding:12px 8px}.nh{font-size:.72rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--mu);padding:14px 10px 4px}' +
'.ni{display:flex;gap:8px;align-items:center;width:100%;text-align:left;background:0;border:0;padding:8px 10px;border-radius:8px;color:var(--fg)}.ni:hover{background:var(--bd);text-decoration:none}.ni.on{background:var(--p);color:#fff}.app[data-t=dark] .ni.on{color:#0f1624}' +
'main{overflow:auto;padding:22px clamp(14px,4vw,44px) 30px;overscroll-behavior:contain}aside#toc{overflow:auto;padding:22px 14px;border-left:1px solid var(--bd);font-size:.88rem}aside#toc a{display:block;padding:3px 0;color:var(--mu)}aside#toc a:hover{color:var(--p)}.l3{padding-left:12px!important}.l4{padding-left:24px!important}aside#toc:empty{display:none}' +
'.bc{font-size:.85rem;color:var(--mu);margin-bottom:6px}.bc span{margin:0 6px}.bc em{font-style:normal;color:var(--fg)}' +
'.hero{background:linear-gradient(135deg,#144097,#2563d4);color:#fff;border-radius:16px;padding:30px clamp(16px,4vw,38px);margin-bottom:10px}.hero h1{margin:0}.hero p{opacity:.92}.hero .sb{max-width:640px;margin:16px 0}.hero a{color:#fff}.stats{display:flex;gap:18px;flex-wrap:wrap;margin-top:12px;font-size:.9rem}.warn{background:#0003;padding:8px 12px;border-radius:8px}' +
'.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:12px}.grid1{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px}' +
'.cc,.card{display:block;border:1px solid var(--bd);border-radius:12px;padding:14px;background:var(--bg);color:var(--fg);transition:.15s}.cc:hover,.card:hover{border-color:var(--p);box-shadow:0 6px 18px #14409722;text-decoration:none;transform:translateY(-1px)}.cc span{font-size:1.6rem}.cc b{display:block;color:var(--p)}.cc p,.card p{margin:.2em 0 0;color:var(--mu);font-size:.88rem}' +
'.card{display:flex;gap:12px}.th{flex:none;width:64px;height:64px;border-radius:10px;background:var(--sf);display:flex;align-items:center;justify-content:center;font-size:1.5rem;overflow:hidden}.th img{width:100%;height:100%;object-fit:cover}.cb{min-width:0}.cb b{color:var(--p)}.card p{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}.card small{color:var(--mu)}mark{background:#fde68a;color:#111;border-radius:3px;padding:0 2px}' +
'.chips{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:10px 0}.chip{border:1px solid var(--bd);background:var(--sf);border-radius:999px;padding:4px 12px;font-size:.88rem;color:var(--fg)}.chip:hover,.chip.on{background:var(--p);color:#fff;border-color:var(--p);text-decoration:none}.chip small{opacity:.7}' +
'.bt{display:inline-block;border:1px solid var(--bd);background:var(--bg);border-radius:9px;padding:7px 14px;color:var(--fg);font-size:.9rem}.bt:hover{border-color:var(--p);color:var(--p);text-decoration:none}.bt.w{background:#ffffff26;color:#fff;border-color:#ffffff55}.bt.w:hover{background:#fff;color:#144097}.pg{display:flex;gap:10px;justify-content:center;margin:20px 0}.acts{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0 16px}.meta{display:flex;gap:16px;flex-wrap:wrap;color:var(--mu);font-size:.85rem}' +
'.art{max-width:900px}.body{overflow-wrap:anywhere}.body h2,.body h3,.body h4{border-bottom:1px solid var(--bd);padding-bottom:.2em;scroll-margin-top:12px}.body h3,.body h4{border:0}.body img{max-width:100%;height:auto;cursor:zoom-in;border-radius:4px}.body figure{margin:12px 0;max-width:100%}.body figcaption,.body .thumbcaption{font-size:.82rem;color:var(--mu)}' +
'.body .tright,.body .mw-halign-right{float:right;margin:4px 0 12px 16px;max-width:45%}.body .tleft,.body .mw-halign-left{float:left;margin:4px 16px 12px 0;max-width:45%}.tw{overflow-x:auto;margin:12px 0}.body table{border-collapse:collapse}.body td,.body th{border:1px solid var(--bd);padding:6px 10px}.body th{background:var(--sf)}' +
'.body blockquote{border-left:4px solid var(--p);margin:1em 0;padding:.2em 1em;color:var(--mu)}.body pre{background:var(--sf);padding:12px;overflow:auto;border-radius:8px}.body sup.reference a{font-size:.8em}.body .reflist,.body .references{font-size:.86rem;color:var(--mu)}.body a.ext:after{content:" ↗";font-size:.75em}.missing{color:#c2410c}' +
'.mtoc{display:none;background:var(--sf);border-radius:10px;padding:8px 12px;margin:10px 0}.mtoc a{display:block;padding:3px 0}.attr{margin-top:30px;padding:14px 16px;border:1px solid var(--bd);border-left:4px solid var(--p);border-radius:10px;background:var(--sf);font-size:.86rem;color:var(--mu)}' +
'.ld{display:flex;align-items:center;gap:12px;color:var(--mu);padding:40px 0}.ld i{width:22px;height:22px;border:3px solid var(--bd);border-top-color:var(--p);border-radius:50%;animation:sp .8s linear infinite}@keyframes sp{to{transform:rotate(360deg)}}.err{max-width:560px;margin:40px auto;text-align:center}footer{margin-top:40px;padding-top:14px;border-top:1px solid var(--bd);font-size:.8rem;color:var(--mu)}' +
'.navbot{margin-top:auto;position:sticky;bottom:0;background:var(--sf);padding:12px 0 4px}.com{width:100%;border:0;border-radius:12px;background:#144097;color:#fff;padding:12px 16px;font-weight:700;box-shadow:0 6px 18px #14409755;display:flex;gap:10px;align-items:center;justify-content:center}.com:hover{background:#1b55c9}.app[data-t=dark] .com{background:#2f66d8}' +
'.ov{position:absolute;inset:0;z-index:30;background:#0008;display:flex;justify-content:center;align-items:flex-start;padding:10vh 14px}.pbx{width:100%;max-width:560px;background:var(--bg);border-radius:14px;padding:14px;box-shadow:0 20px 60px #0006;position:relative}.pbx input{width:100%;height:44px;border:1px solid var(--bd);border-radius:10px;padding:0 12px;font:inherit;background:var(--bg);color:var(--fg)}.pbx .sg{position:static;box-shadow:none;margin-top:8px}#pact{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}' +
'#lb{position:absolute;inset:0;z-index:40;background:#000d;display:flex;flex-direction:column;gap:12px;align-items:center;justify-content:center;padding:14px}#lb img{max-width:96%;max-height:80%;object-fit:contain;background:#fff;border-radius:6px}' +
'.ic{flex:none;display:inline-block;vertical-align:middle}.ib{display:inline-flex;align-items:center;justify-content:center;padding:0}.logo{display:inline-flex;align-items:center;gap:8px}.hi{display:flex;align-items:center;gap:10px}.bt,.chip{display:inline-flex;gap:6px;align-items:center}.stats span,.meta span{display:inline-flex;gap:6px;align-items:center}#dgl div{display:flex;gap:8px;align-items:center;padding:3px 0}.cc span{display:block;margin-bottom:4px}.scrim{display:none}@media(max-width:900px){.wrap,.wrap.ht{grid-template-columns:minmax(0,1fr)}nav#nav{position:absolute;top:56px;bottom:0;left:0;width:280px;z-index:8;transform:translateX(-102%);transition:.2s;box-shadow:6px 0 20px #0004}.app.open nav#nav{transform:none}.app.open .scrim{display:block;position:absolute;inset:56px 0 0;background:#0006;z-index:7}aside#toc{display:none}.mtoc{display:block}.logo .lt span{display:none}.body .tright,.body .tleft,.body .mw-halign-right,.body .mw-halign-left{float:none;max-width:100%;margin:10px 0}}';

function shell() {
  var hm = rj({ t: 'home' });
  return '<div class="app" data-t="light">' + SPR + '<header><button class="ib" data-act="nav" aria-label="Menu">' + ic('menu', 24) + '</button><a class="logo" href="#" data-r="' + hm + '">' + ic('logo', 28) + '<span class="lt"><b>BD</b><span>StudyMaterial</span></span></a>' +
    '<div class="sb"><input id="q" placeholder="Search TheoGo… (Ctrl+K)" autocomplete="off" autocapitalize="off" spellcheck="false"><div class="sg" id="sg" hidden></div></div><button class="ib" data-act="theme" title="Dark / light" aria-label="Toggle theme">' + ic('theme', 24) + '</button></header><div class="pb"></div>' +
    '<div class="wrap"><nav id="nav"><a class="ni" href="#" data-r="' + hm + '">' + ic('home') + ' Home</a><div class="nh">Subjects</div>' +
    CATS.map(function (c) { return '<a class="ni" href="#" data-r="' + rj({ t: 'cat', a: c.id, k: 0, tok: '', st: [] }) + '">' + ic(c.i, 20) + ' ' + c.n + '</a>'; }).join('') +
    '<div class="nh">Explore</div><button class="ni" data-act="random">' + ic('dice') + ' Random article</button><a class="ni" href="#" data-r="' + rj({ t: 'recent' }) + '">' + ic('clock') + ' Recently viewed</a><button class="ni" data-act="pal">' + ic('search') + ' Search (Ctrl+K)</button>' +
    '<div class="nh">TheoGo</div><a class="ni" target="_blank" rel="noopener" href="' + C.origin + '">' + ic('globe') + ' Open TheoGo ↗</a><button class="ni" data-act="diag">' + ic('flask') + ' API status</button>' +
    '<div class="navbot"><button class="com" data-act="com">' + ic('chat', 22) + ' Communicate</button></div></nav>' +
    '<main id="main"></main><aside id="toc"></aside></div><div class="scrim" data-act="nav"></div>' +
    '<div class="ov" id="pal" hidden><div class="pbx"><input id="pq" placeholder="Search articles…" autocomplete="off" spellcheck="false"><div class="sg" id="psg" hidden></div><div id="pact"><button class="bt" data-act="home">Home</button><button class="bt" data-act="random">Random article</button><a class="bt" href="#" data-r="' + rj({ t: 'recent' }) + '">Recently viewed</a></div></div></div>' +
    '<div id="lb" hidden></div><div class="ov" id="dg" hidden><div class="pbx"></div></div></div>';
}

function start() {
  host = document.createElement('div'); host.id = 'bds-portal'; host.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483000;display:block;background:#fff';
  R = host.attachShadow({ mode: 'open' }); R.innerHTML = '<style>' + CSS + '</style>' + shell();
  (document.body || document.documentElement).appendChild(host);
  ret = document.createElement('div'); ret.style.cssText = 'all:initial;position:fixed;left:14px;bottom:14px;z-index:2147482999;display:none';
  var rs = ret.attachShadow({ mode: 'open' }); rs.innerHTML = SPR + '<style>button{all:unset;cursor:pointer;display:inline-flex;gap:7px;align-items:center;background:#144097;color:#fff;font:600 13px Inter,Arial,sans-serif;padding:10px 14px;border-radius:999px;box-shadow:0 6px 18px #0005}@media(max-width:900px){button{margin-bottom:68px}}</style><button title="Back to BDStudyMaterial">' + ic('logo', 18) + ' Portal</button>';
  rs.querySelector('button').onclick = show; (document.body || document.documentElement).appendChild(ret);
  var th = ls('bds_theme'); if (th === 'dark') $('.app').dataset.t = 'dark';
  sug($('#q'), $('#sg')); sug($('#pq'), $('#psg'), function () { pal(false); });

  R.addEventListener('click', function (e) {
    var t = e.target, im = t.closest && t.closest('.body img');
    if (im) { e.preventDefault(); var a = im.closest('a'); lb(im, a && a.href !== location.href + '#' ? a.href : null); return; }
    var el = t.closest('[data-r]'); if (el) { e.preventDefault(); pal(false); nav(JSON.parse(el.dataset.r)); return; }
    var an = t.closest('[data-anc]'); if (an) { e.preventDefault(); jump(an.dataset.anc); return; }
    var ac = t.closest('[data-act]'); if (ac) {
      var x = ac.dataset.act; e.preventDefault();
      if (x === 'com') hide();
      else if (x === 'nav') $('.app').classList.toggle('open');
      else if (x === 'theme') { var A = $('.app'); A.dataset.t = A.dataset.t === 'dark' ? 'light' : 'dark'; ls('bds_theme', A.dataset.t); }
      else if (x === 'random') { pal(false); $('.pb').classList.add('on'); api({ action: 'query', list: 'random', rnnamespace: 0, rnlimit: 1 }, -1).then(function (d) { nav({ t: 'article', a: d.query.random[0].title, st: [] }); }).catch(function (er) { fail(er, tok); }); }
      else if (x === 'pal') pal(true);
      else if (x === 'home') { pal(false); nav({ t: 'home' }); }
      else if (x === 'back') back();
      else if (x === 'retry') render();
      else if (x === 'diag') diag();
      else if (x === 'dgx') $('#dg').hidden = true;
      else if (x === 'lbx') $('#lb').hidden = true;
      else if (x === 'clr') { ls('bds_recent', []); render(); }
      else if (x === 'copy') { var u = location.origin + location.pathname + '?bds=' + encodeURIComponent(ac.dataset.t); (navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(function () { ac.textContent = '✓ Copied'; }).catch(function () { window.prompt('Copy this link:', u); }); }
      return;
    }
    if (t.classList && t.classList.contains('ov')) t.hidden = true;
    if (t.id === 'lb') t.hidden = true;
  });
  window.addEventListener('keydown', function (e) {
    if (!vis) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); e.stopImmediatePropagation(); pal(true); return; }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey) e.stopImmediatePropagation(); /* keep JustGo shortcuts from firing under the portal */
    if (e.key === 'Escape') { pal(false); $('#lb').hidden = true; $('#dg').hidden = true; $('.app').classList.remove('open'); }
  }, true);

  var qs = new URLSearchParams(location.search), a = qs.get('bds'), s = qs.get('bdsq');
  nav(a ? { t: 'article', a: a, st: [] } : s ? { t: 'search', a: s, tok: '', st: [] } : { t: 'home' }, true);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { if (vis) setInert(true); }); else setInert(true);
  window.BDStudy = { show: show, hide: hide, open: function (t) { nav({ t: 'article', a: t, st: [] }); }, search: function (q) { nav({ t: 'search', a: q, tok: '', st: [] }); }, test: diag };
}
start();
})();
