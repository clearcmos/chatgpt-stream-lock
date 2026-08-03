# chatgpt-stream-lock

A Chromium extension (Manifest V3) that locks the ChatGPT web interface to a
single project, for streaming or screen sharing. Everything outside the chosen
project is hidden and unreachable: other conversations, other projects, search,
history, and the account name in the sidebar. Chats inside the project behave
normally.

Built for streaming a coding project on Twitch without personal ChatGPT
history ever reaching the screen.

## What it does

Once locked to a project:

- Full-page navigations on chatgpt.com (plus chat.openai.com and chat.com)
  that leave the project are redirected to the project home before the
  request is sent (declarativeNetRequest rules built from the configured
  lock).
- Client-side route changes to anything outside the project snap back to the
  project home (webNavigation service worker).
- Clicks on links that would leave the project are cancelled; Ctrl/Cmd+K
  global search is blocked.
- The interface is stripped by injected CSS: other conversations, other
  projects, Library/Scheduled/Plugins, the sidebar search button, the
  "Move to project" menu (its submenu lists every project name), and the
  account/profile button with the account name.
- The project's own chats stay visible in the sidebar and switch instantly
  via normal client routing. The extension learns which conversation ids
  belong to the project from the sidebar's accessibility labels and allows
  those routes, including across manual reloads.
- The New chat button stays visible and lands on the project home, where the
  composer starts a new chat inside the project.

Login routes stay reachable so an expired session can be renewed. With no
lock configured the extension is inert.

## Install

No build step; the repository is the extension.

1. Clone this repository.
2. Open `chrome://extensions`, enable Developer mode.
3. Load unpacked, select the repository directory.

Works on Chromium, Chrome, and Brave.

## Configure

1. Open the home page of the project to lock onto
   (`chatgpt.com/g/g-p-.../project`).
2. Click the extension icon and press "Lock to this project".

The lock persists in extension storage. Clearing it (two-step button in the
popup) makes the extension inert again.

If you rename the project in ChatGPT, re-lock from its home page: project
chats in the sidebar are recognized by an accessibility label that embeds the
project's display name.

## Limitations

- Built against ChatGPT's English interface. On a non-English interface the
  navigation lockdown still holds (it is URL-based), but project chats
  disappear from the sidebar list, and the few elements hidden by matching
  English text stay visible: the sidebar Search button and the conversation
  menu's "Move to project" item, whose submenu lists all project names. Treat
  non-English interfaces as unsupported for now.
- Selectors follow ChatGPT's current DOM. A redesign can require updates; the
  failure mode is hidden-too-much, not leaking.
- This is a display and navigation filter in one browser profile, not a
  security boundary. The account still has every conversation server-side,
  and other profiles or devices are unaffected.

## Development

```
npm ci                  # dev dependencies (runtime has none)
npm test                # unit tests (vitest)
npm run test:coverage   # tests plus coverage gate
npm run lint            # eslint
npm run format:check    # prettier
```

Pure logic lives in `lib.js` and is unit-tested; the content script, service
worker, and popup are thin browser-bound layers over it. See CLAUDE.md for
structure and the engineering decision log.
