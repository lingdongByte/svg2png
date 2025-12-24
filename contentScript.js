let lastSvgSnapshot = null;
let dialogEl = null;

function safeText(input) {
  return String(input || "").slice(0, 200);
}

function getNearestSvg(el) {
  if (!(el instanceof Element)) return null;
  if (el.tagName && el.tagName.toLowerCase() === "svg") return el;
  return el.closest("svg");
}

function cssTextFromComputedStyle(computed) {
  const props = [
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

  const parts = [];
  for (const prop of props) {
    const v = computed.getPropertyValue(prop);
    if (!v) continue;
    parts.push(`${prop}:${v}`);
  }
  return parts.join(";");
}

function inlineComputedStyles(sourceRoot, targetRoot) {
  const sourceWalker = document.createTreeWalker(sourceRoot, NodeFilter.SHOW_ELEMENT);
  const targetWalker = document.createTreeWalker(targetRoot, NodeFilter.SHOW_ELEMENT);

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

function buildSvgText(svgEl, { inlineStyles }) {
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

  if (inlineStyles) {
    inlineComputedStyles(svgEl, clone);
  }

  const title =
    safeText(svgEl.getAttribute("aria-label")) ||
    safeText(svgEl.getAttribute("title")) ||
    safeText(svgEl.id) ||
    "svg";

  const svgText = new XMLSerializer().serializeToString(clone);
  return { title, width, height, svgText };
}

function buildSnapshot(svgEl) {
  const raw = buildSvgText(svgEl, { inlineStyles: false });
  const computed = buildSvgText(svgEl, { inlineStyles: true });
  return {
    title: computed.title || raw.title,
    width: computed.width,
    height: computed.height,
    svgTextRaw: raw.svgText,
    svgTextComputed: computed.svgText
  };
}

function ensureDialog() {
  if (dialogEl && document.documentElement.contains(dialogEl)) return dialogEl;

  const root = document.createElement("div");
  root.style.position = "fixed";
  root.style.inset = "0";
  root.style.zIndex = "2147483647";
  root.style.background = "rgba(0,0,0,0.35)";
  root.style.display = "grid";
  root.style.placeItems = "center";

  const panel = document.createElement("div");
  panel.style.width = "360px";
  panel.style.maxWidth = "calc(100vw - 24px)";
  panel.style.borderRadius = "14px";
  panel.style.border = "1px solid rgba(0,0,0,0.12)";
  panel.style.background = "#fff";
  panel.style.color = "#111827";
  panel.style.boxShadow = "0 20px 50px rgba(0,0,0,0.35)";
  panel.style.font = "13px/1.4 system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  panel.style.padding = "12px";

  const title = document.createElement("div");
  title.textContent = "导出 SVG 为 PNG";
  title.style.fontWeight = "700";
  title.style.marginBottom = "10px";

  const grid = document.createElement("div");
  grid.style.display = "grid";
  grid.style.gridTemplateColumns = "1fr 1fr";
  grid.style.gap = "10px";

  const scaleWrap = document.createElement("div");
  const scaleLabel = document.createElement("div");
  scaleLabel.textContent = "导出倍率";
  scaleLabel.style.fontSize = "12px";
  scaleLabel.style.color = "#6b7280";
  scaleLabel.style.marginBottom = "4px";
  const scaleInput = document.createElement("input");
  scaleInput.type = "number";
  scaleInput.min = "1";
  scaleInput.max = "8";
  scaleInput.step = "1";
  scaleInput.value = "2";
  scaleInput.style.width = "100%";
  scaleInput.style.padding = "6px 8px";
  scaleInput.style.borderRadius = "10px";
  scaleInput.style.border = "1px solid rgba(0,0,0,0.12)";
  scaleWrap.appendChild(scaleLabel);
  scaleWrap.appendChild(scaleInput);

  const bgWrap = document.createElement("div");
  const bgLabel = document.createElement("div");
  bgLabel.textContent = "背景";
  bgLabel.style.fontSize = "12px";
  bgLabel.style.color = "#6b7280";
  bgLabel.style.marginBottom = "4px";
  const bgSelect = document.createElement("select");
  bgSelect.style.width = "100%";
  bgSelect.style.padding = "6px 8px";
  bgSelect.style.borderRadius = "10px";
  bgSelect.style.border = "1px solid rgba(0,0,0,0.12)";
  const optT = document.createElement("option");
  optT.value = "transparent";
  optT.textContent = "透明";
  const optW = document.createElement("option");
  optW.value = "white";
  optW.textContent = "白底";
  bgSelect.appendChild(optT);
  bgSelect.appendChild(optW);
  bgWrap.appendChild(bgLabel);
  bgWrap.appendChild(bgSelect);

  const styleWrap = document.createElement("div");
  styleWrap.style.gridColumn = "1 / -1";
  const styleLabel = document.createElement("div");
  styleLabel.textContent = "样式";
  styleLabel.style.fontSize = "12px";
  styleLabel.style.color = "#6b7280";
  styleLabel.style.marginBottom = "4px";
  const styleSelect = document.createElement("select");
  styleSelect.style.width = "100%";
  styleSelect.style.padding = "6px 8px";
  styleSelect.style.borderRadius = "10px";
  styleSelect.style.border = "1px solid rgba(0,0,0,0.12)";
  const optC = document.createElement("option");
  optC.value = "computed";
  optC.textContent = "尽量还原（内联计算样式）";
  const optR = document.createElement("option");
  optR.value = "raw";
  optR.textContent = "原始 SVG（更快）";
  styleSelect.appendChild(optC);
  styleSelect.appendChild(optR);
  styleWrap.appendChild(styleLabel);
  styleWrap.appendChild(styleSelect);

  grid.appendChild(scaleWrap);
  grid.appendChild(bgWrap);
  grid.appendChild(styleWrap);

  const hint = document.createElement("div");
  hint.textContent = "请确保你对该 SVG 拥有保存/使用授权，遵守网站条款与版权法。";
  hint.style.marginTop = "10px";
  hint.style.fontSize = "12px";
  hint.style.color = "#6b7280";

  const actions = document.createElement("div");
  actions.style.display = "flex";
  actions.style.gap = "8px";
  actions.style.marginTop = "12px";
  actions.style.justifyContent = "flex-end";

  const cancelBtn = document.createElement("button");
  cancelBtn.textContent = "取消";
  cancelBtn.style.padding = "6px 10px";
  cancelBtn.style.borderRadius = "10px";
  cancelBtn.style.border = "1px solid rgba(0,0,0,0.12)";
  cancelBtn.style.background = "transparent";
  cancelBtn.style.cursor = "pointer";

  const exportBtn = document.createElement("button");
  exportBtn.textContent = "导出 PNG";
  exportBtn.style.padding = "6px 10px";
  exportBtn.style.borderRadius = "10px";
  exportBtn.style.border = "1px solid rgba(0,0,0,0.12)";
  exportBtn.style.background = "#2563eb";
  exportBtn.style.color = "#fff";
  exportBtn.style.cursor = "pointer";

  const status = document.createElement("div");
  status.style.marginTop = "10px";
  status.style.fontSize = "12px";
  status.style.color = "#6b7280";

  actions.appendChild(cancelBtn);
  actions.appendChild(exportBtn);

  panel.appendChild(title);
  panel.appendChild(grid);
  panel.appendChild(hint);
  panel.appendChild(actions);
  panel.appendChild(status);
  root.appendChild(panel);

  function close() {
    root.remove();
  }

  root.addEventListener("click", (e) => {
    if (e.target === root) close();
  });
  cancelBtn.addEventListener("click", close);

  dialogEl = root;
  dialogEl.__controls = { scaleInput, bgSelect, styleSelect, exportBtn, status, close };
  return dialogEl;
}

async function rasterizeSvgToPngDataUrl(svgText, width, height, scale, background) {
  const encoded = encodeURIComponent(svgText)
    .replace(/%0A/g, "")
    .replace(/%20/g, " ")
    .replace(/%3D/g, "=")
    .replace(/%3A/g, ":")
    .replace(/%2F/g, "/");
  const svgUrl = `data:image/svg+xml;charset=utf-8,${encoded}`;

  const img = await new Promise((resolve, reject) => {
    const i = new Image();
    i.decoding = "async";
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("Image load failed"));
    i.src = svgUrl;
  });

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
  return canvas.toDataURL("image/png");
}

function safeFilenamePart(input) {
  return String(input || "")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .slice(0, 60);
}

document.addEventListener(
  "contextmenu",
  (e) => {
    const svgEl = getNearestSvg(e.target);
    if (!svgEl) return;

    try {
      lastSvgSnapshot = buildSnapshot(svgEl);
      chrome.runtime.sendMessage({ type: "CONTEXT_SVG_SNAPSHOT", payload: lastSvgSnapshot });
    } catch {
      lastSvgSnapshot = null;
    }
  },
  true
);

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "GET_CONTEXT_SVG_SNAPSHOT") {
    sendResponse({ ok: true, payload: lastSvgSnapshot });
    return;
  }

  if (message?.type !== "OPEN_EXPORT_DIALOG") return;
  if (!lastSvgSnapshot) return;

  const dialog = ensureDialog();
  const { scaleInput, bgSelect, styleSelect, exportBtn, status, close } = dialog.__controls;
  status.textContent = "";

  if (!document.documentElement.contains(dialog)) {
    document.documentElement.appendChild(dialog);
  }

  exportBtn.onclick = async () => {
    exportBtn.disabled = true;
    try {
      status.textContent = "导出中…";
      const scale = Math.max(1, Math.min(8, Number(scaleInput.value) || 2));
      const background = bgSelect.value || "transparent";
      const mode = styleSelect.value || "computed";
      const svgText = mode === "raw" ? lastSvgSnapshot.svgTextRaw : lastSvgSnapshot.svgTextComputed;
      const dataUrl = await rasterizeSvgToPngDataUrl(
        svgText,
        lastSvgSnapshot.width,
        lastSvgSnapshot.height,
        scale,
        background
      );
      const base = safeFilenamePart(lastSvgSnapshot.title) || "svg";
      await chrome.runtime.sendMessage({
        type: "DOWNLOAD_DATA_URL",
        payload: { url: dataUrl, filename: `${base}.png`, saveAs: true }
      });
      status.textContent = "已发起下载";
      setTimeout(close, 250);
    } catch (e) {
      status.textContent = String(e?.message || e);
    } finally {
      exportBtn.disabled = false;
    }
  };
});
