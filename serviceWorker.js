async function createIconImageData(size) {
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) throw new Error("Canvas not available");

  const r = Math.max(2, Math.floor(size * 0.22));

  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = "#2563eb";
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(size - r, 0);
  ctx.quadraticCurveTo(size, 0, size, r);
  ctx.lineTo(size, size - r);
  ctx.quadraticCurveTo(size, size, size - r, size);
  ctx.lineTo(r, size);
  ctx.quadraticCurveTo(0, size, 0, size - r);
  ctx.lineTo(0, r);
  ctx.quadraticCurveTo(0, 0, r, 0);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.beginPath();
  ctx.arc(size * 0.5, size * 0.5, size * 0.32, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#1d4ed8";
  ctx.lineWidth = Math.max(1, Math.floor(size * 0.09));
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(size * 0.34, size * 0.54);
  ctx.bezierCurveTo(
    size * 0.34,
    size * 0.38,
    size * 0.66,
    size * 0.62,
    size * 0.66,
    size * 0.46
  );
  ctx.stroke();

  ctx.fillStyle = "#1d4ed8";
  ctx.beginPath();
  ctx.moveTo(size * 0.67, size * 0.33);
  ctx.lineTo(size * 0.78, size * 0.47);
  ctx.lineTo(size * 0.62, size * 0.48);
  ctx.closePath();
  ctx.fill();

  return ctx.getImageData(0, 0, size, size);
}

async function setActionIcon() {
  try {
    const icon16 = await createIconImageData(16);
    const icon32 = await createIconImageData(32);
    const icon48 = await createIconImageData(48);
    await chrome.action.setIcon({ imageData: { 16: icon16, 32: icon32, 48: icon48 } });
  } catch {}
}

function ensureContextMenu() {
  try {
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({
        id: "EXPORT_CONTEXT_SVG_AS_PNG",
        title: "导出当前 SVG 为 PNG",
        contexts: ["all"]
      });
    });
  } catch {}
}

chrome.runtime.onInstalled.addListener(() => {
  void setActionIcon();
  ensureContextMenu();
});

chrome.runtime.onStartup.addListener(() => {
  void setActionIcon();
  ensureContextMenu();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "DOWNLOAD_DATA_URL") {
    const { url, filename, saveAs } = message.payload || {};
    if (typeof url !== "string" || typeof filename !== "string") {
      sendResponse({ ok: false, error: "Invalid payload" });
      return;
    }
    if (!url.startsWith("data:image/png")) {
      sendResponse({ ok: false, error: "Only PNG data URL supported" });
      return;
    }

    chrome.downloads.download(
      { url, filename, saveAs: typeof saveAs === "boolean" ? saveAs : true },
      (downloadId) => {
        if (chrome.runtime.lastError) {
          sendResponse({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }
        sendResponse({ ok: true, downloadId });
      }
    );

    return true;
  }

  if (message?.type !== "DOWNLOAD_OBJECT_URL") return;

  const { url, filename, saveAs } = message.payload || {};
  if (typeof url !== "string" || typeof filename !== "string") {
    sendResponse({ ok: false, error: "Invalid payload" });
    return;
  }

  chrome.downloads.download(
    {
      url,
      filename,
      saveAs: typeof saveAs === "boolean" ? saveAs : true
    },
    (downloadId) => {
      if (chrome.runtime.lastError) {
        sendResponse({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      sendResponse({ ok: true, downloadId });
    }
  );

  return true;
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== "EXPORT_CONTEXT_SVG_AS_PNG") return;
  const tabId = tab?.id;
  if (typeof tabId !== "number") return;
  chrome.tabs.sendMessage(tabId, { type: "OPEN_EXPORT_DIALOG" }, () => {
    if (chrome.runtime.lastError) {
      try {
        chrome.action.openPopup();
      } catch {}
    }
  });
});
