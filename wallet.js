/* =========================================================================
   JustGo — wallet.js (v15)
   Wallet, money transfers, requests, deposits, withdrawals, split bill,
   tips, receipts, fundraisers, TheoGo, CSV export, pay links.

   Changelog v14 → v15:
     • Removed "1% fee (0.5% premium)" subtitle from balance banner.
     • New pay-link modal with QR code + share.
     • Withdraw tab rewritten: shows methods and pre-fills message to admin.
     • Split bill: no one selected by default, per-person edit input, ticket
       CSS classes rebuilt cleanly.
     • sendMoneyRpc now supports optional tip metadata (message_id).
     • Version tag updated.
   ========================================================================= */

/* =========================================================
   WALLET CHIP
   ========================================================= */
function initWalletChipHover() {
  const chip = elements.walletChip;
  if (!chip) return;
  chip.addEventListener('click', () => openWalletModal({ mode: 'header' }));
}

/* =========================================================
   WALLET DATA
   ========================================================= */
let _refreshWalletInFlight = null;
let _refreshWalletQueued = false;

async function loadWallet() {
  if (!currentUser) return;
  try {
    const { data, error } = await db.rpc("get_my_wallet");
    if (error) throw error;
    if (data) applyWalletData(data);
  } catch (e) {}
  await refreshWalletSummary();
}

function applyWalletData(data) {
  if (!data) return;
  if (data.wallet) {
    myWallet = {
      balance: Number(data.wallet.balance || 0),
      currency: data.wallet.currency || 'INR',
      is_frozen: !!data.wallet.is_frozen
    };
  }
  walletTransactions     = data.transactions       || [];
  walletRequestsIncoming = data.requests_incoming  || [];
  walletRequestsOutgoing = data.requests_outgoing  || [];
  updateWalletChipUI();
  if (elements.walletModal && !elements.walletModal.classList.contains('hidden')) {
    renderWalletHistory();
  }
}

async function refreshWalletData() {
  if (_refreshWalletInFlight) {
    _refreshWalletQueued = true;
    return _refreshWalletInFlight;
  }
  _refreshWalletInFlight = loadWallet().finally(() => {
    _refreshWalletInFlight = null;
    if (_refreshWalletQueued) {
      _refreshWalletQueued = false;
      refreshWalletData();
    }
  });
  return _refreshWalletInFlight;
}

async function refreshWalletSummary() {
  try {
    const { data } = await db.rpc("get_wallet_monthly_summary");
    if (data && elements.wscSent) {
      elements.wscSent.textContent = '₹' + formatMoney(data.sent);
      elements.wscRecv.textContent = '₹' + formatMoney(data.received);
      const net = Number(data.net || 0);
      elements.wscNet.textContent = (net >= 0 ? '+' : '−') + '₹' + formatMoney(Math.abs(net));
      elements.wscNet.style.color = net >= 0 ? 'var(--success)' : 'var(--danger)';
    }
  } catch (e) {}
}

function updateWalletChipUI() {
  if (elements.walletChipBalance) elements.walletChipBalance.textContent = '₹' + formatMoney(myWallet.balance);
  if (elements.walletBalanceAmount) elements.walletBalanceAmount.textContent = '₹' + formatMoney(myWallet.balance);
  if (elements.walletChipBadge) {
    if (walletUnreadBadge > 0) {
      elements.walletChipBadge.textContent = walletUnreadBadge > 9 ? '9+' : String(walletUnreadBadge);
      elements.walletChipBadge.classList.remove('hidden');
    } else elements.walletChipBadge.classList.add('hidden');
  }
  if (elements.walletChip) elements.walletChip.classList.toggle('frozen', !!myWallet.is_frozen);
}

function subscribeWalletRealtime() {
  if (walletRealtimeChannel) {
    try { db.removeChannel(walletRealtimeChannel); } catch (e) {}
    walletRealtimeChannel = null;
  }
  if (!currentUser) return;

  walletRealtimeChannel = db.channel("wallet-" + currentUser.id + "-" + Date.now());

  const onWalletChange = () => refreshWalletData();
  const onTxnInsert = payload => {
    const t = payload.new; if (!t) return;
    if (t.from_user === currentUser.id || t.to_user === currentUser.id) {
      walletUnreadBadge++;
      updateWalletChipUI();
      refreshWalletData();
      const iAmReceiver = t.to_user === currentUser.id;
      if (iAmReceiver && t.status === 'completed') {
        showToast('💰 Received ₹' + formatMoney(t.amount), 'success');
        if (settings.sound) playNotificationSound();
      }
    }
  };
  const onRequestChange = payload => {
    const r = payload.new || payload.old; if (!r) return;
    if (r.from_user === currentUser.id || r.to_user === currentUser.id) {
      refreshWalletData();
      if (payload.eventType === 'INSERT' && r.to_user === currentUser.id && r.status === 'pending') {
        walletUnreadBadge++;
        updateWalletChipUI();
        showToast('💸 Money request: ₹' + formatMoney(r.amount), 'success');
      }
    }
  };

  walletRealtimeChannel
    .on("postgres_changes", { event: "*", schema: "public", table: "justgo_wallets", filter: "user_id=eq." + currentUser.id }, onWalletChange)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "justgo_transactions" }, onTxnInsert)
    .on("postgres_changes", { event: "*", schema: "public", table: "money_requests" }, onRequestChange)
    .subscribe();
}

function cleanupWalletRealtime() {
  if (walletRealtimeChannel) {
    try { db.removeChannel(walletRealtimeChannel); } catch (e) {}
    walletRealtimeChannel = null;
  }
}

/* =========================================================
   WALLET MODAL
   ========================================================= */
async function openWalletModal(opts) {
  opts = opts || {};
  walletUnreadBadge = 0;
  updateWalletChipUI();
  if (!currentUser) return showToast("Please sign in first.", "error");

  if (opts.mode === 'dm' && opts.partner) {
    walletMode = 'dm';
    walletDmPartner = opts.partner;
  } else if (opts.sendToUser && !opts.mode) {
    walletMode = 'dm';
    walletDmPartner = opts.sendToUser;
  } else if (opts.requestFromUser && !opts.mode) {
    walletMode = 'dm';
    walletDmPartner = opts.requestFromUser;
  } else {
    walletMode = 'header';
    walletDmPartner = null;
  }

  openModal(elements.walletModal);
  applyWalletModeUI();
  switchWalletTab('send');
  resetWalletSendPanel();
  resetWalletRequestPanel();
  resetWalletDepositPanel();
  resetWalletWithdrawPanel();
  renderWalletHistory();
  refreshWalletSummary();

  if (opts.sendToUser)     prefillWalletSend(opts.sendToUser);
  if (opts.requestFromUser) { switchWalletTab('request'); prefillWalletRequest(opts.requestFromUser); }
  if (opts.amount && elements.walletSendAmount) {
    elements.walletSendAmount.value = opts.amount;
    updateWalletSendButton();
  }
}

function closeWalletModal() {
  closeModal(elements.walletModal);
  walletMode = 'header';
  walletDmPartner = null;
}

let _partnerBannerLastKey = "";

function applyWalletModeUI() {
  const tabsEl = elements.walletTabs;
  if (!tabsEl) return;
  const tabs = tabsEl.querySelectorAll('button[data-wtab]');
  const partnerBanner = document.getElementById('walletPartnerBanner');
  const historyTitle = document.getElementById('walletHistoryTitle');

  if (walletMode === 'dm') {
    tabs.forEach(t => {
      const w = t.dataset.wtab;
      t.style.display = (w === 'deposit' || w === 'withdraw') ? 'none' : '';
    });
    if (partnerBanner && walletDmPartner) {
      const key = (walletDmPartner.id || "") + "|" + (walletDmPartner.display_name || "") + "|" +
                  (walletDmPartner.avatar_url || "") + "|" + (walletDmPartner.is_premium ? "1" : "0");
      partnerBanner.classList.remove('hidden');
      if (key !== _partnerBannerLastKey) {
        _partnerBannerLastKey = key;
        const initial = (walletDmPartner.display_name || walletDmPartner.username || 'U').charAt(0).toUpperCase();
        const safeAvatar = walletDmPartner.avatar_url ? escapeStyleUrl(walletDmPartner.avatar_url) : '';
        const av = safeAvatar ? 'background-image:url(\'' + safeAvatar + '\');color:transparent;' : '';
        const ring = walletDmPartner.is_premium ? ' premium-avatar' : '';
        partnerBanner.innerHTML =
          '<div class="wpb-avatar' + ring + '" style="' + av + '">' + escapeHtml(initial) + '</div>' +
          '<div class="wpb-info">' +
            '<strong>' + escapeHtml(walletDmPartner.display_name || walletDmPartner.username) +
              (walletDmPartner.is_premium ? ' 👑' : '') +
            '</strong>' +
            '<span>Transactions with this person only</span>' +
          '</div>';
      }
    }
    if (historyTitle) historyTitle.textContent = 'History with ' +
      (walletDmPartner ? (walletDmPartner.display_name || walletDmPartner.username) : '');
  } else {
    tabs.forEach(t => { t.style.display = ''; });
    if (partnerBanner) partnerBanner.classList.add('hidden');
    if (historyTitle) historyTitle.textContent = 'All history';
    _partnerBannerLastKey = "";
  }
}

function switchWalletTab(name) {
  if (!elements.walletTabs) return;
  elements.walletTabs.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.wtab === name));
  if (elements.walletModal) elements.walletModal.querySelectorAll('.wallet-panel').forEach(p => p.classList.toggle('active', p.dataset.wpanel === name));
  if (name === 'history') renderWalletHistory();
}

/* =========================================================
   WALLET SEND
   ========================================================= */
function resetWalletSendPanel() {
  if (walletMode !== 'dm') {
    walletSendTarget = null;
    if (elements.walletSendSearch) elements.walletSendSearch.value = '';
    if (elements.walletSendResults) elements.walletSendResults.innerHTML = '';
    if (elements.walletSendSelected) { elements.walletSendSelected.classList.add('hidden'); elements.walletSendSelected.innerHTML = ''; }
    const searchField = elements.walletSendSearch && elements.walletSendSearch.closest('.field');
    if (searchField) searchField.style.display = '';
  } else if (walletDmPartner) {
    walletSendTarget = walletDmPartner;
    renderWalletSelected('send', walletDmPartner);
    const searchField = elements.walletSendSearch && elements.walletSendSearch.closest('.field');
    if (searchField) searchField.style.display = 'none';
    if (elements.walletSendResults) elements.walletSendResults.innerHTML = '';
  }
  if (elements.walletSendAmount) elements.walletSendAmount.value = '';
  if (elements.walletSendNote) elements.walletSendNote.value = '';
  if (elements.walletSendMsg) { elements.walletSendMsg.textContent = ''; elements.walletSendMsg.classList.add('hidden'); }
  updateWalletSendButton();
  updateSendFeePreview();
}

function prefillWalletSend(user) {
  walletSendTarget = user;
  renderWalletSelected('send', user);
  const searchField = elements.walletSendSearch && elements.walletSendSearch.closest('.field');
  if (searchField) searchField.style.display = 'none';
  updateWalletSendButton();
  updateSendFeePreview();
}

function renderWalletSelected(kind, user) {
  const box = kind === 'send' ? elements.walletSendSelected : elements.walletRequestSelected;
  if (!box) return;
  box.classList.remove('hidden');
  const initial = (user.display_name || user.username || 'U').charAt(0).toUpperCase();
  const ring = user.is_premium ? ' premium-avatar' : '';
  const safeAvatar = user.avatar_url ? escapeStyleUrl(user.avatar_url) : "";
  box.innerHTML =
    '<div class="wallet-selected-chip">' +
      '<div class="avatar-small' + ring + '"' +
        (safeAvatar ? ' style="background-image:url(\'' + safeAvatar + '\');color:transparent;"' : '') +
        '>' + escapeHtml(initial) + '</div>' +
      '<div class="wallet-selected-info"><strong>' +
        escapeHtml(user.display_name || user.username) +
        (user.is_premium ? ' 👑' : '') +
      '</strong><span>@' + escapeHtml(user.username) + '</span></div>' +
      (walletMode === 'dm' ? '' : '<button type="button" class="wallet-selected-clear">×</button>') +
    '</div>';
  const clearBtn = box.querySelector('.wallet-selected-clear');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (kind === 'send') walletSendTarget = null;
      else walletRequestTarget = null;
      box.classList.add('hidden'); box.innerHTML = '';
      const searchField = kind === 'send'
        ? (elements.walletSendSearch && elements.walletSendSearch.closest('.field'))
        : (elements.walletRequestSearch && elements.walletRequestSearch.closest('.field'));
      if (searchField) searchField.style.display = '';
      updateWalletSendButton(); updateWalletRequestButton();
      updateSendFeePreview(); updateRequestFeePreview();
    });
  }
}

function updateWalletSendButton() {
  const amt = parseFloat(elements.walletSendAmount.value || 0);
  elements.walletSendBtn.disabled = !walletSendTarget || !(amt >= WALLET_MIN_AMOUNT);
  updateSendFeePreview();
}

function updateSendFeePreview() {
  const amt = parseFloat(elements.walletSendAmount.value || 0);
  const fee = calculateFeePreview(amt);
  const total = amt + fee;
  const preview = document.getElementById('walletSendFeePreview');
  if (!preview) return;
  if (!amt || amt < WALLET_MIN_AMOUNT) { preview.classList.add('hidden'); return; }
  preview.classList.remove('hidden');
  preview.innerHTML =
    '<div class="wfp-row"><span>Amount</span><strong>₹' + formatMoney(amt) + '</strong></div>' +
    '<div class="wfp-row"><span>Fee (' + currentFeePct() + '%)</span><strong>+₹' + formatMoney(fee) + '</strong></div>' +
    '<div class="wfp-row wfp-total"><span>You pay</span><strong>₹' + formatMoney(total) + '</strong></div>' +
    '<div class="wfp-note">They receive ₹' + formatMoney(amt) + '</div>';
}

let _walletSearchTimer = null;
let _walletSearchReqId = 0;

function walletSearchUsers(query, resultsBox, onPick) {
  clearTimeout(_walletSearchTimer);
  const reqId = ++_walletSearchReqId;
  if (!query || query.length < 1) {
    resultsBox.innerHTML = '';
    return;
  }
  _walletSearchTimer = setTimeout(async () => {
    try {
            const { data, error } = await db.from('profiles')
        .select('id, username, display_name, avatar_url, is_premium')
        .neq('id', currentUser.id)
        .or('username.ilike.%' + query + '%,display_name.ilike.%' + query + '%')
        .limit(8);
      if (error) throw error;
      if (reqId !== _walletSearchReqId) return;
      resultsBox.innerHTML = '';
      (data || []).forEach(u => {
        const initial = (u.display_name || u.username).charAt(0).toUpperCase();
        const row = document.createElement('div');
        row.className = 'wallet-user-row';
        const ring = u.is_premium ? ' premium-avatar' : '';
        const safeAvatar = u.avatar_url ? escapeStyleUrl(u.avatar_url) : '';
                row.innerHTML =
          '<div class="avatar-small' + ring + '"' +
            (safeAvatar ? ' style="background-image:url(\'' + safeAvatar + '\');color:transparent;"' : '') +
            '>' + escapeHtml(initial) + '</div>' +
          '<div class="wallet-user-row-info"><strong>' +
            escapeHtml(u.display_name || u.username) +
            (u.is_premium ? ' 👑' : '') + '</strong>' +
          '<span>@' + escapeHtml(u.username) + '</span></div>';
        row.addEventListener('click', () => onPick(u));
        resultsBox.appendChild(row);
      });
    } catch (e) {
      if (reqId === _walletSearchReqId) resultsBox.innerHTML = '<div class="search-empty">Search failed</div>';
    }
  }, 220);
}

/* =========================================================
   WALLET REQUEST
   ========================================================= */
function resetWalletRequestPanel() {
  if (walletMode !== 'dm') {
    walletRequestTarget = null;
    if (elements.walletRequestSearch) elements.walletRequestSearch.value = '';
    if (elements.walletRequestResults) elements.walletRequestResults.innerHTML = '';
    if (elements.walletRequestSelected) { elements.walletRequestSelected.classList.add('hidden'); elements.walletRequestSelected.innerHTML = ''; }
    const searchField = elements.walletRequestSearch && elements.walletRequestSearch.closest('.field');
    if (searchField) searchField.style.display = '';
  } else if (walletDmPartner) {
    walletRequestTarget = walletDmPartner;
    renderWalletSelected('request', walletDmPartner);
    const searchField = elements.walletRequestSearch && elements.walletRequestSearch.closest('.field');
    if (searchField) searchField.style.display = 'none';
    if (elements.walletRequestResults) elements.walletRequestResults.innerHTML = '';
  }
  if (elements.walletRequestAmount) elements.walletRequestAmount.value = '';
  if (elements.walletRequestNote) elements.walletRequestNote.value = '';
  if (elements.walletRequestMsg) { elements.walletRequestMsg.textContent = ''; elements.walletRequestMsg.classList.add('hidden'); }
  updateWalletRequestButton();
  updateRequestFeePreview();
}

function prefillWalletRequest(user) {
  walletRequestTarget = user;
  renderWalletSelected('request', user);
  const searchField = elements.walletRequestSearch && elements.walletRequestSearch.closest('.field');
  if (searchField) searchField.style.display = 'none';
  updateWalletRequestButton();
  updateRequestFeePreview();
}

function updateWalletRequestButton() {
  const amt = parseFloat(elements.walletRequestAmount.value || 0);
  elements.walletRequestBtn.disabled = !walletRequestTarget || !(amt >= WALLET_MIN_AMOUNT);
  updateRequestFeePreview();
}

function updateRequestFeePreview() {
  const amt = parseFloat(elements.walletRequestAmount.value || 0);
  const fee = calculateFeePreview(amt);
  const total = amt + fee;
  const preview = document.getElementById('walletRequestFeePreview');
  if (!preview) return;
  if (!amt || amt < WALLET_MIN_AMOUNT) { preview.classList.add('hidden'); return; }
  preview.classList.remove('hidden');
  preview.innerHTML =
    '<div class="wfp-row"><span>You request</span><strong>₹' + formatMoney(amt) + '</strong></div>' +
    '<div class="wfp-row"><span>They pay (incl. ' + currentFeePct() + '% fee)</span><strong>₹' + formatMoney(total) + '</strong></div>';
}

/* =========================================================
   WALLET HISTORY
   ========================================================= */
function renderWalletHistory() {
  const list = elements.walletHistoryList;
  if (!list) return;

  const dmUid = (walletMode === 'dm' && walletDmPartner) ? walletDmPartner.id : null;
  const filter = walletHistoryFilter;

  const items = [];

  for (const t of walletTransactions) {
if (t.kind === 'platform_fee' || t.kind === 'fee') continue;
    if (dmUid && t.from_user !== dmUid && t.to_user !== dmUid) continue;
    if (filter === 'sent' && t.from_user !== currentUser.id) continue;
    if (filter === 'received' && t.to_user !== currentUser.id) continue;
    if (filter === 'requests') continue;
    items.push({ kind: 'txn', at: t.created_at, txn: t });
  }

  if (filter === 'all' || filter === 'requests') {
    for (const r of walletRequestsIncoming) {
      if (dmUid && r.from_user !== dmUid) continue;
      items.push({ kind: 'req_in', at: r.created_at, req: r });
    }
    for (const r of walletRequestsOutgoing) {
      if (dmUid && r.to_user !== dmUid) continue;
      items.push({ kind: 'req_out', at: r.created_at, req: r });
    }
  }

  items.sort((a, b) => new Date(b.at) - new Date(a.at));

  if (!items.length) {
    list.innerHTML = '<div class="search-empty">' +
      (dmUid ? 'No transactions with this person yet.' : 'Nothing here yet. Send or receive money to see it here.') +
      '</div>';
    return;
  }

  list.innerHTML = '';
  const frag = document.createDocumentFragment();
  for (const item of items) {
    const el = item.kind === 'txn' ? buildHistoryTxnRow(item.txn) : buildHistoryRequestRow(item.req, item.kind);
    if (el) frag.appendChild(el);
  }
  list.appendChild(frag);
}

function buildHistoryTxnRow(t) {
  const isSent = t.from_user === currentUser.id;
  const otherId = isSent ? t.to_user : t.from_user;
  const p = profileCache[otherId];
  const name = p ? (p.display_name || p.username) : 'User';
  const fee = Number(t.fee || 0);
  const amount = Number(t.amount || 0);
  const total = isSent ? amount + fee : amount;

  /* Event ticket + refund special rows */
  if (t.kind === 'event_ticket' || t.kind === 'event_refund') {
    const isRefund = t.kind === 'event_refund';
    const row = document.createElement('div');
    row.className = 'wallet-history-item ' + (isRefund ? 'received' : 'sent') + ' event-txn-row';
    row.innerHTML =
      '<div class="whi-icon event-txn-icon">' +
        (isRefund
          ? '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>'
          : '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9a3 3 0 0 0 0 6v3a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3a3 3 0 0 1 0-6V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2z"/><line x1="9" y1="4" x2="9" y2="20" stroke-dasharray="2 3"/></svg>') +
      '</div>' +
      '<div class="whi-body">' +
        '<div class="whi-title">' + (isRefund ? 'Refund · ' : 'Ticket · ') +
          escapeHtml((t.note || 'Event').replace(/^Fundraiser: /, '').replace(/^Refund for event: /, '').replace(/^Event ticket: /, '')) +
        '</div>' +
        '<div class="whi-time">' + formatListTime(t.created_at) + ' • ' + escapeHtml(moneyStatusLabel(t.status)) + '</div>' +
      '</div>' +
      '<div class="whi-amount ' + (isRefund ? 'pos' : 'neg') + '">' +
        (isRefund ? '+' : '−') + '₹' + formatMoney(amount) +
      '</div>';
    row.addEventListener('click', () => openMoneyReceipt(t.id));
    return row;
  }

  /* Default transfer row */
  const row = document.createElement('div');
  row.className = 'wallet-history-item ' + (isSent ? 'sent' : 'received');
  row.innerHTML =
    '<div class="whi-icon">' + (isSent ? '↑' : '↓') + '</div>' +
    '<div class="whi-body">' +
      '<div class="whi-title">' + (isSent ? 'To ' : 'From ') + escapeHtml(name) + '</div>' +
      (t.note ? '<div class="whi-note">' + escapeHtml(t.note) + '</div>' : '') +
      '<div class="whi-time">' + formatListTime(t.created_at) + ' · ' + escapeHtml(moneyStatusLabel(t.status)) +
        (isSent && fee > 0 ? ' · fee ₹' + formatMoney(fee) : '') +
      '</div>' +
    '</div>' +
    '<div class="whi-amount ' + (isSent ? 'neg' : 'pos') + '">' +
      (isSent ? '−' : '+') + '₹' + formatMoney(isSent ? total : amount) +
    '</div>';
  row.addEventListener('click', () => openMoneyReceipt(t.id));
  return row;
}

function buildHistoryRequestRow(r, kind) {
  const isIncoming = kind === 'req_in';
  const otherId = isIncoming ? r.from_user : r.to_user;
  const p = profileCache[otherId];
  const name = p ? (p.display_name || p.username) : 'User';
  const row = document.createElement('div');
  row.className = 'wallet-history-item request ' + (isIncoming ? 'request-in' : 'request-out');
  row.innerHTML =
    '<div class="whi-icon">' + (isIncoming ? '←' : '→') + '</div>' +
    '<div class="whi-body">' +
      '<div class="whi-title">' + (isIncoming ? 'Request from ' : 'Requested from ') + escapeHtml(name) + '</div>' +
      (r.note ? '<div class="whi-note">' + escapeHtml(r.note) + '</div>' : '') +
      '<div class="whi-time">' + formatListTime(r.created_at) + ' • ' + escapeHtml(moneyStatusLabel(r.status)) + '</div>' +
    '</div>' +
    '<div class="whi-amount">₹' + formatMoney(r.amount) + '</div>';
  return row;
}

/* =========================================================
   WALLET DEPOSIT
   ========================================================= */
function resetWalletDepositPanel() {
  walletDepositFile = null;
  if (elements.walletDepositAmount) elements.walletDepositAmount.value = '';
  if (elements.walletDepositNote) elements.walletDepositNote.value = '';
  if (elements.walletDepositFile) elements.walletDepositFile.value = '';
  if (elements.walletDepositFileName) elements.walletDepositFileName.textContent = '';
  if (elements.walletDepositPreview) { elements.walletDepositPreview.innerHTML = ''; elements.walletDepositPreview.classList.add('hidden'); }
  if (elements.walletDepositMsg) { elements.walletDepositMsg.textContent = ''; elements.walletDepositMsg.classList.add('hidden'); }
  const minNote = document.getElementById('walletDepositMinNote');
  if (minNote) minNote.textContent = '₹' + platformSettings.deposit_min_amount;
}

async function walletMessageAdminForDeposit() {
  try {
    let adminProfile = null;
    if (adminUserId) adminProfile = await getProfileCached(adminUserId);
    if (!adminProfile) {
      const { data } = await db.from('profiles').select('*').eq('username', ADMIN_USERNAME).maybeSingle();
      if (data) adminProfile = data;
    }
    if (!adminProfile) return showToast('Admin not available right now.', 'error');
    const user = { id: adminProfile.id, username: adminProfile.username, display_name: adminProfile.display_name, avatar_url: adminProfile.avatar_url, is_premium: adminProfile.is_premium };
    closeWalletModal();
    await startConversation(user);
    elements.messageInput.value = "Hi admin 👋 — I'd like to add money to my JustGo wallet.\nAmount: ₹";
    autoResizeTextarea();
    elements.messageInput.focus();
  } catch (e) { showToast(friendlyError(e), 'error'); }
}

async function walletMessagePeerForDeposit() {
  closeWalletModal();
  if (elements.userSearch) {
    elements.userSearch.value = '';
    elements.userSearch.focus();
    showToast('Search a classmate to ask them to transfer you money.', 'success');
  }
}

async function submitWalletDeposit() {
  const amount = parseFloat(elements.walletDepositAmount.value || 0);
  const note = elements.walletDepositNote.value.trim();
  if (!(amount >= platformSettings.deposit_min_amount)) {
    return walletShowMsg(elements.walletDepositMsg,
      'Minimum deposit is ₹' + platformSettings.deposit_min_amount + '.', 'error');
  }
  if (!walletDepositFile) return walletShowMsg(elements.walletDepositMsg, 'Attach a payment screenshot.', 'error');
  elements.walletDepositBtn.disabled = true;
  elements.walletDepositBtn.textContent = 'Submitting…';
  try {
    const ext = (walletDepositFile.name.split('.').pop() || 'jpg').toLowerCase();
    const path = currentUser.id + '/deposits/' + Date.now() + '.' + ext;
    const { error: upErr } = await db.storage.from(STORAGE_BUCKET).upload(path, walletDepositFile, { upsert: false });
    if (upErr) throw upErr;
    const { error } = await db.from('justgo_deposit_requests').insert({
      user_id: currentUser.id, amount, screenshot_path: path, note: note || null, status: 'pending'
    });
    if (error) {
      try { await db.storage.from(STORAGE_BUCKET).remove([path]); } catch (e) {}
      throw error;
    }
    walletShowMsg(elements.walletDepositMsg, 'Deposit request submitted. Admin will review soon.', 'success');
    showToast('Deposit request submitted.', 'success');
    resetWalletDepositPanel();
  } catch (e) { walletShowMsg(elements.walletDepositMsg, friendlyError(e), 'error'); }
  finally { elements.walletDepositBtn.disabled = false; elements.walletDepositBtn.textContent = 'Submit deposit request'; }
}

/* =========================================================
   WALLET WITHDRAW — new panel with choices
   ========================================================= */
function resetWalletWithdrawPanel() {
  if (elements.walletWithdrawMsg) { elements.walletWithdrawMsg.textContent = ''; elements.walletWithdrawMsg.classList.add('hidden'); }
}

async function walletMessageAdminForWithdraw(method) {
  try {
    let adminProfile = null;
    if (adminUserId) adminProfile = await getProfileCached(adminUserId);
    if (!adminProfile) {
      const { data } = await db.from('profiles').select('*').eq('username', ADMIN_USERNAME).maybeSingle();
      if (data) adminProfile = data;
    }
    if (!adminProfile) return showToast('Admin not available right now.', 'error');
    const user = { id: adminProfile.id, username: adminProfile.username, display_name: adminProfile.display_name, avatar_url: adminProfile.avatar_url, is_premium: adminProfile.is_premium };

    let template = "Hi admin 👋 — I'd like to withdraw money from my JustGo wallet.\n" +
      "Amount: ₹\n";

    if (method === 'upi') {
      template += "Method: UPI\nUPI ID: \nName on UPI: ";
    } else if (method === 'bank') {
      template += "Method: Bank transfer\nAccount holder: \nAccount number: \nIFSC: \nBank name: ";
    } else {
      template += "Method: (please specify)\nDetails: ";
    }

    closeWalletModal();
    await startConversation(user);
    elements.messageInput.value = template;
    autoResizeTextarea();
    elements.messageInput.focus();
  } catch (e) { showToast(friendlyError(e), 'error'); }
}

/* =========================================================
   SHARED SEND MONEY HELPER
   ========================================================= */
async function sendMoneyRpc({ toUserId, amount, note, conversationId, notePrefix, messageId }) {
  const idem = 'txn_' + currentUser.id + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  const { data, error } = await db.rpc('send_money', {
    p_to_user: toUserId,
    p_amount: amount,
    p_note: (notePrefix ? notePrefix + ' ' : '') + (note || ''),
    p_idempotency_key: idem,
    p_conversation_id: conversationId || null
  });
  if (error) throw error;

  // Attach tip metadata if this is a tip
  if (messageId && data && data.transaction_id) {
    try {
      await db.from('justgo_transactions').update({
        note: (note || '') + ' [tip:' + messageId + ']'
      }).eq('id', data.transaction_id);
    } catch (e) {}
  }
  return data;
}

/* =========================================================
   CONFIRM SEND
   ========================================================= */
function requestConfirmSend(target, amount, note) {
  walletPendingConfirm = { to_user: target, amount, note };
  const name = target.display_name || target.username;
  const initial = name.charAt(0).toUpperCase();
  const fee = calculateFeePreview(amount);
  const total = Number(amount) + fee;

  if (elements.moneyConfirmAvatar) {
    if (target.avatar_url) {
      const safe = escapeStyleUrl(target.avatar_url);
      elements.moneyConfirmAvatar.style.backgroundImage = "url('" + safe + "')";
      elements.moneyConfirmAvatar.textContent = '';
    } else {
      elements.moneyConfirmAvatar.style.backgroundImage = '';
      elements.moneyConfirmAvatar.textContent = initial;
    }
    elements.moneyConfirmAvatar.classList.toggle('premium-avatar-big', !!target.is_premium);
  }
  elements.moneyConfirmName.textContent = name;
  elements.moneyConfirmUsername.textContent = '@' + target.username;
  elements.moneyConfirmAmount.textContent = '₹' + formatMoney(amount);
  elements.moneyConfirmNote.textContent = note || '—';

  if (elements.moneyConfirmFeeValue) elements.moneyConfirmFeeValue.textContent = '+₹' + formatMoney(fee);
  if (elements.moneyConfirmFeeRow) elements.moneyConfirmFeeRow.style.display = '';
  if (elements.moneyConfirmTotalValue) elements.moneyConfirmTotalValue.textContent = '₹' + formatMoney(total);
  if (elements.moneyConfirmTotalRow) elements.moneyConfirmTotalRow.style.display = '';
  if (elements.moneyConfirmNet) elements.moneyConfirmNet.textContent = '₹' + formatMoney(amount);

  elements.moneyConfirmGo.textContent = 'Pay ₹' + formatMoney(total);
  elements.moneyConfirmMsg.classList.add("hidden");
  openModal(elements.moneyConfirmModal);
}

async function doConfirmSend() {
  if (!walletPendingConfirm) return;
  const { to_user, amount, note } = walletPendingConfirm;
  const fee = calculateFeePreview(amount);
  const total = Number(amount) + fee;

  elements.moneyConfirmGo.disabled = true;
  elements.moneyConfirmGo.textContent = 'Sending…';

  if (total > myWallet.balance) {
    walletShowMsg(elements.moneyConfirmMsg, 'Not enough balance. You need ₹' + formatMoney(total) + '.', 'error');
    elements.moneyConfirmGo.disabled = false;
    elements.moneyConfirmGo.textContent = 'Pay ₹' + formatMoney(total);
    return;
  }

  try {
    await sendMoneyRpc({
      toUserId: to_user.id,
      amount: amount,
      note: note || null,
      conversationId: currentConversation && !currentConversation.is_group ? currentConversation.id : null
    });
    closeModal(elements.moneyConfirmModal);
    walletPendingConfirm = null;
    await refreshWalletData();
    await loadConversations();
    showToast('Sent ₹' + formatMoney(amount) + '. Total paid ₹' + formatMoney(total) + '.', 'success');
  } catch (e) { walletShowMsg(elements.moneyConfirmMsg, friendlyError(e), 'error'); }
  finally {
    elements.moneyConfirmGo.disabled = false;
    const f = calculateFeePreview(amount);
    elements.moneyConfirmGo.textContent = 'Pay ₹' + formatMoney(Number(amount) + f);
  }
}

/* =========================================================
   REQUEST MONEY
   ========================================================= */
async function doRequestMoney() {
  if (!walletRequestTarget) return;
  const amount = parseFloat(elements.walletRequestAmount.value || 0);
  const note = elements.walletRequestNote.value.trim();
  if (!(amount >= WALLET_MIN_AMOUNT)) return walletShowMsg(elements.walletRequestMsg, 'Enter a valid amount.', 'error');
  elements.walletRequestBtn.disabled = true;
  elements.walletRequestBtn.textContent = 'Requesting…';
  try {
    const { error } = await db.rpc('request_money', {
      p_to_user: walletRequestTarget.id, p_amount: amount, p_note: note || null,
      p_conversation_id: currentConversation && !currentConversation.is_group ? currentConversation.id : null
    });
    if (error) throw error;
    walletShowMsg(elements.walletRequestMsg, 'Request sent.', 'success');
    showToast('Request sent.', 'success');
    await refreshWalletData();
    await loadConversations();
    resetWalletRequestPanel();
  } catch (e) { walletShowMsg(elements.walletRequestMsg, friendlyError(e), 'error'); }
  finally { elements.walletRequestBtn.disabled = false; elements.walletRequestBtn.textContent = 'Request money'; }
}

/* =========================================================
   PAY / DECLINE / CANCEL REQUEST
   ========================================================= */
async function walletPayRequest(requestId) {
  if (!requestId) return;
  if (!confirm('Pay this request now?')) return;
  try {
    const idem = 'pay_' + currentUser.id + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    const { error } = await db.rpc('pay_money_request', { p_request_id: requestId, p_idempotency_key: idem });
    if (error) throw error;
    await refreshWalletData();
    showToast('Paid.', 'success');
  } catch (e) { showToast(friendlyError(e), 'error'); }
}
async function walletDeclineRequest(requestId) {
  if (!requestId) return;
  try { await db.rpc('decline_money_request', { p_request_id: requestId }); await refreshWalletData(); showToast('Declined.', 'success'); }
  catch (e) { showToast(friendlyError(e), 'error'); }
}
async function walletCancelRequest(requestId) {
  if (!requestId) return;
  try { await db.rpc('cancel_money_request', { p_request_id: requestId }); await refreshWalletData(); showToast('Cancelled.', 'success'); }
  catch (e) { showToast(friendlyError(e), 'error'); }
}

/* =========================================================
   RECEIPT
   ========================================================= */
async function openMoneyReceipt(txnId) {
  if (!txnId) return;
  elements.moneyReceiptBody.innerHTML = '<div class="search-empty">Loading…</div>';
  openModal(elements.moneyReceiptModal);
  try {
    let txn = walletTransactions.find(t => t.id === txnId);
    if (!txn) {
      const { data } = await db.from('justgo_transactions').select('*').eq('id', txnId).maybeSingle();
      txn = data;
    }
    if (!txn) { elements.moneyReceiptBody.innerHTML = '<div class="search-empty">Receipt not found.</div>'; return; }
    const fromP = await getProfileCached(txn.from_user);
    const toP = await getProfileCached(txn.to_user);
    const fromName = fromP ? (fromP.display_name || fromP.username) : 'User';
    const toName = toP ? (toP.display_name || toP.username) : 'User';
    const isSent = txn.from_user === currentUser.id;
    const fee = Number(txn.fee || 0);
    const amount = Number(txn.amount || 0);
    const total = isSent ? amount + fee : amount;

    elements.moneyReceiptBody.innerHTML =
      '<div class="receipt-hero">' +
        '<div class="receipt-amount">₹' + formatMoney(amount) + '</div>' +
        '<div class="receipt-direction ' + (isSent ? 'neg' : 'pos') + '">' + (isSent ? 'Sent' : 'Received') + '</div>' +
      '</div>' +
      '<div class="receipt-row"><span>From</span><strong>' + escapeHtml(fromName) + '</strong></div>' +
      '<div class="receipt-row"><span>To</span><strong>' + escapeHtml(toName) + '</strong></div>' +
      (isSent && fee > 0 ? '<div class="receipt-row"><span>Fee (' + currentFeePct() + '%)</span><strong>+₹' + formatMoney(fee) + '</strong></div>' : '') +
      (isSent && fee > 0 ? '<div class="receipt-row"><span>You paid</span><strong>₹' + formatMoney(total) + '</strong></div>' : '') +
      (!isSent ? '<div class="receipt-row"><span>You received</span><strong>₹' + formatMoney(amount) + '</strong></div>' : '') +
      '<div class="receipt-row"><span>Status</span><strong>' + escapeHtml(moneyStatusLabel(txn.status)) + '</strong></div>' +
      (txn.note ? '<div class="receipt-row"><span>Note</span><strong>' + escapeHtml(txn.note) + '</strong></div>' : '') +
      '<div class="receipt-row"><span>Time</span><strong>' + new Date(txn.created_at).toLocaleString() + '</strong></div>' +
      '<div class="receipt-zero">Transaction fee: ' + currentFeePct() + '% (added on top). ' +
        (isPremium() ? 'You get premium rate 👑' : 'Get premium to pay only ' + platformSettings.premium_discount_fee_pct + '%') +
      '</div>';
  } catch (e) { elements.moneyReceiptBody.innerHTML = '<div class="search-empty">Could not load receipt.</div>'; }
}

/* =========================================================
   TIP
   ========================================================= */
function openTipModal(message) {
  if (!message || !message.sender_id) return;
  if (message.sender_id === currentUser.id) return showToast("You can't tip your own message.", 'error');
  tipMessageTarget = message;
  elements.tipPreview.textContent = (message.content || '(file)').slice(0, 120);
  elements.tipAmount.value = '';
  elements.tipMsg.classList.add('hidden');
  updateTipFeePreview();
  openModal(elements.tipModal);
}
function updateTipFeePreview() {
  const amt = parseFloat(elements.tipAmount.value || 0);
  const preview = document.getElementById('tipFeePreview');
  if (!preview) return;
  if (!amt || amt < WALLET_MIN_AMOUNT) { preview.classList.add('hidden'); return; }
  const fee = calculateFeePreview(amt);
  const total = amt + fee;
  preview.classList.remove('hidden');
  preview.innerHTML =
    '<div class="wfp-row"><span>Tip</span><strong>₹' + formatMoney(amt) + '</strong></div>' +
    '<div class="wfp-row"><span>Fee (' + currentFeePct() + '%)</span><strong>+₹' + formatMoney(fee) + '</strong></div>' +
    '<div class="wfp-row wfp-total"><span>You pay</span><strong>₹' + formatMoney(total) + '</strong></div>';
}
async function sendTip() {
  if (!tipMessageTarget) return;
  const amount = parseFloat(elements.tipAmount.value || 0);
  if (!(amount >= WALLET_MIN_AMOUNT)) return walletShowMsg(elements.tipMsg, 'Enter a valid amount.', 'error');
  const targetProfile = await getProfileCached(tipMessageTarget.sender_id);
  if (!targetProfile) return walletShowMsg(elements.tipMsg, 'User not found.', 'error');
  elements.tipGo.disabled = true;
  elements.tipGo.textContent = 'Sending…';
  try {
    await sendMoneyRpc({
      toUserId: targetProfile.id,
      amount: amount,
      note: 'Tip for a message',
      conversationId: tipMessageTarget.conversation_id || null,
      messageId: tipMessageTarget.id
    });
    closeModal(elements.tipModal);
    tipMessageTarget = null;
    await refreshWalletData();
    // Refresh the message row to show the tip badge
    if (typeof loadSingleMessage === 'function' && tipMessageTarget && tipMessageTarget.id) {
      loadSingleMessage(tipMessageTarget.id);
    }
    showToast('Tip sent.', 'success');
  } catch (e) { walletShowMsg(elements.tipMsg, friendlyError(e), 'error'); }
  finally { elements.tipGo.disabled = false; elements.tipGo.textContent = 'Send tip'; }
}

/* =========================================================
   SPLIT BILL — reworked: no default selection, per-person input
   ========================================================= */
let _splitBillOpening = false;

async function openSplitBillModal() {
  if (!currentConversation) return showToast('Open a chat first.', 'error');
  if (!currentConversation.is_group) {
    return showToast('Split bill is only for groups.', 'error');
  }
  if (_splitBillOpening) return;
  _splitBillOpening = true;

  try {
    const { data: parts, error } = await db.from('conversation_participants')
      .select('user_id, role')
      .eq('conversation_id', currentConversation.id);
    if (error) { showToast('Could not load members.', 'error'); return; }
    currentParticipants = parts || [];

    const seenIds = new Set();
    const otherMemberIds = [];
    for (const p of currentParticipants) {
      if (p.user_id === currentUser.id) continue;
      if (seenIds.has(p.user_id)) continue;
      seenIds.add(p.user_id);
      otherMemberIds.push(p.user_id);
    }

    if (!otherMemberIds.length) return showToast('No other members in this group.', 'error');

    const { data: profiles } = await db.from('profiles')
      .select('id, username, display_name, avatar_url, is_premium')
      .in('id', otherMemberIds);

    const profileMap = {};
    (profiles || []).forEach(p => { profileMap[p.id] = p; });

    const seenNames = new Set();
    splitBillState.members = [];
    for (const uid of otherMemberIds) {
      const p = profileMap[uid];
      if (!p) continue;
      const displayName = p.display_name || p.username || 'User';
      const key = p.username || uid;
      if (seenNames.has(key)) continue;
      seenNames.add(key);
      splitBillState.members.push({
        id: uid,
        username: p.username || 'user',
        display_name: displayName,
        avatar_url: p.avatar_url || null,
        is_premium: !!p.is_premium,
        customAmount: null // NEW: per-person override
      });
    }

    if (!splitBillState.members.length) return showToast('No other members found.', 'error');

    splitBillState.total = 0;
    splitBillState.mode = 'request';
    splitBillState.selected = new Set(); // ← EMPTY by default now

    elements.splitBillTotal.value = '';
    elements.splitBillMsg.classList.add('hidden');
    elements.splitBillMsg.classList.remove('error', 'success');

    document.querySelectorAll('#splitBillMode button').forEach(b => {
      b.classList.toggle('active', b.dataset.smode === 'request');
    });

    renderSplitMembers();
    updateSplitSummary();

    openModal(elements.splitBillModal);
  } finally {
    _splitBillOpening = false;
  }
}

function renderSplitMembers() {
  const wrap = elements.splitBillMembers;
  if (!wrap) return;
  wrap.innerHTML = '';
  splitBillState.members.forEach(m => {
    const isSelected = splitBillState.selected.has(m.id);
    const row = document.createElement('div');
    row.className = 'split-member' + (isSelected ? ' selected' : '');
    const initial = m.display_name.charAt(0).toUpperCase();
    const ring = m.is_premium ? ' premium-avatar' : '';
    const safeAvatar = m.avatar_url ? escapeStyleUrl(m.avatar_url) : "";
    row.innerHTML =
      '<label class="split-member-check">' +
        '<input type="checkbox" ' + (isSelected ? 'checked' : '') + ' data-uid="' + m.id + '">' +
        '<span class="smc-box"></span>' +
      '</label>' +
      '<div class="avatar-small' + ring + '"' +
        (safeAvatar ? ' style="background-image:url(\'' + safeAvatar + '\');color:transparent;"' : '') + '>' + escapeHtml(initial) + '</div>' +
      '<span class="split-name">' + escapeHtml(m.display_name) +
        (m.is_premium ? ' 👑' : '') + '</span>' +
      '<input type="number" class="split-custom-input" min="0" step="0.01" placeholder="₹" ' +
        'data-custom-for="' + m.id + '" ' + (isSelected ? '' : 'disabled ') +
        'value="' + (m.customAmount != null ? m.customAmount : '') + '">' +
      '<span class="split-amount" data-amount-for="' + m.id + '"></span>';
    const input = row.querySelector('input[type="checkbox"]');
    input.addEventListener('change', (e) => {
      if (e.target.checked) splitBillState.selected.add(m.id);
      else splitBillState.selected.delete(m.id);
      row.classList.toggle('selected', e.target.checked);
      const customInput = row.querySelector('.split-custom-input');
      customInput.disabled = !e.target.checked;
      if (!e.target.checked) m.customAmount = null;
      updateSplitSummary();
    });
    const customInput = row.querySelector('.split-custom-input');
    customInput.addEventListener('input', (e) => {
      const v = parseFloat(e.target.value);
      m.customAmount = isFinite(v) && v > 0 ? v : null;
      updateSplitSummary();
    });
    wrap.appendChild(row);
  });
  updateSplitSummary();
}

function updateSplitSummary() {
  const total = parseFloat(elements.splitBillTotal.value || 0) || 0;
  const selectedMembers = splitBillState.members.filter(m => splitBillState.selected.has(m.id));
  const count = selectedMembers.length;

  // Determine how many members use custom amounts
  let customSum = 0;
  let nonCustomCount = 0;
  selectedMembers.forEach(m => {
    if (m.customAmount != null && m.customAmount > 0) customSum += m.customAmount;
    else nonCustomCount++;
  });

  const remainingTotal = Math.max(0, total - customSum);
  const share = nonCustomCount > 0 ? remainingTotal / nonCustomCount : 0;
  const fee = calculateFeePreview(share);
  const totalPerPerson = share + fee;

  elements.splitPerPerson.textContent = '₹' + formatMoney(share);
  elements.splitFeePct.textContent = String(currentFeePct());
  elements.splitFeeAmount.textContent = '+₹' + formatMoney(fee);
  elements.splitTotalPerPerson.textContent = '₹' + formatMoney(totalPerPerson);

  splitBillState.members.forEach(m => {
    const el = document.querySelector('[data-amount-for="' + m.id + '"]');
    if (!el) return;
    if (!splitBillState.selected.has(m.id)) { el.textContent = ''; return; }
    const amt = (m.customAmount != null && m.customAmount > 0) ? m.customAmount : share;
    const feePer = calculateFeePreview(amt);
    if (splitBillState.mode === 'request') {
      el.textContent = '₹' + formatMoney(amt + feePer);
    } else {
      el.textContent = '₹' + formatMoney(amt);
    }
  });
}

async function doSplitBill() {
  const total = parseFloat(elements.splitBillTotal.value || 0);
  if (!(total >= WALLET_MIN_AMOUNT)) return walletShowMsg(elements.splitBillMsg, 'Enter a total amount.', 'error');
  const uids = Array.from(splitBillState.selected);
  if (!uids.length) return walletShowMsg(elements.splitBillMsg, 'Select at least one member.', 'error');

  // Compute per-member amounts
  const selectedMembers = splitBillState.members.filter(m => splitBillState.selected.has(m.id));
  const customSum = selectedMembers.reduce((s, m) => s + (m.customAmount != null ? m.customAmount : 0), 0);
  const nonCustomCount = selectedMembers.filter(m => m.customAmount == null).length;
  const remainingTotal = Math.max(0, total - customSum);
  const autoShare = nonCustomCount > 0 ? remainingTotal / nonCustomCount : 0;

  const perAmounts = {};
  for (const m of selectedMembers) {
    const amt = m.customAmount != null ? m.customAmount : autoShare;
    if (amt < WALLET_MIN_AMOUNT) {
      return walletShowMsg(elements.splitBillMsg, 'One share is below the minimum (₹' + WALLET_MIN_AMOUNT + ').', 'error');
    }
    perAmounts[m.id] = +amt.toFixed(2);
  }

  elements.splitBillGo.disabled = true;
  elements.splitBillGo.textContent = 'Creating…';

  if (splitBillState.mode === 'pay') {
    let totalCost = 0;
    for (const uid of uids) totalCost += perAmounts[uid] + calculateFeePreview(perAmounts[uid]);
    if (totalCost > myWallet.balance) {
      walletShowMsg(elements.splitBillMsg, 'Not enough balance. Need ₹' + formatMoney(totalCost) + '.', 'error');
      elements.splitBillGo.disabled = false;
      elements.splitBillGo.textContent = 'Create split';
      return;
    }
  }

  try {
    if (splitBillState.mode === 'request') {
      // Use RPC if available, else fall back to sending individual requests
      const { data, error } = await db.rpc('create_split_bill', {
        p_conversation_id: currentConversation.id,
        p_total_amount: total,
        p_user_ids: uids,
        p_mode: 'request',
        p_title: 'Split bill'
      });
      if (error) throw error;
      if (data && data.ok === false) throw new Error(data.error || 'Could not create split');
      walletShowMsg(elements.splitBillMsg, 'Split requests sent to ' + uids.length + ' member' + (uids.length === 1 ? '' : 's') + '.', 'success');
    } else {
      let ok = 0, fail = 0;
      for (const uid of uids) {
        try {
          await sendMoneyRpc({
            toUserId: uid,
            amount: perAmounts[uid],
            note: 'Split: ₹' + formatMoney(total) + ' total',
            conversationId: currentConversation.id
          });
          ok++;
        } catch (e) { fail++; }
      }
      if (fail === 0) {
        walletShowMsg(elements.splitBillMsg, 'Paid ' + ok + ' member' + (ok === 1 ? '' : 's') + '.', 'success');
      } else {
        walletShowMsg(elements.splitBillMsg, ok + ' paid, ' + fail + ' failed.', 'error');
      }
    }

    await refreshWalletData();
    await loadConversations();
    setTimeout(() => closeModal(elements.splitBillModal), 900);
  } catch (e) {
    walletShowMsg(elements.splitBillMsg, friendlyError(e), 'error');
  } finally {
    elements.splitBillGo.disabled = false;
    elements.splitBillGo.textContent = 'Create split';
  }
}

/* =========================================================
   ADMIN REVERSE
   ========================================================= */
function openAdminReverse(txnId) {
  adminReverseTarget = txnId;
  elements.adminReverseReason.value = '';
  elements.adminReverseMsg.classList.add('hidden');
  openModal(elements.adminReverseModal);
}
async function doAdminReverse() {
  if (!adminReverseTarget) return;
  const reason = elements.adminReverseReason.value.trim();
  elements.adminReverseGo.disabled = true;
  elements.adminReverseGo.textContent = 'Reversing…';
  try {
    const { error } = await db.rpc('admin_reverse_transaction', { p_transaction_id: adminReverseTarget, p_reason: reason || null });
    if (error) throw error;
    closeModal(elements.adminReverseModal);
    adminReverseTarget = null;
    await refreshWalletData();
    showToast('Reversed.', 'success');
  } catch (e) { walletShowMsg(elements.adminReverseMsg, friendlyError(e), 'error'); }
  finally { elements.adminReverseGo.disabled = false; elements.adminReverseGo.textContent = 'Reverse'; }
}

/* =========================================================
   CSV EXPORT
   ========================================================= */
function downloadWalletCsv() {
  const dmUid = (walletMode === 'dm' && walletDmPartner) ? walletDmPartner.id : null;

  const chunks = [];
  chunks.push('Date,Direction,Counterparty,Amount,Fee,Net,Status,Note,Transaction ID\n');

  walletTransactions.forEach(t => {
    if (t.kind === 'platform_fee') return;
    const isSent = t.from_user === currentUser.id;
    const otherId = isSent ? t.to_user : t.from_user;
    if (dmUid && otherId !== dmUid) return;
    const p = profileCache[otherId];
    const row = [
      new Date(t.created_at).toISOString(),
      isSent ? 'Sent' : 'Received',
      p ? (p.username || '') : '',
      t.amount, t.fee || 0, t.net_amount || t.amount, t.status,
      (t.note || '').replace(/"/g, "'"), t.id
    ];
    chunks.push(row.map(v => {
      const s = String(v == null ? '' : v);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(',') + '\n');
  });

  const blob = new Blob(chunks, { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const suffix = dmUid ? '-with-' + (walletDmPartner.username || 'user') : '';
  a.href = url;
  a.download = 'justgo-wallet' + suffix + '-' + new Date().toISOString().slice(0, 10) + '.csv';
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  showToast('Statement downloaded.', 'success');
}

/* =========================================================
   PAY LINK
   ========================================================= */
async function handlePayLinkFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    const pay = params.get('pay');
    const amount = params.get('amount');
    if (!pay) return;
    if (window.history && window.history.replaceState)
      window.history.replaceState({}, document.title, window.location.pathname);
    const username = String(pay).replace(/^@/, '').trim().toLowerCase();
    const { data: prof } = await db.from('profiles')
      .select('id, username, display_name, avatar_url, is_premium').eq('username', username).maybeSingle();
    if (!prof) return showToast('Pay link: user not found.', 'error');
    if (prof.id === currentUser.id) return showToast("That's your own link.", 'error');
    setTimeout(() => {
      openWalletModal({ mode: 'dm', partner: prof });
      if (amount && elements.walletSendAmount) {
        elements.walletSendAmount.value = String(parseFloat(amount) || '');
        updateWalletSendButton();
      }
    }, 250);
  } catch (e) {}
}

function getMyPayLink() {
  if (!currentProfile) return "";
  return 'https://justgo.42web.io/?pay=' + encodeURIComponent(currentProfile.username);
}

function buildQRInto(container, text, size) {
  if (!container) return;
  size = size || 220;
  // Tiny inline QR. Uses public API-free library (Google Chart deprecated).
  // We'll use a data-uri QR through an external service that renders SVG.
  // For privacy, alternatively you can generate QR locally with a bundled lib.
  const url = "https://api.qrserver.com/v1/create-qr-code/?size=" + size + "x" + size +
              "&data=" + encodeURIComponent(text) + "&margin=10";
  container.innerHTML = '<img src="' + url + '" alt="QR code" width="' + size + '" height="' + size + '" loading="lazy">';
}

function shareMyPayLink() {
  if (!currentProfile) return;
  const link = getMyPayLink();

  // Show the modal
  if (elements.payLinkBox) elements.payLinkBox.textContent = link;
  if (elements.payLinkMsg) { elements.payLinkMsg.textContent = ""; elements.payLinkMsg.classList.add("hidden"); }
  buildQRInto(elements.payQR, link, 220);
  openModal(elements.payLinkModal);
}

function bindPayLinkModalEvents() {
  on(elements.payLinkCopy, "click", () => {
    copyText(getMyPayLink(), "Pay link copied.");
  });
  on(elements.payLinkShare, "click", () => {
    const link = getMyPayLink();
    const text = "Pay me on JustGo: " + link;
    if (navigator.share) {
      navigator.share({ title: "My JustGo pay link", text: "Pay me on JustGo", url: link }).catch(() => {});
    } else copyText(text, "Pay link copied.");
  });
}

/* =========================================================
   WALLET EVENT BINDING
   ========================================================= */
function bindWalletEvents() {
  initWalletChipHover();
  bindPayLinkModalEvents();

  on(elements.walletClose, 'click', closeWalletModal);
  on(elements.walletModal, 'click', e => { if (e.target === elements.walletModal) closeWalletModal(); });
  on(elements.walletTabs, 'click', e => {
    const b = e.target.closest('button[data-wtab]');
    if (!b) return;
    switchWalletTab(b.dataset.wtab);
  });
  on(elements.walletShareLinkBtn, 'click', shareMyPayLink);

  on(elements.walletSendSearch, 'input', () => {
    if (walletMode === 'dm') return;
    walletSearchUsers(elements.walletSendSearch.value.trim(), elements.walletSendResults, u => {
      walletSendTarget = u; renderWalletSelected('send', u);
      elements.walletSendResults.innerHTML = ''; elements.walletSendSearch.value = '';
      updateWalletSendButton();
    });
  });
  on(elements.walletSendAmount, 'input', updateWalletSendButton);
  document.querySelectorAll('.wallet-quick-amounts button[data-amt]').forEach(b => {
    b.addEventListener('click', () => {
      elements.walletSendAmount.value = b.dataset.amt;
      updateWalletSendButton();
    });
  });
  on(elements.walletSendBtn, 'click', () => {
    if (!walletSendTarget) return;
    const amount = parseFloat(elements.walletSendAmount.value || 0);
    const note = elements.walletSendNote.value.trim();
    if (!(amount >= WALLET_MIN_AMOUNT)) return showToast('Enter a valid amount.', 'error');
    requestConfirmSend(walletSendTarget, amount, note);
  });

  on(elements.walletRequestSearch, 'input', () => {
    if (walletMode === 'dm') return;
    walletSearchUsers(elements.walletRequestSearch.value.trim(), elements.walletRequestResults, u => {
      walletRequestTarget = u; renderWalletSelected('request', u);
      elements.walletRequestResults.innerHTML = ''; elements.walletRequestSearch.value = '';
      updateWalletRequestButton();
    });
  });
  on(elements.walletRequestAmount, 'input', updateWalletRequestButton);
  document.querySelectorAll('.wallet-quick-amounts button[data-ramt]').forEach(b => {
    b.addEventListener('click', () => {
      elements.walletRequestAmount.value = b.dataset.ramt;
      updateWalletRequestButton();
    });
  });
  on(elements.walletRequestBtn, 'click', doRequestMoney);

  on(elements.walletHistoryFilter, 'click', e => {
    const b = e.target.closest('button[data-hf]'); if (!b) return;
    walletHistoryFilter = b.dataset.hf;
    elements.walletHistoryFilter.querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b));
    renderWalletHistory();
  });
  on(elements.walletDownloadCsvBtn, 'click', downloadWalletCsv);

  on(elements.walletDepositMsgAdminBtn, 'click', walletMessageAdminForDeposit);
  const peerBtn = document.getElementById('walletDepositPeerBtn');
  on(peerBtn, 'click', walletMessagePeerForDeposit);
  on(elements.walletDepositFile, 'change', e => {
    const f = e.target.files[0];
    if (!f) {
      walletDepositFile = null;
      elements.walletDepositFileName.textContent = '';
      elements.walletDepositPreview.innerHTML = '';
      elements.walletDepositPreview.classList.add('hidden');
      return;
    }
    if (f.size > 5 * 1024 * 1024) return showToast('Screenshot too large (max 5 MB).', 'error');
    walletDepositFile = f;
    elements.walletDepositFileName.textContent = f.name;
    const url = URL.createObjectURL(f);
    elements.walletDepositPreview.innerHTML = '<img src="' + url + '" alt="">';
    elements.walletDepositPreview.classList.remove('hidden');
  });
  on(elements.walletDepositBtn, 'click', submitWalletDeposit);

  // Withdraw options
  const withdrawMethods = document.querySelectorAll('[data-withdraw-method]');
  withdrawMethods.forEach(btn => {
    btn.addEventListener('click', () => {
      walletMessageAdminForWithdraw(btn.dataset.withdrawMethod);
    });
  });

  on(elements.moneyComposerBtn, 'click', () => {
    if (!currentConversation) return showToast('Open a chat first.', 'error');
    if (currentConversation.is_group) { openSplitBillModal(); return; }
    const other = currentParticipants.find(p => p.user_id !== currentUser.id);
    if (!other) return showToast('Cannot identify the other user.', 'error');
    getProfileCached(other.user_id).then(p => {
      if (!p) return showToast('User not found.', 'error');
      openWalletModal({ mode: 'dm', partner: p });
    });
  });
  on(elements.openWalletFromSettingsBtn, 'click', () => { closeSettingsModal(); openWalletModal({ mode: 'header' }); });

  on(elements.moneyConfirmClose, 'click', () => closeModal(elements.moneyConfirmModal));
  on(elements.moneyConfirmCancel, 'click', () => closeModal(elements.moneyConfirmModal));
  on(elements.moneyConfirmModal, 'click', e => { if (e.target === elements.moneyConfirmModal) closeModal(elements.moneyConfirmModal); });
  on(elements.moneyConfirmGo, 'click', doConfirmSend);

  on(elements.moneyReceiptClose, 'click', () => closeModal(elements.moneyReceiptModal));
  on(elements.moneyReceiptModal, 'click', e => { if (e.target === elements.moneyReceiptModal) closeModal(elements.moneyReceiptModal); });

  on(elements.splitBillClose, 'click', () => closeModal(elements.splitBillModal));
  on(elements.splitBillModal, 'click', e => { if (e.target === elements.splitBillModal) closeModal(elements.splitBillModal); });
  on(elements.splitBillTotal, 'input', updateSplitSummary);
  on(elements.splitBillMode, 'click', e => {
    const b = e.target.closest('button[data-smode]'); if (!b) return;
    splitBillState.mode = b.dataset.smode;
    elements.splitBillMode.querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b));
    updateSplitSummary();
  });
  on(elements.splitBillGo, 'click', doSplitBill);
  if (elements.splitSelectAll) {
    elements.splitSelectAll.addEventListener('click', () => {
      const allSelected = splitBillState.selected.size === splitBillState.members.length;
      splitBillState.selected = allSelected ? new Set() : new Set(splitBillState.members.map(m => m.id));
      renderSplitMembers();
    });
  }

  on(elements.tipClose, 'click', () => closeModal(elements.tipModal));
  on(elements.tipModal, 'click', e => { if (e.target === elements.tipModal) closeModal(elements.tipModal); });
  on(elements.tipAmount, 'input', updateTipFeePreview);
  on(elements.tipGo, 'click', sendTip);
  document.querySelectorAll('.wallet-quick-amounts button[data-tamt]').forEach(b => {
    b.addEventListener('click', () => { elements.tipAmount.value = b.dataset.tamt; updateTipFeePreview(); });
  });

  on(elements.adminReverseClose, 'click', () => closeModal(elements.adminReverseModal));
  on(elements.adminReverseModal, 'click', e => { if (e.target === elements.adminReverseModal) closeModal(elements.adminReverseModal); });
  on(elements.adminReverseGo, 'click', doAdminReverse);

  document.querySelectorAll('#contributeModal .wallet-quick-amounts button[data-camt]').forEach(b => {
    b.addEventListener('click', () => {
      if (elements.contributeAmount) {
        elements.contributeAmount.value = b.dataset.camt;
        updateContributeFeePreview();
      }
    });
  });
}

function walletShowMsg(el, text, type) {
  if (!el) return;
  el.textContent = text;
  el.classList.remove('hidden', 'error', 'success');
  if (type) el.classList.add(type);
}

/* =========================================================
   FUNDRAISER
   ========================================================= */
async function openCreateFundraiserModal() {
  if (!currentConversation || !currentConversation.is_group) {
    return showToast('Fundraisers are only for groups.', 'error');
  }
  currentFundraiser = null;
  elements.fundraiserModalTitle.textContent = '🎯 Start a fundraiser';
  elements.fundraiserBody.innerHTML = '';
  elements.fundraiserBody.appendChild(buildFundraiserForm());
  openModal(elements.fundraiserModal);
}

function buildFundraiserForm() {
  const wrap = document.createElement('div');
  wrap.innerHTML =
    '<div class="field">' +
      '<label for="fundraiserTitleInput">Title</label>' +
      '<input id="fundraiserTitleInput" type="text" maxlength="120" placeholder="e.g. Help John buy books">' +
    '</div>' +
    '<div class="field">' +
      '<label for="fundraiserDescInput">Description (optional)</label>' +
      '<textarea id="fundraiserDescInput" rows="3" maxlength="280" placeholder="Tell people why you are raising this..."></textarea>' +
    '</div>' +
    '<div class="field">' +
      '<label for="fundraiserGoalInput">Goal amount (₹)</label>' +
      '<input id="fundraiserGoalInput" type="number" min="1" step="1" inputmode="decimal" placeholder="0">' +
    '</div>' +
    '<div class="field">' +
      '<label for="fundraiserExpiryInput">Ends on (optional)</label>' +
      '<input id="fundraiserExpiryInput" type="date">' +
    '</div>' +
    '<button id="fundraiserCreateBtn" class="auth-submit" type="button">Create fundraiser</button>' +
    '<div id="fundraiserCreateMsg" class="auth-message hidden"></div>';

  setTimeout(() => {
    const btn = wrap.querySelector('#fundraiserCreateBtn');
    btn.addEventListener('click', async () => {
      const title = wrap.querySelector('#fundraiserTitleInput').value.trim();
      const description = wrap.querySelector('#fundraiserDescInput').value.trim();
      const goal = parseFloat(wrap.querySelector('#fundraiserGoalInput').value || 0);
      const expiryRaw = wrap.querySelector('#fundraiserExpiryInput').value;
      const msgEl = wrap.querySelector('#fundraiserCreateMsg');

      function setMsg(m, type) {
        msgEl.textContent = m;
        msgEl.classList.remove('hidden', 'error', 'success');
        if (type) msgEl.classList.add(type);
      }

      if (!title) return setMsg("Title is required.", "error");
      if (!(goal > 0)) return setMsg("Enter a valid goal amount.", "error");

      btn.disabled = true;
      btn.textContent = "Creating…";

      try {
        const { data, error } = await db.from('group_fundraisers').insert({
          conversation_id: currentConversation.id,
          created_by: currentUser.id,
          title,
          description: description || null,
          goal_amount: goal,
          expires_at: expiryRaw ? new Date(expiryRaw + "T23:59:59").toISOString() : null,
          is_active: true
        }).select().single();
        if (error) throw error;

        const creatorName = currentProfile ? (currentProfile.display_name || currentProfile.username) : "someone";
        await db.from("messages").insert({
          conversation_id: currentConversation.id,
          sender_id: currentUser.id,
          content: "🎯 Started a fundraiser: " + title,
          kind: 'fundraiser',
          meta: {
            fundraiser: {
              id: data.id,
              title: data.title,
              description: data.description,
              goal_amount: Number(data.goal_amount),
              raised_amount: Number(data.raised_amount),
              is_active: true,
              created_by: currentUser.id,
              creator_name: creatorName
            }
          }
        });

        setMsg("Created!", "success");
        showToast("🎯 Fundraiser created.", "success");
        setTimeout(() => {
          closeModal(elements.fundraiserModal);
          loadMessages();
        }, 500);
      } catch (e) {
        setMsg(friendlyError(e), "error");
        btn.disabled = false;
        btn.textContent = "Create fundraiser";
      }
    });
  }, 50);

  return wrap;
}

async function openFundraiserDetails(fundraiser) {
  if (!fundraiser || !fundraiser.id) return;
  elements.fundraiserModalTitle.textContent = '🎯 ' + (fundraiser.title || 'Fundraiser');
  elements.fundraiserBody.innerHTML = '<div class="search-empty">Loading…</div>';
  openModal(elements.fundraiserModal);

  try {
    const { data: f } = await db.from('group_fundraisers').select('*').eq('id', fundraiser.id).maybeSingle();
    const target = f || fundraiser;
    const creator = await getProfileCached(target.created_by);
    const creatorName = creator ? (creator.display_name || creator.username) : "Someone";

    const { data: contribs } = await db.from('fundraiser_contributions')
      .select('*').eq('fundraiser_id', target.id)
      .order('created_at', { ascending: false }).limit(50);

    const goal = Number(target.goal_amount || 0);
    const raised = Number(target.raised_amount || 0);
    const pct = goal > 0 ? Math.min(100, Math.round((raised / goal) * 100)) : 0;
    const isCreator = target.created_by === currentUser.id;
    const canContribute = target.is_active && !isCreator;

    const wrap = document.createElement("div");

    let contribHtml = '';
    if (contribs && contribs.length) {
      contribHtml = '<div class="chat-info-section-title">Recent contributions</div>';
      for (const c of contribs) {
        const p = await getProfileCached(c.contributor_id);
        const name = p ? (p.display_name || p.username) : "User";
        const initial = (name.charAt(0) || "U").toUpperCase();
        const displayName = c.is_anonymous ? "Anonymous" : name;
        const safeAvatar = (p && p.avatar_url && !c.is_anonymous) ? escapeStyleUrl(p.avatar_url) : "";
        contribHtml +=
          '<div class="chat-info-member">' +
            '<div class="avatar-small' + (p && p.is_premium && !c.is_anonymous ? ' premium-avatar' : '') + '"' +
              (safeAvatar ? ' style="background-image:url(\'' + safeAvatar + '\');color:transparent;"' : '') + '>' +
              escapeHtml(c.is_anonymous ? "?" : initial) + '</div>' +
            '<div class="chat-info-member-info"><strong>' + escapeHtml(displayName) + '</strong>' +
              '<span>₹' + formatMoney(c.amount) + ' • ' + formatListTime(c.created_at) + '</span></div>' +
          '</div>';
      }
    } else {
      contribHtml = '<div class="chat-info-section-title">Contributions</div><div class="ci-empty">No contributions yet. Be the first!</div>';
    }

    wrap.innerHTML =
      '<div class="fundraiser-card" style="margin:0 0 16px;">' +
        '<div class="fundraiser-head">' +
          '<div class="fundraiser-head-icon">🎯</div>' +
          '<div class="fundraiser-head-body">' +
            '<strong>' + escapeHtml(target.title) + '</strong>' +
            '<span>By ' + escapeHtml(creatorName) + ' • ' + formatListTime(target.created_at) + '</span>' +
          '</div>' +
        '</div>' +
        (target.description ? '<div style="font-size:13px;color:var(--text-muted);line-height:1.55;margin-bottom:12px;">' + escapeHtml(target.description) + '</div>' : '') +
        '<div class="fundraiser-progress">' +
          '<div class="fundraiser-progress-bar">' +
            '<div class="fundraiser-progress-fill" style="width:' + pct + '%"></div>' +
          '</div>' +
          '<div class="fundraiser-progress-meta">' +
            '<strong>₹' + formatMoney(raised) + '</strong>' +
            '<span>of ₹' + formatMoney(goal) + ' (' + pct + '%)</span>' +
          '</div>' +
        '</div>' +
        (canContribute ? '<div style="margin-top:12px;"><button id="frDetailsContributeBtn" class="fundraiser-btn primary" style="width:100%;" type="button">Contribute to this fundraiser</button></div>' : '') +
      '</div>' +
      contribHtml +
      '<div id="frDetailsMsg" class="auth-message hidden"></div>';

    elements.fundraiserBody.innerHTML = '';
    elements.fundraiserBody.appendChild(wrap);

    const btn = wrap.querySelector("#frDetailsContributeBtn");
    if (btn) {
      btn.addEventListener("click", () => {
        closeModal(elements.fundraiserModal);
        openContributeModal(target);
      });
    }
  } catch (e) {
    elements.fundraiserBody.innerHTML = '<div class="search-empty">Could not load fundraiser.</div>';
  }
}

function openContributeModal(fundraiser) {
  if (!fundraiser || !fundraiser.id) return;
  currentContributeFundraiser = fundraiser;

  const goal = Number(fundraiser.goal_amount || 0);
  const raised = Number(fundraiser.raised_amount || 0);
  const remaining = Math.max(0, goal - raised);

  elements.contributeHero.innerHTML =
    '<div class="ch-icon">🎯</div>' +
    '<h3>' + escapeHtml(fundraiser.title || "Fundraiser") + '</h3>' +
    '<p>₹' + formatMoney(raised) + ' raised of ₹' + formatMoney(goal) +
      (remaining > 0 ? ' • ₹' + formatMoney(remaining) + ' to go' : ' • Goal reached! 🎉') + '</p>';

  elements.contributeAmount.value = '';
  elements.contributeNote.value = '';
  elements.contributeAnonymous.checked = false;
  elements.contributeMsg.classList.add('hidden');
  elements.contributeMsg.classList.remove('error', 'success');
  updateContributeFeePreview();

  openModal(elements.contributeModal);
}

function updateContributeFeePreview() {
  const amt = parseFloat(elements.contributeAmount.value || 0);
  const preview = elements.contributeFeePreview;
  if (!preview) return;
  if (!amt || amt < WALLET_MIN_AMOUNT) {
    preview.classList.add("hidden");
    return;
  }
  const fee = calculateFeePreview(amt);
  const total = amt + fee;
  preview.classList.remove("hidden");
  preview.innerHTML =
    '<div class="wfp-row"><span>Contribution</span><strong>₹' + formatMoney(amt) + '</strong></div>' +
    '<div class="wfp-row"><span>Fee (' + currentFeePct() + '%)</span><strong>+₹' + formatMoney(fee) + '</strong></div>' +
    '<div class="wfp-row wfp-total"><span>You pay</span><strong>₹' + formatMoney(total) + '</strong></div>' +
    '<div class="wfp-note">Goes directly to the fundraiser</div>';
}

async function doContribute() {
  if (!currentContributeFundraiser) return;
  const amount = parseFloat(elements.contributeAmount.value || 0);
  const note = elements.contributeNote.value.trim();
  const isAnon = elements.contributeAnonymous.checked;

  if (!(amount >= WALLET_MIN_AMOUNT)) {
    return walletShowMsg(elements.contributeMsg, 'Enter a valid amount.', 'error');
  }

  const fee = calculateFeePreview(amount);
  const total = amount + fee;
  if (total > myWallet.balance) {
    return walletShowMsg(elements.contributeMsg, 'Not enough balance. Need ₹' + formatMoney(total) + '.', 'error');
  }

  elements.contributeGo.disabled = true;
  elements.contributeGo.textContent = 'Sending…';

  try {
    const fundraiserId = currentContributeFundraiser.id;
    const creatorId = currentContributeFundraiser.created_by;

    const txnRes = await sendMoneyRpc({
      toUserId: creatorId,
      amount: amount,
      note: 'Fundraiser: ' + (currentContributeFundraiser.title || ''),
      conversationId: currentContributeFundraiser.conversation_id || null
    });

    await db.from('fundraiser_contributions').insert({
      fundraiser_id: fundraiserId,
      contributor_id: currentUser.id,
      amount: amount,
      note: note || null,
      is_anonymous: isAnon,
      transaction_id: (txnRes && txnRes.transaction_id) ? txnRes.transaction_id : null
    });

    let raisedOk = false;
    try {
      const { data: rpcRes, error: rpcErr } = await db.rpc('increment_fundraiser_raised', {
        p_fundraiser_id: fundraiserId,
        p_amount: amount
      });
      if (!rpcErr && (!rpcRes || rpcRes.ok !== false)) raisedOk = true;
    } catch (e) {}

    if (!raisedOk) {
      try {
        const { data: contribs } = await db.from('fundraiser_contributions')
          .select('amount').eq('fundraiser_id', fundraiserId);
        const computedTotal = (contribs || []).reduce((a, c) => a + Number(c.amount || 0), 0);
        await db.from('group_fundraisers')
          .update({ raised_amount: computedTotal, updated_at: new Date().toISOString() })
          .eq('id', fundraiserId);
      } catch (e) {}
    }

    walletShowMsg(elements.contributeMsg, 'Thank you! 🎉', 'success');
    showToast('Contributed ₹' + formatMoney(amount) + '.', 'success');

    await refreshWalletData();
    if (typeof loadMessages === 'function') await loadMessages();
    setTimeout(() => closeModal(elements.contributeModal), 900);
  } catch (e) {
    walletShowMsg(elements.contributeMsg, friendlyError(e), 'error');
  } finally {
    elements.contributeGo.disabled = false;
    elements.contributeGo.textContent = 'Contribute';
  }
}

/* =========================================================
   THEOGO
   ========================================================= */
function openTheogoModal() {
  currentTheogoSelection = null;
  if (elements.theogoSearchInput) elements.theogoSearchInput.value = "";
  if (elements.theogoResults) elements.theogoResults.innerHTML = '<div class="theogo-empty">Type to search the TheoGo wiki…</div>';
  if (elements.theogoSelected) { elements.theogoSelected.classList.add("hidden"); elements.theogoSelected.innerHTML = ""; }
  if (elements.theogoActions) elements.theogoActions.classList.add("hidden");
  if (elements.theogoMessage) { elements.theogoMessage.textContent = ""; elements.theogoMessage.classList.add("hidden"); }
  openModal(elements.theogoModal);
  setTimeout(() => elements.theogoSearchInput && elements.theogoSearchInput.focus(), 200);
}
function closeTheogoModal() {
  closeModal(elements.theogoModal);
  currentTheogoSelection = null;
}
async function runTheogoSearch() {
  const q = (elements.theogoSearchInput.value || "").trim();
  if (q.length < 1) {
    elements.theogoResults.innerHTML = '<div class="theogo-empty">Type to search…</div>';
    return;
  }
  elements.theogoSearchBtn.disabled = true;
  elements.theogoSearchBtn.textContent = "…";
  elements.theogoResults.innerHTML = '<div class="theogo-empty">Searching TheoGo Wiki…</div>';

  try {
    const params = new URLSearchParams({
      action: 'query', list: 'search', srsearch: q, srlimit: 15,
      srprop: 'snippet|titlesnippet', format: 'json', origin: '*'
    });
    const url = THEOGO_API_BASE + '?' + params.toString();
    const res = await fetch(url);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();

    if (data.error) throw new Error(data.error.info || "Search error");

    const results = (data.query && data.query.search) || [];
    if (!results.length) {
      elements.theogoResults.innerHTML = '<div class="theogo-empty">No results found on TheoGo.</div>';
      return;
    }

    elements.theogoResults.innerHTML = "";
    results.forEach(r => {
      const pageUrl = "https://theogo.miraheze.org/wiki/" + encodeURIComponent(r.title.replace(/\s+/g, '_'));
      const item = document.createElement("div");
      item.className = "theogo-result";
      const snippet = r.snippet || "";
      item.innerHTML =
        '<div class="theogo-result-head"><img src="' + THEOGO_LOGO_URL + '" alt="TG"><span>TheoGo Wiki</span></div>' +
        '<div class="theogo-result-title">' + escapeHtml(r.title) + '</div>' +
        '<div class="theogo-result-snippet">' + snippet + '</div>';
      item.addEventListener("click", () => selectTheogoResult({ title: r.title, url: pageUrl, snippet }));
      elements.theogoResults.appendChild(item);
    });
  } catch (e) {
    console.error("TheoGo search error", e);
    elements.theogoResults.innerHTML =
      '<div class="theogo-empty">Could not search TheoGo. ' +
      escapeHtml(e.message || "Please try again later.") + '</div>';
  } finally {
    elements.theogoSearchBtn.disabled = false;
    elements.theogoSearchBtn.textContent = "Search";
  }
}
function selectTheogoResult(result) {
  currentTheogoSelection = result;
  elements.theogoResults.querySelectorAll(".theogo-result").forEach(el => el.classList.remove("selected"));
  Array.from(elements.theogoResults.children).forEach(el => {
    const title = el.querySelector(".theogo-result-title");
    if (title && title.textContent === result.title) el.classList.add("selected");
  });

  elements.theogoSelected.classList.remove("hidden");
  elements.theogoSelected.innerHTML =
    '<div class="theogo-selected-icon"><img src="' + THEOGO_LOGO_URL + '" alt="TG"></div>' +
    '<div class="theogo-selected-body">' +
      '<strong>' + escapeHtml(result.title) + '</strong>' +
      '<a href="' + escapeHtml(result.url) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(result.url) + '</a>' +
    '</div>' +
    '<button type="button" class="theogo-selected-clear" aria-label="Clear">×</button>';

  elements.theogoSelected.querySelector(".theogo-selected-clear").addEventListener("click", () => {
    currentTheogoSelection = null;
    elements.theogoSelected.classList.add("hidden");
    elements.theogoSelected.innerHTML = "";
    elements.theogoActions.classList.add("hidden");
    elements.theogoResults.querySelectorAll(".theogo-result").forEach(el => el.classList.remove("selected"));
  });

  elements.theogoActions.classList.remove("hidden");
}
async function shareTheogoArticle() {
  if (!currentTheogoSelection) return showToast("Pick an article first.", "error");
  if (!currentConversation) {
    closeTheogoModal();
    return showToast("Open a chat first.", "error");
  }
  const sel = currentTheogoSelection;
  const content = "📖 " + sel.title + "\n" + sel.url;

  elements.theogoShareBtn.disabled = true;
  elements.theogoShareBtn.textContent = "Sharing…";

  try {
    const { error } = await db.from("messages").insert({
      conversation_id: currentConversation.id,
      sender_id: currentUser.id,
      content
    }).select().single();
    if (error) throw error;

    showToast("Article shared.", "success");
    closeTheogoModal();
    await loadMessages();
  } catch (e) {
    if (elements.theogoMessage) {
      elements.theogoMessage.textContent = friendlyError(e);
      elements.theogoMessage.classList.remove("hidden", "error", "success");
      elements.theogoMessage.classList.add("error");
    }
  } finally {
    elements.theogoShareBtn.disabled = false;
    elements.theogoShareBtn.textContent = "Share in chat";
  }
}

console.log('[JustGo] wallet.js loaded — v15');