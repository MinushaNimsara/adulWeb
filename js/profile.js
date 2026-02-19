const API = (typeof window !== "undefined" && window.location.origin) || "";

function getInitial(name) {
  if (!name) return "?";
  return name.trim().charAt(0).toUpperCase();
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

async function loadProfile() {
  try {
    const res = await fetch(`${API}/api/profile`);
    if (!res.ok) throw new Error("Not found");
    const profile = await res.json();
    document.getElementById("profileAvatar").textContent = getInitial(profile.name);
    document.getElementById("profileName").textContent = profile.name;
    document.getElementById("profileBio").textContent = profile.bio || "No bio yet.";

    const videosRes = await fetch(`${API}/api/videos`);
    const allVideos = await videosRes.json();
    const myVideos = allVideos.filter((v) => v.uploaderId === profile.id);
    const grid = document.getElementById("profileVideoGrid");
    const thumbSrc = (vid) => vid.telegramFileId ? `${API}/api/videos/${vid.id}/stream` : `${API}/uploads/${vid.file}`;
    grid.innerHTML = myVideos
      .map(
        (v, i) => `
      <a href="watch.html?id=${v.id}" class="video-card animate-in delay-${Math.min(i, 4)}">
        <div class="video-card-thumb">
          <video muted preload="metadata" src="${thumbSrc(v)}#t=1"></video>
        </div>
        <div class="video-card-info">
          <h3>${escapeHtml(v.title)}</h3>
          <span class="video-card-meta">${v.views || 0} views</span>
        </div>
      </a>
    `
      )
      .join("");
    if (myVideos.length === 0) grid.innerHTML = "<p>No videos yet. <a href='upload.html'>Upload one</a>.</p>";
  } catch (e) {
    console.error(e);
    document.getElementById("profileName").textContent = "Profile not found";
    document.getElementById("profileVideoGrid").innerHTML = "<p>Could not load profile.</p>";
  }
}

loadProfile();
