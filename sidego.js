/* =========================================================================
   JustGo — sidego.js (v4)
   Attachment cards, pinned, message menu, edit/delete, reactions, seen-by,
   realtime subscriptions, conversation list, sidebar, chat-list menu.

   Changelog v3 → v4:
     • Edit message uses custom modal (editMessageModal).
     • Delete attachment cleanup: hard-delete storage + attachments on
       deleteMessage().
     • Chat list menu: Delete/Exit, Pin (max 3), Mark unread,
       Group info, Raise Funds, Split money.
     • Realtime: system messages render, member joins/leaves insert
       system message via RPC.
     • Version tag updated.
   ========================================================================= */

/* =========================================================
   ATTACHMENT CARD
   ========================================================= */
async function createFileCard(attachment) {
  const card = document.createElement("div");
  card.className = "file-card";
  if (!attachment) return card;

  const expires = attachment.expires_at ? new Date(attachment.expires_at).getTime() : 0;
  const now = Date.now();
  const expired = expires && expires < now;

  if (expired) {
    card.classList.add("file-card-expired");
    const err = document.createElement("div");
    err.className = "expired-file-chip";
    err.innerHTML = '📎 <span>' + escapeHtml(attachment.file_name || "File") + '</span> — expired';
    card.appendChild(err);
    return card;
  }

  try {
    let url = attachmentUrlCache.get(attachment.storage_path);
    if (!url) {
      const { data, error } = await db.storage.from(STORAGE_BUCKET).createSignedUrl(attachment.storage_path, 3600);
      if (error) throw error;
      url = data.signedUrl;
      attachmentUrlCache.set(attachment.storage_path, url);
    }
    const mime = attachment.mime_type || "";

    if (mime.indexOf("image/") === 0) {
      const img = document.createElement("img");
      img.className = "file-preview";
      img.src = url;
      img.alt = attachment.file_name || "";
      img.loading = "lazy";
      img.decoding = "async";
      img.addEventListener("click", () => window.open(url, "_blank"));
      card.appendChild(img);
    }

    const infoRow = document.createElement("div");
    infoRow.className = "file-icon-row";
    let ext = "FILE";
    if (attachment.file_name && attachment.file_name.indexOf(".") > -1)
      ext = attachment.file_name.split(".").pop().slice(0, 4);
    const icon = document.createElement("div");
    icon.className = "file-icon"; icon.textContent = ext;
    const meta = document.createElement("div");
    meta.className = "file-meta";
    const name = document.createElement("div");
    name.className = "file-name"; name.textContent = attachment.file_name || "file";
    const size = document.createElement("div");
    size.className = "file-size"; size.textContent = formatFileSize(attachment.size_bytes);
    meta.appendChild(name); meta.appendChild(size);
    infoRow.appendChild(icon); infoRow.appendChild(meta);
    card.appendChild(infoRow);

    if (expires) {
      const badge = document.createElement("div");
      badge.className = "file-expiry-badge";
      const remaining = expires - now;
      if (remaining < 60 * 60 * 1000) badge.classList.add("soon");
      badge.textContent = "Deletes in " + humanizeRemaining(remaining);
      card.appendChild(badge);
    }

    const actions = document.createElement("div");
    actions.className = "file-actions";
    const openLink = document.createElement("a");
    openLink.className = "file-action";
    openLink.href = url; openLink.target = "_blank"; openLink.rel = "noopener";
    openLink.textContent = "Open";
    actions.appendChild(openLink);
    const dl = document.createElement("button");
    dl.type = "button"; dl.className = "file-action"; dl.textContent = "Download";
    dl.addEventListener("click", async () => {
      try {
        const r = await fetch(url);
        const blob = await r.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl; a.download = attachment.file_name || "file";
        document.body.appendChild(a); a.click(); a.remove();
        URL.revokeObjectURL(blobUrl);
      } catch (err) { window.open(url, "_blank"); }
    });
    actions.appendChild(dl);
    card.appendChild(actions);
  } catch (e) {
    const err = document.createElement("div");
    err.className = "file-name";
    err.textContent = (attachment.file_name || "File") + " (unavailable)";
    card.appendChild(err);
  }
  return card;
}

/* =========================================================
   PINNED
   ========================================================= */
let _pinnedLoadedForConvId = null;

function isMessagePinned(messageId) {
  if (!messageId) return false;
  return pinnedMessages.some(pm => pm.message_id === messageId);
}

async function pinMessage(messageId) {
  if (!currentConversation) return;
  if (currentConversation.is_group && !isAdminInCurrentConversation()) {
    showToast("Only admins can pin messages.", "error");
    return;
  }
  try {
    const { error } = await db.from("pinned_messages").insert({
      conversation_id: currentConversation.id,
      message_id: messageId,
      pinned_by: currentUser.id
    });
    if (error) throw error;
    _pinnedLoadedForConvId = null;
    await loadPinnedMessages();
    await loadSingleMessage(messageId);
    showToast("Message pinned.", "success");
  } catch (e) { showToast(friendlyError(e), "error"); }
}
async function unpinByMessageId(messageId) {
  const pm = pinnedMessages.find(p => p.message_id === messageId);
  if (!pm) return;
  await unpinMessage(pm.id);
}
async function unpinMessage(pinId) {
  try {
    const { error } = await db.from("pinned_messages").delete().eq("id", pinId);
    if (error) throw error;
    _pinnedLoadedForConvId = null;
    await loadPinnedMessages();
    await refreshAllPinnedIndicators();
    showToast("Unpinned.", "success");
  } catch (e) { showToast("Could not unpin.", "error"); }
}
async function loadPinnedMessages() {
  if (!Array.isArray(pinnedMessages)) pinnedMessages = [];
  if (!currentConversation) { pinnedMessages = []; _pinnedLoadedForConvId = null; return; }
  if (_pinnedLoadedForConvId === currentConversation.id) return;
  _pinnedLoadedForConvId = currentConversation.id;
  try {
    const { data } = await db.from("pinned_messages")
      .select("*, messages:message_id(*)")
      .eq("conversation_id", currentConversation.id)
      .order("pinned_at", { ascending: false });
    pinnedMessages = data || [];
  } catch (e) { pinnedMessages = []; }
}
async function refreshAllPinnedIndicators() {
  if (!elements.messages) return;
  const pinnedIds = new Set(pinnedMessages.map(p => p.message_id));
  elements.messages.querySelectorAll(".message-row").forEach(row => {
    const id = row.dataset.messageId;
    const bubble = row.querySelector(".message-bubble");
    if (!bubble) return;
    const existing = bubble.querySelector(".pin-indicator");
    if (pinnedIds.has(id)) {
      bubble.classList.add("pinned");
      if (!existing) {
        const p = document.createElement("span");
        p.className = "pin-indicator"; p.textContent = "📌";
        bubble.appendChild(p);
      }
    } else {
      bubble.classList.remove("pinned");
      if (existing) existing.remove();
    }
  });
}

function isAdminInCurrentConversation() {
  if (!currentConversation || !currentConversation.is_group) return false;
  return currentParticipants.some(p => p.user_id === currentUser.id && p.role === "admin");
}
function isProAdminInCurrentConversation() {
  if (!currentConversation || !currentConversation.is_group) return false;
  return currentConversation.created_by === currentUser.id;
}

function isMentionedMe(message) {
  if (!message || !message.content) return false;
  const content = String(message.content);
  if (!currentProfile) return false;
  const myUsername = currentProfile.username;
  if (!myUsername) return false;
  const re = new RegExp("(^|[^\\w.])@" + myUsername + "([^\\w.]|$)", "i");
  return re.test(content);
}

/* =========================================================
   MESSAGE MENU
   ========================================================= */
function showMessageMenu(x, y, message) {
  const menu = elements.messageMenu;
  if (!menu) return;

  menu.innerHTML = "";
  lastMessageMenuMessage = message;

  const isAdmin = isAdminInCurrentConversation();
  const isMine = message.sender_id === currentUser.id;
  const canManage = isMine || isAdmin;
  const isSaved = savedMessageIds.has(message.id);
  const isPinned = isMessagePinned(message.id);
  const isMoney = message.kind === 'money';
  const isFundraiser = message.kind === 'fundraiser';
  const isBookShare = message.kind === 'book_share';
  const isSystem = message.kind === 'system';

  if (isSystem) {
    hideMessageMenu();
    return;
  }

  const emojiRow = document.createElement("div");
  emojiRow.className = "emoji-row";
  DEFAULT_EMOJIS.slice(0, 12).forEach(emoji => {
    const btn = document.createElement("button");
    btn.textContent = emoji; btn.type = "button";
    btn.addEventListener("click", () => { hideMessageMenu(); toggleReaction(message.id, emoji); });
    emojiRow.appendChild(btn);
  });
  menu.appendChild(emojiRow);

  addMenuSectionLabel(menu, "Quick");
  if (!isMoney && !isFundraiser) {
    addMenuIconItem(menu, "↩", "Reply", () => { hideMessageMenu(); setReplyTarget(message); });
  }
  if (!isFundraiser) {
    addMenuIconItem(menu, isSaved ? "★" : "☆", isSaved ? "Remove from saved" : "Save message", () => {
      hideMessageMenu(); toggleSaveMessage(message);
    });
  }
  addMenuIconItem(menu, "➡", "Forward", () => { hideMessageMenu(); openForwardModal(message); });
  if (!isMoney && !isFundraiser && !isBookShare) {
    addMenuIconItem(menu, "📋", "Copy text", () => { hideMessageMenu(); copyMessage(message); });
  }
  if (!isFundraiser) {
    addMenuIconItem(menu, "☑️", "Select multiple", () => { hideMessageMenu(); enterMultiSelectMode(message.id); });
  }
  if (!isMine && !isMoney && !isFundraiser && message.sender_id) {
    addMenuIconItem(menu, "₹", "Tip this message", () => { hideMessageMenu(); openTipModal(message); });
  }
  if (!isMoney && !isFundraiser) {
    addMenuIconItem(menu, "🔗", "Copy link", () => {
      hideMessageMenu();
      copyText("https://justgo.42web.io/#msg=" + message.id, "Message link copied.");
    });
  }
  // Save to JustGo Notes
  addMenuIconItem(menu, "📝", "Save to JustGo Notes", () => {
    hideMessageMenu();
    openSaveNoteModal(message);
  });

  const hasManageOptions = (canManage && !message.deleted) || (isAdmin && !message.deleted);
  if (hasManageOptions) addMenuSectionLabel(menu, "Manage");
  if (canManage && !message.deleted && !isMoney && !isFundraiser && !isBookShare) {
    addMenuIconItem(menu, "✎", "Edit", () => { hideMessageMenu(); editMessage(message); });
  }
  if (isAdmin && !message.deleted && currentConversation && currentConversation.is_group && !isFundraiser) {
    addMenuIconItem(menu, "📌", isPinned ? "Unpin" : "Pin to top", () => {
      hideMessageMenu();
      if (isPinned) unpinByMessageId(message.id); else pinMessage(message.id);
    });
  }
  if (canManage && !message.deleted && !isMoney && !isFundraiser) {
    addMenuIconItem(menu, "🗑", "Delete for everyone", () => { hideMessageMenu(); deleteMessage(message); }, true);
  }
  if (message.kind === 'money' && message.meta && message.meta.transaction_id && message.meta.status === 'completed') {
    addMenuIconItem(menu, "↩", "Reverse transaction (admin)", () => { hideMessageMenu(); openAdminReverse(message.meta.transaction_id); }, true);
  }

  const mw = 300, mh = 540;
  let left = Math.min(x, window.innerWidth - mw - 10);
  let top = Math.min(y, window.innerHeight - mh - 10);
  if (left < 8) left = 8;
  if (top < 8) top = 8;
  menu.style.left = left + "px"; menu.style.top = top + "px";
  menu.classList.remove("hidden");
}
function addMenuSectionLabel(menu, text) {
  const l = document.createElement("div");
  l.className = "section-label"; l.textContent = text;
  menu.appendChild(l);
}
function addMenuIconItem(menu, icon, label, handler, danger) {
  const b = document.createElement("button");
  b.type = "button";
  if (danger) b.className = "danger";
  b.innerHTML = '<span class="mi">' + icon + '</span><span>' + escapeHtml(label) + '</span>';
  b.addEventListener("click", handler);
  menu.appendChild(b);
}
function hideMessageMenu() { if (elements.messageMenu) elements.messageMenu.classList.add("hidden"); }
function copyMessage(message) {
  const text = message.content || "";
  if (!text) return showToast("Nothing to copy.", "error");
  copyText(text, "Copied.");
}

/* =========================================================
   EDIT (custom modal) / DELETE (with attachment cleanup) / REACTIONS
   ========================================================= */
function editMessage(message) {
  if (!elements.editMessageModal) {
    // fallback
    const newText = prompt("Edit message:", message.content || "");
    if (newText === null) return;
    const trimmed = newText.trim();
    if (!trimmed) return showToast("Message cannot be empty.", "error");
    persistEdit(message, trimmed);
    return;
  }
  elements.editMessageInput.value = message.content || "";
  elements.editMessageMsg.classList.add("hidden");
  elements.editMessageMsg.classList.remove("error", "success");
  elements.editMessageModal.dataset.messageId = message.id;
  openModal(elements.editMessageModal);
  setTimeout(() => elements.editMessageInput.focus(), 80);
}

async function saveEditedMessage() {
  const id = elements.editMessageModal.dataset.messageId;
  if (!id) return;
  const trimmed = elements.editMessageInput.value.trim();
  if (!trimmed) {
    elements.editMessageMsg.textContent = "Message cannot be empty.";
    elements.editMessageMsg.classList.remove("hidden");
    elements.editMessageMsg.classList.add("error");
    return;
  }
  elements.editMessageSave.disabled = true;
  elements.editMessageSave.textContent = "Saving…";
  try {
    const { error } = await db.from("messages").update({
      content: trimmed, edited_at: new Date().toISOString()
    }).eq("id", id);
    if (error) throw error;
    closeModal(elements.editMessageModal);
    await loadSingleMessage(id);
  } catch (e) {
    elements.editMessageMsg.textContent = friendlyError(e);
    elements.editMessageMsg.classList.remove("hidden");
    elements.editMessageMsg.classList.add("error");
  } finally {
    elements.editMessageSave.disabled = false;
    elements.editMessageSave.textContent = "Save";
  }
}

async function deleteMessage(message) {
  const isAdmin = isAdminInCurrentConversation();
  const promptText = isAdmin && message.sender_id !== currentUser.id
    ? "Delete this message for everyone in the group?" : "Delete this message for everyone?";
  if (!confirm(promptText)) return;
  try {
    // 1. Clean up attachments from storage
    try {
      const { data: atts } = await db.from("message_attachments").select("id, storage_path").eq("message_id", message.id);
      if (atts && atts.length) {
        const paths = atts.map(a => a.storage_path).filter(Boolean);
        if (paths.length) {
          try { await db.storage.from(STORAGE_BUCKET).remove(paths); } catch (e) {}
        }
        await db.from("message_attachments").delete().eq("message_id", message.id);
      }
    } catch (e) {}

    // 2. Soft-delete the message
    const { error } = await db.from("messages").update({ deleted: true, content: "" }).eq("id", message.id);
    if (error) throw error;
    await loadSingleMessage(message.id);
  } catch (e) { showToast("Could not delete.", "error"); }
}

async function toggleReaction(messageId, emoji) {
  try {
    const { data: existing } = await db.from("message_reactions").select("id")
      .eq("message_id", messageId).eq("user_id", currentUser.id).eq("emoji", emoji).maybeSingle();
    if (existing) await db.from("message_reactions").delete().eq("id", existing.id);
    else await db.from("message_reactions").insert({ message_id: messageId, user_id: currentUser.id, emoji });
    await loadSingleMessage(messageId);
  } catch (e) {}
}

/* =========================================================
   SEEN BY
   ========================================================= */
async function showSeenByList(messageId) {
  try {
    const { data } = await db.from("message_reads").select("user_id, read_at").eq("message_id", messageId);
    const reads = data || [];
    const readsIds = reads.map(r => r.user_id);
    const pending = currentParticipants.filter(p =>
      p.user_id !== currentUser.id && readsIds.indexOf(p.user_id) === -1
    );
    const allIds = readsIds.concat(pending.map(p => p.user_id));
    const { data: profiles } = allIds.length
      ? await db.from("profiles").select("id, username, display_name, avatar_url, is_premium").in("id", allIds)
      : { data: [] };
    const pmap = {};
    (profiles || []).forEach(p => pmap[p.id] = p);

    const wrap = document.createElement("div");
    wrap.className = "modal show";
    wrap.innerHTML =
      '<div class="modal-card">' +
        '<div class="modal-head"><strong>Message info</strong><button type="button" class="modal-close">×</button></div>' +
        '<div class="modal-body">' +
          '<div class="chat-info-section-title">Read by (' + reads.length + ')</div><div id="seenReadBy"></div>' +
          '<div class="chat-info-section-title" style="margin-top:16px;">Not yet read (' + pending.length + ')</div><div id="seenPending"></div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(wrap);
    wrap.querySelector(".modal-close").addEventListener("click", () => wrap.remove());
    wrap.addEventListener("click", e => { if (e.target === wrap) wrap.remove(); });

    function memberRow(p) {
      const initial = (p.display_name || p.username).charAt(0).toUpperCase();
      const safeAvatar = p.avatar_url ? escapeStyleUrl(p.avatar_url) : "";
      return '<div class="chat-info-member">' +
        '<div class="avatar-small' + (p.is_premium ? ' premium-avatar' : '') + '"' +
          (safeAvatar ? ' style="background-image:url(\'' + safeAvatar + '\');color:transparent;"' : '') + '>' + escapeHtml(initial) + '</div>' +
        '<div class="chat-info-member-info"><strong>' + escapeHtml(p.display_name || p.username) +
          (p.is_premium ? ' 👑' : '') + '</strong><span>@' + escapeHtml(p.username) + '</span></div>' +
      '</div>';
    }

    const readWrap = wrap.querySelector("#seenReadBy");
    if (!reads.length) readWrap.innerHTML = '<div class="search-empty">No one has read this yet.</div>';
    else reads.forEach(r => { if (pmap[r.user_id]) readWrap.innerHTML += memberRow(pmap[r.user_id]); });

    const pendWrap = wrap.querySelector("#seenPending");
    if (!pending.length) pendWrap.innerHTML = '<div class="search-empty">Everyone has read this.</div>';
    else pending.forEach(p => { if (pmap[p.user_id]) pendWrap.innerHTML += memberRow(pmap[p.user_id]); });
  } catch (e) {}
}

/* =========================================================
   REALTIME
   ========================================================= */
let _realtimeReloadScheduled = false;
let _realtimeReloadInFlight = false;

async function loadConversationsDebounced() {
  if (_realtimeReloadInFlight) {
    _realtimeReloadScheduled = true;
    return;
  }
  _realtimeReloadInFlight = true;
  try { await loadConversations(); } catch (e) {}
  _realtimeReloadInFlight = false;
  if (_realtimeReloadScheduled) {
    _realtimeReloadScheduled = false;
    setTimeout(() => loadConversationsDebounced(), 50);
  }
}

function scheduleConversationsReload() {
  if (realtimeReloadTimer) clearTimeout(realtimeReloadTimer);
  realtimeReloadTimer = setTimeout(() => {
    realtimeReloadTimer = null;
    loadConversationsDebounced();
  }, 800);
}

function subscribeRealtime() {
  if (realtimeChannel) { try { db.removeChannel(realtimeChannel); } catch (e) {} realtimeChannel = null; }

  realtimeChannel = db.channel("justgo-realtime-" + (currentUser ? currentUser.id : "anon") + "-" + Date.now(), {
    config: { broadcast: { self: false } }
  });

  realtimeChannel
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, async payload => {
      try {
        const msg = payload.new;
        if (!msg) return;
        const isMine = msg.sender_id === currentUser.id;
        const inCurrentConv = currentConversation && msg.conversation_id === currentConversation.id;
        const isMoney = msg.kind === 'money';
        const isFundraiser = msg.kind === 'fundraiser';
        if (isMoney) await refreshWalletData();

            let previewText = buildPreviewText(msg);
    if (msg.kind === 'event' && msg.meta && msg.meta.event) {
      previewText = 'Ticket: ' + (msg.meta.event.title || 'Event');
    }

        let unreadForConv;
        if (inCurrentConv && !document.hidden) {
          unreadForConv = 0;
          unreadCounts[msg.conversation_id] = 0;
        } else if (isMine) {
          unreadForConv = unreadCounts[msg.conversation_id] || 0;
        } else {
          unreadCounts[msg.conversation_id] = (unreadCounts[msg.conversation_id] || 0) + 1;
          unreadForConv = unreadCounts[msg.conversation_id];
        }
        if (!isMine && isMuted(msg.conversation_id)) unreadForConv = unreadCounts[msg.conversation_id] || 0;

        bumpConversationInSidebar(msg.conversation_id, previewText, msg.created_at, unreadForConv);
        moveConversationToTop(msg.conversation_id);

        db.from("conversations").update({
          last_message_preview: previewText,
          last_message_at: msg.created_at,
          last_message_sender_id: msg.sender_id
        }).eq("id", msg.conversation_id).then(() => {}, () => {});

        if (inCurrentConv) {
          if (!isMine) {
            const wasNearBottom = isNearBottom();
            await renderMessageFromPayload(msg);
            if (!wasNearBottom) { unreadSinceJump++; updateJumpButton(); }
            notify(msg);
            scheduleMarkRead(currentConversation.id);
            if (isFundraiser) await loadMessages();
          } else {
            const pending = elements.messages ? elements.messages.querySelector(".message-row.pending") : null;
            if (pending) {
              pending.classList.remove("pending");
              pending.dataset.messageId = msg.id;
              const tick = pending.querySelector(".tick-single");
              if (tick) {
                tick.classList.remove("pending");
                tick.classList.add("sent");
                tick.innerHTML = svgSingleCheck();
                tick.title = "Sent";
              }
            }
          }
        } else {
          if (!isMine && document.hidden) {
            const total = Object.values(unreadCounts).reduce((a, b) => a + b, 0);
            startTitleFlash(total);
          }
          if (!isMine) notify(msg);
        }
      } catch (e) {}
    })
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "message_attachments" }, async payload => {
      try {
        if (currentConversation && payload.new && payload.new.conversation_id === currentConversation.id) {
          await loadSingleMessage(payload.new.message_id);
        }
      } catch (e) {}
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "message_reactions" }, async payload => {
      try {
        const mId = (payload.new && payload.new.message_id) || (payload.old && payload.old.message_id);
        if (mId) await loadSingleMessage(mId);
      } catch (e) {}
    })
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "message_reads" }, async payload => {
      try {
        if (!currentConversation) return;
        const row = elements.messages ? elements.messages.querySelector('[data-message-id="' + payload.new.message_id + '"]') : null;
        if (row && payload.new.user_id !== currentUser.id) {
          const tick = row.querySelector(".tick-single");
          if (tick) {
            tick.classList.remove("sent", "pending");
            tick.classList.add("read");
            tick.innerHTML = svgDoubleCheck();
            const reads = row.dataset.readCount ? parseInt(row.dataset.readCount, 10) : 0;
            const newCount = reads + 1;
            row.dataset.readCount = String(newCount);
            tick.title = "Read by " + newCount + " " + (newCount === 1 ? "person" : "people");
          }
        }
      } catch (e) {}
    })
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages" }, async payload => {
      try {
        if (currentConversation && payload.new && payload.new.conversation_id === currentConversation.id)
          await loadSingleMessage(payload.new.id);
      } catch (e) {}
    })
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "conversation_participants" }, async payload => {
      try {
        const p = payload.new;
        if (!p || !currentConversation || p.conversation_id !== currentConversation.id) {
          scheduleConversationsReload();
          return;
        }
        // Someone joined the current group
        const prof = await getProfileCached(p.user_id);
        const name = prof ? (prof.display_name || prof.username) : "Someone";
        await postSystemMessage(p.conversation_id, p.user_id, "join", name + " joined the group");
        currentParticipants = currentParticipants.concat([p]);
        scheduleConversationsReload();
      } catch (e) {}
    })
    .on("postgres_changes", { event: "DELETE", schema: "public", table: "conversation_participants" }, async payload => {
      try {
        const p = payload.old;
        if (!p) return;
        const prof = await getProfileCached(p.user_id);
        const name = prof ? (prof.display_name || prof.username) : "Someone";
        if (currentConversation && p.conversation_id === currentConversation.id) {
          await postSystemMessage(p.conversation_id, p.user_id, "leave", name + " left the group");
          currentParticipants = currentParticipants.filter(x => x.user_id !== p.user_id);
        }
        scheduleConversationsReload();
      } catch (e) {}
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "pinned_messages" }, () => {
      if (currentConversation) {
        _pinnedLoadedForConvId = null;
        loadPinnedMessages().then(refreshAllPinnedIndicators);
      }
    })
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "conversations" }, async payload => {
      try {
        if (currentConversation && payload.new && payload.new.id === currentConversation.id && payload.new.is_group) {
          if (elements.chatName) elements.chatName.textContent = payload.new.group_name || "Group";
          if (elements.chatSub && payload.new.group_description) elements.chatSub.textContent = payload.new.group_description.slice(0, 50);
          setAvatar(elements.chatAvatar, payload.new.group_avatar_url, payload.new.group_name || "G");
          currentConversation = Object.assign({}, currentConversation, payload.new);
          updateAnnouncementBanner();
        }
        scheduleConversationsReload();
      } catch (e) {}
    })
    .on("postgres_changes", {
      event: "*", schema: "public", table: "user_premium",
      filter: "user_id=eq." + (currentUser ? currentUser.id : "00000000-0000-0000-0000-000000000000")
    }, async () => {
      await loadMyPremium();
      await loadCurrentProfile();
      applyPremiumUpsellVisibility();
      applyPremiumLocksToSettings();
      showToast('👑 Premium status updated.', 'success');
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "group_fundraisers" }, async payload => {
      try {
        if (currentConversation && (
          (payload.new && payload.new.conversation_id === currentConversation.id) ||
          (payload.old && payload.old.conversation_id === currentConversation.id)
        )) {
          await loadMessages();
          if (elements.chatInfoModal && !elements.chatInfoModal.classList.contains('hidden')) {
            await renderCiFundraisers();
          }
        }
      } catch (e) {}
    })
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles" }, payload => {
      try {
        const p = payload.new;
        if (!p || !p.id) return;

        const cached = profileCache[p.id] || {};
        profileCache[p.id] = Object.assign({}, cached, p);
        profileCacheTime[p.id] = Date.now();

        if (currentUser && p.id === currentUser.id) {
          const premium = !!p.is_premium;
          if (elements.myAvatar) elements.myAvatar.classList.toggle('premium-avatar', premium);
          if (elements.profileAvatarPreview) elements.profileAvatarPreview.classList.toggle('premium-avatar-big', premium);
          applyPremiumUpsellVisibility();
        }

        const visibleInSidebar = elements.conversationList &&
          elements.conversationList.querySelector('[data-other-user-id="' + p.id + '"]');
        if (visibleInSidebar) loadConversations();

        if (currentConversation && !currentConversation.is_group) {
          const other = currentParticipants.find(x => x.user_id !== currentUser.id);
          if (other && other.user_id === p.id) {
            if (p.avatar_url !== undefined) {
              setAvatar(elements.chatAvatar, p.avatar_url, p.display_name || p.username);
            }
            if (elements.chatAvatar) elements.chatAvatar.classList.toggle('premium-avatar', !!p.is_premium);
          }
        }

        if (publicProfileUser && publicProfileUser.id === p.id) {
          publicProfileUser.is_premium = p.is_premium;
          publicProfileUser.is_verified = p.is_verified;
          if (p.avatar_url !== undefined) publicProfileUser.avatar_url = p.avatar_url;
          if (p.display_name !== undefined) publicProfileUser.display_name = p.display_name;
          renderPublicProfile(publicProfileUser);
        }

        if (elements.searchResults && !elements.searchResults.classList.contains('hidden')) {
          const q = elements.userSearch && elements.userSearch.value.trim();
          if (q) searchUsers();
        }
      } catch (err) {}
    })
    .subscribe(status => {
      if (status === "SUBSCRIBED") {
        loadConversationsDebounced();
        loadUnreadCounts();
        subscribeGlobalTyping();
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        setTimeout(() => { try { subscribeRealtime(); } catch (e) {} }, 5000);
      }
    });
}

async function postSystemMessage(conversationId, actorId, kind, text) {
  try {
    await db.rpc("post_group_system_message", {
      p_conv: conversationId,
      p_actor: actorId,
      p_kind: kind,
      p_text: text
    });
  } catch (e) {
    // Fallback to direct insert if RPC missing
    try {
      await db.from("messages").insert({
        conversation_id: conversationId,
        sender_id: actorId,
        content: text,
        kind: "system",
        meta: { system_kind: kind }
      });
    } catch (err) {}
  }
}

/* =========================================================
   CONVERSATION LIST + SIDEBAR
   ========================================================= */
async function loadConversations() {
  if (!currentUser) return;
  if (elements.conversationList) {
    // Only show skeleton if the list is empty (first load)
    if (!elements.conversationList.querySelector('.conversation')) {
      skeletonList(elements.conversationList, "conversation", 6);
    }
  }
  try {
    const { data, error } = await db.rpc("get_sidebar_conversations");
    if (error) throw error;
    const rows = data || [];
    myConversationIds = rows.map(r => r.id);
    renderSidebarFromRpc(rows);
  } catch (e) { await loadConversationsFallback(); }
}

function sortConversationsRows(rows) {
  return rows.slice().sort((a,b) => {
    const aPinned = isConvPinned(a.id) ? 1 : 0;
    const bPinned = isConvPinned(b.id) ? 1 : 0;
    if (aPinned !== bPinned) return bPinned - aPinned;
    const aT = a.last_message_at || a.updated_at || a.created_at || "";
    const bT = b.last_message_at || b.updated_at || b.created_at || "";
    return bT.localeCompare(aT);
  });
}

function renderSidebarFromRpc(rows) {
  if (!elements.conversationList) return;
  elements.conversationList.innerHTML = "";
  if (!rows.length) {
    elements.conversationList.innerHTML = '<div class="empty-sidebar">No conversations yet.<br>Search someone or create a group.</div>';
    return;
  }
  const sorted = sortConversationsRows(rows);
  const frag = document.createDocumentFragment();
  sorted.forEach(c => {
    if (!c.is_group) {
      if (!c.other_user_id) return;
      profileCache[c.other_user_id] = Object.assign({}, profileCache[c.other_user_id] || {}, {
        id: c.other_user_id, username: c.other_username,
        display_name: c.other_display_name, avatar_url: c.other_avatar_url,
        last_seen: c.other_last_seen,
        is_premium: !!c.other_is_premium
      });
      profileCacheTime[c.other_user_id] = Date.now();
    }
    try { frag.appendChild(buildSidebarItem(c)); } catch (e) {}
  });
  elements.conversationList.appendChild(frag);
}

function buildSidebarItem(c) {
  const item = document.createElement("div");
  item.className = "conversation";
  item.dataset.convId = c.id;
  if (!c.is_group && c.other_user_id) item.dataset.otherUserId = c.other_user_id;
  if (currentConversation && currentConversation.id === c.id) item.classList.add("active");
  if (isMuted(c.id)) item.classList.add("muted");
  if (isConvPinned(c.id)) item.classList.add("pinned");

  let title, avatarUrl, online = false, isBot = false;
  if (c.is_group) { title = c.group_name || "Group"; avatarUrl = c.group_avatar_url; }
  else {
    title = c.other_display_name || c.other_username || "User";
    avatarUrl = c.other_avatar_url;
    online = isOnline(c.other_last_seen, c.other_user_id);
    isBot = botUserId && c.other_user_id === botUserId;
  }
  const initial = (title || "?").charAt(0).toUpperCase();

  const hasPreview = c.last_message_preview && String(c.last_message_preview).trim().length > 0;
  const preview = hasPreview ? c.last_message_preview : "Start a conversation";

  const time = c.last_message_at || c.updated_at || c.created_at;
  const unread = unreadCounts[c.id] || 0;
  const unreadBadge = unread > 0 && !isMuted(c.id) ? '<span class="unread-badge">' + (unread > 99 ? "99+" : unread) + '</span>' : '';
  const mutedBadge = isMuted(c.id) ? '<span class="muted-badge">🔕</span>' : '';
  const avatarClass = "avatar" + (c.is_group ? " group-avatar" : "");
  const typers = typingInConversations.get(c.id);
  let previewHtml;
  if (typers && typers.size > 0) previewHtml = '<div class="conversation-preview typing">typing…</div>';
  else previewHtml = '<div class="conversation-preview' + (unread > 0 ? ' bold' : '') + '">' + escapeHtml(preview) + '</div>';

  let otherPremium = false;
  if (!c.is_group && c.other_user_id) {
    const cached = profileCache[c.other_user_id];
    otherPremium = !!(cached && cached.is_premium) || !!c.other_is_premium;
  }

  const safeAvatarUrl = avatarUrl ? escapeStyleUrl(avatarUrl) : "";
  item.innerHTML = '<div class="' + avatarClass + (otherPremium ? ' premium-avatar' : '') + '"' +
      (safeAvatarUrl ? ' style="background-image:url(\'' + safeAvatarUrl + '\');color:transparent;"' : '') + '>' +
      escapeHtml(initial) + (online ? '<span class="online-dot"></span>' : '') +
    '</div>' +
    '<div class="conversation-body">' +
      '<div class="conversation-top">' +
        '<div class="conversation-name">' + escapeHtml(title) +
          (isBot ? ' <span style="background:#eef3fc;color:#1652c4;font-size:9px;padding:2px 6px;border-radius:6px;">BOT</span>' : '') +
        '</div>' +
        '<div class="conversation-time">' + formatListTime(time) + unreadBadge + mutedBadge + '</div>' +
      '</div>' +
      previewHtml +
    '</div>';

  item.addEventListener("click", () => {
    manuallyUnread.delete(c.id);
    if (c.is_group) {
      openConversation({ id: c.id, is_group: true, group_name: c.group_name, group_avatar_url: c.group_avatar_url, group_description: c.group_description, announcements_only: c.announcements_only, created_by: c.created_by }, null);
    } else {
      openConversation({ id: c.id, is_group: false }, { id: c.other_user_id, username: c.other_username, display_name: c.other_display_name, avatar_url: c.other_avatar_url, last_seen: c.other_last_seen, is_premium: !!c.other_is_premium });
    }
  });
  return item;
}

function bumpConversationInSidebar(convId, preview, at, unread) {
  const list = elements.conversationList;
  if (!list) return;

  let item = list.querySelector('.conversation[data-conv-id="' + convId + '"]');

  if (!item) {
    loadConversationsDebounced().then(() => {
      const newItem = list.querySelector('.conversation[data-conv-id="' + convId + '"]');
      if (newItem) {
        const prevEl = newItem.querySelector(".conversation-preview");
        if (prevEl) {
          prevEl.classList.remove("typing");
          prevEl.textContent = preview || "";
          prevEl.classList.toggle("bold", unread > 0 && !isMuted(convId));
        }
        moveConversationToTop(convId);
      }
    });
    return;
  }

  const muted = isMuted(convId);

  const timeEl = item.querySelector(".conversation-time");
  if (timeEl) {
    const badge = timeEl.querySelector(".unread-badge");
    const mutedBadge = timeEl.querySelector(".muted-badge");
    const timeText = formatListTime(at);
    Array.from(timeEl.childNodes).forEach(n => { if (n.nodeType === 3) timeEl.removeChild(n); });
    if (badge) timeEl.insertBefore(document.createTextNode(timeText), badge);
    else if (mutedBadge) timeEl.insertBefore(document.createTextNode(timeText), mutedBadge);
    else timeEl.insertBefore(document.createTextNode(timeText), timeEl.firstChild);

    if (unread > 0 && !muted) {
      if (!badge) {
        const newBadge = document.createElement("span");
        newBadge.className = "unread-badge";
        newBadge.textContent = unread > 99 ? "99+" : String(unread);
        timeEl.appendChild(newBadge);
      } else badge.textContent = unread > 99 ? "99+" : String(unread);
    } else if (badge) badge.remove();
  }

  const prevEl = item.querySelector(".conversation-preview");
  if (prevEl) {
    prevEl.classList.remove("typing");
    if (prevEl.dataset.originalText !== undefined) {
      delete prevEl.dataset.originalText;
      delete prevEl.dataset.originalBold;
    }
    prevEl.textContent = preview || "";
    prevEl.classList.toggle("bold", unread > 0 && !muted);
  }

  if (typingInConversations.has(convId)) typingInConversations.delete(convId);
  moveConversationToTop(convId);
}

function bumpConversationToTop(convId) { moveConversationToTop(convId); }

let _conversationOrderCache = null;
let _conversationOrderCacheKey = "";

function getConversationOrder(list) {
  const items = list.querySelectorAll(".conversation");
  let key = "";
  items.forEach(el => {
    const id = el.dataset.convId;
    const pinned = isConvPinned(id) ? "1" : "0";
    key += id + "|" + pinned + ";";
  });
  if (key === _conversationOrderCacheKey && _conversationOrderCache) {
    return _conversationOrderCache;
  }
  const arr = Array.from(items);
  _conversationOrderCache = arr;
  _conversationOrderCacheKey = key;
  return arr;
}

function moveConversationToTop(convId) {
  const list = elements.conversationList;
  if (!list) return;
  const item = list.querySelector('.conversation[data-conv-id="' + convId + '"]');
  if (!item) return;

  const isPinned = isConvPinned(convId);
  let cursor = item.previousElementSibling;
  let moved = false;

  if (isPinned) {
    while (cursor) {
      const cid = cursor.dataset && cursor.dataset.convId;
      if (cid && isConvPinned(cid)) {
        cursor = cursor.previousElementSibling;
        continue;
      }
      list.insertBefore(item, cursor.nextSibling);
      moved = true;
      break;
    }
    if (!moved && cursor === null) {
      if (list.firstElementChild !== item) list.insertBefore(item, list.firstElementChild);
    }
  } else {
    const firstUnpinned = findFirstUnpinned(list);
    if (firstUnpinned && firstUnpinned !== item) {
      list.insertBefore(item, firstUnpinned);
      moved = true;
    } else if (!firstUnpinned && list.lastElementChild !== item) {
      list.appendChild(item);
      moved = true;
    }
  }

  if (moved) {
    _conversationOrderCacheKey = "";
    _conversationOrderCache = null;
    item.classList.add("reordered-to-top");
    setTimeout(() => item.classList.remove("reordered-to-top"), 1200);
  }
}

function findFirstUnpinned(list) {
  const items = list.querySelectorAll(".conversation");
  for (let i = 0; i < items.length; i++) {
    const id = items[i].dataset.convId;
    if (!isConvPinned(id)) return items[i];
  }
  return null;
}

async function loadConversationsFallback() {
  try {
    const { data: mine } = await db.from("conversation_participants").select("conversation_id").eq("user_id", currentUser.id);
    if (!mine || !mine.length) {
      if (elements.conversationList) elements.conversationList.innerHTML = '<div class="empty-sidebar">No conversations yet.</div>';
      myConversationIds = []; return;
    }
    const ids = mine.map(r => r.conversation_id);
    myConversationIds = ids;

    const [convsRes, latestMsgsRes, participantsRes] = await Promise.all([
      db.from("conversations").select("*").in("id", ids),
      db.from("messages")
        .select("conversation_id, content, kind, meta, created_at, sender_id")
        .in("conversation_id", ids)
        .order("created_at", { ascending: false }),
      db.from("conversation_participants").select("conversation_id, user_id, role").in("conversation_id", ids)
    ]);

    const convs = convsRes.data || [];
    const latestMsgs = latestMsgsRes.data || [];
    const participants = participantsRes.data || [];

    const latestByConv = {};
    latestMsgs.forEach(m => { if (!latestByConv[m.conversation_id]) latestByConv[m.conversation_id] = m; });

    convs.sort((a,b) => {
      const aMsg = latestByConv[a.id], bMsg = latestByConv[b.id];
      const aT = (aMsg && aMsg.created_at) || a.last_message_at || a.created_at || "";
      const bT = (bMsg && bMsg.created_at) || b.last_message_at || b.created_at || "";
      return bT.localeCompare(aT);
    });

    const byConv = {};
    const otherIds = [];
    participants.forEach(p => {
      byConv[p.conversation_id] = byConv[p.conversation_id] || [];
      byConv[p.conversation_id].push(p);
      if (p.user_id !== currentUser.id) otherIds.push(p.user_id);
    });
    const uniqueIds = otherIds.filter((v,i,a) => a.indexOf(v) === i);

    const profileMap = {};
    if (uniqueIds.length) {
            const { data: profiles } = await db.from("profiles")
        .select("id, username, display_name, avatar_url, last_seen, is_premium")
        .in("id", uniqueIds);
      (profiles || []).forEach(p => {
        profileMap[p.id] = p;
        profileCache[p.id] = Object.assign({}, profileCache[p.id] || {}, p);
        profileCacheTime[p.id] = Date.now();
      });
    }

    if (elements.conversationList) elements.conversationList.innerHTML = "";
    const frag = document.createDocumentFragment();
    convs.forEach(conv => {
      try {
        const item = renderConversationItemFallback(conv, byConv[conv.id] || [], profileMap, latestByConv[conv.id]);
        if (item) frag.appendChild(item);
      } catch (e) {}
    });
    if (elements.conversationList) elements.conversationList.appendChild(frag);
  } catch (e) {}
}

function renderConversationItemFallback(conv, participantRows, profileMap, latestMsg) {
  const others = participantRows.filter(p => p.user_id !== currentUser.id);
  const otherProfiles = others.map(p => profileMap[p.user_id]).filter(Boolean);
  let title, avatarUrl, online = false, isGroup = !!conv.is_group;
  if (isGroup) { title = conv.group_name || "Group"; avatarUrl = conv.group_avatar_url; }
  else {
    const other = otherProfiles[0]; if (!other) return null;
    title = other.display_name || other.username;
    avatarUrl = other.avatar_url;
    online = isOnline(other.last_seen, other.id);
  }

  let preview = conv.last_message_preview;
  let lastAt  = conv.last_message_at;
  if (latestMsg) {
    preview = buildPreviewText(latestMsg);
    lastAt  = latestMsg.created_at;
  }
  if (!preview || !String(preview).trim()) preview = null;

  const c = {
    id: conv.id, is_group: isGroup,
    group_name: conv.group_name, group_avatar_url: conv.group_avatar_url,
    group_description: conv.group_description,
    created_by: conv.created_by,
    other_user_id: otherProfiles[0] && otherProfiles[0].id,
    other_username: otherProfiles[0] && otherProfiles[0].username,
    other_display_name: title,
    other_avatar_url: avatarUrl,
    other_last_seen: otherProfiles[0] && otherProfiles[0].last_seen,
    other_is_premium: otherProfiles[0] && otherProfiles[0].is_premium,
    last_message_preview: preview,
    last_message_at: lastAt || conv.created_at,
    created_at: conv.created_at
  };
  return buildSidebarItem(c);
}

/* =========================================================
   CHAT LIST CONTEXT MENU — new options
   ========================================================= */
function handleConversationContextMenu(e) {
  const item = e.target.closest(".conversation");
  if (!item) return;
  e.preventDefault();
  const convId = item.dataset.convId;
  if (!convId) return;
  showChatListMenu(convId, e.clientX, e.clientY);
}
function bindConversationLongPress() {
  if (!elements.conversationList) return;
  let timer = null, startX = 0, startY = 0;
  elements.conversationList.addEventListener("touchstart", (e) => {
    const item = e.target.closest(".conversation");
    if (!item) return;
    const t = e.touches[0];
    startX = t.clientX; startY = t.clientY;
    timer = setTimeout(() => {
      timer = null;
      const convId = item.dataset.convId;
      if (convId) showChatListMenu(convId, t.clientX, t.clientY);
    }, 500);
  }, { passive: true });
  elements.conversationList.addEventListener("touchmove", (e) => {
    if (!timer) return;
    const t = e.touches[0];
    if (Math.abs(t.clientX - startX) > 8 || Math.abs(t.clientY - startY) > 8) {
      clearTimeout(timer); timer = null;
    }
  }, { passive: true });
  elements.conversationList.addEventListener("touchend", () => {
    if (timer) { clearTimeout(timer); timer = null; }
  });
}

function countPinnedChats() {
  return Object.values(conversationPrefs).filter(p => p && p.pinned_at).length;
}

function showChatListMenu(convId, x, y) {
  if (!convId) return;
  const menu = elements.chatListMenu;
  if (!menu) return;
  menu.innerHTML = "";

  const isMutedNow  = isMuted(convId);
  const isPinnedNow = isConvPinned(convId);
  const isUnread    = manuallyUnread.has(convId) || (unreadCounts[convId] || 0) > 0;
  const item = elements.conversationList.querySelector('.conversation[data-conv-id="' + convId + '"]');
  const otherUid = item && item.dataset.otherUserId;
  const isGroup = !otherUid;

  // --- 1. Pin / Unpin (max 3) ---
  addChatListMenuItem(menu, "📌", isPinnedNow ? "Unpin chat" : "Pin chat", async () => {
    hideChatListMenu();
    if (!isPinnedNow && countPinnedChats() >= MAX_PINNED_CHATS) {
      showToast("You can pin up to " + MAX_PINNED_CHATS + " chats. Unpin one first.", "error");
      return;
    }
    await saveConversationPref(convId, { pinned_at: isPinnedNow ? null : new Date().toISOString() });
    await loadConversations();
  });

  // --- 2. Mark as read / unread ---
  if (isUnread) {
    addChatListMenuItem(menu, "✅", "Mark as read", () => {
      hideChatListMenu();
      manuallyUnread.delete(convId);
      markConversationRead(convId);
      updateUnreadBadgeInSidebar(convId);
    });
  } else {
    addChatListMenuItem(menu, "🔵", "Mark as unread", () => {
      hideChatListMenu();
      markConversationUnread(convId);
      showToast("Marked unread.", "success");
    });
  }

  // --- 3. Mute / Unmute ---
  addChatListMenuItem(menu, isMutedNow ? "🔔" : "🔕", isMutedNow ? "Unmute" : "Mute", async () => {
    hideChatListMenu();
    await saveConversationPref(convId, { muted: !isMutedNow });
    await loadConversations();
  });

  // --- 4. Group-specific options ---
  if (isGroup) {
    addChatListMenuItem(menu, "ℹ️", "Group info", () => {
      hideChatListMenu();
      const conv = { id: convId, is_group: true };
      openConversation(conv, null).then(() => openChatInfo());
    });
    addChatListMenuItem(menu, "🎯", "Raise funds", () => {
      hideChatListMenu();
      const conv = { id: convId, is_group: true };
      openConversation(conv, null).then(() => openCreateFundraiserModal());
    });
    addChatListMenuItem(menu, "🧾", "Split money", () => {
      hideChatListMenu();
      const conv = { id: convId, is_group: true };
      openConversation(conv, null).then(() => openSplitBillModal());
    });
  } else if (otherUid) {
    addChatListMenuItem(menu, "₹", "Send money here", () => {
      hideChatListMenu();
      getProfileCached(otherUid).then(p => {
        if (!p) return showToast("User not found.", "error");
        openWalletModal({ mode: 'dm', partner: p });
      });
    });
  }

  // --- 5. Delete / Exit ---
  addChatListMenuItem(menu, isGroup ? "🚪" : "🗑", isGroup ? "Exit group" : "Delete chat", async () => {
    hideChatListMenu();
    const msg = isGroup
      ? "Leave this group? You won't see new messages."
      : "Delete this conversation for you? The other person will still see the messages.";
    if (!confirm(msg)) return;
    try {
      await db.from("conversation_participants").delete()
        .eq("conversation_id", convId).eq("user_id", currentUser.id);
      if (currentConversation && currentConversation.id === convId) {
        currentConversation = null;
        if (elements.activeChat) elements.activeChat.classList.add("hidden");
        if (elements.emptyChat) elements.emptyChat.classList.remove("hidden");
        if (elements.appScreen) elements.appScreen.classList.remove("chat-open");
      }
      await loadConversations();
      showToast(isGroup ? "Left group." : "Chat deleted.", "success");
    } catch (err) { showToast(friendlyError(err), "error"); }
  }, true);

  const mw = 260, mh = 380;
  let left = Math.min(x, window.innerWidth - mw - 10);
  let top  = Math.min(y, window.innerHeight - mh - 10);
  if (left < 8) left = 8;
  if (top < 8) top = 8;
  menu.style.left = left + "px";
  menu.style.top  = top + "px";
  menu.classList.remove("hidden");
}
function addChatListMenuItem(menu, icon, label, handler, danger) {
  const b = document.createElement("button");
  b.type = "button";
  if (danger) b.className = "danger";
  b.innerHTML = '<span class="mi">' + icon + '</span><span>' + escapeHtml(label) + '</span>';
  b.addEventListener("click", handler);
  menu.appendChild(b);
}
function hideChatListMenu() {
  if (elements.chatListMenu) elements.chatListMenu.classList.add("hidden");
}

console.log('[JustGo] sidego.js loaded — v4');