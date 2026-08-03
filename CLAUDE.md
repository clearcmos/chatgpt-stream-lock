# chatgpt-stream-lock

Chromium extension (Manifest V3, plain JavaScript, no build step) that locks
chatgpt.com to a single project for streaming. The lock is configured from the
toolbar popup; with no lock stored the extension is inert.

## Structure

- `manifest.json` - MV3 manifest. Content scripts load `lib.js` before
  `guard.js`; the service worker and popup load `lib.js` the same way.
- `lib.js` - all pure logic (`StreamMode` global + CommonJS shim for tests):
  chat-id parsing, URL allow decisions, lock candidate extraction from a tab,
  hiding-CSS generation. Keep it free of `chrome.*` and DOM access.
- `guard.js` - content script at document_start: injects the generated CSS,
  learns project chat ids from sidebar aria-labels, reports them to the
  worker, cancels disallowed link clicks, blocks Ctrl+K, hides text-only-
  matchable rows via MutationObserver.
- `background.js` - service worker: rebuilds dynamic DNR redirect/allow rules
  from the lock, snaps SPA routes back via webNavigation, keeps the learned
  chat-id set (session storage + session DNR allow rules).
- `popup.html` / `popup.js` - shows the current lock; offers "Lock to this
  project" when the active tab is a project home page; two-step clear.
- `tests/lib.test.js` - Vitest suite over `lib.js`.

## Commands

```
npm ci                  # install dev dependencies
npm test                # vitest run
npm run test:coverage   # tests plus 80% line/branch gate on lib.js
npm run lint            # eslint (flat config, eslint.config.mjs)
npm run format:check    # prettier check (format to write)
```

Manual verification against the live extension: load unpacked in a Chromium
profile, lock onto a project, then check hiding, chat switching, and that
foreign navigation snaps back. There is no automated browser harness; see the
coverage exemption below.

## Conventions

- Plain JS classic scripts; no bundler, no framework. `lib.js` must stay
  loadable by content script, service worker (`importScripts`), popup, and
  Node (`module.exports` shim).
- The `StreamMode` code identifier predates the Stream Lock rename and stays:
  internal identifiers do not chase product names.
- No emojis, no em dashes (project + global convention).
- Default branch `main`.

## Engineering decisions

### 2026-08-02: Testing and coverage scope

- Coverage is measured and gated (80 percent lines and branches) on `lib.js`
  only. `guard.js`, `background.js`, and `popup.js` are browser-bound glue
  (DOM, `chrome.*`, worker lifecycle) verified against the live extension
  over CDP during development; a Puppeteer-style CI harness would outweigh
  the extension itself. New logic with branches belongs in `lib.js` where it
  is testable.

### 2026-08-02: Project chats are recognized by aria-label

- The sidebar Recents list links project chats as plain `/c/<id>`, shaped
  identically to every other chat. The only DOM marker of project membership
  is the row's aria-label suffix "chat in project <name>", which embeds the
  project display name and the interface language. Renaming the project (or
  running ChatGPT in another language) breaks recognition until re-locked
  from the popup. Failure mode is safe: project chats disappear from the
  sidebar; nothing foreign appears.
- The text-matched hiding in guard.js ("More", "Show more", "Move to
  project", the Search button aria-label) is English-only too, and that one
  fails open: on a non-English interface those elements stay visible, and the
  "Move to project" submenu lists all project names. Documented as
  unsupported in README. A locale-proof fix would replace label matching with
  the project's conversation list from ChatGPT's internal API (in-page
  fetch); deliberately not built for a zero-user audience.
- An empty project name must produce NO label exemption: an empty suffix
  would substring-match every project's chats (pinned by a regression test).

### 2026-08-02: Learned chat-id allowlist instead of forced canonical URLs

- First implementation rewrote project chat clicks to canonical
  `/g/<project>/c/<id>` URLs, forcing a full page load per chat switch. Now
  `guard.js` learns project chat ids from aria-labels and reports them to the
  worker, which allows their plain `/c/<id>` SPA routes (400ms grace for
  in-flight reports) and registers session DNR allow rules so a manual reload
  survives. Changing the lock resets the learned set.

### 2026-08-02: Clicks on controls inside chat rows pass through

- The whole sidebar row is one anchor; the "..." options button and pin
  button live inside it. The click guard early-returns when the click target
  resolves to a control contained in the anchor, otherwise opening the
  options menu triggered a full-page redirect.

### 2026-08-02: Service worker caching during development

- Chromium serves the cached service worker registration for unpacked
  extensions across browser restarts. After editing `background.js`, reload
  the extension explicitly (`chrome://extensions` reload button, or
  `chrome.developerPrivate.reload` over CDP). Symptom of staleness:
  `sendMessage` fails with "Receiving end does not exist" and the worker has
  no listeners.

### 2026-08-02: Changelog policy

- Git history is the changelog; no CHANGELOG.md. Commit subjects on `main`
  describe user-visible changes.

### 2026-08-02: Dependency policy

- Runtime dependencies: none, deliberately; the extension is plain JS loaded
  directly by the browser. Dev dependencies (eslint, prettier, vitest) are
  caret-ranged with a committed lockfile; dependabot updates both npm and
  github-actions ecosystems weekly.
