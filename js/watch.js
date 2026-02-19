const API = (typeof window !== "undefined" && window.location.origin) || "";

function getVideoId() {
  const params = new URLSearchParams(window.location.search);
  return params.get("id");
}

function getExternalUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("ext");
}

function formatDate(iso) {
  if (!iso) return "--";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function getInitial(name) {
  if (!name) return "?";
  return name.trim().charAt(0).toUpperCase();
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

async function loadVideo() {
  const id = getVideoId();
  if (!id) {
    document.getElementById("videoTitle").textContent = "Video not found";
    return null;
  }

  try {
    const res = await fetch(`${API}/api/videos/${id}`);
    if (!res.ok) throw new Error("Not found");
    const video = await res.json();
    const videoPlayer = document.getElementById("videoPlayer");
    const source = document.getElementById("videoSource");
    source.src = video.telegramFileId ? `${API}/api/videos/${video.id}/stream` : `${API}/uploads/${video.file}`;
    videoPlayer.load();

    document.getElementById("videoTitle").textContent = video.title;
    document.getElementById("videoViews").textContent = (video.views || 0) + " views";
    document.getElementById("videoDate").textContent = formatDate(video.createdAt);
    document.getElementById("likeCount").textContent = video.likes || 0;
    document.getElementById("videoDescription").textContent = video.description || "No description.";
    document.getElementById("uploaderName").textContent = video.uploaderName || "Unknown";
    document.getElementById("uploaderAvatar").textContent = getInitial(video.uploaderName);

    await fetch(`${API}/api/videos/${id}/view`, { method: "POST" });
    loadComments(id);
    loadSuggested(id);
    setupLike(id);
    return video;
  } catch (e) {
    console.error(e);
    document.getElementById("videoTitle").textContent = "Video not found";
    return null;
  }
}

function setupLike(videoId) {
  const btn = document.getElementById("likeBtn");
  const countEl = document.getElementById("likeCount");
  btn.addEventListener("click", async () => {
    try {
      const res = await fetch(`${API}/api/videos/${videoId}/like`, { method: "POST" });
      const data = await res.json();
      countEl.textContent = data.likes;
      btn.classList.add("liked");
    } catch (e) {
      console.error(e);
    }
  });
}

async function loadComments(videoId) {
  const list = document.getElementById("commentsList");
  const countEl = document.getElementById("commentsCount");
  try {
    const res = await fetch(`${API}/api/videos/${videoId}/comments`);
    const comments = await res.json();
    countEl.textContent = comments.length;
    list.innerHTML = comments
      .map(
        (c, i) => `
      <article class="comment-item animate-in delay-${Math.min(i, 5)}" data-comment-id="${c.id}">
        <div class="comment-avatar profile-avatar comment-avatar-small">
          <span class="avatar-inner">${escapeHtml(getInitial(c.authorName))}</span>
        </div>
        <div class="comment-body">
          <span class="comment-author">${escapeHtml(c.authorName)}</span>
          <span class="comment-time">${formatDate(c.createdAt)}</span>
          <p class="comment-text">${escapeHtml(c.text)}</p>
        </div>
      </article>
    `
      )
      .join("");
  } catch (e) {
    list.innerHTML = "<p>Failed to load comments.</p>";
    countEl.textContent = "0";
  }
}

async function postComment(videoId) {
  const input = document.getElementById("commentInput");
  const text = input.value.trim();
  if (!text) return;
  try {
    const res = await fetch(`${API}/api/videos/${videoId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) throw new Error("Failed to post");
    const comment = await res.json();
    const list = document.getElementById("commentsList");
    const countEl = document.getElementById("commentsCount");
    const count = parseInt(countEl.textContent, 10) + 1;
    countEl.textContent = count;
    const html = `
      <article class="comment-item comment-item-new" data-comment-id="${comment.id}">
        <div class="comment-avatar profile-avatar comment-avatar-small">
          <span class="avatar-inner">${escapeHtml(getInitial(comment.authorName))}</span>
        </div>
        <div class="comment-body">
          <span class="comment-author">${escapeHtml(comment.authorName)}</span>
          <span class="comment-time">Just now</span>
          <p class="comment-text">${escapeHtml(comment.text)}</p>
        </div>
      </article>
    `;
    list.insertAdjacentHTML("afterbegin", html);
    input.value = "";
  } catch (e) {
    console.error(e);
    alert("Could not post comment.");
  }
}

async function loadSuggested(currentId) {
  const container = document.getElementById("suggestedVideos");
  try {
    const res = await fetch(`${API}/api/videos`);
    const videos = await res.json();
    const others = videos.filter((v) => v.id !== currentId).slice(0, 8);
    const thumbSrc = (vid) => vid.telegramFileId ? `${API}/api/videos/${vid.id}/stream` : `${API}/uploads/${vid.file}`;
    container.innerHTML = others
      .map(
        (v) => `
      <a href="watch.html?id=${v.id}" class="suggested-card animate-in">
        <div class="suggested-thumb">
          <video muted preload="metadata" src="${thumbSrc(v)}#t=1"></video>
        </div>
        <div class="suggested-info">
          <span class="suggested-title">${escapeHtml(v.title)}</span>
          <span class="suggested-meta">${v.uploaderName || "Unknown"} • ${v.views || 0} views</span>
        </div>
      </a>
    `
      )
      .join("");
  } catch (e) {
    container.innerHTML = "<p>No more videos.</p>";
  }
}

document.getElementById("commentForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const id = getVideoId();
  if (id) postComment(id);
});

function loadExternalVideo() {
  const extUrl = getExternalUrl();
  const title = new URLSearchParams(window.location.search).get("title") || "Video";
  if (!extUrl) return false;

  document.getElementById("ownVideoContainer").style.display = "none";
  document.getElementById("channelBlock").style.display = "none";
  document.getElementById("descriptionBox").style.display = "none";
  document.getElementById("commentsSection").style.display = "none";

  const container = document.getElementById("externalVideoContainer");
  const frame = document.getElementById("externalFrame");
  const openLink = document.getElementById("openExternalLink");
  container.style.display = "block";
  frame.src = `${API}/api/embed?url=${encodeURIComponent(extUrl)}`;
  openLink.href = extUrl;
  document.getElementById("videoTitle").textContent = decodeURIComponent(title);
  const statsEl = document.querySelector(".video-stats");
  if (statsEl) statsEl.style.display = "none";
  document.querySelector(".action-bar")?.style.display = "none";
  return true;
}

(async () => {
  const extUrl = getExternalUrl();
  if (extUrl) {
    loadExternalVideo();
    return;
  }

  const userRes = await fetch(`${API}/api/profile`).catch(() => ({}));
  if (userRes.ok) {
    const user = await userRes.json();
    document.getElementById("commentUserAvatar").textContent = getInitial(user.name);
  }
  loadVideo();
})();
