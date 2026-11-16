/* wiki-cover.js — fake TheoGO wiki article shown first on JustGo.
   Click ANY link / button / menu item on it -> cover closes -> real index.html app shows.
   Skipped for deep links (?u=, invite links etc.) and once opened in the same tab session. */
(function () {
  "use strict";

  // ---- when NOT to show ----
  try {
    if (location.search && /[?&](u|join|invite|g|pay|book|ref)=/i.test(location.search)) return;
    if (sessionStorage.getItem("jg_cover_seen") === "1") return;
  } catch (e) {}

  var css = '\
#wikiCover{position:fixed;inset:0;z-index:10000;overflow:auto;background:#fff;color:#202122;\
font-family:-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;font-size:15px;line-height:1.6;\
transition:opacity .3s ease,visibility .3s ease;-webkit-overflow-scrolling:touch}\
#wikiCover.out{opacity:0;visibility:hidden;pointer-events:none}\
#wikiCover a{color:#0645ad;text-decoration:none;cursor:pointer}\
#wikiCover a:hover{text-decoration:underline}\
#wikiCover a.new{color:#ba0000}\
#wikiCover .wc-top{position:sticky;top:0;z-index:5;background:#f8f9fa;border-bottom:1px solid #a2a9b1;\
display:flex;align-items:center;gap:6px;padding:8px 12px;flex-wrap:wrap}\
#wikiCover .wc-logo{display:flex;align-items:center;gap:8px;margin-right:8px;font-weight:700;font-size:18px;color:#202122;cursor:pointer}\
#wikiCover .wc-logo img{width:30px;height:30px;object-fit:contain}\
#wikiCover .wc-nav{display:flex;gap:2px;flex-wrap:wrap}\
#wikiCover .wc-nav a{padding:6px 10px;border-radius:4px;font-size:14px}\
#wikiCover .wc-nav a:hover{background:#eaecf0;text-decoration:none}\
#wikiCover .wc-search{margin-left:auto;display:flex;gap:4px}\
#wikiCover .wc-search input{width:190px;max-width:42vw;padding:6px 10px;border:1px solid #a2a9b1;border-radius:3px;font-size:14px;background:#fff;color:#202122}\
#wikiCover .wc-search button,#wikiCover .wc-btn{border:1px solid #a2a9b1;background:#f8f9fa;color:#202122;border-radius:3px;\
padding:6px 12px;font-size:13.5px;cursor:pointer;font-family:inherit}\
#wikiCover .wc-search button:hover,#wikiCover .wc-btn:hover{background:#eaecf0}\
#wikiCover .wc-btn.pri{background:#36c;border-color:#36c;color:#fff}\
#wikiCover .wc-btn.pri:hover{background:#2a4b8d}\
#wikiCover .wc-user{display:flex;gap:10px;font-size:13px}\
#wikiCover .wc-wrap{max-width:1040px;margin:0 auto;padding:18px 18px 40px;display:flex;gap:26px;align-items:flex-start}\
#wikiCover .wc-side{width:170px;flex-shrink:0;font-size:13.5px}\
#wikiCover .wc-side h4{margin:14px 0 4px;font-size:12px;color:#54595d;text-transform:uppercase;letter-spacing:.4px}\
#wikiCover .wc-side a{display:block;padding:2px 0}\
#wikiCover .wc-main{flex:1;min-width:0}\
#wikiCover .wc-tabs{display:flex;gap:4px;border-bottom:1px solid #a2a9b1;margin-bottom:12px;font-size:13.5px;flex-wrap:wrap}\
#wikiCover .wc-tabs a{padding:6px 12px;border:1px solid transparent;border-bottom:0}\
#wikiCover .wc-tabs a.on{background:#fff;border-color:#a2a9b1;font-weight:600;color:#202122;margin-bottom:-1px}\
#wikiCover .wc-tabs .r{margin-left:auto}\
#wikiCover h1{font-family:Georgia,"Linux Libertine",serif;font-weight:400;font-size:30px;margin:0 0 2px;border-bottom:1px solid #a2a9b1;padding-bottom:4px}\
#wikiCover h2{font-family:Georgia,"Linux Libertine",serif;font-weight:400;font-size:22px;margin:22px 0 8px;border-bottom:1px solid #a2a9b1;padding-bottom:3px}\
#wikiCover h2 .ed,#wikiCover h3 .ed{font-family:sans-serif;font-size:12px;margin-left:8px;color:#54595d}\
#wikiCover h3{font-size:17px;margin:16px 0 4px}\
#wikiCover .sub{font-size:12.5px;color:#54595d;margin-bottom:10px}\
#wikiCover .info{float:right;width:250px;margin:0 0 12px 18px;border:1px solid #a2a9b1;background:#f8f9fa;font-size:13px;padding:6px}\
#wikiCover .info .t{background:#cedff2;text-align:center;font-weight:700;padding:5px;margin:-6px -6px 6px}\
#wikiCover .info table{width:100%;border-collapse:collapse}\
#wikiCover .info td{padding:3px 4px;vertical-align:top}\
#wikiCover .info td:first-child{font-weight:600;width:42%}\
#wikiCover .toc{display:inline-block;border:1px solid #a2a9b1;background:#f8f9fa;padding:8px 16px 8px 12px;margin:8px 0;font-size:13.5px}\
#wikiCover .toc ol{margin:4px 0 0;padding-left:20px}\
#wikiCover .hat{font-style:italic;padding-left:22px;font-size:14px;margin:4px 0 8px}\
#wikiCover .box{border:1px solid #a2a9b1;border-left:10px solid #36c;background:#f8f9fa;padding:8px 12px;margin:14px 0;font-size:14px;display:flex;gap:12px;align-items:center;flex-wrap:wrap}\
#wikiCover .box.warn{border-left-color:#fc3;background:#fef6e7}\
#wikiCover sup a{font-size:11px}\
#wikiCover .quote{border-left:3px solid #a2a9b1;margin:10px 0 10px 18px;padding-left:12px;color:#404244;font-style:italic}\
#wikiCover .refs{font-size:13px;padding-left:22px}\
#wikiCover .cat{border:1px solid #a2a9b1;background:#f8f9fa;padding:6px 10px;margin-top:24px;font-size:13px}\
#wikiCover .foot{border-top:1px solid #a2a9b1;margin-top:24px;padding-top:12px;font-size:12.5px;color:#54595d;display:flex;gap:14px;flex-wrap:wrap}\
#wikiCover .float-edit{position:fixed;right:14px;bottom:14px;z-index:6;display:flex;flex-direction:column;gap:8px}\
#wikiCover .float-edit .wc-btn{box-shadow:0 2px 8px rgba(0,0,0,.18);border-radius:20px;padding:8px 16px}\
@media(max-width:760px){#wikiCover .wc-side{display:none}#wikiCover .info{float:none;width:auto;margin:0 0 12px}#wikiCover .wc-wrap{padding:12px}#wikiCover .wc-user{display:none}#wikiCover h1{font-size:24px}}\
@media(prefers-color-scheme:dark){#wikiCover{background:#101418;color:#eaecf0}#wikiCover a{color:#6b9eff}#wikiCover a.new{color:#ff7b7b}\
#wikiCover .wc-top,#wikiCover .info,#wikiCover .toc,#wikiCover .box,#wikiCover .cat{background:#1a1f26;border-color:#3a424d}\
#wikiCover .info .t{background:#27456f}#wikiCover .wc-logo{color:#eaecf0}#wikiCover .wc-nav a:hover{background:#27303a}\
#wikiCover .wc-search input{background:#101418;color:#eaecf0;border-color:#3a424d}\
#wikiCover .wc-search button,#wikiCover .wc-btn{background:#1a1f26;color:#eaecf0;border-color:#3a424d}\
#wikiCover .wc-btn.pri{background:#36c;color:#fff}#wikiCover .box.warn{background:#2b2512}\
#wikiCover h1,#wikiCover h2,#wikiCover .wc-tabs,#wikiCover .foot{border-color:#3a424d}#wikiCover .wc-tabs a.on{background:#101418;border-color:#3a424d;color:#eaecf0}\
#wikiCover .quote,#wikiCover .sub,#wikiCover .foot,#wikiCover .wc-side h4{color:#a8b0bb}}';

  var html = '\
<div class="wc-top">\
  <a class="wc-logo" data-go><img src="https://static.wikitide.net/theogowiki/5/5d/TG.png" alt="" onerror="this.style.display=\'none\'"><span>TheoGO</span></a>\
  <nav class="wc-nav">\
    <a data-go>Main page</a><a data-go>Contents</a><a data-go>Recent changes</a><a data-go>Random page</a><a data-go>Community portal</a><a data-go>Help</a>\
  </nav>\
  <form class="wc-search" data-go-form><input type="search" placeholder="Search TheoGO" aria-label="Search"><button type="submit">Search</button></form>\
  <div class="wc-user"><a data-go>Log in</a><a data-go>Create account</a></div>\
</div>\
<div class="wc-wrap">\
  <aside class="wc-side">\
    <h4>Navigation</h4><a data-go>Main page</a><a data-go>Contents</a><a data-go>Featured articles</a><a data-go>Random article</a>\
    <h4>Browse</h4><a data-go>Old Testament</a><a data-go>New Testament</a><a data-go>Church history</a><a data-go>Systematic theology</a><a data-go>Missiology</a><a data-go>Christian ethics</a><a data-go>Biblical languages</a>\
    <h4>Contribute</h4><a data-go>Help</a><a data-go>Learn to edit</a><a data-go>Recent changes</a><a data-go>Upload file</a>\
    <h4>Tools</h4><a data-go>What links here</a><a data-go>Special pages</a><a data-go>Printable version</a><a data-go>Page information</a><a data-go>Cite this page</a>\
  </aside>\
  <main class="wc-main">\
    <div class="wc-tabs"><a class="on" data-go>Article</a><a data-go>Talk</a><a class="r" data-go>Read</a><a data-go>Edit</a><a data-go>View history</a><a data-go>&#9734;</a></div>\
    <h1>Christian theology</h1>\
    <div class="sub">From TheoGO, the student-built theological knowledge base</div>\
    <div class="hat">&ldquo;Theology&rdquo; redirects here. For other uses, see <a data-go>Theology (disambiguation)</a>.</div>\
    <div class="box warn"><span>This article needs additional citations from student contributors. Please help by adding sources.</span><button class="wc-btn" data-go>Improve this article</button></div>\
    <div class="info">\
      <div class="t">Christian theology</div>\
      <table>\
        <tr><td>Subject</td><td>Study of God &amp; revelation in Christ</td></tr>\
        <tr><td>Sources</td><td><a data-go>Scripture</a>, <a data-go>Tradition</a>, reason</td></tr>\
        <tr><td>Major branches</td><td><a data-go>Biblical</a>, <a data-go>Systematic</a>, <a data-go>Historical</a>, <a data-go>Practical</a></td></tr>\
        <tr><td>Key creeds</td><td><a data-go>Apostles&rsquo;</a>, <a data-go>Nicene</a></td></tr>\
        <tr><td>Traditions</td><td>Catholic, Orthodox, Protestant, Pentecostal</td></tr>\
      </table>\
      <div style="text-align:center;margin-top:8px"><button class="wc-btn" data-go>Download as PDF</button></div>\
    </div>\
    <p><b>Christian theology</b> is the systematic study of Christian belief and practice. It concentrates primarily upon the texts of the <a data-go>Old Testament</a> and <a data-go>New Testament</a>, as well as on <a data-go>Christian tradition</a>.<sup><a data-go>[1]</a></sup> Christian theologians use biblical exegesis, rational analysis and argument to help understand, explain, test, critique, defend or promote any of many topics related to Christianity.<sup><a data-go>[2]</a></sup> <button class="wc-btn" data-go style="padding:1px 8px;font-size:12px">Edit</button></p>\
    <p>Theology typically undertakes to understand the nature and revealed will of God, to help people relate to God, and to defend Christianity against objections and criticism.<sup><a data-go>[3]</a></sup></p>\
    <div class="toc"><strong>Contents</strong><ol>\
      <li><a data-go>Etymology and scope</a></li><li><a data-go>Sources of theology</a></li><li><a data-go>The doctrine of God</a><ol><li><a data-go>The Trinity</a></li><li><a data-go>Attributes of God</a></li></ol></li>\
      <li><a data-go>Christology</a></li><li><a data-go>Soteriology</a></li><li><a data-go>Ecclesiology</a></li><li><a data-go>Eschatology</a></li><li><a data-go>See also</a></li><li><a data-go>References</a></li></ol></div>\
    <h2>Etymology and scope<span class="ed">[<a data-go>edit</a>]</span></h2>\
    <p>The word <i>theology</i> derives from the Greek <i>theos</i> (God) and <i>logos</i> (word or reason). Early writers such as <a data-go>Origen</a> and <a data-go>Augustine of Hippo</a> shaped how the church reasoned about its faith, and the medieval scholastics, notably <a data-go>Thomas Aquinas</a>, built vast systems on that foundation.<sup><a data-go>[4]</a></sup></p>\
    <h2>Sources of theology<span class="ed">[<a data-go>edit</a>]</span></h2>\
    <p>Most traditions draw on <a data-go>Scripture</a>, <a data-go>tradition</a>, reason and experience. The Reformation emphasised <i>sola scriptura</i>, while Catholic and Orthodox thought gives greater weight to the councils and the Fathers.<sup><a data-go>[5]</a></sup></p>\
    <div class="quote">&ldquo;Faith seeking understanding.&rdquo; &mdash; <a data-go>Anselm of Canterbury</a></div>\
    <h2>The doctrine of God<span class="ed">[<a data-go>edit</a>]</span></h2>\
    <h3>The Trinity<span class="ed">[<a data-go>edit</a>]</span></h3>\
    <p>Christians confess one God in three persons: Father, Son and Holy Spirit. The doctrine was articulated at the <a data-go>Council of Nicaea</a> (325) and the <a data-go>Council of Constantinople</a> (381). <a data-go>Read more about the Trinity &rarr;</a></p>\
    <h3>Attributes of God<span class="ed">[<a data-go>edit</a>]</span></h3>\
    <p>Classical theism ascribes omnipotence, omniscience, immutability and holiness to God, alongside love and justice as expressed in the biblical narrative.<sup><a data-go>[6]</a></sup></p>\
    <div class="box"><span><b>Study this topic.</b> Join classmates in the discussion and share notes.</span><button class="wc-btn pri" data-go>Join the discussion</button><button class="wc-btn" data-go>Subscribe</button></div>\
    <h2>Christology<span class="ed">[<a data-go>edit</a>]</span></h2>\
    <p>Christology examines the person and work of <a data-go>Jesus Christ</a>. The <a data-go>Council of Chalcedon</a> (451) affirmed that Christ is fully God and fully man in one person, a formula that remains normative for most churches.<sup><a data-go>[7]</a></sup></p>\
    <h2>Soteriology<span class="ed">[<a data-go>edit</a>]</span></h2>\
    <p>Soteriology concerns salvation: grace, faith, justification and sanctification. Debates between <a data-go>Calvinism</a> and <a data-go>Arminianism</a> and between Catholic and Protestant views on justification have shaped much of church history.<sup><a data-go>[8]</a></sup> <button class="wc-btn" data-go style="padding:1px 8px;font-size:12px">Watch</button></p>\
    <h2>Ecclesiology<span class="ed">[<a data-go>edit</a>]</span></h2>\
    <p>The doctrine of the church asks what the church is, how it is governed, and what its sacraments or ordinances mean. See also <a data-go>Missiology</a> and <a data-go>Pentecostal theology</a>.</p>\
    <h2>Eschatology<span class="ed">[<a data-go>edit</a>]</span></h2>\
    <p>Eschatology treats the &ldquo;last things&rdquo;: death, judgment, resurrection and the renewal of creation. Millennial views (amillennial, premillennial, postmillennial) differ over the timing of Christ&rsquo;s return.<sup><a data-go>[9]</a></sup></p>\
    <div class="box warn"><span>Have a question or a correction? Ask the TheoGO community.</span><button class="wc-btn" data-go>Ask a question</button><button class="wc-btn" data-go>Donate</button></div>\
    <h2>See also<span class="ed">[<a data-go>edit</a>]</span></h2>\
    <ul><li><a data-go>Biblical Hebrew</a></li><li><a data-go>Koine Greek</a></li><li><a data-go>Apostle Paul</a></li><li><a data-go>Old Testament prophets</a></li><li><a data-go>Science and religion</a></li><li><a class="new" data-go>Christian apologetics</a></li></ul>\
    <h2>References<span class="ed">[<a data-go>edit</a>]</span></h2>\
    <ol class="refs">\
      <li><a data-go>&uarr;</a> McGrath, Alister. <i>Christian Theology: An Introduction.</i> Wiley-Blackwell.</li>\
      <li><a data-go>&uarr;</a> Grudem, Wayne. <i>Systematic Theology.</i> Zondervan.</li>\
      <li><a data-go>&uarr;</a> Erickson, Millard. <i>Christian Theology.</i> Baker Academic.</li>\
      <li><a data-go>&uarr;</a> Olson, Roger. <i>The Story of Christian Theology.</i> IVP Academic.</li>\
      <li><a data-go>&uarr;</a> Bettenson, Henry (ed.). <i>Documents of the Christian Church.</i> Oxford.</li>\
      <li><a data-go>&uarr;</a> Bavinck, Herman. <i>Reformed Dogmatics.</i> Baker Academic.</li>\
      <li><a data-go>&uarr;</a> Kelly, J.N.D. <i>Early Christian Doctrines.</i> Continuum.</li>\
      <li><a data-go>&uarr;</a> Pelikan, Jaroslav. <i>The Christian Tradition.</i> Univ. of Chicago Press.</li>\
      <li><a data-go>&uarr;</a> Moltmann, J&uuml;rgen. <i>The Coming of God.</i> Fortress Press.</li>\
    </ol>\
    <div class="cat"><b>Categories:</b> <a data-go>Christian theology</a> | <a data-go>Biblical studies</a> | <a data-go>Church history</a> | <a data-go>TheoGO featured</a></div>\
    <div class="foot"><span>This page was last edited recently.</span><a data-go>Privacy policy</a><a data-go>About TheoGO</a><a data-go>Disclaimers</a><a data-go>Contact</a><a data-go>Mobile view</a></div>\
  </main>\
</div>\
<div class="float-edit"><button class="wc-btn pri" data-go>&#9998; Edit</button><button class="wc-btn" data-go>Random page</button></div>';

  var cover;

  function dismiss(e) {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    try { sessionStorage.setItem("jg_cover_seen", "1"); } catch (x) {}
    if (!cover) return;
    cover.classList.add("out");
    document.documentElement.style.overflow = "";
    setTimeout(function () { if (cover && cover.parentNode) cover.parentNode.removeChild(cover); cover = null; }, 350);
  }

  function build() {
    var st = document.createElement("style");
    st.id = "wikiCoverCss";
    st.textContent = css;
    (document.head || document.documentElement).appendChild(st);

    cover = document.createElement("div");
    cover.id = "wikiCover";
    cover.setAttribute("role", "document");
    cover.innerHTML = html;
    document.documentElement.appendChild(cover);
    document.documentElement.style.overflow = "hidden";

    // any link / button / menu item (marked data-go, or a plain <a>/<button>) opens the real app
    cover.addEventListener("click", function (e) {
      var t = e.target;
      while (t && t !== cover) {
        if (t.hasAttribute && t.hasAttribute("data-go")) return dismiss(e);
        if (t.tagName === "A" || t.tagName === "BUTTON") return dismiss(e);
        t = t.parentNode;
      }
    }, true);

    var f = cover.querySelector("[data-go-form]");
    if (f) f.addEventListener("submit", dismiss);
  }

  if (document.documentElement) build();
  else document.addEventListener("DOMContentLoaded", build);

  window.JustGoWikiCover = { close: dismiss };
})();
