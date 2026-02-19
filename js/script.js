const API = (typeof window !== "undefined" && window.location.origin) || "";

function getSearchQuery() {
  const params = new URLSearchParams(window.location.search);
  return (params.get("q") || "").trim();
}

function getPage() {
  const params = new URLSearchParams(window.location.search);
  return Math.max(1, parseInt(params.get("page"), 10) || 1);
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function buildPageUrl(page) {
  const params = new URLSearchParams(window.location.search);
  params.set("page", String(page));
  return "index.html?" + params.toString();
}

async function loadUploadedVideos() {
  const videoList = document.getElementById("videoList");
  const sectionTitle = document.getElementById("sectionTitle");
  const searchInput = document.getElementById("searchInput");
  const paginationEl = document.getElementById("pagination");
  if (!videoList) return;

  const query = getSearchQuery();
  const page = getPage();
  if (searchInput) searchInput.value = query;
  if (sectionTitle) {
    sectionTitle.textContent = query
      ? `Search results for "${query}"${page > 1 ? ` (Page ${page})` : ""}`
      : "Latest";
  }

  videoList.innerHTML = "<p class='loading-msg'>Loading videos...</p>";
  if (paginationEl) paginationEl.innerHTML = "";

  const fetchWithTimeout = (url, ms = 15000) =>
    Promise.race([fetch(url), new Promise((_, r) => setTimeout(() => r(new Error("Timeout")), ms))]);

  try {
    const [ownRes, extRes] = await Promise.all([
      fetchWithTimeout(query ? `${API}/api/videos?q=${encodeURIComponent(query)}` : `${API}/api/videos`),
      query ? fetchWithTimeout(`${API}/api/pornmd?q=${encodeURIComponent(query)}&page=${page}`) : null,
    ]);
    if (ownRes instanceof Error) throw ownRes;
    const ownVideos = ownRes.ok ? await ownRes.json().catch(() => []) : [];
    let extData = { videos: [], hasMore: false };
    if (extRes && extRes.ok) {
      const json = await extRes.json();
      extData = json.videos ? json : { videos: Array.isArray(json) ? json : [], hasMore: false };
    }

    const extVideos = extData.videos || [];
    let allVideos = [
      ...(Array.isArray(ownVideos) && page === 1 ? ownVideos.map((v) => ({ ...v, isOwn: true })) : []),
      ...extVideos.map((v) => ({ ...v, isOwn: false })),
    ];

    let showRandomFallback = false;
    if (allVideos.length === 0 && query) {
      const randomRes = await fetchWithTimeout(`${API}/api/pornmd/random`);
      const randomData = randomRes.ok ? await randomRes.json() : { videos: [] };
      const randomVideos = randomData.videos || [];
      if (randomVideos.length > 0) {
        allVideos = randomVideos.map((v) => ({ ...v, isOwn: false }));
        showRandomFallback = true;
      }
    }

    videoList.innerHTML = "";

    if (allVideos.length === 0) {
      videoList.innerHTML = query
        ? `<p>No videos found for "${escapeHtml(query)}". <a href="index.html">Show all</a></p>`
        : "<p>No videos yet. <a href='upload.html'>Upload the first one</a>.</p>";
      return;
    }

    if (showRandomFallback && sectionTitle) {
      sectionTitle.textContent = `No results for "${query}" – showing popular videos`;
    }

    allVideos.forEach((v, i) => {
      const card = document.createElement("a");
      if (v.isOwn) {
        card.href = `watch.html?id=${v.id}`;
        const thumbSrc = v.telegramFileId ? `${API}/api/videos/${v.id}/stream` : `${API}/uploads/${v.file}`;
        card.innerHTML = `
          <div class="video-card-thumb">
            <video muted preload="metadata" src="${thumbSrc}#t=1" poster=""></video>
          </div>
          <div class="video-card-info">
            <h3>${escapeHtml(v.title)}</h3>
            <span class="video-card-meta">${escapeHtml(v.uploaderName || "Unknown")} • ${v.views || 0} views</span>
          </div>
        `;
      } else {
        card.href = `watch.html?ext=${encodeURIComponent(v.url)}&title=${encodeURIComponent(v.title || "")}`;
        const thumb = v.thumb || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='320' height='180' fill='%23222'%3E%3Crect width='100%25' height='100%25'/%3E%3C/svg%3E";
        card.innerHTML = `
          <div class="video-card-thumb">
            <img src="${thumb}" alt="" loading="lazy">
          </div>
          <div class="video-card-info">
            <h3>${escapeHtml(v.title)}</h3>
            <span class="video-card-meta"></span>
          </div>
        `;
      }
      card.className = `video-card animate-in delay-${Math.min(i % 5, 4)}`;
      videoList.appendChild(card);
    });

    if (query && paginationEl && (page > 1 || extData.hasMore)) {
      let html = '<div class="pagination-inner">';
      if (page > 1) {
        html += `<a href="${buildPageUrl(1)}" class="pagination-btn">First</a>`;
        html += `<a href="${buildPageUrl(page - 1)}" class="pagination-btn">Previous</a>`;
      }
      html += `<span class="pagination-page">Page ${page}</span>`;
      if (extData.hasMore) {
        html += `<a href="${buildPageUrl(page + 1)}" class="pagination-btn">Next</a>`;
      }
      html += "</div>";
      paginationEl.innerHTML = html;
    }
  } catch (error) {
    console.error("Error loading videos:", error);
    const isVercel = /vercel\.app/i.test(window.location.hostname || "");
    videoList.innerHTML = isVercel
      ? "<p class='loading-msg'>API may be starting up. <a href='javascript:location.reload()'>Refresh</a> in a moment. Or check Vercel function logs.</p>"
      : "<p class='loading-msg'>Failed to load videos. Make sure the server is running (npm start).</p>";
  }
}

document.addEventListener("DOMContentLoaded", () => {
  loadUploadedVideos();
});
