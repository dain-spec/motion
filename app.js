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
}

function derivePngPath(assetPath) {
  if (typeof assetPath !== "string" || !assetPath.toLowerCase().endsWith(".json")) {
    return null;
  }
  return assetPath.replace(/\.json$/i, ".png");
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

function assetMatchesCategory(asset, category) {
  if (category === "all") {
    return true;
  }
  const keywords = `${asset.id || ""} ${asset.title || ""} ${(asset.tags || []).join(" ")}`.toLowerCase();
  if (category === "icon") {
    return keywords.includes("icon");
  }
  return keywords.includes("loader") || keywords.includes("loading");
}

function assetMatchesSearch(asset, query) {
  if (!query) {
    return true;
  }
  const haystack = `${asset.title} ${(asset.tags || []).join(" ")} ${asset.note || ""}`.toLowerCase();
  return haystack.includes(query);
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
    const card = fragment.querySelector(".asset-card");
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
    if (downloadJson) {
      downloadJson.href = resolveSiteUrl(asset.path);
      downloadJson.setAttribute("download", "");
    }

    const pngPath = derivePngPath(asset.path);
    const hasPng = Boolean(pngPath && state.pngAvailability.get(asset.path));
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
    if (card) {
      card.dataset.id = asset.id;
    }
    elements.grid.appendChild(fragment);
  });
}

function renderPreview(asset, container) {
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
    try {
      container.innerHTML = "";
      lottie.loadAnimation({
        container,
        renderer: "canvas",
        loop: true,
        autoplay: true,
        path: resolveSiteUrl(asset.path),
        rendererSettings: {
          clearCanvas: true,
          progressiveLoad: true,
        },
      });
    } catch {
      container.innerHTML = '<p class="preview-error">JSON 미리보기 실패</p>';
    }
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

  container.innerHTML = '<p class="preview-error">지원하지 않는 타입</p>';
}
