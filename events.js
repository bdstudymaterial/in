/* =========================================================================
   JustGo — events.js (v10)
   Complete event system with edit, permissions, forward, tickets, reminders,
   avatar stacks, slash-command entry, and full a11y.
   ========================================================================= */
(function () {
  "use strict";
  if (window.JustGoEvents && window.JustGoEvents.__v10) return;

  var $  = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c];
    });
  };
  function fmtDate(iso) {
    var d = new Date(iso);
    return d.toLocaleString([], {
      weekday: "short", day: "numeric", month: "short",
      hour: "numeric", minute: "2-digit"
    });
  }
  function fmtShort(iso) {
    var d = new Date(iso);
    return d.toLocaleString([], { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  }
  function haptic() {
    try { if (navigator.vibrate) navigator.vibrate(8); } catch (e) {}
  }

  /* ---------- Icons (SVG) ---------- */
  function svg(name, size) {
    size = size || 20;
    var paths = {
      calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
      calendarPlus: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="12" y1="14" x2="12" y2="18"/><line x1="10" y1="16" x2="14" y2="16"/>',
      share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>',
      forward: '<polyline points="15 17 20 12 15 7"/><path d="M4 18v-2a4 4 0 0 1 4-4h12"/>',
      arrowRight: '<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>',
      close: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
      trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M10 11v6"/><path d="M14 11v6"/>',
      exit: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
      search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
      users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
      ticket: '<path d="M3 9a3 3 0 0 0 0 6v3a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3a3 3 0 0 1 0-6V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2z"/><line x1="9" y1="4" x2="9" y2="20" stroke-dasharray="2 3"/>',
      pin: '<path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/>',
      clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
      money: '<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
      check: '<polyline points="20 6 9 17 4 12"/>',
      checkCircle: '<circle cx="12" cy="12" r="10"/><polyline points="9 12 12 15 16 10"/>',
      ban: '<circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>',
      alert: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
      lock: '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
      edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4z"/>',
      more: '<circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/><circle cx="5" cy="12" r="1.5"/>',
      bell: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
      bellOff: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/><line x1="3" y1="3" x2="21" y2="21"/>',
      copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
      qr: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>',
      duplicate: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
      info: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
      sparkle: '<path d="M12 2l2.09 6.26L20 10l-5.91 1.74L12 18l-2.09-6.26L4 10l5.91-1.74z"/>'
    };
    return '<svg viewBox="0 0 24 24" width="' + size + '" height="' + size +
      '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      (paths[name] || "") + '</svg>';
  }

  /* ---------- Live client ---------- */
  function hasDb() {
    return !!(window.db && typeof window.db.from === "function" && typeof window.db.rpc === "function");
  }
  function db() {
    if (hasDb()) return Promise.resolve(window.db);
    return new Promise(function (resolve, reject) {
      var tries = 0;
      var iv = setInterval(function () {
        if (hasDb()) { clearInterval(iv); resolve(window.db); return; }
        if (++tries > 150) {
          clearInterval(iv);
          reject(new Error("JustGo is still loading. Please refresh."));
        }
      }, 100);
    });
  }
  function currentUser()    { return window.currentUser    || null; }
  function currentProfile() { return window.currentProfile || null; }
  function currentConv()    { return window.currentConversation || null; }
  function toast(msg, type) {
    if (typeof window.showToast === "function") window.showToast(msg, type);
    else console.log("[events]", msg);
  }
  function confirmAsync(opts) {
    if (typeof window.JGConfirm === "function") return window.JGConfirm(opts);
    return Promise.resolve(window.confirm(opts.title || opts.body || ""));
  }

  /* =====================================================================
     PERMISSIONS
     ===================================================================== */
  function resolvePermissions(ev, invite, me) {
    var isOwner = !!(me && ev && ev.owner_id === me.id);
    var isGoing = !!(invite && invite.status === "going");
    var isInvited = !!invite;
    var isCancelled = !!(ev && ev.is_cancelled);

    var hasAccess = false;
    if (ev) {
      if (isOwner) hasAccess = true;
      else if (ev.visibility === "public") hasAccess = true;
      else if (ev.visibility === "invite") hasAccess = isInvited;
      else if (ev.visibility === "course") {
        hasAccess = !!(me && currentProfile() && currentProfile().course === ev.course);
      }
    }

    var canShare = false;
    if (ev && hasAccess && !isCancelled) {
      if (isOwner) canShare = true;
      else if (ev.visibility === "public" || ev.visibility === "course") canShare = true;
      else if (ev.visibility === "invite" && isInvited) canShare = true;
    }

    return {
      hasAccess: hasAccess,
      isOwner: isOwner,
      isGoing: isGoing,
      isInvited: isInvited,
      isCancelled: isCancelled,
      canShare: canShare,
      canCancelRefund: isOwner && !isCancelled && ev && ev.is_paid,
      canDelete: isOwner && !isCancelled,
      canEdit: isOwner && !isCancelled,
      canDuplicate: isOwner,
      canLeave: !isOwner && isGoing && !isCancelled,
      canRsvp: hasAccess && !isOwner && !isGoing && !isCancelled,
      canManageAttendees: isOwner
    };
  }

  function serializeEvent(ev) {
    if (!ev) return null;
    return {
      id: ev.id, title: ev.title, description: ev.description, location: ev.location,
      starts_at: ev.starts_at, ends_at: ev.ends_at, is_public: ev.is_public,
      visibility: ev.visibility, is_paid: ev.is_paid,
      ticket_price: Number(ev.ticket_price || 0),
      owner_id: ev.owner_id, capacity: ev.capacity,
      reminder_minutes_before: ev.reminder_minutes_before,
      conversation_id: ev.conversation_id, course: ev.course,
      is_cancelled: !!ev.is_cancelled
    };
  }

  async function getEventFull(id) {
    var c = await db();
    var r = await c.from("events").select("*").eq("id", id).maybeSingle();
    return r.error ? null : r.data;
  }
  async function getMyInvite(eventId, userId) {
    var c = await db();
    var r = await c.from("event_invitees").select("*").eq("event_id", eventId).eq("user_id", userId).maybeSingle();
    return r.error ? null : r.data;
  }
  async function getGoing(eventId) {
    var c = await db();
    var r = await c.from("event_invitees").select("user_id,status,paid")
      .eq("event_id", eventId).eq("status", "going");
    return r.data || [];
  }

  function reminderKey(eventId) { return "jg_event_reminder_" + eventId; }
  function hasReminder(eventId) {
    try { return !!localStorage.getItem(reminderKey(eventId)); } catch (e) { return false; }
  }
  function setReminder(eventId, on) {
    try {
      if (on) localStorage.setItem(reminderKey(eventId), "1");
      else localStorage.removeItem(reminderKey(eventId));
    } catch (e) {}
  }

  /* =====================================================================
     INJECTIONS
     ===================================================================== */
  function injectComposer() {
    var dropup = document.getElementById("composerDropup");
    if (!dropup) return false;
    if (dropup.querySelector('button[data-action="event"]')) return true;
    var btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.action = "event";
    btn.innerHTML =
      '<span class="cd-ic" style="background:rgba(22,82,196,.12);color:#1652c4;">' +
        svg("calendarPlus", 20) +
      '</span>' +
      '<span class="cd-txt"><strong>Event</strong><span>Create, share or manage</span></span>';
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      dropup.classList.add("hidden");
      openEventHub();
    });
    dropup.appendChild(btn);
    return true;
  }

  function injectCalendarMenu() {
    var menu = document.getElementById("sidebarMenu");
    if (!menu) return false;
    if (menu.querySelector('button[data-menu="calendar"]')) return true;
    var btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.menu = "calendar";
    btn.innerHTML =
      '<span class="sm-ic">' + svg("calendar", 17) + '</span>' +
      '<span class="sm-txt"><strong>Calendar</strong><span>Events, RSVPs &amp; tickets</span></span>';
    btn.addEventListener("click", function () {
      menu.classList.add("hidden");
      openCalendarModal();
    });
    var after = menu.querySelector('button[data-menu="profile"]');
    if (after) after.insertAdjacentElement("afterend", btn);
    else menu.insertBefore(btn, menu.firstChild);
    return true;
  }

  /* Slash command: type "/event" in the composer to create an event */
  function injectSlashCommand() {
    var input = document.getElementById("messageInput");
    if (!input || input.__eventSlashHooked) return false;
    input.__eventSlashHooked = true;
    input.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" || e.shiftKey) return;
      if (input.value.trim().toLowerCase() === "/event") {
        e.preventDefault();
        input.value = "";
        if (typeof autoResizeTextarea === "function") autoResizeTextarea();
        openCreateEventModal();
      }
    });
    return true;
  }

  function hookBubble() {
    if (!window.buildMessageRow || window.buildMessageRow.__eventsHookedV10) return true;
    var orig = window.buildMessageRow;
    window.buildMessageRow = function (message, senderMap, showTime) {
      if (message && message.kind === "event" && message.meta && message.meta.event) {
        return buildEventRowAsync(message);
      }
      return orig.apply(this, arguments);
    };
    window.buildMessageRow.__eventsHookedV10 = true;
    return true;
  }

  /* =====================================================================
     EVENT HUB
     ===================================================================== */
  async function openEventHub() {
    var wrap = document.createElement("div");
    wrap.className = "jg-dialog-backdrop";
    wrap.innerHTML =
      '<div class="jg-dialog jg-dialog-wide" role="dialog" aria-modal="true">' +
        '<div class="jg-dialog-title">Events</div>' +
        '<div class="jg-dialog-body">' +
          '<button type="button" class="jg-btn-block primary" data-act="new">' +
            svg("calendarPlus", 18) + '<span>Create a new event</span>' +
          '</button>' +
          '<div class="jg-section-title">Upcoming events you can share</div>' +
          '<div id="eventHubList"><div class="jg-loading">Loading…</div></div>' +
        '</div>' +
        '<div class="jg-dialog-actions">' +
          '<button type="button" class="jg-dialog-btn ghost" data-act="cancel">Close</button>' +
          '<button type="button" class="jg-dialog-btn secondary" data-act="calendar">' +
            svg("calendar", 14) + ' Open calendar</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(wrap);
    wrap.addEventListener("click", function (e) { if (e.target === wrap) wrap.remove(); });
    $('[data-act="cancel"]', wrap).addEventListener("click", function () { wrap.remove(); });
    $('[data-act="calendar"]', wrap).addEventListener("click", function () {
      wrap.remove(); openCalendarModal();
    });
    $('[data-act="new"]', wrap).addEventListener("click", function () {
      wrap.remove(); openCreateEventModal();
    });

    var listEl = $("#eventHubList", wrap);
    try {
      var c = await db();
      var u = currentUser();
      if (!u) { listEl.innerHTML = '<div class="jg-empty">Sign in first.</div>'; return; }
      var nowIso = new Date().toISOString();
      var res = await c.from("events")
        .select("*").or("owner_id.eq." + u.id + ",visibility.eq.public")
        .gte("starts_at", nowIso)
        .order("starts_at", { ascending: true }).limit(20);
      var evs = res.data || [];
      if (!evs.length) {
        listEl.innerHTML =
          '<div class="jg-empty-illustrated">' +
            '<div class="jg-empty-ic">' + svg("sparkle", 34) + '</div>' +
            '<strong>No upcoming events</strong>' +
            '<span>Create one to share with this chat.</span>' +
            '<button type="button" class="jg-btn-block primary" style="margin-top:10px;" data-act="empty-new">' +
              svg("calendarPlus", 16) + '<span>Create event</span></button>' +
          '</div>';
        var emptyNew = listEl.querySelector('[data-act="empty-new"]');
        if (emptyNew) emptyNew.addEventListener("click", function () {
          wrap.remove(); openCreateEventModal();
        });
        return;
      }

      var ids = evs.map(function (e) { return e.id; });
      var countRes = await c.from("event_invitees")
        .select("event_id").in("event_id", ids).eq("status", "going");
      var countMap = {};
      (countRes.data || []).forEach(function (r) {
        countMap[r.event_id] = (countMap[r.event_id] || 0) + 1;
      });

      listEl.innerHTML = "";
      evs.forEach(function (ev) {
        var going = countMap[ev.id] || 0;
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "jg-event-hub-row";
        btn.innerHTML =
          '<div class="jg-ehr-ic">' + svg("calendar", 18) + '</div>' +
          '<div class="jg-ehr-body">' +
            '<div class="jg-ehr-line1">' +
              '<strong>' + esc(ev.title) + '</strong>' +
              (ev.is_paid
                ? '<span class="jg-ehr-price">₹' + Number(ev.ticket_price).toFixed(0) + '</span>'
                : '<span class="jg-ehr-price free">Free</span>') +
            '</div>' +
            '<span class="jg-ehr-line2">' +
              svg("clock", 11) + ' ' + esc(fmtShort(ev.starts_at)) +
              (ev.location ? ' · ' + esc(ev.location) : '') +
            '</span>' +
            (going > 0 ? '<span class="jg-ehr-line3">' + svg("users", 11) + ' ' + going + ' going</span>' : '') +
          '</div>' +
          '<span class="jg-ehr-arrow">' + svg("arrowRight", 16) + '</span>';
        btn.addEventListener("click", function () {
          wrap.remove();
          openShareEventPicker(ev);
        });
        listEl.appendChild(btn);
      });
    } catch (e) {
      listEl.innerHTML = '<div class="jg-empty">Could not load events: ' + esc(e.message || "") + '</div>';
    }
  }

  /* =====================================================================
     CREATE / EDIT EVENT
     ===================================================================== */
  var _selectedUsers = [];

  function buildEventFormFields(data) {
    data = data || {};
    var isGroup = !!(currentConv() && currentConv().is_group);
    var vis = data.visibility === "invite" && data._selectedOnly ? "selected" : (data.visibility || "invite");
    return (
      '<div class="jg-field"><label for="evTitle">Title</label>' +
        '<input id="evTitle" maxlength="120" type="text" placeholder="e.g. Hebrew study circle" autocomplete="off" value="' + esc(data.title || "") + '">' +
      '</div>' +
      '<div class="jg-field"><label for="evWhen">When</label>' +
        '<input id="evWhen" type="datetime-local">' +
      '</div>' +
      '<div class="jg-field"><label for="evWhere">Where (optional)</label>' +
        '<input id="evWhere" maxlength="120" type="text" placeholder="Room, address, or link" autocomplete="off" value="' + esc(data.location || "") + '">' +
      '</div>' +
      '<div class="jg-field"><label for="evDesc">About this event</label>' +
        '<textarea id="evDesc" rows="4" maxlength="600" placeholder="What will happen? Who is it for?">' + esc(data.description || "") + '</textarea>' +
      '</div>' +
      '<div class="jg-field"><label for="evVis">Who can see this?</label>' +
        '<select id="evVis">' +
          '<option value="invite"' + (vis === "invite" ? " selected" : "") + '>Invite only — people I pick</option>' +
          '<option value="public"' + (vis === "public" ? " selected" : "") + '>Public — anyone on JustGo</option>' +
          (isGroup ? '' : '<option value="course"' + (vis === "course" ? " selected" : "") + '>My course (' + esc((currentProfile() && currentProfile().course) || 'course') + ')</option>') +
          '<option value="selected"' + (vis === "selected" ? " selected" : "") + '>Selected people only</option>' +
        '</select>' +
      '</div>' +
      '<div class="jg-field" id="evSelectedWrap" style="display:' + (vis === "selected" ? "block" : "none") + ';">' +
        '<label>Pick people</label>' +
        '<div class="jg-chip-search-wrap">' +
          svg("search", 16) +
          '<input type="text" id="evUserSearch" placeholder="Search @username or name…" autocomplete="off">' +
        '</div>' +
        '<div id="evUserResults" class="jg-share-results"></div>' +
        '<div id="evUserChips" class="jg-share-chips"></div>' +
      '</div>' +
      '<div class="jg-field"><label for="evCapacity">Capacity (optional)</label>' +
        '<input id="evCapacity" type="number" min="1" step="1" placeholder="e.g. 20" value="' + (data.capacity || "") + '">' +
      '</div>' +
      '<label class="jg-check"><input type="checkbox" id="evPaid"' + (data.is_paid ? " checked" : "") + '><span>Paid ticket</span></label>' +
      '<div class="jg-field jg-reveal" id="evPriceWrap" style="display:' + (data.is_paid ? "block" : "none") + ';">' +
        '<label for="evPrice">Price per ticket (₹)</label>' +
        '<input id="evPrice" type="number" min="1" step="1" placeholder="0" value="' + (data.ticket_price || "") + '">' +
      '</div>' +
      '<div class="jg-field"><label for="evRemind">Default reminder</label>' +
        '<select id="evRemind">' +
          '<option value="15"' + (data.reminder_minutes_before === 15 ? " selected" : "") + '>15 min before</option>' +
          '<option value="60"' + (!data.reminder_minutes_before || data.reminder_minutes_before === 60 ? " selected" : "") + '>1 hour before</option>' +
          '<option value="1440"' + (data.reminder_minutes_before === 1440 ? " selected" : "") + '>1 day before</option>' +
        '</select>' +
      '</div>' +
      (isGroup && !data.id
        ? '<label class="jg-check"><input type="checkbox" id="evShareChat" checked><span>Post event card in this chat</span></label>'
        : '') +
      '<div id="evStatus" class="jg-dialog-status" style="display:none;"></div>'
    );
  }

  function openCreateEventModal(prefill) {
    prefill = prefill || {};
    _selectedUsers = [];
    openEventFormModal({ mode: "create", data: prefill });
  }

  function openEditEventModal(ev) {
    _selectedUsers = [];
    openEventFormModal({ mode: "edit", data: ev, id: ev.id });
  }

  function openEventFormModal(opts) {
    var isEdit = opts.mode === "edit";
    var data = opts.data || {};
    var wrap = document.createElement("div");
    wrap.className = "jg-dialog-backdrop";
    wrap.innerHTML =
      '<div class="jg-dialog jg-dialog-wide" role="dialog" aria-modal="true">' +
        '<div class="jg-dialog-title">' + (isEdit ? "Edit event" : "Create event") + '</div>' +
        '<div class="jg-dialog-body">' +
          buildEventFormFields(data) +
        '</div>' +
        '<div class="jg-dialog-actions">' +
          '<button type="button" class="jg-dialog-btn ghost" data-act="cancel">Cancel</button>' +
          '<button type="button" class="jg-dialog-btn primary" data-act="ok">' +
            (isEdit ? "Save changes" : "Create event") + '</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(wrap);

    var when = $("#evWhen", wrap);
    var base = data.starts_at ? new Date(data.starts_at) : new Date(Date.now() + 3600 * 1000);
    when.value = new Date(base.getTime() - base.getTimezoneOffset() * 60000)
      .toISOString().slice(0, 16);

    $("#evPaid", wrap).addEventListener("change", function (e) {
      $("#evPriceWrap", wrap).style.display = e.target.checked ? "" : "none";
    });
    $("#evVis", wrap).addEventListener("change", function (e) {
      $("#evSelectedWrap", wrap).style.display = e.target.value === "selected" ? "" : "none";
    });

    var searchInp = $("#evUserSearch", wrap);
    var resultsBox = $("#evUserResults", wrap);
    var chipsBox = $("#evUserChips", wrap);
    var st = null;

    function renderChips() {
      chipsBox.innerHTML = "";
      _selectedUsers.forEach(function (u) {
        var chip = document.createElement("span");
        chip.className = "jg-share-chip";
        chip.innerHTML = '<span>@' + esc(u.username) + '</span>';
        var x = document.createElement("button");
        x.type = "button";
        x.innerHTML = svg("close", 11);
        x.setAttribute("aria-label", "Remove " + u.username);
        x.addEventListener("click", function () {
          _selectedUsers = _selectedUsers.filter(function (v) { return v.id !== u.id; });
          renderChips();
        });
        chip.appendChild(x);
        chipsBox.appendChild(chip);
      });
    }

    searchInp.addEventListener("input", function () {
      clearTimeout(st);
      var q = searchInp.value.trim().toLowerCase();
      if (!q) { resultsBox.innerHTML = ""; return; }
      st = setTimeout(async function () {
        try {
          var c = await db();
          var u = currentUser();
          var r = await c.from("profiles")
            .select("id, username, display_name, avatar_url, is_premium")
            .neq("id", u.id).ilike("username", "%" + q + "%").limit(8);
          var r2 = await c.from("profiles")
            .select("id, username, display_name, avatar_url, is_premium")
            .neq("id", u.id).ilike("display_name", "%" + q + "%").limit(8);
          var seen = {}, list = [];
          (r.data || []).concat(r2.data || []).forEach(function (p) {
            if (!seen[p.id]) { seen[p.id] = 1; list.push(p); }
          });
          resultsBox.innerHTML = "";
          var alreadyIds = _selectedUsers.map(function (v) { return v.id; });
          list.forEach(function (p) {
            if (alreadyIds.indexOf(p.id) >= 0) return;
            var row = document.createElement("button");
            row.type = "button";
            row.className = "jg-share-result-row";
            row.innerHTML =
              '<strong>' + esc(p.display_name || p.username) + '</strong>' +
              '<span>@' + esc(p.username) + '</span>';
            row.addEventListener("click", function () {
              _selectedUsers.push(p);
              renderChips();
              resultsBox.innerHTML = "";
              searchInp.value = "";
            });
            resultsBox.appendChild(row);
          });
        } catch (e) { resultsBox.innerHTML = '<div class="jg-empty">Search failed.</div>'; }
      }, 220);
    });

    var statusEl = $("#evStatus", wrap);
    function setStatus(msg, kind) {
      if (!msg) { statusEl.style.display = "none"; statusEl.textContent = ""; return; }
      statusEl.textContent = msg;
      statusEl.style.display = "";
      statusEl.dataset.kind = kind || "error";
    }
    function close() { wrap.remove(); }
    wrap.addEventListener("click", function (e) { if (e.target === wrap) close(); });
    $('[data-act="cancel"]', wrap).addEventListener("click", close);

    var okBtn = $('[data-act="ok"]', wrap);
    var submitting = false;

    okBtn.addEventListener("click", async function () {
      if (submitting) return;
      setStatus(null);
      var title = $("#evTitle", wrap).value.trim();
      var starts = $("#evWhen", wrap).value;
      if (!title) return setStatus("Please enter a title.");
      if (!starts) return setStatus("Please choose a date.");

      var paid = $("#evPaid", wrap).checked;
      var price = paid ? parseFloat($("#evPrice", wrap).value || "0") : 0;
      if (paid && !(price > 0)) return setStatus("Enter a ticket price greater than 0.");

      var capacityRaw = $("#evCapacity", wrap).value.trim();
      var capacity = capacityRaw ? parseInt(capacityRaw, 10) : null;
      if (capacityRaw && !(capacity > 0)) return setStatus("Capacity must be greater than 0.");

      var vis = $("#evVis", wrap).value;
      if (vis === "selected" && _selectedUsers.length === 0 && !isEdit) {
        return setStatus("Add at least one person for 'Selected people only'.");
      }

      var u = currentUser();
      if (!u) return setStatus("You're not signed in. Please refresh.");

      var c;
      try { c = await db(); } catch (err) { return setStatus(err.message || "Could not connect. Refresh."); }

      submitting = true;
      okBtn.disabled = true;
      okBtn.textContent = isEdit ? "Saving…" : "Creating…";

      var row = {
        title: title,
        description: $("#evDesc", wrap).value.trim() || null,
        location: $("#evWhere", wrap).value.trim() || null,
        starts_at: new Date(starts).toISOString(),
        is_public: vis === "public",
        visibility: vis === "selected" ? "invite" : vis,
        course: vis === "course" ? ((currentProfile() && currentProfile().course) || null) : null,
        capacity: capacity,
        is_paid: paid,
        ticket_price: price,
        currency: "INR",
        reminder_minutes_before: parseInt($("#evRemind", wrap).value || "60", 10)
      };

      try {
        var evRes;
        if (isEdit) {
          evRes = await c.from("events").update(row).eq("id", opts.id).select().single();
        } else {
          row.owner_id = u.id;
          var convId = null;
          if (currentConv() && currentConv().is_group && $("#evShareChat", wrap) && $("#evShareChat", wrap).checked) {
            convId = currentConv().id;
          }
          row.conversation_id = convId;
          evRes = await c.from("events").insert(row).select().single();
        }
        if (evRes.error) throw evRes.error;
        if (!evRes.data) throw new Error("Event was not saved.");

        /* Invitees on create */
        if (!isEdit && vis === "selected" && _selectedUsers.length) {
          var inviteRows = _selectedUsers.map(function (x) {
            return { event_id: evRes.data.id, user_id: x.id, status: "pending" };
          });
          try { await c.from("event_invitees").insert(inviteRows); } catch (e) {}
        }

        /* Post card if new in group chat */
        if (!isEdit && evRes.data.conversation_id) {
          try {
            var msgRes = await c.from("messages").insert({
              conversation_id: evRes.data.conversation_id,
              sender_id: u.id,
              content: "Shared an event: " + title,
              kind: "event",
              meta: { event: serializeEvent(evRes.data) }
            }).select().single();
            if (!msgRes.error && msgRes.data) {
              await c.from("events").update({ message_id: msgRes.data.id }).eq("id", evRes.data.id);
            }
          } catch (e) {}
        }

        toast(isEdit ? "Event updated." : "Event created.", "success");
        close();
      } catch (err) {
        var msg = (err && err.message) || String(err);
        if (/row-level security/i.test(msg))     msg = "Permission denied. Refresh and try again.";
        else if (/violates not-null/i.test(msg)) msg = "Some fields are missing. Fill everything again.";
        else if (/Failed to fetch/i.test(msg))   msg = "Network error. Check your connection.";
        setStatus("Could not save event: " + msg);
      } finally {
        submitting = false;
        okBtn.disabled = false;
        okBtn.textContent = isEdit ? "Save changes" : "Create event";
      }
    });
  }

  /* =====================================================================
     SHARE PICKER + FORWARD
     ===================================================================== */
  function openShareEventPicker(ev) {
    var wrap = document.createElement("div");
    wrap.className = "jg-dialog-backdrop";
    wrap.innerHTML =
      '<div class="jg-dialog jg-dialog-wide" role="dialog" aria-modal="true">' +
        '<div class="jg-dialog-title">Share event</div>' +
        '<div class="jg-dialog-body">' +
          '<div class="jg-event-preview-inline">' +
            '<div class="jg-ehr-ic">' + svg("calendar", 18) + '</div>' +
            '<div class="jg-ehr-body"><strong>' + esc(ev.title || "Event") + '</strong>' +
            '<span>' + esc(fmtDate(ev.starts_at)) + '</span></div>' +
          '</div>' +
          '<div class="jg-share-actions">' +
            '<button type="button" class="jg-share-action" data-act="forward">' +
              svg("forward", 18) + '<span>Forward</span></button>' +
            '<button type="button" class="jg-share-action" data-act="copy">' +
              svg("copy", 18) + '<span>Copy link</span></button>' +
            '<button type="button" class="jg-share-action" data-act="native">' +
              svg("share", 18) + '<span>Share…</span></button>' +
          '</div>' +
          '<div class="jg-section-title">Send to a chat</div>' +
          '<div class="jg-chip-search-wrap">' +
            svg("search", 16) +
            '<input type="text" id="shUserSearch" placeholder="Search people or group chats…" autocomplete="off">' +
          '</div>' +
          '<div id="shResults" class="jg-share-results"></div>' +
        '</div>' +
        '<div class="jg-dialog-actions">' +
          '<button type="button" class="jg-dialog-btn ghost" data-act="cancel">Close</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(wrap);
    wrap.addEventListener("click", function (e) { if (e.target === wrap) wrap.remove(); });
    $('[data-act="cancel"]', wrap).addEventListener("click", function () { wrap.remove(); });

    $('[data-act="copy"]', wrap).addEventListener("click", function () {
      var link = location.origin + "/?event=" + ev.id;
      if (navigator.clipboard) {
        navigator.clipboard.writeText(link).then(function () {
          toast("Event link copied.", "success");
        }, function () { toast("Could not copy.", "error"); });
      } else {
        toast(link, "success");
      }
    });

    $('[data-act="native"]', wrap).addEventListener("click", function () {
      var link = location.origin + "/?event=" + ev.id;
      if (navigator.share) {
        navigator.share({
          title: ev.title || "Event",
          text: "Join me at " + (ev.title || "this event") + " on JustGo",
          url: link
        }).catch(function () {});
      } else {
        toast(link, "success");
      }
    });

    $('[data-act="forward"]', wrap).addEventListener("click", function () {
      wrap.remove();
      forwardEventToPicker(ev);
    });

    var searchInp = $("#shUserSearch", wrap);
    var resultsBox = $("#shResults", wrap);
    var st = null;

    async function search(q) {
      q = q.trim().toLowerCase();
      if (!q) { resultsBox.innerHTML = ""; return; }
      try {
        var c = await db();
        var u = currentUser();
        if (!u) return;

        var r = await c.from("profiles")
          .select("id, username, display_name, avatar_url, is_premium")
          .neq("id", u.id).ilike("username", "%" + q + "%").limit(6);
        var r2 = await c.from("profiles")
          .select("id, username, display_name, avatar_url, is_premium")
          .neq("id", u.id).ilike("display_name", "%" + q + "%").limit(6);
        var seen = {}, list = [];
        (r.data || []).concat(r2.data || []).forEach(function (p) {
          if (!seen[p.id]) { seen[p.id] = 1; list.push(p); }
        });

        var mine = await c.from("conversation_participants")
          .select("conversation_id").eq("user_id", u.id);
        var groupList = [];
        if (mine.data && mine.data.length) {
          var ids = mine.data.map(function (x) { return x.conversation_id; });
          var gs = await c.from("conversations")
            .select("id, is_group, group_name, group_avatar_url")
            .in("id", ids).eq("is_group", true)
            .ilike("group_name", "%" + q + "%").limit(6);
          groupList = gs.data || [];
        }

        resultsBox.innerHTML = "";
        groupList.forEach(function (g) {
          var row = document.createElement("button");
          row.type = "button";
          row.className = "jg-share-result-row";
          var safeAv = g.group_avatar_url
            ? ' style="background-image:url(\'' + esc(g.group_avatar_url) + '\');background-size:cover;color:transparent;"'
            : "";
          row.innerHTML =
            '<div class="jg-share-avatar"' + safeAv + '>' +
              esc((g.group_name || "G").charAt(0).toUpperCase()) +
            '</div>' +
            '<div class="jg-share-meta">' +
              '<strong>' + esc(g.group_name || "Group") + '</strong>' +
              '<span>' + svg("users", 11) + ' Group chat</span>' +
            '</div>';
          row.addEventListener("click", function () {
            wrap.remove();
            shareEventToConversation(ev, g.id);
          });
          resultsBox.appendChild(row);
        });
        list.forEach(function (p) {
          var row = document.createElement("button");
          row.type = "button";
          row.className = "jg-share-result-row";
          var safeAv = p.avatar_url
            ? ' style="background-image:url(\'' + esc(p.avatar_url) + '\');background-size:cover;color:transparent;"'
            : "";
          row.innerHTML =
            '<div class="jg-share-avatar"' + safeAv + '>' +
              esc((p.display_name || p.username || "?").charAt(0).toUpperCase()) +
            '</div>' +
            '<div class="jg-share-meta">' +
              '<strong>' + esc(p.display_name || p.username) + '</strong>' +
              '<span>@' + esc(p.username) + '</span>' +
            '</div>';
          row.addEventListener("click", function () {
            wrap.remove();
            shareEventToUser(ev, p);
          });
          resultsBox.appendChild(row);
        });

        if (!resultsBox.children.length) {
          resultsBox.innerHTML = '<div class="jg-empty">No matches.</div>';
        }
      } catch (e) {
        resultsBox.innerHTML = '<div class="jg-empty">Search failed.</div>';
      }
    }

    searchInp.addEventListener("input", function () {
      clearTimeout(st);
      st = setTimeout(function () { search(searchInp.value); }, 220);
    });
    setTimeout(function () { searchInp.focus(); }, 60);
  }

  /* Forward Event sheet — separate from share so it feels like forwarding */
  function forwardEventToPicker(ev) {
    var wrap = document.createElement("div");
    wrap.className = "jg-dialog-backdrop";
    wrap.innerHTML =
      '<div class="jg-dialog jg-dialog-wide" role="dialog" aria-modal="true">' +
        '<div class="jg-dialog-title">Forward event</div>' +
        '<div class="jg-dialog-body">' +
          '<div class="jg-event-preview-inline">' +
            '<div class="jg-ehr-ic">' + svg("forward", 18) + '</div>' +
            '<div class="jg-ehr-body"><strong>' + esc(ev.title || "Event") + '</strong>' +
            '<span>' + esc(fmtDate(ev.starts_at)) + '</span></div>' +
          '</div>' +
          '<div class="jg-chip-search-wrap" style="margin-top:12px;">' +
            svg("search", 16) +
            '<input type="text" id="fwSearch" placeholder="Forward to a person or group…" autocomplete="off">' +
          '</div>' +
          '<div id="fwResults" class="jg-share-results"></div>' +
        '</div>' +
        '<div class="jg-dialog-actions">' +
          '<button type="button" class="jg-dialog-btn ghost" data-act="cancel">Cancel</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(wrap);
    wrap.addEventListener("click", function (e) { if (e.target === wrap) wrap.remove(); });
    $('[data-act="cancel"]', wrap).addEventListener("click", function () { wrap.remove(); });

    var searchInp = $("#fwSearch", wrap);
    var resultsBox = $("#fwResults", wrap);
    var st = null;

    async function search(q) {
      q = q.trim().toLowerCase();
      if (!q) { resultsBox.innerHTML = ""; return; }
      try {
        var c = await db();
        var u = currentUser();
        if (!u) return;
        var r = await c.from("profiles")
          .select("id, username, display_name, avatar_url, is_premium")
          .neq("id", u.id).ilike("username", "%" + q + "%").limit(6);
        var r2 = await c.from("profiles")
          .select("id, username, display_name, avatar_url, is_premium")
          .neq("id", u.id).ilike("display_name", "%" + q + "%").limit(6);
        var seen = {}, list = [];
        (r.data || []).concat(r2.data || []).forEach(function (p) {
          if (!seen[p.id]) { seen[p.id] = 1; list.push(p); }
        });
        var mine = await c.from("conversation_participants")
          .select("conversation_id").eq("user_id", u.id);
        var groupList = [];
        if (mine.data && mine.data.length) {
          var ids = mine.data.map(function (x) { return x.conversation_id; });
          var gs = await c.from("conversations")
            .select("id, is_group, group_name, group_avatar_url")
            .in("id", ids).eq("is_group", true)
            .ilike("group_name", "%" + q + "%").limit(6);
          groupList = gs.data || [];
        }
        resultsBox.innerHTML = "";
        groupList.forEach(function (g) {
          var row = document.createElement("button");
          row.type = "button";
          row.className = "jg-share-result-row";
          row.innerHTML =
            '<div class="jg-share-avatar">' + esc((g.group_name || "G").charAt(0).toUpperCase()) + '</div>' +
            '<div class="jg-share-meta"><strong>' + esc(g.group_name || "Group") + '</strong>' +
              '<span>' + svg("users", 11) + ' Group chat</span></div>';
          row.addEventListener("click", function () {
            wrap.remove(); shareEventToConversation(ev, g.id);
          });
          resultsBox.appendChild(row);
        });
        list.forEach(function (p) {
          var row = document.createElement("button");
          row.type = "button";
          row.className = "jg-share-result-row";
          row.innerHTML =
            '<div class="jg-share-avatar">' + esc((p.display_name || p.username || "?").charAt(0).toUpperCase()) + '</div>' +
            '<div class="jg-share-meta"><strong>' + esc(p.display_name || p.username) + '</strong>' +
              '<span>@' + esc(p.username) + '</span></div>';
          row.addEventListener("click", function () {
            wrap.remove(); shareEventToUser(ev, p);
          });
          resultsBox.appendChild(row);
        });
        if (!resultsBox.children.length) resultsBox.innerHTML = '<div class="jg-empty">No matches.</div>';
      } catch (e) { resultsBox.innerHTML = '<div class="jg-empty">Search failed.</div>'; }
    }

    searchInp.addEventListener("input", function () {
      clearTimeout(st);
      st = setTimeout(function () { search(searchInp.value); }, 220);
    });
    setTimeout(function () { searchInp.focus(); }, 60);
  }

  async function shareEventToUser(ev, otherUser) {
    try {
      var c = await db();
      var u = currentUser();
      if (!u) return;
      var mineRes = await c.from("conversation_participants")
        .select("conversation_id").eq("user_id", u.id);
      var conv = null;
      if (mineRes.data && mineRes.data.length) {
        var ids = mineRes.data.map(function (r) { return r.conversation_id; });
        var matches = await c.from("conversation_participants")
          .select("conversation_id").eq("user_id", otherUser.id).in("conversation_id", ids);
        if (matches.data && matches.data.length) {
          for (var i = 0; i < matches.data.length; i++) {
            var cc = await c.from("conversations")
              .select("*").eq("id", matches.data[i].conversation_id).maybeSingle();
            if (cc.data && !cc.data.is_group) { conv = cc.data; break; }
          }
        }
      }
      if (!conv) {
        var nc = await c.from("conversations").insert({
          user_a_id: u.id, user_b_id: otherUser.id, created_by: u.id, is_group: false
        }).select().single();
        if (nc.error) throw nc.error;
        conv = nc.data;
        await c.from("conversation_participants").insert([
          { conversation_id: conv.id, user_id: u.id, role: "member" },
          { conversation_id: conv.id, user_id: otherUser.id, role: "member" }
        ]);
      }
      await c.from("messages").insert({
        conversation_id: conv.id, sender_id: u.id,
        content: "Shared an event: " + (ev.title || "Event"),
        kind: "event", meta: { event: serializeEvent(ev) }
      });
      await c.from("conversations").update({
        last_message_preview: "Event: " + (ev.title || ""),
        last_message_at: new Date().toISOString(),
        last_message_sender_id: u.id
      }).eq("id", conv.id);
      try {
        await c.from("event_invitees").upsert(
          { event_id: ev.id, user_id: otherUser.id, status: "pending" },
          { onConflict: "event_id,user_id" }
        );
      } catch (e) {}
      try {
        if (typeof window.bumpConversationToTop === "function") window.bumpConversationToTop(conv.id);
        if (typeof window.loadConversationsDebounced === "function") window.loadConversationsDebounced();
      } catch (e) {}
      toast("Event shared with @" + otherUser.username + ".", "success");
    } catch (e) { toast("Could not share: " + (e.message || e), "error"); }
  }

  async function shareEventToConversation(ev, conversationId) {
    try {
      var c = await db();
      var u = currentUser();
      if (!u) return;
      await c.from("messages").insert({
        conversation_id: conversationId, sender_id: u.id,
        content: "Shared an event: " + (ev.title || "Event"),
        kind: "event", meta: { event: serializeEvent(ev) }
      });
      await c.from("conversations").update({
        last_message_preview: "Event: " + (ev.title || ""),
        last_message_at: new Date().toISOString(),
        last_message_sender_id: u.id
      }).eq("id", conversationId);
      try {
        if (typeof window.bumpConversationToTop === "function") window.bumpConversationToTop(conversationId);
        if (typeof window.loadConversationsDebounced === "function") window.loadConversationsDebounced();
      } catch (e) {}
      toast("Event shared.", "success");
    } catch (e) { toast("Could not share: " + (e.message || e), "error"); }
  }

  /* =====================================================================
     EVENT CARD in chat
     ===================================================================== */
  async function buildEventRowAsync(message) {
    var ev = message.meta.event;
    var row = document.createElement("div");
    row.className = "message-row event-row";
    row.dataset.messageId = message.id || "";
    row.dataset.createdAt = message.created_at || new Date().toISOString();

    var state = { mine: null, goingList: [], permissions: null, eventDeleted: false, currentEv: ev };
    try {
      var c = await db();
      var u = currentUser();
      var evRes = await c.from("events").select("*").eq("id", ev.id).maybeSingle();
      var invRes = u
        ? await c.from("event_invitees").select("status,paid").eq("event_id", ev.id).eq("user_id", u.id).maybeSingle()
        : { data: null };
      var goingList = await getGoing(ev.id);

      if (!evRes.data || evRes.data.is_cancelled) {
        state.eventDeleted = true;
      } else {
        state.currentEv = evRes.data;
        state.mine = invRes.data || null;
        state.goingList = goingList;
        state.permissions = resolvePermissions(evRes.data, invRes.data || null, u);
      }
    } catch (e) {}

    renderEventCardInto(row, state);
    return row;
  }

  function renderEventCardInto(row, state) {
    var ev = state.currentEv;
    var whenStr = fmtDate(ev.starts_at);
    var price = ev.is_paid ? Number(ev.ticket_price || 0) : 0;
    var perms = state.permissions || resolvePermissions(ev, state.mine, currentUser());
    var mine = state.mine || null;
    var iAmGoing = mine && mine.status === "going";
    var iAmPaid = iAmGoing && mine.paid;
    var isFull = ev.capacity && state.goingList.length >= ev.capacity && !perms.isOwner;
    var isCancelled = !!(state.eventDeleted || (ev && ev.is_cancelled));
    var hasRem = hasReminder(ev.id);

    if (!perms.hasAccess && !isCancelled) {
      row.innerHTML =
        '<div class="message-bubble event-bubble event-private">' +
          '<div class="event-card-head">' +
            '<div class="event-card-icon event-lock-icon">' + svg("lock", 22) + '</div>' +
            '<div class="event-card-head-body">' +
              '<strong>Private event</strong>' +
              '<span>Only invited people can view this event.</span>' +
            '</div>' +
          '</div>' +
        '</div>';
      return;
    }

    /* Avatar stack */
    var stackHtml = "";
    if (state.goingList.length) {
      var visible = state.goingList.slice(0, 3);
      stackHtml =
        '<div class="event-avatar-stack">' +
          visible.map(function () {
            return '<div class="eas-bubble"></div>';
          }).join("") +
          (state.goingList.length > 3
            ? '<span class="eas-count">+' + (state.goingList.length - 3) + ' going</span>'
            : '<span class="eas-count">' + state.goingList.length + ' going</span>') +
        '</div>';
    }

    /* Pills */
    var pills = '';
    if (isCancelled) pills += '<span class="ev-pill cancelled">' + svg("ban", 11) + ' Cancelled</span>';
    else {
      if (iAmPaid) pills += '<span class="ev-pill paid">' + svg("checkCircle", 11) + ' Paid</span>';
      else if (iAmGoing) pills += '<span class="ev-pill going">' + svg("check", 11) + ' Going</span>';
      if (perms.isOwner) pills += '<span class="ev-pill owner">' + svg("users", 11) + ' You created</span>';
      if (isFull) pills += '<span class="ev-pill full">' + svg("alert", 11) + ' Full</span>';
    }

    /* Primary CTA */
    var btnHtml;
    if (isCancelled) {
      btnHtml = '<button type="button" class="event-card-btn" disabled>' + svg("ban", 14) + ' Cancelled</button>';
    } else if (iAmGoing) {
      btnHtml = '<button type="button" class="event-card-btn ticket-success" data-act="view-ticket">' +
        svg("qr", 14) + ' View Ticket</button>';
    } else if (isFull) {
      btnHtml = '<button type="button" class="event-card-btn" disabled>' + svg("alert", 14) + ' Full</button>';
    } else if (perms.canRsvp) {
      btnHtml = '<button type="button" class="event-card-btn going" data-act="going">' +
        (ev.is_paid ? svg("ticket", 14) + ' Pay ₹' + price.toFixed(0) : svg("check", 14) + ' Going') +
      '</button>';
    } else if (perms.isOwner) {
      btnHtml = '<button type="button" class="event-card-btn owner-badge" disabled>' +
        svg("users", 14) + ' You created</button>';
    } else {
      btnHtml = '<button type="button" class="event-card-btn" disabled>' + svg("lock", 14) + ' Invite only</button>';
    }

    row.innerHTML =
      '<div class="message-bubble event-bubble' + (isCancelled ? ' event-deleted event-cancelled' : '') + '">' +
        '<div class="event-card-head">' +
          '<div class="event-card-icon">' + svg("calendar", 22) + '</div>' +
          '<div class="event-card-head-body">' +
            '<strong>' + esc(ev.title || "Event") + '</strong>' +
            '<span>' + esc(whenStr) + (ev.location ? " · " + esc(ev.location) : "") + '</span>' +
          '</div>' +
          (hasRem ? '<button type="button" class="event-reminder-badge" data-act="reminder" title="Reminder on">' +
            svg("bell", 14) + '</button>' : '') +
        '</div>' +
        (pills ? '<div class="event-pills">' + pills + '</div>' : '') +
        stackHtml +
        (ev.description ? '<div class="event-card-desc">' + esc(ev.description) + '</div>' : '') +
        '<div class="event-card-foot">' +
          (ev.is_paid
            ? '<span class="event-card-price">' + svg("money", 13) + ' ₹' + price.toFixed(0) + '</span>'
            : '<span class="event-card-free">' + svg("check", 12) + ' Free</span>') +
          '<div class="event-card-actions">' +
            btnHtml +
            '<button type="button" class="event-card-btn icon-only" data-act="reminder" title="' +
              (hasRem ? 'Turn off reminder' : 'Remind me') + '">' +
              (hasRem ? svg("bell", 14) : svg("bellOff", 14)) +
            '</button>' +
            '<button type="button" class="event-card-btn icon-only" data-act="share" title="Share">' +
              svg("share", 14) + '</button>' +
            '<button type="button" class="event-card-btn" data-act="details">Details</button>' +
          '</div>' +
        '</div>' +
      '</div>';

    /* Wire actions */
    var goingBtn = row.querySelector('[data-act="going"]');
    if (goingBtn) goingBtn.addEventListener("click", async function (e) {
      e.stopPropagation();
      haptic();
      goingBtn.disabled = true;
      var prev = goingBtn.innerHTML;
      goingBtn.textContent = "Working…";
      var ok = await rsvpEvent(ev.id);
      if (!ok) { goingBtn.disabled = false; goingBtn.innerHTML = prev; return; }
      await refreshCard(row, state);
    });

    var ticketBtn = row.querySelector('[data-act="view-ticket"]');
    if (ticketBtn) ticketBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      openTicketModal(ev, state.mine);
    });

    var remBtns = row.querySelectorAll('[data-act="reminder"]');
    remBtns.forEach(function (b) {
      b.addEventListener("click", function (e) {
        e.stopPropagation();
        var on = !hasReminder(ev.id);
        setReminder(ev.id, on);
        haptic();
        toast(on ? "Reminder set · " + (ev.reminder_minutes_before || 60) + " min before" : "Reminder off", "success");
        refreshCard(row, state);
      });
    });

    var shareBtn = row.querySelector('[data-act="share"]');
    if (shareBtn) shareBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      openShareEventPicker(ev);
    });

    var detailsBtn = row.querySelector('[data-act="details"]');
    if (detailsBtn) detailsBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      openEventDetails(ev.id);
    });
  }

  async function refreshCard(row, state) {
    try {
      var c = await db();
      var u = currentUser();
      var evRes = await c.from("events").select("*").eq("id", state.currentEv.id).maybeSingle();
      var invRes = u
        ? await c.from("event_invitees").select("status,paid").eq("event_id", state.currentEv.id).eq("user_id", u.id).maybeSingle()
        : { data: null };
      var goingList = await getGoing(state.currentEv.id);
      state.currentEv = evRes.data || state.currentEv;
      state.eventDeleted = !evRes.data || !!evRes.data.is_cancelled;
      state.mine = invRes.data || null;
      state.goingList = goingList;
      state.permissions = resolvePermissions(state.currentEv, state.mine, u);
      renderEventCardInto(row, state);
    } catch (e) {}
  }

  function buildEventRow(message) {
    var row = document.createElement("div");
    row.className = "message-row event-row";
    row.innerHTML = '<div class="message-bubble event-bubble"><div class="jg-loading">Loading event…</div></div>';
    buildEventRowAsync(message).then(function (realRow) {
      row.replaceWith(realRow);
    });
    return row;
  }

  /* =====================================================================
     RSVP
     ===================================================================== */
  async function rsvpEvent(eventId) {
    try {
      var c = await db();
      var u = currentUser();
      if (!u) { toast("Sign in first.", "error"); return false; }

      var ev = await getEventFull(eventId);
      if (!ev) { toast("This event no longer exists.", "error"); return false; }
      if (ev.is_cancelled) { toast("This event has been cancelled.", "error"); return false; }
      if (ev.owner_id === u.id) { toast("You created this event.", "error"); return false; }

      var existing = await getMyInvite(eventId, u.id);
      if (existing && existing.status === "going") { toast("You're already going.", "success"); return true; }

      var perms = resolvePermissions(ev, existing, u);
      if (!perms.canRsvp) { toast("You can't join this event.", "error"); return false; }

      var going = await getGoing(eventId);
      if (ev.capacity && going.length >= ev.capacity) { toast("This event is full.", "error"); return false; }

      if (ev.is_paid && Number(ev.ticket_price) > 0) {
        var r = await c.rpc("justgo_buy_event_ticket", {
          p_event: ev.id, p_idempotency_key: "tkt_" + ev.id + "_" + Date.now()
        });
        if (r.error) throw r.error;
        if (!r.data || !r.data.ok) {
          var reason = (r.data && r.data.error) || "Ticket purchase failed.";
          if (/capacity/i.test(reason)) reason = "This event is full.";
          if (/check constraint|kind_check/i.test(reason)) reason = "Ticket payment is temporarily unavailable.";
          throw new Error(reason);
        }
        toast("Ticket booked · ₹" + Number(ev.ticket_price).toFixed(0), "success");
      } else {
        var ins = await c.from("event_invitees").upsert(
          { event_id: ev.id, user_id: u.id, status: "going", paid: true },
          { onConflict: "event_id,user_id" }
        );
        if (ins.error) throw ins.error;
        toast("You're going.", "success");
      }
      try { if (typeof refreshWalletData === "function") await refreshWalletData(); } catch (e) {}
      return true;
    } catch (err) {
      toast("Could not RSVP: " + ((err && err.message) || err), "error");
      return false;
    }
  }

  /* =====================================================================
     TICKET MODAL
     ===================================================================== */
  function openTicketModal(ev, invite) {
    var wrap = document.createElement("div");
    wrap.className = "jg-dialog-backdrop";
    wrap.innerHTML =
      '<div class="jg-dialog" role="dialog" aria-modal="true" style="max-width:420px;">' +
        '<div class="jg-dialog-title">Your ticket</div>' +
        '<div class="jg-dialog-body">' +
          '<div class="jg-ticket">' +
            '<div class="jg-ticket-top">' +
              '<div class="jg-ticket-icon">' + svg("ticket", 40) + '</div>' +
              '<div class="jg-ticket-title">' + esc(ev.title) + '</div>' +
              '<div class="jg-ticket-when">' + esc(fmtDate(ev.starts_at)) + '</div>' +
              (ev.location ? '<div class="jg-ticket-where">' + svg("pin", 12) + ' ' + esc(ev.location) + '</div>' : '') +
            '</div>' +
            '<div class="jg-ticket-dash"></div>' +
            '<div class="jg-ticket-bottom">' +
              '<div class="jg-ticket-qr">' + svg("qr", 110) + '</div>' +
              '<div class="jg-ticket-code">#' + esc(String(ev.id).slice(0, 8).toUpperCase()) + '</div>' +
              (invite && invite.paid
                ? '<div class="jg-ticket-paid">Paid ₹' + Number(ev.ticket_price || 0).toFixed(2) + '</div>'
                : '<div class="jg-ticket-paid free">Free admission</div>') +
            '</div>' +
          '</div>' +
          '<p style="text-align:center;font-size:11.5px;color:var(--text-muted);margin:14px 0 0;">Show this at the door. Screenshot or keep it open.</p>' +
        '</div>' +
        '<div class="jg-dialog-actions">' +
          '<button type="button" class="jg-dialog-btn primary" data-act="close">Done</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(wrap);
    wrap.addEventListener("click", function (e) { if (e.target === wrap) wrap.remove(); });
    $('[data-act="close"]', wrap).addEventListener("click", function () { wrap.remove(); });
  }

  /* =====================================================================
     DETAILS + role-aware actions
     ===================================================================== */
  async function openEventDetails(eventId) {
    var wrap = document.createElement("div");
    wrap.className = "jg-dialog-backdrop";
    wrap.innerHTML = '<div class="jg-dialog jg-dialog-wide"><div class="jg-loading">Loading…</div></div>';
    document.body.appendChild(wrap);
    wrap.addEventListener("click", function (e) { if (e.target === wrap) wrap.remove(); });

    var rtChannel = null;
    function cleanup() {
      if (rtChannel) { try { window.db.removeChannel(rtChannel); } catch (e) {} rtChannel = null; }
    }

    try {
      var c = await db();
      var u = currentUser();
      var [evRes, invRes] = await Promise.all([
        c.from("events").select("*").eq("id", eventId).maybeSingle(),
        c.from("event_invitees").select("user_id,status,paid,invited_at").eq("event_id", eventId)
      ]);
      var ev = evRes.data;
      var invites = invRes.data || [];

      if (!ev) {
        wrap.querySelector(".jg-dialog").innerHTML =
          '<div class="jg-dialog-title">Event unavailable</div>' +
          '<div class="jg-dialog-body">This event was deleted.</div>' +
          '<div class="jg-dialog-actions">' +
            '<button class="jg-dialog-btn primary" data-act="close">Close</button>' +
          '</div>';
        wrap.querySelector('[data-act="close"]').addEventListener("click", function () { wrap.remove(); });
        return;
      }

      var mine = u ? invites.find(function (i) { return i.user_id === u.id; }) : null;
      var perms = resolvePermissions(ev, mine, u);
      if (!perms.hasAccess) {
        wrap.querySelector(".jg-dialog").innerHTML =
          '<div class="jg-dialog-title">' + esc(ev.title) + '</div>' +
          '<div class="jg-dialog-body">' +
            '<div class="event-card-banner danger">' + svg("lock", 13) + ' Only invited people can view this event.</div>' +
          '</div>' +
          '<div class="jg-dialog-actions">' +
            '<button class="jg-dialog-btn primary" data-act="close">Close</button>' +
          '</div>';
        wrap.querySelector('[data-act="close"]').addEventListener("click", function () { wrap.remove(); });
        return;
      }

      function render() {
        var going = invites.filter(function (i) { return i.status === "going"; });
        mine = u ? invites.find(function (i) { return i.user_id === u.id; }) : null;
        perms = resolvePermissions(ev, mine, u);
        var isPaid = ev.is_paid && Number(ev.ticket_price) > 0;
        var isFull = ev.capacity && going.length >= ev.capacity && !perms.isOwner;
        var iAmGoing = mine && mine.status === "going";
        var iAmPaid = iAmGoing && mine.paid;
        var isCancelled = !!ev.is_cancelled;

        var primaryActions = [];
        var secondaryActions = [];

        if (perms.canRsvp && !isFull && !isCancelled) {
          primaryActions.push(
            '<button type="button" class="jg-dialog-btn primary jg-primary-wide" data-act="going">' +
              (isPaid
                ? svg("ticket", 14) + ' Buy ticket ₹' + Number(ev.ticket_price).toFixed(0)
                : svg("check", 14) + ' RSVP going') +
            '</button>'
          );
        } else if (iAmGoing) {
          primaryActions.push(
            '<button type="button" class="jg-dialog-btn primary jg-primary-wide" data-act="view-ticket">' +
              svg("qr", 14) + ' View ticket</button>'
          );
        }

        if (perms.canLeave) {
          secondaryActions.push(
            '<button type="button" class="jg-dialog-btn ghost" data-act="leave">' + svg("exit", 14) + ' Not going</button>'
          );
        }
        if (perms.canShare) {
          secondaryActions.push(
            '<button type="button" class="jg-dialog-btn ghost" data-act="share">' + svg("share", 14) + ' Share</button>'
          );
        }
        secondaryActions.push(
          '<button type="button" class="jg-dialog-btn ghost" data-act="copy">' + svg("copy", 14) + ' Copy link</button>'
        );
        secondaryActions.push(
          '<button type="button" class="jg-dialog-btn ghost" data-act="close">Close</button>'
        );

        /* Owner menu (3-dot) */
        var ownerMenuHtml = "";
        if (perms.isOwner) {
          ownerMenuHtml =
            '<button type="button" class="event-owner-menu-btn" data-act="owner-menu" aria-label="Manage event">' +
              svg("more", 18) +
            '</button>';
        }

        var dialog = wrap.querySelector(".jg-dialog");
        dialog.innerHTML =
          '<div class="jg-dialog-title" style="display:flex;align-items:center;justify-content:space-between;gap:8px;">' +
            '<span>' + esc(ev.title) + '</span>' +
            ownerMenuHtml +
          '</div>' +
          '<div class="jg-dialog-body">' +
            (isCancelled ? '<div class="event-card-banner danger">' + svg("ban", 13) + ' This event has been cancelled</div>' : '') +
            '<div class="ev-details-compact">' +
              '<div class="ev-row">' +
                '<span class="ev-k">' + svg("clock", 11) + ' When</span>' +
                '<span class="ev-v">' + esc(fmtDate(ev.starts_at)) + '</span>' +
              '</div>' +
              (ev.location
                ? '<div class="ev-row"><span class="ev-k">' + svg("pin", 11) + ' Where</span><span class="ev-v">' + esc(ev.location) + '</span></div>'
                : '') +
              '<div class="ev-row-group">' +
                '<div class="ev-row"><span class="ev-k">Visibility</span><span class="ev-v">' + esc(ev.visibility) + '</span></div>' +
                '<div class="ev-row"><span class="ev-k">Going</span><span class="ev-v">' +
                  going.length + (ev.capacity ? ' / ' + ev.capacity : '') + '</span></div>' +
                (isPaid ? '<div class="ev-row"><span class="ev-k">Ticket</span><span class="ev-v">₹' + Number(ev.ticket_price).toFixed(2) + '</span></div>' : '') +
              '</div>' +
            '</div>' +
            (ev.description ? '<div class="ev-details-desc">' + esc(ev.description) + '</div>' : '') +
            (perms.canManageAttendees ? '<div class="jg-section-title">Attendees</div><div id="evAttendees" class="jg-attendee-list"></div>' : '') +
            '<div id="evDetailsStatus" class="jg-dialog-status" style="display:none;"></div>' +
          '</div>' +
          '<div class="jg-dialog-actions-wrap">' +
            (primaryActions.length ? '<div class="jg-actions-primary">' + primaryActions.join('') + '</div>' : '') +
            '<div class="jg-actions-secondary">' + secondaryActions.join('') + '</div>' +
          '</div>' +
          (iAmGoing && iAmPaid
            ? '<div class="event-paid-badge">' + svg("checkCircle", 14) + ' You paid ₹' + Number(ev.ticket_price).toFixed(2) + ' · ' + going.length + ' going</div>'
            : '');

        var statusEl = dialog.querySelector("#evDetailsStatus");
        function setStatus(msg) {
          if (!msg) { statusEl.style.display = "none"; return; }
          statusEl.textContent = msg;
          statusEl.style.display = "";
        }

        var ownerMenuBtn = dialog.querySelector('[data-act="owner-menu"]');
        if (ownerMenuBtn) ownerMenuBtn.addEventListener("click", function (e) {
          e.stopPropagation();
          openOwnerMenu(ownerMenuBtn, ev, { onEdit: function () { cleanup(); wrap.remove(); openEditEventModal(ev); },
            onDuplicate: function () { cleanup(); wrap.remove(); openCreateEventModal(Object.assign({}, ev, { id: null, starts_at: null })); },
            onCancelRefund: function () {
              var paid = invites.filter(function (i) { return i.status === "going" && i.paid; });
              var total = paid.length * Number(ev.ticket_price || 0);
              confirmAsync({
                title: "Cancel event & refund?",
                body: paid.length + " paid attendee(s) will be refunded ₹" + total.toFixed(2) + " in total.",
                danger: true, confirmLabel: "Cancel & refund"
              }).then(function (ok) {
                if (!ok) return;
                c.rpc("justgo_cancel_event", { p_event: ev.id }).then(function (r) {
                  if (r.error) return setStatus("Could not cancel: " + r.error.message);
                  if (r.data && r.data.ok === false) return setStatus("Could not cancel: " + r.data.error);
                  toast("Event cancelled. Refunds processed.", "success");
                  cleanup(); wrap.remove();
                });
              });
            },
            onDelete: function () {
              confirmAsync({ title: "Delete event?", body: "Paid attendees are refunded automatically. Cannot be undone.", danger: true, confirmLabel: "Delete" })
                .then(async function (ok) {
                  if (!ok) return;
                  try {
                    if (isPaid) {
                      var paid = invites.filter(function (i) { return i.status === "going" && i.paid; });
                      for (var i = 0; i < paid.length; i++) {
                        try { await c.rpc("justgo_refund_event_ticket", { p_event: ev.id, p_user: paid[i].user_id }); } catch (e) {}
                      }
                    }
                    var r = await c.from("events").delete().eq("id", ev.id);
                    if (r.error) throw r.error;
                    toast("Event deleted.", "success");
                    cleanup(); wrap.remove();
                  } catch (e) { setStatus("Could not delete: " + (e.message || e)); }
                });
            }
          });
        });

        var closeBtn = dialog.querySelector('[data-act="close"]');
        if (closeBtn) closeBtn.addEventListener("click", function () { cleanup(); wrap.remove(); });

        var shareBtn = dialog.querySelector('[data-act="share"]');
        if (shareBtn) shareBtn.addEventListener("click", function () {
          wrap.remove(); openShareEventPicker(ev);
        });

        var copyBtn = dialog.querySelector('[data-act="copy"]');
        if (copyBtn) copyBtn.addEventListener("click", function () {
          var link = location.origin + "/?event=" + ev.id;
          if (navigator.clipboard) navigator.clipboard.writeText(link).then(function () { toast("Link copied.", "success"); });
          else toast(link, "success");
        });

        var goingBtn = dialog.querySelector('[data-act="going"]');
        if (goingBtn) goingBtn.addEventListener("click", async function () {
          goingBtn.disabled = true;
          var ok = await rsvpEvent(ev.id);
          if (ok) {
            var inv2 = await c.from("event_invitees").select("user_id,status,paid,invited_at").eq("event_id", eventId);
            invites = inv2.data || [];
            render();
          } else {
            goingBtn.disabled = false;
          }
        });

        var ticketBtn = dialog.querySelector('[data-act="view-ticket"]');
        if (ticketBtn) ticketBtn.addEventListener("click", function () {
          openTicketModal(ev, mine);
        });

        var leaveBtn = dialog.querySelector('[data-act="leave"]');
        if (leaveBtn) leaveBtn.addEventListener("click", async function () {
          leaveBtn.disabled = true;
          try {
            var r = await c.from("event_invitees").update({ status: "not_going" }).eq("event_id", ev.id).eq("user_id", u.id);
            if (r.error) throw r.error;
            toast("You left the event.", "success");
            cleanup(); wrap.remove();
          } catch (e) {
            setStatus("Could not update: " + (e.message || e));
            leaveBtn.disabled = false;
          }
        });

        if (perms.canManageAttendees) {
          var attWrap = dialog.querySelector("#evAttendees");
          if (attWrap) {
            var uids = invites.map(function (i) { return i.user_id; });
            c.from("profiles").select("id, username, display_name, avatar_url, is_premium")
              .in("id", uids.length ? uids : ["00000000-0000-0000-0000-000000000000"])
              .then(function (profRes) {
                var pmap = {};
                (profRes.data || []).forEach(function (p) { pmap[p.id] = p; });
                attWrap.innerHTML = "";
                if (!invites.length) {
                  attWrap.innerHTML = '<div class="jg-empty">No one has joined yet.</div>';
                  return;
                }
                invites.forEach(function (inv) {
                  var p = pmap[inv.user_id] || { username: "user", display_name: "User" };
                  var rowEl = document.createElement("div");
                  rowEl.className = "jg-attendee-row";
                  rowEl.innerHTML =
                    '<div class="jg-att-ic">' + esc((p.display_name || p.username || "?").charAt(0).toUpperCase()) + '</div>' +
                    '<div class="jg-att-body">' +
                      '<strong>' + esc(p.display_name || p.username) + '</strong>' +
                      '<span>' + esc(inv.status) + (inv.paid ? ' · paid' : '') + '</span>' +
                    '</div>' +
                    '<button type="button" class="jg-att-remove" title="Remove">' + svg("close", 12) + '</button>';
                  rowEl.querySelector(".jg-att-remove").addEventListener("click", async function () {
                    var ok = await confirmAsync({
                      title: "Remove " + (p.display_name || p.username) + "?",
                      body: isPaid && inv.paid ? "Their ticket will be refunded." : "They will be removed.",
                      danger: true, confirmLabel: "Remove"
                    });
                    if (!ok) return;
                    try {
                      if (isPaid && inv.paid) {
                        try { await c.rpc("justgo_refund_event_ticket", { p_event: ev.id, p_user: inv.user_id }); } catch (e) {}
                      }
                      var r = await c.from("event_invitees").delete().eq("event_id", ev.id).eq("user_id", inv.user_id);
                      if (r.error) throw r.error;
                      invites = invites.filter(function (x) { return x.user_id !== inv.user_id; });
                      toast("Removed.", "success");
                      render();
                    } catch (e) { setStatus("Could not remove: " + e.message); }
                  });
                  attWrap.appendChild(rowEl);
                });
              });
          }
        }
      }

      render();

      try {
        rtChannel = c.channel("event-" + eventId + "-" + Date.now())
          .on("postgres_changes", { event: "*", schema: "public", table: "event_invitees", filter: "event_id=eq." + eventId }, async function () {
            var inv2 = await c.from("event_invitees").select("user_id,status,paid,invited_at").eq("event_id", eventId);
            invites = inv2.data || [];
            if (document.body.contains(wrap)) render();
          })
          .subscribe();
      } catch (e) {}
    } catch (e) {
      cleanup();
      wrap.querySelector(".jg-dialog").innerHTML =
        '<div class="jg-dialog-title">Could not load</div>' +
        '<div class="jg-dialog-body">' + esc((e && e.message) || String(e)) + '</div>' +
        '<div class="jg-dialog-actions"><button class="jg-dialog-btn primary" data-act="close">Close</button></div>';
      var cb = wrap.querySelector('[data-act="close"]');
      if (cb) cb.addEventListener("click", function () { wrap.remove(); });
    }
  }

  function openOwnerMenu(anchor, ev, handlers) {
    document.querySelectorAll(".jg-owner-menu").forEach(function (x) { x.remove(); });
    var m = document.createElement("div");
    m.className = "jg-owner-menu";
    m.innerHTML =
      '<button type="button" data-mact="edit">' + svg("edit", 16) + '<span>Edit event</span></button>' +
      '<button type="button" data-mact="duplicate">' + svg("duplicate", 16) + '<span>Duplicate</span></button>' +
      (ev.is_paid
        ? '<button type="button" class="danger" data-mact="cancel">' + svg("ban", 16) + '<span>Cancel &amp; refund</span></button>'
        : '') +
      '<button type="button" class="danger" data-mact="delete">' + svg("trash", 16) + '<span>Delete event</span></button>';
    document.body.appendChild(m);

    var rect = anchor.getBoundingClientRect();
    var mw = 220, mh = m.offsetHeight || 180;
    var left = Math.min(rect.right - mw, window.innerWidth - mw - 8);
    var top = Math.min(rect.bottom + 6, window.innerHeight - mh - 8);
    if (left < 8) left = 8;
    m.style.left = left + "px";
    m.style.top = top + "px";

    m.querySelectorAll("button[data-mact]").forEach(function (b) {
      b.addEventListener("click", function () {
        m.remove();
        var act = b.dataset.mact;
        if (act === "edit") handlers.onEdit();
        else if (act === "duplicate") handlers.onDuplicate();
        else if (act === "cancel") handlers.onCancelRefund();
        else if (act === "delete") handlers.onDelete();
      });
    });

    setTimeout(function () {
      document.addEventListener("click", function onDoc(e2) {
        if (!m.contains(e2.target)) { m.remove(); document.removeEventListener("click", onDoc, true); }
      }, true);
    }, 10);
  }

  /* =====================================================================
     CALENDAR
     ===================================================================== */
  function openCalendarModal() {
    var wrap = document.createElement("div");
    wrap.className = "jg-dialog-backdrop";
    wrap.innerHTML =
      '<div class="jg-dialog jg-dialog-wide" role="dialog" aria-modal="true">' +
        '<div class="jg-dialog-title">Calendar</div>' +
        '<div class="jg-dialog-body">' +
          '<div class="jg-cal-tabs">' +
            '<button type="button" class="jg-cal-tab active" data-tab="upcoming">Upcoming</button>' +
            '<button type="button" class="jg-cal-tab" data-tab="tickets">My tickets</button>' +
            '<button type="button" class="jg-cal-tab" data-tab="mine">Created by me</button>' +
            '<button type="button" class="jg-cal-tab" data-tab="past">Past</button>' +
          '</div>' +
          '<div id="jgCalendarBody"><div class="jg-loading">Loading…</div></div>' +
        '</div>' +
        '<div class="jg-dialog-actions">' +
          '<button type="button" class="jg-dialog-btn ghost" data-act="cancel">Close</button>' +
          '<button type="button" class="jg-dialog-btn primary" data-act="new">' + svg("calendarPlus", 14) + ' New event</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(wrap);
    wrap.addEventListener("click", function (e) { if (e.target === wrap) wrap.remove(); });
    $('[data-act="cancel"]', wrap).addEventListener("click", function () { wrap.remove(); });
    $('[data-act="new"]', wrap).addEventListener("click", function () {
      wrap.remove(); openCreateEventModal();
    });

    $$(".jg-cal-tab", wrap).forEach(function (tab) {
      tab.addEventListener("click", function () {
        $$(".jg-cal-tab", wrap).forEach(function (t) { t.classList.toggle("active", t === tab); });
        refreshCalendar(wrap, tab.dataset.tab);
      });
    });

    refreshCalendar(wrap, "upcoming");
  }

  async function refreshCalendar(wrap, tab) {
    var body = wrap.querySelector("#jgCalendarBody");
    if (!body) return;
    body.innerHTML = '<div class="jg-loading">Loading…</div>';

    try {
      var c = await db();
      var u = currentUser();
      if (!u) { body.innerHTML = '<div class="jg-empty">Sign in first.</div>'; return; }

      var invR = await c.from("event_invitees").select("event_id,status,paid").eq("user_id", u.id);
      var ownR = await c.from("events").select("*").eq("owner_id", u.id);
      var pubR = await c.from("events").select("*").eq("visibility", "public");

      var invites = invR.data || [];
      var goingInvites = invites.filter(function (i) { return i.status === "going"; });
      var paidIds = goingInvites.filter(function (i) { return i.paid; }).map(function (i) { return i.event_id; });
      var invitedIds = invites.filter(function (i) { return i.status !== "not_going"; }).map(function (i) { return i.event_id; });
      var ownList = ownR.data || [];
      var ownIds = ownList.map(function (e) { return e.id; });

      var targetIds = [];
      if (tab === "mine") targetIds = ownIds;
      else if (tab === "tickets") targetIds = paidIds;
      else if (tab === "upcoming") targetIds = invitedIds.concat(ownIds);
      else if (tab === "past") targetIds = invitedIds.concat(ownIds);
      targetIds = targetIds.filter(function (v, i, a) { return a.indexOf(v) === i; });

      var evs = ownList.filter(function (e) { return targetIds.indexOf(e.id) >= 0; });
      var remainingIds = targetIds.filter(function (id) { return !evs.some(function (e) { return e.id === id; }); });
      if (remainingIds.length) {
        var evR = await c.from("events").select("*").in("id", remainingIds);
        if (evR.error) throw evR.error;
        evs = evs.concat(evR.data || []);
      }
      if (tab === "upcoming") {
        var seen = {};
        evs.forEach(function (e) { seen[e.id] = 1; });
        (pubR.data || []).forEach(function (e) { if (!seen[e.id]) { evs.push(e); seen[e.id] = 1; } });
      }
      var now = Date.now();
      if (tab === "upcoming") evs = evs.filter(function (e) { return new Date(e.starts_at).getTime() >= now; });
      else if (tab === "past") evs = evs.filter(function (e) { return new Date(e.starts_at).getTime() < now; });
      evs.sort(function (a, b) {
        var cmp = new Date(a.starts_at) - new Date(b.starts_at);
        return tab === "past" ? -cmp : cmp;
      });

      if (!evs.length) {
        var emptyMap = {
          upcoming: { title: "No upcoming events", body: "Create one to share with your classmates.", cta: "Create event" },
          tickets: { title: "No tickets yet", body: "Browse chat groups to find events or create your own.", cta: "Create event" },
          mine: { title: "You haven't created any events", body: "Create your first study session or meetup.", cta: "Create event" },
          past: { title: "No past events", body: "Events you attended will appear here.", cta: "Create event" }
        };
        var empty = emptyMap[tab] || emptyMap.upcoming;
        body.innerHTML =
          '<div class="jg-empty-illustrated">' +
            '<div class="jg-empty-ic">' + svg("calendar", 40) + '</div>' +
            '<strong>' + esc(empty.title) + '</strong>' +
            '<span>' + esc(empty.body) + '</span>' +
            '<button type="button" class="jg-btn-block primary" style="margin-top:10px;" data-act="empty-new">' +
              svg("calendarPlus", 16) + '<span>' + esc(empty.cta) + '</span></button>' +
          '</div>';
        var b = body.querySelector('[data-act="empty-new"]');
        if (b) b.addEventListener("click", function () { wrap.remove(); openCreateEventModal(); });
        return;
      }

      var ids = evs.map(function (e) { return e.id; });
      var countRes = await c.from("event_invitees").select("event_id").in("event_id", ids).eq("status", "going");
      var countMap = {};
      (countRes.data || []).forEach(function (r) { countMap[r.event_id] = (countMap[r.event_id] || 0) + 1; });

      var myInviteMap = {};
      invites.forEach(function (i) { myInviteMap[i.event_id] = i; });

      body.innerHTML = "";
      evs.forEach(function (ev) {
        var myInv = myInviteMap[ev.id];
        var perms = resolvePermissions(ev, myInv, u);
        var iAmGoing = myInv && myInv.status === "going";
        var iAmPaid = iAmGoing && myInv.paid;
        var isCancelled = !!ev.is_cancelled;
        var going = countMap[ev.id] || 0;

        var removeHtml = "";
        if (perms.canDelete) {
          removeHtml = '<button type="button" class="jg-cal-btn danger" data-act="remove" title="Delete">' + svg("trash", 13) + '</button>';
        } else if (perms.canLeave) {
          removeHtml = '<button type="button" class="jg-cal-btn danger" data-act="remove" title="Leave">' + svg("exit", 13) + '</button>';
        }

        var row = document.createElement("div");
        row.className = "jg-cal-row" + (isCancelled ? " jg-cal-row-cancelled" : "");
        row.innerHTML =
          '<div class="jg-cal-date">' +
            '<span class="jg-cd-day">' + new Date(ev.starts_at).getDate() + '</span>' +
            '<span class="jg-cd-month">' + new Date(ev.starts_at).toLocaleString([], { month: "short" }) + '</span>' +
          '</div>' +
          '<div class="jg-cal-body">' +
            '<strong>' + esc(ev.title) + '</strong>' +
            '<span>' + esc(fmtDate(ev.starts_at)) + (ev.location ? ' · ' + esc(ev.location) : '') + '</span>' +
            '<div class="jg-cal-badges">' +
              (ev.is_paid
                ? '<span class="jg-cal-badge paid">₹' + Number(ev.ticket_price).toFixed(0) + '</span>'
                : '<span class="jg-cal-badge free">Free</span>') +
              (perms.isOwner ? '<span class="jg-cal-badge owner">You created</span>' : '') +
              (iAmPaid ? '<span class="jg-cal-badge going-paid">' + svg("checkCircle", 10) + ' Paid</span>' : '') +
              (iAmGoing && !iAmPaid ? '<span class="jg-cal-badge going">Going</span>' : '') +
              (going > 0 ? '<span class="jg-cal-badge going-count">' + svg("users", 10) + ' ' + going + '</span>' : '') +
              (isCancelled ? '<span class="jg-cal-badge cancelled">' + svg("ban", 10) + ' Cancelled</span>' : '') +
            '</div>' +
          '</div>' +
          '<div class="jg-cal-actions">' +
            (iAmGoing ? '<button type="button" class="jg-cal-btn" data-act="ticket" title="View ticket">' + svg("qr", 14) + '</button>' : '') +
            (perms.canShare ? '<button type="button" class="jg-cal-btn" data-act="share" title="Share">' + svg("share", 14) + '</button>' : '') +
            (perms.isOwner && !isCancelled ? '<button type="button" class="jg-cal-btn" data-act="edit" title="Edit">' + svg("edit", 13) + '</button>' : '') +
            '<button type="button" class="jg-cal-btn" data-act="details" title="Details">' + svg("arrowRight", 14) + '</button>' +
            removeHtml +
          '</div>';

        var ticketBtn = row.querySelector('[data-act="ticket"]');
        if (ticketBtn) ticketBtn.addEventListener("click", function (e) { e.stopPropagation(); openTicketModal(ev, myInv); });

        var shareBtn = row.querySelector('[data-act="share"]');
        if (shareBtn) shareBtn.addEventListener("click", function (e) { e.stopPropagation(); openShareEventPicker(ev); });

        var editBtn = row.querySelector('[data-act="edit"]');
        if (editBtn) editBtn.addEventListener("click", function (e) { e.stopPropagation(); wrap.remove(); openEditEventModal(ev); });

        row.querySelector('[data-act="details"]').addEventListener("click", function (e) {
          e.stopPropagation(); wrap.remove(); openEventDetails(ev.id);
        });

        var removeBtn = row.querySelector('[data-act="remove"]');
        if (removeBtn) removeBtn.addEventListener("click", async function (e) {
          e.stopPropagation();
          var isOwner = ev.owner_id === u.id;
          var ok = await confirmAsync({
            title: isOwner ? "Delete event?" : "Leave event?",
            body: isOwner ? "Paid attendees refunded automatically." : "You can rejoin later.",
            danger: true,
            confirmLabel: isOwner ? "Delete" : "Leave"
          });
          if (!ok) return;
          try {
            if (isOwner) {
              await c.from("events").delete().eq("id", ev.id);
            } else {
              await c.from("event_invitees").update({ status: "not_going" }).eq("event_id", ev.id).eq("user_id", u.id);
            }
            toast(isOwner ? "Event deleted." : "You left the event.", "success");
            row.remove();
          } catch (e) { toast("Could not remove: " + e.message, "error"); }
        });

        body.appendChild(row);
      });
    } catch (e) {
      body.innerHTML = '<div class="jg-empty">Could not load: ' + esc(e.message || "") + '</div>';
    }
  }

  /* =====================================================================
     REALTIME + REMINDERS
     ===================================================================== */
  var _rtChannel = null;
  async function subscribeEventRealtime() {
    if (_rtChannel) return;
    try {
      var c = await db();
      var u = currentUser();
      if (!u) { setTimeout(subscribeEventRealtime, 3000); return; }
      _rtChannel = c.channel("justgo-events-" + u.id)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "event_invitees", filter: "user_id=eq." + u.id }, async function (payload) {
          var inv = payload.new;
          if (!inv) return;
          try {
            var ev = await c.from("events").select("*").eq("id", inv.event_id).maybeSingle();
            if (ev.data) toast("You're invited: " + ev.data.title, "success");
          } catch (e) {}
        })
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, function (payload) {
          var m = payload.new;
          if (!m || m.kind !== "event") return;
          if (typeof window.loadConversationsDebounced === "function") window.loadConversationsDebounced();
        })
        .subscribe();
    } catch (e) { console.warn("[events] realtime subscribe failed", e); }
    setInterval(checkReminders, 60000);
  }

  async function checkReminders() {
    if (!hasDb()) return;
    var u = currentUser();
    if (!u) return;
    try {
      var c = window.db;
      var now = Date.now();
      var invs = await c.from("event_invitees").select("event_id,status").eq("user_id", u.id);
      var ids = (invs.data || []).filter(function (i) { return i.status === "going"; }).map(function (i) { return i.event_id; });
      if (!ids.length) return;
      var evs = await c.from("events").select("*").in("id", ids)
        .gte("starts_at", new Date(now).toISOString())
        .lte("starts_at", new Date(now + 24 * 3600 * 1000).toISOString());
      (evs.data || []).forEach(function (ev) {
        if (!hasReminder(ev.id)) return;
        var ms = new Date(ev.starts_at).getTime() - now;
        var remind = (ev.reminder_minutes_before || 60) * 60000;
        if (ms > 0 && ms <= remind + 30000) {
          var key = "jg_reminded_" + ev.id;
          if (!localStorage.getItem(key)) {
            localStorage.setItem(key, "1");
            toast("Reminder: " + ev.title + " — " + fmtDate(ev.starts_at), "success");
          }
        }
      });
    } catch (e) {}
  }

  function handleEventDeepLink() {
    try {
      var p = new URLSearchParams(location.search);
      var id = p.get("event");
      if (!id) return;
      if (history && history.replaceState) history.replaceState({}, document.title, location.pathname);
      setTimeout(function () { openEventDetails(id); }, 500);
    } catch (e) {}
  }

  /* =====================================================================
     BOOT
     ===================================================================== */
  var _injectedMenu = false;
  var _injectedComposer = false;
  var _hookedBubble = false;
  var _slashHooked = false;

  function tryInject() {
    if (!_injectedMenu) _injectedMenu = injectCalendarMenu();
    if (!_injectedComposer) _injectedComposer = injectComposer();
    if (!_hookedBubble) _hookedBubble = hookBubble();
    if (!_slashHooked) _slashHooked = injectSlashCommand();
    return _injectedMenu && _injectedComposer && _hookedBubble && _slashHooked;
  }

  function init() {
    if (tryInject()) { subscribeEventRealtime(); handleEventDeepLink(); return; }
    var tries = 0;
    var iv = setInterval(function () {
      tries++;
      if (tryInject() || tries > 40) {
        clearInterval(iv);
        subscribeEventRealtime();
        handleEventDeepLink();
      }
    }, 500);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.JustGoEvents = {
    openCreate: openCreateEventModal,
    openEdit: openEditEventModal,
    openDetails: openEventDetails,
    openCalendar: openCalendarModal,
    openHub: openEventHub,
    openSharePicker: openShareEventPicker,
    forwardTo: forwardEventToPicker,
    buildEventRow: buildEventRow,
    rsvp: rsvpEvent,
    permissions: resolvePermissions,
    svg: svg,
    __v10: true
  };
})();