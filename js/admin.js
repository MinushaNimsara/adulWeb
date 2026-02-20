const API = (typeof window !== "undefined" && window.location.origin) || "";
let adminSecret = "";

function headers() {
  return { "Content-Type": "application/json", Authorization: `Bearer ${adminSecret}` };
}

function show(el) {
  el.classList.remove("hidden");
}
function hide(el) {
  el.classList.add("hidden");
}

async function api(path, options = {}) {
  const res = await fetch(API + path, { ...options, headers: { ...options.headers, ...headers() } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

document.getElementById("loginBtn").addEventListener("click", async () => {
  const input = document.getElementById("adminPassword");
  const err = document.getElementById("loginError");
  adminSecret = input.value.trim();
  if (!adminSecret) {
    err.textContent = "Enter password.";
    show(err);
    return;
  }
  err.textContent = "";
  hide(err);
  try {
    const res = await fetch(API + "/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: adminSecret }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      err.textContent = data.error || "Invalid password.";
      show(err);
      return;
    }
    hide(document.getElementById("loginScreen"));
    show(document.getElementById("dashboard"));
    loadDashboard();
  } catch (e) {
    err.textContent = "Invalid password or server not running.";
    show(err);
  }
});
document.getElementById("adminPassword").addEventListener("keydown", (e) => {
  if (e.key === "Enter") document.getElementById("loginBtn").click();
});

async function loadStats() {
  try {
    const s = await api("/api/admin/stats");
    document.getElementById("statVideos").textContent = s.videosCount;
    document.getElementById("statViews").textContent = s.totalViews;
    document.getElementById("statLikes").textContent = s.totalLikes;
    document.getElementById("statComments").textContent = s.totalComments;
  } catch (e) {
    console.error(e);
  }
}

async function loadTelegram() {
  try {
    const t = await api("/api/admin/telegram");
    document.getElementById("tgChatId").value = t.chatId || "5247292298";
    document.getElementById("tgStoreMode").value = t.storeMode || "download";
    document.getElementById("tgBotToken").value = "";
    document.getElementById("tgBotToken").placeholder = t.connected ? "Token saved — enter new token to change" : "Bot Token (from @BotFather)";
    document.getElementById("tgStatus").textContent = t.connected ? "Connected (token saved)." : "Set Bot Token and Chat ID, then Save.";
  } catch (e) {
    document.getElementById("tgStatus").textContent = "Could not load settings.";
  }
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text == null ? "" : text;
  return div.innerHTML;
}

async function loadVideos() {
  const tbody = document.getElementById("videosBody");
  try {
    const list = await api("/api/admin/videos");
    if (list.length === 0) {
      tbody.innerHTML = "<tr><td colspan='5'>No videos.</td></tr>";
      return;
    }
    tbody.innerHTML = list
      .map(
        (v) => `
      <tr>
        <td><a href="watch.html?id=${escapeHtml(v.id)}">${escapeHtml(v.title)}</a></td>
        <td>${v.views || 0}</td>
        <td>${v.likes || 0}</td>
        <td>${new Date(v.createdAt).toLocaleDateString()}</td>
        <td><button type="button" class="btn-sm" data-video-id="${escapeHtml(v.id)}">Delete</button></td>
      </tr>
    `
      )
      .join("");
    tbody.querySelectorAll(".btn-sm").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm("Delete this video?")) return;
        try {
          await api(`/api/admin/videos/${btn.dataset.videoId}`, { method: "DELETE" });
          loadVideos();
          loadStats();
        } catch (e) {
          alert(e.message);
        }
      });
    });
  } catch (e) {
    tbody.innerHTML = "<tr><td colspan='5'>Failed to load.</td></tr>";
  }
}

async function loadComments() {
  const tbody = document.getElementById("commentsBody");
  try {
    const list = await api("/api/admin/comments");
    if (list.length === 0) {
      tbody.innerHTML = "<tr><td colspan='4'>No comments.</td></tr>";
      return;
    }
    tbody.innerHTML = list
      .map(
        (c) => `
      <tr>
        <td><a href="watch.html?id=${escapeHtml(c.videoId)}">${escapeHtml(c.videoId)}</a></td>
        <td>${escapeHtml(c.authorName)}</td>
        <td>${escapeHtml(c.text).slice(0, 80)}${c.text.length > 80 ? "…" : ""}</td>
        <td><button type="button" class="btn-sm" data-video-id="${escapeHtml(c.videoId)}" data-comment-id="${escapeHtml(c.id)}">Delete</button></td>
      </tr>
    `
      )
      .join("");
    tbody.querySelectorAll(".btn-sm").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm("Delete this comment?")) return;
        try {
          await api(`/api/admin/comments/${btn.dataset.videoId}/${btn.dataset.commentId}`, { method: "DELETE" });
          loadComments();
          loadStats();
        } catch (e) {
          alert(e.message);
        }
      });
    });
  } catch (e) {
    tbody.innerHTML = "<tr><td colspan='4'>Failed to load.</td></tr>";
  }
}

document.getElementById("tgSave").addEventListener("click", async () => {
  const token = document.getElementById("tgBotToken").value.trim();
  const chatId = document.getElementById("tgChatId").value.trim();
  const body = { chatId, storeMode: document.getElementById("tgStoreMode").value };
  if (token) body.botToken = token;
  try {
    await api("/api/admin/telegram", {
      method: "POST",
      body: JSON.stringify(body),
    });
    document.getElementById("tgStatus").textContent = "Saved.";
    loadTelegram();
  } catch (e) {
    document.getElementById("tgStatus").textContent = e.message;
  }
});

async function doSync(fromStart) {
  const btn = document.getElementById("tgSync");
  const result = document.getElementById("tgSyncResult");
  btn.disabled = true;
  result.classList.add("hidden");
  try {
    const url = fromStart ? "/api/admin/telegram-sync?fromStart=1" : "/api/admin/telegram-sync";
    const data = await api(url, { method: "POST" });
    result.textContent = `Synced: ${data.added} new video(s) imported.`;
    result.classList.remove("error");
    show(result);
    loadVideos();
    loadStats();
  } catch (e) {
    result.textContent = e.message;
    result.classList.add("error");
    show(result);
  }
  btn.disabled = false;
}
document.getElementById("tgSync").addEventListener("click", () => doSync(false));
document.getElementById("tgSyncFromStart").addEventListener("click", () => doSync(true));

document.getElementById("tgCheck").addEventListener("click", async () => {
  const result = document.getElementById("tgCheckResult");
  result.classList.add("hidden");
  try {
    const data = await api("/api/admin/telegram-check");
    let html = "";
    if (data.totalUpdates === 0) {
      html = "No messages received. Make sure <strong>MyVideoSync2025Bot</strong> is added to your P hub group, then send any message in the group and click Check again.";
    } else {
      html = "Found " + data.totalUpdates + " update(s) from " + data.chats.length + " chat(s):<br><br>";
      data.chats.forEach((c) => {
        html += "• Chat ID: <strong>" + c.chatId + "</strong> — " + c.messages + " msg(s), " + c.videos + " video(s)";
        if (c.videos > 0) {
          html += ' <button type="button" class="btn-use-chat" data-chatid="' + escapeHtml(c.chatId) + '">Use this Chat ID</button>';
        }
        html += "<br>";
      });
      html += "<br>If you see your group above, click <strong>Use this Chat ID</strong>, then <strong>Save</strong>, then <strong>Sync from beginning</strong>.";
    }
    result.innerHTML = html;
    result.classList.remove("hidden");
    result.querySelectorAll(".btn-use-chat").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.getElementById("tgChatId").value = btn.dataset.chatid;
        result.innerHTML += "<br><span style='color:green'>Chat ID set. Click Save, then Sync from beginning.</span>";
      });
    });
  } catch (e) {
    result.textContent = "Error: " + e.message;
    result.classList.remove("hidden");
  }
});

function loadDashboard() {
  loadStats();
  loadTelegram();
  loadVideos();
  loadComments();
}
