function resolveSiteUrl(relativePath) {
  return new URL(relativePath, document.baseURI).href;
}

const state = {
  assets: [],
  filteredAssets: [],
  selectedCategory: "all",
  pngAvailability: new Map(),
};

const elements = {
  grid: document.getElementById("assetGrid"),
  empty: document.getElementById("emptyState"),
  search: document.getElementById("searchInput"),
  categoryTabs: Array.from(document.querySelectorAll(".category-tab")),
  template: document.getElementById("assetCardTemplate"),
  repoLink: document.getElementById("repoLink"),
};

/** @type {{ asset: object, workingData: object, groups: { refs: object[] }[] } | null} */
let colorEditState = null;

let colorEditDialogPreviewFrame = null;

init().catch((error) => {
  if (elements.empty) {
    elements.empty.classList.remove("hidden");
    elements.empty.textContent = `로드 실패: ${error.message}`;
  } else {
    console.error("로드 실패:", error);
  }
});

async function init() {
  const config = await loadAssetIndex();
  state.assets = config.assets;
  elements.repoLink.href = config.repoUrl || "#";
  await primePngAvailability(state.assets);

  elements.search.addEventListener("input", applyFilters);
  elements.categoryTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      state.selectedCategory = tab.dataset.category || "all";
      elements.categoryTabs.forEach((btn) => {
        const active = btn === tab;
        btn.classList.toggle("active", active);
        btn.setAttribute("aria-pressed", active ? "true" : "false");
      });
      applyFilters();
    });
  });

  elements.categoryTabs.forEach((btn) => {
    btn.setAttribute("aria-pressed", btn.classList.contains("active") ? "true" : "false");
  });

  applyFilters();
  initColorEditDialog();
}

function derivePngPath(assetPath) {
  if (typeof assetPath !== "string" || !assetPath.toLowerCase().endsWith(".json")) {
    return null;
  }
  return assetPath.replace(/\.json$/i, ".png");
}

function isStaticLottieColorC(c) {
  if (!c || typeof c !== "object" || !Array.isArray(c.k)) {
    return false;
  }
  if (c.k.length !== 4) {
    return false;
  }
  if (!c.k.every((x) => typeof x === "number" && Number.isFinite(x))) {
    return false;
  }
  if (c.a === 1) {
    return false;
  }
  return true;
}

function collectStaticLottieColorCKs(root) {
  const out = [];
  function walk(node) {
    if (!node || typeof node !== "object") {
      return;
    }
    if ((node.ty === "fl" || node.ty === "st") && isStaticLottieColorC(node.c)) {
      out.push(node.c);
    }
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    for (const key of Object.keys(node)) {
      walk(node[key]);
    }
  }
  walk(root);
  return out;
}

function colorGroupKey(kArr) {
  return kArr.map((x) => Math.round(x * 1e5) / 1e5).join("|");
}

function groupLottieColorRefs(refs) {
  const map = new Map();
  for (const c of refs) {
    const key = colorGroupKey(c.k);
    if (!map.has(key)) {
      map.set(key, []);
    }
    map.get(key).push(c);
  }
  return [...map.values()].map((groupRefs) => ({ refs: groupRefs }));
}

function rgb01ToHex(r, g, b) {
  const to255 = (x) => Math.max(0, Math.min(255, Math.round(x <= 1 ? x * 255 : x)));
  return `#${[to255(r), to255(g), to255(b)]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("")}`;
}

function hexToRgb01(hex) {
  const h = hex.replace("#", "").trim();
  if (h.length !== 6) {
    return null;
  }
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  if ([r, g, b].some((x) => Number.isNaN(x))) {
    return null;
  }
  return { r, g, b };
}

const editableJsonCache = new Map();

async function jsonHasEditableLottieColors(relativePath) {
  if (editableJsonCache.has(relativePath)) {
    return editableJsonCache.get(relativePath);
  }
  try {
    const res = await fetch(resolveSiteUrl(relativePath));
    if (!res.ok) {
      editableJsonCache.set(relativePath, false);
      return false;
    }
    const data = await res.json();
    const ok = collectStaticLottieColorCKs(data).length > 0;
    editableJsonCache.set(relativePath, ok);
    return ok;
  } catch {
    editableJsonCache.set(relativePath, false);
    return false;
  }
}

function cloneLottieAnimationData(data) {
  return JSON.parse(JSON.stringify(data));
}

function mountLottieJsonPreview(asset, container, animationData) {
  if (container._lottieResizeObserver) {
    container._lottieResizeObserver.disconnect();
    container._lottieResizeObserver = null;
  }
  const prev = container._lottieAnim;
  if (prev) {
    prev.destroy();
    container._lottieAnim = null;
  }
  container.innerHTML = "";
  const host = document.createElement("div");
  host.className = "lottie-mount-host";
  container.appendChild(host);
  const opts = {
    container: host,
    renderer: "svg",
    loop: true,
    autoplay: true,
    rendererSettings: {
      progressiveLoad: false,
      preserveAspectRatio: "xMidYMid meet",
    },
  };
  if (animationData) {
    opts.animationData = cloneLottieAnimationData(animationData);
  } else {
    opts.path = resolveSiteUrl(asset.path);
  }
  try {
    const anim = lottie.loadAnimation(opts);
    container._lottieAnim = anim;
    const resizeAnim = () => {
      try {
        if (typeof anim.resize === "function") {
          anim.resize();
        }
      } catch {
        /* ignore */
      }
    };
    anim.addEventListener("DOMLoaded", resizeAnim);
    anim.addEventListener("data_ready", resizeAnim);
    requestAnimationFrame(resizeAnim);
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(() => {
        resizeAnim();
      });
      ro.observe(host);
      container._lottieResizeObserver = ro;
    }
  } catch {
    container.innerHTML = '<p class="preview-error">JSON 미리보기 실패</p>';
  }
}

async function checkPathExists(path) {
  const url = resolveSiteUrl(path);
  try {
    const response = await fetch(url, { method: "HEAD" });
    if (response.ok) {
      return true;
    }
    if (response.status !== 405) {
      return false;
    }
  } catch {
    return false;
  }

  try {
    const response = await fetch(url, { method: "GET" });
    return response.ok;
  } catch {
    return false;
  }
}

async function primePngAvailability(assets) {
  const jsonAssets = assets.filter((asset) => asset.type === "json");
  await Promise.all(
    jsonAssets.map(async (asset) => {
      const pngPath = derivePngPath(asset.path);
      if (!pngPath) {
        return;
      }
      const exists = await checkPathExists(pngPath);
      state.pngAvailability.set(asset.path, exists);
    }),
  );
}

function assetFolderFromPath(asset) {
  const p = (asset.path || "").replace(/\\/g, "/").toLowerCase();
  if (p.includes("assets/loader/")) {
    return "loader";
  }
  if (p.includes("assets/icon/")) {
    return "icon";
  }
  if (p.includes("assets/dobi/")) {
    return "dobi";
  }
  return null;
}

function assetMatchesCategory(asset, category) {
  if (category === "all") {
    return true;
  }
  const folder = assetFolderFromPath(asset);
  if (category === "loader") {
    return folder === "loader";
  }
  if (category === "icon") {
    return folder === "icon";
  }
  if (category === "dobi") {
    return folder === "dobi";
  }
  return false;
}

function assetMatchesSearch(asset, query) {
  if (!query) {
    return true;
  }
  const haystack = `${asset.title} ${(asset.tags || []).join(" ")} ${asset.note || ""}`.toLowerCase();
  return haystack.includes(query);
}

/** Loader 탭: 태그 기준 circle → spinner → dot 순. 다중 태그는 dot > spinner > circle 우선. */
function loaderVisualGroupRank(asset) {
  const tags = new Set((asset.tags || []).map((t) => String(t).toLowerCase()));
  if (tags.has("dot")) {
    return 2;
  }
  if (tags.has("spinner")) {
    return 1;
  }
  if (tags.has("circle")) {
    return 0;
  }
  return 0;
}

function sortLoaderTabAssets(assets) {
  return [...assets].sort((a, b) => {
    const ra = loaderVisualGroupRank(a);
    const rb = loaderVisualGroupRank(b);
    if (ra !== rb) {
      return ra - rb;
    }
    return (a.path || "").localeCompare(b.path || "", "en");
  });
}

/** Icon 탭: 태그 기준 ONEAI(oneai) → status → service 순. 다중 태그는 oneai > status > service 우선. */
function iconVisualGroupRank(asset) {
  const tags = new Set((asset.tags || []).map((t) => String(t).toLowerCase()));
  if (tags.has("oneai")) {
    return 0;
  }
  if (tags.has("status")) {
    return 1;
  }
  if (tags.has("service")) {
    return 2;
  }
  return 3;
}

function sortIconTabAssets(assets) {
  return [...assets].sort((a, b) => {
    const ra = iconVisualGroupRank(a);
    const rb = iconVisualGroupRank(b);
    if (ra !== rb) {
      return ra - rb;
    }
    return (a.path || "").localeCompare(b.path || "", "en");
  });
}

function folderSortRankForAll(asset) {
  const folder = assetFolderFromPath(asset);
  if (folder === "loader") {
    return 0;
  }
  if (folder === "icon") {
    return 1;
  }
  if (folder === "dobi") {
    return 2;
  }
  return 3;
}

function subgroupRankForAll(asset) {
  const folder = assetFolderFromPath(asset);
  if (folder === "loader") {
    return loaderVisualGroupRank(asset);
  }
  if (folder === "icon") {
    return iconVisualGroupRank(asset);
  }
  return 0;
}

/** 전체 탭: Loader → Icon → Dobi, 각 폴더는 해당 탭과 동일한 태그 그룹 순 */
function sortAllTabAssets(assets) {
  return [...assets].sort((a, b) => {
    const fa = folderSortRankForAll(a);
    const fb = folderSortRankForAll(b);
    if (fa !== fb) {
      return fa - fb;
    }
    const sa = subgroupRankForAll(a);
    const sb = subgroupRankForAll(b);
    if (sa !== sb) {
      return sa - sb;
    }
    return (a.path || "").localeCompare(b.path || "", "en");
  });
}

function updateCategoryTabLabels() {
  const query = elements.search.value.trim().toLowerCase();

  elements.categoryTabs.forEach((tab) => {
    const category = tab.dataset.category || "all";
    const baseLabel = (tab.dataset.tabLabel || category).trim();
    const count = state.assets.filter(
      (asset) => assetMatchesCategory(asset, category) && assetMatchesSearch(asset, query),
    ).length;
    tab.textContent = `${baseLabel} (${count})`;
  });
}

async function loadAssetIndex() {
  let response;
  try {
    response = await fetch(resolveSiteUrl("./assets/index.json"));
  } catch (error) {
    if (window.location.protocol === "file:") {
      throw new Error("파일을 직접 열면 불러올 수 없습니다. 로컬 서버(http://localhost)로 실행해주세요.");
    }
    throw new Error(`assets/index.json 요청 실패: ${error.message}`);
  }

  if (!response.ok) {
    throw new Error(`assets/index.json 파일을 불러올 수 없습니다. (HTTP ${response.status})`);
  }

  const json = await response.json();
  if (!Array.isArray(json.assets)) {
    throw new Error("assets/index.json 형식이 올바르지 않습니다.");
  }

  return json;
}

function applyFilters() {
  const query = elements.search.value.trim().toLowerCase();

  state.filteredAssets = state.assets.filter(
    (asset) =>
      assetMatchesCategory(asset, state.selectedCategory) && assetMatchesSearch(asset, query),
  );

  if (state.selectedCategory === "loader") {
    state.filteredAssets = sortLoaderTabAssets(state.filteredAssets);
  } else if (state.selectedCategory === "icon") {
    state.filteredAssets = sortIconTabAssets(state.filteredAssets);
  } else if (state.selectedCategory === "all") {
    state.filteredAssets = sortAllTabAssets(state.filteredAssets);
  }

  updateCategoryTabLabels();
  renderAssets();
}

function renderAssets() {
  elements.grid.innerHTML = "";

  if (state.filteredAssets.length === 0) {
    elements.empty.classList.remove("hidden");
    return;
  }
  elements.empty.classList.add("hidden");

  state.filteredAssets.forEach((asset) => {
    const fragment = elements.template.content.cloneNode(true);
    const preview = fragment.querySelector(".preview-area");

    const noteEl = fragment.querySelector(".shared-note");
    if (noteEl) {
      const placeholder = "등록된 팀 메모가 없습니다.";
      const raw = typeof asset.note === "string" ? asset.note.trim() : "";
      noteEl.textContent = raw || placeholder;
      noteEl.title = raw ? raw.replace(/\s+/g, " ") : "";
    }

    const downloadJson = fragment.querySelector(".download-json");
    const downloadPng = fragment.querySelector(".download-png");
    const isImageAsset = asset.type === "image";

    if (downloadJson) {
      downloadJson.classList.toggle("hidden", isImageAsset);
      if (!isImageAsset) {
        downloadJson.href = resolveSiteUrl(asset.path);
        downloadJson.setAttribute("download", "");
      } else {
        downloadJson.removeAttribute("href");
        downloadJson.removeAttribute("download");
      }
    }

    const pngPath = isImageAsset ? asset.path : derivePngPath(asset.path);
    const hasPng = isImageAsset
      ? Boolean(typeof asset.path === "string" && asset.path.length > 0)
      : Boolean(pngPath && state.pngAvailability.get(asset.path));
    if (downloadPng) {
      downloadPng.classList.toggle("hidden", !hasPng);
      if (hasPng && pngPath) {
        downloadPng.href = resolveSiteUrl(pngPath);
        downloadPng.setAttribute("download", "");
      } else {
        downloadPng.removeAttribute("href");
        downloadPng.removeAttribute("download");
      }
    }

    const tagList = fragment.querySelector(".tag-list");
    (asset.tags || []).forEach((tag) => {
      const span = document.createElement("span");
      span.className = "tag";
      span.textContent = `#${tag}`;
      tagList.appendChild(span);
    });

    if (preview) {
      renderPreview(asset, preview);
    }
    const cardEl = fragment.querySelector(".asset-card");
    const editBtn = fragment.querySelector(".edit-json-btn");
    if (editBtn && asset.type === "json") {
      jsonHasEditableLottieColors(asset.path).then((ok) => {
        if (ok) {
          editBtn.classList.remove("hidden");
        }
      });
      editBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (preview) {
          openColorEditDialog(asset, preview);
        }
      });
    }
    if (cardEl) {
      cardEl.dataset.id = asset.id;
    }
    elements.grid.appendChild(fragment);
  });
}

function renderPreview(asset, container) {
  if (container._lottieResizeObserver) {
    container._lottieResizeObserver.disconnect();
    container._lottieResizeObserver = null;
  }
  if (container._lottieAnim) {
    container._lottieAnim.destroy();
    container._lottieAnim = null;
  }

  if (asset.id === "logo-wehago") {
    const iframe = document.createElement("iframe");
    iframe.className = "preview-iframe";
    iframe.src = resolveSiteUrl("./assets/logo_wehago.html");
    iframe.title = "WEHAGO 로고 미리보기";
    iframe.loading = "lazy";
    iframe.referrerPolicy = "no-referrer";
    container.innerHTML = "";
    container.appendChild(iframe);
    return;
  }

  if (asset.type === "json") {
    mountLottieJsonPreview(asset, container, null);
    return;
  }

  if (asset.type === "apng") {
    const img = document.createElement("img");
    img.src = resolveSiteUrl(asset.path);
    img.alt = asset.title;
    img.loading = "lazy";
    img.onerror = () => {
      container.innerHTML = '<p class="preview-error">APNG 미리보기 실패</p>';
    };
    container.appendChild(img);
    return;
  }

  if (asset.type === "image") {
    container.innerHTML = "";
    const img = document.createElement("img");
    img.src = resolveSiteUrl(asset.path);
    img.alt = asset.title || "";
    img.loading = "lazy";
    img.onerror = () => {
      container.innerHTML = '<p class="preview-error">이미지 미리보기 실패</p>';
    };
    container.appendChild(img);
    return;
  }

  container.innerHTML = '<p class="preview-error">지원하지 않는 타입</p>';
}

function buildColorEditFieldRows(groups) {
  const wrap = document.getElementById("colorEditFields");
  const dialog = document.getElementById("colorEditDialog");
  const errEl = document.getElementById("colorEditError");
  errEl.classList.add("hidden");
  errEl.textContent = "";
  wrap.innerHTML = "";
  dialog.style.setProperty("--color-count", String(Math.max(1, groups.length)));

  groups.forEach((group, index) => {
    const first = group.refs[0];
    const hex = rgb01ToHex(first.k[0], first.k[1], first.k[2]);
    const item = document.createElement("div");
    item.className = "color-edit-swatch-item";

    const label = document.createElement("label");
    label.className = "color-edit-swatch-label";
    label.setAttribute("for", `colorEditPicker-${index}`);

    const input = document.createElement("input");
    input.type = "color";
    input.className = "color-edit-swatch-input";
    input.id = `colorEditPicker-${index}`;
    input.value = hex;
    input.dataset.groupIndex = String(index);

    const swatchVisual = document.createElement("span");
    swatchVisual.className = "color-edit-swatch-visual";
    swatchVisual.style.backgroundColor = hex;

    const caption = document.createElement("p");
    caption.className = "color-edit-swatch-caption";
    caption.textContent = `Color ${index + 1}`;

    input.addEventListener("input", () => {
      applyHexToGroup(Number(input.dataset.groupIndex), input.value);
      swatchVisual.style.backgroundColor = input.value;
      scheduleColorEditDialogPreviewRefresh();
    });

    label.appendChild(input);
    label.appendChild(swatchVisual);
    item.appendChild(label);
    item.appendChild(caption);
    wrap.appendChild(item);
  });
}

function applyHexToGroup(groupIndex, hex) {
  if (!colorEditState) {
    return;
  }
  const rgb = hexToRgb01(hex);
  if (!rgb) {
    return;
  }
  const group = colorEditState.groups[groupIndex];
  if (!group) {
    return;
  }
  for (const c of group.refs) {
    c.k[0] = rgb.r;
    c.k[1] = rgb.g;
    c.k[2] = rgb.b;
  }
}

function scheduleColorEditDialogPreviewRefresh() {
  if (!colorEditState) {
    return;
  }
  if (colorEditDialogPreviewFrame !== null) {
    cancelAnimationFrame(colorEditDialogPreviewFrame);
  }
  colorEditDialogPreviewFrame = requestAnimationFrame(() => {
    colorEditDialogPreviewFrame = null;
    const dialogPreview = document.getElementById("colorEditDialogPreview");
    if (!dialogPreview || !colorEditState) {
      return;
    }
    const { asset, workingData } = colorEditState;
    mountLottieJsonPreview(asset, dialogPreview, workingData);
  });
}

async function copyColorEditDialogSvgForFigma() {
  const dialogPreview = document.getElementById("colorEditDialogPreview");
  const errEl = document.getElementById("colorEditError");
  const svgEl = dialogPreview?.querySelector(".lottie-mount-host svg");
  if (!svgEl) {
    if (errEl) {
      errEl.textContent = "복사할 SVG가 없습니다. 미리보기가 뜬 뒤 다시 시도해 주세요.";
      errEl.classList.remove("hidden");
    }
    return false;
  }
  let markup = svgEl.outerHTML;
  if (!/\sxmlns\s*=/.test(markup)) {
    markup = markup.replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" ');
  }
  try {
    if (navigator.clipboard.write && typeof ClipboardItem !== "undefined") {
      try {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/html": new Blob([markup], { type: "text/html" }),
            "text/plain": new Blob([markup], { type: "text/plain;charset=utf-8" }),
          }),
        ]);
        if (errEl) {
          errEl.classList.add("hidden");
        }
        return true;
      } catch {
        /* fall through to writeText */
      }
    }
    await navigator.clipboard.writeText(markup);
    if (errEl) {
      errEl.classList.add("hidden");
    }
    return true;
  } catch {
    if (errEl) {
      errEl.textContent = "클립보드 복사에 실패했습니다. 브라우저 권한을 확인해 주세요.";
      errEl.classList.remove("hidden");
    }
    return false;
  }
}

function resetColorEditDialogTheme() {
  const themeToggle = document.getElementById("colorEditThemeToggle");
  const prevArea = document.getElementById("colorEditDialogPreview");
  if (themeToggle) {
    themeToggle.setAttribute("aria-checked", "true");
  }
  if (prevArea) {
    prevArea.classList.remove("is-preview-light");
  }
}

async function openColorEditDialog(asset, previewEl) {
  if (colorEditDialogPreviewFrame !== null) {
    cancelAnimationFrame(colorEditDialogPreviewFrame);
    colorEditDialogPreviewFrame = null;
  }
  const dialog = document.getElementById("colorEditDialog");
  const dialogPreview = document.getElementById("colorEditDialogPreview");
  const fileNameEl = document.getElementById("colorEditFileName");
  const errEl = document.getElementById("colorEditError");
  errEl.classList.add("hidden");
  errEl.textContent = "";
  const rawName = (asset.path || "").split("/").pop() || "animation.json";
  fileNameEl.textContent = rawName;
  resetColorEditDialogTheme();

  try {
    const res = await fetch(resolveSiteUrl(asset.path));
    if (!res.ok) {
      throw new Error("fetch");
    }
    const workingData = await res.json();
    const refs = collectStaticLottieColorCKs(workingData);
    if (refs.length === 0) {
      window.alert("이 JSON에는 수정 가능한 정적 색상(Lottie Fill/Stroke)이 없습니다.");
      return;
    }
    const groups = groupLottieColorRefs(refs);
    colorEditState = { asset, workingData, groups };
    buildColorEditFieldRows(groups);
    dialog.showModal();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        mountLottieJsonPreview(asset, dialogPreview, workingData);
      });
    });
  } catch {
    window.alert("JSON을 불러오지 못했습니다.");
  }
}

function initColorEditDialog() {
  const dialog = document.getElementById("colorEditDialog");
  const closeBtn = document.getElementById("colorEditClose");
  const themeToggle = document.getElementById("colorEditThemeToggle");
  const dialogPreview = document.getElementById("colorEditDialogPreview");
  const download = document.getElementById("colorEditDownload");
  const copyFigma = document.getElementById("colorEditCopyFigma");
  const copyFigmaLabel = document.getElementById("colorEditCopyFigmaLabel");

  closeBtn.addEventListener("click", () => {
    dialog.close();
  });

  dialog.addEventListener("close", () => {
    if (colorEditDialogPreviewFrame !== null) {
      cancelAnimationFrame(colorEditDialogPreviewFrame);
      colorEditDialogPreviewFrame = null;
    }
    if (dialogPreview && dialogPreview._lottieResizeObserver) {
      dialogPreview._lottieResizeObserver.disconnect();
      dialogPreview._lottieResizeObserver = null;
    }
    if (dialogPreview && dialogPreview._lottieAnim) {
      dialogPreview._lottieAnim.destroy();
      dialogPreview._lottieAnim = null;
    }
    if (dialogPreview) {
      dialogPreview.innerHTML = "";
    }
    colorEditState = null;
  });

  themeToggle.addEventListener("click", () => {
    const darkOn = themeToggle.getAttribute("aria-checked") === "true";
    const nextDarkOn = !darkOn;
    themeToggle.setAttribute("aria-checked", nextDarkOn ? "true" : "false");
    dialogPreview.classList.toggle("is-preview-light", !nextDarkOn);
  });

  const cancelBtn = document.getElementById("colorEditCancel");
  cancelBtn.addEventListener("click", () => {
    dialog.close();
  });

  download.addEventListener("click", () => {
    if (!colorEditState) {
      return;
    }
    const { asset, workingData } = colorEditState;
    const rawName = (asset.path || "").split("/").pop() || "lottie.json";
    const base = rawName.replace(/\.json$/i, "");
    const filename = `${base}_edited.json`;
    const blob = new Blob([JSON.stringify(workingData)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noreferrer";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  copyFigma.addEventListener("click", async () => {
    if (!colorEditState || !copyFigmaLabel) {
      return;
    }
    const copyFigmaDefaultLabel = "Copy to Figma";
    const ok = await copyColorEditDialogSvgForFigma();
    if (ok) {
      copyFigmaLabel.textContent = "SVG 복사됨";
      window.setTimeout(() => {
        copyFigmaLabel.textContent = copyFigmaDefaultLabel;
      }, 1600);
    }
  });
}
