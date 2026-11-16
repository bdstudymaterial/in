/* =========================================================================
   JustGo — side.js (v3)
   Conversation open, message loading/rendering, message rows, file upload,
   drafts, typing, chat search, files panel.

   Changelog v2 → v3:
     • Attachment cleanup on message delete (soft + hard).
     • Book-share rows cleaned of trailing time/date.
     • Tip badge shown on messages that have been tipped.
     • System message rendering (join/leave/admin changes).
     • Multi-select tick UX (checkbox visual + tap anywhere to toggle).
     • Offline: sendMessage queues into localStorage and flushes on
       reconnect.
     • Version tag updated.
   ========================================================================= */

const DEBUG = false;
const dbg = (...args) => { if (DEBUG) console.log("[chat-1]", ...args); };

/* =========================================================
   OPEN CONVERSATION
   ========================================================= */
async function openConversation(conversation, otherUser) {
  try {
    ensureArraysInitialized();
    exitMultiSelectMode();

    if (!conversation || !conversation.id) {
      console.warn("openConversation: invalid conversation");
      return;
    }

    if (conversation.is_group) {
      const { data: fresh } = await db.from("conversations").select("*").eq("id", conversation.id).maybeSingle();
      if (fresh) conversation = fresh;
    }
    currentConversation = conversation;
    hasMoreMessages = true; oldestLoadedAt = null; unreadSinceJump = 0;
    attachmentUrlCache.clear();

    if (elements.chatView) elements.chatView.classList.remove("hidden");
    if (elements.emptyChat) elements.emptyChat.classList.add("hidden");
    if (elements.activeChat) elements.activeChat.classList.remove("hidden");
    if (elements.appScreen) elements.appScreen.classList.add("chat-open");

    const { data: parts } = await db.from("conversation_participants")
      .select("user_id, role").eq("conversation_id", conversation.id);
    currentParticipants = parts || [];
    await ensureConversationParticipantsLoaded();

    if (conversation.is_group) {
      if (elements.chatName) elements.chatName.textContent = conversation.group_name || "Group";
      if (elements.chatSub) elements.chatSub.textContent = conversation.group_description ? conversation.group_description.slice(0, 50) : "Group";
      setAvatar(elements.chatAvatar, conversation.group_avatar_url, conversation.group_name || "G");
      if (elements.chatAvatar) {
        elements.chatAvatar.classList.add("group-avatar");
        elements.chatAvatar.classList.remove("premium-avatar");
      }
      if (elements.chatGroupSettingsBtn) elements.chatGroupSettingsBtn.classList.remove("hidden");
      if (elements.moneyComposerBtn) elements.moneyComposerBtn.title = "Split bill";
    } else {
      if (elements.chatAvatar) elements.chatAvatar.classList.remove("group-avatar");
      if (elements.chatGroupSettingsBtn) elements.chatGroupSettingsBtn.classList.add("hidden");

      if (!otherUser) {
        const otherPart = currentParticipants.find(p => p.user_id !== currentUser.id);
        if (otherPart) {
          const cached = await getProfileCached(otherPart.user_id);
          if (cached) {
            otherUser = {
              id: cached.id, username: cached.username,
              display_name: cached.display_name, avatar_url: cached.avatar_url,
              last_seen: cached.last_seen, is_premium: cached.is_premium
            };
          }
        }
      }

      const name = (otherUser && (otherUser.display_name || otherUser.username)) || "User";
      if (elements.chatName) elements.chatName.textContent = name;
      if (elements.chatSub) {
        if (otherUser && isOnline(otherUser.last_seen, otherUser.id)) elements.chatSub.textContent = "@" + otherUser.username + " • online";
        else if (otherUser && otherUser.last_seen) elements.chatSub.textContent = "@" + otherUser.username + " • last seen " + formatListTime(otherUser.last_seen);
        else elements.chatSub.textContent = otherUser ? "@" + otherUser.username : "";
      }
      setAvatar(elements.chatAvatar, otherUser && otherUser.avatar_url, name);

      let headerPremium = false;
      if (otherUser && otherUser.id) {
        const cached = profileCache[otherUser.id];
        headerPremium = !!(otherUser.is_premium) || !!(cached && cached.is_premium);
      }
      if (elements.chatAvatar) elements.chatAvatar.classList.toggle("premium-avatar", headerPremium);
      if (elements.moneyComposerBtn) elements.moneyComposerBtn.title = "Send / request money";
    }

    updateAnnouncementBanner();
    applyWallpaperToChat();

    scheduleMarkRead(conversation.id);
    subscribeTyping();

    if (elements.messages) {
      await loadMessages();
    } else {
      console.error("openConversation: #messages element missing from DOM!");
    }

    scheduleMarkRead(conversation.id);
    restoreDraft();

    if (elements.conversationList && !elements.conversationList.querySelector('.conversation[data-conv-id="' + conversation.id + '"]')) {
      await loadConversations();
    }

    if (elements.mobileNav) {
      elements.mobileNav.querySelectorAll(".mobile-nav-btn").forEach(b => {
        b.classList.toggle("active", b.dataset.nav === "chats");
      });
    }
  } catch (err) {
    console.error("openConversation error:", err);
    showToast("Could not open chat: " + (err.message || err), "error");
  }
}

/* =========================================================
   MESSAGES LOAD / RENDER
   ========================================================= */
async function loadMessages() {
  if (!currentConversation) return;
  if (!elements.messages) return;
  skeletonList(elements.messages, "message-row", 5);
  try {
    const { data: rows, error } = await db.from("messages").select("*")
      .eq("conversation_id", currentConversation.id)
      .order("created_at", { ascending: false }).limit(MSG_PAGE_SIZE);
    if (error) throw error;
    const list = rows || [];
    hasMoreMessages = list.length >= MSG_PAGE_SIZE;
    if (list.length) oldestLoadedAt = list[list.length - 1].created_at;
    const ordered = list.slice().reverse();
    const ids = ordered.map(m => m.id);
    const enriched = await enrichMessages(ids, ordered);
    await renderMessages(enriched, true);
    await loadPinnedMessages();
  } catch (e) {
    console.error("loadMessages error:", e);
    elements.messages.innerHTML = '<div class="messages-empty">Could not load messages.</div>';
  }
}

async function loadOlderMessages() {
  if (!currentConversation || !oldestLoadedAt || isLoadingOlder || !hasMoreMessages) return;
  if (!elements.messages) return;
  isLoadingOlder = true;

  const container = elements.messages;
  const prevScrollHeight = container.scrollHeight;
  const prevScrollTop = container.scrollTop;

  try {
    const { data: rows, error } = await db.from("messages").select("*")
      .eq("conversation_id", currentConversation.id).lt("created_at", oldestLoadedAt)
      .order("created_at", { ascending: false }).limit(MSG_PAGE_SIZE);
    if (error) throw error;
    const list = rows || [];
    if (list.length < MSG_PAGE_SIZE) hasMoreMessages = false;
    if (!list.length) return;
    oldestLoadedAt = list[list.length - 1].created_at;
    const ordered = list.slice().reverse();
    const ids = ordered.map(m => m.id);
    const enriched = await enrichMessages(ids, ordered);

    const dividerFrag = document.createDocumentFragment();
    let lastDate = "";
    const firstExistingDivider = container.querySelector(".date-divider");
    const firstExistingDateKey = firstExistingDivider
      ? new Date(firstExistingDivider.dataset.dateKey || 0).toDateString()
      : "";
    for (const m of enriched) {
      const d = new Date(m.created_at);
      const k = d.toDateString();
      if (k !== lastDate && k !== firstExistingDateKey) {
        const div = document.createElement("div");
        div.className = "date-divider";
        div.dataset.dateKey = d.toISOString();
        div.textContent = formatDateDivider(d);
        dividerFrag.appendChild(div);
        lastDate = k;
      }
    }

    const rowFrag = document.createDocumentFragment();
    for (const m of enriched) {
      try {
        const row = await buildMessageRow(m, m._senders || {}, false);
        rowFrag.appendChild(row);
      } catch (e) {
        dbg("skip row", m.id, e);
      }
    }

    const firstRow = container.querySelector(".message-row");
    const insertBefore = firstRow || null;

    container.insertBefore(dividerFrag, insertBefore);
    container.insertBefore(rowFrag, insertBefore);

    requestAnimationFrame(() => {
      const newScrollHeight = container.scrollHeight;
      container.scrollTop = prevScrollTop + (newScrollHeight - prevScrollHeight);
    });
  } catch (e) {
    console.error("loadOlderMessages error:", e);
  } finally {
    isLoadingOlder = false;
  }
}

async function enrichMessages(ids, baseMessages) {
  if (!ids.length) return baseMessages;

  const senderIds = baseMessages.map(m => m.sender_id).filter(Boolean)
    .filter((v, i, a) => a.indexOf(v) === i);

  const results = await Promise.all([
    db.from("message_attachments").select("*").in("message_id", ids),
    db.from("message_reactions").select("*").in("message_id", ids),
    db.from("message_reads").select("*").in("message_id", ids),
    senderIds.length
      ? db.from("profiles").select("id, username, display_name, avatar_url, is_premium, is_verified").in("id", senderIds)
      : Promise.resolve({ data: [] })
  ]);
  const [attsRes, reactsRes, readsRes, sendersRes] = results;

  const attMap = {};
  (attsRes.data || []).forEach(a => (attMap[a.message_id] = attMap[a.message_id] || []).push(a));
  const reactMap = {};
  (reactsRes.data || []).forEach(r => (reactMap[r.message_id] = reactMap[r.message_id] || []).push(r));
  const readMap = {};
  (readsRes.data || []).forEach(r => (readMap[r.message_id] = readMap[r.message_id] || []).push(r));

  const senderMap = {};
  (sendersRes.data || []).forEach(p => {
    senderMap[p.id] = p;
    profileCache[p.id] = Object.assign({}, profileCache[p.id] || {}, p);
    profileCacheTime[p.id] = Date.now();
  });
  if (currentProfile && !senderMap[currentProfile.id]) senderMap[currentProfile.id] = currentProfile;

  const paths = [];
  (attsRes.data || []).forEach(a => {
    if (a.storage_path && !attachmentUrlCache.has(a.storage_path)) paths.push(a.storage_path);
  });
  if (paths.length) {
    try {
      const { data: signedList } = await db.storage.from(STORAGE_BUCKET).createSignedUrls(paths, 3600);
      (signedList || []).forEach(s => { if (s.signedUrl) attachmentUrlCache.set(s.path, s.signedUrl); });
    } catch (e) {}
  }

  // Load tips for these messages
  let tipMap = {};
  try {
    const { data: tips } = await db.from("justgo_transactions")
      .select("id, note, amount, from_user, to_user, created_at")
      .ilike("note", "%[tip:%")
      .in("to_user", senderIds.length ? senderIds : ["00000000-0000-0000-0000-000000000000"])
      .order("created_at", { ascending: false })
      .limit(200);
    (tips || []).forEach(t => {
      const m = String(t.note || "").match(/\[tip:([a-f0-9-]+)\]/i);
      if (!m) return;
      const mid = m[1];
      if (ids.indexOf(mid) === -1) return;
      tipMap[mid] = tipMap[mid] || { count: 0, total: 0 };
      tipMap[mid].count++;
      tipMap[mid].total += Number(t.amount || 0);
    });
  } catch (e) {}

  return baseMessages.map(m => Object.assign({}, m, {
    message_attachments: attMap[m.id] || [],
    message_reactions: reactMap[m.id] || [],
    message_reads: readMap[m.id] || [],
    _senders: senderMap,
    _saved: savedMessageIds.has(m.id),
    _tips: tipMap[m.id] || null
  }));
}

async function renderMessages(messages, scroll) {
  if (!elements.messages) return;
  elements.messages.innerHTML = "";
  if (!messages || !messages.length) {
    elements.messages.innerHTML = '<div class="messages-empty">No messages yet. Say hello!</div>';
    return;
  }
  const frag = document.createDocumentFragment();
  let lastDate = "";
  let lastTime = 0;
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    try {
      const d = new Date(m.created_at || Date.now());
      const k = d.toDateString();
      if (k !== lastDate) {
        const divider = document.createElement("div");
        divider.className = "date-divider";
        divider.dataset.dateKey = d.toISOString();
        divider.textContent = formatDateDivider(d);
        frag.appendChild(divider);
        lastDate = k; lastTime = 0;
      }
      const msgTime = d.getTime();
      const showTime = (msgTime - lastTime) > (5 * 60 * 1000);
      lastTime = msgTime;
      const row = await buildMessageRow(m, m._senders || {}, showTime);
      frag.appendChild(row);
    } catch (rowErr) {
      console.error("Failed to build row for message:", m && m.id, rowErr);
    }
  }
  elements.messages.appendChild(frag);
  if (scroll !== false) scrollToBottom();
  updateJumpButton();
}

function insertMessageRow(row, createdAt) {
  if (!elements.messages) return;

  const lastRow = elements.messages.lastElementChild;
  if (!lastRow || !lastRow.classList.contains("message-row")) {
    elements.messages.appendChild(row);
    return;
  }
  const lastTs = lastRow.dataset.createdAt;
  if (!lastTs || !createdAt || lastTs <= createdAt) {
    elements.messages.appendChild(row);
    return;
  }

  const rows = elements.messages.querySelectorAll(".message-row");
  for (let i = rows.length - 1; i >= 0; i--) {
    const t = rows[i].dataset.createdAt;
    if (t && createdAt && t < createdAt) {
      elements.messages.insertBefore(row, rows[i].nextSibling);
      return;
    }
  }
  elements.messages.insertBefore(row, elements.messages.firstChild);
}

async function renderMessageFromPayload(payload, opts) {
  if (!elements.messages) return;
  opts = opts || {};
  const isMine = payload.sender_id === currentUser.id;

  let enriched;
  try {
    const result = await enrichMessages([payload.id], [payload]);
    enriched = result[0];
  } catch (e) {
    dbg("enrich single failed", e);
    enriched = null;
  }

  const message = enriched || Object.assign({}, payload, {
    message_attachments: [], message_reactions: [], message_reads: [],
    _senders: {}, _saved: savedMessageIds.has(payload.id)
  });

  const senderMap = message._senders || {};
  if (currentProfile && !senderMap[currentUser.id]) senderMap[currentUser.id] = currentProfile;

  const shouldScroll = isMine || opts.forceScroll || isNearBottom();
  const old = elements.messages.querySelector('[data-message-id="' + payload.id + '"]');

  let row;
  try {
    row = await buildMessageRow(message, senderMap, true);
  } catch (e) {
    console.error("buildMessageRow failed for realtime payload", e);
    row = document.createElement("div");
    row.className = "message-row" + (isMine ? " mine" : "");
    row.dataset.messageId = payload.id;
    row.dataset.createdAt = payload.created_at || new Date().toISOString();
    const b = document.createElement("div");
    b.className = "message-bubble";
    b.textContent = payload.content || "(message)";
    row.appendChild(b);
  }

  row.classList.add("entering");
  setTimeout(() => row.classList.remove("entering"), 300);
  if (old) old.replaceWith(row);
  else insertMessageRow(row, payload.created_at);
  if (shouldScroll) scrollToBottom();
  else updateJumpButton();
}

function isNearBottom() {
  const el = elements.messages;
  if (!el) return true;
  if (el.scrollHeight <= el.clientHeight + 4) return true;
  return (el.scrollHeight - el.scrollTop - el.clientHeight) < NEAR_BOTTOM_PX;
}
function scrollToBottom() {
  const el = elements.messages; if (!el) return;
  requestAnimationFrame(() => {
    el.scrollTop = el.scrollHeight;
    requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
  });
  unreadSinceJump = 0;
  updateJumpButton();
}
function updateJumpButton() {
  const el = elements.messages; if (!el) return;
  if (!elements.jumpToLatestBtn) return;
  const near = isNearBottom();
  if (near) { elements.jumpToLatestBtn.classList.add("hidden"); unreadSinceJump = 0; }
  else {
    elements.jumpToLatestBtn.classList.remove("hidden");
    if (elements.jumpCount) elements.jumpCount.textContent = unreadSinceJump > 0 ? String(unreadSinceJump) : "";
  }
}
function jumpToLatest() {
  scrollToBottom();
  if (elements.jumpToLatestBtn) elements.jumpToLatestBtn.classList.add("hidden");
}

/* =========================================================
   BOOK SHARE CLEANUP
   ========================================================= */
function cleanBookShareTitle(raw) {
  if (!raw) return "";
  let s = String(raw);
  s = s.replace(/^\s*Shared a book[:\-]?\s*/i, "");
  s = s.replace(/\s*[•·]\s*.*$/, "");
  s = s.replace(/\s+\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM|am|pm)?\s*$/, "");
  s = s.replace(/\s+(?:\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}|\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2}|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{2,4})\s*$/i, "");
  s = s.replace(/\s+(?:today|yesterday)\s*$/i, "");
  s = s.replace(/\s+/g, " ").replace(/[\s\-–—:|]+$/, "");
  return s.trim();
}

/* =========================================================
   BUILD MESSAGE ROW
   ========================================================= */
async function buildMessageRow(message, senderMap, showTime) {
  if (showTime === undefined) showTime = true;
  if (!message) message = {};
  senderMap = senderMap || {};

  // System message
  if (message.kind === 'system') {
    return buildSystemRow(message);
  }

  const mine = message.sender_id === currentUser.id;
  const isGroup = currentConversation && currentConversation.is_group;

  try {
    if (message.kind === 'money' && message.meta) return buildMoneyMessageRow(message, senderMap, showTime);
    if (message.kind === 'fundraiser' && message.meta) return buildFundraiserMessageRow(message, senderMap, showTime);
    if (message.kind === 'book_share' && message.meta && message.meta.book && window.JustGoChatBooks) {
      return buildBookShareRow(message, senderMap, showTime);
    }
  } catch (e) {
    console.warn("Special bubble build failed, falling back to text bubble", e);
  }

  const row = document.createElement("div");
  row.className = "message-row" + (mine ? " mine" : "");
  row.dataset.messageId = message.id || "";
  row.dataset.createdAt = message.created_at || new Date().toISOString();
  if (message.__optimistic) row.classList.add("pending");
  if (multiSelectMode && message.id && selectedMessages.has(message.id)) row.classList.add("selected");

  const bubble = document.createElement("div");
  bubble.className = "message-bubble";

  if (message.id && isMessagePinned(message.id)) {
    bubble.classList.add("pinned");
    const pin = document.createElement("span");
    pin.className = "pin-indicator"; pin.textContent = "📌";
    bubble.appendChild(pin);
  }
  if (message._saved) {
    const star = document.createElement("span");
    star.className = "star-indicator"; star.textContent = "⭐";
    bubble.appendChild(star);
  }
  if (message._tips && message._tips.count > 0) {
    const tipBadge = document.createElement("div");
    tipBadge.className = "tip-badge";
    tipBadge.innerHTML =
      '<span class="tip-ic">₹</span>' +
      '<span class="tip-text">' +
        message._tips.count + (message._tips.count === 1 ? ' tip' : ' tips') +
        ' · ₹' + formatMoney(message._tips.total) +
      '</span>';
    bubble.appendChild(tipBadge);
  }

  if (isGroup && !mine) {
    const s = senderMap[message.sender_id];
    const name = s ? (s.display_name || s.username) : "User";
    const senderEl = document.createElement("div");
    senderEl.className = "message-sender";
    senderEl.innerHTML = escapeHtml(name) +
      (s && s.is_verified ? ' <span class="verified-tick-inline">✓</span>' : '') +
      (s && s.is_premium ? ' <span class="mini-premium-crown">👑</span>' : '');
    senderEl.style.cursor = "pointer";
    senderEl.addEventListener("click", () => { if (s) openPublicProfile(s.username); });
    bubble.appendChild(senderEl);
  }

  if (message.reply_to_id) {
    const quote = document.createElement("div");
    quote.className = "message-reply-quote";
    quote.dataset.jumpTo = message.reply_to_id;
    quote.innerHTML = '<strong>Replying to a message</strong><span class="reply-text">Loading...</span>';
    quote.addEventListener("click", () => {
      const target = elements.messages.querySelector('[data-message-id="' + message.reply_to_id + '"]');
      if (target) target.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    bubble.appendChild(quote);
    db.from("messages").select("content, sender_id").eq("id", message.reply_to_id).maybeSingle().then(r => {
      if (r.data) {
        const t = quote.querySelector(".reply-text");
        if (t) t.textContent = r.data.content || "(file)";
      }
    }).catch(() => {});
  }

  const attachments = message.message_attachments || [];
  const now = Date.now();
  const liveAttachments = attachments.filter(a => !a.expires_at || new Date(a.expires_at).getTime() > now);
  const expiredAttachments = attachments.filter(a => a.expires_at && new Date(a.expires_at).getTime() <= now);

  const isExpiredOnly = !message.deleted && !message.content && attachments.length > 0 && liveAttachments.length === 0;

  if (isExpiredOnly) {
    const expired = document.createElement("div");
    expired.className = "expired-file-bubble";
    expired.innerHTML =
      '<div class="expired-file-icon">📎</div>' +
      '<div class="expired-file-text">' +
        '<strong>File has expired</strong>' +
        '<span>Ask the sender to resend it.</span>' +
      '</div>';
    bubble.classList.add("bubble-expired");
    bubble.appendChild(expired);
  } else {
    if (message.deleted) {
      const text = document.createElement("div");
      text.className = "message-text deleted";
      text.textContent = "This message was deleted";
      bubble.appendChild(text);
    } else if (message.content) {
      const contentStr = String(message.content || "");
      if (/^https?:\/\/[^\s]*tenor\.com\/[^\s]+\.(gif|mp4|webp)$/i.test(contentStr.trim())
          || /^https?:\/\/[^\s]*media\.tenor\.com\/[^\s]+$/i.test(contentStr.trim())) {
        const img = document.createElement("img");
        img.className = "file-preview"; img.src = contentStr.trim(); img.alt = "GIF";
        img.style.maxWidth = "220px"; img.style.maxHeight = "220px"; img.loading = "lazy";
        img.addEventListener("click", () => window.open(contentStr.trim(), "_blank"));
        bubble.appendChild(img);
      } else {
        const preview = extractLinkAndTitle(contentStr);
        if (preview) {
          const textWithoutURL = contentStr.replace(preview.url, "").trim();
          if (textWithoutURL) {
            const text = document.createElement("div");
            text.className = "message-text";
            renderTextWithMentionsAndLinks(text, textWithoutURL);
            bubble.appendChild(text);
          }
          renderLinkPreviewCard(bubble, preview.url, preview.meta);
        } else {
          const text = document.createElement("div");
          text.className = "message-text";
          renderTextWithMentionsAndLinks(text, contentStr);
          bubble.appendChild(text);
        }
      }
    }

    for (const att of liveAttachments) {
      try {
        const card = await createFileCard(att);
        if (card) bubble.appendChild(card);
      } catch (e) {}
    }
    for (const att of expiredAttachments) {
      const chip = document.createElement("div");
      chip.className = "expired-file-chip";
      chip.innerHTML = '📎 <span>' + escapeHtml(att.file_name || "File") + '</span> — expired';
      bubble.appendChild(chip);
    }
  }

  const reactions = message.message_reactions || [];
  if (reactions.length) {
    const grouped = {};
    reactions.forEach(r => {
      grouped[r.emoji] = grouped[r.emoji] || { count: 0, mine: false };
      grouped[r.emoji].count++;
      if (r.user_id === currentUser.id) grouped[r.emoji].mine = true;
    });
    const bar = document.createElement("div");
    bar.className = "reactions-bar";
    Object.keys(grouped).forEach(emoji => {
      const pill = document.createElement("span");
      pill.className = "reaction-pill" + (grouped[emoji].mine ? " mine" : "");
      pill.textContent = emoji + " " + grouped[emoji].count;
      pill.addEventListener("click", (ev) => { ev.stopPropagation(); toggleReaction(message.id, emoji); });
      bar.appendChild(pill);
    });
    bubble.appendChild(bar);
  }

  const meta = document.createElement("div");
  meta.className = "message-meta";
  if (showTime) {
    const t = document.createElement("span");
    t.textContent = formatMessageTime(message.created_at);
    meta.appendChild(t);
  }
  if (message.edited_at) {
    const e = document.createElement("span");
    e.textContent = " • edited";
    meta.appendChild(e);
  }
  if (mine && !message.deleted) {
    const tick = buildTickIndicator(message);
    if (tick) meta.appendChild(tick);
  }
  bubble.appendChild(meta);
  row.appendChild(bubble);

  if (multiSelectMode && message.id) {
    row.classList.add("multi-selectable");
    row.addEventListener("click", (e) => {
      if (!multiSelectMode) return;
      // Don't trigger if clicking a button/link inside
      if (e.target.closest("button, a, .cb-wrap, input")) return;
      e.stopPropagation();
      toggleMessageSelection(message.id, row);
    }, true);
  } else {
    row.addEventListener("contextmenu", e => { e.preventDefault(); showMessageMenu(e.clientX, e.clientY, message); });
    row.addEventListener("dblclick", () => toggleReaction(message.id, "👍"));
  }
  attachMobileRowGestures(row, message);

  if (isMentionedMe(message)) row.classList.add("mentioned");
  return row;
}

function buildSystemRow(message) {
  const row = document.createElement("div");
  row.className = "message-row system-row";
  row.dataset.messageId = message.id || "";
  row.dataset.createdAt = message.created_at || new Date().toISOString();
  const pill = document.createElement("div");
  pill.className = "system-pill";
  pill.textContent = message.content || "Group updated";
  row.appendChild(pill);
  return row;
}

function buildBookShareRow(message, senderMap, showTime) {
  const mine = message.sender_id === currentUser.id;
  const row = document.createElement("div");
  row.className = "message-row" + (mine ? " mine" : "");
  row.dataset.messageId = message.id || "";
  row.dataset.createdAt = message.created_at || new Date().toISOString();

  const book = (message.meta && message.meta.book) || {};
  // Clean title
  book.title = cleanBookShareTitle(book.title) || "Untitled book";
  row.dataset.bookShare = JSON.stringify(book);

  const bubble = document.createElement("div");
  bubble.className = "message-bubble book-share-row";

  try {
    if (window.JustGoChatBooks && typeof window.JustGoChatBooks.render === "function") {
      const card = window.JustGoChatBooks.render(book);
      bubble.appendChild(card);
    } else {
      const txt = document.createElement("div");
      txt.className = "message-text";
      txt.textContent = "📚 " + (book.title || "Shared a book");
      bubble.appendChild(txt);
    }
  } catch (e) {
    const txt = document.createElement("div");
    txt.className = "message-text";
    txt.textContent = "📚 " + (book.title || "Shared a book");
    bubble.appendChild(txt);
  }

  row.appendChild(bubble);
  if (multiSelectMode && message.id) {
    row.classList.add("multi-selectable");
    row.addEventListener("click", (e) => {
      if (!multiSelectMode) return;
      if (e.target.closest("button, a, .cb-wrap, input")) return;
      e.stopPropagation();
      toggleMessageSelection(message.id, row);
    }, true);
  } else {
    row.addEventListener("contextmenu", e => { e.preventDefault(); showMessageMenu(e.clientX, e.clientY, message); });
  }
  return row;
}

function buildTickIndicator(message) {
  const wrap = document.createElement("span");
  wrap.className = "tick-single";

  const reads = message.message_reads || [];
  const othersRead = reads.filter(r => r.user_id !== currentUser.id);

  if (message.__optimistic) {
    wrap.classList.add("pending");
    wrap.innerHTML = svgClock();
    wrap.title = "Sending…";
  } else if (!settings.readReceipts) {
    return null;
  } else if (othersRead.length > 0) {
    wrap.classList.add("read");
    wrap.innerHTML = svgDoubleCheck();
    wrap.title = "Read by " + othersRead.length;
    if (currentConversation && currentConversation.is_group) {
      wrap.style.cursor = "pointer";
      wrap.addEventListener("click", e => { e.stopPropagation(); showSeenByList(message.id); });
    }
  } else {
    wrap.classList.add("sent");
    wrap.innerHTML = svgSingleCheck();
    wrap.title = "Sent";
    if (currentConversation && currentConversation.is_group) {
      wrap.style.cursor = "pointer";
      wrap.addEventListener("click", e => { e.stopPropagation(); showSeenByList(message.id); });
    }
  }
  return wrap;
}

function svgSingleCheck() {
  return '<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><polyline points="3,8.5 6.5,12 13,4.5" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
}
function svgDoubleCheck() {
  return '<svg viewBox="0 0 20 16" xmlns="http://www.w3.org/2000/svg"><polyline points="1,8.5 4.5,12 11,4.5" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><polyline points="7,8.5 10.5,12 17,4.5" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
}
function svgClock() {
  return '<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.6" fill="none"/><polyline points="8,4.5 8,8 10.5,9.5" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>';
}

/* =========================================================
   MONEY MESSAGE BUBBLE
   ========================================================= */
function buildMoneyMessageRow(message, senderMap, showTime) {
  message = message || {};
  const mine = message.sender_id === currentUser.id;
  const row = document.createElement("div");
  row.className = "message-row money-row" + (mine ? " mine" : "");
  row.dataset.messageId = message.id || "";
  row.dataset.createdAt = message.created_at || new Date().toISOString();

  const meta = message.meta || {};
  const status = meta.status || 'completed';
  const amount = Number(meta.amount || 0);
  const fee = Number(meta.fee || 0);
  const total = Number(meta.total || amount + fee);
  const note = meta.note || '';

  let dir = meta.direction || 'sent';
  const isRequest = meta.request_id && (meta.type === 'request' || dir === 'request_out' || dir === 'request_in');

  if (isRequest) dir = mine ? 'request_out' : 'request_in';
  else if (meta.transaction_id) dir = mine ? 'sent' : 'received';

  const bubble = document.createElement("div");
  bubble.className = "money-bubble money-" + dir + " money-status-" + status;
  if (meta.transaction_id) bubble.dataset.txnId = meta.transaction_id;
  if (meta.request_id) bubble.dataset.requestId = meta.request_id;

  const headIcon = dir === 'received' ? '↓' : dir === 'request_in' ? '←' : dir === 'request_out' ? '→' : '↑';
  const headLabel = dir === 'sent' ? 'Sent' : dir === 'received' ? 'Received' : dir === 'request_out' ? 'Requested' : dir === 'request_in' ? 'Request' : 'Money';

  bubble.innerHTML =
    '<div class="money-head">' +
      '<span class="money-ico">' + headIcon + '</span>' +
      '<span class="money-label">' + escapeHtml(headLabel) + '</span>' +
    '</div>' +
    '<div class="money-amount">₹' + formatMoney(amount) + '</div>' +
    (note ? '<div class="money-note">' + escapeHtml(note) + '</div>' : '') +
    (dir === 'sent' && fee > 0
      ? '<div class="money-fee-row"><span>Fee (' + currentFeePct() + '%)</span><span>+₹' + formatMoney(fee) + '</span></div>' +
        '<div class="money-total-row"><span>You paid</span><strong>₹' + formatMoney(total) + '</strong></div>'
      : '') +
    (dir === 'received'
      ? '<div class="money-total-row"><span>You got</span><strong>₹' + formatMoney(amount) + '</strong></div>'
      : '') +
    '<div class="money-foot">' +
      '<span class="money-status-chip">' + escapeHtml(moneyStatusLabel(status)) + '</span>' +
      (showTime ? '<span class="money-time">' + escapeHtml(formatMessageTime(message.created_at)) + '</span>' : '') +
    '</div>';

  if (isRequest && meta.request_id) {
    const actions = document.createElement('div');
    actions.className = 'money-actions';
    if (dir === 'request_in' && status === 'pending') {
      const previewFee = calculateFeePreview(amount);
      const payBtn = document.createElement('button');
      payBtn.type = 'button'; payBtn.className = 'money-btn primary';
      payBtn.textContent = 'Pay ₹' + formatMoney(amount + previewFee);
      payBtn.addEventListener('click', e => { e.stopPropagation(); walletPayRequest(meta.request_id); });
      const decBtn = document.createElement('button');
      decBtn.type = 'button'; decBtn.className = 'money-btn';
      decBtn.textContent = 'Decline';
      decBtn.addEventListener('click', e => { e.stopPropagation(); walletDeclineRequest(meta.request_id); });
      actions.appendChild(payBtn); actions.appendChild(decBtn);
    } else if (dir === 'request_out' && status === 'pending') {
      const cxlBtn = document.createElement('button');
      cxlBtn.type = 'button'; cxlBtn.className = 'money-btn';
      cxlBtn.textContent = 'Cancel request';
      cxlBtn.addEventListener('click', e => { e.stopPropagation(); walletCancelRequest(meta.request_id); });
      actions.appendChild(cxlBtn);
    }
    if (actions.children.length) bubble.appendChild(actions);
  }

  bubble.addEventListener('click', (e) => {
    if (multiSelectMode) { e.stopPropagation(); return; }
    if (meta.transaction_id) openMoneyReceipt(meta.transaction_id);
  });
  row.appendChild(bubble);

  if (multiSelectMode && message.id) {
    row.classList.add("multi-selectable");
    row.addEventListener("click", (e) => {
      if (!multiSelectMode) return;
      e.stopPropagation();
      toggleMessageSelection(message.id, row);
    }, true);
  } else {
    row.addEventListener("contextmenu", e => { e.preventDefault(); showMessageMenu(e.clientX, e.clientY, message); });
  }
  return row;
}

function buildFundraiserMessageRow(message, senderMap, showTime) {
  message = message || {};
  const row = document.createElement("div");
  row.className = "message-row fundraiser-row";
  row.dataset.messageId = message.id || "";
  row.dataset.createdAt = message.created_at || new Date().toISOString();

  const meta = message.meta || {};
  const fundraiser = meta.fundraiser || {};
  const goal = Number(fundraiser.goal_amount || 0);
  const raised = Number(fundraiser.raised_amount || 0);
  const pct = goal > 0 ? Math.min(100, Math.round((raised / goal) * 100)) : 0;
  const isActive = fundraiser.is_active !== false;
  const isCreator = fundraiser.created_by === currentUser.id;

  const bubble = document.createElement("div");
  bubble.className = "fundraiser-bubble";
  bubble.innerHTML =
    '<div class="fundraiser-head">' +
      '<div class="fundraiser-head-icon">🎯</div>' +
      '<div class="fundraiser-head-body">' +
        '<strong>' + escapeHtml(fundraiser.title || "Fundraiser") + '</strong>' +
        '<span>Started by ' + escapeHtml(fundraiser.creator_name || "someone") + '</span>' +
      '</div>' +
    '</div>' +
    (fundraiser.description ? '<div style="font-size:12.5px;color:var(--text-muted);line-height:1.5;margin-bottom:10px;">' + escapeHtml(fundraiser.description) + '</div>' : '') +
    '<div class="fundraiser-progress">' +
      '<div class="fundraiser-progress-bar">' +
        '<div class="fundraiser-progress-fill" style="width:' + pct + '%"></div>' +
      '</div>' +
      '<div class="fundraiser-progress-meta">' +
        '<strong>₹' + formatMoney(raised) + '</strong>' +
        '<span>of ₹' + formatMoney(goal) + ' (' + pct + '%)</span>' +
      '</div>' +
    '</div>' +
    '<div class="fundraiser-actions">' +
      (isActive && !isCreator ? '<button type="button" class="fundraiser-btn primary" data-action="contribute">Contribute</button>' : '') +
      '<button type="button" class="fundraiser-btn secondary" data-action="view">View details</button>' +
    '</div>';

  const contribBtn = bubble.querySelector('[data-action="contribute"]');
  if (contribBtn) {
    contribBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      openContributeModal(fundraiser);
    });
  }
  const viewBtn = bubble.querySelector('[data-action="view"]');
  if (viewBtn) {
    viewBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      openFundraiserDetails(fundraiser);
    });
  }

  row.appendChild(bubble);
  if (multiSelectMode && message.id) {
    row.classList.add("multi-selectable");
  } else {
    row.addEventListener("contextmenu", e => { e.preventDefault(); showMessageMenu(e.clientX, e.clientY, message); });
  }
  return row;
}

/* =========================================================
   MOBILE ROW GESTURES
   ========================================================= */
function attachMobileRowGestures(row, message) {
  if (!row || !message) return;
  if (multiSelectMode) return;
  let touchTimer = null, startX = 0, startY = 0, swiping = false, bubble = null, deltaX = 0;
  const SWIPE_THRESHOLD = 55;

  row.addEventListener("touchstart", (e) => {
    if (e.touches.length !== 1) return;
    if (multiSelectMode) return;
    const t = e.touches[0];
    startX = t.clientX; startY = t.clientY;
    swiping = false; deltaX = 0;
    bubble = row.querySelector(".message-bubble") || row.querySelector(".money-bubble") || row.querySelector(".fundraiser-bubble");
    if (!row.querySelector(".swipe-reply-icon")) {
      const icon = document.createElement("span");
      icon.className = "swipe-reply-icon"; icon.textContent = "↩";
      row.appendChild(icon);
    }
    touchTimer = setTimeout(() => {
      touchTimer = null;
      if (navigator.vibrate) try { navigator.vibrate(15); } catch (err) {}
      showQuickReactions(message, startX, startY);
    }, 480);
  }, { passive: true });

  row.addEventListener("touchmove", (e) => {
    if (e.touches.length !== 1) return;
    if (multiSelectMode) return;
    const t = e.touches[0];
    const dx = t.clientX - startX, dy = t.clientY - startY;
    if (touchTimer && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) { clearTimeout(touchTimer); touchTimer = null; }
    if (dx > 10 && Math.abs(dy) < 40) {
      swiping = true;
      deltaX = Math.min(dx, 90);
      if (bubble) { bubble.style.transform = "translateX(" + deltaX + "px)"; row.classList.add("swiping"); }
    }
  }, { passive: true });

  row.addEventListener("touchend", () => {
    if (touchTimer) { clearTimeout(touchTimer); touchTimer = null; }
    if (bubble) {
      row.classList.add("snapback"); bubble.style.transform = ""; row.classList.remove("swiping");
      setTimeout(() => row.classList.remove("snapback"), 220);
    }
    if (swiping && deltaX >= SWIPE_THRESHOLD) {
      if (navigator.vibrate) try { navigator.vibrate(15); } catch (err) {}
      setReplyTarget(message);
    }
    swiping = false; deltaX = 0;
  });
  row.addEventListener("touchcancel", () => {
    if (touchTimer) { clearTimeout(touchTimer); touchTimer = null; }
    if (bubble) { bubble.style.transform = ""; row.classList.remove("swiping"); }
    swiping = false; deltaX = 0;
  });
}

function showQuickReactions(message, x, y) {
  const qr = elements.quickReactions;
  if (!qr) return;
  qr.innerHTML = "";
  QUICK_REACTIONS.forEach(emoji => {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = emoji;
    b.addEventListener("click", (ev) => { ev.stopPropagation(); hideQuickReactions(); toggleReaction(message.id, emoji); });
    qr.appendChild(b);
  });
  const mw = 260, mh = 60;
  let left = Math.min(x - mw / 2, window.innerWidth - mw - 10);
  let top = Math.max(y - mh - 12, 12);
  if (left < 10) left = 10;
  qr.style.left = left + "px"; qr.style.top = top + "px";
  qr.classList.remove("hidden");
}
function hideQuickReactions() { if (elements.quickReactions) elements.quickReactions.classList.add("hidden"); }

/* =========================================================
   FILE UPLOAD
   ========================================================= */
function handleFileSelect(event) {
  const incoming = Array.from(event.target.files || []);
  event.target.value = "";
  if (!incoming.length) return;

  const maxSize = currentMaxFileSize();
  const maxMb   = (maxSize / (1024 * 1024)).toFixed(0);
  const remaining = MAX_FILES_PER_MESSAGE - selectedFiles.length;
  if (remaining <= 0) return showToast("You can attach up to " + MAX_FILES_PER_MESSAGE + " files per message.", "error");

  const accepted = [];
  let skippedLarge = 0, skippedCount = 0;
  for (const f of incoming) {
    if (accepted.length >= remaining) { skippedCount++; continue; }
    if (f.size > maxSize) { skippedLarge++; continue; }
    accepted.push(f);
  }
  selectedFiles = selectedFiles.concat(accepted);
  renderSelectedFiles();

  if (skippedLarge && skippedCount) {
    showToast(accepted.length + " attached. " + skippedLarge + " too large (> " + maxMb + " MB), " + skippedCount + " over limit.", "error");
  } else if (skippedLarge) {
    showToast(skippedLarge + " file(s) skipped — over " + maxMb + " MB.", "error");
  } else if (skippedCount) {
    showToast("Attached first " + accepted.length + " — max reached.", "error");
  } else if (accepted.length) {
    showToast("Attached " + accepted.length + " file" + (accepted.length === 1 ? "" : "s") + ".", "success");
  }
}

function renderSelectedFiles() {
  const box = elements.selectedFile;
  if (!box) return;
  box.innerHTML = "";
  if (!selectedFiles.length) { box.classList.add("hidden"); return; }
  box.classList.remove("hidden");
  const totalSize = selectedFiles.reduce((a, f) => a + f.size, 0);
  const header = document.createElement("div");
  header.className = "selected-file-header";
  header.innerHTML =
    '<span><strong>' + selectedFiles.length + '</strong> file' + (selectedFiles.length === 1 ? "" : "s") +
    ' • ' + formatFileSize(totalSize) + '</span>' +
    '<button type="button" class="selected-file-clear" title="Remove all">Clear</button>';
  header.querySelector(".selected-file-clear").addEventListener("click", () => { selectedFiles = []; renderSelectedFiles(); });
  box.appendChild(header);
  const grid = document.createElement("div");
  grid.className = "selected-files-grid";
  box.appendChild(grid);
  selectedFiles.forEach((f, idx) => {
    const chip = document.createElement("div");
    chip.className = "file-chip";
    const isImage = (f.type || "").indexOf("image/") === 0;
    const ext = (f.name.split(".").pop() || "file").slice(0, 4).toUpperCase();
    chip.innerHTML =
      (isImage ? '<span class="file-chip-thumb"></span>' : '<span class="file-chip-ext">' + escapeHtml(ext) + '</span>') +
      '<span class="file-chip-info">' +
        '<span class="file-chip-name" title="' + escapeAttr(f.name) + '">' + escapeHtml(f.name) + '</span>' +
        '<span class="file-chip-size">' + formatFileSize(f.size) + '</span>' +
      '</span>' +
      '<button type="button" class="file-chip-remove" aria-label="Remove file">×</button>';
    if (isImage) {
      const thumb = chip.querySelector(".file-chip-thumb");
      try { thumb.style.backgroundImage = "url('" + URL.createObjectURL(f) + "')"; } catch (e) {}
    }
    chip.querySelector(".file-chip-remove").addEventListener("click", () => { selectedFiles.splice(idx, 1); renderSelectedFiles(); });
    grid.appendChild(chip);
  });
}

/* =========================================================
   SEND
   ========================================================= */
function startSendLongPress(e) {
  if (e.pointerType && e.pointerType !== "touch" && e.pointerType !== "pen") return;
  if (longPressTimer) clearTimeout(longPressTimer);
  longPressTimer = setTimeout(() => { longPressTimer = null; openScheduleModal(); }, 600);
}
function cancelSendLongPress() { if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; } }

function queueMessageLocally(convId, content, replyId) {
  try {
    const key = "justgo_queue_" + currentUser.id;
    const raw = localStorage.getItem(key) || "[]";
    const arr = JSON.parse(raw);
    arr.push({
      id: "q_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
      convId, content, replyId, at: Date.now()
    });
    localStorage.setItem(key, JSON.stringify(arr));
    return arr[arr.length - 1];
  } catch (e) { return null; }
}

async function syncPendingMessages() {
  if (!currentUser) return;
  try {
    const key = "justgo_queue_" + currentUser.id;
    const raw = localStorage.getItem(key);
    if (!raw) return;
    const arr = JSON.parse(raw);
    if (!arr.length) return;
    const remaining = [];
    for (const item of arr) {
      try {
        await db.from("messages").insert({
          conversation_id: item.convId,
          sender_id: currentUser.id,
          content: item.content,
          reply_to_id: item.replyId || null
        });
      } catch (e) { remaining.push(item); }
    }
    localStorage.setItem(key, JSON.stringify(remaining));
    if (arr.length !== remaining.length) {
      showToast("Queued messages sent.", "success");
      if (currentConversation) await loadMessages();
    }
  } catch (e) {}
}

async function sendMessage(event) {
  if (event && event.preventDefault) event.preventDefault();
  if (!currentUser || !currentConversation) return;

  if (currentConversation.is_group &&
      (currentConversation.announcements_only || currentConversation.posting_mode === "admins") &&
      !isAdminInCurrentConversation()) {
    return showToast("Only admins can post in this group.", "error");
  }

  const content = elements.messageInput.value.trim();
  const filesForUpload = selectedFiles.slice();
  if (!content && !filesForUpload.length) return;

  const replyId = replyTarget && replyTarget.id ? replyTarget.id : null;
  const convId = currentConversation.id;

  // Offline? Queue it and show optimistic row.
  if (isOffline()) {
    queueMessageLocally(convId, content, replyId);
    showToast("Message queued — will send when online.", "success");
  }

  elements.messageInput.value = "";
  autoResizeTextarea();
  selectedFiles = []; renderSelectedFiles();
  elements.fileInput.value = "";
  clearReply(); clearDraft(convId); stopTyping(); broadcastStopTypingAny();

  const tempId = "tmp_" + (++optimisticCounter) + "_" + Date.now();
  const optimisticMessage = {
    id: tempId, conversation_id: convId, sender_id: currentUser.id,
    content: content || "", created_at: new Date().toISOString(),
    reply_to_id: replyId || null, kind: 'text', meta: {},
    __optimistic: true, message_attachments: [], message_reactions: [], message_reads: []
  };
  const senderMap = currentProfile ? { [currentUser.id]: currentProfile } : {};
  let optRow = null;
  try {
    optRow = await buildMessageRow(optimisticMessage, senderMap, true);
    insertMessageRow(optRow, optimisticMessage.created_at);
    scrollToBottom();
  } catch (e) { dbg("optimistic row build failed", e); }

  const previewText = content || (filesForUpload.length === 1 ? "📎 " + filesForUpload[0].name : "📎 " + filesForUpload.length + " files");
  bumpConversationInSidebar(convId, previewText, optimisticMessage.created_at, 0);

  if (isOffline()) {
    // Row remains visible; queued.
    return;
  }

  elements.sendBtn.disabled = true;
  try {
    const insertData = { conversation_id: convId, sender_id: currentUser.id, content: content || "" };
    if (replyId) insertData.reply_to_id = replyId;
    const { data: message, error } = await db.from("messages").insert(insertData).select().single();
    if (error) throw error;

    if (optRow && optRow.parentNode) optRow.remove();
    else {
      const orphan = elements.messages.querySelector('[data-message-id="' + tempId + '"]');
      if (orphan) orphan.remove();
    }

    try {
      await renderMessageFromPayload(message, { forceScroll: true });
    } catch (e) {
      await loadMessages();
    }

    if (filesForUpload.length) showUploadingPlaceholders(message.id, filesForUpload);
    scheduleMarkRead(convId);

    if (filesForUpload.length) {
      const uploads = filesForUpload.map(f =>
        uploadOneAttachment(f, message.id, convId)
          .then(() => ({ ok: true, file: f }))
          .catch(err => ({ ok: false, file: f, error: err }))
      );
      const results = await Promise.all(uploads);
      await loadSingleMessage(message.id);
      const failed = results.filter(r => !r.ok);
      if (failed.length) showToast(failed.length + " of " + filesForUpload.length + " file(s) failed to upload.", "error");
      else showToast(filesForUpload.length + " file" + (filesForUpload.length === 1 ? "" : "s") + " sent.", "success");
    }
  } catch (e) {
    if (optRow && optRow.parentNode) optRow.remove();
    else {
      const orphan = elements.messages.querySelector('[data-message-id="' + tempId + '"]');
      if (orphan) orphan.remove();
    }
    // If the failure was due to being offline, queue it.
    if (isOffline()) {
      queueMessageLocally(convId, content, replyId);
      showToast("Offline — message queued.", "success");
    } else {
      showToast(friendlyError(e), "error");
    }
  } finally {
    elements.sendBtn.disabled = false;
  }
}

function showUploadingPlaceholders(messageId, files) {
  const row = elements.messages.querySelector('[data-message-id="' + messageId + '"]');
  if (!row) return;
  const bubble = row.querySelector(".message-bubble");
  if (!bubble) return;
  const existing = bubble.querySelector(".uploading-stack"); if (existing) existing.remove();
  const stack = document.createElement("div");
  stack.className = "uploading-stack";
  files.forEach(f => {
    const item = document.createElement("div");
    item.className = "uploading-item";
    const ext = (f.name.split(".").pop() || "file").slice(0, 4).toUpperCase();
    item.innerHTML = '<span class="up-ic">' + escapeHtml(ext) + '</span><span class="up-name">' + escapeHtml(f.name) + '</span><span class="up-spinner"></span>';
    stack.appendChild(item);
  });
  bubble.appendChild(stack);
}

async function uploadOneAttachment(file, messageId, conversationId) {
  const compressed = await maybeCompressImage(file);
  const safeName = compressed.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const unique = Date.now() + "-" + Math.random().toString(36).slice(2, 8);
  const path = currentUser.id + "/" + conversationId + "/" + messageId + "/" + unique + "-" + safeName;
  const { error: upErr } = await db.storage.from(STORAGE_BUCKET).upload(path, compressed, { cacheControl: "3600", upsert: false });
  if (upErr) throw upErr;

  const expiresAt = new Date(Date.now() + currentFileTtlMs()).toISOString();
  const { error: attErr } = await db.from("message_attachments").insert({
    message_id: messageId, conversation_id: conversationId, uploader_id: currentUser.id,
    storage_path: path, file_name: compressed.name, // find the db.from("message_attachments").insert({...}) inside uploadOneAttachment
// add these two fields:
    view_once: !!file._view_once,
    viewed_by: [],
    mime_type: compressed.type || "application/octet-stream", size_bytes: compressed.size,
    expires_at: expiresAt
  });
  if (attErr) {
    try { await db.storage.from(STORAGE_BUCKET).remove([path]); } catch (e) {}
    throw attErr;
  }
  return path;
}

async function maybeCompressImage(file, maxEdge, quality) {
  if (!file.type || file.type.indexOf("image/") !== 0) return file;
  if (file.type === "image/gif") return file;
  if (file.size < 500 * 1024) return file;
  maxEdge = maxEdge || 1600; quality = quality || 0.82;
  return new Promise(resolve => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let w = img.naturalWidth, h = img.naturalHeight;
      if (w <= maxEdge && h <= maxEdge && file.size < 1024 * 1024) return resolve(file);
      if (w > h && w > maxEdge) { h = Math.round(h * maxEdge / w); w = maxEdge; }
      else if (h > maxEdge) { w = Math.round(w * maxEdge / h); h = maxEdge; }
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(blob => {
        if (!blob || blob.size >= file.size) return resolve(file);
        const newName = file.name.replace(/\.[^.]+$/, "") + ".jpg";
        resolve(new File([blob], newName, { type: "image/jpeg", lastModified: Date.now() }));
      }, "image/jpeg", quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

/* =========================================================
   SCHEDULE
   ========================================================= */
function openScheduleModal() {
  if (!currentUser || !currentConversation) return;
  if (isPremiumFeatureLocked('scheduled_messages')) { showPremiumUpsell('Scheduled messages'); return; }
  const content = elements.messageInput.value.trim();
  if (!content && !selectedFiles.length) return showToast("Type a message first.", "error");
  elements.schedulePreview.textContent = content || ("📎 " + selectedFiles.length + " file(s)");
  const d = new Date(Date.now() + 30 * 60 * 1000);
  const iso = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  elements.scheduleWhen.value = iso;
  elements.scheduleMessage.classList.add("hidden");
  openModal(elements.scheduleModal);
}
function handleScheduleQuick(e) {
  const btn = e.target.closest("button[data-min]"); if (!btn) return;
  const min = parseInt(btn.dataset.min, 10);
  const d = new Date(Date.now() + min * 60 * 1000);
  const iso = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  elements.scheduleWhen.value = iso;
}
async function confirmSchedule() {
  if (!currentConversation) return;
  if (isPremiumFeatureLocked('scheduled_messages')) return showPremiumUpsell('Scheduled messages');
  const when = elements.scheduleWhen.value;
  if (!when) return showScheduleMessage("Pick a time.", "error");
  const scheduledFor = new Date(when);
  if (isNaN(scheduledFor) || scheduledFor.getTime() <= Date.now()) return showScheduleMessage("Pick a future time.", "error");
  const content = elements.messageInput.value.trim();
  const replyId = replyTarget && replyTarget.id ? replyTarget.id : null;
  elements.scheduleConfirmBtn.disabled = true;
  elements.scheduleConfirmBtn.textContent = "Scheduling…";
  try {
    const { error } = await db.from("scheduled_messages").insert({
      user_id: currentUser.id, conversation_id: currentConversation.id,
      content, reply_to_id: replyId, scheduled_for: scheduledFor.toISOString()
    });
    if (error) throw error;
    elements.messageInput.value = ""; autoResizeTextarea(); clearReply();
    closeModal(elements.scheduleModal);
    showToast("Scheduled for " + scheduledFor.toLocaleString(), "success");
  } catch (e) { showScheduleMessage(friendlyError(e), "error"); }
  finally { elements.scheduleConfirmBtn.disabled = false; elements.scheduleConfirmBtn.textContent = "Schedule"; }
}
function showScheduleMessage(m, t) {
  elements.scheduleMessage.textContent = m;
  elements.scheduleMessage.classList.remove("hidden", "error", "success");
  if (t) elements.scheduleMessage.classList.add(t);
}

/* =========================================================
   DRAFTS
   ========================================================= */
function saveDraftDebounced() {
  if (!currentConversation) return;
  const convId = currentConversation.id;
  clearTimeout(draftTimers[convId]);
  draftTimers[convId] = setTimeout(() => {
    try {
      const text = elements.messageInput.value;
      if (text) localStorage.setItem("justgo_draft_" + convId, text);
      else localStorage.removeItem("justgo_draft_" + convId);
    } catch (e) {}
  }, 400);
}

function restoreDraft() {
  if (!currentConversation) return;
  if (elements.messageInput.value.trim().length > 0) return;
  try {
    const text = localStorage.getItem("justgo_draft_" + currentConversation.id) || "";
    if (!text) return;
    elements.messageInput.value = text;
    autoResizeTextarea();
  } catch (e) {}
}

function clearDraft(convId) { try { localStorage.removeItem("justgo_draft_" + convId); } catch (e) {} }

/* =========================================================
   LOAD SINGLE MESSAGE
   ========================================================= */
async function loadSingleMessage(messageId) {
  if (!messageId || !elements.messages) return;
  const { data, error } = await db.from("messages").select("*").eq("id", messageId).maybeSingle();
  if (error || !data) return;
  const enriched = await enrichMessages([data.id], [data]);
  const msg = enriched[0];
  if (!msg) return;
  const senderMap = msg._senders || {};
  const old = elements.messages.querySelector('[data-message-id="' + messageId + '"]');
  const nearBottom = isNearBottom();
  let row;
  try { row = await buildMessageRow(msg, senderMap, true); } catch (e) { return; }
  if (old) old.replaceWith(row);
  else insertMessageRow(row, data.created_at);
  if (nearBottom) scrollToBottom();
}

/* =========================================================
   TYPING
   ========================================================= */
function startTyping() {
  if (!typingChannel || !currentConversation) return;
  const now = Date.now();
  if (now - lastTypingSent < TYPING_THROTTLE_MS) return;
  lastTypingSent = now;
  try {
    typingChannel.send({ type: "broadcast", event: "typing", payload: {
      user_id: currentUser.id,
      name: currentProfile ? (currentProfile.display_name || currentProfile.username) : "Someone",
      conversation_id: currentConversation.id
    }});
  } catch (e) {}
}
function stopTyping() {
  if (!typingChannel || !currentConversation) return;
  lastTypingSent = 0;
  try {
    typingChannel.send({ type: "broadcast", event: "stop-typing", payload: { user_id: currentUser.id, conversation_id: currentConversation.id } });
  } catch (e) {}
}
function subscribeTyping() {
  if (!currentConversation) {
    if (typingChannel) { try { db.removeChannel(typingChannel); } catch (e) {} typingChannel = null; }
    typingTimers = {}; typingExpiryTimers = {};
    renderTypingIndicator();
    return;
  }

  const desired = "typing-" + currentConversation.id;
  if (typingChannel && typingChannel.__name === desired) return;
  if (typingChannel) { try { db.removeChannel(typingChannel); } catch (e) {} typingChannel = null; }

  typingTimers = {}; typingExpiryTimers = {};
  renderTypingIndicator();

  typingChannel = db.channel(desired, { config: { broadcast: { self: false } } });
  typingChannel.__name = desired;
  typingChannel
    .on("broadcast", { event: "typing" }, payload => {
      const p = payload.payload;
      if (!p || p.conversation_id !== currentConversation.id) return;
      if (p.user_id === currentUser.id) return;
      typingTimers[p.user_id] = { name: p.name || "Someone" };
      renderTypingIndicator();
      clearTimeout(typingExpiryTimers[p.user_id]);
      typingExpiryTimers[p.user_id] = setTimeout(() => {
        delete typingTimers[p.user_id]; delete typingExpiryTimers[p.user_id]; renderTypingIndicator();
      }, TYPING_EXPIRY_MS);
    })
    .on("broadcast", { event: "stop-typing" }, payload => {
      const p = payload.payload;
      if (!p) return;
      delete typingTimers[p.user_id];
      clearTimeout(typingExpiryTimers[p.user_id]);
      delete typingExpiryTimers[p.user_id];
      renderTypingIndicator();
    })
    .subscribe();
}
function renderTypingIndicator() {
  if (!elements.typingIndicator) return;
  const ids = Object.keys(typingTimers);
  if (!ids.length) {
    elements.typingIndicator.classList.add("hidden");
    elements.typingIndicator.textContent = "";
    return;
  }
  elements.typingIndicator.classList.remove("hidden");
  if (ids.length === 1) elements.typingIndicator.textContent = (typingTimers[ids[0]].name || "Someone") + " is typing…";
  else if (ids.length === 2) elements.typingIndicator.textContent = (typingTimers[ids[0]].name || "Someone") + " and " + (typingTimers[ids[1]].name || "Someone") + " are typing…";
  else elements.typingIndicator.textContent = ids.length + " people are typing…";
}
function subscribeGlobalTyping() {
  if (globalTypingChannel) { try { db.removeChannel(globalTypingChannel); } catch (e) {} globalTypingChannel = null; }
  if (!currentUser) return;
  globalTypingChannel = db.channel("typing-global-" + currentUser.id, { config: { broadcast: { self: false } } });
  globalTypingChannel
    .on("broadcast", { event: "typing-any" }, payload => {
      const p = payload.payload;
      if (!p || !p.conversation_id) return;
      if (p.user_id === currentUser.id) return;
      if (currentConversation && currentConversation.id === p.conversation_id) return;
      if (!myConversationIds.includes(p.conversation_id)) return;
      if (!typingInConversations.has(p.conversation_id)) typingInConversations.set(p.conversation_id, new Map());
      const map = typingInConversations.get(p.conversation_id);
      map.set(p.user_id, Date.now());
      updateSidebarTyping(p.conversation_id);
      setTimeout(() => {
        const m = typingInConversations.get(p.conversation_id); if (!m) return;
        if (!m.has(p.user_id)) return;
        m.delete(p.user_id);
        if (m.size === 0) typingInConversations.delete(p.conversation_id);
        updateSidebarTyping(p.conversation_id);
      }, TYPING_EXPIRY_MS);
    })
    .on("broadcast", { event: "stop-typing-any" }, payload => {
      const p = payload.payload;
      if (!p || !p.conversation_id) return;
      const m = typingInConversations.get(p.conversation_id); if (!m) return;
      m.delete(p.user_id);
      if (m.size === 0) typingInConversations.delete(p.conversation_id);
      updateSidebarTyping(p.conversation_id);
    })
    .subscribe();
}
function broadcastTypingAny() {
  if (!globalTypingChannel || !currentConversation) return;
  const now = Date.now();
  if (now - lastTypingSent < TYPING_THROTTLE_MS) return;
  try {
    globalTypingChannel.send({ type: "broadcast", event: "typing-any", payload: {
      user_id: currentUser.id,
      name: currentProfile ? (currentProfile.display_name || currentProfile.username) : "Someone",
      conversation_id: currentConversation.id
    }});
  } catch (e) {}
}
function broadcastStopTypingAny() {
  if (!globalTypingChannel || !currentConversation) return;
  try {
    globalTypingChannel.send({ type: "broadcast", event: "stop-typing-any", payload: { user_id: currentUser.id, conversation_id: currentConversation.id } });
  } catch (e) {}
}
function updateSidebarTyping(convId) {
  if (!elements.conversationList) return;
  const item = elements.conversationList.querySelector('.conversation[data-conv-id="' + convId + '"]');
  if (!item) return;
  const prevEl = item.querySelector(".conversation-preview"); if (!prevEl) return;
  const m = typingInConversations.get(convId);
  if (m && m.size > 0) {
    if (!prevEl.classList.contains("typing")) {
      prevEl.dataset.originalText = prevEl.textContent;
      prevEl.dataset.originalBold = prevEl.classList.contains("bold") ? "1" : "";
    }
    prevEl.classList.add("typing"); prevEl.textContent = "typing…";
  } else {
    prevEl.classList.remove("typing");
    if (prevEl.dataset.originalText !== undefined) {
      prevEl.textContent = prevEl.dataset.originalText;
      if (prevEl.dataset.originalBold === "1") prevEl.classList.add("bold");
      else prevEl.classList.remove("bold");
      delete prevEl.dataset.originalText;
      delete prevEl.dataset.originalBold;
    }
  }
}

/* =========================================================
   CHAT SEARCH
   ========================================================= */
function toggleChatSearch() {
  if (!elements.chatSearchBar) return;
  elements.chatSearchBar.classList.toggle("hidden");
  if (!elements.chatSearchBar.classList.contains("hidden") && elements.chatSearchInput) elements.chatSearchInput.focus();
  else { if (elements.chatSearchInput) elements.chatSearchInput.value = ""; loadMessages(); }
}
async function runChatSearch() {
  if (!elements.chatSearchInput || !elements.messages) return;
  const q = elements.chatSearchInput.value.trim().toLowerCase();
  if (!q) return loadMessages();
  if (!currentConversation) return;
  try {
    const { data } = await db.from("messages").select("*")
      .eq("conversation_id", currentConversation.id)
      .ilike("content", "%" + q + "%")
      .order("created_at", { ascending: true }).limit(200);
    if (!data || !data.length) {
      elements.messages.innerHTML = '<div class="messages-empty">No matching messages.</div>';
      return;
    }
    const enriched = await enrichMessages(data.map(m => m.id), data);
    await renderMessages(enriched, false);
  } catch (e) {}
}

/* =========================================================
   FILES PANEL
   ========================================================= */
async function toggleFilesPanel() {
  if (!elements.filesPanel) return;
  elements.filesPanel.classList.toggle("hidden");
  if (!elements.filesPanel.classList.contains("hidden")) await loadSharedFiles();
}
async function loadSharedFiles() {
  if (!elements.filesList) return;
  skeletonList(elements.filesList, "file-item", 4);
  if (!currentConversation) return;
  const { data, error } = await db.from("message_attachments").select("*")
    .eq("conversation_id", currentConversation.id).order("created_at", { ascending: false });
  if (error) { elements.filesList.innerHTML = '<div class="files-empty">Could not load files.</div>'; return; }
  if (!data || !data.length) { elements.filesList.innerHTML = '<div class="files-empty">No files shared yet.</div>'; return; }
  const now = Date.now();
  elements.filesList.innerHTML = "";
  for (const att of data) {
    const expired = att.expires_at && new Date(att.expires_at).getTime() < now;
    const row = document.createElement("div");
    row.className = "file-item";
    let ext = "FILE";
    if (att.file_name && att.file_name.indexOf(".") > -1) ext = att.file_name.split(".").pop().slice(0, 4);
    let badgeHtml = "";
    if (att.expires_at) {
      const remaining = new Date(att.expires_at).getTime() - now;
      if (expired) badgeHtml = '<div class="file-expiry-badge expired">Expired</div>';
      else {
        const soon = remaining < 60 * 60 * 1000 ? " soon" : "";
        badgeHtml = '<div class="file-expiry-badge' + soon + '">Deletes in ' + humanizeRemaining(remaining) + '</div>';
      }
    }
    row.innerHTML = '<div class="file-icon">' + escapeHtml(ext) + '</div>' +
      '<div class="file-meta"><div class="file-name">' + escapeHtml(att.file_name) + '</div>' +
      '<div class="file-size">' + formatFileSize(att.size_bytes) + '</div>' + badgeHtml + '</div>';
    if (!expired) {
      let url = attachmentUrlCache.get(att.storage_path);
      if (!url) {
        try {
          const { data: signed } = await db.storage.from(STORAGE_BUCKET).createSignedUrl(att.storage_path, 3600);
          if (signed) { url = signed.signedUrl; attachmentUrlCache.set(att.storage_path, url); }
        } catch (e) {}
      }
      if (url) {
        const a = document.createElement("a");
        a.className = "file-action"; a.href = url; a.target = "_blank"; a.rel = "noopener"; a.textContent = "Open";
        row.appendChild(a);
      }
    }
    elements.filesList.appendChild(row);
  }
}
function humanizeRemaining(ms) {
  if (ms <= 0) return "now";
  const h = Math.floor(ms / (60*60*1000)), m = Math.floor((ms % (60*60*1000)) / (60*1000));
  if (h > 0) return h + "h " + m + "m";
  return m + "m";
}

console.log('[JustGo] side.js loaded — v3');