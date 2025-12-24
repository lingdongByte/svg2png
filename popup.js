const statusEl = document.getElementById("status");
const listEl = document.getElementById("list");
const rescanBtn = document.getElementById("rescanBtn");
const downloadAllBtn = document.getElementById("downloadAllBtn");
const scaleInput = document.getElementById("scaleInput");
const inlineStyleSelect = document.getElementById("inlineStyleSelect");
const bgSelect = document.getElementById("bgSelect");
const visibleOnlyCheckbox = document.getElementById("visibleOnly");

const MAX_ITEMS = 60;
let currentAssets = [];

function setStatus(text) {
  statusEl.textContent = text;
}

function svgToDataUrl(svgText) {
  const encoded = encodeURIComponent(svgText)
    .replace(/%0A/g, "")
    .replace(/%20/g, " ")
    .replace(/%3D/g, "=")
    .replace(/%3A/g, ":")
    .replace(/%2F/g, "/");

  return `data:image/svg+xml;charset=utf-8,${encoded}`;
}

function safeFilenamePart(input) {
  return String(input || "")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .slice(0, 60);
}

function filenameForAsset(asset) {
  const indexPart = `svg-${String(asset.index + 1).padStart(3, "0")}`;
  const titlePart = safeFilenamePart(asset.title);
  if (titlePart) return `${indexPart}-${titlePart}.png`;
  return `${indexPart}.png`;
}

async function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image load failed"));
    img.src = url;
  });
}

async function rasterizeSvgToPngBlob(svgText, width, height, scale, background) {
  const svgUrl = svgToDataUrl(svgText);
  const img = await loadImage(svgUrl);

  const exportWidth = Math.max(1, Math.round(width * scale));
  const exportHeight = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = exportWidth;
  canvas.height = exportHeight;

  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) throw new Error("Canvas not available");

  ctx.clearRect(0, 0, exportWidth, exportHeight);
  if (background === "white") {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, exportWidth, exportHeight);
  }
  ctx.drawImage(img, 0, 0, exportWidth, exportHeight);

  const blob = await new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/png")
  );

  if (!blob) throw new Error("PNG export failed");
  return blob;
}

async function downloadBlob(blob, filename, saveAs) {
  const url = URL.createObjectURL(blob);
  try {
    const resp = await chrome.runtime.sendMessage({
      type: "DOWNLOAD_OBJECT_URL",
      payload: { url, filename, saveAs }
    });
    if (resp?.ok) return;

    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noreferrer";
    a.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}

function clearList() {
  listEl.textContent = "";
}

function renderAssets(assets) {
  clearList();
  currentAssets = assets;
  downloadAllBtn.disabled = assets.length === 0;

  if (!assets.length) {
    setStatus("未发现可导出的 SVG（仅扫描内联 SVG 元素）");
    return;
  }

  setStatus(`发现 ${assets.length} 个 SVG`);

  for (const asset of assets) {
    const item = document.createElement("div");
    item.className = "item";

    const thumb = document.createElement("div");
    thumb.className = "thumb";

    const img = document.createElement("img");
    img.alt = asset.title || asset.id || "svg";
    img.src = svgToDataUrl(asset.svgTextPreview || asset.svgText);
    thumb.appendChild(img);

    const meta = document.createElement("div");
    meta.className = "meta";

    const title = document.createElement("div");
    title.className = "title";
    title.textContent = asset.title || asset.id || `SVG #${asset.index + 1}`;

    const sub = document.createElement("div");
    sub.className = "sub";
    sub.textContent = `${Math.round(asset.width)}×${Math.round(asset.height)}  ${asset.selector}`;

    const actions = document.createElement("div");
    actions.className = "actions";

    const downloadBtn = document.createElement("button");
    downloadBtn.className = "primary";
    downloadBtn.textContent = "下载 PNG";
    downloadBtn.addEventListener("click", async () => {
      downloadBtn.disabled = true;
      try {
        const scale = Math.max(1, Math.min(8, Number(scaleInput.value) || 2));
        const background = bgSelect?.value || "transparent";
        const blob = await rasterizeSvgToPngBlob(
          asset.svgText,
          asset.width,
          asset.height,
          scale,
          background
        );
        await downloadBlob(blob, filenameForAsset(asset), true);
      } catch (e) {
        setStatus(String(e?.message || e));
      } finally {
        downloadBtn.disabled = false;
      }
    });

    const copyBtn = document.createElement("button");
    copyBtn.textContent = "复制 SVG";
    copyBtn.addEventListener("click", async () => {
      copyBtn.disabled = true;
      try {
        await navigator.clipboard.writeText(asset.svgText);
        setStatus("已复制 SVG 源码");
      } catch (e) {
        setStatus(String(e?.message || e));
      } finally {
        copyBtn.disabled = false;
      }
    });

    actions.appendChild(downloadBtn);
    actions.appendChild(copyBtn);

    meta.appendChild(title);
    meta.appendChild(sub);
    meta.appendChild(actions);

    item.appendChild(thumb);
    item.appendChild(meta);
    listEl.appendChild(item);
  }
}

function scanSvgInPage({ inlineStyleMode, limit, visibleOnly }) {
  const maxItems = Math.max(1, Math.min(200, Number(limit) || 60));
  const STYLE_PROPS = [
    "fill",
    "fill-opacity",
    "stroke",
    "stroke-width",
    "stroke-linecap",
    "stroke-linejoin",
    "stroke-miterlimit",
    "stroke-dasharray",
    "stroke-dashoffset",
    "stroke-opacity",
    "opacity",
    "color",
    "font-family",
    "font-size",
    "font-weight",
    "font-style",
    "letter-spacing",
    "word-spacing",
    "text-anchor",
    "dominant-baseline",
    "baseline-shift",
    "clip-path",
    "clip-rule",
    "mask",
    "filter",
    "mix-blend-mode"
  ];

  function cssTextFromComputedStyle(computed) {
    const parts = [];
    for (const prop of STYLE_PROPS) {
      const v = computed.getPropertyValue(prop);
      if (!v) continue;
      parts.push(`${prop}:${v}`);
    }
    return parts.join(";");
  }

  function inlineComputedStyles(sourceRoot, targetRoot) {
    const sourceWalker = document.createTreeWalker(
      sourceRoot,
      NodeFilter.SHOW_ELEMENT
    );
    const targetWalker = document.createTreeWalker(
      targetRoot,
      NodeFilter.SHOW_ELEMENT
    );

    let srcNode = sourceWalker.currentNode;
    let dstNode = targetWalker.currentNode;

    while (srcNode && dstNode) {
      if (srcNode instanceof Element && dstNode instanceof Element) {
        const computed = getComputedStyle(srcNode);
        const text = cssTextFromComputedStyle(computed);
        if (text) {
          const existing = dstNode.getAttribute("style") || "";
          dstNode.setAttribute("style", existing ? `${existing};${text}` : text);
        }
      }
      srcNode = sourceWalker.nextNode();
      dstNode = targetWalker.nextNode();
    }
  }

  function sizeFromViewBox(svgEl) {
    const vb = svgEl.getAttribute("viewBox");
    if (!vb) return null;
    const parts = vb
      .trim()
      .split(/[\s,]+/)
      .map((p) => Number(p))
      .filter((n) => Number.isFinite(n));
    if (parts.length !== 4) return null;
    const w = parts[2];
    const h = parts[3];
    if (w > 0 && h > 0) return { width: w, height: h };
    return null;
  }

  function inferSvgSize(svgEl) {
    const rect = svgEl.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) return { width: rect.width, height: rect.height };

    const fromViewBox = sizeFromViewBox(svgEl);
    if (fromViewBox) return fromViewBox;

    try {
      const bbox = svgEl.getBBox();
      if (bbox.width > 0 && bbox.height > 0) return { width: bbox.width, height: bbox.height };
    } catch {}

    return { width: 256, height: 256 };
  }

  function isElementVisible(svgEl) {
    const rect = svgEl.getBoundingClientRect();
    if (!(rect.width > 0 && rect.height > 0)) return false;
    if (rect.bottom <= 0 || rect.right <= 0) return false;
    if (rect.top >= window.innerHeight || rect.left >= window.innerWidth) return false;
    const computed = getComputedStyle(svgEl);
    if (computed.display === "none" || computed.visibility === "hidden") return false;
    if (Number(computed.opacity) === 0) return false;
    return true;
  }

  function normalizeSvg(svgEl) {
    const inferred = inferSvgSize(svgEl);
    const width = Math.max(1, inferred.width || 0);
    const height = Math.max(1, inferred.height || 0);

    const clone = svgEl.cloneNode(true);
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");

    const currentWidth = clone.getAttribute("width");
    const currentHeight = clone.getAttribute("height");
    if (!currentWidth || currentWidth === "0") clone.setAttribute("width", String(width));
    if (!currentHeight || currentHeight === "0") clone.setAttribute("height", String(height));

    if (inlineStyleMode === "computed") {
      inlineComputedStyles(svgEl, clone);
    }

    const title =
      svgEl.getAttribute("aria-label") ||
      svgEl.getAttribute("title") ||
      svgEl.id ||
      "";

    let selector = "svg";
    try {
      if (svgEl.id) selector = `#${CSS.escape(svgEl.id)}`;
      else if (svgEl.classList?.length) selector = `.${[...svgEl.classList].map((c) => CSS.escape(c)).join(".")}`;
    } catch {}

    const svgText = new XMLSerializer().serializeToString(clone);
    const previewClone = clone.cloneNode(true);
    previewClone.removeAttribute("width");
    previewClone.removeAttribute("height");
    const svgTextPreview = new XMLSerializer().serializeToString(previewClone);

    return { title, selector, width, height, svgText, svgTextPreview };
  }

  const svgs = Array.from(document.querySelectorAll("svg"));
  const assets = [];
  for (let i = 0; i < svgs.length; i++) {
    const svg = svgs[i];
    if (visibleOnly && !isElementVisible(svg)) continue;
    const normalized = normalizeSvg(svg);
    assets.push({ id: `svg-${i}`, index: i, ...normalized });
    if (assets.length >= maxItems) break;
  }

  return assets;
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}

async function scan() {
  setStatus("扫描中…");
  clearList();
  rescanBtn.disabled = true;
  downloadAllBtn.disabled = true;

  try {
    const tab = await getActiveTab();
    if (!tab?.id) throw new Error("No active tab");

    const inlineStyleMode = inlineStyleSelect.value || "computed";
    const visibleOnly = Boolean(visibleOnlyCheckbox?.checked);

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: scanSvgInPage,
      args: [{ inlineStyleMode, limit: MAX_ITEMS, visibleOnly }]
    });

    const assets = (results?.[0]?.result || []).slice(0, MAX_ITEMS);
    renderAssets(assets);
  } catch (e) {
    setStatus(String(e?.message || e));
  } finally {
    rescanBtn.disabled = false;
  }
}

rescanBtn.addEventListener("click", scan);
inlineStyleSelect.addEventListener("change", scan);
visibleOnlyCheckbox.addEventListener("change", scan);

downloadAllBtn.addEventListener("click", async () => {
  if (!currentAssets.length) return;

  downloadAllBtn.disabled = true;
  rescanBtn.disabled = true;
  try {
    const scale = Math.max(1, Math.min(8, Number(scaleInput.value) || 2));
    const background = bgSelect?.value || "transparent";
    for (let i = 0; i < currentAssets.length; i++) {
      setStatus(`批量导出中… ${i + 1}/${currentAssets.length}`);
      const asset = currentAssets[i];
      const blob = await rasterizeSvgToPngBlob(
        asset.svgText,
        asset.width,
        asset.height,
        scale,
        background
      );
      await downloadBlob(blob, filenameForAsset(asset), false);
      await new Promise((r) => setTimeout(r, 30));
    }
    setStatus(`批量导出完成：${currentAssets.length} 个 PNG`);
  } catch (e) {
    setStatus(String(e?.message || e));
  } finally {
    rescanBtn.disabled = false;
    downloadAllBtn.disabled = currentAssets.length === 0;
  }
});
scan();
