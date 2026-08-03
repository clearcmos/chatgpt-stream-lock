// Popup: shows the current lock and offers to lock onto the project whose
// home page is open in the active tab. The id comes from the URL; the display
// name comes from the tab title ("ChatGPT - <name>"), falling back to the URL
// slug. The name matters: sidebar rows are recognized by the aria-label
// "chat in project <name>", so re-lock from the project page after renaming.

async function render() {
  const currentEl = document.getElementById("current");
  const lockBtn = document.getElementById("lockBtn");
  const clearBtn = document.getElementById("clearBtn");
  const hint = document.getElementById("hint");

  const { lock } = await chrome.storage.local.get("lock");
  if (lock?.projectId) {
    currentEl.innerHTML = '<div class="name"></div><div class="id"></div>';
    currentEl.querySelector(".name").textContent =
      `Locked to: ${lock.projectName || "(unnamed)"}`;
    currentEl.querySelector(".id").textContent = lock.projectId;
    clearBtn.hidden = false;
  } else {
    currentEl.textContent = "Not locked. Everything is visible.";
    clearBtn.hidden = true;
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const candidate = StreamMode.projectFromTab(tab);
  if (candidate && candidate.projectId !== lock?.projectId) {
    lockBtn.disabled = false;
    lockBtn.textContent = `Lock to this project: ${candidate.projectName}`;
    hint.textContent = "";
    lockBtn.onclick = async () => {
      await chrome.storage.local.set({ lock: candidate });
      if (tab?.id != null) chrome.tabs.reload(tab.id);
      window.close();
    };
  } else if (candidate) {
    lockBtn.disabled = true;
    lockBtn.textContent = "Already locked to this project";
    hint.textContent =
      "After renaming the project, clear the lock and lock again from its home page.";
  } else {
    lockBtn.disabled = true;
    lockBtn.textContent = "Lock to this project";
    hint.textContent =
      "Open the home page of a ChatGPT project (URL like chatgpt.com/g/g-p-.../project) to lock onto it.";
  }

  // Two-step clear so a stray click cannot disarm mid-stream.
  let armed = false;
  clearBtn.onclick = async () => {
    if (!armed) {
      armed = true;
      clearBtn.textContent = "Really clear? Everything becomes visible";
      return;
    }
    await chrome.storage.local.remove("lock");
    const [t] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (t?.id != null && t.url && /^https:\/\/chatgpt\.com\//.test(t.url))
      chrome.tabs.reload(t.id);
    window.close();
  };
}

render();
