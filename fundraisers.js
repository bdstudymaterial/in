/* =========================================================================
   JustGo — fundraisers.js (v2)
   Rich contribute dialog + improved progress display.
   Uses the same `group_fundraisers` / `fundraiser_contributions` tables.

   v2 fixes:
     • Never touches window.db directly before it exists.
     • Fallback alert via JGAlert, or window.alert.
     • Works even if opened from a message before the app is fully booted.
   ========================================================================= */
(function () {
  "use strict";
  if (window.JustGoFundraisers && window.JustGoFundraisers.__v2) return;

  var esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c];
    });
  };
  var $ = function (s, r) { return (r || document).querySelector(s); };

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
  function currentUser() { return window.currentUser || null; }
  function toast(msg, type) {
    if (typeof window.showToast === "function") window.showToast(msg, type);
    else console.log("[fundraiser]", msg);
  }
  function alertAsync(opts) {
    if (typeof window.JGAlert === "function") return window.JGAlert(opts);
    return Promise.resolve(window.alert(opts.title || opts.body || ""));
  }

  function feePct() {
    if (window.isPremium && window.isPremium()) {
      return Number((window.platformSettings && window.platformSettings.premium_discount_fee_pct) || 0.5);
    }
    return Number((window.platformSettings && window.platformSettings.transaction_fee_pct) || 1);
  }

  function openContributeModal(fr) {
    if (!fr || !fr.id) return;
    var goal = Number(fr.goal_amount || 0);
    var raised = Number(fr.raised_amount || 0);
    var pct = goal > 0 ? Math.min(100, Math.round((raised / goal) * 100)) : 0;

    var wrap = document.createElement("div");
    wrap.className = "jg-dialog-backdrop";
    wrap.innerHTML =
      '<div class="jg-dialog jg-dialog-wide" role="dialog">' +
        '<div class="jg-dialog-title">' + esc(fr.title || "Fundraiser") + '</div>' +
        '<div class="jg-dialog-body">' +
          '<div class="fr-progress-lg">' +
            '<div class="fr-progress-track"><div class="fr-progress-fill" style="width:' + pct + '%"></div></div>' +
            '<div class="fr-progress-meta"><strong>₹' + raised.toFixed(2) + '</strong><span>of ₹' + goal.toFixed(2) + ' (' + pct + '%)</span></div>' +
          '</div>' +
          (fr.description ? '<div class="fr-desc">' + esc(fr.description) + '</div>' : '') +
          '<div class="jg-field"><label>Amount (₹)</label><input id="frAmount" type="number" min="1" step="1" placeholder="0"></div>' +
          '<div class="jg-quick-amounts" id="frQuick">' +
            '<button type="button" data-amt="50">50</button>' +
            '<button type="button" data-amt="100">100</button>' +
            '<button type="button" data-amt="200">200</button>' +
            '<button type="button" data-amt="500">500</button>' +
          '</div>' +
          '<div class="jg-field"><label>Message (optional)</label><input id="frNote" maxlength="120" type="text"></div>' +
          '<label class="jg-check"><input type="checkbox" id="frAnon"> Contribute anonymously</label>' +
          '<div id="frFeePreview" class="fr-fee-preview hidden"></div>' +
        '</div>' +
        '<div class="jg-dialog-actions">' +
          '<button type="button" class="jg-dialog-btn" data-act="cancel">Cancel</button>' +
          '<button type="button" class="jg-dialog-btn primary" data-act="ok">Contribute</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(wrap);
    wrap.addEventListener("click", function (e) { if (e.target === wrap) wrap.remove(); });
    $('[data-act="cancel"]', wrap).addEventListener("click", function () { wrap.remove(); });

    var amtEl = $("#frAmount", wrap);
    var feeEl = $("#frFeePreview", wrap);
    function update() {
      var a = parseFloat(amtEl.value || 0);
      if (!a) { feeEl.classList.add("hidden"); return; }
      var p = feePct();
      var fee = Math.round(a * p) / 100;
      feeEl.classList.remove("hidden");
      feeEl.innerHTML =
        '<div><span>Amount</span><strong>₹' + a.toFixed(2) + '</strong></div>' +
        '<div><span>Fee (' + p + '%)</span><strong>+₹' + fee.toFixed(2) + '</strong></div>' +
        '<div class="total"><span>You pay</span><strong>₹' + (a + fee).toFixed(2) + '</strong></div>';
    }
    amtEl.addEventListener("input", update);
    Array.prototype.forEach.call(wrap.querySelectorAll("[data-amt]"), function (b) {
      b.addEventListener("click", function () { amtEl.value = b.dataset.amt; update(); });
    });

    $('[data-act="ok"]', wrap).addEventListener("click", async function () {
      var u = currentUser();
      if (!u) { alertAsync({ title: "Not signed in", body: "Try again in a moment." }); return; }
      var amount = parseFloat(amtEl.value || 0);
      if (!(amount >= 1)) { alertAsync({ title: "Invalid amount", body: "Enter at least ₹1." }); return; }
      var note = $("#frNote", wrap).value.trim();
      var anon = $("#frAnon", wrap).checked;
      var btn = $('[data-act="ok"]', wrap);
      btn.disabled = true; btn.textContent = "Sending…";

      var client = await db();
      if (!client) { btn.disabled = false; btn.textContent = "Contribute"; return; }

      try {
        var idem = "fr_" + fr.id + "_" + Date.now();
        var r = await client.rpc("send_money", {
          p_to_user: fr.created_by, p_amount: amount,
          p_note: "Fundraiser: " + (fr.title || ""),
          p_idempotency_key: idem,
          p_conversation_id: fr.conversation_id || null
        });
        if (r.error) throw r.error;
        await client.from("fundraiser_contributions").insert({
          fundraiser_id: fr.id, contributor_id: u.id,
          amount: amount, note: note || null, is_anonymous: anon,
          transaction_id: (r.data && r.data.transaction_id) || null
        });
        try {
          await client.rpc("increment_fundraiser_raised", { p_fundraiser_id: fr.id, p_amount: amount });
        } catch (e) {
          var cs = await client.from("fundraiser_contributions").select("amount").eq("fundraiser_id", fr.id);
          var tot = (cs.data || []).reduce(function (s, c) { return s + Number(c.amount || 0); }, 0);
          await client.from("group_fundraisers")
            .update({ raised_amount: tot, updated_at: new Date().toISOString() })
            .eq("id", fr.id);
        }
        toast("Thank you!", "success");
        wrap.remove();
        if (typeof window.loadMessages === "function") window.loadMessages();
        if (typeof window.refreshWalletData === "function") window.refreshWalletData();
      } catch (e) {
        btn.disabled = false; btn.textContent = "Contribute";
        alertAsync({ title: "Could not contribute", body: (e && e.message) || String(e) });
      }
    });
  }

  window.JustGoFundraisers = { openContributeModal: openContributeModal, __v2: true };
})();