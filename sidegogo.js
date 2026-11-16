/* =========================================================================
   JustGo — sidegogo.js (v4)
   Composer dropup, emoji picker, group create/settings, invite join,
   multi-select, forward, chat info.

   Changelog v3 → v4:
     • Removed duplicate openMyDataModal — my-data.js now owns it.
     • No other logic changes.
   ========================================================================= */

/* =========================================================
   COMPOSER PLUS + DROPUP + EMOJI
   ========================================================= */
let _emojiPickerBuilt = false;

function handleComposerPlusClick(e) {
  e.stopPropagation();
  const dropup = elements.composerDropup;
  if (!dropup || !elements.composerPlusBtn) return;
  const open = !dropup.classList.contains("hidden");
  hideEmojiPicker();
  if (open) { hideComposerDropup(); return; }

  const rect = elements.composerPlusBtn.getBoundingClientRect();
  const dropupHeight = 260;
  const dropupWidth = 280;
  let left = rect.left;
  let top = rect.top - dropupHeight - 8;
  if (left + dropupWidth > window.innerWidth - 10) left = window.innerWidth - dropupWidth - 10;
  if (left < 10) left = 10;
  if (top < 10) top = rect.bottom + 8;
  dropup.style.position = "fixed";
  dropup.style.left = left + "px";
  dropup.style.top = top + "px";
  dropup.style.bottom = "auto";
  dropup.classList.remove("hidden");
  elements.composerPlusBtn.classList.add("active");

  if (!dropup.__bound) {
    dropup.__bound = true;
    dropup.addEventListener("click", (evt) => {
      const b = evt.target.closest("button[data-action]");
      if (!b) return;
      evt.stopPropagation();
      const action = b.dataset.action;
      hideComposerDropup();
      setTimeout(() => handleComposerAction(action), 10);
    });
  }
}

function hideComposerDropup() {
  if (elements.composerDropup) elements.composerDropup.classList.add("hidden");
  if (elements.composerPlusBtn) elements.composerPlusBtn.classList.remove("active");
}

function handleComposerAction(action) {
  switch (action) {
    case "file":
      if (elements.fileInput) elements.fileInput.click();
      break;
    case "money":
      if (!currentConversation) return showToast("Open a chat first.", "error");
      if (currentConversation.is_group) {
        openSplitBillModal();
      } else {
        const other = currentParticipants.find(p => p.user_id !== currentUser.id);
        if (!other) return showToast("Cannot identify the other user.", "error");
        getProfileCached(other.user_id).then(p => {
          if (!p) return showToast("User not found.", "error");
          openWalletModal({ mode: 'dm', partner: p });
        });
      }
      break;
    case "split":
      if (!currentConversation || !currentConversation.is_group) {
        return showToast("Split bill only works in groups.", "error");
      }
      openSplitBillModal();
      break;
    case "emoji":
      openEmojiPickerNearPlus();
      break;
    case "theogo":
      openTheogoModal();
      break;
    case "library":
      if (window.JustGoLibrary && typeof window.JustGoLibrary.open === "function") {
        window.JustGoLibrary.open();
      } else {
        document.dispatchEvent(new CustomEvent("justgo:open-library"));
      }
      break;
  }
}

const EMOJI_CATEGORIES = {
  "Smileys": ["😀","😃","😄","😁","😆","😅","😂","🤣","🥲","☺️","😊","😇","🙂","🙃","😉","😌","😍","🥰","😘","😗","😙","😚","😋","😛","😝","😜","🤪","🤨","🧐","🤓","😎","🥸","🤩","🥳","😏","😒","😞","😔","😟","😕","🙁","☹️","😣","😖","😫","😩","🥺","😢","😭","😤","😠","😡","🤬","🤯","😳","🥵","🥶","😱","😨","😰","😥","😓","🤗","🤔","🫣","🤭","🫢","🫡","🤫","🫠","🤥","😶","😐","😑","😬","🫨","🙄","😯","😦","😧","😮","😲","🥱","😴","🤤","😪","😵","😵‍💫","🤐","🥴","🤢","🤮","🤧","😷","🤒","🤕"],
  "Gestures": ["👋","🤚","🖐️","✋","🖖","🫱","🫲","🫳","🫴","👌","🤌","🤏","✌️","🤞","🫰","🤟","🤘","🤙","👈","👉","👆","🖕","👇","☝️","👍","👎","✊","👊","🤛","🤜","👏","🙌","🫶","👐","🤲","🤝","🙏","💪"],
  "Hearts": ["❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💔","❤️‍🔥","❤️‍🩹","💕","💞","💓","💗","💖","💘","💝","💟"],
  "Objects": ["💯","🔥","✨","⭐","🌟","💫","⚡","💥","🎉","🎊","🎁","🎈","🎂","🍰","☕","🍕","🍔","🍟","🌮","🍩","📎","📁","📂","📌","📍","📅","📆","⏰","⏱️","💰","💵","💸","💳","🪙","📱","💻","⌚","🎧","🎤","🎬","📷","🔒","🔓","🔑","🔨","🛠️"],
  "Nature": ["🌸","🌹","🌺","🌻","🌷","🌼","🌱","🌿","🍀","🍁","🍂","🌳","🌲","🌴","🌵","🐶","🐱","🐭","🐹","🐰","🦊","🐻","🐼","🐨","🐯","🦁","🐮","🐷","🐸","🐵","🐔","🐧","🐦","🦆","🦅","🦉"],
  "Symbols": ["✅","❌","⚠️","❓","❔","❗","❕","💤","💢","💬","💭","🗯️","♻️","✔️","☑️","🔴","🟠","🟡","🟢","🔵","🟣","⚫","⚪","🟤"]
};

function openEmojiPickerNearPlus() {
  const picker = elements.emojiPicker;
  if (!picker) return;
  const rect = elements.composerPlusBtn.getBoundingClientRect();
  const pw = 300, ph = 340;
  let left = rect.left;
  let top = rect.top - ph - 8;
  if (left + pw > window.innerWidth - 10) left = window.innerWidth - pw - 10;
  if (left < 10) left = 10;
  if (top < 10) top = rect.bottom + 8;
  picker.style.left = left + "px";
  picker.style.top = top + "px";

  if (!_emojiPickerBuilt) {
    let html = '<div class="emoji-picker-head">Emojis</div><div class="emoji-picker-body">';
    Object.keys(EMOJI_CATEGORIES).forEach(cat => {
      EMOJI_CATEGORIES[cat].forEach(emoji => {
        html += '<button type="button" data-emoji="' + emoji + '">' + emoji + '</button>';
      });
    });
    html += '</div><div class="emoji-picker-foot">Tap an emoji to insert</div>';
    picker.innerHTML = html;
    picker.addEventListener("click", (evt) => {
      const b = evt.target.closest("button[data-emoji]");
      if (!b) return;
      evt.stopPropagation();
      insertEmojiIntoMessage(b.dataset.emoji);
      hideEmojiPicker();
    });
    _emojiPickerBuilt = true;
  }

  picker.classList.remove("hidden");
}
function hideEmojiPicker() {
  if (elements.emojiPicker) elements.emojiPicker.classList.add("hidden");
}
function insertEmojiIntoMessage(emoji) {
  const input = elements.messageInput;
  if (!input) return;
  const start = input.selectionStart || input.value.length;
  const end = input.selectionEnd || input.value.length;
  const before = input.value.slice(0, start);
  const after = input.value.slice(end);
  input.value = before + emoji + after;
  input.selectionStart = input.selectionEnd = start + emoji.length;
  input.focus();
  autoResizeTextarea();
}

/* =========================================================
   GROUP CREATE
   ========================================================= */
function openGroupModal() {
  groupSelectedMembers = [];
  createGroupAvatarFile = null;
  if (createGroupAvatarPreviewUrl) {
    try { URL.revokeObjectURL(createGroupAvatarPreviewUrl); } catch (e) {}
    createGroupAvatarPreviewUrl = null;
  }
  if (elements.groupNameInput) elements.groupNameInput.value = "";
  if (elements.groupDescInput) elements.groupDescInput.value = "";
  if (elements.groupMemberSearch) elements.groupMemberSearch.value = "";
  if (elements.groupMemberResults) elements.groupMemberResults.innerHTML = "";
  if (elements.groupMemberChips) elements.groupMemberChips.innerHTML = "";
  if (elements.groupMessage) elements.groupMessage.classList.add("hidden");
  if (elements.createGroupCanInvite) elements.createGroupCanInvite.checked = true;
  if (elements.createGroupCanEdit) elements.createGroupCanEdit.checked = false;
  if (elements.createGroupAnnouncements) elements.createGroupAnnouncements.checked = false;

  document.querySelectorAll("#groupModal .switch-card input[type='checkbox']").forEach(inp => {
    const card = inp.closest(".switch-card"); if (card) card.classList.toggle("active", inp.checked);
  });
  if (elements.createGroupAvatarPreview) {
    elements.createGroupAvatarPreview.style.backgroundImage = "";
    elements.createGroupAvatarPreview.textContent = "G";
  }
  openModal(elements.groupModal);
}

function closeGroupModal() {
  closeModal(elements.groupModal);
  if (createGroupAvatarPreviewUrl) {
    try { URL.revokeObjectURL(createGroupAvatarPreviewUrl); } catch (e) {}
    createGroupAvatarPreviewUrl = null;
  }
  createGroupAvatarFile = null;
}

function handleCreateGroupAvatar(event) {
  const file = event.target.files[0]; if (!file) return;
  if (file.size > 5 * 1024 * 1024) return showGroupMessage("Image too large (max 5 MB).", "error");
  if (file.type.indexOf("image/") !== 0) return showGroupMessage("Only image files are allowed.", "error");
  if (createGroupAvatarPreviewUrl) {
    try { URL.revokeObjectURL(createGroupAvatarPreviewUrl); } catch (e) {}
  }
  createGroupAvatarFile = file;
  createGroupAvatarPreviewUrl = URL.createObjectURL(file);
  if (elements.createGroupAvatarPreview) {
    elements.createGroupAvatarPreview.style.backgroundImage = "url('" + createGroupAvatarPreviewUrl + "')";
    elements.createGroupAvatarPreview.textContent = "";
  }
}

let _groupSearchTimer = null;
function searchGroupMembers() {
  clearTimeout(_groupSearchTimer);
  _groupSearchTimer = setTimeout(async () => {
    const q = (elements.groupMemberSearch.value || "").trim().toLowerCase();
    if (q.length < 1) { elements.groupMemberResults.innerHTML = ""; return; }
        const { data } = await db.from("profiles")
      .select("id, username, display_name, avatar_url, is_premium")
      .neq("id", currentUser.id)
      .or("username.ilike.%" + q + "%,display_name.ilike.%" + q + "%")
      .limit(10);

    const selectedIds = new Set(groupSelectedMembers.map(m => m.id));
    const seen = new Set();
    const results = (data || []).filter(u => {
      if (!u || !u.id) return false;
      if (selectedIds.has(u.id)) return false;
      if (seen.has(u.id)) return false;
      seen.add(u.id);
      return true;
    });

    elements.groupMemberResults.innerHTML = "";
    results.forEach(u => {
      const row = document.createElement("div");
      row.className = "group-member-row";
      const initial = (u.display_name || u.username).charAt(0).toUpperCase();
      const safeAvatar = u.avatar_url ? escapeStyleUrl(u.avatar_url) : "";
            row.innerHTML =
        '<div class="avatar-small' + (u.is_premium ? ' premium-avatar' : '') + '"' +
          (safeAvatar ? ' style="background-image:url(\'' + safeAvatar + '\');color:transparent;"' : '') + '>' + escapeHtml(initial) + '</div>' +
        '<div class="group-member-info">' +
          '<strong>' + escapeHtml(u.display_name || u.username) + (u.is_premium ? ' 👑' : '') + '</strong>' +
          '<span>@' + escapeHtml(u.username) + '</span>' +
        '</div>';
      row.addEventListener("click", () => {
        groupSelectedMembers.push(u);
        renderGroupChips();
        elements.groupMemberResults.innerHTML = "";
        elements.groupMemberSearch.value = "";
      });
      elements.groupMemberResults.appendChild(row);
    });
  }, 220);
}

function renderGroupChips() {
  elements.groupMemberChips.innerHTML = "";
  groupSelectedMembers.forEach(m => {
    const chip = document.createElement("div");
    chip.className = "member-chip";
    const initial = (m.display_name || m.username).charAt(0).toUpperCase();
    const safeAvatar = m.avatar_url ? escapeStyleUrl(m.avatar_url) : "";
    chip.innerHTML =
      '<div class="avatar-small' + (m.is_premium ? ' premium-avatar' : '') + '"' +
        (safeAvatar ? ' style="background-image:url(\'' + safeAvatar + '\');color:transparent;"' : '') + '>' + escapeHtml(initial) + '</div>' +
      '<span>' + escapeHtml(m.display_name || m.username) + '</span>';
    const rm = document.createElement("button");
    rm.type = "button"; rm.textContent = "×";
    rm.addEventListener("click", () => { groupSelectedMembers = groupSelectedMembers.filter(x => x.id !== m.id); renderGroupChips(); });
    chip.appendChild(rm);
    elements.groupMemberChips.appendChild(chip);
  });
}

async function createGroup() {
  const name = elements.groupNameInput.value.trim();
  const desc = elements.groupDescInput.value.trim();
  if (!name) return showGroupMessage("Group name is required.", "error");
  if (groupSelectedMembers.length < 1) return showGroupMessage("Add at least one member.", "error");
  elements.groupCreateBtn.disabled = true;
  elements.groupCreateBtn.textContent = "Creating...";
  try {
    let avatarUrl = null;
    if (createGroupAvatarFile) {
      const ext = (createGroupAvatarFile.name.split(".").pop() || "jpg").toLowerCase();
      const path = currentUser.id + "/newgroup-" + Date.now() + "." + ext;
      const { error: upErr } = await db.storage.from(AVATAR_BUCKET).upload(path, createGroupAvatarFile, { upsert: false });
      if (upErr) throw upErr;
      const { data: pub } = db.storage.from(AVATAR_BUCKET).getPublicUrl(path);
      avatarUrl = pub.publicUrl;
    }
    const announcementsOnly = elements.createGroupAnnouncements.checked;
    const { data: conv, error } = await db.from("conversations").insert({
      is_group: true, group_name: name,
      group_description: desc || null, group_avatar_url: avatarUrl,
      members_can_invite: elements.createGroupCanInvite.checked,
      members_can_edit: elements.createGroupCanEdit.checked,
      announcements_only: announcementsOnly,
      posting_mode: announcementsOnly ? "admins" : "all",
      created_by: currentUser.id
    }).select().single();
    if (error) throw error;

    await db.from("conversation_participants").insert({
      conversation_id: conv.id, user_id: currentUser.id, role: "admin"
    });
    const rows = groupSelectedMembers.map(m => ({
      conversation_id: conv.id, user_id: m.id, role: "member"
    }));
    if (rows.length) await db.from("conversation_participants").insert(rows);

    closeGroupModal();
    currentConversation = conv;
    await openConversation(conv, null);
    await loadConversations();
    showToast("Group created.", "success");
  } catch (e) { showGroupMessage(friendlyError(e), "error"); }
  finally { elements.groupCreateBtn.disabled = false; elements.groupCreateBtn.textContent = "Create group"; }
}
function showGroupMessage(m, t) {
  elements.groupMessage.textContent = m;
  elements.groupMessage.classList.remove("hidden", "error", "success");
  if (t) elements.groupMessage.classList.add(t);
}

/* =========================================================
   GROUP SETTINGS
   ========================================================= */
async function openGroupSettings() {
  if (!currentConversation || !currentConversation.is_group) return;
  let conv = currentConversation;
  try {
    const { data: fresh } = await db.from("conversations").select("*").eq("id", currentConversation.id).maybeSingle();
    if (fresh) conv = fresh;
  } catch (e) {}

  currentConversation = conv;
  const isAdmin = currentParticipants.some(p => p.user_id === currentUser.id && p.role === "admin");
  const isProAdmin = conv.created_by === currentUser.id;
  const canEdit = isAdmin || conv.members_can_edit === true;
  groupSettingsState = { convId: conv.id, isAdmin, isProAdmin, current: conv };

  setAvatar(elements.groupAvatarPreview, conv.group_avatar_url, conv.group_name || "G");
  elements.groupAvatarPreview.classList.add("group-avatar");
  elements.groupSettingsName.value = conv.group_name || "";
  elements.groupSettingsDesc.value = conv.group_description || "";
  elements.groupMembersCanInvite.checked = conv.members_can_invite !== false;
  elements.groupMembersCanEdit.checked = conv.members_can_edit === true;
  elements.groupAnnouncementsOnly.checked = !!(conv.announcements_only || conv.posting_mode === "admins");
  document.querySelectorAll("#groupSettingsModal .switch-card input[type='checkbox']").forEach(inp => {
    const card = inp.closest(".switch-card"); if (card) card.classList.toggle("active", inp.checked);
  });
  const link = buildInviteLink(conv.invite_token);
  elements.groupInviteLink.value = link || "(generating…)";
  elements.groupSettingsName.disabled = !canEdit;
  elements.groupSettingsDesc.disabled = !canEdit;
  elements.groupMembersCanInvite.disabled = !isAdmin;
  elements.groupMembersCanEdit.disabled = !isAdmin;
  elements.groupAnnouncementsOnly.disabled = !isAdmin;
  elements.groupAvatarInput.disabled = !canEdit;
  elements.groupSaveBtn.classList.toggle("hidden", !canEdit);
  elements.groupRegenInviteBtn.classList.toggle("hidden", !isAdmin);
  elements.groupDeleteBtn.classList.toggle("hidden", !isAdmin);
  elements.groupLeaveBtn.classList.toggle("hidden", isProAdmin);
  elements.groupSettingsMessage.classList.add("hidden");
  openModal(elements.groupSettingsModal);
}
function closeGroupSettings() { closeModal(elements.groupSettingsModal); }
function buildInviteLink(token) { return token ? "https://justgo.42web.io/?join=" + encodeURIComponent(token) : ""; }

async function saveGroupSettings() {
  const s = groupSettingsState.current; if (!s) return;
  const canEdit = groupSettingsState.isAdmin || s.members_can_edit === true;
  if (!canEdit) return;
  elements.groupSaveBtn.disabled = true;
  elements.groupSaveBtn.textContent = "Saving…";
  try {
    const annOnly = elements.groupAnnouncementsOnly.checked;
    const updates = {
      group_name: elements.groupSettingsName.value.trim() || "Group",
      group_description: elements.groupSettingsDesc.value.trim() || null,
      members_can_invite: elements.groupMembersCanInvite.checked,
      members_can_edit: elements.groupMembersCanEdit.checked,
      announcements_only: annOnly,
      posting_mode: annOnly ? "admins" : "all"
    };
    const { error } = await db.from("conversations").update(updates).eq("id", s.id);
    if (error) throw error;
    showGroupSettingsMessage("Saved.", "success");
    await openConversation(currentConversation);
    await loadConversations();
  } catch (e) { showGroupSettingsMessage(friendlyError(e), "error"); }
  finally { elements.groupSaveBtn.disabled = false; elements.groupSaveBtn.textContent = "Save changes"; }
}
function showGroupSettingsMessage(m, t) {
  elements.groupSettingsMessage.textContent = m;
  elements.groupSettingsMessage.classList.remove("hidden", "error", "success");
  if (t) elements.groupSettingsMessage.classList.add(t);
}
async function uploadGroupAvatar(event) {
  const file = event.target.files[0];
  if (!file || !currentConversation) return;
  if (file.size > 5 * 1024 * 1024) return showGroupSettingsMessage("Image too large (max 5 MB).", "error");
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = currentUser.id + "/group-" + currentConversation.id + "-" + Date.now() + "." + ext;
  try {
    const { error: upErr } = await db.storage.from(AVATAR_BUCKET).upload(path, file, { upsert: true });
    if (upErr) throw upErr;
    const { data: pub } = db.storage.from(AVATAR_BUCKET).getPublicUrl(path);
    const publicUrl = pub.publicUrl;
    const { error: updErr } = await db.from("conversations").update({ group_avatar_url: publicUrl }).eq("id", currentConversation.id);
    if (updErr) throw updErr;
    currentConversation.group_avatar_url = publicUrl;
    setAvatar(elements.groupAvatarPreview, publicUrl, currentConversation.group_name || "G");
    elements.groupAvatarPreview.classList.add("group-avatar");
    showGroupSettingsMessage("Group photo updated.", "success");
    await openConversation(currentConversation);
    await loadConversations();
  } catch (e) { showGroupSettingsMessage(friendlyError(e), "error"); }
}
async function regenerateInviteLink() {
  if (!groupSettingsState.isAdmin) return;
  if (!confirm("Reset the invite link? The old link will stop working.")) return;
  try {
    const bytes = new Uint8Array(12);
    crypto.getRandomValues(bytes);
    const token = Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
    const { error } = await db.from("conversations").update({
      invite_token: token,
      invite_token_created_at: new Date().toISOString()
    }).eq("id", currentConversation.id);
    if (error) throw error;
    currentConversation.invite_token = token;
    elements.groupInviteLink.value = buildInviteLink(token);
    showGroupSettingsMessage("Invite link reset.", "success");
  } catch (e) { showGroupSettingsMessage(friendlyError(e), "error"); }
}
async function leaveGroup() {
  if (!currentConversation || !currentConversation.is_group) return;
  if (currentConversation.created_by === currentUser.id) {
    return showToast("You're the group creator. Transfer ownership before leaving.", "error");
  }
  if (!confirm("Leave this group?")) return;
  try {
    const { error } = await db.from("conversation_participants").delete()
      .eq("conversation_id", currentConversation.id).eq("user_id", currentUser.id);
    if (error) throw error;
    closeGroupSettings(); closeMobileChat();
    currentConversation = null;
    await loadConversations();
    showToast("Left group.", "success");
  } catch (e) { showToast(friendlyError(e), "error"); }
}
async function deleteGroup() {
  if (!groupSettingsState.isAdmin || !currentConversation) return;
  if (!confirm("Delete this group for everyone? This cannot be undone.")) return;
  try {
    await db.from("conversation_participants").delete().eq("conversation_id", currentConversation.id);
    await db.from("messages").delete().eq("conversation_id", currentConversation.id);
    const { error } = await db.from("conversations").delete().eq("id", currentConversation.id);
    if (error) throw error;
    closeGroupSettings(); closeMobileChat();
    currentConversation = null;
    await loadConversations();
    showToast("Group deleted.", "success");
  } catch (e) { showToast(friendlyError(e), "error"); }
}
function copyInviteLink() {
  const link = elements.groupInviteLink.value;
  if (!link) return showToast("No invite link yet.", "error");
  copyText(link, "Invite link copied.");
  const btn = elements.groupCopyInviteBtn;
  if (btn) { btn.classList.add("copied"); setTimeout(() => btn.classList.remove("copied"), 1500); }
}
async function shareInviteLink() {
  const link = elements.groupInviteLink.value;
  if (!link) return showToast("No invite link yet.", "error");
  const name = (groupSettingsState.current && groupSettingsState.current.group_name) || "JustGo group";
  try {
    if (navigator.share) await navigator.share({ title: name, text: "Join my group on JustGo:", url: link });
    else copyInviteLink();
  } catch (e) {}
}

/* =========================================================
   INVITE JOIN
   ========================================================= */
async function tryJoinFromInviteToken(token) {
  try {
    const { data, error } = await db.rpc("get_group_by_invite_token", { p_token: token });
    if (error) throw error;
    const conv = Array.isArray(data) ? data[0] : data;
    if (!conv) return showToast("Invite link is invalid or expired.", "error");
    const { data: existing } = await db.from("conversation_participants").select("id")
      .eq("conversation_id", conv.id).eq("user_id", currentUser.id).maybeSingle();
    if (existing) {
      const { data: fullConv } = await db.from("conversations").select("*").eq("id", conv.id).maybeSingle();
      await openConversation(fullConv || conv); return;
    }
    const body = elements.joinGroupBody;
    const safeAvatar = conv.group_avatar_url ? escapeStyleUrl(conv.group_avatar_url) : "";
    body.innerHTML =
      '<div class="join-group-preview">' +
        '<div class="avatar-big group-avatar"' + (safeAvatar ? ' style="background-image:url(\'' + safeAvatar + '\');color:transparent;"' : '') + '>' +
          escapeHtml((conv.group_name || "G").charAt(0).toUpperCase()) + '</div>' +
        '<h3>' + escapeHtml(conv.group_name || "Group") + '</h3>' +
        (conv.group_description ? '<p>' + escapeHtml(conv.group_description) + '</p>' : "") +
        (conv.member_count ? '<div class="join-meta">' + conv.member_count + ' member' + (conv.member_count === 1 ? "" : "s") + '</div>' : "") +
      '</div>' +
      '<button id="joinGroupConfirmBtn" class="auth-submit" type="button">Join group</button>' +
      '<div id="joinGroupMsg" class="auth-message hidden"></div>';
    openModal(elements.joinGroupModal);
    document.getElementById("joinGroupConfirmBtn").addEventListener("click", async function () {
      const btn = this;
      btn.disabled = true; btn.textContent = "Joining…";
      try {
        const { data: convId, error: rpcErr } = await db.rpc("join_group_by_invite_token", { p_token: token });
        if (rpcErr) throw rpcErr;
        const { data: fullConv } = await db.from("conversations").select("*").eq("id", convId).maybeSingle();
        closeModal(elements.joinGroupModal);
        await loadConversations();
        if (fullConv) await openConversation(fullConv);
        showToast("Joined " + (conv.group_name || "group") + ".", "success");
      } catch (e) {
        const msg = document.getElementById("joinGroupMsg");
        msg.textContent = friendlyError(e);
        msg.classList.remove("hidden"); msg.classList.add("error");
        btn.disabled = false; btn.textContent = "Join group";
      }
    });
  } catch (e) { showToast("Could not open invite link.", "error"); }
}
function checkInviteParam() {
  try {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("join"); if (!token) return;
    if (window.history && window.history.replaceState)
      window.history.replaceState({}, document.title, window.location.pathname);
    if (currentUser) tryJoinFromInviteToken(token);
    else sessionStorage.setItem("justgo_pending_join", token);
  } catch (e) {}
}
function consumePendingJoin() {
  try {
    const token = sessionStorage.getItem("justgo_pending_join");
    if (token) { sessionStorage.removeItem("justgo_pending_join"); tryJoinFromInviteToken(token); }
  } catch (e) {}
}

/* =========================================================
   MULTI-SELECT
   ========================================================= */
function enterMultiSelectMode(initialMessageId) {
  if (!currentConversation) return;
  multiSelectMode = true;
  selectedMessages = new Set();
  if (initialMessageId) selectedMessages.add(initialMessageId);
  if (elements.messages) elements.messages.classList.add("multi-select-mode");
  if (elements.multiSelectToolbar) elements.multiSelectToolbar.classList.remove("hidden");
  updateMultiSelectToolbar();

  if (elements.messages) {
    elements.messages.querySelectorAll(".message-row").forEach(row => {
      const id = row.dataset.messageId;
      row.classList.add("multi-selectable");
      if (id && selectedMessages.has(id)) row.classList.add("selected");
      if (!row.__msBound) {
        row.__msBound = true;
        row.addEventListener("click", (e) => {
          if (!multiSelectMode) return;
          if (e.target.closest("button, a, .cb-wrap, input")) return;
          e.stopPropagation();
          toggleMessageSelection(row.dataset.messageId, row);
        }, true);
      }
    });
  }
}
function exitMultiSelectMode() {
  if (!multiSelectMode) return;
  multiSelectMode = false;
  selectedMessages.clear();
  if (elements.messages) elements.messages.classList.remove("multi-select-mode");
  if (elements.multiSelectToolbar) elements.multiSelectToolbar.classList.add("hidden");
  if (elements.messages) {
    elements.messages.querySelectorAll(".message-row.selected").forEach(r => r.classList.remove("selected"));
  }
}
function toggleMessageSelection(messageId, rowEl) {
  if (!messageId) return;
  if (selectedMessages.has(messageId)) {
    selectedMessages.delete(messageId);
    if (rowEl) rowEl.classList.remove("selected");
  } else {
    selectedMessages.add(messageId);
    if (rowEl) rowEl.classList.add("selected");
  }
  updateMultiSelectToolbar();
}
function updateMultiSelectToolbar() {
  if (elements.mstCount) elements.mstCount.textContent = String(selectedMessages.size);
}

async function handleMultiSelectAction(e) {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;
  const action = btn.dataset.action;

  if (action === "cancel") { exitMultiSelectMode(); return; }
  if (selectedMessages.size === 0) return showToast("Select at least one message.", "error");

  if (action === "copy") {
    const ids = Array.from(selectedMessages);
    const { data } = await db.from("messages").select("id, content, created_at, sender_id").in("id", ids);
    if (!data || !data.length) return showToast("Nothing to copy.", "error");
    data.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    const lines = [];
    for (const m of data) {
      const sender = profileCache[m.sender_id];
      const senderName = sender ? (sender.display_name || sender.username) : "Someone";
      const time = new Date(m.created_at).toLocaleString([], { hour: "numeric", minute: "2-digit" });
      lines.push("[" + time + "] " + senderName + ": " + (m.content || "(file)"));
    }
    copyText(lines.join("\n"), "Copied " + data.length + " message" + (data.length === 1 ? "" : "s") + ".");
    return;
  }

  if (action === "forward") { openForwardModal(null); return; }

  if (action === "delete") {
    if (!confirm("Delete " + selectedMessages.size + " selected message" + (selectedMessages.size === 1 ? "" : "s") + " for everyone?")) return;
    const ids = Array.from(selectedMessages);
    try {
      const { data: atts } = await db.from("message_attachments").select("storage_path").in("message_id", ids);
      if (atts && atts.length) {
        const paths = atts.map(a => a.storage_path).filter(Boolean);
        if (paths.length) {
          try { await db.storage.from(STORAGE_BUCKET).remove(paths); } catch (e) {}
        }
        await db.from("message_attachments").delete().in("message_id", ids);
      }
      await db.from("messages").update({ deleted: true, content: "" }).in("id", ids);
      showToast("Deleted " + ids.length + " message" + (ids.length === 1 ? "" : "s") + ".", "success");
      exitMultiSelectMode();
      await loadMessages();
    } catch (err) { showToast(friendlyError(err), "error"); }
  }
}

/* =========================================================
   FORWARD
   ========================================================= */
let _forwardConversationsCache = null;

function openForwardModal(message) {
  if (!message && selectedMessages.size === 0) return;
  forwardSourceMessage = message || null;
  elements.forwardSearch.value = "";
  elements.forwardStatus.classList.add("hidden");
  elements.forwardStatus.classList.remove("error", "success");
  skeletonList(elements.forwardList, "forward-item", 5);
  openModal(elements.forwardModal);
  renderForwardList("");
}
function closeForwardModal() {
  closeModal(elements.forwardModal);
  forwardSourceMessage = null;
}
async function renderForwardList(q) {
  const list = elements.forwardList;
  if (!list) return;
  try {
    let rows = _forwardConversationsCache;
    if (!rows) {
      const { data, error } = await db.rpc("get_sidebar_conversations");
      if (error) throw error;
      rows = data || [];
      _forwardConversationsCache = rows;
      setTimeout(() => { _forwardConversationsCache = null; }, 30000);
    }
    const query = (q || "").trim().toLowerCase();
    const filtered = rows.filter(c => {
      if (!query) return true;
      const title = (c.is_group ? c.group_name : (c.other_display_name || c.other_username)) || "";
      return title.toLowerCase().indexOf(query) > -1;
    });
    if (!filtered.length) { list.innerHTML = '<div class="search-empty">No chats found.</div>'; return; }
    list.innerHTML = "";
    filtered.forEach(c => {
      const title = c.is_group ? (c.group_name || "Group") : (c.other_display_name || c.other_username || "User");
      const item = document.createElement("div");
      item.className = "forward-item";
      const initial = title.charAt(0).toUpperCase();
      const avatarUrl = c.is_group ? c.group_avatar_url : c.other_avatar_url;
      const premiumClass = (!c.is_group && c.other_is_premium) ? ' premium-avatar' : '';
      const safeAvatar = avatarUrl ? escapeStyleUrl(avatarUrl) : "";
      item.innerHTML =
        '<div class="fi-ic ' + (c.is_group ? "group" : "") + premiumClass + '"' +
          (safeAvatar ? ' style="background-image:url(\'' + safeAvatar + '\');color:transparent;background-size:cover;background-position:center;"' : '') +
        '>' + escapeHtml(initial) + '</div>' +
        '<div class="fi-info">' +
          '<strong>' + escapeHtml(title) + '</strong>' +
          '<span>' + (c.is_group ? "Group" : "@" + escapeHtml(c.other_username || "")) + '</span>' +
        '</div>';
      item.addEventListener("click", () => doForward(c.id, title));
      list.appendChild(item);
    });
  } catch (e) { list.innerHTML = '<div class="search-empty">Could not load chats.</div>'; }
}
async function runForwardSearch() {
  const q = (elements.forwardSearch.value || "").trim();
  renderForwardList(q);
}
async function doForward(convId, title) {
  let messagesToForward = [];
  if (multiSelectMode && selectedMessages.size > 0) {
    const ids = Array.from(selectedMessages);
    const { data } = await db.from("messages").select("*").in("id", ids);
    messagesToForward = (data || []).sort((a,b) => new Date(a.created_at) - new Date(b.created_at));
  } else if (forwardSourceMessage) {
    messagesToForward = [forwardSourceMessage];
  } else return;
  if (!messagesToForward.length) return;

  elements.forwardStatus.textContent = "Forwarding…";
  elements.forwardStatus.classList.remove("hidden", "error", "success");

  let okCount = 0, failCount = 0;
  for (const m of messagesToForward) {
    try {
      const content = m.content || "";
      const insertData = { conversation_id: convId, sender_id: currentUser.id, content };
      if (m.kind && m.kind !== 'text') insertData.kind = m.kind;
      if (m.meta) insertData.meta = m.meta;

      const { data: newMsg, error } = await db.from("messages").insert(insertData).select().single();
      if (error) throw error;

      const { data: srcAtts } = await db.from("message_attachments").select("*").eq("message_id", m.id);
      for (const a of (srcAtts || [])) {
        try {
          const { data: blob } = await db.storage.from(STORAGE_BUCKET).download(a.storage_path);
          if (blob) {
            const unique = Date.now() + "-" + Math.random().toString(36).slice(2, 8);
            const safeName = (a.file_name || "file").replace(/[^a-zA-Z0-9._-]/g, "_");
            const newPath = currentUser.id + "/" + convId + "/" + newMsg.id + "/" + unique + "-" + safeName;
            await db.storage.from(STORAGE_BUCKET).upload(newPath, blob, { upsert: false });
            const expiresAt = new Date(Date.now() + currentFileTtlMs()).toISOString();
            await db.from("message_attachments").insert({
              message_id: newMsg.id, conversation_id: convId, uploader_id: currentUser.id,
              storage_path: newPath, file_name: a.file_name, mime_type: a.mime_type,
              size_bytes: a.size_bytes, expires_at: expiresAt
            });
          }
        } catch (e) {}
      }

      const previewText = content ? content.slice(0, 80) : "📎 Forwarded";
      await db.from("conversations").update({
        last_message_preview: previewText,
        last_message_at: new Date().toISOString(),
        last_message_sender_id: currentUser.id
      }).eq("id", convId);
      okCount++;
    } catch (e) { failCount++; }
  }

  if (failCount === 0) {
    elements.forwardStatus.textContent = "Forwarded " + okCount + " message" + (okCount === 1 ? "" : "s") + " to " + title;
    elements.forwardStatus.classList.add("success");
    showToast("Forwarded.", "success");
    exitMultiSelectMode();
    setTimeout(() => closeForwardModal(), 700);
  } else {
    elements.forwardStatus.textContent = okCount + " forwarded, " + failCount + " failed.";
    elements.forwardStatus.classList.add("error");
  }
}

/* =========================================================
   CHAT INFO
   ========================================================= */
async function openChatInfo() {
  if (!currentConversation) return;
  if (!elements.chatInfoContent) return;
  elements.chatInfoContent.innerHTML = '<div class="search-empty">Loading...</div>';
  openModal(elements.chatInfoModal);
  const conv = currentConversation;
  const isAdmin = isAdminInCurrentConversation();
  const isProAdmin = conv.created_by === currentUser.id;

  const head = [];
  head.push('<div class="chat-info-row"><span>Type</span><span>' + (conv.is_group ? "Group" : "Direct message") + '</span></div>');
  if (conv.is_group) {
    head.push('<div class="chat-info-row"><span>Name</span><span>' + escapeHtml(conv.group_name || "Group") + '</span></div>');
    if (conv.group_description)
      head.push('<div class="chat-info-row"><span>About</span><span>' + escapeHtml(conv.group_description) + '</span></div>');
    head.push('<div class="chat-info-row"><span>Posting</span><span>' +
      (conv.announcements_only || conv.posting_mode === "admins" ? "Admins only" : "Everyone") + '</span></div>');
  }
  head.push('<div class="chat-info-row"><span>Created</span><span>' + formatListTime(conv.created_at) + '</span></div>');

  const [msgCountRes, fileCountRes] = await Promise.all([
    db.from("messages").select("id", { count: "exact", head: true }).eq("conversation_id", conv.id),
    db.from("message_attachments").select("id", { count: "exact", head: true }).eq("conversation_id", conv.id)
  ]);
  head.push('<div class="chat-info-row"><span>Messages</span><span>' + (msgCountRes.count || 0) + '</span></div>');
  head.push('<div class="chat-info-row"><span>Files shared</span><span>' + (fileCountRes.count || 0) + '</span></div>');

  elements.chatInfoContent.innerHTML =
    '<div class="chat-info-overview">' + head.join("") + '</div>' +
    '<div class="ci-tabs" id="ciTabs">' +
      '<button data-tab="members" class="active" type="button">Members</button>' +
      '<button data-tab="pinned" type="button">Pinned</button>' +
      '<button data-tab="media" type="button">Media</button>' +
      '<button data-tab="files" type="button">Files</button>' +
      '<button data-tab="links" type="button">Links</button>' +
      (conv.is_group ? '<button data-tab="fundraiser" type="button">Fundraise</button>' : '') +
      (conv.is_group ? '<button data-tab="split" type="button">Split</button>' : '') +
    '</div>' +
    '<div class="ci-panels">' +
      '<div class="ci-panel active" data-panel="members" id="ciMembers"><div class="ci-empty">Loading…</div></div>' +
      '<div class="ci-panel" data-panel="pinned" id="ciPinned"><div class="ci-empty">Loading…</div></div>' +
      '<div class="ci-panel" data-panel="media" id="ciMedia"><div class="ci-empty">Loading…</div></div>' +
      '<div class="ci-panel" data-panel="files" id="ciFiles"><div class="ci-empty">Loading…</div></div>' +
      '<div class="ci-panel" data-panel="links" id="ciLinks"><div class="ci-empty">Loading…</div></div>' +
      (conv.is_group ? '<div class="ci-panel" data-panel="fundraiser" id="ciFundraiser"><div class="ci-empty">Loading…</div></div>' : '') +
      (conv.is_group ? '<div class="ci-panel" data-panel="split" id="ciSplit"></div>' : '') +
    '</div>';

  const loadedPanels = new Set();
  const panelLoaders = {
    members:    () => renderCiMembers(isAdmin, isProAdmin),
    pinned:     () => renderCiPinned(),
    media:      () => renderCiMedia(),
    files:      () => renderCiFiles(),
    links:      () => renderCiLinks(),
    fundraiser: () => renderCiFundraisers(),
    split:      () => { renderCiSplitPanel(); return Promise.resolve(); }
  };

  async function ensurePanelLoaded(tabName) {
    if (loadedPanels.has(tabName)) return;
    loadedPanels.add(tabName);
    const loader = panelLoaders[tabName];
    if (loader) await loader();
  }

  const tabs = document.getElementById("ciTabs");
  if (tabs) {
    tabs.addEventListener("click", async e => {
      const btn = e.target.closest("button[data-tab]"); if (!btn) return;
      const name = btn.dataset.tab;
      document.querySelectorAll("#ciTabs button").forEach(b => b.classList.toggle("active", b === btn));
      document.querySelectorAll(".ci-panel").forEach(p => p.classList.toggle("active", p.dataset.panel === name));
      await ensurePanelLoaded(name);
    });
  }

  await ensurePanelLoaded("members");
}

async function renderCiMembers(isAdmin, isProAdmin) {
  const wrap = document.getElementById("ciMembers"); if (!wrap) return;
  const memberIds = currentParticipants.map(p => p.user_id);
  if (!memberIds.length) { wrap.innerHTML = '<div class="ci-empty">No members.</div>'; return; }

  const { data: profiles } = await db.from("profiles")
    .select("id, username, display_name, avatar_url, last_seen, is_premium, is_verified")
    .in("id", memberIds);

  (profiles || []).forEach(p => {
    profileCache[p.id] = Object.assign({}, profileCache[p.id] || {}, p);
    profileCacheTime[p.id] = Date.now();
  });

  const adminCount = currentParticipants.filter(x => x.role === "admin").length;
  const proAdminId = currentConversation.created_by;

  const frag = document.createDocumentFragment();
  (profiles || []).forEach(p => {
    const part = currentParticipants.find(x => x.user_id === p.id) || {};
    const role = part.role || "member";
    const online = isOnline(p.last_seen, p.id);
    const initial = (p.display_name || p.username).charAt(0).toUpperCase();
    const isSelf = p.id === currentUser.id;
    const isTargetProAdmin = p.id === proAdminId;
    const isGroup = currentConversation.is_group;

    const canMenu = isGroup && !isSelf;
    const canPromote = isAdmin && !isSelf && role !== "admin" && !isTargetProAdmin;
    const canDemote = isAdmin && !isSelf && role === "admin" && !isTargetProAdmin && adminCount > 1;
    const canKick = isAdmin && !isSelf && !isTargetProAdmin && (isProAdmin || role !== "admin");

    const row = document.createElement("div");
    row.className = "chat-info-member";
    const safeAvatar = p.avatar_url ? escapeStyleUrl(p.avatar_url) : "";
    row.innerHTML =
      '<div class="avatar-small' + (p.is_premium ? ' premium-avatar' : '') + '"' +
        (safeAvatar ? ' style="background-image:url(\'' + safeAvatar + '\');color:transparent;"' : '') + '>' + escapeHtml(initial) +
        (online ? '<span class="online-dot" style="width:10px;height:10px;border-width:2px;"></span>' : '') + '</div>' +
      '<div class="chat-info-member-info" style="cursor:pointer;">' +
        '<strong>' + escapeHtml(p.display_name || p.username) +
          (p.is_verified ? ' <span class="verified-tick-inline">✓</span>' : '') +
          (p.is_premium ? ' 👑' : '') +
          (isGroup && isTargetProAdmin ? '<span class="member-role-badge admin">Creator</span>' :
            (isGroup && role === "admin" ? '<span class="member-role-badge admin">Admin</span>' : '')) +
        '</strong>' +
        '<span>@' + escapeHtml(p.username) + (online ? ' • online' : '') + '</span>' +
      '</div>' +
      '<div class="member-actions"></div>';

    const actionsWrap = row.querySelector(".member-actions");

    if (canMenu) {
      const menuBtn = document.createElement("button");
      menuBtn.className = "member-action-btn";
      menuBtn.type = "button";
      menuBtn.title = "More";
      menuBtn.innerHTML = "⋯";
      menuBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        showMemberMenu(menuBtn, {
          profile: p, role, isTargetProAdmin, canPromote, canDemote, canKick
        });
      });
      actionsWrap.appendChild(menuBtn);
    }

    const info = row.querySelector(".chat-info-member-info");
    if (info) info.addEventListener("click", () => {
      closeModal(elements.chatInfoModal); openPublicProfile(p.username);
    });
    frag.appendChild(row);
  });

  wrap.innerHTML = "";
  wrap.appendChild(frag);

  if (isAdmin && currentConversation.is_group) {
    const title = document.createElement("div");
    title.className = "chat-info-section-title"; title.textContent = "Add members";
    wrap.appendChild(title);
    const inp = document.createElement("input");
    inp.type = "text"; inp.placeholder = "Search classmate by name or @username";
    inp.className = "chat-info-add-input";
    wrap.appendChild(inp);
    const res = document.createElement("div");
    res.className = "share-user-results"; res.style.marginTop = "8px";
    wrap.appendChild(res);
    let t = null;
    inp.addEventListener("input", () => {
      clearTimeout(t);
      const q = inp.value.trim().toLowerCase();
      if (q.length < 1) { res.innerHTML = ""; return; }
      t = setTimeout(async () => {
        const { data } = await db.from("profiles").select("id, username, display_name, avatar_url, is_premium")
          .neq("id", currentUser.id).or("username.ilike.%" + q + "%,display_name.ilike.%" + q + "%").limit(8);
        res.innerHTML = "";
        const existingIds = currentParticipants.map(p => p.user_id);
        (data || []).forEach(u => {
          if (existingIds.indexOf(u.id) > -1) return;
          const r = document.createElement("div");
          r.className = "share-user-row";
          const initial = (u.display_name || u.username).charAt(0).toUpperCase();
          const safeAvatar = u.avatar_url ? escapeStyleUrl(u.avatar_url) : "";
          r.innerHTML =
            '<div class="avatar-small' + (u.is_premium ? ' premium-avatar' : '') + '"' +
              (safeAvatar ? ' style="background-image:url(\'' + safeAvatar + '\');color:transparent;"' : '') + '>' + escapeHtml(initial) + '</div>' +
                        '<div class="share-user-row-info"><strong>' + escapeHtml(u.display_name || u.username) +
              (u.is_premium ? ' 👑' : '') +
              '</strong><span>@' + escapeHtml(u.username) + '</span></div>';
          r.addEventListener("click", () => addParticipantToGroup(u.id));
          res.appendChild(r);
        });
      }, 220);
    });
  }
}

function showMemberMenu(anchor, opts) {
  document.querySelectorAll(".member-popup-menu").forEach(x => x.remove());

  const menu = document.createElement("div");
  menu.className = "member-popup-menu";

  const p = opts.profile;

  const msgBtn = document.createElement("button");
  msgBtn.type = "button";
  msgBtn.innerHTML = '<span class="mp-ic">💬</span><span>Message privately</span>';
  msgBtn.addEventListener("click", () => {
    menu.remove();
    closeModal(elements.chatInfoModal);
    startConversation({
      id: p.id, username: p.username, display_name: p.display_name,
      avatar_url: p.avatar_url, is_premium: p.is_premium
    });
  });
  menu.appendChild(msgBtn);

  const moneyBtn = document.createElement("button");
  moneyBtn.type = "button";
  moneyBtn.innerHTML = '<span class="mp-ic">₹</span><span>Send money</span>';
  moneyBtn.addEventListener("click", () => {
    menu.remove();
    closeModal(elements.chatInfoModal);
    openWalletModal({ mode: 'dm', partner: {
      id: p.id, username: p.username, display_name: p.display_name,
      avatar_url: p.avatar_url, is_premium: p.is_premium
    }});
  });
  menu.appendChild(moneyBtn);

  if (opts.canPromote) {
    const promoteBtn = document.createElement("button");
    promoteBtn.type = "button";
    promoteBtn.innerHTML = '<span class="mp-ic">⬆️</span><span>Make admin</span>';
    promoteBtn.addEventListener("click", () => {
      menu.remove();
      setGroupAdminRole(p.id, true);
    });
    menu.appendChild(promoteBtn);
  }

  if (opts.canDemote) {
    const demoteBtn = document.createElement("button");
    demoteBtn.type = "button";
    demoteBtn.innerHTML = '<span class="mp-ic">⬇️</span><span>Remove admin</span>';
    demoteBtn.addEventListener("click", () => {
      menu.remove();
      setGroupAdminRole(p.id, false);
    });
    menu.appendChild(demoteBtn);
  }

  if (opts.canKick) {
    const kickBtn = document.createElement("button");
    kickBtn.type = "button";
    kickBtn.className = "danger";
    kickBtn.innerHTML = '<span class="mp-ic">🚪</span><span>Remove from group</span>';
    kickBtn.addEventListener("click", () => {
      menu.remove();
      removeParticipant(p.id);
    });
    menu.appendChild(kickBtn);
  }

  if (opts.isTargetProAdmin) {
    const info = document.createElement("div");
    info.className = "mp-note";
    info.textContent = "Group creator — cannot be demoted or removed.";
    menu.appendChild(info);
  }

  document.body.appendChild(menu);
  const rect = anchor.getBoundingClientRect();
  const mw = menu.offsetWidth || 220;
  const mh = menu.offsetHeight || 200;
  let left = rect.right - mw;
  let top = rect.bottom + 6;
  if (left < 8) left = 8;
  if (left + mw > window.innerWidth - 8) left = window.innerWidth - mw - 8;
  if (top + mh > window.innerHeight - 8) top = rect.top - mh - 6;
  menu.style.left = left + "px";
  menu.style.top = top + "px";

  setTimeout(() => {
    document.addEventListener("click", function onDoc(ev) {
      if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener("click", onDoc, true); }
    }, true);
  }, 10);
}

async function setGroupAdminRole(userId, makeAdmin) {
  if (!currentConversation || !currentConversation.is_group) return;
  const verb = makeAdmin ? "promote to admin" : "remove admin";
  const p = await getProfileCached(userId);
  const name = (p && p.display_name) || "this member";
  if (!confirm("Are you sure you want to " + verb + " " + name + "?")) return;
  try {
    const { data, error } = await db.rpc("set_group_admin", {
      p_conversation_id: currentConversation.id,
      p_user_id: userId,
      p_make_admin: makeAdmin
    });
    if (error) throw error;
    if (data && !data.ok) {
      if (data.error === "last_admin") return showToast("You cannot demote the last admin.", "error");
      if (data.error === "pro_admin") return showToast("The group creator cannot be demoted.", "error");
      if (data.error === "not_admin") return showToast("Only admins can do this.", "error");
      return showToast("Could not update role.", "error");
    }
    await openConversation(currentConversation);
    await openChatInfo();
    showToast(makeAdmin ? "Promoted to admin." : "Admin removed.", "success");
  } catch (e) { showToast(friendlyError(e), "error"); }
}

async function renderCiPinned() {
  const wrap = document.getElementById("ciPinned"); if (!wrap) return;
  if (!pinnedMessages.length) { wrap.innerHTML = '<div class="ci-empty">No pinned messages.</div>'; return; }
  wrap.innerHTML = "";
  for (const pm of pinnedMessages) {
    const m = pm.messages; if (!m) continue;
    const row = document.createElement("div");
    row.className = "ci-list-row";
    const text = (m.content || "(file)").slice(0, 120);
    row.innerHTML =
      '<div class="ci-list-icon ci-list-icon-pin">📌</div>' +
      '<div class="ci-list-body">' +
        '<div class="ci-list-title">' + escapeHtml(text) + '</div>' +
        '<div class="ci-list-meta">' + formatListTime(pm.pinned_at) + '</div>' +
      '</div>';
    const a = document.createElement("button");
    a.className = "ci-list-action"; a.type = "button"; a.textContent = "Jump";
    a.addEventListener("click", () => {
      closeModal(elements.chatInfoModal);
      const t = elements.messages.querySelector('[data-message-id="' + m.id + '"]');
      if (t) t.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    row.appendChild(a);
    wrap.appendChild(row);
  }
}

async function renderCiMedia() {
  const wrap = document.getElementById("ciMedia"); if (!wrap) return;
  const { data } = await db.from("message_attachments").select("id, storage_path, mime_type")
    .eq("conversation_id", currentConversation.id).ilike("mime_type", "image/%")
    .order("created_at", { ascending: false }).limit(60);
  if (!data || !data.length) { wrap.innerHTML = '<div class="ci-empty">No photos yet.</div>'; return; }
  const grid = document.createElement("div");
  grid.className = "ci-media-grid"; wrap.innerHTML = "";
  for (const a of data) {
    let url = attachmentUrlCache.get(a.storage_path);
    if (!url) {
      try {
        const { data: signed } = await db.storage.from(STORAGE_BUCKET).createSignedUrl(a.storage_path, 3600);
        if (signed) { url = signed.signedUrl; attachmentUrlCache.set(a.storage_path, url); }
      } catch (e) {}
    }
    if (!url) continue;
    const img = document.createElement("img");
    img.src = url; img.loading = "lazy"; img.alt = "";
    img.addEventListener("click", () => window.open(url, "_blank", "noopener"));
    grid.appendChild(img);
  }
  wrap.appendChild(grid);
}

async function renderCiFiles() {
  const wrap = document.getElementById("ciFiles"); if (!wrap) return;
  const { data } = await db.from("message_attachments").select("id, storage_path, file_name, size_bytes, mime_type, created_at, expires_at")
    .eq("conversation_id", currentConversation.id).order("created_at", { ascending: false }).limit(60);
  if (!data || !data.length) { wrap.innerHTML = '<div class="ci-empty">No files shared yet.</div>'; return; }
  const now = Date.now();
  wrap.innerHTML = "";
  for (const a of data) {
    const expired = a.expires_at && new Date(a.expires_at).getTime() < now;
    const row = document.createElement("div");
    row.className = "ci-list-row";
    let ext = "FILE";
    if (a.file_name && a.file_name.indexOf(".") > -1) ext = a.file_name.split(".").pop().slice(0, 4);
    row.innerHTML = '<div class="ci-list-icon">' + escapeHtml(ext) + '</div>' +
      '<div class="ci-list-body"><div class="ci-list-title">' + escapeHtml(a.file_name) + '</div>' +
      '<div class="ci-list-meta">' + formatFileSize(a.size_bytes) +
        (expired ? ' • <span style="color:var(--danger)">expired</span>' : '') +
      '</div></div>';
    if (!expired) {
      let url = attachmentUrlCache.get(a.storage_path);
      if (!url) {
        try {
          const { data: signed } = await db.storage.from(STORAGE_BUCKET).createSignedUrl(a.storage_path, 3600);
          if (signed) { url = signed.signedUrl; attachmentUrlCache.set(a.storage_path, url); }
        } catch (e) {}
      }
      if (url) {
        const link = document.createElement("a");
        link.className = "ci-list-action"; link.href = url; link.target = "_blank"; link.rel = "noopener"; link.textContent = "Open";
        row.appendChild(link);
      }
    }
    wrap.appendChild(row);
  }
}

async function renderCiLinks() {
  const wrap = document.getElementById("ciLinks"); if (!wrap) return;
  const { data } = await db.from("messages").select("id, content, created_at")
    .eq("conversation_id", currentConversation.id).ilike("content", "%http%")
    .order("created_at", { ascending: false }).limit(120);
  if (!data || !data.length) { wrap.innerHTML = '<div class="ci-empty">No links shared yet.</div>'; return; }
  const urlRegex = /(https?:\/\/[^\s]+)/gi;
  const links = [];
  for (const m of data) {
    const matches = String(m.content || "").match(urlRegex) || [];
    matches.forEach(u => links.push({ url: u, at: m.created_at }));
    if (links.length >= 40) break;
  }
  if (!links.length) { wrap.innerHTML = '<div class="ci-empty">No links shared yet.</div>'; return; }
  wrap.innerHTML = "";
  links.forEach(l => {
    const row = document.createElement("div");
    row.className = "ci-list-row";
    row.innerHTML = '<div class="ci-list-icon ci-list-icon-link">🔗</div>' +
      '<div class="ci-list-body"><div class="ci-list-title ci-list-title-break">' + escapeHtml(l.url.slice(0, 100)) + '</div>' +
      '<div class="ci-list-meta">' + formatListTime(l.at) + '</div></div>';
    const a = document.createElement("a");
    a.className = "ci-list-action"; a.href = l.url; a.target = "_blank"; a.rel = "noopener"; a.textContent = "Open";
    row.appendChild(a); wrap.appendChild(row);
  });
}

async function renderCiFundraisers() {
  const wrap = document.getElementById("ciFundraiser"); if (!wrap) return;
  wrap.innerHTML = "";

  const createBtn = document.createElement("button");
  createBtn.className = "fundraiser-btn primary";
  createBtn.style.width = "100%";
  createBtn.style.marginBottom = "12px";
  createBtn.type = "button";
  createBtn.textContent = "🎯 Start a new fundraiser";
  createBtn.addEventListener("click", () => openCreateFundraiserModal());
  wrap.appendChild(createBtn);

  const { data, error } = await db.from("group_fundraisers")
    .select("*")
    .eq("conversation_id", currentConversation.id)
    .order("created_at", { ascending: false });

  if (error) { wrap.innerHTML += '<div class="ci-empty">Could not load fundraisers.</div>'; return; }
  if (!data || !data.length) {
    wrap.innerHTML += '<div class="ci-empty">No fundraisers yet. Start one above.</div>';
    return;
  }

  const list = document.createElement("div");
  list.className = "fundraiser-list";
  for (const f of data) {
    const creator = await getProfileCached(f.created_by);
    const creatorName = creator ? (creator.display_name || creator.username) : "Someone";
    const goal = Number(f.goal_amount || 0);
    const raised = Number(f.raised_amount || 0);
    const pct = goal > 0 ? Math.min(100, Math.round((raised / goal) * 100)) : 0;
    const card = document.createElement("div");
    card.className = "fundraiser-card";
    card.innerHTML =
      '<div class="fundraiser-head">' +
        '<div class="fundraiser-head-icon">🎯</div>' +
        '<div class="fundraiser-head-body">' +
          '<strong>' + escapeHtml(f.title) + '</strong>' +
          '<span>By ' + escapeHtml(creatorName) + ' • ' + formatListTime(f.created_at) + '</span>' +
        '</div>' +
      '</div>' +
      (f.description ? '<div style="font-size:12.5px;color:var(--text-muted);line-height:1.5;margin-bottom:10px;">' + escapeHtml(f.description) + '</div>' : '') +
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
        (f.is_active && f.created_by !== currentUser.id ? '<button class="fundraiser-btn primary" type="button" data-action="contribute">Contribute</button>' : '') +
        '<button class="fundraiser-btn secondary" type="button" data-action="details">Details</button>' +
      '</div>';
    const contrib = card.querySelector('[data-action="contribute"]');
    if (contrib) contrib.addEventListener("click", () => openContributeModal(f));
    const details = card.querySelector('[data-action="details"]');
    if (details) details.addEventListener("click", () => openFundraiserDetails(f));
    list.appendChild(card);
  }
  wrap.appendChild(list);
}

function renderCiSplitPanel() {
  const wrap = document.getElementById("ciSplit"); if (!wrap) return;
  wrap.innerHTML =
    '<p class="settings-hint" style="margin-top:6px;">Split a total amount between members of this group. A small fee applies.</p>' +
    '<button class="auth-submit" type="button" id="ciSplitOpenBtn">Open split bill</button>';
  const btn = document.getElementById("ciSplitOpenBtn");
  if (btn) btn.addEventListener("click", () => {
    closeModal(elements.chatInfoModal); openSplitBillModal();
  });
}

async function removeParticipant(userId) {
  if (!currentConversation || !currentConversation.is_group) return;
  if (currentConversation.created_by === userId) {
    return showToast("The group creator cannot be removed.", "error");
  }
  if (!confirm("Remove this person from the group?")) return;
  try {
    const { error } = await db.from("conversation_participants").delete()
      .eq("conversation_id", currentConversation.id).eq("user_id", userId);
    if (error) throw error;
    currentParticipants = currentParticipants.filter(p => p.user_id !== userId);
    await openChatInfo();
    showToast("Removed.", "success");
  } catch (e) { showToast(friendlyError(e), "error"); }
}
async function addParticipantToGroup(userId) {
  if (!currentConversation || !currentConversation.is_group) return;
  try {
    const { error } = await db.from("conversation_participants").insert({
      conversation_id: currentConversation.id, user_id: userId, role: "member"
    });
    if (error) throw error;
    showToast("Added.", "success");
    await openConversation(currentConversation, null);
    await openChatInfo();
  } catch (e) { showToast(friendlyError(e), "error"); }
}
function closeChatInfo() { closeModal(elements.chatInfoModal); }

/* =========================================================
   ANNOUNCEMENT BANNER
   ========================================================= */
function updateAnnouncementBanner() {
  if (!elements.announcementBanner) return;
  if (!currentConversation) {
    elements.announcementBanner.classList.add("hidden");
    return;
  }
  const isGroup = currentConversation.is_group;
  const annOnly = !!(currentConversation.announcements_only || currentConversation.posting_mode === "admins");
  if (isGroup && annOnly) {
    elements.announcementBanner.classList.remove("hidden");
    if (!isAdminInCurrentConversation()) {
      if (elements.messageInput) {
        elements.messageInput.disabled = true;
        elements.messageInput.placeholder = "Only admins can post in this group";
      }
      if (elements.sendBtn) elements.sendBtn.disabled = true;
    } else {
      if (elements.messageInput) {
        elements.messageInput.disabled = false;
        elements.messageInput.placeholder = "Write a message...";
      }
      if (elements.sendBtn) elements.sendBtn.disabled = false;
    }
  } else {
    elements.announcementBanner.classList.add("hidden");
    if (elements.messageInput) {
      elements.messageInput.disabled = false;
      elements.messageInput.placeholder = "Write a message...";
    }
    if (elements.sendBtn) elements.sendBtn.disabled = false;
  }
}

/* =========================================================
   SAVE TO JUSTGO NOTES
   ========================================================= */
function openSaveNoteModal(message) {
  if (!elements.saveNoteModal) return;
  const preview = (message.content || "(file)").slice(0, 120);
  elements.saveNoteTitle.value = preview.slice(0, 60) || "Message";
  elements.saveNoteInput.value = "";
  elements.saveNoteMsg.classList.add("hidden");
  elements.saveNoteMsg.classList.remove("error", "success");
  elements.saveNoteModal.dataset.messageId = message.id;
  elements.saveNoteModal.dataset.conversationId = message.conversation_id || "";
  openModal(elements.saveNoteModal);
  setTimeout(() => elements.saveNoteTitle.focus(), 80);
}

async function saveNoteFromModal() {
  const messageId = elements.saveNoteModal.dataset.messageId;
  const conversationId = elements.saveNoteModal.dataset.conversationId;
  if (!messageId) return;
  const title = elements.saveNoteTitle.value.trim() || "Chat message";
  const noteText = elements.saveNoteInput.value.trim();

  elements.saveNoteSave.disabled = true;
  elements.saveNoteSave.textContent = "Saving…";
  try {
    const { data: msg } = await db.from("messages").select("content, sender_id, created_at").eq("id", messageId).maybeSingle();
    const sender = msg ? await getProfileCached(msg.sender_id) : null;
    const senderName = sender ? (sender.display_name || sender.username) : "Someone";
    const when = msg ? new Date(msg.created_at).toLocaleString() : new Date().toLocaleString();
    const body =
      (msg && msg.content ? msg.content : "(attachment)") +
      "\n\n— " + senderName + " · " + when +
      (noteText ? "\n\nMy note:\n" + noteText : "");

    const { error } = await db.from("notes").insert({
      owner_id: currentUser.id,
      title,
      body,
      source_message_id: messageId,
      source_conversation_id: conversationId || null,
      source_kind: "chat_message"
    });
    if (error) throw error;
    elements.saveNoteMsg.textContent = "Saved to JustGo Notes.";
    elements.saveNoteMsg.classList.remove("hidden", "error");
    elements.saveNoteMsg.classList.add("success");
    showToast("Saved to JustGo Notes.", "success");
    setTimeout(() => closeModal(elements.saveNoteModal), 700);
  } catch (e) {
    elements.saveNoteMsg.textContent = friendlyError(e);
    elements.saveNoteMsg.classList.remove("hidden", "success");
    elements.saveNoteMsg.classList.add("error");
  } finally {
    elements.saveNoteSave.disabled = false;
    elements.saveNoteSave.textContent = "Save";
  }
}

console.log('[JustGo] sidegogo.js loaded — v4');