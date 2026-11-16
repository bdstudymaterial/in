/* =========================================================================
   JustGo — side-viewonce-patch.js
   Adds a "1x" toggle per image in the composer strip, and patches
   uploadOneAttachment to persist view_once + viewed_by.

   Load AFTER side.js in index.html:
     <script defer src="side-viewonce-patch.js"></script>
   ========================================================================= */
(function () {
  "use strict";
  if (window.__sideViewOncePatch) return;
  window.__sideViewOncePatch = true;

  function fileIsImage(f) {
    return f && f.type && f.type.indexOf("image/") === 0;
  }

  /* ---- 1. Patch renderSelectedFiles to add a per-image "1x" toggle ---- */
  function patchRenderSelectedFiles() {
    var orig = window.renderSelectedFiles;
    if (typeof orig !== "function" || orig.__viewOncePatched) return;
    var wrapped = function () {
      orig.apply(this, arguments);
      var box = (window.elements && window.elements.selectedFile) ||
                document.getElementById("selectedFile");
      if (!box) return;
      var selectedFiles = window.selectedFiles || [];
      var chips = box.querySelectorAll(".file-chip");
      chips.forEach(function (chip, idx) {
        var f = selectedFiles[idx];
        if (!fileIsImage(f)) return;
        if (chip.querySelector(".file-chip-viewonce")) return;
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "file-chip-viewonce" + (f._view_once ? " active" : "");
        btn.title = f._view_once ? "Sent as view-once (tap to undo)" : "Send as view-once";
        btn.textContent = "1x";
        btn.addEventListener("click", function (ev) {
          ev.stopPropagation();
          f._view_once = !f._view_once;
          btn.classList.toggle("active", !!f._view_once);
          btn.title = f._view_once ? "Sent as view-once (tap to undo)" : "Send as view-once";
        });
        var removeBtn = chip.querySelector(".file-chip-remove");
        if (removeBtn) chip.insertBefore(btn, removeBtn);
        else chip.appendChild(btn);
      });
    };
    wrapped.__viewOncePatched = true;
    window.renderSelectedFiles = wrapped;
    if (typeof window.safeCall === "function") window.safeCall(function () { return wrapped; });
  }

  /* ---- 2. Patch uploadOneAttachment to persist view_once ---- */
  function patchUploadOneAttachment() {
    var orig = window.uploadOneAttachment;
    if (typeof orig !== "function" || orig.__viewOncePatched) return;
    var wrapped = async function (file, messageId, conversationId) {
      var path = await orig.apply(this, arguments);
      try {
        var client = window.db;
        if (!client || !file || !file._view_once) return path;
        var u = window.currentUser;
        if (!u) return path;
        /* Find the attachment row for this message/path and mark it */
        var att = await client.from("message_attachments")
          .select("id")
          .eq("message_id", messageId)
          .eq("storage_path", path)
          .maybeSingle();
        if (att.data && att.data.id) {
          await client.from("message_attachments")
            .update({ view_once: true })
            .eq("id", att.data.id);
        }
      } catch (e) {
        console.warn("[viewonce] persist failed", e);
      }
      return path;
    };
    wrapped.__viewOncePatched = true;
    window.uploadOneAttachment = wrapped;
  }

  function patchAll() {
    patchRenderSelectedFiles();
    patchUploadOneAttachment();
  }
  function init() {
    patchAll();
    /* Re-patch after side.js has settled */
    setTimeout(patchAll, 400);
    setTimeout(patchAll, 1500);
    setTimeout(patchAll, 4000);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();