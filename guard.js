// Runs at document_start on chatgpt.com (lib.js is loaded first via the
// manifest's content_scripts order). Reads the lock from storage, injects the
// hiding CSS generated for that project, learns which conversation ids belong
// to it (sidebar rows label them via aria-label), shares them with the
// service worker, cancels clicks that would leave the project, blocks the
// global-search shortcut, and hides the few UI rows CSS cannot express
// (text-only matches). With no lock stored it does nothing.
(async () => {
  const { lock } = await chrome.storage.local.get("lock");
  if (!lock?.projectId) return;

  const PROJECT_ID = lock.projectId;
  const HOME = `https://chatgpt.com/g/${PROJECT_ID}/project`;
  // Renaming the project in ChatGPT changes this label; re-lock from the
  // popup to recover (safe failure: project chats vanish from the sidebar
  // instead of leaking).
  const PROJECT_CHAT_LABEL = StreamMode.labelForProject(lock.projectName);

  const style = document.createElement("style");
  style.textContent = StreamMode.buildCss(PROJECT_ID, lock.projectName);
  (document.head || document.documentElement).appendChild(style);

  // Conversation ids known to belong to the project. Plain /c/<id> routes for
  // these are allowed so the app can client-route between project chats
  // without a full page load, exactly like the unfiltered UI.
  const projectChatIds = new Set();

  const allowed = (rawUrl) =>
    StreamMode.allowedUrl(rawUrl, {
      base: location.href,
      projectId: PROJECT_ID,
      knownIds: projectChatIds,
    });

  let syncTimer = null;
  function learn(id) {
    if (!id || projectChatIds.has(id)) return;
    projectChatIds.add(id);
    if (syncTimer) return;
    syncTimer = setTimeout(() => {
      syncTimer = null;
      try {
        chrome.runtime.sendMessage({
          type: "project-chat-ids",
          ids: [...projectChatIds],
        });
      } catch {
        // Extension was reloaded out from under the page; the next scan after
        // a page reload re-registers everything.
      }
    }, 100);
  }

  const isProjectChatRow = (a) =>
    !!PROJECT_CHAT_LABEL &&
    (a.getAttribute("aria-label") || "").includes(PROJECT_CHAT_LABEL);

  function scan() {
    if (PROJECT_CHAT_LABEL) {
      for (const a of document.querySelectorAll(
        `a[aria-label*="${PROJECT_CHAT_LABEL}"]`,
      )) {
        learn(
          StreamMode.chatIdFromPath(new URL(a.href, location.href).pathname),
        );
      }
    }
    for (const a of document.querySelectorAll(`a[href*="/g/${PROJECT_ID}"]`)) {
      learn(StreamMode.chatIdFromPath(new URL(a.href, location.href).pathname));
    }
    const own = StreamMode.chatIdFromPath(location.pathname);
    if (own && location.pathname.startsWith(`/g/${PROJECT_ID}`)) learn(own);
  }

  addEventListener(
    "click",
    (e) => {
      const el =
        e.target instanceof Element ? e.target : e.target?.parentElement;
      const a = el?.closest?.("a[href]");
      if (!a) return;
      // Clicks on controls nested inside a chat row (the "..." options button,
      // pin button) are not navigations; the app opens a menu and prevents
      // the anchor default itself.
      const control = el.closest(
        "button, [role='button'], [role='menuitem'], input, textarea, select",
      );
      if (control && control !== a && a.contains(control)) return;
      if (isProjectChatRow(a)) {
        // Project chat: register the id and let the app client-route.
        learn(
          StreamMode.chatIdFromPath(new URL(a.href, location.href).pathname),
        );
        return;
      }
      if (!allowed(a.href)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        location.href = HOME;
      }
    },
    true,
  );

  // Ctrl/Cmd+K opens global search across all conversations.
  addEventListener(
    "keydown",
    (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    },
    true,
  );

  // Watchdog for SPA route changes the service worker might miss.
  let last = location.href;
  setInterval(() => {
    if (location.href === last) return;
    last = location.href;
    if (!allowed(location.href)) location.replace(HOME);
  }, 300);

  // Text-matched cosmetic hiding: the sidebar "More" row has no href, testid,
  // or aria-label to target from CSS. Same for the conversation options menu's
  // "Move to project" item, whose submenu lists every project name.
  const hideTextRows = () => {
    for (const item of document.querySelectorAll("nav .__menu-item")) {
      const t = item.textContent.trim();
      if (t === "More" || t === "Show more") item.style.display = "none";
    }
    for (const item of document.querySelectorAll(
      '[role="menuitem"][aria-haspopup]',
    )) {
      if (item.textContent.trim() === "Move to project")
        item.style.display = "none";
    }
  };
  const start = () => {
    hideTextRows();
    scan();
    new MutationObserver(() => {
      hideTextRows();
      scan();
    }).observe(document.body, { childList: true, subtree: true });
  };
  if (document.body) start();
  else addEventListener("DOMContentLoaded", start, { once: true });
})();
