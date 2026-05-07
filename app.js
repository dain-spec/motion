function resolveSiteUrl(relativePath) {
  return new URL(relativePath, document.baseURI).href;
}

const state = {
  assets: [],
  filteredAssets: [],
};

const elements = {
  grid: document.getElementById("assetGrid"),
  empty: document.getElementById("emptyState"),
  search: document.getElementById("searchInput"),
  typeFilter: document.getElementById("typeFilter"),
  template: document.getElementById("assetCardTemplate"),
  repoLink: document.getElementById("repoLink"),
};

init().catch((error) => {
  elements.empty.classList.remove("hidden");
  elements.empty.textContent = `로드 실패: ${error.message}`;
});

async function init() {
  const config = await loadAssetIndex();
  state.assets = config.assets;
  elements.repoLink.href = config.repoUrl || "#";

  elements.search.addEventListener("input", applyFilters);
  elements.typeFilter.addEventListener("change", applyFilters);

  applyFilters();
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
    const matchesType = selectedType === "all" || asset.type === selectedType;
    const haystack = `${asset.title} ${(asset.tags || []).join(" ")} ${asset.note || ""}`.toLowerCase();
    const matchesQuery = !query || haystack.includes(query);
    return matchesType && matchesQuery;
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

    fragment.querySelector(".asset-title").textContent = asset.title;
    fragment.querySelector(".asset-type").textContent = asset.type.toUpperCase();
    fragment.querySelector(".asset-meta").textContent = `업데이트: ${asset.updatedAt || "-"}`;
    fragment.querySelector(".shared-note").textContent = asset.note || "등록된 팀 메모가 없습니다.";

    const previewUrlHref = resolveSiteUrl(asset.path);
    const openLink = fragment.querySelector(".open-link");
    openLink.href = previewUrlHref;

    const previewUrlLink = fragment.querySelector(".preview-url-link");
    previewUrlLink.href = previewUrlHref;
    previewUrlLink.textContent = previewUrlHref;

    const tagList = fragment.querySelector(".tag-list");
    (asset.tags || []).forEach((tag) => {
      const span = document.createElement("span");
      span.className = "tag";
      span.textContent = `#${tag}`;
      tagList.appendChild(span);
    });

    renderPreview(asset, preview);
    card.dataset.id = asset.id;
    elements.grid.appendChild(fragment);
  });
}

function renderPreview(asset, container) {
  if (asset.type === "json") {
    try {
      lottie.loadAnimation({
        container,
        renderer: "svg",
        loop: true,
        autoplay: true,
        path: resolveSiteUrl(asset.path),
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
