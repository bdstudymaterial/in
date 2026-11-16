/* =========================================================================
   JustGo — sidegogogo.js (v3)
   Global search, incoming share modal, "My Data" section.

   Changelog v2 → v3:
     • Global search modal uses skeletons on load.
     • Share modal focus trap + Enter sends + ESC closes.
     • Added My Data view (analytics).
     • Version tag updated.
   ========================================================================= */

/* =========================================================
   GLOBAL SEARCH
   ========================================================= */
let _globalSearchModal = null;
let _globalSearchCache = new Map();
const GLOBAL_SEARCH_CACHE_TTL = 60 * 1000;

function openGlobalSearch() {
  if (!_globalSearchModal) {
    _globalSearchModal = document.createElement("div");
    _globalSearchModal.id = "globalSearchModal";
    _globalSearchModal.className = "modal show";
    _globalSearchModal.innerHTML =
      '<div class="modal-card wide" style="max-width:640px;">' +
        '<div class="modal-head">' +
          '<strong>🔎 Search all chats</strong>' +
          '<button type="button" class="modal-close" data-gs-close>×</button>' +
        '</div>' +
        '<div class="modal-body">' +
          '<div class="gs-wrap">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>' +
            '<input class="global-search-input" type="text" placeholder="Search across every conversation…" autocomplete="off" spellcheck="false">' +
          '</div>' +
          '<div class="gs-results"><div class="gs-empty">Start typing to search.</div></div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(_globalSearchModal);

    const closeBtn = _globalSearchModal.querySelector("[data-gs-close]");
    closeBtn.addEventListener("click", () => closeGlobalSearch());
    _globalSearchModal.addEventListener("click", (e) => {
      if (e.target === _globalSearchModal) closeGlobalSearch();
    });

    const inp = _globalSearchModal.querySelector(".global-search-input");
    const results = _globalSearchModal.querySelector(".gs-results");

    let searchDebounce = null;
    inp.addEventListener("input", () => {
      clearTimeout(searchDebounce);
      const q = inp.value.trim();
      if (q.length < 2) {
        results.innerHTML = '<div class="gs-empty">Type at least 2 characters.</div>';
        return;
      }
      searchDebounce = setTimeout(() => runGlobalSearch(q, results), 220);
    });

    inp.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { e.preventDefault(); closeGlobalSearch(); }
      else if (e.key === "Enter") {
        const first = results.querySelector(".gs-item");
        if (first) first.click();
      }
    });
  }

  const inp = _globalSearchModal.querySelector(".global-search-input");
  const results = _globalSearchModal.querySelector(".gs-results");
  inp.value = "";
  results.innerHTML = '<div class="gs-empty">Start typing to search.</div>';

  _globalSearchModal.classList.add("show");
  _globalSearchModal.classList.remove("hidden");
  setTimeout(() => inp.focus(), 60);
}

function closeGlobalSearch() {
  if (_globalSearchModal) {
    _globalSearchModal.classList.add("hidden");
    _globalSearchModal.classList.remove("show");
  }
}

async function runGlobalSearch(q, container) {
  container.innerHTML = "";
  container.appendChild(renderSkeleton("gs-item", 3));
  try {
    const cacheKey = q.toLowerCase();
    const cached = _globalSearchCache.get(cacheKey);
    if (cached && Date.now() - cached.at < GLOBAL_SEARCH_CACHE_TTL) {
      renderGlobalSearchResults(cached.data, q, container);
      return;
    }

    const { data: mine } = await db.from("conversation_participants").select("conversation_id").eq("user_id", currentUser.id);
    if (!mine || !mine.length) { container.innerHTML = '<div class="gs-empty">No conversations.</div>'; return; }
    const ids = mine.map(r => r.conversation_id);

    const { data, error } = await db.from("messages").select("id, conversation_id, content, created_at, sender_id")
      .in("conversation_id", ids).ilike("content", "%" + q + "%")
      .order("created_at", { ascending: false }).limit(50);
    if (error) throw error;
    if (!data || !data.length) { container.innerHTML = '<div class="gs-empty">No messages found.</div>'; return; }

    const uniqueConvIds = data.map(m => m.conversation_id).filter((v, i, a) => a.indexOf(v) === i);
    const { data: convs } = await db.from("conversations")
      .select("id, is_group, group_name, user_a_id, user_b_id")
      .in("id", uniqueConvIds);

    const convMap = {};
    (convs || []).forEach(c => convMap[c.id] = c);

    const otherUserIds = [];
    (convs || []).forEach(c => {
      if (!c.is_group) {
        const otherId = c.user_a_id === currentUser.id ? c.user_b_id : c.user_a_id;
        if (otherId) otherUserIds.push(otherId);
      }
    });
    const uniqueOtherIds = otherUserIds.filter((v, i, a) => a.indexOf(v) === i);

    const profMap = {};
    if (uniqueOtherIds.length) {
      const { data: profs } = await db.from("profiles")
        .select("id, display_name, username").in("id", uniqueOtherIds);
      (profs || []).forEach(p => profMap[p.id] = p);
    }

    const payload = { messages: data, convMap, profMap };
    _globalSearchCache.set(cacheKey, { at: Date.now(), data: payload });
    renderGlobalSearchResults(payload, q, container);
  } catch (e) {
    container.innerHTML = '<div class="gs-empty">Search failed: ' + escapeHtml(e.message || "unknown") + '</div>';
  }
}

function renderGlobalSearchResults(payload, q, container) {
  const { messages, convMap, profMap } = payload;
  container.innerHTML = "";
  const frag = document.createDocumentFragment();

  messages.forEach(m => {
    const row = document.createElement("div");
    row.className = "gs-item";
    const conv = convMap[m.conversation_id];
    let convName = "Conversation";
    if (conv) {
      if (conv.is_group) convName = conv.group_name || "Group";
      else {
        const otherId = conv.user_a_id === currentUser.id ? conv.user_b_id : conv.user_a_id;
        const p = profMap[otherId];
        convName = p ? (p.display_name || p.username) : "User";
      }
    }
    const who = (conv && conv.is_group ? "👥 " : "💬 ") + escapeHtml(convName);
    const snippet = highlightSnippet(m.content || "", q);
    row.innerHTML =
      '<div class="who">' + who + ' <span style="color:var(--text-faint);">• ' + formatListTime(m.created_at) + '</span></div>' +
      '<div class="txt">' + snippet + '</div>';
    row.addEventListener("click", async () => {
      closeGlobalSearch();
      const { data: fullConv } = await db.from("conversations").select("*").eq("id", m.conversation_id).maybeSingle();
      if (!fullConv) return showToast("Conversation not found.", "error");
      await openConversation(fullConv, null);
    });
    frag.appendChild(row);
  });
  container.appendChild(frag);
}

function highlightSnippet(text, q) {
  const safe = escapeHtml(String(text || "").slice(0, 220));
  if (!q) return safe;
  const esc = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  try {
    return safe.replace(new RegExp("(" + esc + ")", "gi"), "\u0001$1\u0002")
      .replace(/\u0001/g, "<mark>")
      .replace(/\u0002/g, "</mark>");
  } catch (e) {
    return safe;
  }
}

/* =========================================================
   INCOMING SHARE
   ========================================================= */
const _pendingShareQueue = [];
let _shareModalActive = false;

function handleIncomingSearchParam() {
  try {
    const params = new URLSearchParams(window.location.search);
    const shareTitle = params.get("share_title");
    const shareURL = params.get("share_url");
    const shareFrom = params.get("share_from") || "the web";
    if (!shareTitle || !shareURL) return;

    _pendingShareQueue.push({ title: shareTitle, url: shareURL, from: shareFrom });

    if (window.history && window.history.replaceState) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
    if (!_shareModalActive) setTimeout(openShareModal, 350);
  } catch (e) {}
}

function openShareModal() {
  if (!_pendingShareQueue.length) { pendingShare = null; return; }
  const share = _pendingShareQueue[0];
  pendingShare = share;
  _shareModalActive = true;

  const existing = document.getElementById("shareModal");
  if (existing) existing.remove();

  const modal = document.createElement("div");
  modal.id = "shareModal";
  modal.className = "modal show";
  modal.innerHTML =
    '<div class="modal-card">' +
      '<div class="modal-head">' +
        '<strong>📤 Share to JustGo</strong>' +
        '<button type="button" class="modal-close" id="shareModalClose">×</button>' +
      '</div>' +
      '<div class="modal-body">' +
        '<div class="share-preview">' +
          '<div class="share-preview-label">From ' + escapeHtml(share.from) + '</div>' +
          '<div class="share-preview-title">' + escapeHtml(share.title) + '</div>' +
          '<div class="share-preview-url">' + escapeHtml(share.url) + '</div>' +
        '</div>' +
        '<div class="field" style="margin-top:16px;">' +
          '<label for="shareUserSearch">Send to</label>' +
          '<input id="shareUserSearch" type="text" placeholder="Search a classmate" autocomplete="off">' +
        '</div>' +
        '<div id="shareUserResults" class="share-user-results"></div>' +
        '<div id="shareSelectedUser" class="share-selected-user hidden"></div>' +
        '<div class="field" style="margin-top:14px;">' +
          '<label for="shareNote">Add a note (optional)</label>' +
          '<input id="shareNote" type="text" placeholder="Check this out...">' +
        '</div>' +
        '<button id="shareSendBtn" class="auth-submit" type="button" disabled>Send to classmate</button>' +
        '<div id="shareMessage" class="auth-message hidden"></div>' +
      '</div>' +
    '</div>';
  document.body.appendChild(modal);

  const searchInput = document.getElementById("shareUserSearch");
  const resultsBox = document.getElementById("shareUserResults");
  const selectedBox = document.getElementById("shareSelectedUser");
  const sendBtn = document.getElementById("shareSendBtn");
  const msg = document.getElementById("shareMessage");
  const noteInput = document.getElementById("shareNote");
  let selectedUser = null;
  let t = null;

  function showMsg(text, type) {
    msg.textContent = text;
    msg.classList.remove("hidden", "error", "success");
    if (type) msg.classList.add(type);
  }
  function clearMsg() {
    msg.textContent = "";
    msg.classList.add("hidden", "error", "success");
  }
  function renderSelected(u) {
    selectedUser = u;
    sendBtn.disabled = !u;
    if (!u) { selectedBox.classList.add("hidden"); selectedBox.innerHTML = ""; return; }
    selectedBox.classList.remove("hidden");
    selectedBox.innerHTML =
      '<div class="share-selected-chip">' +
        '<span>@' + escapeHtml(u.username) + ' — ' + escapeHtml(u.display_name || u.username) + '</span>' +
        '<button type="button" id="shareClearUser">×</button>' +
      '</div>';
    document.getElementById("shareClearUser").addEventListener("click", () => {
      selectedUser = null;
      selectedBox.classList.add("hidden");
      sendBtn.disabled = true;
      searchInput.value = "";
      searchInput.focus();
    });
  }
  async function runShareSearch() {
    const q = searchInput.value.trim().toLowerCase();
    if (q.length < 1) { resultsBox.innerHTML = ""; return; }
    clearMsg();
    try {
            const { data, error } = await db.from("profiles")
        .select("id, username, display_name, avatar_url, is_premium")
        .neq("id", currentUser.id)
        .or("username.ilike.%" + q + "%,display_name.ilike.%" + q + "%")
        .limit(8);
      if (error) throw error;
      resultsBox.innerHTML = "";
      (data || []).forEach(u => {
        const row = document.createElement("div");
        row.className = "share-user-row";
        const initial = (u.display_name || u.username).charAt(0).toUpperCase();
        const ring = u.is_premium ? ' premium-avatar' : '';
        const safeAvatar = u.avatar_url ? escapeStyleUrl(u.avatar_url) : "";
                row.innerHTML =
          '<div class="avatar-small' + ring + '"' +
            (safeAvatar ? ' style="background-image:url(\'' + safeAvatar + '\');color:transparent;"' : '') + '>' +
            escapeHtml(initial) + '</div>' +
          '<div class="share-user-row-info">' +
            '<strong>' + escapeHtml(u.display_name || u.username) + (u.is_premium ? ' 👑' : '') + '</strong>' +
            '<span>@' + escapeHtml(u.username) + '</span>' +
          '</div>';
        row.addEventListener("click", () => {
          renderSelected(u);
          resultsBox.innerHTML = "";
          searchInput.value = "";
        });
        resultsBox.appendChild(row);
      });
    } catch (e) {
      resultsBox.innerHTML = '<div class="search-empty">Search failed</div>';
    }
  }
  searchInput.addEventListener("input", () => {
    clearTimeout(t);
    t = setTimeout(runShareSearch, 220);
  });
  document.getElementById("shareModalClose").addEventListener("click", () => {
    modal.remove();
    pendingShare = null;
    _shareModalActive = false;
    _pendingShareQueue.shift();
    if (_pendingShareQueue.length) setTimeout(openShareModal, 250);
  });
  renderSelected(null);

  modal.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { e.preventDefault(); document.getElementById("shareModalClose").click(); }
    else if (e.key === "Enter" && e.target === noteInput && selectedUser) { e.preventDefault(); sendBtn.click(); }
  });

  sendBtn.addEventListener("click", async () => {
    if (!selectedUser || !pendingShare) return;
    sendBtn.disabled = true;
    sendBtn.textContent = "Sending...";
    clearMsg();
    try {
      const { data: myConvs } = await db.from("conversation_participants").select("conversation_id").eq("user_id", currentUser.id);
      let conversation = null;
      if (myConvs && myConvs.length) {
        const ids = myConvs.map(r => r.conversation_id);
        const { data: matches } = await db.from("conversation_participants")
          .select("conversation_id").eq("user_id", selectedUser.id).in("conversation_id", ids);
        if (matches && matches.length) {
          for (const m of matches) {
            const { data: c } = await db.from("conversations").select("*").eq("id", m.conversation_id).maybeSingle();
            if (c && !c.is_group) { conversation = c; break; }
          }
        }
      }
      if (!conversation) {
        const { data: nc, error: ce } = await db.from("conversations").insert({
          user_a_id: currentUser.id, user_b_id: selectedUser.id, created_by: currentUser.id, is_group: false
        }).select().single();
        if (ce) throw ce;
        conversation = nc;
        await db.from("conversation_participants").insert({ conversation_id: conversation.id, user_id: currentUser.id, role: "member" });
        await db.from("conversation_participants").insert({ conversation_id: conversation.id, user_id: selectedUser.id, role: "member" });
      }
      const note = noteInput.value.trim();
      const sharedMessage = (note ? note + "\n\n" : "") +
        "📎 Shared from " + pendingShare.from + ":\n" +
        pendingShare.title + "\n" + pendingShare.url;
      const { error: me } = await db.from("messages")
        .insert({ conversation_id: conversation.id, sender_id: currentUser.id, content: sharedMessage })
        .select().single();
      if (me) throw me;
      await db.from("conversations").update({
        last_message_preview: "📎 Shared: " + pendingShare.title,
        last_message_at: new Date().toISOString(),
        last_message_sender_id: currentUser.id
      }).eq("id", conversation.id);
      currentConversation = conversation;
      await openConversation(conversation, selectedUser);
      await loadConversations();
      showMsg("Sent to @" + selectedUser.username, "success");
      setTimeout(() => {
        modal.remove();
        pendingShare = null;
        _shareModalActive = false;
        _pendingShareQueue.shift();
        if (_pendingShareQueue.length) setTimeout(openShareModal, 250);
      }, 900);
    } catch (e) {
      showMsg(friendlyError(e), "error");
      sendBtn.disabled = false;
      sendBtn.textContent = "Send to classmate";
    }
  });

  setTimeout(() => searchInput.focus(), 80);
}

/* =========================================================
   MY DATA — analytics page
   ========================================================= */
async function openMyDataModal() {
  const wrap = document.createElement("div");
  wrap.className = "modal show";
  wrap.id = "myDataModal";
  wrap.innerHTML =
    '<div class="modal-card wide" style="max-width:640px;">' +
      '<div class="modal-head"><strong>📊 My Data</strong><button type="button" class="modal-close" id="myDataClose">×</button></div>' +
      '<div class="modal-body" id="myDataBody">' +
        '<div class="search-empty">Loading…</div>' +
      '</div>' +
    '</div>';
  document.body.appendChild(wrap);
  document.getElementById("myDataClose").addEventListener("click", () => wrap.remove());
  wrap.addEventListener("click", e => { if (e.target === wrap) wrap.remove(); });

  const body = document.getElementById("myDataBody");
  try {
    const [sentRes, convCount, walletRes] = await Promise.all([
      db.from("messages").select("id, created_at, content").eq("sender_id", currentUser.id),
      db.from("conversation_participants").select("conversation_id").eq("user_id", currentUser.id),
      db.rpc("get_my_wallet")
    ]);

    const sent = sentRes.data || [];
    const convs = convCount.data || [];
    const wallet = walletRes.data || {};

    // Active hours histogram
    const hourBuckets = new Array(24).fill(0);
    sent.forEach(m => {
      const h = new Date(m.created_at).getHours();
      hourBuckets[h]++;
    });
    const peakHour = hourBuckets.indexOf(Math.max(...hourBuckets));

    const totalMsgs = sent.length;
    const totalChars = sent.reduce((a, m) => a + (m.content || "").length, 0);
    const balance = wallet.wallet ? Number(wallet.wallet.balance) : 0;

    body.innerHTML =
      '<div class="my-data-grid">' +
        '<div class="mdd-card"><div class="mdd-k">Messages sent</div><div class="mdd-v">' + totalMsgs + '</div></div>' +
        '<div class="mdd-card"><div class="mdd-k">Characters typed</div><div class="mdd-v">' + totalChars.toLocaleString() + '</div></div>' +
        '<div class="mdd-card"><div class="mdd-k">Conversations</div><div class="mdd-v">' + convs.length + '</div></div>' +
        '<div class="mdd-card"><div class="mdd-k">Wallet balance</div><div class="mdd-v">₹' + formatMoney(balance) + '</div></div>' +
      '</div>' +
      '<div class="my-data-section">' +
        '<h3>Active hours</h3>' +
        '<div class="my-data-histogram">' +
          hourBuckets.map((count, h) => {
            const pct = peakHour === h && count > 0 ? 100 : (count > 0 ? Math.round((count / Math.max(...hourBuckets)) * 100) : 0);
            return '<div class="mdh-bar-wrap" title="' + h + ':00 — ' + count + ' messages">' +
              '<div class="mdh-bar" style="height:' + Math.max(4, pct) + '%"></div>' +
              '<div class="mdh-h">' + h + '</div>' +
            '</div>';
          }).join('') +
        '</div>' +
      '</div>' +
      '<div class="my-data-section">' +
        '<h3>Peak activity</h3>' +
        '<p class="mdd-info">You are most active around <strong>' + peakHour + ':00</strong>.</p>' +
      '</div>';
  } catch (e) {
    body.innerHTML = '<div class="search-empty">Could not load your data.</div>';
  }
}

console.log('[JustGo] sidegogogo.js loaded — v3');