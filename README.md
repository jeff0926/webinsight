# WebInsight

**AI-powered web research capture, analysis, and knowledge management — as a Chrome side panel.**

WebInsight turns your browser into a research assistant. Capture anything from any page — text, selections, screenshots, or full PDFs — tag and organize it, then use AI to analyze, summarize, generate reports, convert diagrams to draw.io, and chat with your entire research collection.

---

## Table of Contents

- [Features](#features)
- [Screenshots](#screenshots)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage Guide](#usage-guide)
- [AI Providers](#ai-providers)
- [Data & Privacy](#data--privacy)
- [Architecture](#architecture)
- [Contributing](#contributing)

---

## Features

### Content Capture

| Action | How |
|---|---|
| **Save Page** | Captures full text, HTML, and rich metadata (author, date, publisher, canonical URL, JSON-LD) from any page |
| **Save Selection** | Save any highlighted text — from the panel button, or via right-click context menu |
| **Save as PDF** | Full-page PDF via Chrome DevTools Protocol — captures below-the-fold content |
| **Capture Visible** | One-click screenshot of the currently visible browser area |
| **Capture Area** | Drag-to-select any region of the page with a crosshair overlay — press Escape to cancel |

All capture methods also extract rich page metadata: title, URL, language, description, keywords, author, publisher, publication date, site name, content type, and up to 20 outbound links.

---

### Organization & Tagging

- **Flexible tagging** — add multiple tags to any item, remove them individually
- **Tag filter panel** — click one or more tags to filter your saved items in real time
- **Multi-tag OR filtering** — select several tags to see items matching any of them
- **Tag normalization** — tags are stored lowercase and deduplicated automatically
- **Pagination** — items load 20 at a time with infinite scroll for large collections
- **Notes** — add freeform notes to any saved item, editable inline
- **Anonymize** — strip PII from any item's content with one click before AI processing

---

### AI Analysis

- **Key Points** — generate a bullet-point summary across all items sharing a tag
- **AI Chat** — conversational interface scoped to your selected tags; ask questions about your research collection, get answers grounded in your saved content
- **Save Chat** — save any chat conversation as a new tagged item in your library
- **Screenshot Analysis** — AI describes images, extracts text, identifies diagrams, charts, and layout structure
- **Diagram Extraction** — deep structured extraction of architecture diagrams, flowcharts, network maps, org charts, ER diagrams, sequence diagrams, and more
- **PDF Reports** — generate a fully formatted, professionally styled PDF report from all items under a tag, with AI-generated key points woven in

---

### draw.io Integration

Convert any captured screenshot of a diagram into a fully editable draw.io file:

1. Capture a screenshot of any architecture or flowchart diagram
2. Click **Convert to draw.io** — AI extracts components, containers, connections, labels, and layout
3. Click **Download** to save the `.drawio` file, or **Open** to launch it directly in [app.diagrams.net](https://app.diagrams.net)

Extraction results are cached in the database — subsequent conversions skip the AI call entirely.

Supported diagram types: `architecture`, `flowchart`, `network`, `sequence`, `org_chart`, `er_diagram`, `mindmap`

---

### Export & Backup

- **Export Backup** — download your entire library as a timestamped JSON file (`webinsight-backup-YYYY-MM-DD.json`)
- **Import Backup** — restore from any previously exported backup (replaces current data after confirmation)
- **Export Project for AI** — export all items under a tag as a structured JSON file, ready to paste into any AI tool for external analysis
- **Auto-backup** — configurable scheduled backups (daily / weekly / monthly) via Chrome alarms
- **Google Drive** — OAuth-authenticated cloud backup and restore

---

### Settings & Customization

- **Theme** — Light, Dark, or System (follows OS preference, synced across devices via `chrome.storage.sync`)
- **Strip Navigation** — optionally remove nav/footer boilerplate when saving page text
- **AI Provider** — switch between Google Gemini and Anthropic Claude (via Hyperspace local proxy)
- **Storage Meter** — visual indicator of IndexedDB usage vs. available quota with color-coded warnings
- **Context Menu** — right-click any page or selection to save directly without opening the panel

---

## Installation

1. Clone or download this repository:
   ```bash
   git clone https://github.com/jeff0926/webinsight.git
   ```
2. Open Chrome and go to `chrome://extensions`
3. Enable **Developer mode** (toggle in the top right)
4. Click **Load unpacked** and select the cloned folder
5. Click the WebInsight icon in your toolbar — the side panel will open

---

## Configuration

Open the **Settings** page (gear icon at the bottom of the panel):

### Google Gemini (default)
1. Get a free API key at [aistudio.google.com](https://aistudio.google.com)
2. Paste it into the **Gemini API Key** field
3. Save Settings

### Anthropic / Claude via Hyperspace
1. Set **AI Provider** to `Hyperspace (Claude)`
2. Enter your Hyperspace base URL (default: `http://localhost:6655/anthropic`) and token
3. Click **Test Connection** to verify
4. Save Settings

---

## Usage Guide

### Capturing Content

Open the side panel by clicking the WebInsight toolbar icon. Use the five capture buttons at the top:

- **Save Page** — saves the full text of the current tab
- **Save as PDF** — saves a full-page PDF (appears in your Downloads folder)
- **Save Selection** — highlight text first, then click (or right-click → "Save selected text to WebInsight")
- **Capture Visible** — instant screenshot of what's on screen
- **Capture Area** — click and drag a rectangle over any part of the page

### Tagging Items

Each saved item shows its tags inline. To add a tag, type in the tag input field on the item and press Enter or click Add. Click the × on any tag chip to remove it.

### Filtering

Click any tag in the **Filter by Tag** section to see only items with that tag. Click multiple tags to expand the filter (OR logic). Click **Show All Items** to reset.

### AI Features

With a tag filter active, three buttons appear:
- **Get Key Points** — runs AI summarization across all filtered items
- **Generate Report** — builds and downloads a PDF research report
- **Export Project for AI** — exports structured JSON for use in external AI tools

### Chat with Your Research

Expand the **Chat with your Research** accordion in the panel. The chat is automatically scoped to your active tag filter. Type a question and press Enter or click Send. Use the save icon to keep the conversation as a new item, or the + icon to start fresh.

### draw.io Conversion

On any screenshot item, click **Convert to draw.io**. When the button turns green, click **Download** or **Open in diagrams.net**.

---

## AI Providers

WebInsight supports two AI backends, switchable in Settings:

| Provider | Model | Best For |
|---|---|---|
| **Google Gemini** | `gemini-2.5-flash` | Default; free tier available; vision + text |
| **Hyperspace (Claude)** | `claude-sonnet-latest` | Local proxy; privacy-preserving; strong reasoning |

Both providers support text analysis, image/screenshot analysis, and draw.io diagram extraction. Gemini uses structured output schemas natively; the Hyperspace adapter wraps Claude in a Gemini-compatible response envelope so all downstream code works unchanged.

---

## Data & Privacy

- **All data is stored locally** in Chrome's IndexedDB (`unlimitedStorage` permission)
- **No data is sent to any server** except the AI provider you configure and (optionally) Google Drive for backup
- The **Anonymize** feature strips names, emails, and identifiers from item content before any AI processing
- Audio and video are never captured by this extension
- Backups are JSON files stored wherever your browser downloads to

---

## Architecture

```
manifest.json (MV3)
│
├── js/background.js          Service worker — all business logic & message routing
├── js/panel.js               Side panel UI — main user interface
├── js/options.js             Settings page
├── js/content.js             Content script — DOM interaction & page data extraction
│
├── js/lib/
│   ├── db.js                 IndexedDB wrapper (schema v2: items + tags + contentTags junction)
│   ├── api.js                Google Gemini API client
│   ├── hyperspace-api.js     Anthropic Claude via Hyperspace local proxy
│   ├── drawio-generator.js   draw.io XML builder from structured AI extraction
│   ├── pdf-generator.js      Chrome DevTools Protocol PDF generation
│   ├── google-drive.js       Google Drive OAuth backup/restore
│   └── metadata.js           Page metadata extraction utilities
│
├── html/                     panel.html, options.html
└── css/                      panel.css, options.css
```

**IndexedDB Schema (v2)**
- `contentItems` — all saved content with metadata, AI analysis results, and diagram extraction data
- `tags` — unique tag names with auto-increment IDs
- `contentTags` — junction table (compound key `[contentId, tagId]`) for many-to-many relationships

---

## Prerequisites

- Google Chrome (latest)
- A Gemini API key **or** a running Hyperspace proxy with an Anthropic API key

---

## Contributing

Pull requests welcome. Please open an issue first for any significant changes.

---

*WebInsight v2.1.0 — Manifest V3 Chrome Extension*
