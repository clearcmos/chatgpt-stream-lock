import { describe, expect, it } from "vitest";
import StreamMode from "../lib.js";

const PROJECT_ID = "g-p-0123456789abcdef0123456789abcdef";
const CHAT_ID = "0a1b2c3d-4e5f-6071-8293-a4b5c6d7e8f9";

describe("chatIdFromPath", () => {
  it("extracts the id from a plain /c/ path", () => {
    expect(StreamMode.chatIdFromPath(`/c/${CHAT_ID}`)).toBe(CHAT_ID);
  });

  it("extracts the id from a canonical project chat path, slugged or not", () => {
    // Regression: ChatGPT serves project chats under /g/<id>/c/<id> and
    // /g/<id>-<slug>/c/<id>; the first cut only handled the plain form.
    expect(StreamMode.chatIdFromPath(`/g/${PROJECT_ID}/c/${CHAT_ID}`)).toBe(
      CHAT_ID,
    );
    expect(
      StreamMode.chatIdFromPath(`/g/${PROJECT_ID}-streaming/c/${CHAT_ID}`),
    ).toBe(CHAT_ID);
  });

  it("lowercases the id so set membership is case-stable", () => {
    expect(StreamMode.chatIdFromPath(`/c/${CHAT_ID.toUpperCase()}`)).toBe(
      CHAT_ID,
    );
  });

  it("rejects paths that are not conversations", () => {
    expect(StreamMode.chatIdFromPath("/")).toBeNull();
    expect(StreamMode.chatIdFromPath("/gpts")).toBeNull();
    expect(StreamMode.chatIdFromPath(`/g/${PROJECT_ID}/project`)).toBeNull();
    expect(StreamMode.chatIdFromPath("/c/short")).toBeNull();
    expect(
      StreamMode.chatIdFromPath("/cc/0a1b2c3d-4e5f-6071-8293-a4b5c6d7e8f9"),
    ).toBeNull();
  });
});

describe("labelForProject", () => {
  it("builds the aria-label suffix ChatGPT puts on project chat rows", () => {
    expect(StreamMode.labelForProject("streaming")).toBe(
      "chat in project streaming",
    );
  });

  it("returns null without a name instead of an empty suffix", () => {
    // Regression: an empty suffix would substring-match the label of every
    // project's chats and exempt all of them from hiding.
    expect(StreamMode.labelForProject("")).toBeNull();
    expect(StreamMode.labelForProject(undefined)).toBeNull();
  });
});

describe("allowedUrl", () => {
  const opts = { projectId: PROJECT_ID, knownIds: new Set() };

  it("allows everything inside the locked project, slug or query included", () => {
    expect(
      StreamMode.allowedUrl(
        `https://chatgpt.com/g/${PROJECT_ID}/project`,
        opts,
      ),
    ).toBe(true);
    expect(
      StreamMode.allowedUrl(
        `https://chatgpt.com/g/${PROJECT_ID}-streaming/c/${CHAT_ID}?tab=chats`,
        opts,
      ),
    ).toBe(true);
  });

  it("allows login routes so an expired session can be renewed", () => {
    expect(StreamMode.allowedUrl("https://chatgpt.com/auth/login", opts)).toBe(
      true,
    );
    expect(
      StreamMode.allowedUrl("https://chatgpt.com/api/auth/callback", opts),
    ).toBe(true);
  });

  it("blocks the rest of chatgpt.com", () => {
    expect(StreamMode.allowedUrl("https://chatgpt.com/", opts)).toBe(false);
    expect(StreamMode.allowedUrl("https://chatgpt.com/library", opts)).toBe(
      false,
    );
    expect(
      StreamMode.allowedUrl(
        `https://chatgpt.com/g/g-p-ffffffffffffffff/project`,
        opts,
      ),
    ).toBe(false);
    expect(
      StreamMode.allowedUrl(`https://chatgpt.com/c/${CHAT_ID}`, opts),
    ).toBe(false);
  });

  it("allows a plain /c/ URL once its id is known to belong to the project", () => {
    // Regression: sidebar Recents rows link project chats as plain /c/<id>;
    // without the learned-id allowance every chat switch forced a full page
    // reload (2026-08-02).
    const known = { projectId: PROJECT_ID, knownIds: new Set([CHAT_ID]) };
    expect(
      StreamMode.allowedUrl(`https://chatgpt.com/c/${CHAT_ID}`, known),
    ).toBe(true);
    expect(
      StreamMode.allowedUrl(
        "https://chatgpt.com/c/99999999-0000-0000-0000-000000000000",
        known,
      ),
    ).toBe(false);
  });

  it("resolves relative URLs against the provided base", () => {
    const base = "https://chatgpt.com/g/whatever";
    expect(StreamMode.allowedUrl("/library", { ...opts, base })).toBe(false);
    expect(
      StreamMode.allowedUrl(`/g/${PROJECT_ID}/project`, { ...opts, base }),
    ).toBe(true);
  });

  it("fails open for other origins and unparseable input", () => {
    // Off-site links in chat answers (citations, sources) are out of scope.
    expect(StreamMode.allowedUrl("https://example.com/c/whatever", opts)).toBe(
      true,
    );
    expect(StreamMode.allowedUrl("https://chat.openai.com/", opts)).toBe(true);
    expect(StreamMode.allowedUrl("not a url", opts)).toBe(true);
  });
});

describe("projectFromTab", () => {
  const HOME = `https://chatgpt.com/g/${PROJECT_ID}/project`;

  it("reads the id from the URL and the name from the tab title", () => {
    expect(
      StreamMode.projectFromTab({ url: HOME, title: "ChatGPT - streaming" }),
    ).toEqual({
      projectId: PROJECT_ID,
      projectName: "streaming",
    });
  });

  it("accepts slugged project URLs and query strings", () => {
    expect(
      StreamMode.projectFromTab({
        url: `https://chatgpt.com/g/${PROJECT_ID}-streaming/project?tab=chats`,
        title: "ChatGPT - streaming",
      }),
    ).toEqual({ projectId: PROJECT_ID, projectName: "streaming" });
  });

  it("falls back to the URL slug when the title has no name", () => {
    expect(
      StreamMode.projectFromTab({
        url: `https://chatgpt.com/g/${PROJECT_ID}-learning-development/project`,
        title: "weird title",
      }),
    ).toEqual({ projectId: PROJECT_ID, projectName: "learning development" });
  });

  it("returns null off project home pages", () => {
    expect(
      StreamMode.projectFromTab({
        url: `https://chatgpt.com/c/${CHAT_ID}`,
        title: "ChatGPT - x",
      }),
    ).toBeNull();
    expect(
      StreamMode.projectFromTab({
        url: "https://example.com/g/g-p-123/project",
        title: "ChatGPT - x",
      }),
    ).toBeNull();
    expect(
      StreamMode.projectFromTab({ url: HOME, title: "no name here" }),
    ).toBeNull();
    expect(
      StreamMode.projectFromTab({ url: "::::", title: "ChatGPT - x" }),
    ).toBeNull();
    expect(StreamMode.projectFromTab(undefined)).toBeNull();
    expect(StreamMode.projectFromTab({})).toBeNull();
  });
});

describe("buildCss", () => {
  it("hides identity and foreign content while exempting project chat rows", () => {
    const css = StreamMode.buildCss(PROJECT_ID, "streaming");
    expect(css).toContain('[data-testid="accounts-profile-button"]');
    expect(css).toContain(`a[href^="/g/"]:not([href*="${PROJECT_ID}"])`);
    expect(css).toContain(':not([aria-label*="chat in project streaming"])');
    expect(css).toContain('nav button[aria-label="Search"]');
    expect(css).toContain(':not([data-testid="create-new-chat-button"])');
  });

  it("emits no label exemption without a project name", () => {
    // Regression guard: see labelForProject. A wildcard label exemption would
    // un-hide every project's chats.
    const css = StreamMode.buildCss(PROJECT_ID, "");
    expect(css).not.toContain("chat in project");
    expect(css).toContain('a[href^="/c/"] { display: none !important; }');
  });

  it("escapes quotes and backslashes in the project name", () => {
    // Attribute selectors wrap the label in double quotes; an unescaped name
    // would break out of the selector string.
    const css = StreamMode.buildCss(PROJECT_ID, 'my "cool\\ project');
    expect(css).toContain('chat in project my \\"cool\\\\ project');
  });
});
