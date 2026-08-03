// Shared pure logic for Stream Lock for ChatGPT. Loaded as a classic script by
// the content script (first entry in manifest content_scripts), the service
// worker (importScripts), and the popup (script tag before popup.js); the
// CommonJS shim at the bottom makes the same functions testable under Node.
// Keep this file free of chrome.* and DOM access.

const StreamMode = {
  // Conversation id from a chatgpt.com pathname, in either URL form:
  // plain /c/<id> or canonical /g/<project-segment>/c/<id>.
  chatIdFromPath(path) {
    const m = /^\/(?:g\/[^/]+\/)?c\/([0-9a-f-]{8,})/i.exec(path);
    return m ? m[1].toLowerCase() : null;
  },

  // Sidebar rows link project chats as plain /c/<id>, distinguishable only by
  // this aria-label suffix built from the project's display name.
  labelForProject(projectName) {
    return projectName ? `chat in project ${projectName}` : null;
  },

  // Whether a navigation target is inside the locked project. Fails open for
  // anything that is not a chatgpt.com URL: off-site links (citations,
  // sources) are none of this extension's business, and chat.openai.com /
  // chat.com hard navigations are already redirected by the DNR rules.
  allowedUrl(rawUrl, { base, projectId, knownIds }) {
    let u;
    try {
      u = new URL(rawUrl, base);
    } catch {
      return true;
    }
    if (u.origin !== "https://chatgpt.com") return true;
    if (u.pathname.startsWith(`/g/${projectId}`)) return true;
    // Login must stay reachable so an expired session can be renewed.
    if (u.pathname.startsWith("/auth") || u.pathname.startsWith("/api/auth"))
      return true;
    const id = StreamMode.chatIdFromPath(u.pathname);
    return !!(id && knownIds && knownIds.has(id));
  },

  // Lock candidate from a browser tab, or null when the tab is not a ChatGPT
  // project home page. The id comes from the URL; the display name comes from
  // the tab title ("ChatGPT - <name>"), falling back to the URL slug with
  // hyphens as spaces.
  projectFromTab(tab) {
    if (!tab || !tab.url) return null;
    let u;
    try {
      u = new URL(tab.url);
    } catch {
      return null;
    }
    if (u.origin !== "https://chatgpt.com") return null;
    const m = /^\/g\/(g-p-[0-9a-f]+)(?:-[^/]*)?\/project$/.exec(u.pathname);
    if (!m) return null;
    const projectId = m[1];
    let projectName = null;
    const tm = /^ChatGPT - (.+)$/.exec(tab.title || "");
    if (tm) projectName = tm[1].trim();
    if (!projectName) {
      const sm = /^\/g\/g-p-[0-9a-f]+-([^/]+)\/project$/.exec(u.pathname);
      if (sm) projectName = sm[1].replace(/-/g, " ");
    }
    return projectName ? { projectId, projectName } : null;
  },

  // The hiding CSS for a locked project. Everything that could reveal other
  // conversations, other projects, or account identity; the project's own
  // chats and the New chat button stay visible. Cosmetic defense only: the
  // navigation lockdown is enforced separately.
  buildCss(projectId, projectName) {
    const cssAttr = (s) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    const label = StreamMode.labelForProject(projectName);
    // Without a usable name there is no label exemption at all: an empty
    // suffix would substring-match every project's chats and leak them.
    const labelExempt = label ? `:not([aria-label*="${cssAttr(label)}"])` : "";
    const labelKeep = label
      ? `:not(:has(a[aria-label*="${cssAttr(label)}"]))`
      : "";
    return `
a[href^="/c/"]${labelExempt} { display: none !important; }
a[href^="/g/"]:not([href*="${projectId}"]) { display: none !important; }
nav a[href]:not([href*="${projectId}"])${labelExempt}:not([data-testid="create-new-chat-button"]) { display: none !important; }
nav [class*="sidebar-expando-section"] li:not(:has(a[href*="${projectId}"]))${labelKeep} { display: none !important; }
nav button[aria-label="Search"] { display: none !important; }
[data-testid="accounts-profile-button"] { display: none !important; }
`;
  },
};

globalThis.StreamMode = StreamMode;
if (typeof module !== "undefined" && module.exports) {
  module.exports = StreamMode;
}
