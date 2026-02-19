require("dotenv").config();
const express = require("express");
const path = require("path");
const fs = require("fs");
const https = require("https");
const http = require("http");
const multer = require("multer");
const cors = require("cors");
const cheerio = require("cheerio");
let puppeteer;
try { puppeteer = require("puppeteer"); } catch { puppeteer = null; }

const app = express();
const PORT = process.env.PORT || 3000;
const IS_VERCEL = !!process.env.VERCEL;
const UPLOADS_DIR = IS_VERCEL ? "/tmp/uploads" : path.join(__dirname, "uploads");
const DATA_FILE = IS_VERCEL ? "/tmp/data.json" : path.join(__dirname, "data.json");
const ADMIN_SECRET = (process.env.ADMIN_SECRET || "admin123").trim() || "admin123";
// Your Telegram group – hardcoded; you only need to set Bot Token and click Sync
const DEFAULT_TELEGRAM_CHAT_ID = "-5247292298";

app.use(cors());
app.use(express.json());
const ROOT = __dirname;
app.use(express.static(ROOT));
app.use("/uploads", express.static(UPLOADS_DIR));
const HOMEPAGE_HTML = IS_VERCEL ? require("./homepage-html.js") : null;
app.get("/", (req, res) => {
  if (IS_VERCEL && HOMEPAGE_HTML) return res.type("html").send(HOMEPAGE_HTML);
  res.sendFile(path.join(ROOT, "index.html"));
});
app.get("/index.html", (req, res) => {
  if (IS_VERCEL && HOMEPAGE_HTML) return res.type("html").send(HOMEPAGE_HTML);
  res.sendFile(path.join(ROOT, "index.html"));
});

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

function loadData() {
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    const data = JSON.parse(raw);
    if (!data.telegram) data.telegram = { botToken: "", chatId: DEFAULT_TELEGRAM_CHAT_ID, lastUpdateId: 0, storeMode: "download" };
    if (!data.telegram.storeMode) data.telegram.storeMode = "download";
    return data;
  } catch {
    return { videos: [], comments: {}, profiles: {}, telegram: { botToken: "", chatId: DEFAULT_TELEGRAM_CHAT_ID, lastUpdateId: 0, storeMode: "download" } };
  }
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname) || ".mp4"),
});
const upload = multer({ storage });

// Get current user (demo: first profile or default)
function getCurrentUser() {
  const data = loadData();
  const ids = Object.keys(data.profiles);
  if (ids.length) return data.profiles[ids[0]];
  const defaultId = "user1";
  data.profiles[defaultId] = {
    id: defaultId,
    name: "Demo User",
    avatar: null,
    bio: "Welcome to my channel!",
  };
  saveData(data);
  return data.profiles[defaultId];
}

// --- API: PornMD proxy - use Puppeteer to render JS and get real search results
let puppeteerBrowser = null;
async function getBrowser() {
  if (IS_VERCEL || !puppeteer) return null;
  if (puppeteerBrowser && puppeteerBrowser.connected) return puppeteerBrowser;
  puppeteerBrowser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
  return puppeteerBrowser;
}

const pornmdCache = new Map();
const CACHE_MINUTES = 5;

function slugify(s) {
  return s.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

app.get("/api/pornmd", async (req, res) => {
  const q = (req.query.q || "").trim().toLowerCase();
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  if (!q) return res.json({ videos: [], hasMore: false });
  const cacheKey = `${q}_${page}`;
  const cached = pornmdCache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_MINUTES * 60 * 1000) return res.json(cached.data);

  try {
    if (IS_VERCEL) return res.json({ videos: [], hasMore: false });
    const pageParam = page > 1 ? `&page=${page}` : "";
    const slug = slugify(q) || "videos";
    const url = `https://www.pornmd.com/search/a/${slug}${pageParam ? "?" + pageParam.slice(1) : ""}`;
    const browser = await getBrowser();
    const browserPage = await browser.newPage();
    await browserPage.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36");
    await browserPage.setViewport({ width: 1280, height: 800 });
    await browserPage.goto(url, { waitUntil: "networkidle2", timeout: 20000 });
    await browserPage.waitForSelector("a[href*='/out/']", { timeout: 12000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 2000));
    const html = await browserPage.content();
    await browserPage.close();

    const $ = cheerio.load(html);
    const videos = [];
    const seen = new Set();
    const $main = $("main, [role='main'], #content, .content, .video-list, .search-results").first();
    const $scope = $main.length ? $main : $.root();
    $scope.find("a[href*='/out/']").each((_, el) => {
      const $a = $(el);
      const href = $a.attr("href") || "";
      let title = ($a.attr("title") || $a.text() || "").trim().replace(/\s+/g, " ");
      if (!title || title.length < 10 || seen.has(title)) return;
      if (/^(Report|Help|Search|Random|\d+%|xHamster|FapHouse|Eporner|AnySex|Ersties|Lesbian8|EpicGFs|XGroovy|Ourdream)/i.test(title)) return;
      if (/^\d+:\d+(\s*\/\s*\d+:\d+)?$/.test(title)) return;
      seen.add(title);
      const $container = $a.closest("[class*='thumb'],[class*='item'],[class*='video'],[class*='card']");
      let thumb = $a.find("img").attr("src") || $a.find("img").attr("data-src") || $container.find("img").first().attr("src") || $container.find("img").first().attr("data-src") || "";
      if (thumb && !thumb.startsWith("http")) thumb = thumb.startsWith("//") ? "https:" + thumb : "https://www.pornmd.com" + (thumb.startsWith("/") ? "" : "/") + thumb;
      videos.push({
        id: "pmd_" + videos.length,
        title: title.slice(0, 200),
        url: href.startsWith("http") ? href : "https://www.pornmd.com" + (href.startsWith("/") ? "" : "/") + href,
        thumb: thumb || null,
        source: "PornMD",
      });
    });

    const result = {
      videos: videos.slice(0, 48),
      hasMore: videos.length >= 48,
      page,
    };
    pornmdCache.set(cacheKey, { data: result, at: Date.now() });
    res.json(result);
  } catch (e) {
    console.error("PornMD proxy error:", e);
    res.status(502).json({ error: "Could not fetch PornMD results" });
  }
});

// --- API: Random/popular videos (fallback when search has no results)
app.get("/api/pornmd/random", async (req, res) => {
  if (IS_VERCEL) return res.json({ videos: [], hasMore: false });
  const cacheKey = "random";
  const cached = pornmdCache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_MINUTES * 60 * 1000) return res.json(cached.data);

  try {
    const url = "https://www.pornmd.com/new";
    const browser = await getBrowser();
    const browserPage = await browser.newPage();
    await browserPage.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36");
    await browserPage.setViewport({ width: 1280, height: 800 });
    await browserPage.goto(url, { waitUntil: "networkidle2", timeout: 20000 });
    await browserPage.waitForSelector("a[href*='/out/']", { timeout: 12000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 2000));
    const html = await browserPage.content();
    await browserPage.close();

    const $ = cheerio.load(html);
    const videos = [];
    const seen = new Set();
    const $main = $("main, [role='main'], #content, .content, .video-list").first();
    const $scope = $main.length ? $main : $.root();
    $scope.find("a[href*='/out/']").each((_, el) => {
      const $a = $(el);
      const href = $a.attr("href") || "";
      let title = ($a.attr("title") || $a.text() || "").trim().replace(/\s+/g, " ");
      if (!title || title.length < 10 || seen.has(title)) return;
      if (/^(Report|Help|Search|Random|\d+%)/i.test(title)) return;
      if (/^\d+:\d+(\s*\/\s*\d+:\d+)?$/.test(title)) return;
      seen.add(title);
      const $container = $a.closest("[class*='thumb'],[class*='item'],[class*='video']");
      let thumb = $a.find("img").attr("src") || $a.find("img").attr("data-src") || $container.find("img").first().attr("src") || "";
      if (thumb && !thumb.startsWith("http")) thumb = thumb.startsWith("//") ? "https:" + thumb : "https://www.pornmd.com" + (thumb.startsWith("/") ? "" : "/") + thumb;
      videos.push({
        id: "pmd_r_" + videos.length,
        title: title.slice(0, 200),
        url: href.startsWith("http") ? href : "https://www.pornmd.com" + (href.startsWith("/") ? "" : "/") + href,
        thumb: thumb || null,
        source: "PornMD",
      });
    });

    const result = { videos: videos.slice(0, 48), hasMore: false };
    pornmdCache.set(cacheKey, { data: result, at: Date.now() });
    res.json(result);
  } catch (e) {
    console.error("PornMD random error:", e);
    res.status(502).json({ videos: [], hasMore: false });
  }
});

// --- Embed proxy: fetch external page so iframe can load it (avoids X-Frame-Options)
app.get("/api/embed", async (req, res) => {
  let rawUrl = (req.query.url || "").trim();
  if (!rawUrl || !rawUrl.startsWith("http")) return res.status(400).send("Invalid URL");
  const allowed = ["pornmd.com", "xhamster.com", "eporner.com", "faphouse.com", "anysex.com", "xvideos.com", "pornhub.com", "xgroovy.com", "fapnado.com", "lesbian8.com", "ersties.com", "epicgfs.com", "ourdreamersai.com"];
  for (let i = 0; i < 5; i++) {
    try {
      const target = new URL(rawUrl);
      if (!allowed.some((h) => target.hostname === h || target.hostname.endsWith("." + h))) return res.status(403).send("Domain not allowed");
      const lib = target.protocol === "https:" ? https : http;
      const data = await new Promise((resolve, reject) => {
        lib.get(target.href, { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0" } }, (resp) => {
          if (resp.statusCode >= 300 && resp.statusCode < 400 && resp.headers.location) {
            const loc = resp.headers.location;
            rawUrl = loc.startsWith("http") ? loc : new URL(loc, target.origin).href;
            return resolve({ redirect: true });
          }
          const chunks = [];
          resp.on("data", (c) => chunks.push(c));
          resp.on("end", () => resolve({ body: Buffer.concat(chunks), contentType: resp.headers["content-type"] || "text/html" }));
          resp.on("error", reject);
        }).on("error", reject);
      });
      if (data.redirect) continue;
      res.removeHeader("X-Frame-Options");
      res.setHeader("Content-Type", data.contentType);
      return res.send(data.body);
    } catch (e) {
      console.error("Embed proxy error:", e);
      return res.status(502).send("Could not load");
    }
  }
  res.status(502).send("Too many redirects");
});

// --- API: Videos (supports ?q= for search)
app.get("/api/videos", (req, res) => {
  const data = loadData();
  let videos = data.videos || [];
  const q = (req.query.q || "").trim().toLowerCase();
  if (q) {
    videos = videos.filter((v) => {
      const title = (v.title || "").toLowerCase();
      const uploader = (v.uploaderName || "").toLowerCase();
      const desc = (v.description || "").toLowerCase();
      return title.includes(q) || uploader.includes(q) || desc.includes(q);
    });
  }
  res.json(videos);
});

app.get("/api/videos/:id", (req, res) => {
  const data = loadData();
  const video = data.videos.find((v) => v.id === req.params.id);
  if (!video) return res.status(404).json({ error: "Video not found" });
  res.json(video);
});

// --- Stream: serve video from Telegram or from local uploads (so Telegram can be used as storage)
app.get("/api/videos/:id/stream", async (req, res) => {
  const data = loadData();
  const video = data.videos.find((v) => v.id === req.params.id);
  if (!video) return res.status(404).send("Video not found");
  if (video.telegramFileId && data.telegram?.botToken) {
    try {
      const base = `https://api.telegram.org/bot${data.telegram.botToken}`;
      const fileJson = await httpsGet(`${base}/getFile?file_id=${encodeURIComponent(video.telegramFileId)}`);
      if (!fileJson.ok || !fileJson.result?.file_path) return res.status(502).send("Telegram file unavailable");
      const streamUrl = `https://api.telegram.org/file/bot${data.telegram.botToken}/${fileJson.result.file_path}`;
      return res.redirect(302, streamUrl);
    } catch (e) {
      console.error("Stream from Telegram error:", e);
      return res.status(502).send("Stream failed");
    }
  }
  if (video.file && fs.existsSync(path.join(UPLOADS_DIR, video.file)))
    return res.redirect(302, `/uploads/${video.file}`);
  return res.status(404).send("Video not found");
});

app.post("/api/videos/:id/view", (req, res) => {
  const data = loadData();
  const video = data.videos.find((v) => v.id === req.params.id);
  if (!video) return res.status(404).json({ error: "Not found" });
  video.views = (video.views || 0) + 1;
  saveData(data);
  res.json({ views: video.views });
});

app.post("/api/videos/:id/like", (req, res) => {
  const data = loadData();
  const video = data.videos.find((v) => v.id === req.params.id);
  if (!video) return res.status(404).json({ error: "Not found" });
  video.likes = (video.likes || 0) + 1;
  saveData(data);
  res.json({ likes: video.likes });
});

// --- API: Comments
app.get("/api/videos/:id/comments", (req, res) => {
  const data = loadData();
  const list = data.comments[req.params.id] || [];
  res.json(list);
});

app.post("/api/videos/:id/comments", (req, res) => {
  const { text, authorName } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: "Comment text required" });
  const data = loadData();
  const vid = req.params.id;
  if (!data.comments[vid]) data.comments[vid] = [];
  const user = getCurrentUser();
  const comment = {
    id: Date.now().toString(),
    text: text.trim(),
    authorName: authorName || user.name,
    authorId: user.id,
    createdAt: new Date().toISOString(),
  };
  data.comments[vid].unshift(comment);
  saveData(data);
  res.status(201).json(comment);
});

// --- API: Upload
app.post("/api/upload", upload.single("videoFile"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No video file" });
  const title = (req.body.videoTitle || req.file.originalname).trim() || "Untitled";
  const user = getCurrentUser();
  const data = loadData();
  const video = {
    id: path.basename(req.file.filename, path.extname(req.file.filename)),
    title,
    file: req.file.filename,
    uploaderId: user.id,
    uploaderName: user.name,
    views: 0,
    likes: 0,
    description: "",
    createdAt: new Date().toISOString(),
  };
  data.videos.unshift(video);
  saveData(data);
  if (data.telegram?.botToken && data.telegram?.chatId) {
    const filePath = path.join(UPLOADS_DIR, req.file.filename);
    sendVideoToTelegramGroup(data.telegram.botToken, data.telegram.chatId, filePath, `[P hub] ${title}`).catch((e) => console.error("Forward to Telegram:", e.message));
  }
  res.status(201).json(video);
});

// Legacy upload (form multipart)
app.post("/upload", upload.single("videoFile"), async (req, res) => {
  if (!req.file) return res.status(400).send("No video file");
  const title = (req.body.videoTitle || req.file.originalname).trim() || "Untitled";
  const user = getCurrentUser();
  const data = loadData();
  const video = {
    id: path.basename(req.file.filename, path.extname(req.file.filename)),
    title,
    file: req.file.filename,
    uploaderId: user.id,
    uploaderName: user.name,
    views: 0,
    likes: 0,
    description: "",
    createdAt: new Date().toISOString(),
  };
  data.videos.unshift(video);
  saveData(data);
  if (data.telegram?.botToken && data.telegram?.chatId) {
    const filePath = path.join(UPLOADS_DIR, req.file.filename);
    sendVideoToTelegramGroup(data.telegram.botToken, data.telegram.chatId, filePath, `[P hub] ${title}`).catch((e) => console.error("Forward to Telegram:", e.message));
  }
  res.send("Video uploaded successfully!");
});

// Legacy: list video filenames for old frontend
app.get("/videos", (req, res) => {
  const data = loadData();
  const files = data.videos.map((v) => v.file ? "uploads/" + v.file : "api/videos/" + v.id + "/stream");
  res.json(files);
});

// --- API: Profile
app.get("/api/profile/:id", (req, res) => {
  const data = loadData();
  const profile = data.profiles[req.params.id];
  if (!profile) return res.status(404).json({ error: "Profile not found" });
  const videos = data.videos.filter((v) => v.uploaderId === req.params.id);
  res.json({ ...profile, videos });
});

app.get("/api/profile", (req, res) => {
  res.json(getCurrentUser());
});

// --- Admin: auth middleware
function adminAuth(req, res, next) {
  const raw =
    req.headers.authorization?.replace(/^Bearer\s+/i, "").trim() ||
    (req.body && req.body.adminSecret) ||
    req.query?.adminSecret;
  const secret = typeof raw === "string" ? raw.trim() : "";
  if (!secret || secret !== ADMIN_SECRET) return res.status(401).json({ error: "Invalid password" });
  next();
}

// --- Admin: login check (POST so password can be in body)
app.post("/api/admin/login", (req, res) => {
  const raw = (req.body && req.body.password) || req.body?.adminSecret || "";
  const secret = typeof raw === "string" ? raw.trim() : "";
  if (!secret || secret !== ADMIN_SECRET) return res.status(401).json({ error: "Invalid password" });
  res.json({ ok: true });
});

// --- Admin: stats
app.get("/api/admin/stats", adminAuth, (req, res) => {
  const data = loadData();
  const videos = data.videos || [];
  const totalViews = videos.reduce((s, v) => s + (v.views || 0), 0);
  const totalLikes = videos.reduce((s, v) => s + (v.likes || 0), 0);
  let totalComments = 0;
  for (const vid of Object.values(data.comments || {})) totalComments += vid.length;
  res.json({
    videosCount: videos.length,
    totalViews,
    totalLikes,
    totalComments,
  });
});

// --- Admin: list videos (with delete)
app.get("/api/admin/videos", adminAuth, (req, res) => {
  const data = loadData();
  res.json(data.videos || []);
});

app.delete("/api/admin/videos/:id", adminAuth, (req, res) => {
  const data = loadData();
  const idx = data.videos.findIndex((v) => v.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Video not found" });
  const video = data.videos[idx];
  data.videos.splice(idx, 1);
  delete data.comments[req.params.id];
  if (video.file) {
    const filePath = path.join(UPLOADS_DIR, video.file);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
  saveData(data);
  res.json({ ok: true });
});

// --- Admin: comments
app.get("/api/admin/comments", adminAuth, (req, res) => {
  const data = loadData();
  const list = [];
  for (const [videoId, comments] of Object.entries(data.comments || {})) {
    for (const c of comments) list.push({ ...c, videoId });
  }
  res.json(list);
});

app.delete("/api/admin/comments/:videoId/:commentId", adminAuth, (req, res) => {
  const data = loadData();
  const list = data.comments[req.params.videoId];
  if (!list) return res.status(404).json({ error: "Comment not found" });
  const idx = list.findIndex((c) => c.id === req.params.commentId);
  if (idx === -1) return res.status(404).json({ error: "Comment not found" });
  list.splice(idx, 1);
  saveData(data);
  res.json({ ok: true });
});

// --- Admin: Telegram config
app.get("/api/admin/telegram", adminAuth, (req, res) => {
  const data = loadData();
  res.json({
    botToken: data.telegram?.botToken ? "***" : "",
    chatId: data.telegram?.chatId || DEFAULT_TELEGRAM_CHAT_ID,
    storeMode: data.telegram?.storeMode || "download",
    connected: !!(data.telegram?.botToken && (data.telegram?.chatId || DEFAULT_TELEGRAM_CHAT_ID)),
  });
});

app.post("/api/admin/telegram", adminAuth, (req, res) => {
  const { botToken, chatId, storeMode } = req.body;
  const data = loadData();
  if (botToken !== undefined && botToken !== "" && botToken !== "***") data.telegram.botToken = String(botToken).trim();
  if (chatId !== undefined) data.telegram.chatId = chatId ? String(chatId).trim() : "";
  if (storeMode === "telegram_only" || storeMode === "download") data.telegram.storeMode = storeMode;
  saveData(data);
  res.json({ ok: true });
});

// --- Admin: Check what Telegram is sending (to find correct Chat ID)
app.get("/api/admin/telegram-check", adminAuth, async (req, res) => {
  const data = loadData();
  const botToken = data.telegram?.botToken;
  if (!botToken) return res.status(400).json({ error: "Set Bot Token first." });
  const base = `https://api.telegram.org/bot${botToken}`;
  try {
    const json = await httpsGet(`${base}/getUpdates?offset=0&limit=100`);
    if (!json.ok) return res.status(400).json({ error: json.description || "Telegram API error" });
    const updates = json.result || [];
    const byChat = {};
    for (const u of updates) {
      const msg = u.message || u.channel_post;
      if (!msg || !msg.chat) continue;
      const cid = msg.chat.id;
      if (!byChat[cid]) byChat[cid] = { chatTitle: msg.chat.title || msg.chat.first_name || "Unknown", videos: 0, messages: 0 };
      byChat[cid].messages++;
      if (msg.video || msg.video_note || (msg.document && /video\//.test((msg.document.mime_type || "")))) byChat[cid].videos++;
    }
    const chats = Object.entries(byChat).map(([id, info]) => ({ chatId: id, title: info.chatTitle, messages: info.messages, videos: info.videos }));
    res.json({ ok: true, totalUpdates: updates.length, chats });
  } catch (e) {
    console.error("Telegram check error:", e);
    res.status(500).json({ error: e.message || "Check failed" });
  }
});

// --- Telegram: send video to group (when client uploads on site)
async function sendVideoToTelegramGroup(botToken, chatId, localFilePath, caption) {
  if (!botToken || !chatId || !localFilePath || !fs.existsSync(localFilePath)) return;
  const targetChatId = chatId.startsWith("-") ? chatId : `-${chatId}`;
  const url = `https://api.telegram.org/bot${botToken}/sendVideo`;
  const buffer = fs.readFileSync(localFilePath);
  const form = new FormData();
  form.append("chat_id", targetChatId);
  form.append("caption", (caption || path.basename(localFilePath)).slice(0, 1024));
  form.append("video", new Blob([buffer], { type: "video/mp4" }), path.basename(localFilePath));
  try {
    const res = await fetch(url, { method: "POST", body: form });
    const json = await res.json();
    if (!json.ok) console.error("Telegram sendVideo:", json.description);
  } catch (e) {
    console.error("Send to Telegram group failed:", e.message);
  }
}

// --- Telegram: download file from Telegram servers
function downloadTelegramFile(botToken, filePath) {
  return new Promise((resolve, reject) => {
    const url = `https://api.telegram.org/file/bot${botToken}/${filePath}`;
    https.get(url, (resp) => {
      if (resp.statusCode !== 200) {
        reject(new Error(`HTTP ${resp.statusCode}`));
        return;
      }
      const chunks = [];
      resp.on("data", (c) => chunks.push(c));
      resp.on("end", () => resolve(Buffer.concat(chunks)));
      resp.on("error", reject);
    }).on("error", reject);
  });
}

// --- Helper: HTTPS GET and return JSON or buffer
function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (resp) => {
      const chunks = [];
      resp.on("data", (c) => chunks.push(c));
      resp.on("end", () => {
        const buf = Buffer.concat(chunks);
        const ct = resp.headers["content-type"] || "";
        if (ct.includes("application/json")) resolve(JSON.parse(buf.toString()));
        else resolve(buf);
      });
      resp.on("error", reject);
    }).on("error", reject);
  });
}

// --- Admin: Sync videos from Telegram group
app.post("/api/admin/telegram-sync", adminAuth, async (req, res) => {
  const data = loadData();
  const botToken = data.telegram?.botToken;
  const chatId = data.telegram?.chatId || DEFAULT_TELEGRAM_CHAT_ID;
  if (!botToken) return res.status(400).json({ error: "Set Telegram Bot Token in dashboard first." });

  const fromStart = req.query.fromStart === "1" || req.body?.fromStart === true;
  if (fromStart) data.telegram.lastUpdateId = 0;

  const targetChatId = (chatId.startsWith("-") ? chatId : `-${chatId}`).trim();
  const targetChatIdNum = Number(targetChatId);
  let offset = data.telegram.lastUpdateId || 0;
  const added = [];
  const user = getCurrentUser();
  const base = `https://api.telegram.org/bot${botToken}`;

  try {
    let hasMore = true;
    while (hasMore) {
      const json = await httpsGet(`${base}/getUpdates?offset=${offset}&limit=100&timeout=0`);
      if (!json.ok) return res.status(400).json({ error: json.description || "Telegram API error" });
      const updates = json.result || [];
      hasMore = updates.length === 100;
      for (const u of updates) {
        offset = Math.max(offset, u.update_id + 1);
        const msg = u.message || u.channel_post;
        if (!msg) continue;
        const msgChatId = msg.chat?.id;
        const chatMatch = msgChatId !== undefined && (String(msgChatId) === targetChatId || Number(msgChatId) === targetChatIdNum);
        if (!chatMatch) continue;
        const video = msg.video || msg.video_note || (msg.document && /video\//.test((msg.document.mime_type || "")) ? msg.document : null);
        if (!video) continue;
        const fileId = video.file_id;
        const fileJson = await httpsGet(`${base}/getFile?file_id=${encodeURIComponent(fileId)}`);
        if (!fileJson.ok || !fileJson.result?.file_path) continue;
        const filePath = fileJson.result.file_path;
        const ext = path.extname(filePath) || ".mp4";
        const title = (msg.caption || msg.document?.file_name || "video").slice(0, 200);
        const useTelegramOnly = data.telegram.storeMode === "telegram_only";
        let videoEntry;
        if (useTelegramOnly) {
          videoEntry = {
            id: "tg_" + Date.now() + "_" + Math.random().toString(36).slice(2, 9),
            title: title || "From Telegram",
            file: null,
            telegramFileId: fileId,
            uploaderId: user.id,
            uploaderName: user.name,
            views: 0,
            likes: 0,
            description: "Imported from Telegram (streaming from group)",
            createdAt: new Date().toISOString(),
            source: "telegram",
          };
        } else {
          const buf = await downloadTelegramFile(botToken, filePath);
          const filename = Date.now() + ext;
          fs.writeFileSync(path.join(UPLOADS_DIR, filename), buf);
          videoEntry = {
            id: path.basename(filename, ext),
            title: title || "From Telegram",
            file: filename,
            uploaderId: user.id,
            uploaderName: user.name,
            views: 0,
            likes: 0,
            description: "Imported from Telegram",
            createdAt: new Date().toISOString(),
            source: "telegram",
          };
        }
        data.videos.unshift(videoEntry);
        added.push({ id: videoEntry.id, title: videoEntry.title });
      }
    }
    data.telegram.lastUpdateId = offset;
    saveData(data);
    res.json({ ok: true, added: added.length, videos: added });
  } catch (e) {
    console.error("Telegram sync error:", e);
    res.status(500).json({ error: e.message || "Sync failed" });
  }
});

if (!IS_VERCEL) app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
module.exports = app;
