/* =========================================================================
   JustGo — auth-and-profile.js (v16)
   Session, signup/login, enter app, profile, premium (multi-tier),
   saved messages, public profile, search users, notifications, presence.

   Changelog v15 → v16:
     • Removed `window.db = db` module-init line (race condition).
       window.db is now owned exclusively by core.js.
     • No other logic changes.
   ========================================================================= */

/* ---------- 1. Session ---------- */
async function checkSession() {
  try {
    const { data, error } = await db.auth.getSession();
    if (error) throw error;
    if (data.session) { currentUser = data.session.user; await enterApp(); }
    else showAuth();
  } catch (e) { console.error(e); showAuth(); }

  db.auth.onAuthStateChange(async (event, session) => {
    if (event === "SIGNED_OUT") {
      if (typeof cleanupRealtime === "function") cleanupRealtime();
      if (typeof cleanupWalletRealtime === "function") cleanupWalletRealtime();
      currentUser = null; currentProfile = null;
      currentConversation = null; currentParticipants = [];
      for (const k in profileCache) delete profileCache[k];
      for (const k in profileCacheTime) delete profileCacheTime[k];
      attachmentUrlCache.clear();
      savedMessageIds.clear();
      conversationPrefs = {};
      myWallet = { balance: 0, currency: "INR", is_frozen: false };
      walletTransactions = []; walletRequestsIncoming = []; walletRequestsOutgoing = [];
      walletUnreadBadge = 0;
      myPremium = { is_premium: false, started_at: null, expires_at: null, days_left: 0, price: 49, duration_days: 30 };
      if (typeof updateWalletChipUI === "function") updateWalletChipUI();
      showAuth();
      document.dispatchEvent(new CustomEvent("justgo:signout"));
      return;
    }
    if (session && (event === "SIGNED_IN" || event === "INITIAL_SESSION")) {
      currentUser = session.user;
      document.dispatchEvent(new CustomEvent("justgo:signin"));
      if (elements.appScreen && elements.appScreen.classList.contains("hidden")) {
        enterApp().catch(err => console.error("enterApp:", err));
      }
    }
  });
}

function showAuth() {
  elements.authScreen.classList.remove("hidden");
  elements.appScreen.classList.add("hidden");
  elements.loginSection.classList.remove("hidden");
  elements.signupSection.classList.add("hidden");
  clearAuthMessage();
}
function showSignup() {
  clearAuthMessage();
  elements.loginSection.classList.add("hidden");
  elements.signupSection.classList.remove("hidden");
  elements.signupUsername.focus();
}
function showLogin() {
  clearAuthMessage();
  elements.signupSection.classList.add("hidden");
  elements.loginSection.classList.remove("hidden");
  elements.loginUsername.focus();
}
function clearAuthMessage() {
  [elements.loginMessage, elements.signupMessage].forEach(el => {
    if (!el) return;
    el.textContent = ""; el.classList.add("hidden"); el.classList.remove("error", "success");
  });
}
function showLoginMessage(m, t) {
  elements.loginMessage.textContent = m;
  elements.loginMessage.classList.remove("hidden", "error", "success");
  if (t) elements.loginMessage.classList.add(t);
}
function showSignupMessage(m, t) {
  elements.signupMessage.textContent = m;
  elements.signupMessage.classList.remove("hidden", "error", "success");
  if (t) elements.signupMessage.classList.add(t);
}

/* ---------- 2. Signup / Login ---------- */
async function signup(event) {
  event.preventDefault();
  clearAuthMessage();
  const username    = elements.signupUsername.value.trim().toLowerCase();
  const displayName = elements.signupDisplayName.value.trim();
  const password    = elements.signupPassword.value;

  if (!elements.signupAcknowledge.checked) return showSignupMessage("Please confirm you understand there is no password recovery.", "error");
  if (!username || !displayName || !password) return showSignupMessage("Please fill all fields.", "error");
  if (!/^[a-z0-9_.-]+$/.test(username)) return showSignupMessage("Username can only contain letters, numbers, dots, hyphens and underscores.", "error");
  if (password.length < 6) return showSignupMessage("Password must be at least 6 characters.", "error");

  elements.signupBtn.disabled = true;
  elements.signupBtn.textContent = "Creating account...";
  try {
    const { data: existing } = await db.from("profiles").select("id").eq("username", username).maybeSingle();
    if (existing) return showSignupMessage("That username is already taken.", "error");

    const fakeEmail = username + "@justgo.local";
    const { data, error } = await db.auth.signUp({
      email: fakeEmail, password,
      options: { data: { username, display_name: displayName } }
    });
    if (error) throw error;
    if (!data.user) throw new Error("Account could not be created.");

    await db.from("profiles").upsert({ id: data.user.id, username, display_name: displayName });

    if (!data.session) {
      const { data: sd, error: se } = await db.auth.signInWithPassword({ email: fakeEmail, password });
      if (se) return showSignupMessage("Account created, but 'Confirm email' is on. Turn it OFF in Supabase Auth settings and try again.", "error");
      currentUser = sd.user; return await enterApp();
    }
    currentUser = data.user;
    await enterApp();
  } catch (e) {
    console.error("signup:", e);
    showSignupMessage(friendlyError(e), "error");
  } finally {
    const ack = elements.signupAcknowledge && elements.signupAcknowledge.checked;
    elements.signupBtn.disabled = !ack;
    elements.signupBtn.textContent = "Create account";
  }
}

async function login(event) {
  event.preventDefault();
  clearAuthMessage();
  const username = elements.loginUsername.value.trim().toLowerCase();
  const password = elements.loginPassword.value;
  if (!username || !password) return showLoginMessage("Please enter your username and password.", "error");
  elements.loginBtn.disabled = true;
  elements.loginBtn.textContent = "Signing in...";
  try {
    const fakeEmail = username + "@justgo.local";
    const { data, error } = await db.auth.signInWithPassword({ email: fakeEmail, password });
    if (error) throw error;
    currentUser = data.user;
    await enterApp();
  } catch (e) {
    console.error("login:", e);
    showLoginMessage(friendlyError(e), "error");
  } finally {
    elements.loginBtn.disabled = false;
    elements.loginBtn.textContent = "Sign in";
  }
}

/* ---------- 3. Enter App ---------- */
async function enterApp() {
  ensureArraysInitialized();
  elements.authScreen.classList.add("hidden");
  elements.appScreen.classList.remove("hidden");

  const tasks = [
    loadCurrentProfile(),
    findBotUser(),
    findAdminUser(),
    loadPlatformSettings(),
    loadMyPremium()
  ];
  const callIf = (name) => {
    if (typeof window[name] === "function") {
      try { return window[name](); } catch (e) { console.warn("[enterApp]", name, e); }
    }
  };

  const safeCalls = [
    callIf("loadUnreadCounts"),
    callIf("loadConversationPrefs"),
    callIf("loadSavedMessageIds"),
    callIf("loadConversations")
  ];

  await Promise.all(tasks.concat(safeCalls));

  callIf("subscribeRealtime");
  callIf("subscribePresence");
  callIf("startHeartbeat");
  callIf("startOnlineCountRefresh");
  callIf("startScheduler");
  requestNotificationPermission();
  callIf("handleIncomingSearchParam");
  callIf("checkInviteParam");
  callIf("consumePendingJoin");
  applySettingsToUI();
  applyWallpaperToChat();

  Promise.all([
    loadWallet().catch(() => {}),
    Promise.resolve().then(() => { if (typeof subscribeWalletRealtime === "function") subscribeWalletRealtime(); }),
    Promise.resolve().then(() => callIf("handlePayLinkFromUrl")),
    Promise.resolve().then(() => callIf("handleProfilePreviewParam"))
  ]).catch(() => {});
}

function safeCall(fn) {
  if (typeof fn === "function") {
    try { return fn(); } catch (e) { console.warn("[JustGo] safeCall error:", e); }
  } else {
    console.warn("[JustGo] missing function:", fn && fn.name);
  }
}

async function findBotUser() {
  try {
    const { data } = await db.from("profiles").select("id, username, display_name").eq("username", BOT_USERNAME).maybeSingle();
    if (data) botUserId = data.id;
  } catch (e) {}
}
async function findAdminUser() {
  try {
    const { data } = await db.from("profiles").select("id, username, display_name").eq("username", ADMIN_USERNAME).maybeSingle();
    if (data) adminUserId = data.id;
  } catch (e) {}
}

/* ---------- 4. Platform settings ---------- */
async function loadPlatformSettings() {
  try {
    const keys = [
      ['transaction_fee_pct', 1],
      ['premium_discount_fee_pct', 0.5],
      ['free_max_file_size_mb', 20],
      ['premium_max_file_size_mb', 50],
      ['free_file_ttl_hours', 24],
      ['premium_file_ttl_hours', 48],
      ['min_transfer_amount', 1],
      ['max_transfer_amount', 100000],
      ['deposit_min_amount', 100],
      ['withdrawal_min_amount', 50]
    ];
    const results = await Promise.all(keys.map(([k, def]) =>
      db.rpc('get_platform_setting_num', { p_key: k, p_default: def })
    ));
    keys.forEach(([k], i) => {
      const v = results[i] && results[i].data;
      if (typeof v === 'number') platformSettings[k] = v;
    });

    const { data: priceRow } = await db.from('platform_settings').select('value').eq('key', 'premium_price').maybeSingle();
    if (priceRow && priceRow.value && typeof priceRow.value.amount === 'number') {
      platformSettings.premium_price = priceRow.value.amount;
    }
    const { data: durRow } = await db.from('platform_settings').select('value').eq('key', 'premium_duration').maybeSingle();
    if (durRow && durRow.value && typeof durRow.value.days === 'number') {
      platformSettings.premium_duration_days = durRow.value.days;
    }
    myPremium.price = platformSettings.premium_price;
    myPremium.duration_days = platformSettings.premium_duration_days;
  } catch (e) {
    console.warn('loadPlatformSettings failed', e);
  }
}

/* ---------- 5. Premium ---------- */
async function loadMyPremium() {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { data, error } = await db.rpc('get_my_premium_status');
      if (error) throw error;
      if (data) myPremium = Object.assign(myPremium, data);
      return;
    } catch (e) {
      if (attempt === 0) { await wait(400); continue; }
      console.warn('loadMyPremium failed', e);
    }
  }
}
function isPremium() { return !!(myPremium && myPremium.is_premium); }
function isPremiumFeatureLocked(featureKey) {
  return !!PREMIUM_FEATURES[featureKey] && !isPremium();
}
function currentMaxFileSize() {
  const mb = isPremium() ? platformSettings.premium_max_file_size_mb : platformSettings.free_max_file_size_mb;
  return (mb || 20) * 1024 * 1024;
}
function currentFileTtlMs() {
  const hrs = isPremium() ? platformSettings.premium_file_ttl_hours : platformSettings.free_file_ttl_hours;
  return (hrs || 24) * 60 * 60 * 1000;
}
function currentFeePct() {
  return isPremium() ? platformSettings.premium_discount_fee_pct : platformSettings.transaction_fee_pct;
}
function calculateFeePreview(amount) {
  const pct = currentFeePct();
  return Math.round((Number(amount || 0) * pct) / 100 * 100) / 100;
}

/* ---------- 6. Premium modal ---------- */
function showPremiumUpsell(featureName) {
  closeAllModals();
  renderPremiumModal(featureName);
  setTimeout(() => openModal(elements.premiumModal), 50);
}

function calcTierPrice(basePrice, months, discount) {
  const total = basePrice * months * (1 - (discount || 0));
  return Math.round(total * 100) / 100;
}

function renderPremiumModal(highlightFeature) {
  const body = elements.premiumBody;
  if (!body) return;

  const basePrice = platformSettings.premium_price || 49;
  const feePct    = platformSettings.premium_discount_fee_pct || 0.5;
  const premium   = isPremium();

  if (premium) {
    const daysLeft = myPremium.days_left || 0;
    const expires = myPremium.expires_at
      ? new Date(myPremium.expires_at).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })
      : '—';

    body.innerHTML =
      '<div class="premium-modal-inner premium-active">' +
        '<div class="premium-hero premium-hero-active">' +
          '<div class="premium-crown-big">👑</div>' +
          '<h2>You are Premium</h2>' +
          '<p class="premium-hero-sub">Thank you for supporting JustGo</p>' +
        '</div>' +
        '<div class="premium-meta-grid">' +
          '<div class="pm-cell"><span class="pm-k">Active until</span><strong class="pm-v">' + expires + '</strong></div>' +
          '<div class="pm-cell"><span class="pm-k">Days left</span><strong class="pm-v">' + daysLeft + '</strong></div>' +
          '<div class="pm-cell"><span class="pm-k">Your fee rate</span><strong class="pm-v">' + feePct + '%</strong></div>' +
        '</div>' +
        renderBenefitList(feePct) +
        '<h3 class="pm-extend-heading">Extend your Premium</h3>' +
        renderTierPicker(basePrice, /*highlightTier*/ null, /*extending*/ true) +
        '<div class="premium-wallet-note" style="margin-top:12px;">' +
          'Wallet balance: <strong>₹' + formatMoney(myWallet.balance) + '</strong>' +
        '</div>' +
        '<div id="premiumMsg" class="auth-message hidden"></div>' +
      '</div>';
  } else {
    body.innerHTML =
      '<div class="premium-modal-inner">' +
        '<div class="premium-hero premium-upsell-hero">' +
          '<div class="premium-crown-big">👑</div>' +
          '<h2>Go Premium</h2>' +
          '<p class="premium-hero-sub">Unlock the full JustGo experience</p>' +
        '</div>' +
        renderBenefitList(feePct) +
        '<h3 class="pm-extend-heading">Choose your plan</h3>' +
        renderTierPicker(basePrice, highlightFeature, false) +
        '<div class="premium-wallet-note">' +
          'You have <strong>₹' + formatMoney(myWallet.balance) + '</strong> in your wallet.' +
        '</div>' +
        '<div id="premiumMsg" class="auth-message hidden"></div>' +
      '</div>';
  }

  body.querySelectorAll("[data-tier-months]").forEach(btn => {
    btn.addEventListener("click", () => {
      const months = parseInt(btn.dataset.tierMonths, 10);
      if (months === 0) return openCustomMonthsPrompt();
      purchasePremium(months);
    });
  });
}

function renderBenefitList(feePct) {
  return '' +
    '<div class="premium-benefits">' +
      '<h3>Your benefits</h3>' +
      premiumBenefitRow('📎', '50 MB files', 'Send files up to 50 MB (vs 20 MB)') +
      premiumBenefitRow('⏱', '48-hour file storage', 'Your files stay for 2 days') +
      premiumBenefitRow('🎨', 'Custom wallpapers', 'All 9 wallpaper designs') +
      premiumBenefitRow('⏰', 'Scheduled messages', 'Send at the perfect time') +
      premiumBenefitRow('⭐', 'Saved messages', 'Bookmark important chats') +
      premiumBenefitRow('💸', feePct + '% transaction fee', 'Half the fee of free users') +
      premiumBenefitRow('📚', 'Library downloads', 'Download any wiki PDF to keep forever') +
      premiumBenefitRow('✏️', 'Library annotations', 'Highlight, underline & add notes in books') +
      premiumBenefitRow('🔍', 'Search inside books', 'Find any word in a PDF instantly') +
      premiumBenefitRow('🌙', 'Dark theme + Auto theme', 'Easy on the eyes') +
      premiumBenefitRow('✔️', 'Golden profile + tick', 'Stand out from the crowd') +
    '</div>';
}

function renderTierPicker(basePrice, highlightFeature, extending) {
  let html = '<div class="premium-tier-grid">';

  PREMIUM_TIERS.forEach(tier => {
    const total = calcTierPrice(basePrice, tier.months, tier.discount);
    const perMonth = Math.round((total / tier.months) * 100) / 100;
    const isPopular = tier.months === 3;
    const isBest = tier.months === 12;

    html +=
      '<button type="button" class="premium-tier' + (isPopular ? ' popular' : '') + (isBest ? ' best' : '') + '" data-tier-months="' + tier.months + '">' +
        (isPopular ? '<span class="pt-flag popular-flag">Most popular</span>' : '') +
        (isBest ? '<span class="pt-flag best-flag">Best value</span>' : '') +
        '<span class="pt-months">' + tier.months + ' month' + (tier.months === 1 ? '' : 's') + '</span>' +
        '<span class="pt-total">₹' + formatMoney(total) + '</span>' +
        '<span class="pt-per">₹' + formatMoney(perMonth) + ' / month</span>' +
        (tier.badge ? '<span class="pt-badge">' + tier.badge + '</span>' : '') +
        '<span class="pt-cta">' + (extending ? 'Extend' : 'Get ' + tier.months + ' months') + '</span>' +
      '</button>';
  });

  html +=
    '<button type="button" class="premium-tier custom-tier" data-tier-months="0">' +
      '<span class="pt-months">Custom</span>' +
      '<span class="pt-total">You pick</span>' +
      '<span class="pt-per">Choose any number of months</span>' +
      '<span class="pt-cta">Enter months</span>' +
    '</button>';

  html += '</div>';

  html += '<p class="premium-price-hint">Prices are per month from your wallet. Longer plans include an automatic discount.</p>';

  return html;
}

function premiumBenefitRow(icon, title, subtitle) {
  return '<div class="pm-benefit-row">' +
    '<span class="pmb-ic">' + icon + '</span>' +
    '<div class="pmb-text"><strong>' + escapeHtml(title) + '</strong><span>' + escapeHtml(subtitle) + '</span></div>' +
  '</div>';
}

/* ---------- Custom months prompt ---------- */
function openCustomMonthsPrompt() {
  const price = platformSettings.premium_price || 49;
  const input = window.prompt(
    "How many months of Premium would you like?\n" +
    "(Enter a number between 1 and 120. Custom plans have no discount.)",
    "2"
  );
  if (input == null) return;
  const months = parseInt(input, 10);
  if (!isFinite(months) || months < 1 || months > 120) {
    return showPremiumMessage("Please enter a number between 1 and 120.", "error");
  }
  purchasePremium(months);
}

function showPremiumMessage(msg, type) {
  const el = document.getElementById("premiumMsg");
  if (!el) return showToast(msg, type || "error");
  el.textContent = msg;
  el.classList.remove("hidden", "error", "success");
  if (type) el.classList.add(type);
}

async function purchasePremium(months) {
  const basePrice = platformSettings.premium_price || 49;
  let discount = 0;
  if (months >= 12) discount = 0.05;
  else if (months >= 6) discount = 0.02;
  else if (months >= 3) discount = 0.01;

  const total = calcTierPrice(basePrice, months, discount);
  const confirmMsg =
    "Pay ₹" + formatMoney(total) + " from your wallet for " + months +
    " month" + (months === 1 ? "" : "s") + " of Premium?" +
    (discount > 0 ? "\n(" + Math.round(discount * 100) + "% discount applied)" : "");

  if (!confirm(confirmMsg)) return;

  const body = elements.premiumBody;
  if (!body) return;
  body.querySelectorAll("button").forEach(b => b.disabled = true);
  showPremiumMessage("Processing…", null);

  try {
    const { data, error } = await db.rpc('purchase_premium_months', { p_months: months });
    if (error) throw error;
    if (!data || !data.ok) throw new Error((data && data.error) || "Purchase failed");

    await Promise.all([
      loadMyPremium(),
      refreshWalletData(),
      loadCurrentProfile()
    ]);

    showToast(
      '👑 Premium active until ' +
      new Date(data.expires_at).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' }),
      'success'
    );

    renderPremiumModal();
    applyPremiumUpsellVisibility();
    applyPremiumLocksToSettings();

    if (elements.myAvatar) elements.myAvatar.classList.add("premium-avatar");
    if (elements.profileAvatarPreview) elements.profileAvatarPreview.classList.add("premium-avatar-big");

    loadConversations();

    if (elements.settingsModal && !elements.settingsModal.classList.contains("hidden")) {
      applySettingsToUI();
    }
  } catch (e) {
    showPremiumMessage(friendlyError(e), "error");
    if (body) body.querySelectorAll("button").forEach(b => b.disabled = false);
  }
}

/* ---------- 7. Saved messages ---------- */
async function loadSavedMessageIds() {
  if (!currentUser) return;
  try {
    const { data } = await db.from("saved_messages").select("message_id").eq("user_id", currentUser.id);
    savedMessageIds = new Set((data || []).map(r => r.message_id));
  } catch (e) {}
}

async function toggleSaveMessage(message) {
  if (!currentUser || !message) return;
  if (isPremiumFeatureLocked('saved_messages')) {
    showPremiumUpsell('Saved messages');
    return;
  }

  const already = savedMessageIds.has(message.id);
  if (already) savedMessageIds.delete(message.id);
  else         savedMessageIds.add(message.id);
  if (typeof loadSingleMessage === "function") loadSingleMessage(message.id);

  try {
    if (already) {
      await db.from("saved_messages").delete().eq("user_id", currentUser.id).eq("message_id", message.id);
      showToast("Removed from saved.", "success");
    } else {
      await db.from("saved_messages").insert({
        user_id: currentUser.id, message_id: message.id, conversation_id: message.conversation_id
      });
      showToast("Saved ⭐", "success");
    }
  } catch (e) {
    if (already) savedMessageIds.add(message.id);
    else         savedMessageIds.delete(message.id);
    if (typeof loadSingleMessage === "function") loadSingleMessage(message.id);
    showToast(friendlyError(e), "error");
  }
}

async function openSavedModal() {
  if (isPremiumFeatureLocked('saved_messages')) {
    closeSettingsModal();
    setTimeout(() => showPremiumUpsell('Saved messages'), 100);
    return;
  }
  if (!elements.savedBody) return;
  skeletonList(elements.savedBody, "saved-row", 4);
  openModal(elements.savedModal);
  try {
    const { data, error } = await db.from("saved_messages")
      .select("id, message_id, conversation_id, saved_at, messages:message_id(*, message_attachments(*))")
      .eq("user_id", currentUser.id).order("saved_at", { ascending: false }).limit(200);
    if (error) throw error;
    if (!data || !data.length) {
      elements.savedBody.innerHTML = '<div class="search-empty">No saved messages yet.</div>';
      return;
    }
    elements.savedBody.innerHTML = "";
    for (const row of data) {
      const m = row.messages;
      if (!m) continue;
      const item = document.createElement("div");
      item.className = "saved-item";
      const when = formatListTime(row.saved_at);
      const preview = m.content || (m.message_attachments && m.message_attachments[0] ? "📎 " + m.message_attachments[0].file_name : "(empty)");
      item.innerHTML =
        '<div class="si-head"><span>Saved ' + escapeHtml(when) + '</span></div>' +
        '<div class="si-body">' + escapeHtml(preview) + '</div>' +
        '<div class="si-actions">' +
          '<button type="button" data-action="jump">Open chat</button>' +
          '<button type="button" data-action="unsave">Unsave</button>' +
        '</div>';
      item.querySelector('[data-action="jump"]').addEventListener("click", async () => {
        closeModal(elements.savedModal);
        const { data: conv } = await db.from("conversations").select("*").eq("id", row.conversation_id).maybeSingle();
        if (!conv) return showToast("Conversation not found.", "error");
        await openConversation(conv, null);
        setTimeout(() => {
          const el = elements.messages.querySelector('[data-message-id="' + row.message_id + '"]');
          if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 400);
      });
      item.querySelector('[data-action="unsave"]').addEventListener("click", async () => {
        await db.from("saved_messages").delete().eq("id", row.id);
        savedMessageIds.delete(row.message_id);
        item.remove();
        showToast("Removed.", "success");
      });
      elements.savedBody.appendChild(item);
    }
  } catch (e) { elements.savedBody.innerHTML = '<div class="search-empty">Could not load.</div>'; }
}

/* ---------- 8. Scheduler ---------- */
function startScheduler() {
  if (schedTimer) clearInterval(schedTimer);
  processScheduledMessages();
  schedTimer = setInterval(processScheduledMessages, SCHED_TICK_MS);
}
async function processScheduledMessages() {
  if (!currentUser) return;
  try {
    const nowIso = new Date().toISOString();
    const { data } = await db.from("scheduled_messages").select("*").eq("user_id", currentUser.id).eq("sent", false).lte("scheduled_for", nowIso);
    for (const row of data || []) {
      try {
        const { data: msg, error: insErr } = await db.from("messages").insert({
          conversation_id: row.conversation_id, sender_id: currentUser.id,
          content: row.content || "", reply_to_id: row.reply_to_id || null
        }).select().single();
        if (insErr) throw insErr;
        await db.from("scheduled_messages").update({ sent: true, sent_message_id: msg.id }).eq("id", row.id);
      } catch (e) {}
    }
  } catch (e) {}
}
async function openScheduledModal() {
  if (isPremiumFeatureLocked('scheduled_messages')) {
    closeSettingsModal();
    setTimeout(() => showPremiumUpsell('Scheduled messages'), 100);
    return;
  }
  if (!elements.scheduledBody) return;
  skeletonList(elements.scheduledBody, "saved-row", 3);
  openModal(elements.scheduledModal);
  try {
    const { data, error } = await db.from("scheduled_messages")
      .select("*, conversations:conversation_id(id, is_group, group_name, user_a_id, user_b_id)")
      .eq("user_id", currentUser.id).eq("sent", false).order("scheduled_for", { ascending: true }).limit(100);
    if (error) throw error;
    if (!data || !data.length) {
      elements.scheduledBody.innerHTML = '<div class="search-empty">No scheduled messages.</div>';
      return;
    }
    elements.scheduledBody.innerHTML = "";
    for (const row of data) {
      const c = row.conversations || {};
      let name = "Chat";
      if (c.is_group) name = c.group_name || "Group";
      else {
        const otherId = c.user_a_id === currentUser.id ? c.user_b_id : c.user_a_id;
        const p = await getProfileCached(otherId);
        name = p ? (p.display_name || p.username) : "User";
      }
      const item = document.createElement("div");
      item.className = "scheduled-item";
      const when = new Date(row.scheduled_for).toLocaleString([], { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
      const preview = (row.content || "").slice(0, 80) || "📎";
      item.innerHTML =
        '<div class="si-ic ' + (c.is_group ? "group" : "") + '">' + escapeHtml((name || "?").charAt(0).toUpperCase()) + '</div>' +
        '<div class="si-info"><strong>' + escapeHtml(name) + '</strong><span>' + escapeHtml(preview) + ' • ' + escapeHtml(when) + '</span></div>' +
        '<div class="si-actions"><button type="button">Cancel</button></div>';
      item.querySelector("button").addEventListener("click", async () => {
        await db.from("scheduled_messages").delete().eq("id", row.id);
        item.remove();
        showToast("Cancelled.", "success");
      });
      elements.scheduledBody.appendChild(item);
    }
  } catch (e) { elements.scheduledBody.innerHTML = '<div class="search-empty">Could not load.</div>'; }
}

/* ---------- 9. Profile ---------- */
async function loadCurrentProfile() {
  if (!currentUser) return;
  const { data } = await db.from("profiles").select("*").eq("id", currentUser.id).maybeSingle();
  currentProfile = data;
  if (data) {
    profileCache[data.id] = data;
    profileCacheTime[data.id] = Date.now();
    const displayName = data.display_name || data.username;
    if (elements.currentDisplayName) elements.currentDisplayName.textContent = displayName;
    if (elements.currentUsername) {
      elements.currentUsername.innerHTML = "@" + escapeHtml(data.username) +
        (data.is_verified ? ' <span class="verified-tick-inline" title="Verified">✓</span>' : '');
    }
    setAvatar(elements.myAvatar, data.avatar_url, displayName);
    if (elements.myAvatar) elements.myAvatar.classList.toggle('premium-avatar', !!data.is_premium || isPremium());
  }
  applyPremiumUpsellVisibility();
}

async function getProfileCached(userId) {
  if (!userId) return null;
  const now = Date.now();
  if (profileCache[userId] && now - (profileCacheTime[userId] || 0) < PROFILE_CACHE_TTL_MS) return profileCache[userId];
  const { data } = await db.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (data) { profileCache[userId] = data; profileCacheTime[userId] = now; }
  return data;
}

function setAvatar(el, url, name) {
  if (!el) return;
  if (url) { el.style.backgroundImage = "url('" + escapeStyleUrl(url) + "')"; el.textContent = ""; }
  else { el.style.backgroundImage = ""; el.textContent = (name || "U").charAt(0).toUpperCase(); }
}

async function ensureConversationParticipantsLoaded() {
  if (!currentConversation) return;
  const ids = currentParticipants.map(p => p.user_id);
  const missing = ids.filter(id => !profileCache[id]);
  if (!missing.length) return;
  try {
    const { data } = await db.from("profiles").select("id, username, display_name, avatar_url, is_premium, is_verified").in("id", missing);
    (data || []).forEach(p => {
      profileCache[p.id] = Object.assign({}, profileCache[p.id] || {}, p);
      profileCacheTime[p.id] = Date.now();
    });
  } catch (e) {}
}

function openProfileModal() {
  if (!currentProfile) return;
  elements.profileUsername.value = currentProfile.username || "";
  elements.profileDisplayName.value = currentProfile.display_name || "";
  elements.profileHeadline.value = currentProfile.headline || "";
  elements.profileDob.value = currentProfile.dob || "";
  elements.profileBio.value = currentProfile.bio || "";
  elements.profileBioCount.textContent = (currentProfile.bio || "").length;
  if (elements.profileTheogo) elements.profileTheogo.value = currentProfile.theogo_username || "";
  elements.profileInstagram.value = currentProfile.instagram || "";
  elements.profileEmail.value = currentProfile.email || "";
  elements.profileWhatsapp.value = currentProfile.whatsapp || "";
  elements.profileMessage.classList.add("hidden");
  setAvatar(elements.profileAvatarPreview, currentProfile.avatar_url, currentProfile.display_name || currentProfile.username);
  elements.profilePublicLink.textContent = PROFILE_BASE_URL + (currentProfile.username || "username");
  const showRing = !!(currentProfile.is_premium) || isPremium();
  elements.profileAvatarPreview.classList.toggle("premium-avatar-big", showRing);
  applyPremiumUpsellVisibility();
  openModal(elements.profileModal);
}
function closeProfileModal() { closeModal(elements.profileModal); }

async function saveProfile() {
  const displayName = elements.profileDisplayName.value.trim();
  if (!displayName) return showProfileMessage("Display name cannot be empty.", "error");
  let ig = elements.profileInstagram.value.trim();
  ig = ig.replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/^@/, "").replace(/\/$/, "");
  const email = elements.profileEmail.value.trim();
  const waRaw = elements.profileWhatsapp.value.trim();
  const whatsapp = waRaw ? waRaw.replace(/[^\d+]/g, "") : null;
  let tg = (elements.profileTheogo ? elements.profileTheogo.value.trim() : "");
  tg = tg.replace(/^https?:\/\/theogo\.miraheze\.org\/wiki\/User:/i, "").replace(/^@/, "").replace(/\/$/, "");

  const updates = {
    display_name: displayName,
    headline: elements.profileHeadline.value.trim() || null,
    dob: elements.profileDob.value || null,
    bio: elements.profileBio.value.trim() || null,
    theogo_username: tg || null,
    instagram: ig || null,
    email: email || null,
    whatsapp: whatsapp || null
  };
  elements.profileSaveBtn.disabled = true;
  elements.profileSaveBtn.textContent = "Saving...";
  try {
    const { error } = await db.from("profiles").update(updates).eq("id", currentUser.id);
    if (error) throw error;
    showProfileMessage("Saved.", "success");
    delete profileCache[currentUser.id];
    delete profileCacheTime[currentUser.id];
    await loadCurrentProfile();
    await loadConversations();
  } catch (e) { showProfileMessage(friendlyError(e), "error"); }
  finally {
    elements.profileSaveBtn.disabled = false;
    elements.profileSaveBtn.textContent = "Save changes";
  }
}
function showProfileMessage(m, t) {
  elements.profileMessage.textContent = m;
  elements.profileMessage.classList.remove("hidden", "error", "success");
  if (t) elements.profileMessage.classList.add(t);
}
async function uploadAvatar(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) return showProfileMessage("Image too large (max 5 MB).", "error");
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = currentUser.id + "/avatar-" + Date.now() + "." + ext;
  try {
    const { error: upErr } = await db.storage.from(AVATAR_BUCKET).upload(path, file, { upsert: true });
    if (upErr) throw upErr;
    const { data: pub } = db.storage.from(AVATAR_BUCKET).getPublicUrl(path);
    const publicUrl = pub.publicUrl;
    const { error: updErr } = await db.from("profiles").update({ avatar_url: publicUrl }).eq("id", currentUser.id);
    if (updErr) throw updErr;
    currentProfile.avatar_url = publicUrl;
    profileCache[currentUser.id] = currentProfile;
    setAvatar(elements.profileAvatarPreview, publicUrl, currentProfile.display_name);
    setAvatar(elements.myAvatar, publicUrl, currentProfile.display_name);
    showProfileMessage("Photo updated.", "success");
  } catch (e) { showProfileMessage(friendlyError(e), "error"); }
}
function copyOwnProfileLink() {
  if (!currentProfile) return;
  copyText(PROFILE_BASE_URL + currentProfile.username, "Profile link copied.");
}
function viewOwnProfile() {
  if (!currentProfile) return;
  openPublicProfile(currentProfile.username);
}
function viewOwnProfileFromModal() {
  closeProfileModal();
  viewOwnProfile();
}

function handleProfilePreviewParam() {
  try {
    const params = new URLSearchParams(window.location.search);
    const u = params.get("u");
    if (!u) return;
    const username = String(u).trim().replace(/^@/, "");
    if (!username || username.length > 60) return;

    if (window.history && window.history.replaceState)
      window.history.replaceState({}, document.title, window.location.pathname);
    setTimeout(() => openPublicProfile(username), 400);
  } catch (e) {}
}

/* ---------- 10. Public profile ---------- */
async function openPublicProfile(username) {
  if (!username) return;
  username = String(username).replace(/^@/, "").trim();
  if (!username) return;
  if (!elements.publicProfileBody) return;

  elements.publicProfileBody.innerHTML = '<div class="search-empty">Loading…</div>';
  openModal(elements.publicProfileModal);

  try {
    let cachedProfile = null;
    for (const id in profileCache) {
      const p = profileCache[id];
      if (p && p.username === username &&
          Date.now() - (profileCacheTime[id] || 0) < PROFILE_CACHE_TTL_MS) {
        cachedProfile = p;
        break;
      }
    }

    let data = cachedProfile;
    if (!data) {
      const { data: fetched, error } = await db.from("profiles")
        .select("id, username, display_name, avatar_url, dob, bio, headline, theogo_username, instagram, email, whatsapp, is_premium, is_verified")
        .eq("username", username).maybeSingle();
      if (error) throw error;
      data = fetched;
    }

    if (!data) {
      elements.publicProfileBody.innerHTML = '<div class="search-empty">User not found.</div>';
      return;
    }
    publicProfileUser = data;
    profileCache[data.id] = Object.assign({}, profileCache[data.id] || {}, data);
    profileCacheTime[data.id] = Date.now();
    renderPublicProfile(data);
  } catch (e) {
    elements.publicProfileBody.innerHTML = '<div class="search-empty">Could not load profile.</div>';
  }
}

function renderPublicProfile(u) {
  const isMe = currentUser && u.id === currentUser.id;
  const name = u.display_name || u.username;
  const initial = name.charAt(0).toUpperCase();
  const avatarStyle = u.avatar_url
    ? "background-image:url('" + escapeStyleUrl(u.avatar_url) + "');color:transparent;"
    : "";
  let pills = "";
  if (u.is_premium) pills += '<span class="pp-pill pp-pill-premium">👑 Premium</span>';
  if (u.is_verified) pills += '<span class="pp-pill pp-pill-verified">✓ Verified</span>';
  if (u.dob) {
    const d = new Date(u.dob);
    if (!isNaN(d)) pills += '<span class="pp-pill">🎂 ' + d.toLocaleDateString([], { day: "numeric", month: "short" }) + '</span>';
  }
  const igHandle = (u.instagram || "").replace(/^@/, "");
  const igUrl = igHandle ? "https://instagram.com/" + encodeURIComponent(igHandle) : null;
  const waDigits = (u.whatsapp || "").replace(/[^\d]/g, "");
  const waUrl = waDigits ? "https://wa.me/" + waDigits : null;
  const mailUrl = u.email ? "mailto:" + encodeURIComponent(u.email) : null;
  const tgHandle = (u.theogo_username || "").replace(/^@/, "").replace(/^User:/i, "");
  const tgUrl = tgHandle ? THEOGO_USER_BASE + encodeURIComponent(tgHandle) : null;

  let contactHtml = "";
  if (tgUrl) {
    contactHtml +=
      '<a class="pp-contact-row pp-contact-tg" href="' + tgUrl + '" target="_blank" rel="noopener noreferrer">' +
        '<span class="ppc-icon"><img src="' + THEOGO_LOGO_URL + '" alt="TG"></span>' +
        '<span class="ppc-text"><strong>TheoGo Wiki</strong><span>User:' + escapeHtml(tgHandle) + '</span></span>' +
        '<span class="ppc-arrow">›</span>' +
      '</a>';
  }
  if (igUrl) {
    contactHtml +=
      '<a class="pp-contact-row pp-contact-ig" href="' + igUrl + '" target="_blank" rel="noopener noreferrer">' +
        '<span class="ppc-icon">📸</span>' +
        '<span class="ppc-text"><strong>Instagram</strong><span>@' + escapeHtml(igHandle) + '</span></span>' +
        '<span class="ppc-arrow">›</span>' +
      '</a>';
  }
  if (waUrl) {
    contactHtml +=
      '<a class="pp-contact-row pp-contact-wa" href="' + waUrl + '" target="_blank" rel="noopener noreferrer">' +
        '<span class="ppc-icon">💬</span>' +
        '<span class="ppc-text"><strong>WhatsApp</strong><span>' + escapeHtml(u.whatsapp || "") + '</span></span>' +
        '<span class="ppc-arrow">›</span>' +
      '</a>';
  }
  if (mailUrl) {
    contactHtml +=
      '<a class="pp-contact-row pp-contact-mail" href="' + mailUrl + '">' +
        '<span class="ppc-icon">📧</span>' +
        '<span class="ppc-text"><strong>Email</strong><span>' + escapeHtml(u.email || "") + '</span></span>' +
        '<span class="ppc-arrow">›</span>' +
      '</a>';
  }

  elements.publicProfileBody.innerHTML =
    '<div class="public-profile-hero' + (u.is_premium ? ' premium-hero' : '') + '">' +
      (u.is_premium ? '<div class="premium-crown-badge">👑 Premium member</div>' : '') +
      '<div class="avatar-big' + (u.is_premium ? ' premium-avatar-big' : '') + '" style="' + avatarStyle + '">' + escapeHtml(initial) + '</div>' +
      '<h2>' + escapeHtml(name) +
        (u.is_verified ? ' <span class="verified-tick" title="Verified">✓</span>' : '') +
      '</h2>' +
      '<div class="pp-username">@' + escapeHtml(u.username) + '</div>' +
      (u.headline ? '<div class="pp-headline">' + escapeHtml(u.headline) + '</div>' : "") +
      (pills ? '<div class="pp-pills">' + pills + '</div>' : "") +
    '</div>' +
    (u.bio ? '<div class="pp-section"><h3>About</h3><div class="pp-bio">' + escapeHtml(u.bio) + '</div></div>' : "") +
    (contactHtml ? '<div class="pp-section"><h3>Contact</h3><div class="pp-contact-list">' + contactHtml + '</div></div>' : "") +
    '<div class="pp-actions">' +
      (!isMe ? '<button class="primary" id="ppChatBtn" type="button">Message</button>' : "") +
      (!isMe ? '<button class="secondary" id="ppMoneyBtn" type="button">Send ₹</button>' : "") +
      '<button class="secondary" id="ppCopyLinkBtn" type="button">Copy profile link</button>' +
    '</div>';

  const chatBtn = document.getElementById("ppChatBtn");
  if (chatBtn) chatBtn.addEventListener("click", () => {
    closeModal(elements.publicProfileModal);
    startConversation({ id: u.id, username: u.username, display_name: u.display_name, avatar_url: u.avatar_url, is_premium: u.is_premium });
  });
  const moneyBtn = document.getElementById("ppMoneyBtn");
  if (moneyBtn) moneyBtn.addEventListener("click", () => {
    closeModal(elements.publicProfileModal);
    openWalletModal({ mode: 'dm', partner: { id: u.id, username: u.username, display_name: u.display_name, avatar_url: u.avatar_url, is_premium: u.is_premium } });
  });
  const copyBtn = document.getElementById("ppCopyLinkBtn");
  if (copyBtn) copyBtn.addEventListener("click", () => {
    copyText(PROFILE_BASE_URL + u.username, "Copied.");
  });
}
function closePublicProfile() { closeModal(elements.publicProfileModal); publicProfileUser = null; }

/* ---------- 11. Start conversation ---------- */
async function startConversation(user) {
  if (!currentUser || !user) return;
  try {
    const { data: mine } = await db.from("conversation_participants").select("conversation_id").eq("user_id", currentUser.id);
    let conversation = null;
    if (mine && mine.length) {
      const ids = mine.map(r => r.conversation_id);
      const { data: matches } = await db.from("conversation_participants").select("conversation_id").eq("user_id", user.id).in("conversation_id", ids);
      if (matches && matches.length) {
        for (const m of matches) {
          const { data: conv } = await db.from("conversations").select("*").eq("id", m.conversation_id).maybeSingle();
          if (conv && !conv.is_group) { conversation = conv; break; }
        }
      }
    }
    if (!conversation) {
      const { data: newConv, error: ce } = await db.from("conversations")
        .insert({ user_a_id: currentUser.id, user_b_id: user.id, created_by: currentUser.id, is_group: false }).select().single();
      if (ce) throw ce;
      conversation = newConv;
      await db.from("conversation_participants").insert({ conversation_id: conversation.id, user_id: currentUser.id, role: "member" });
      await db.from("conversation_participants").insert({ conversation_id: conversation.id, user_id: user.id, role: "member" });
    }
    currentConversation = conversation;
    await openConversation(conversation, user);
    await loadConversations();
    requestAnimationFrame(() => bumpConversationToTop(conversation.id));
  } catch (e) { showToast(friendlyError(e), "error"); }
}

/* ---------- 12. User search ---------- */
async function searchUsers() {
  clearTimeout(searchTimer);
  if (!elements.userSearch) return;
  let query = elements.userSearch.value.trim().toLowerCase();
  if (query.startsWith("@")) query = query.slice(1);
  if (query.length < 1) return hideSearchResults();
  elements.searchResults.classList.remove("hidden");
  elements.searchResults.innerHTML = "";
  elements.searchResults.appendChild(renderSkeleton("search-user", 4));
  searchTimer = setTimeout(async () => {
    try {
      if (!currentUser) return;
            const { data } = await db.from("profiles")
        .select("id, username, display_name, avatar_url, last_seen, is_premium, is_verified")
        .neq("id", currentUser.id)
        .or("username.ilike.%" + query + "%,display_name.ilike.%" + query + "%")
        .limit(15);
      renderSearchResults(data || []);
    } catch (e) { elements.searchResults.innerHTML = '<div class="search-empty">Search failed.</div>'; }
  }, 250);
}
function renderSearchResults(users) {
  if (!elements.searchResults) return;
  elements.searchResults.innerHTML = "";
  elements.searchResults.classList.remove("hidden");
  if (!users.length) { elements.searchResults.innerHTML = '<div class="search-empty">No users found</div>'; return; }
  users.forEach(user => {
    profileCache[user.id] = Object.assign({}, profileCache[user.id] || {}, user);
    profileCacheTime[user.id] = Date.now();
    const item = document.createElement("div");
    item.className = "search-user";
    const initial = (user.display_name || user.username).charAt(0).toUpperCase();
    const safeAvatar = user.avatar_url ? escapeStyleUrl(user.avatar_url) : "";
    const avatarEl =
      '<div class="avatar-small' + (user.is_premium ? ' premium-avatar' : '') +
        '" style="width:36px;height:36px;min-width:36px;font-size:13px;' +
        (safeAvatar ? "background-image:url('" + safeAvatar + "');color:transparent;" : "") +
      '">' + escapeHtml(initial) + '</div>';
    const meta = user.course ? escapeHtml(user.course) : "";
        item.innerHTML = avatarEl +
      '<div class="search-user-info">' +
        '<div class="search-user-name">' + escapeHtml(user.display_name || user.username) +
        (user.is_verified ? ' <span class="verified-tick-inline">✓</span>' : '') +
        (user.is_premium ? ' <span class="mini-premium-crown">👑</span>' : '') + '</div>' +
        '<div class="search-user-meta">@' + escapeHtml(user.username) + '</div>' +
      '</div>';
    item.addEventListener("click", () => {
      hideSearchResults(); elements.userSearch.value = "";
      openPublicProfile(user.username);
    });
    elements.searchResults.appendChild(item);
  });
}
function hideSearchResults() { if (elements.searchResults) elements.searchResults.classList.add("hidden"); }

/* ---------- 13. Logout ---------- */
async function logout() {
  if (typeof cleanupRealtime === "function") cleanupRealtime();
  if (typeof cleanupWalletRealtime === "function") cleanupWalletRealtime();
  stopTitleFlash();
  if (heartbeatTimer)     { clearInterval(heartbeatTimer); heartbeatTimer = null; }
  if (readHeartbeatTimer) { clearInterval(readHeartbeatTimer); readHeartbeatTimer = null; }
  if (onlineCountTimer)   { clearInterval(onlineCountTimer); onlineCountTimer = null; }
  if (schedTimer)         { clearInterval(schedTimer); schedTimer = null; }
  try { await db.auth.signOut(); } catch (e) {}
  currentUser = null; currentProfile = null; currentConversation = null; currentParticipants = [];
  for (const k in profileCache)     delete profileCache[k];
  for (const k in profileCacheTime) delete profileCacheTime[k];
  attachmentUrlCache.clear();
  unreadCounts = {}; myConversationIds = []; onlineUserIds.clear();
  savedMessageIds.clear(); conversationPrefs = {};
  myWallet = { balance: 0, currency: "INR", is_frozen: false };
  walletTransactions = []; walletRequestsIncoming = []; walletRequestsOutgoing = [];
  walletUnreadBadge = 0;
  myPremium = { is_premium: false, started_at: null, expires_at: null, days_left: 0, price: 49, duration_days: 30 };
  if (typeof updateWalletChipUI === "function") updateWalletChipUI();
  if (elements.messages) elements.messages.innerHTML = "";
  if (elements.conversationList) elements.conversationList.innerHTML = '<div class="empty-sidebar">No conversations yet.</div>';
  showAuth();
}
function cleanupRealtime() {
  if (realtimeChannel)     { try { db.removeChannel(realtimeChannel); }     catch (e) {} realtimeChannel = null; }
  if (typingChannel)       { try { db.removeChannel(typingChannel); }       catch (e) {} typingChannel = null; }
  if (presenceChannel)     { try { db.removeChannel(presenceChannel); }     catch (e) {} presenceChannel = null; }
  if (globalTypingChannel) { try { db.removeChannel(globalTypingChannel); } catch (e) {} globalTypingChannel = null; }
  if (realtimeReloadTimer) { clearTimeout(realtimeReloadTimer); realtimeReloadTimer = null; }
  typingTimers = {}; typingExpiryTimers = {}; typingInConversations.clear();
}

/* ---------- 14. Title flash ---------- */
function startTitleFlash(count) {
  if (titleFlashTimer) return;
  document.title = "(" + count + ") " + BASE_TITLE;
  titleFlashTimer = setInterval(() => {
    titleFlashOn = !titleFlashOn;
    document.title = titleFlashOn ? BASE_TITLE : "(" + count + ") " + BASE_TITLE;
  }, 1200);
}
function stopTitleFlash() {
  if (titleFlashTimer) { clearInterval(titleFlashTimer); titleFlashTimer = null; }
  titleFlashOn = false;
  document.title = BASE_TITLE;
}

/* ---------- 15. Notifications ---------- */
async function requestNotificationPermission() {
  if (!("Notification" in window)) return;
  if (Notification.permission === "default") {
    try { await Notification.requestPermission(); } catch (e) {}
  }
}

async function notify(message) {
  if (!message) return;
  if (!settings.notifications) return;
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  if (document.visibilityState === "visible") return;
  if (isMuted(message.conversation_id)) return;
  if (message.sender_id === currentUser.id) return;

  let senderName = "JustGo";
  let senderAvatar = null;
  try {
    const data = await getProfileCached(message.sender_id);
    if (data) {
      senderName = data.display_name || data.username;
      senderAvatar = data.avatar_url;
    }
  } catch (e) {}

  let body;
  if (message.kind === 'money' && message.meta) {
    const dir = message.meta.direction;
    const amt = Number(message.meta.amount || 0);
    if (dir === 'received') body = "💰 Received ₹" + formatMoney(amt);
    else if (dir === 'sent') body = "You sent ₹" + formatMoney(amt);
    else if (dir === 'request_in') body = "💸 Request: ₹" + formatMoney(amt);
    else if (dir === 'request_out') body = "Requested ₹" + formatMoney(amt);
    else body = "₹" + formatMoney(amt);
  } else if (message.kind === 'fundraiser' && message.meta) {
    body = "🎯 " + ((message.meta.fundraiser && message.meta.fundraiser.title) || "New fundraiser");
  } else {
    body = (message.content || "📎 File").slice(0, 90);
  }

  const title = "💬 " + senderName;
  const ICON_URL = "https://justgo.42web.io/icon-512.png";

  try {
    const notifOptions = {
      body,
      tag: message.conversation_id,
      renotify: false,
      silent: !settings.sound,
      badge: ICON_URL,
      icon: senderAvatar || ICON_URL,
      data: { conversation_id: message.conversation_id }
    };
    const notif = new Notification(title, notifOptions);

    notif.onclick = () => {
      window.focus();
      if (currentConversation && currentConversation.id === message.conversation_id) return;
      (async () => {
        const { data: conv } = await db.from("conversations").select("*").eq("id", message.conversation_id).maybeSingle();
        if (conv) await openConversation(conv, null);
      })();
      notif.close();
    };

    if (settings.sound) playNotificationSound();
  } catch (e) {}
}

function playNotificationSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.value = 660;
    osc.type = "sine";
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
    osc.start();
    osc.stop(ctx.currentTime + 0.3);
  } catch (e) {}
}

/* ---------- 16. Heartbeat + presence ---------- */
function startHeartbeat() {
  updateLastSeen();
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = setInterval(() => {
    if (document.visibilityState === "visible") updateLastSeen();
  }, 60000);
  if (readHeartbeatTimer) clearInterval(readHeartbeatTimer);
  readHeartbeatTimer = setInterval(() => {
    if (currentConversation && currentUser && document.visibilityState === "visible")
      scheduleMarkRead(currentConversation.id);
  }, 30000);
}
async function updateLastSeen() {
  if (!currentUser) return;
  try { await db.from("profiles").update({ last_seen: new Date().toISOString() }).eq("id", currentUser.id); } catch (e) {}
}
function isOnline(lastSeen, userId) {
  if (userId && onlineUserIds.size) return onlineUserIds.has(userId);
  return lastSeen && (Date.now() - new Date(lastSeen).getTime() < ONLINE_THRESHOLD_MS);
}
function startOnlineCountRefresh() {
  refreshOnlineCount();
  if (onlineCountTimer) clearInterval(onlineCountTimer);
  onlineCountTimer = setInterval(refreshOnlineCount, 60000);
}
async function refreshOnlineCount() {
  try {
    const { data, error } = await db.rpc("justgo_online_count");
    if (error) return;
    if (typeof data === "number") { onlineCount = data; updateOnlineChip(); }
  } catch (e) {}
}
function updateOnlineChip() {
  const el = document.getElementById("onlineChipNum");
  if (el) el.textContent = onlineCount + " online";
}
function subscribePresence() {
  if (presenceChannel) { try { db.removeChannel(presenceChannel); } catch (e) {} presenceChannel = null; }
  if (!currentUser) return;
  presenceChannel = db.channel("justgo-presence", { config: { presence: { key: currentUser.id } } });
  presenceChannel
    .on("presence", { event: "sync" }, () => {
      const state = presenceChannel.presenceState();
      onlineUserIds = new Set(Object.keys(state));
      onlineCount = onlineUserIds.size;
      updateOnlineChip();
      refreshSidebarOnlineDots();
    })
    .subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await presenceChannel.track({ at: Date.now(), online_at: new Date().toISOString() });
      }
    });

  if (!subscribePresence.__bound) {
    subscribePresence.__bound = true;
    window.addEventListener("beforeunload", () => {
      try {
        if (presenceChannel) presenceChannel.untrack();
      } catch (e) {}
    });
  }
}
function refreshSidebarOnlineDots() {
  if (!elements.conversationList) return;
  elements.conversationList.querySelectorAll(".conversation").forEach(item => {
    const dot = item.querySelector(".online-dot"); if (!dot) return;
    const uid = item.dataset.otherUserId; if (!uid) return;
    dot.style.display = onlineUserIds.has(uid) ? "" : "none";
  });
}

/* ---------- 17. Unread counts ---------- */
async function loadUnreadCounts() {
  if (!currentUser) return;
  try {
    const { data, error } = await db.rpc("get_unread_counts");
    if (error) throw error;
    const map = {};
    (data || []).forEach(r => { map[r.conversation_id] = Number(r.unread_count || 0); });
    unreadCounts = map;
    if (currentConversation && unreadCounts[currentConversation.id] > 0) scheduleMarkRead(currentConversation.id);
    const total = Object.values(unreadCounts).reduce((a,b)=>a+b,0);
    if (total > 0 && document.hidden) startTitleFlash(total);
    else if (total === 0) stopTitleFlash();
  } catch (e) { await loadUnreadCountsFallback(); }
}
async function loadUnreadCountsFallback() {
  try {
    const { data: parts } = await db.from("conversation_participants").select("conversation_id, last_read_at").eq("user_id", currentUser.id);
    if (!parts || !parts.length) { unreadCounts = {}; return; }
    const map = {};
    await Promise.all(parts.map(async (p) => {
      const { count } = await db.from("messages").select("id", { count: "exact", head: true })
        .eq("conversation_id", p.conversation_id).neq("sender_id", currentUser.id)
        .gt("created_at", p.last_read_at || "1970-01-01T00:00:00Z");
      map[p.conversation_id] = count || 0;
    }));
    unreadCounts = map;
  } catch (e) {}
}
function scheduleMarkRead(convId) {
  if (!currentUser || !convId) return;
  if (manuallyUnread.has(convId)) return;
  pendingReadConvId = convId;
  clearTimeout(readDebounceTimer);
  readDebounceTimer = setTimeout(() => {
    const id = pendingReadConvId;
    readDebounceTimer = null; pendingReadConvId = null;
    if (id) markConversationRead(id);
  }, READ_DEBOUNCE_MS);
}
function markConversationRead(convId) {
  if (!currentUser || !convId) return;
  if (!settings.readReceipts) return;
  manuallyUnread.delete(convId);
  const nowIso = new Date(Date.now() + READ_MARKER_BUFFER_MS).toISOString();
  db.from("conversation_participants").update({ last_read_at: nowIso })
    .eq("conversation_id", convId).eq("user_id", currentUser.id)
    .then(() => {
      unreadCounts[convId] = 0;
      updateUnreadBadgeInSidebar(convId);
      const total = Object.values(unreadCounts).reduce((a,b)=>a+b,0);
      if (total === 0) stopTitleFlash();
    }, () => {});
}
function markConversationUnread(convId) {
  if (!convId) return;
  manuallyUnread.add(convId);
  unreadCounts[convId] = Math.max(1, unreadCounts[convId] || 0);
  updateUnreadBadgeInSidebar(convId, true);
}
async function markAllRead() {
  try {
    const nowIso = new Date(Date.now() + READ_MARKER_BUFFER_MS).toISOString();
    const { error } = await db.from("conversation_participants").update({ last_read_at: nowIso }).eq("user_id", currentUser.id);
    if (error) throw error;
    unreadCounts = {}; manuallyUnread.clear(); stopTitleFlash();
    elements.conversationList.querySelectorAll(".unread-badge").forEach(b => b.remove());
    elements.conversationList.querySelectorAll(".conversation-preview.bold").forEach(p => p.classList.remove("bold"));
    showToast("All conversations marked as read.", "success");
  } catch (e) { showToast("Could not mark all as read.", "error"); }
}
function updateUnreadBadgeInSidebar(convId, force) {
  if (!elements.conversationList) return;
  const item = elements.conversationList.querySelector('.conversation[data-conv-id="' + convId + '"]');
  if (!item) return;
  const b = item.querySelector(".unread-badge"); if (b) b.remove();
  const p = item.querySelector(".conversation-preview");
  if (p) p.classList.remove("bold");
  if (force && unreadCounts[convId] > 0) {
    const timeEl = item.querySelector(".conversation-time");
    if (timeEl) {
      const newBadge = document.createElement("span");
      newBadge.className = "unread-badge";
      newBadge.textContent = String(unreadCounts[convId]);
      timeEl.appendChild(newBadge);
    }
    if (p) p.classList.add("bold");
  }
}

/* ---------- 18. Conversation prefs ---------- */
async function loadConversationPrefs() {
  if (!currentUser) return;
  try {
    const { data } = await db.from("conversation_prefs").select("*").eq("user_id", currentUser.id);
    conversationPrefs = {};
    (data || []).forEach(p => { conversationPrefs[p.conversation_id] = p; });
  } catch (e) {}
}
async function saveConversationPref(convId, patch) {
  if (!currentUser || !convId) return;
  const current = conversationPrefs[convId] || {};
  const merged = Object.assign({ user_id: currentUser.id, conversation_id: convId }, current, patch, { updated_at: new Date().toISOString() });
  try {
    const { error } = await db.from("conversation_prefs").upsert(merged, { onConflict: "user_id,conversation_id" });
    if (error) throw error;
    conversationPrefs[convId] = merged;
  } catch (e) {}
}
function isMuted(convId)     { return !!(conversationPrefs[convId] && conversationPrefs[convId].muted); }
function isConvPinned(convId){ return !!(conversationPrefs[convId] && conversationPrefs[convId].pinned_at); }

/* ---------- 19. Expose globals for Library + bridge scripts ----------
   NOTE: window.db is now owned EXCLUSIVELY by core.js. This file must
   never assign window.db. */
try {
  if (typeof currentUser !== "undefined") {
    if (!Object.getOwnPropertyDescriptor(window, "currentUser")) {
      Object.defineProperty(window, "currentUser", { get() { return currentUser; }, configurable: true });
    }
  }
  if (typeof currentProfile !== "undefined") {
    if (!Object.getOwnPropertyDescriptor(window, "currentProfile")) {
      Object.defineProperty(window, "currentProfile", { get() { return currentProfile; }, configurable: true });
    }
  }
  if (typeof currentConversation !== "undefined") {
    if (!Object.getOwnPropertyDescriptor(window, "currentConversation")) {
      Object.defineProperty(window, "currentConversation", { get() { return currentConversation; }, configurable: true });
    }
  }
} catch (e) { console.warn("[justgo] expose globals failed", e); }

console.log('[JustGo] auth-and-profile.js loaded — v16');