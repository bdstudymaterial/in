/* =========================================================================
   JustGo — my-data.js (v2)
   Richer "My Data" page.
   ========================================================================= */
(function () {
  "use strict";
  if (window.openMyDataModal && window.openMyDataModal.__v2) return;

  var esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c];
    });
  };
  function getDb() {
    if (window.db && typeof window.db.from === "function") return window.db;
    return null;
  }
  function waitForDb() {
    return new Promise(function (resolve) {
      if (getDb()) return resolve(getDb());
      var tries = 0;
      var iv = setInterval(function () {
        tries++;
        if (getDb()) { clearInterval(iv); resolve(getDb()); }
        else if (tries > 100) { clearInterval(iv); resolve(null); }
      }, 100);
    });
  }
  async function db() {
    var d = getDb();
    if (d) return d;
    return waitForDb();
  }

  async function openMyDataModal() {
    var old = document.getElementById("myDataModal");
    if (old) old.remove();
    var wrap = document.createElement("div");
    wrap.id = "myDataModal";
    wrap.className = "modal show";
    wrap.innerHTML =
      '<div class="modal-card wide" style="max-width:680px">' +
        '<div class="modal-head"><strong>My data</strong><button class="modal-close" type="button" id="myDataClose">×</button></div>' +
        '<div class="modal-body" id="myDataBody"><div class="search-empty">Loading…</div></div>' +
      '</div>';
    document.body.appendChild(wrap);
    document.getElementById("myDataClose").addEventListener("click", function () { wrap.remove(); });
    wrap.addEventListener("click", function (e) { if (e.target === wrap) wrap.remove(); });

    var body = document.getElementById("myDataBody");
    var client = await db();
    var u = window.currentUser || null;
    if (!client || !u) {
      body.innerHTML = '<div class="search-empty">Still loading. Please try again in a moment.</div>';
      return;
    }
    try {
      var results = await Promise.all([
        client.from("messages").select("id,created_at,content").eq("sender_id", u.id),
        client.from("conversation_participants").select("conversation_id").eq("user_id", u.id),
        client.rpc("get_my_wallet"),
        client.from("user_premium").select("started_at,expires_at,amount_paid,is_active").eq("user_id", u.id),
        client.from("admin_wallet_adjustments").select("amount,direction").eq("user_id", u.id)
      ]);
      var sent = results[0].data || [];
      var convs = results[1].data || [];
      var wallet = (results[2].data && results[2].data.wallet) || {};
      var balance = Number(wallet.balance || 0);
      var premium = (results[3].data || []).filter(function (p) {
        return p.is_active && new Date(p.expires_at) > new Date();
      });
      var adjusts = results[4].data || [];

      var hours = new Array(24).fill(0);
      var days = new Array(7).fill(0);
      var months = {};
      sent.forEach(function (m) {
        var d = new Date(m.created_at);
        hours[d.getHours()]++;
        days[d.getDay()]++;
        var k = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
        months[k] = (months[k] || 0) + 1;
      });
      var maxHour = Math.max(1, Math.max.apply(null, hours));
      var maxDay = Math.max(1, Math.max.apply(null, days));
      var peakHour = hours.indexOf(Math.max.apply(null, hours));
      var peakDay = days.indexOf(Math.max.apply(null, days));
      var dayNames = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
      var totalChars = sent.reduce(function (a, m) { return a + (m.content || "").length; }, 0);
      var thisMonthKey = new Date().getFullYear() + "-" + String(new Date().getMonth() + 1).padStart(2, "0");
      var thisMonthMsgs = months[thisMonthKey] || 0;
      var creditTotal = adjusts.filter(function (a) { return a.direction === "credit"; })
        .reduce(function (s, a) { return s + Number(a.amount || 0); }, 0);
      var debitTotal = adjusts.filter(function (a) { return a.direction === "debit"; })
        .reduce(function (s, a) { return s + Number(a.amount || 0); }, 0);

      body.innerHTML =
        '<div class="md-section"><div class="md-section-title">At a glance</div><div class="md-grid">' +
          '<div class="md-card"><div class="md-k">Messages sent</div><div class="md-v">' + sent.length + '</div></div>' +
          '<div class="md-card"><div class="md-k">Characters typed</div><div class="md-v">' + totalChars.toLocaleString() + '</div></div>' +
          '<div class="md-card"><div class="md-k">Conversations</div><div class="md-v">' + convs.length + '</div></div>' +
          '<div class="md-card"><div class="md-k">Wallet balance</div><div class="md-v">₹' + balance.toFixed(2) + '</div></div>' +
          '<div class="md-card"><div class="md-k">This month</div><div class="md-v">' + thisMonthMsgs + '</div></div>' +
          '<div class="md-card"><div class="md-k">Premium</div><div class="md-v">' + (premium.length ? "Active" : "—") + '</div></div>' +
        '</div></div>' +
        '<div class="md-section"><div class="md-section-title">Active hours</div><div class="md-chart">' +
          hours.map(function (c, h) {
            var pct = Math.round((c / maxHour) * 100);
            return '<div class="md-bar-wrap" title="' + h + ':00 — ' + c + '">' +
              '<div class="md-bar" style="height:' + Math.max(4, pct) + '%"></div>' +
              '<div class="md-bar-x">' + h + '</div>' +
            '</div>';
          }).join("") +
        '</div><div class="md-hint">Peak: <strong>' + peakHour + ':00</strong></div></div>' +
        '<div class="md-section"><div class="md-section-title">Active days</div><div class="md-days">' +
          days.map(function (c, i) {
            return '<div class="md-day"><span>' + dayNames[i] + '</span>' +
              '<div class="md-day-bar"><div style="width:' + Math.round(c / maxDay * 100) + '%"></div></div>' +
              '<strong>' + c + '</strong></div>';
          }).join("") +
        '</div><div class="md-hint">Most active: <strong>' + dayNames[peakDay] + '</strong></div></div>' +
        (premium.length
          ? '<div class="md-section"><div class="md-section-title">Premium</div>' +
              '<div class="md-hint">Active until ' + new Date(premium[0].expires_at).toLocaleDateString() +
              '. Total paid: ₹' + premium.reduce(function (s, p) { return s + Number(p.amount_paid || 0); }, 0).toFixed(2) +
              '</div></div>'
          : "") +
        '<div class="md-section"><div class="md-section-title">Wallet adjustments</div>' +
          '<div class="md-hint">Credits: ₹' + creditTotal.toFixed(2) + ' · Debits: ₹' + debitTotal.toFixed(2) + '</div></div>';
    } catch (e) {
      body.innerHTML = '<div class="search-empty">Could not load: ' + esc((e && e.message) || String(e)) + '</div>';
    }
  }
  openMyDataModal.__v2 = true;
  window.openMyDataModal = openMyDataModal;
})();