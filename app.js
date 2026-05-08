function resolveSiteUrl(relativePath) {
  return new URL(relativePath, document.baseURI).href;
}

function setTextIfExists(root, selector, value) {
  const el = root.querySelector(selector);
  if (el) {
    el.textContent = value;
  }
}

const state = {
  assets: [],
  filteredAssets: [],
  selectedCategory: "loader",
};

const elements = {
  grid: document.getElementById("assetGrid"),
  empty: document.getElementById("emptyState"),
  search: document.getElementById("searchInput"),
  typeFilter: document.getElementById("typeFilter"),
  categoryTabs: Array.from(document.querySelectorAll(".category-tab")),
  template: document.getElementById("assetCardTemplate"),
  repoLink: document.getElementById("repoLink"),
};

init().catch((error) => {
  if (elements.empty) {
    elements.empty.classList.remove("hidden");
    elements.empty.textContent = `로드 실패: ${error.message}`;
  } else {
    // Fallback for temporary HTML/JS cache mismatch states.
    console.error("로드 실패:", error);
  }
});

async function init() {
  const config = await loadAssetIndex();
  state.assets = config.assets;
  elements.repoLink.href = config.repoUrl || "#";

  elements.search.addEventListener("input", applyFilters);
  elements.typeFilter.addEventListener("change", applyFilters);
  elements.categoryTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      state.selectedCategory = tab.dataset.category || "loader";
      elements.categoryTabs.forEach((btn) => {
        btn.classList.toggle("active", btn === tab);
      });
      applyFilters();
    });
  });

  applyFilters();
}

function matchesCategory(asset) {
  const selected = state.selectedCategory;
  const keywords = `${asset.id || ""} ${asset.title || ""} ${(asset.tags || []).join(" ")}`.toLowerCase();
  if (selected === "icon") {
    return keywords.includes("icon");
  }
  return keywords.includes("loader") || keywords.includes("loading");
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
  const selectedType = elements.typeFilter.value;

  state.filteredAssets = state.assets.filter((asset) => {
    const matchesCategoryTab = matchesCategory(asset);
    const matchesType = selectedType === "all" || asset.type === selectedType;
    const haystack = `${asset.title} ${(asset.tags || []).join(" ")} ${asset.note || ""}`.toLowerCase();
    const matchesQuery = !query || haystack.includes(query);
    return matchesCategoryTab && matchesType && matchesQuery;
  });

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

    setTextIfExists(fragment, ".asset-title", asset.title);
    setTextIfExists(fragment, ".asset-type", asset.type.toUpperCase());
    setTextIfExists(fragment, ".shared-note", asset.note || "등록된 팀 메모가 없습니다.");

    const downloadHref = resolveSiteUrl(asset.path);
    const downloadOverlay = fragment.querySelector(".download-overlay");
    if (downloadOverlay) {
      downloadOverlay.href = downloadHref;
      downloadOverlay.setAttribute("download", "");
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
