/* =========================================================================
   JustGo — core.js (v15)
   Constants, global state, DOM caching, boot, settings, helpers, themes.

   Changelog v14 → v15:
     • Added skeleton helper: renderSkeleton(kind, count)
     • Boot splash now shows a rotating tip.
     • New global: ONLINE_THRESHOLD_MS, PROFILE_CACHE_TTL_MS unchanged.
     • Added isVerified() helper.
     • Mobile tab bar labelled Chats/Library/Wallet/Profile.
     • Added offline detection helpers: isOffline(), onOfflineChange().
     • Version tag updated.
   ========================================================================= */

/* ---------- 1. Constants ---------- */
const SUPABASE_URL = "https://hvuhdnljbkdwzxlquvfp.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_csgdlWOp6QexF8SmH7oSfQ_XRnaIzuY";

const STORAGE_BUCKET = "chat-files";
const AVATAR_BUCKET  = "chat-avatars";

const MAX_FILE_SIZE_FALLBACK = 20 * 1024 * 1024;
const MAX_FILES_PER_MESSAGE  = 10;
const FILE_TTL_MS_FALLBACK   = 24 * 60 * 60 * 1000;

const BASE_TITLE          = "JustGo";
const PROFILE_BASE_URL    = "https://justgo.42web.io/?u=";
const ONLINE_THRESHOLD_MS = 70000;
const MSG_PAGE_SIZE       = 50;
const BOT_USERNAME        = "bot";
const ADMIN_USERNAME      = "admin";

const MAX_PINNED_CHATS    = 3;

const DEFAULT_EMOJIS = [
  "👍","❤️","😂","😮","😢","🔥","🎉","🙏","👏","💯","😍","🤔",
  "😊","😎","🥰","😘","🤗","😇","🤩","😴","🥳","🤯","🥺","😭",
  "🙌","👌","✌️","🤝","💪","🙏","👋","🤚","✋","🖐️","👊","✊"
];
const QUICK_REACTIONS  = ["👍","❤️","😂","😮","😢","🔥"];

const READ_MARKER_BUFFER_MS = 1500;
const TYPING_THROTTLE_MS    = 1500;
const TYPING_EXPIRY_MS      = 3500;
const READ_DEBOUNCE_MS      = 500;
const NEAR_BOTTOM_PX        = 160;
const SCHED_TICK_MS         = 30 * 1000;

const WALLET_MIN_AMOUNT = 1;
const WALLET_MAX_AMOUNT = 100000;

const PROFILE_CACHE_TTL_MS = 20000;

const THEOGO_LOGO_URL  = "https://static.wikitide.net/theogowiki/5/5d/TG.png";
const THEOGO_USER_BASE = "https://theogo.miraheze.org/wiki/User:";
const THEOGO_API_BASE  = "https://theogo.miraheze.org/w/api.php";

const BOOT_TIPS = [
  "Tip: press ⌘K (or Ctrl+K) to search across every chat.",
  "Tip: right-click a message for quick actions.",
  "Tip: long-press the send button to schedule a message.",
  "Tip: go Premium for 50 MB uploads and dark theme.",
  "Tip: share a book from the Library — it opens right in chat.",
  "Tip: split a bill in any group — no one gets left out.",
  "Tip: your profile link is shareable — press the @username.",
  "Tip: pin up to 3 chats for quick access.",
  "Tip: mark a chat unread to remind yourself later.",
  "Tip: save any message to JustGo Notes for later reading.",
  "Tip: the wallet has a 1% fee — Premium halves it.",
  "Tip: fundraisers in groups update live as people contribute."
];

const PREMIUM_FEATURES = {
  custom_wallpapers:  true,
  scheduled_messages: true,
  saved_messages:     true,
  dark_theme:         true,
  auto_theme:         true,
  library_download:   true,
  library_annotate:   true
};

const PREMIUM_TIERS = [
  { months: 1,  label: "1 month",  discount: 0,    badge: null },
  { months: 3,  label: "3 months", discount: 0.01, badge: "1% off" },
  { months: 6,  label: "6 months", discount: 0.02, badge: "2% off" },
  { months: 12, label: "12 months",discount: 0.05, badge: "5% off" }
];

/* ---------- 2. Modal helpers ---------- */
function openModal(el)  { if (!el) return; el.classList.remove('hidden'); el.classList.add('show'); }
function closeModal(el) { if (!el) return; el.classList.remove('show'); el.classList.add('hidden'); }

/* ---------- 3. Global state ---------- */
let db = null;
let currentUser = null;
let currentProfile = null;
let currentConversation = null;
let currentParticipants = [];
let selectedFiles = [];
let realtimeChannel = null;
let presenceChannel = null;
let typingChannel = null;
let globalTypingChannel = null;
let typingTimers = {};
let typingExpiryTimers = {};
let heartbeatTimer = null;
let readHeartbeatTimer = null;
let replyTarget = null;
let groupSelectedMembers = [];
let pendingShare = null;
let unreadCounts = {};
let manuallyUnread = new Set();
let titleFlashTimer = null;
let titleFlashOn = false;
let pinnedMessages = [];
let draftTimers = {};
let hasMoreMessages = true;
let isLoadingOlder = false;
let oldestLoadedAt = null;
let realtimeReloadTimer = null;
let botUserId = null;
let adminUserId = null;
let onlineCount = 0;
let onlineCountTimer = null;
let searchTimer = null;
let gsTimer = null;
let lastTypingSent = 0;
let readDebounceTimer = null;
let pendingReadConvId = null;
let myConversationIds = [];
let onlineUserIds = new Set();
let optimisticCounter = 0;
let unreadSinceJump = 0;
let schedTimer = null;
let longPressTimer = null;
let conversationPrefs = {};
let savedMessageIds = new Set();
let forwardSourceMessage = null;

let selectedMessages = new Set();
let multiSelectMode = false;
let lastMessageMenuMessage = null;
let currentTheogoSelection = null;
let currentFundraiser = null;
let currentContributeFundraiser = null;
let theogoSearchTimer = null;

let isOfflineState = false;

let settings = {
  theme:         "light",
  notifications: true,
  sound:         true,
  sendOnEnter:   true,
  readReceipts:  true,
  wallpaper:     "default"
};

const profileCache       = {};
const profileCacheTime   = {};
const attachmentUrlCache = new Map();
const typingInConversations = new Map();

let createGroupAvatarFile = null;
let createGroupAvatarPreviewUrl = null;
let publicProfileUser = null;
let elements = {};
let groupSettingsState = { convId: null, isAdmin: false, isProAdmin: false, current: null };

let myWallet = { balance: 0, currency: "INR", is_frozen: false };
let walletTransactions = [];
let walletRequestsIncoming = [];
let walletRequestsOutgoing = [];
let walletRealtimeChannel = null;
let walletUnreadBadge = 0;
let walletSendTarget = null;
let walletRequestTarget = null;
let walletPendingConfirm = null;
let tipMessageTarget = null;
let splitBillState = { total: 0, mode: 'request', selected: new Set(), members: [] };
let adminReverseTarget = null;
let walletHistoryFilter = 'all';
let walletDepositFile = null;
let walletMode = 'header';
let walletDmPartner = null;

let myPremium = {
  is_premium: false,
  started_at: null,
  expires_at: null,
  days_left: 0,
  price: 49,
  duration_days: 30
};
let platformSettings = {
  transaction_fee_pct:         1,
  premium_discount_fee_pct:    0.5,
  free_max_file_size_mb:       20,
  premium_max_file_size_mb:    50,
  free_file_ttl_hours:         24,
  premium_file_ttl_hours:      48,
  premium_price:               49,
  premium_duration_days:       30,
  min_transfer_amount:         1,
  max_transfer_amount:         100000,
  deposit_min_amount:          100,
  withdrawal_min_amount:       50
};

/* ---------- 4. Safety ---------- */
function ensureArraysInitialized() {
  if (!Array.isArray(currentParticipants))    currentParticipants = [];
  if (!Array.isArray(pinnedMessages))         pinnedMessages = [];
  if (!Array.isArray(myConversationIds))      myConversationIds = [];
  if (!Array.isArray(walletTransactions))     walletTransactions = [];
  if (!Array.isArray(walletRequestsIncoming)) walletRequestsIncoming = [];
  if (!Array.isArray(walletRequestsOutgoing)) walletRequestsOutgoing = [];
  if (!Array.isArray(splitBillState.members)) splitBillState.members = [];
}

/* ---------- 5. Boot ---------- */
function bootStart() {
  bootApp().catch(err => {
    console.error("Boot error:", err);
    showFatal(err && err.message ? err.message : String(err));
  });
  rotateBootTip();
  setupOfflineDetection();
}

function rotateBootTip() {
  const el = document.getElementById("bootTip");
  if (!el) return;
  let i = Math.floor(Math.random() * BOOT_TIPS.length);
  el.textContent = BOOT_TIPS[i];
  setInterval(() => {
    i = (i + 1) % BOOT_TIPS.length;
    el.style.opacity = "0";
    setTimeout(() => {
      el.textContent = BOOT_TIPS[i];
      el.style.opacity = "1";
    }, 250);
  }, 3200);
}

function setupOfflineDetection() {
  isOfflineState = !navigator.onLine;
  window.addEventListener("online", () => {
    isOfflineState = false;
    document.body.classList.remove("offline");
    showToast("Reconnected — syncing…", "success");
    if (typeof syncPendingMessages === "function") syncPendingMessages();
  });
  window.addEventListener("offline", () => {
    isOfflineState = true;
    document.body.classList.add("offline");
    showToast("You're offline. Messages will queue.", "error");
  });
  if (isOfflineState) document.body.classList.add("offline");
}
function isOffline() { return isOfflineState; }

async function bootApp() {
  try {
    loadLocalSettings();
    applyTheme(settings.theme);

    let tries = 0;
    while (!window.supabase && tries < 50) { await wait(100); tries++; }
    if (!window.supabase) return showFatal("Supabase library failed to load.");

    db = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true },
      realtime: { params: { eventsPerSecond: 20 } }
    });

    cacheElements();
    bindEvents();
    window.__justgo_booted = true;
    await checkSession();
  } catch (err) {
    console.error("Boot error:", err);
    showFatal(err && err.message ? err.message : String(err));
  }
}

function showFatal(message) {
  const box  = document.getElementById("fatalError");
  const text = document.getElementById("fatalErrorText");
  if (box && text) {
    text.textContent = message;
    box.style.display = "block";
  } else {
    console.error("[JustGo] FATAL:", message);
  }
}

/* ---------- 6. Settings ---------- */
function loadLocalSettings() {
  try {
    const raw = localStorage.getItem("justgo_settings");
    if (raw) settings = Object.assign(settings, JSON.parse(raw));
  } catch (e) {}
}
function saveLocalSettings() {
  try { localStorage.setItem("justgo_settings", JSON.stringify(settings)); } catch (e) {}
}
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme === "auto" ? "auto" : theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) return;
  let effective = theme;
  if (theme === "auto") {
    try {
      effective = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    } catch (e) { effective = "light"; }
  }
  meta.setAttribute("content", effective === "dark" ? "#0b1018" : "#1652c4");
}

/* ---------- 7. Cache DOM elements (null-safe) ---------- */
function cacheElements() {
  const $ = id => document.getElementById(id);
  const optional = (id) => $(id) || null;

  elements = {
    authScreen: $("authScreen"), appScreen: $("appScreen"),
    loginSection: $("loginSection"), signupSection: $("signupSection"),
    loginForm: $("loginForm"), signupForm: $("signupForm"),
    loginUsername: $("loginUsername"), loginPassword: $("loginPassword"),
    signupUsername: $("signupUsername"), signupDisplayName: $("signupDisplayName"),
 signupPassword: $("signupPassword"),
    signupAcknowledge: $("signupAcknowledge"),
    loginBtn: $("loginBtn"), signupBtn: $("signupBtn"),
    loginMessage: $("loginMessage"), signupMessage: $("signupMessage"),
    showSignupBtn: $("showSignupBtn"), showLoginBtn: $("showLoginBtn"),
    forgotPasswordBtn: $("forgotPasswordBtn"),
    forgotPasswordModal: $("forgotPasswordModal"),
    forgotPasswordClose: $("forgotPasswordClose"),
    forgotPasswordUnderstandBtn: $("forgotPasswordUnderstandBtn"),

    openProfileBtn: $("openProfileBtn"), myAvatar: $("myAvatar"),
    currentDisplayName: $("currentDisplayName"),
    currentUsername: $("currentUsername"),
    currentUsernameBtn: $("currentUsernameBtn"),
    markAllReadBtn: $("markAllReadBtn"), newGroupBtn: $("newGroupBtn"),
    logoutBtn: $("logoutBtn"),
    userSearch: $("userSearch"), searchResults: $("searchResults"),
    conversationList: $("conversationList"),
    sidebarMenuBtn: $("sidebarMenuBtn"),
    sidebarMenu: $("sidebarMenu"),

    emptyChat: $("emptyChat"), activeChat: $("activeChat"),
    mobileBackBtn: $("mobileBackBtn"),
    chatAvatar: $("chatAvatar"), chatName: $("chatName"), chatSub: $("chatSub"),
    chatSearchBtn: $("chatSearchBtn"), chatFilesBtn: $("chatFilesBtn"),
    chatGroupSettingsBtn: $("chatGroupSettingsBtn"), chatInfoBtn: $("chatInfoBtn"),
    chatSearchBar: $("chatSearchBar"), chatSearchInput: $("chatSearchInput"),
    chatSearchClose: $("chatSearchClose"),
    filesPanel: $("filesPanel"), filesClose: $("filesClose"), filesList: $("filesList"),
    announcementBanner: $("announcementBanner"),
    messages: $("messages"), typingIndicator: $("typingIndicator"),
    jumpToLatestBtn: $("jumpToLatestBtn"), jumpCount: $("jumpCount"),
    replyBar: $("replyBar"), replyCancel: $("replyCancel"),
    messageForm: $("messageForm"), messageInput: $("messageInput"),
    fileInput: $("fileInput"), selectedFile: $("selectedFile"),
    sendBtn: $("sendBtn"),
    expiryBanner: $("expiryBanner"), expiryBannerClose: $("expiryBannerClose"),
    chatView: $("chatView"),
    composerPlusBtn: $("composerPlusBtn"),
    composerDropup: $("composerDropup"),
    moneyComposerBtn: optional("moneyComposerBtn"),

    profileModal: $("profileModal"), profileClose: $("profileClose"),
    profileAvatarPreview: $("profileAvatarPreview"), avatarInput: $("avatarInput"),
    profileUsername: $("profileUsername"), profileDisplayName: $("profileDisplayName"),
    profileHeadline: $("profileHeadline"),
    profileDob: $("profileDob"), profileBio: $("profileBio"),
    profileBioCount: $("profileBioCount"),
    profileTheogo: $("profileTheogo"),
    profileInstagram: $("profileInstagram"),
    profileEmail: $("profileEmail"), profileWhatsapp: $("profileWhatsapp"),
    profileSaveBtn: $("profileSaveBtn"), profileMessage: $("profileMessage"),
    profilePublicLink: $("profilePublicLink"),
    profileCopyLinkBtn: $("profileCopyLinkBtn"),
    profileViewBtn: $("profileViewBtn"),
    openSettingsBtn: $("openSettingsBtn"),
    profilePremiumCard: $("profilePremiumCard"),

    premiumModal: $("premiumModal"), premiumClose: $("premiumClose"),
    premiumBody: $("premiumBody"),

    groupModal: $("groupModal"), groupClose: $("groupClose"),
    createGroupAvatarPreview: $("createGroupAvatarPreview"),
    createGroupAvatarInput: $("createGroupAvatarInput"),
    groupNameInput: $("groupNameInput"), groupDescInput: $("groupDescInput"),
    groupMemberSearch: $("groupMemberSearch"), groupMemberResults: $("groupMemberResults"),
    groupMemberChips: $("groupMemberChips"),
    createGroupCanInvite: $("createGroupCanInvite"),
    createGroupCanEdit: $("createGroupCanEdit"),
    createGroupAnnouncements: $("createGroupAnnouncements"),
    groupCreateBtn: $("groupCreateBtn"), groupMessage: $("groupMessage"),

    groupSettingsModal: $("groupSettingsModal"), groupSettingsClose: $("groupSettingsClose"),
    groupAvatarPreview: $("groupAvatarPreview"), groupAvatarInput: $("groupAvatarInput"),
    groupSettingsName: $("groupSettingsName"), groupSettingsDesc: $("groupSettingsDesc"),
    groupMembersCanInvite: $("groupMembersCanInvite"),
    groupMembersCanEdit: $("groupMembersCanEdit"),
    groupAnnouncementsOnly: $("groupAnnouncementsOnly"),
    groupInviteLink: $("groupInviteLink"), groupCopyInviteBtn: $("groupCopyInviteBtn"),
    groupShareInviteBtn: $("groupShareInviteBtn"), groupRegenInviteBtn: $("groupRegenInviteBtn"),
    groupSaveBtn: $("groupSaveBtn"), groupLeaveBtn: $("groupLeaveBtn"),
    groupDeleteBtn: $("groupDeleteBtn"), groupSettingsMessage: $("groupSettingsMessage"),

    joinGroupModal: $("joinGroupModal"), joinGroupClose: $("joinGroupClose"),
    joinGroupBody: $("joinGroupBody"),
    publicProfileModal: $("publicProfileModal"), publicProfileClose: $("publicProfileClose"),
    publicProfileBody: $("publicProfileBody"),

    chatInfoModal: $("chatInfoModal"), chatInfoClose: $("chatInfoClose"),
    chatInfoContent: $("chatInfoContent"),

    settingsModal: $("settingsModal"), settingsClose: $("settingsClose"),
    settingNotifications: $("settingNotifications"), settingSound: $("settingSound"),
    settingSendOnEnter: $("settingSendOnEnter"), settingReadReceipts: $("settingReadReceipts"),
    openSavedBtn: $("openSavedBtn"), openScheduledBtn: $("openScheduledBtn"),
    savedModal: $("savedModal"), savedClose: $("savedClose"), savedBody: $("savedBody"),
    scheduledModal: $("scheduledModal"), scheduledClose: $("scheduledClose"),
    scheduledBody: $("scheduledBody"),
    scheduleModal: $("scheduleModal"), scheduleClose: $("scheduleClose"),
    schedulePreview: $("schedulePreview"), scheduleWhen: $("scheduleWhen"),
    scheduleQuick: $("scheduleQuick"), scheduleConfirmBtn: $("scheduleConfirmBtn"),
    scheduleMessage: $("scheduleMessage"),
    forwardModal: $("forwardModal"), forwardClose: $("forwardClose"),
    forwardSearch: $("forwardSearch"), forwardList: $("forwardList"),
    forwardStatus: $("forwardStatus"),
    wallpaperGrid: $("wallpaperGrid"),
    mobileNav: $("mobileNav"),
    messageMenu: $("messageMenu"), chatListMenu: $("chatListMenu"),
    quickReactions: $("quickReactions"),
    emojiPicker: $("emojiPicker"),
    toast: $("toast"),
    openChatGPTBtn: $("openChatGPTBtn"),
    openPremiumFromSettingsBtn: $("openPremiumFromSettingsBtn"),

    walletChip: $("walletChip"), walletChipBalance: $("walletChipBalance"),
    walletChipBadge: $("walletChipBadge"),
    openWalletFromSettingsBtn: $("openWalletFromSettingsBtn"),

    walletModal: $("walletModal"), walletClose: $("walletClose"),
    walletBalanceAmount: $("walletBalanceAmount"),
    walletShareLinkBtn: $("walletShareLinkBtn"),
    walletTabs: $("walletTabs"),
    walletSendSearch: $("walletSendSearch"), walletSendResults: $("walletSendResults"),
    walletSendSelected: $("walletSendSelected"), walletSendAmount: $("walletSendAmount"),
    walletSendNote: $("walletSendNote"), walletSendBtn: $("walletSendBtn"),
    walletSendMsg: $("walletSendMsg"),
    walletRequestSearch: $("walletRequestSearch"), walletRequestResults: $("walletRequestResults"),
    walletRequestSelected: $("walletRequestSelected"), walletRequestAmount: $("walletRequestAmount"),
    walletRequestNote: $("walletRequestNote"), walletRequestBtn: $("walletRequestBtn"),
    walletRequestMsg: $("walletRequestMsg"),
    wscSent: $("wscSent"), wscRecv: $("wscRecv"), wscNet: $("wscNet"),
    walletHistoryFilter: $("walletHistoryFilter"),
    walletHistoryList: $("walletHistoryList"),
    walletDownloadCsvBtn: $("walletDownloadCsvBtn"),
    walletDepositMsgAdminBtn: $("walletDepositMsgAdminBtn"),
    walletDepositAmount: $("walletDepositAmount"),
    walletDepositNote: $("walletDepositNote"),
    walletDepositFile: $("walletDepositFile"),
    walletDepositFileName: $("walletDepositFileName"),
    walletDepositPreview: $("walletDepositPreview"),
    walletDepositBtn: $("walletDepositBtn"),
    walletDepositMsg: $("walletDepositMsg"),
    walletWithdrawMsgAdminBtn: $("walletWithdrawMsgAdminBtn"),
    walletWithdrawMsg: $("walletWithdrawMsg"),

    payLinkModal: $("payLinkModal"), payLinkClose: $("payLinkClose"),
    payLinkBox: $("payLinkBox"), payLinkCopy: $("payLinkCopy"),
    payLinkShare: $("payLinkShare"), payQR: $("payQR"), payLinkMsg: $("payLinkMsg"),

    moneyConfirmModal: $("moneyConfirmModal"), moneyConfirmClose: $("moneyConfirmClose"),
    moneyConfirmAvatar: $("moneyConfirmAvatar"), moneyConfirmName: $("moneyConfirmName"),
    moneyConfirmUsername: $("moneyConfirmUsername"), moneyConfirmAmount: $("moneyConfirmAmount"),
    moneyConfirmNote: $("moneyConfirmNote"), moneyConfirmNet: $("moneyConfirmNet"),
    moneyConfirmCancel: $("moneyConfirmCancel"), moneyConfirmGo: $("moneyConfirmGo"),
    moneyConfirmMsg: $("moneyConfirmMsg"),
    moneyConfirmFeeRow: $("moneyConfirmFeeRow"), moneyConfirmFeeValue: $("moneyConfirmFeeValue"),
    moneyConfirmTotalRow: $("moneyConfirmTotalRow"), moneyConfirmTotalValue: $("moneyConfirmTotalValue"),

    moneyReceiptModal: $("moneyReceiptModal"), moneyReceiptClose: $("moneyReceiptClose"),
    moneyReceiptBody: $("moneyReceiptBody"),

    splitBillModal: $("splitBillModal"), splitBillClose: $("splitBillClose"),
    splitBillTotal: $("splitBillTotal"), splitBillMode: $("splitBillMode"),
    splitBillMembers: $("splitBillMembers"),
    splitSummary: $("splitSummary"),
    splitPerPerson: $("splitPerPerson"),
    splitFeePct: $("splitFeePct"),
    splitFeeAmount: $("splitFeeAmount"),
    splitTotalPerPerson: $("splitTotalPerPerson"),
    splitSelectAll: $("splitSelectAll"),
    splitBillGo: $("splitBillGo"), splitBillMsg: $("splitBillMsg"),

    tipModal: $("tipModal"), tipClose: $("tipClose"), tipPreview: $("tipPreview"),
    tipAmount: $("tipAmount"), tipGo: $("tipGo"), tipMsg: $("tipMsg"),

    adminReverseModal: $("adminReverseModal"), adminReverseClose: $("adminReverseClose"),
    adminReverseReason: $("adminReverseReason"), adminReverseGo: $("adminReverseGo"),
    adminReverseMsg: $("adminReverseMsg"),

    theogoModal: $("theogoModal"), theogoClose: $("theogoClose"),
    theogoSearchInput: $("theogoSearchInput"),
    theogoSearchBtn: $("theogoSearchBtn"),
    theogoResults: $("theogoResults"),
    theogoSelected: $("theogoSelected"),
    theogoActions: $("theogoActions"),
    theogoShareBtn: $("theogoShareBtn"),
    theogoMessage: $("theogoMessage"),

    fundraiserModal: $("fundraiserModal"),
    fundraiserModalTitle: $("fundraiserModalTitle"),
    fundraiserClose: $("fundraiserClose"),
    fundraiserBody: $("fundraiserBody"),

    contributeModal: $("contributeModal"),
    contributeClose: $("contributeClose"),
    contributeHero: $("contributeHero"),
    contributeAmount: $("contributeAmount"),
    contributeFeePreview: $("contributeFeePreview"),
    contributeNote: $("contributeNote"),
    contributeAnonymous: $("contributeAnonymous"),
    contributeGo: $("contributeGo"),
    contributeMsg: $("contributeMsg"),

    multiSelectToolbar: $("multiSelectToolbar"),
    mstCount: $("mstCount"),

    editMessageModal: $("editMessageModal"),
    editMessageClose: $("editMessageClose"),
    editMessageInput: $("editMessageInput"),
    editMessageSave: $("editMessageSave"),
    editMessageMsg: $("editMessageMsg"),

    saveNoteModal: $("saveNoteModal"),
    saveNoteClose: $("saveNoteClose"),
    saveNoteInput: $("saveNoteInput"),
    saveNoteTitle: $("saveNoteTitle"),
    saveNoteSave: $("saveNoteSave"),
    saveNoteMsg: $("saveNoteMsg"),

    chatListMenuGroupExtras: $("chatListMenuGroupExtras")
  };

  const critical = ["messages", "conversationList", "messageInput", "sendBtn", "chatName", "chatSub", "chatAvatar"];
  critical.forEach(k => {
    if (!elements[k]) console.warn("[JustGo] Missing critical DOM element: #" + k);
  });
}

/* ---------- 8. Event binding helper ---------- */
function on(el, evt, fn, opts) {
  if (!el) return;
  if (typeof fn !== "function") {
    console.warn("[JustGo] handler not defined for", evt, "on", (el && (el.id || el.className || el.tagName)) || el);
    return;
  }
  el.addEventListener(evt, fn, opts);
}

function bindEvents() {
  on(elements.loginForm, "submit", login);
  on(elements.signupForm, "submit", signup);
  on(elements.showSignupBtn, "click", showSignup);
  on(elements.showLoginBtn, "click", showLogin);
  on(elements.forgotPasswordBtn, "click", openForgotPassword);
  on(elements.forgotPasswordClose, "click", closeForgotPassword);
  on(elements.forgotPasswordUnderstandBtn, "click", closeForgotPassword);
  on(elements.signupAcknowledge, "change", () => {
    if (elements.signupBtn) elements.signupBtn.disabled = !elements.signupAcknowledge.checked;
  });

  on(elements.logoutBtn, "click", logout);
  on(elements.newGroupBtn, "click", openGroupModal);
  on(elements.markAllReadBtn, "click", markAllRead);
  on(elements.openProfileBtn, "click", openProfileModal);
  on(elements.userSearch, "input", searchUsers);
  on(elements.currentUsernameBtn, "click", viewOwnProfile);
  on(elements.sidebarMenuBtn, "click", handleSidebarMenuBtnClick);

  if (elements.expiryBannerClose) {
    elements.expiryBannerClose.addEventListener("click", () => {
      elements.expiryBanner.classList.add("hidden");
      try { sessionStorage.setItem("justgo_banner_dismissed", "1"); } catch (e) {}
    });
    try {
      if (sessionStorage.getItem("justgo_banner_dismissed") === "1")
        elements.expiryBanner.classList.add("hidden");
    } catch (e) {}
  }

  on(elements.messageForm, "submit", sendMessage);
  on(elements.fileInput, "change", handleFileSelect);
  on(elements.mobileBackBtn, "click", closeMobileChat);
  on(elements.messageInput, "input", autoResizeTextarea);
  on(elements.messageInput, "input", saveDraftDebounced);
  on(elements.messageInput, "keydown", (e) => {
    if (settings.sendOnEnter && e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (elements.messageForm && typeof elements.messageForm.requestSubmit === "function") {
        elements.messageForm.requestSubmit();
      }
    }
  });
  on(elements.replyCancel, "click", clearReply);
  on(elements.sendBtn, "pointerdown", startSendLongPress);
  on(elements.sendBtn, "pointerup", cancelSendLongPress);
  on(elements.sendBtn, "pointerleave", cancelSendLongPress);
  on(elements.sendBtn, "contextmenu", (e) => {
    e.preventDefault(); cancelSendLongPress(); openScheduleModal();
  });

  on(elements.composerPlusBtn, "click", handleComposerPlusClick);

  on(elements.chatSearchBtn, "click", toggleChatSearch);
  on(elements.chatSearchClose, "click", toggleChatSearch);
  on(elements.chatSearchInput, "input", debounce(runChatSearch, 200));
  on(elements.chatFilesBtn, "click", toggleFilesPanel);
  on(elements.filesClose, "click", toggleFilesPanel);
  on(elements.chatInfoBtn, "click", openChatInfo);
  on(elements.chatInfoClose, "click", closeChatInfo);
  on(elements.jumpToLatestBtn, "click", jumpToLatest);

  on(elements.chatGroupSettingsBtn, "click", openGroupSettings);
  on(elements.groupSettingsClose, "click", closeGroupSettings);
  on(elements.groupSaveBtn, "click", saveGroupSettings);
  on(elements.groupAvatarInput, "change", uploadGroupAvatar);
  on(elements.groupRegenInviteBtn, "click", regenerateInviteLink);
  on(elements.groupLeaveBtn, "click", leaveGroup);
  on(elements.groupDeleteBtn, "click", deleteGroup);
  on(elements.groupCopyInviteBtn, "click", copyInviteLink);
  on(elements.groupShareInviteBtn, "click", shareInviteLink);

  on(elements.joinGroupClose, "click", () => closeModal(elements.joinGroupModal));
  on(elements.publicProfileClose, "click", closePublicProfile);

  on(elements.profileClose, "click", closeProfileModal);
  on(elements.profileSaveBtn, "click", saveProfile);
  on(elements.avatarInput, "change", uploadAvatar);
  on(elements.profileBio, "input", () => {
    if (elements.profileBioCount) elements.profileBioCount.textContent = elements.profileBio.value.length;
  });
  on(elements.profileCopyLinkBtn, "click", copyOwnProfileLink);
  on(elements.profileViewBtn, "click", viewOwnProfileFromModal);
  on(elements.openSettingsBtn, "click", () => {
    closeProfileModal(); openSettingsModal();
  });

  on(elements.premiumClose, "click", () => closeModal(elements.premiumModal));
  on(elements.premiumModal, "click", e => {
    if (e.target === elements.premiumModal) closeModal(elements.premiumModal);
  });
  on(elements.openPremiumFromSettingsBtn, "click", () => {
    closeSettingsModal(); showPremiumUpsell("Premium");
  });

  on(elements.settingsClose, "click", closeSettingsModal);
  on(elements.settingsModal, "click", e => {
    if (e.target === elements.settingsModal) closeSettingsModal();
  });
  on(elements.settingsModal, "click", handleSettingsThemePick);
  on(elements.settingNotifications, "change", saveSettingsFromUI);
  on(elements.settingSound, "change", saveSettingsFromUI);
  on(elements.settingSendOnEnter, "change", saveSettingsFromUI);
  on(elements.settingReadReceipts, "change", saveSettingsFromUI);
  on(elements.wallpaperGrid, "click", handleWallpaperPick);
  on(elements.openSavedBtn, "click", openSavedModal);
  on(elements.savedClose, "click", () => closeModal(elements.savedModal));
  on(elements.openScheduledBtn, "click", openScheduledModal);
  on(elements.scheduledClose, "click", () => closeModal(elements.scheduledModal));
  on(elements.openChatGPTBtn, "click", openChatGPTIntegration);

  on(elements.scheduleClose, "click", () => closeModal(elements.scheduleModal));
  on(elements.scheduleConfirmBtn, "click", confirmSchedule);
  on(elements.scheduleQuick, "click", handleScheduleQuick);

  on(elements.forwardClose, "click", closeForwardModal);
  on(elements.forwardSearch, "input", debounce(runForwardSearch, 200));
  on(elements.forwardModal, "click", e => { if (e.target === elements.forwardModal) closeForwardModal(); });

  on(elements.groupClose, "click", closeGroupModal);
  on(elements.groupCreateBtn, "click", createGroup);
  on(elements.groupMemberSearch, "input", searchGroupMembers);
  on(elements.createGroupAvatarInput, "change", handleCreateGroupAvatar);

  on(elements.theogoClose, "click", closeTheogoModal);
  on(elements.theogoSearchBtn, "click", runTheogoSearch);
  on(elements.theogoSearchInput, "keydown", e => {
    if (e.key === "Enter") { e.preventDefault(); runTheogoSearch(); }
  });
  on(elements.theogoSearchInput, "input", () => {
    clearTimeout(theogoSearchTimer);
    theogoSearchTimer = setTimeout(() => {
      const q = elements.theogoSearchInput.value.trim();
      if (q.length >= 2) runTheogoSearch();
    }, 400);
  });
  on(elements.theogoShareBtn, "click", shareTheogoArticle);

  on(elements.fundraiserClose, "click", () => closeModal(elements.fundraiserModal));
  on(elements.contributeClose, "click", () => closeModal(elements.contributeModal));
  on(elements.contributeAmount, "input", updateContributeFeePreview);
  on(elements.contributeGo, "click", doContribute);

  on(elements.multiSelectToolbar, "click", handleMultiSelectAction);

  on(elements.editMessageClose, "click", () => closeModal(elements.editMessageModal));
  on(elements.editMessageSave, "click", saveEditedMessage);
  on(elements.editMessageModal, "click", e => { if (e.target === elements.editMessageModal) closeModal(elements.editMessageModal); });

  on(elements.saveNoteClose, "click", () => closeModal(elements.saveNoteModal));
  on(elements.saveNoteSave, "click", saveNoteFromModal);
  on(elements.saveNoteModal, "click", e => { if (e.target === elements.saveNoteModal) closeModal(elements.saveNoteModal); });

  on(elements.payLinkClose, "click", () => closeModal(elements.payLinkModal));
  on(elements.payLinkModal, "click", e => { if (e.target === elements.payLinkModal) closeModal(elements.payLinkModal); });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (multiSelectMode) { exitMultiSelectMode(); return; }
      closeAllModals();
      hideMessageMenu(); hideChatListMenu(); hideQuickReactions();
      hideSidebarMenu(); hideComposerDropup(); hideEmojiPicker();
    }
    if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === "k" || (e.key.toLowerCase() === "f" && !e.shiftKey))) {
      e.preventDefault(); openGlobalSearch();
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a" && currentConversation && !isInputFocused()) {
      e.preventDefault(); enterMultiSelectMode();
    }
  });

  on(elements.mobileNav, "click", handleMobileNav);
  document.addEventListener("click", globalClick);

  window.addEventListener("focus", () => {
    stopTitleFlash();
    if (currentConversation) scheduleMarkRead(currentConversation.id);
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      stopTitleFlash();
      if (currentConversation) scheduleMarkRead(currentConversation.id);
    }
  });

  try {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
      if (settings.theme === "auto") applyTheme("auto");
    });
  } catch (e) {}

  document.querySelectorAll(".switch-card input[type='checkbox']").forEach((inp) => {
    const sync = () => {
      const card = inp.closest(".switch-card");
      if (card) card.classList.toggle("active", inp.checked);
    };
    inp.addEventListener("change", sync); sync();
  });

  on(elements.messages, "scroll", () => {
    if (elements.messages.scrollTop < 80 && hasMoreMessages && !isLoadingOlder && currentConversation)
      loadOlderMessages();
    updateJumpButton();
  });

  on(elements.conversationList, "contextmenu", handleConversationContextMenu);
  bindConversationLongPress();

  on(document, "click", (e) => {
    if (elements.messageMenu && !elements.messageMenu.classList.contains("hidden")
        && !elements.messageMenu.contains(e.target)) hideMessageMenu();
    if (elements.chatListMenu && !elements.chatListMenu.classList.contains("hidden")
        && !elements.chatListMenu.contains(e.target)) hideChatListMenu();
    if (elements.quickReactions && !elements.quickReactions.classList.contains("hidden")
        && !elements.quickReactions.contains(e.target)) hideQuickReactions();

    if (elements.emojiPicker && !elements.emojiPicker.classList.contains("hidden")) {
      const clickedInsidePicker = elements.emojiPicker.contains(e.target);
      const clickedPlusBtn = elements.composerPlusBtn && elements.composerPlusBtn.contains(e.target);
      const clickedDropup = elements.composerDropup && elements.composerDropup.contains(e.target);
      if (!clickedInsidePicker && !clickedPlusBtn && !clickedDropup) hideEmojiPicker();
    }

    if (elements.composerDropup && !elements.composerDropup.classList.contains("hidden")) {
      const clickedInsideDropup = elements.composerDropup.contains(e.target);
      const clickedPlusBtn = elements.composerPlusBtn && elements.composerPlusBtn.contains(e.target);
      if (!clickedInsideDropup && !clickedPlusBtn) hideComposerDropup();
    }

    if (elements.sidebarMenu && !elements.sidebarMenu.classList.contains("hidden")
        && !elements.sidebarMenu.contains(e.target)
        && e.target !== elements.sidebarMenuBtn
        && elements.sidebarMenuBtn && !elements.sidebarMenuBtn.contains(e.target)) {
      hideSidebarMenu();
    }
  });

  bindWalletEvents();
}

function isInputFocused() {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || el.isContentEditable;
}

/* ---------- 9. Sidebar menu ---------- */
function handleSidebarMenuBtnClick(e) {
  e.stopPropagation();
  const menu = elements.sidebarMenu;
  if (!menu) return;
  if (!menu.classList.contains("hidden")) { hideSidebarMenu(); return; }
  const btn = elements.sidebarMenuBtn;
  const rect = btn.getBoundingClientRect();
  menu.style.top = (rect.bottom + 6) + "px";
  const rightMargin = 12;
  const menuWidth = 260;
  let left = rect.right - menuWidth;
  if (left < rightMargin) left = rightMargin;
  menu.style.left = left + "px";
  menu.style.right = "auto";
  menu.classList.remove("hidden");
  btn.classList.add("active");

  menu.querySelectorAll("button[data-menu]").forEach(b => {
    if (b.__bound) return;
    b.__bound = true;
    b.addEventListener("click", () => {
      const key = b.dataset.menu;
      hideSidebarMenu();
      switch (key) {
        case "profile":     openProfileModal(); break;
        case "premium":     showPremiumUpsell("Premium"); break;
        case "newgroup":    openGroupModal(); break;
        case "markallread": markAllRead(); break;
        case "apps":        window.location.href = "app/"; break;
        case "settings":    openSettingsModal(); break;
        case "logout":      logout(); break;
        case "library":
          if (window.JustGoLibrary) window.JustGoLibrary.open();
          else document.dispatchEvent(new CustomEvent("justgo:open-library"));
          break;
      }
    });
  });
}
function hideSidebarMenu() {
  if (elements.sidebarMenu) elements.sidebarMenu.classList.add("hidden");
  if (elements.sidebarMenuBtn) elements.sidebarMenuBtn.classList.remove("active");
}

function globalClick(event) {
  if (elements.searchResults && !elements.searchResults.classList.contains("hidden")) {
    if (!elements.searchResults.contains(event.target) && event.target !== elements.userSearch)
      hideSearchResults();
  }
}

function handleMobileNav(event) {
  const btn = event.target.closest(".mobile-nav-btn"); if (!btn) return;
  const nav = btn.dataset.nav; if (!nav) return;
  elements.mobileNav.querySelectorAll(".mobile-nav-btn").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  if (nav === "chats") {
    elements.appScreen.classList.remove("chat-open");
  } else if (nav === "profile") {
    openProfileModal();
  } else if (nav === "wallet") {
    openWalletModal({ mode: 'header' });
    btn.classList.remove("active");
    const chatsBtn = elements.mobileNav.querySelector('[data-nav="chats"]');
    if (chatsBtn) chatsBtn.classList.add("active");
  } else if (nav === "library") {
    if (window.JustGoLibrary) window.JustGoLibrary.open();
    else document.dispatchEvent(new CustomEvent("justgo:open-library"));
    btn.classList.remove("active");
    const chatsBtn = elements.mobileNav.querySelector('[data-nav="chats"]');
    if (chatsBtn) chatsBtn.classList.add("active");
  }
}

function openForgotPassword() { openModal(elements.forgotPasswordModal); }
function closeForgotPassword() { closeModal(elements.forgotPasswordModal); }

/* ---------- 10. Helpers ---------- */
function clearReply() {
  replyTarget = null;
  if (elements.replyBar) elements.replyBar.classList.add("hidden");
}
function setReplyTarget(message) {
  replyTarget = message;
  if (!elements.replyBar) return;
  elements.replyBar.classList.remove("hidden");
  const nameEl = elements.replyBar.querySelector(".reply-bar-name");
  const textEl = elements.replyBar.querySelector(".reply-bar-text");
  if (nameEl) {
    const senderId = message.sender_id;
    const sender = senderId === currentUser.id
      ? (currentProfile ? (currentProfile.display_name || currentProfile.username) : "You")
      : (profileCache[senderId] ? (profileCache[senderId].display_name || profileCache[senderId].username) : "Someone");
    nameEl.textContent = "Replying to " + sender;
  }
  if (textEl) textEl.textContent = (message.content || "(file)").slice(0, 80);
  if (elements.messageInput) elements.messageInput.focus();
}

function closeAllModals() {
  [
    elements.profileModal, elements.groupModal, elements.groupSettingsModal,
    elements.joinGroupModal, elements.publicProfileModal,
    elements.chatInfoModal, elements.forgotPasswordModal, elements.settingsModal,
    elements.savedModal, elements.scheduledModal, elements.scheduleModal,
    elements.forwardModal, elements.walletModal, elements.moneyConfirmModal,
    elements.moneyReceiptModal, elements.splitBillModal, elements.tipModal,
    elements.adminReverseModal, elements.premiumModal,
    elements.theogoModal, elements.fundraiserModal, elements.contributeModal,
    elements.editMessageModal, elements.saveNoteModal, elements.payLinkModal
  ].forEach(m => closeModal(m));

  const shareModal = document.getElementById("shareModal");
  if (shareModal) { shareModal.remove(); pendingShare = null; }
  const gs = document.getElementById("globalSearchModal");
  if (gs) gs.classList.add("hidden");
}

function closeMobileChat() { if (elements.appScreen) elements.appScreen.classList.remove("chat-open"); }

function autoResizeTextarea() {
  const input = elements.messageInput;
  if (!input) return;
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, 130) + "px";
  if (input.value.length > 0) { startTyping(); broadcastTypingAny(); }
  else { stopTyping(); broadcastStopTypingAny(); }
}

function formatFileSize(bytes) {
  if (!bytes) return "0 B";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function formatMessageTime(date) {
  return date ? new Date(date).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "";
}
function formatListTime(date) {
  if (!date) return "";
  const d = new Date(date), today = new Date();
  if (d.toDateString() === today.toDateString()) return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return d.toLocaleDateString([], { day: "numeric", month: "short" });
}
function formatDateDivider(date) {
  const d = new Date(date), today = new Date();
  const yest = new Date(); yest.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yest.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { day: "numeric", month: "long", year: "numeric" });
}

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
function escapeAttr(value) {
  return String(value == null ? "" : value)
    .replace(/\\/g, "\\\\").replace(/'/g, "\\'")
    .replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function escapeStyleUrl(url) {
  if (!url) return "";
  return String(url)
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'");
}

/* ---------- Skeleton loader ---------- */
function renderSkeleton(kind, count) {
  count = count || 3;
  const frag = document.createDocumentFragment();
  const cls = "skeleton " + (kind || "row");
  for (let i = 0; i < count; i++) {
    const el = document.createElement("div");
    el.className = cls;
    frag.appendChild(el);
  }
  return frag;
}
function skeletonList(target, kind, count) {
  if (!target) return;
  target.innerHTML = "";
  target.appendChild(renderSkeleton(kind, count));
}

/* ---------- buildPreviewText ---------- */
function buildPreviewText(msg) {
  if (!msg) return "";
  if (msg.kind === "system" && msg.meta) {
    return msg.content || "Group update";
  }
  if (msg.kind === "money" && msg.meta) {
    const m = msg.meta;
    const dir = m.direction || "sent";
    const amt = Number(m.amount || 0).toFixed(2);
    if (dir === "received")    return "💰 Received ₹" + amt;
    if (dir === "sent")        return "You sent ₹" + amt;
    if (dir === "request_in")  return "💸 Request: ₹" + amt;
    if (dir === "request_out") return "Requested ₹" + amt;
    return "₹" + amt;
  }
  if (msg.kind === "fundraiser" && msg.meta) {
    return "🎯 " + ((msg.meta.fundraiser && msg.meta.fundraiser.title) || "Fundraiser");
  }
  if (msg.content) return String(msg.content).slice(0, 80);
  return "📎 File";
}

/* ---------- moneyStatusLabel ---------- */
function moneyStatusLabel(status) {
  switch (status) {
    case "pending":   return "Pending";
    case "paid":      return "Paid";
    case "declined":  return "Declined";
    case "cancelled": return "Cancelled";
    case "expired":   return "Expired";
    case "failed":    return "Failed";
    case "reversed":  return "Reversed";
    case "completed": return "Completed";
    default:          return status || "Completed";
  }
}
function formatMoney(n) {
  const num = Number(n || 0);
  if (!isFinite(num)) return "0.00";
  return num.toFixed(2);
}

function friendlyError(error) {
  if (!error) return "Something went wrong. Please try again.";
  const message = error.message || String(error);
  if (message.indexOf("Invalid login credentials") > -1)  return "Incorrect username or password.";
  if (message.indexOf("User already registered") > -1)    return "This account already exists.";
  if (message.indexOf("duplicate key") > -1)              return "That username is already taken.";
  if (message.indexOf("row-level security") > -1)         return "Permission denied.";
  if (message.indexOf("Payload too large") > -1)          return "File is larger than the limit.";
  if (message.indexOf("insufficient_balance") > -1)       return "Not enough balance in your wallet.";
  if (message.indexOf("self_transfer_blocked") > -1)      return "You can't send money to yourself.";
  if (message.indexOf("below_min_amount") > -1)           return "Minimum transfer is ₹" + WALLET_MIN_AMOUNT + ".";
  if (message.indexOf("above_max_amount") > -1)           return "Maximum transfer is ₹" + WALLET_MAX_AMOUNT + ".";
  if (message.indexOf("sender_wallet_frozen") > -1)       return "Your wallet is currently frozen. Contact admin.";
  if (message.indexOf("recipient_wallet_frozen") > -1)    return "Recipient's wallet is frozen.";
  if (message.indexOf("recipient_not_found") > -1)        return "Recipient not found.";
  if (message.indexOf("request_not_found") > -1)          return "This request no longer exists.";
  if (message.indexOf("request_not_pending") > -1)        return "This request is already resolved.";
  if (message.indexOf("not_authorized_to_pay") > -1)      return "You can't pay this request.";
  if (message.indexOf("cannot_reverse") > -1)             return "Only completed transactions can be reversed.";
  if (message.indexOf("already_reversed") > -1)           return "This transaction has already been reversed.";
  if (message.indexOf("file_too_large") > -1)             return "File too large for your plan.";
  if (message.indexOf("not_admin") > -1)                  return "Only admins can do this.";
  if (message.indexOf("pro_admin") > -1)                  return "The group creator cannot be demoted or removed.";
  if (message.indexOf("last_admin") > -1)                 return "You can't remove the last admin.";
  if (message.indexOf("not_member") > -1)                 return "You're not in this group.";
  if (message.indexOf("fundraiser_not_found") > -1)       return "Fundraiser not found.";
  if (message.indexOf("max_pinned") > -1)                 return "You can pin up to " + MAX_PINNED_CHATS + " chats.";
  return "Something went wrong. Please try again.";
}

function showToast(message, type) {
  const el = elements && elements.toast ? elements.toast : document.getElementById("toast");
  if (!el) { console.log("[toast]", message); return; }
  el.textContent = message;
  el.classList.remove("hidden", "error", "success");
  if (type) el.classList.add(type);
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => el.classList.add("hidden"), 4000);
}

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

function debounce(fn, ms) {
  let t = null;
  function wrapped() {
    const args = arguments;
    clearTimeout(t);
    t = setTimeout(() => fn.apply(null, args), ms);
  }
  wrapped.cancel = () => { clearTimeout(t); t = null; };
  return wrapped;
}

function copyText(text, successMsg) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => { if (successMsg) showToast(successMsg, "success"); })
      .catch(() => fallbackCopy(text, successMsg));
  } else fallbackCopy(text, successMsg);
}
function fallbackCopy(text, successMsg) {
  const ta = document.createElement("textarea");
  ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
  document.body.appendChild(ta); ta.select();
  try { document.execCommand("copy"); if (successMsg) showToast(successMsg, "success"); }
  catch (e) { showToast("Copy failed.", "error"); }
  ta.remove();
}

function isVerified(profile) {
  if (!profile) return false;
  return !!profile.is_verified;
}

/* ---------- 11. Link detection & rendering ---------- */
function detectNetworkLink(url) {
  if (!url) return null;
  const lower = url.toLowerCase();
  if (lower.indexOf("theogo.miraheze.org") > -1) return { network: "theogo", label: "TheoGO Wiki", color: "#2563eb", icon: "", iconUrl: THEOGO_LOGO_URL };
  if (lower.indexOf("bds.42web.io") > -1)        return { network: "bds",    label: "BDS Forum",   color: "#7c3aed", icon: "📖" };
  if (lower.indexOf("yeshugeets.site") > -1)     return { network: "yeshu",  label: "Yeshu Geets", color: "#d97706", icon: "🎵" };
  if (lower.indexOf("justgo.42web.io") > -1)     return { network: "justgo", label: "JustGo Chat", color: "#1652c4", icon: "💬" };
  return null;
}
function extractLinkAndTitle(content) {
  const text = String(content || "");
  const matches = text.match(/(https?:\/\/[^\s]+)/gi) || [];
  for (const m of matches) {
    const meta = detectNetworkLink(m);
    if (meta) return { url: m, meta };
  }
  return null;
}
function renderLinkPreviewCard(container, url, meta) {
  const card = document.createElement("a");
  card.className = "link-preview-card link-preview-" + meta.network;
  card.href = url; card.target = "_blank"; card.rel = "noopener noreferrer";

  let title = meta.label;
  try {
    const u = new URL(url);
    if (meta.network === "theogo") {
      const path = u.pathname.replace(/^\/wiki\//, "");
      if (path && path.length > 1) title = decodeURIComponent(path).replace(/_/g, " ");
    } else if (meta.network === "bds") {
      const q = u.searchParams.get("q");
      if (q) title = "Discussion: " + q;
    }
  } catch (e) {}

  const iconHtml = meta.iconUrl
    ? '<img src="' + meta.iconUrl + '" alt="">'
    : escapeHtml(meta.icon);

  card.innerHTML =
    '<div class="lp-icon" style="background:' + meta.color + ';">' + iconHtml + '</div>' +
    '<div class="lp-body">' +
      '<div class="lp-source">' + escapeHtml(meta.label) + '</div>' +
      '<div class="lp-title">' + escapeHtml(title) + '</div>' +
      '<div class="lp-url">' + escapeHtml(url.replace(/^https?:\/\//, "").slice(0, 60)) + (url.length > 60 ? "…" : "") + '</div>' +
    '</div>' +
    '<div class="lp-arrow">›</div>';
  container.appendChild(card);
}

function renderTextWithMentionsAndLinks(container, content) {
  const text = String(content || "");
  const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;
  const parts = [];
  let lastIndex = 0, match;
  while ((match = urlRegex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push({ type: "text", value: text.slice(lastIndex, match.index) });
    parts.push({ type: "url", value: match[0] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) parts.push({ type: "text", value: text.slice(lastIndex) });

  parts.forEach(part => {
    if (part.type === "url") {
      const href = part.value.indexOf("http") === 0 ? part.value : "https://" + part.value;
      const a = document.createElement("a");
      a.href = href; a.target = "_blank"; a.rel = "noopener noreferrer";
      a.textContent = part.value; a.className = "message-link";
      container.appendChild(a);
    } else {
      const mentionRegex = /(@[a-zA-Z0-9_.-]+)/g;
      let last = 0, m;
      while ((m = mentionRegex.exec(part.value)) !== null) {
        if (m.index > last) container.appendChild(document.createTextNode(part.value.slice(last, m.index)));
        const usernameRaw = m[0].slice(1);
        const lower = usernameRaw.toLowerCase();
        const span = document.createElement("span");
        span.className = "mention-pill"; span.textContent = m[0];
        if (lower === "everyone") { span.classList.add("mention-everyone"); span.style.cursor = "default"; }
        else if (lower === "here") { span.classList.add("mention-here"); span.style.cursor = "default"; }
        else {
          span.style.cursor = "pointer";
          if (currentProfile && currentProfile.username && currentProfile.username.toLowerCase() === lower) span.classList.add("mention-you");
          span.addEventListener("click", () => openPublicProfile(usernameRaw));
        }
        container.appendChild(span);
        last = m.index + m[0].length;
      }
      if (last < part.value.length) container.appendChild(document.createTextNode(part.value.slice(last)));
    }
  });
}

/* ---------- 12. Wallpapers ---------- */
const WALLPAPERS = [
  { id: "default",   label: "Default",   css: "" },
  { id: "dots",      label: "Dots",      css: "radial-gradient(circle, rgba(22,82,196,.08) 1px, transparent 1px) 0 0/18px 18px" },
  { id: "grid",      label: "Grid",      css: "linear-gradient(rgba(22,82,196,.06) 1px, transparent 1px), linear-gradient(90deg, rgba(22,82,196,.06) 1px, transparent 1px) 0 0/24px 24px" },
  { id: "waves",     label: "Waves",     css: "repeating-linear-gradient(45deg, rgba(22,82,196,.05) 0 12px, transparent 12px 24px)" },
  { id: "sunset",    label: "Sunset",    css: "linear-gradient(180deg, rgba(245,158,11,.12), rgba(220,38,38,.10))" },
  { id: "forest",    label: "Forest",    css: "linear-gradient(180deg, rgba(22,163,74,.10), rgba(22,82,196,.08))" },
  { id: "violet",    label: "Violet",    css: "linear-gradient(135deg, rgba(124,58,237,.12), rgba(22,82,196,.10))" },
  { id: "paper",     label: "Paper",     css: "linear-gradient(0deg, rgba(0,0,0,.03) 1px, transparent 1px) 0 0/100% 28px" },
  { id: "grid-blue", label: "Blue grid", css: "linear-gradient(rgba(37,99,235,.10) 1px, transparent 1px), linear-gradient(90deg, rgba(37,99,235,.10) 1px, transparent 1px) 0 0/30px 30px" }
];

function renderWallpaperGrid() {
  const grid = elements.wallpaperGrid; if (!grid) return;
  grid.innerHTML = "";
  const current = settings.wallpaper || "default";
  WALLPAPERS.forEach(w => {
    const el = document.createElement("div");
    el.className = "wallpaper-swatch" + (w.id === current ? " active" : "");
    el.dataset.wallpaper = w.id;
    if (w.css) el.style.backgroundImage = w.css;
    else { el.style.background = ""; el.style.backgroundColor = "var(--chat-bg)"; }
    el.innerHTML = '<span class="ws-label">' + escapeHtml(w.label) + '</span>';
    grid.appendChild(el);
  });
}
function handleWallpaperPick(e) {
  const sw = e.target.closest(".wallpaper-swatch"); if (!sw) return;
  const id = sw.dataset.wallpaper;
  if (id !== 'default' && isPremiumFeatureLocked('custom_wallpapers')) {
    closeSettingsModal();
    setTimeout(() => showPremiumUpsell('Custom wallpapers'), 100);
    return;
  }
  settings.wallpaper = id;
  saveLocalSettings();
  renderWallpaperGrid();
  applyPremiumLocksToSettings();
  applyWallpaperToChat();
  showToast("Wallpaper set.", "success");
}
function applyWallpaperToChat() {
  const id = settings.wallpaper || "default";
  if (!elements.messages) return;
  if (id && id !== "default") elements.messages.setAttribute("data-wallpaper", id);
  else elements.messages.removeAttribute("data-wallpaper");
  elements.messages.style.backgroundImage = "";
  elements.messages.style.background = "";
}

/* ---------- 13. Settings UI ---------- */
function applySettingsToUI() {
  if (elements.settingNotifications) elements.settingNotifications.checked = !!settings.notifications;
  if (elements.settingSound) elements.settingSound.checked = !!settings.sound;
  if (elements.settingSendOnEnter) elements.settingSendOnEnter.checked = !!settings.sendOnEnter;
  if (elements.settingReadReceipts) elements.settingReadReceipts.checked = !!settings.readReceipts;
  if (elements.settingsModal) elements.settingsModal.querySelectorAll(".theme-btn").forEach(b => {
    b.classList.toggle("active", b.dataset.theme === settings.theme);
  });
  document.querySelectorAll("#settingsModal .switch-card input[type='checkbox']").forEach(inp => {
    const card = inp.closest(".switch-card");
    if (card) card.classList.toggle("active", inp.checked);
  });
  renderWallpaperGrid();
  applyPremiumLocksToSettings();
  applyPremiumUpsellVisibility();
}

function applyPremiumUpsellVisibility() {
  const premium = isPremium();

  if (elements.profilePremiumCard) {
    renderProfilePremiumCard();
  }

  const sidebarPremium = elements.sidebarMenu && elements.sidebarMenu.querySelector('button[data-menu="premium"]');
  if (sidebarPremium) sidebarPremium.classList.toggle("hidden", premium);

  if (elements.openPremiumFromSettingsBtn) {
    const section = elements.openPremiumFromSettingsBtn.closest(".settings-section");
    if (section) section.classList.toggle("hidden", premium);
  }

  const showRing = premium || !!(currentProfile && currentProfile.is_premium);
  if (elements.myAvatar) elements.myAvatar.classList.toggle("premium-avatar", showRing);
  if (elements.profileAvatarPreview) elements.profileAvatarPreview.classList.toggle("premium-avatar-big", showRing);
}

function renderProfilePremiumCard() {
  const card = elements.profilePremiumCard;
  if (!card) return;
  const premium = isPremium();
  const daysLeft = myPremium.days_left || 0;
  const expires = myPremium.expires_at
    ? new Date(myPremium.expires_at).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })
    : '—';

  if (premium) {
    card.classList.remove('hidden');
    card.classList.add('is-active');
    card.innerHTML =
      '<div class="ppc-crown">👑</div>' +
      '<div class="ppc-text">' +
        '<strong>Premium member</strong>' +
        '<span>' + daysLeft + ' day' + (daysLeft === 1 ? '' : 's') + ' left · until ' + expires + '</span>' +
      '</div>' +
      '<span class="ppc-arrow">›</span>';
    card.onclick = () => showPremiumUpsell('Manage');
  } else {
    card.classList.remove('hidden', 'is-active');
    card.innerHTML =
      '<div class="ppc-crown">👑</div>' +
      '<div class="ppc-text">' +
        '<strong>Go Premium</strong>' +
        '<span>50 MB files · Dark theme · 0.5% fees · Library downloads</span>' +
      '</div>' +
      '<span class="ppc-arrow">›</span>';
    card.onclick = () => showPremiumUpsell('Premium');
  }
}

function applyPremiumLocksToSettings() {
  const themeBtns = elements.settingsModal ? elements.settingsModal.querySelectorAll(".theme-btn") : [];
  themeBtns.forEach(btn => {
    const themeKey = btn.dataset.theme;
    let locked = false;
    if (themeKey === "dark") locked = isPremiumFeatureLocked('dark_theme');
    if (themeKey === "auto") locked = isPremiumFeatureLocked('auto_theme');
    btn.classList.toggle('locked', locked);
    btn.disabled = locked;
    if (locked && !btn.querySelector('.lock-badge')) {
      const badge = document.createElement('span');
      badge.className = 'lock-badge';
      badge.textContent = '🔒 Premium';
      btn.appendChild(badge);
    } else if (!locked) {
      const badge = btn.querySelector('.lock-badge');
      if (badge) badge.remove();
    }
  });
  if (elements.wallpaperGrid) {
    elements.wallpaperGrid.querySelectorAll('.wallpaper-swatch').forEach(sw => {
      const w = sw.dataset.wallpaper;
      const locked = w !== 'default' && isPremiumFeatureLocked('custom_wallpapers');
      sw.classList.toggle('locked', locked);
      if (locked && !sw.querySelector('.lock-badge')) {
        const badge = document.createElement('span');
        badge.className = 'lock-badge';
        badge.textContent = '🔒';
        sw.appendChild(badge);
      } else if (!locked) {
        const badge = sw.querySelector('.lock-badge');
        if (badge) badge.remove();
      }
    });
  }
  if (elements.openSavedBtn) {
    const locked = isPremiumFeatureLocked('saved_messages');
    elements.openSavedBtn.classList.toggle('locked', locked);
    const descEl = elements.openSavedBtn.querySelector('.se-txt span');
    if (descEl) descEl.textContent = locked ? 'Premium only — tap to upgrade' : 'Messages you starred';
  }
  if (elements.openScheduledBtn) {
    const locked = isPremiumFeatureLocked('scheduled_messages');
    elements.openScheduledBtn.classList.toggle('locked', locked);
    const descEl = elements.openScheduledBtn.querySelector('.se-txt span');
    if (descEl) descEl.textContent = locked ? 'Premium only — tap to upgrade' : 'Messages waiting to be sent';
  }
}

function saveSettingsFromUI() {
  if (elements.settingNotifications) settings.notifications = elements.settingNotifications.checked;
  if (elements.settingSound) settings.sound = elements.settingSound.checked;
  if (elements.settingSendOnEnter) settings.sendOnEnter = elements.settingSendOnEnter.checked;
  if (elements.settingReadReceipts) settings.readReceipts = elements.settingReadReceipts.checked;
  saveLocalSettings();
}

function handleSettingsThemePick(e) {
  const btn = e.target.closest(".theme-btn"); if (!btn) return;
  if (btn.disabled) {
    if (btn.dataset.theme === "auto") showPremiumUpsell('Auto theme');
    else showPremiumUpsell('Dark theme');
    return;
  }
  settings.theme = btn.dataset.theme;
  applyTheme(settings.theme);
  saveLocalSettings();
  if (elements.settingsModal) {
    elements.settingsModal.querySelectorAll(".theme-btn")
      .forEach(b => b.classList.toggle("active", b === btn));
  }
}
function openSettingsModal() { applySettingsToUI(); openModal(elements.settingsModal); }
function closeSettingsModal() { closeModal(elements.settingsModal); }
function openChatGPTIntegration() { closeSettingsModal(); window.location.href = "chatgpt/"; }

/* ---------- 14. Anti-tamper footer ---------- */
Object.defineProperty(window, 'justgoVersion', {
  value: 'v15-core',
  writable: false
});

/* ---------- 16. Stable window.db getter (race-free) ---------- */
try {
  if (!Object.getOwnPropertyDescriptor(window, "db")) {
    Object.defineProperty(window, "db", {
      get: function () { return db; },
      configurable: true
    });
  }
} catch (e) {
  console.warn("[JustGo] could not define window.db getter", e);
}

console.log('[JustGo] core.js loaded — v15');

/* ---------- 15. Boot ---------- */
console.log('[JustGo] core.js loaded — v15');

if (document.readyState === "complete") {
  bootStart();
} else {
  window.addEventListener("load", bootStart, { once: true });
}