# Focus Timer — Browser Extension

A fully functional, deployable browser extension that helps you track your productivity across different website categories and monitor daily time usage patterns.

---

## Features

### ⏱ Timer
- Start / Pause / Stop focus sessions
- Animated progress ring with countdown display
- Built-in presets: 25 min, 50 min, 90 min, or a custom duration
- Desktop notification when a session completes

### 📊 Productivity Tracker
- Automatically tracks which websites you visit during a focus session
- Categorises every site into **Productive**, **Social**, or **Rest & Entertainment**
- Manual override — change the category for any site from the Dashboard
- Per-session and per-day breakdown of time spent on each domain

### 🗂 Dashboard (`dashboard/dashboard.html`)
- Summary cards: total time per category with percentage bars
- Stacked bar chart — daily activity over the last 7 or 30 days
- Donut chart — overall category split for the selected range
- Sites table — sortable / filterable list of every tracked website
- History table — day-by-day breakdown
- Sessions view — individual focus session cards
- Export data as a CSV file

### ⚙️ Settings (`settings/settings.html`)
- Change the default timer duration
- Toggle desktop notifications and sound
- Add / remove websites from any category
- Reset categories to defaults
- Clear all tracking data

---

## File Structure

```
focus-timer/
├── manifest.json          # Extension manifest (Manifest V3)
├── background.js          # Service worker — tab tracking & timer logic
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── popup/
│   ├── popup.html         # Browser-action popup
│   ├── popup.css
│   └── popup.js
├── dashboard/
│   ├── dashboard.html     # Full analytics dashboard
│   ├── dashboard.css
│   └── dashboard.js
└── settings/
    ├── settings.html      # Settings / options page
    ├── settings.css
    └── settings.js
```

---

## Installation (Chrome / Edge / Brave)

1. **Download / clone** this repository.
2. Open your browser and navigate to `chrome://extensions` (or `edge://extensions`).
3. Enable **Developer mode** (toggle in the top-right corner).
4. Click **Load unpacked** and select the root folder of this repository (the folder that contains `manifest.json`).
5. The **Focus Timer** extension icon appears in your toolbar. Pin it for quick access.

### Firefox

1. Navigate to `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on** and select the `manifest.json` file.

> **Note:** Firefox uses a temporary install that is removed when the browser restarts. For a permanent install, the extension must be signed through AMO.

---

## Usage

1. Click the **Focus Timer** icon in your toolbar to open the popup.
2. Choose a duration (25 m, 50 m, 90 m, or custom).
3. Click **▶ Start** to begin a session.
4. Browse normally — the extension tracks which sites you visit.
5. When the session ends, a notification appears and your data is saved.
6. Click **📊** to open the Dashboard and review your stats.
7. Click **⚙️** to open Settings and customise categories.

---

## Permissions Used

| Permission | Reason |
|---|---|
| `tabs` | Read the URL of the currently active tab to determine which site you are on |
| `storage` | Persist timer state, category definitions, and usage history |
| `alarms` | Fire a tick every minute while the timer is running (reliable in service workers) |
| `notifications` | Show a desktop notification when a session completes |
| `activeTab` | Access the active tab's URL |
| `<all_urls>` | Needed to read tab URLs across all websites |

---

## Publishing to the Chrome Web Store

1. Zip the repository root (the folder containing `manifest.json`): `zip -r focus-timer.zip . --exclude "*.git*"`.
2. Go to the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole).
3. Click **New item** and upload `focus-timer.zip`.
4. Fill in the store listing details (description, screenshots, category).
5. Submit for review.

---

## Tech Stack

- **Manifest V3** — modern extension standard
- **Vanilla JavaScript** — no build step required
- **Chrome Storage API** (`chrome.storage.local`) — data persistence
- **Chrome Alarms API** — reliable background ticking
- **Canvas API** — custom charts (no external dependencies)
- **HTML5 / CSS3** — responsive, dark-themed UI