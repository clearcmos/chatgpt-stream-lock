// Enforces the navigation lockdown for the configured project.
//
// The lock ({projectId, projectName}) lives in chrome.storage.local, set from
// the popup. Hard navigations are handled by dynamic DNR rules rebuilt here
// whenever the lock changes; SPA route changes (history.pushState, which DNR
// never sees) are snapped back via webNavigation. With no lock stored the
// extension is inert.
//
// Project chats can live at plain /c/<id> URLs (that is how the sidebar
// Recents list links them). The content script learns those ids from the DOM
// and reports them here; they are allowed for SPA routing and registered as
// session DNR allow rules so even a manual reload of such a URL survives.

importScripts("lib.js");

let lock = null;
const knownIds = new Set();

async function loadState() {
  const { lock: stored } = await chrome.storage.local.get("lock");
  lock = stored && stored.projectId ? stored : null;
  const { projectChatIds = [] } =
    await chrome.storage.session.get("projectChatIds");
  knownIds.clear();
  for (const id of projectChatIds) knownIds.add(id);
}

function homeUrl() {
  return `https://chatgpt.com/g/${lock.projectId}/project`;
}

// Dynamic rules persist in the profile and are enforced by the browser even
// while this worker sleeps; rebuilt idempotently on every startup and on
// every lock change.
async function rebuildDynamicRules() {
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const removeRuleIds = existing.map((r) => r.id);
  if (!lock) {
    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds });
    return;
  }
  const main = ["main_frame"];
  const addRules = [
    {
      id: 1,
      priority: 2,
      action: { type: "allow" },
      condition: {
        urlFilter: `|https://chatgpt.com/g/${lock.projectId}`,
        resourceTypes: main,
      },
    },
    {
      id: 2,
      priority: 2,
      action: { type: "allow" },
      condition: {
        urlFilter: "|https://chatgpt.com/auth",
        resourceTypes: main,
      },
    },
    {
      id: 3,
      priority: 2,
      action: { type: "allow" },
      condition: {
        urlFilter: "|https://chatgpt.com/api/auth",
        resourceTypes: main,
      },
    },
    {
      id: 4,
      priority: 1,
      action: { type: "redirect", redirect: { url: homeUrl() } },
      condition: { urlFilter: "|https://chatgpt.com/", resourceTypes: main },
    },
    {
      id: 5,
      priority: 1,
      action: { type: "redirect", redirect: { url: homeUrl() } },
      condition: {
        urlFilter: "|https://chat.openai.com/",
        resourceTypes: main,
      },
    },
    {
      id: 6,
      priority: 1,
      action: { type: "redirect", redirect: { url: homeUrl() } },
      condition: { urlFilter: "|https://chat.com/", resourceTypes: main },
    },
  ];
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds,
    addRules,
  });
}

// Serialize rule rebuilds; concurrent updateSessionRules calls could clobber
// each other's removeRuleIds snapshots.
let ruleSync = Promise.resolve();
function syncSessionRules() {
  ruleSync = ruleSync.then(async () => {
    const existing = await chrome.declarativeNetRequest.getSessionRules();
    const addRules = [...knownIds].sort().map((cid, i) => ({
      id: 10000 + i,
      priority: 2,
      action: { type: "allow" },
      condition: {
        urlFilter: `|https://chatgpt.com/c/${cid}`,
        resourceTypes: ["main_frame"],
      },
    }));
    await chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: existing.map((r) => r.id),
      addRules,
    });
  });
  return ruleSync;
}

const ready = loadState().then(rebuildDynamicRules);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes.lock) return;
  (async () => {
    await ready;
    lock = changes.lock.newValue?.projectId ? changes.lock.newValue : null;
    // A different project means a different chat membership; relearn from
    // scratch.
    knownIds.clear();
    await chrome.storage.session.set({ projectChatIds: [] });
    await syncSessionRules();
    await rebuildDynamicRules();
  })();
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type !== "project-chat-ids" || !Array.isArray(msg.ids)) return;
  (async () => {
    await ready;
    if (!lock) return;
    let changed = false;
    for (const id of msg.ids) {
      if (
        typeof id === "string" &&
        /^[0-9a-f-]{8,}$/i.test(id) &&
        !knownIds.has(id.toLowerCase())
      ) {
        knownIds.add(id.toLowerCase());
        changed = true;
      }
    }
    if (!changed) return;
    await chrome.storage.session.set({ projectChatIds: [...knownIds] });
    await syncSessionRules();
  })();
});

async function check(details) {
  if (details.frameId !== 0) return;
  await ready;
  if (!lock) return;
  const allowed = () =>
    StreamMode.allowedUrl(details.url, { projectId: lock.projectId, knownIds });
  if (allowed()) return;
  // A /c/<id> route may belong to the project with its report still in
  // flight; give the content script a moment before deciding.
  let path;
  try {
    path = new URL(details.url).pathname;
  } catch {
    return;
  }
  if (StreamMode.chatIdFromPath(path)) {
    await new Promise((r) => setTimeout(r, 400));
    if (allowed()) return;
  }
  chrome.tabs.update(details.tabId, { url: homeUrl() });
}

const filter = {
  url: [
    { hostEquals: "chatgpt.com" },
    { hostEquals: "chat.openai.com" },
    { hostEquals: "chat.com" },
  ],
};

chrome.webNavigation.onHistoryStateUpdated.addListener(check, filter);
chrome.webNavigation.onCommitted.addListener(check, filter);
