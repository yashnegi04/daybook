# Daybook

A personal day planner for iPhone: tasks with reminders, day-by-day trackers
(smoking, diet, workouts, anything), a journal, quotes and moodboards.

It is a web app you add to your Home Screen. Your tasks, journal, trackers and
photos are stored only on the phone. Reminders go through a small relay you
own, which sees only a time and an encrypted blob it cannot read.

## Set it up (about 15 minutes, free, no Mac)

### 1. Host the app on GitHub Pages
1. Create a GitHub repository and put the contents of this folder in it.
2. In the repository: Settings → Pages → Source "Deploy from a branch" →
   branch `main`, folder `/ (root)` → Save.
3. After a minute the app is live at `https://<you>.github.io/<repo>/`.

### 2. Create the reminder relay on Cloudflare
1. Sign up at dash.cloudflare.com (free plan).
2. Storage & Databases → KV → Create a namespace, name it `daybook`.
3. Workers & Pages → Create → Worker → name it `daybook-relay` → Deploy.
4. Edit code → delete what is there → paste all of `relay/worker.js` → Deploy.
5. On the Worker: Settings → Bindings → Add → KV namespace →
   variable name `DB`, namespace `daybook` → Save.
6. Settings → Trigger Events → Add → Cron Trigger → `* * * * *` → Save.
7. Copy the Worker address, e.g. `https://daybook-relay.<you>.workers.dev`.
   Opening it in a browser should show `{"ok":true,...}`.

Optional: Settings → Variables and Secrets → add a secret named `PASSCODE`.
The app then needs the same passcode (Settings → Reminders).

### 3. Install on the iPhone (iOS 16.4 or later)
1. Open your GitHub Pages address in **Safari**.
2. Share → Add to Home Screen.
3. Open Daybook from the Home Screen → gear icon → paste the relay address →
   "Turn on reminders" → Allow → "Send a test".

## Using it
- Tap **+**, type your day one thing per line. A line with a time
  ("meet at 3 pm", "call bank 11:30", "gym tomorrow 7am", "in 20 min") gets a
  reminder; lines without a time go under Anytime.
- By default the reminder arrives 10 minutes before. Change it in Settings or
  per task.
- The evening check-in tells you what is still open and nudges you to log
  trackers and journal.
- Settings → Save backup regularly. Removing the app from the Home Screen
  deletes its data.

## Files
- `index.html`, `styles.css`, `js/` – the app (no build step)
- `sw.js` – offline support and showing notifications
- `relay/worker.js` – the Cloudflare Worker
- `config.js` – optional place to hard-code the relay address
