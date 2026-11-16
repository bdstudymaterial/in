/* =========================================================================
   JustGo — ui-dialogs.js (v2)
   Custom alert / confirm / prompt with stacking control.
   ========================================================================= */
(function () {
  "use strict";
  if (window.JGConfirm && window.JGConfirm.__v2) return;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c];
    });
  }
  function host() {
    var h = document.getElementById("jgDialogHost");
    if (!h) {
      h = document.createElement("div");
      h.id = "jgDialogHost";
      h.className = "jg-dialog-host";
      document.body.appendChild(h);
    }
    return h;
  }

  /* Hide any other backdrops below the new one.
     Without this, opening a confirm() from inside a create-event dialog
     leaves both visible at the same time. */
  function dimOtherBackdrops() {
    var all = document.querySelectorAll(".jg-dialog-backdrop");
    all.forEach(function (bd) {
      if (!bd.__dimmedBy) bd.style.opacity = "0";
    });
  }
  function restoreBackdrops() {
    var all = document.querySelectorAll(".jg-dialog-backdrop");
    all.forEach(function (bd) {
      bd.style.opacity = "";
      delete bd.__dimmedBy;
    });
  }

  function base(o) {
    return new Promise(function (resolve) {
      var h = host();
      var wrap = document.createElement("div");
      wrap.className = "jg-dialog-backdrop";
      wrap.innerHTML =
        '<div class="jg-dialog ' + (o.danger ? "danger" : "") + ' ' + (o.wide ? "jg-dialog-wide" : "") + '" role="dialog">' +
          (o.title ? '<div class="jg-dialog-title">' + esc(o.title) + '</div>' : '') +
          (o.body ? '<div class="jg-dialog-body">' + o.body + '</div>' : '') +
          (o.kind === "prompt"
            ? (o.multiline
                ? '<textarea class="jg-dialog-input" rows="3" placeholder="' + esc(o.placeholder || "") + '">' + esc(o.value || "") + '</textarea>'
                : '<input class="jg-dialog-input" type="text" value="' + esc(o.value || "") + '" placeholder="' + esc(o.placeholder || "") + '">')
            : '') +
          '<div class="jg-dialog-actions">' +
            (o.cancel ? '<button type="button" class="jg-dialog-btn" data-act="cancel">' + esc(o.cancel) + '</button>' : '') +
            '<button type="button" class="jg-dialog-btn primary ' + (o.danger ? "danger" : "") + '" data-act="ok">' + esc(o.ok || "OK") + '</button>' +
          '</div>' +
        '</div>';

      /* Dim any existing backdrops while we open a new one */
      var existing = document.querySelectorAll(".jg-dialog-backdrop");
      existing.forEach(function (bd) {
        bd.style.pointerEvents = "none";
        bd.style.opacity = "0.25";
        bd.__dimmedBy = wrap;
      });

      h.appendChild(wrap);

      var input = wrap.querySelector(".jg-dialog-input");
      var okBtn = wrap.querySelector('[data-act="ok"]');
      var cxl   = wrap.querySelector('[data-act="cancel"]');

      function done(v) {
        var d = wrap.__dimmedBy || wrap;
        // Restore any dimmed backdrops
        document.querySelectorAll(".jg-dialog-backdrop").forEach(function (bd) {
          if (bd !== wrap) {
            bd.style.pointerEvents = "";
            bd.style.opacity = "";
            delete bd.__dimmedBy;
          }
        });
        wrap.remove();
        resolve(v);
      }

      function submit() {
        done(o.kind === "prompt" ? (input ? input.value.trim() : "") : true);
      }

      okBtn.addEventListener("click", submit);
      if (cxl) cxl.addEventListener("click", function () { done(o.kind === "prompt" ? null : false); });
      wrap.addEventListener("click", function (e) {
        if (e.target === wrap) done(o.kind === "prompt" ? null : false);
      });

      var onKey = function (e) {
        if (!document.body.contains(wrap)) {
          document.removeEventListener("keydown", onKey);
          return;
        }
        if (e.key === "Escape") {
          document.removeEventListener("keydown", onKey);
          done(o.kind === "prompt" ? null : false);
        } else if (e.key === "Enter" && o.kind === "prompt" && !o.multiline) {
          e.preventDefault();
          document.removeEventListener("keydown", onKey);
          submit();
        }
      };
      document.addEventListener("keydown", onKey);

      setTimeout(function () { (input || okBtn).focus(); }, 30);
    });
  }

  var alertFn = function (o) {
    return base({ title: o.title, body: o.body, ok: o.ok || "OK" });
  };
  alertFn.__v2 = true;

  var confirmFn = function (o) {
    return base({
      title: o.title, body: o.body,
      ok: o.confirmLabel || "Confirm",
      cancel: o.cancelLabel || "Cancel",
      danger: o.danger, wide: o.wide
    });
  };
  confirmFn.__v2 = true;

  var promptFn = function (o) {
    return base({
      title: o.title, body: o.body,
      kind: "prompt", value: o.value, placeholder: o.placeholder,
      multiline: o.multiline, ok: o.ok || "Save",
      cancel: o.cancelLabel || "Cancel", wide: o.wide
    });
  };
  promptFn.__v2 = true;

  window.JGAlert = alertFn;
  window.JGConfirm = confirmFn;
  window.JGPrompt = promptFn;
})();