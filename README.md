# Your Website – YouTube-style video site

Watch, upload, like, and comment on videos. Connect a **Telegram video group** to import videos and use the **admin dashboard** to manage everything.

## Features

- **Home** – Grid of all videos; click to watch
- **Watch** – Video player, views, like, description, comments, channel block
- **Upload** – Upload a video; redirects to the watch page
- **Profile** – Your channel: avatar, name, bio, your videos
- **Telegram** – Connect a Telegram group; sync imports new videos from the group into the site
- **Admin dashboard** – Stats, manage videos/comments, connect Telegram, sync from group

## Run the project

1. Install dependencies (first time only):
   ```bash
   npm install
   ```
2. Optional: copy `.env.example` to `.env` and set `ADMIN_SECRET` (default is `admin123`).
3. Start the server:
   ```bash
   npm start
   ```
4. Open **http://localhost:3000**
   - Home: `index.html`
   - Watch: `watch.html?id=VIDEO_ID`
   - Upload: `upload.html`
   - Profile: `profile.html`
   - **Admin: `admin.html`** (password = `ADMIN_SECRET`)

## Connect Telegram video group

1. Create a bot with [@BotFather](https://t.me/BotFather), copy the **Bot Token**.
2. Add the bot to your Telegram **video group** as a member.
3. Get the group **Chat ID**:
   - Easiest: add [@userinfobot](https://t.me/userinfobot) to the group; it will show the chat id (a negative number like `-1001234567890`).
   - Or use Telegram API: send a message in the group, then open `https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates` and look at `message.chat.id`.
4. Open **Admin dashboard** → **Connect Telegram group**:
   - Paste **Bot Token** and **Chat ID**, click **Save**.
   - Click **Sync from Telegram** to import new videos from the group (video messages and video documents). Run sync again anytime to fetch newer messages.

## First-time setup

- Copy `data.json.example` to `data.json` if you don't have one yet (the app will create a default on first run if missing).

## Show PornMD search results on your site

By default, search and category results try to fetch videos from PornMD. On **Vercel**, this requires **Browserless** (headless Chrome) because PornMD loads content via JavaScript.

### Enable PornMD results on Vercel

1. Sign up at [browserless.io](https://browserless.io) (free tier available).
2. Copy your **API token** from the dashboard.
3. In **Vercel** → your project → **Settings** → **Environment Variables**, add:
   - **Name:** `BROWSERLESS_WS_URL`
   - **Value:** `wss://production-sfo.browserless.io?token=YOUR_TOKEN` (replace `YOUR_TOKEN` with your token)
4. **Redeploy** the project.

After that, when users search (e.g. "tamil", "indian") or click a category, PornMD videos will appear on your page.

---

## Database and storage

- **Metadata** (videos list, comments, profile, Telegram settings) is stored in **`data.json`** on your PC.
- **Videos** can be stored in two ways:
  1. **Save to PC (download)** – Synced videos are downloaded into the `uploads/` folder. Uses disk space; playback is from your server.
  2. **Use Telegram only (no download)** – In Admin → Connect Telegram group, set **“When syncing from Telegram”** to **“Use Telegram only”**. Synced videos are **not** saved on your PC; they stream from your Telegram group when someone watches. Saves disk space; your Telegram group is the “database” for those videos.
- **Google Drive** – Not built in. To use Drive you’d need to add the Google Drive API (upload files to Drive, store file IDs in `data.json`, and stream or link to Drive URLs). The app is set up so you can add this later if you want.
