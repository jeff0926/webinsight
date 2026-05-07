# Chrome Meeting Transcription Extension - Technical Specification

**Document Version:** 1.0
**Date:** January 21, 2026
**Target:** Claude Code CLI Tool
**Architecture:** Manifest V3 (Required)

---

## 📋 Executive Summary

This document specifies the requirements for building a standalone Chrome extension that captures audio from an active tab (specifically for online meetings, webinars, or videos) and transcribes it into text. The extension will focus on privacy by performing transcription locally on the user's machine using an on-device AI model, with a clear user-controlled workflow for further AI analysis.

---

## 🎯 Core Objective

Build a Manifest V3 Chrome extension that:
- Captures audio from the active tab where an online meeting/webinar/video is playing.
- Transcribes the captured audio into text using a local, on-device AI model.
- Presents the transcript to the user as a new saved item within the extension's UI.
- Allows the user to manually trigger anonymization of the transcript *before* any further AI processing (e.g., summarization, key points).
- Does NOT record video.
- Does NOT send audio data to any third-party cloud service for transcription.

---

## 🏗️ Architecture Requirements

### 1. **Manifest V3 Structure**

```json
{
  "manifest_version": 3,
  "permissions": [
    "storage",
    "activeTab",
    "scripting",
    "offscreen"
  ],
  "host_permissions": [
    "<all_urls>"
  ],
  "background": {
    "service_worker": "background.js"
  },
  "action": {
    "default_popup": "popup.html",
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
}
```

**Critical Components:**
- **Background Service Worker** (`background.js`) - Orchestrates the workflow: receives user commands from the popup, manages the offscreen document, handles transcription results, and interacts with `chrome.storage`.
- **Offscreen Document** (`offscreen.html` + `offscreen.js`) - This is where the audio capture and `MediaRecorder` API will be used. It will communicate the raw audio chunks (or final blob) to the transcription module.
- **Popup UI** (`popup.html` + `popup.js`) - User interface for "Start Transcription" / "Stop Transcription" controls and status indicators.
- **Transcription Module** (`transcription.js` or integrated into `offscreen.js`/`background.js`) - Contains the local AI model (e.g., `transformers.js` with a Whisper model) to convert audio to text.
- **Storage Module** - Manages persistence of settings and saved transcripts (`chrome.storage.local`).

### 2. **Why Offscreen Document is Required**

**Manifest V3 Constraint:** Service workers cannot directly access:
- `navigator.mediaDevices.getDisplayMedia()` (needed for tab audio)
- `MediaRecorder` API
- DOM-based APIs

**Solution:** Use `chrome.offscreen` API to create a hidden document context where audio capture and `MediaRecorder` operations occur.

---

## 🎧 Audio Capture & Transcription

### Audio Capture
- **Source:** Active Tab's audio output (using `navigator.mediaDevices.getDisplayMedia({ audio: true, video: false })`).
- **Format:** Captured audio will be processed by `MediaRecorder` into a suitable format (e.g., WAV, or a raw audio stream) for the transcription engine.
- **Microphone:** Initially, microphone input is **NOT** required for this focused "meeting transcription" feature, simplifying the audio mixing problem.

### Transcription Engine
- **Type:** Local, on-device AI model.
- **Recommendation:** `transformers.js` with a suitable pre-trained Whisper model (or a distilled variant for better performance).
- **Process:** The captured audio blob/stream will be fed to this local model.
- **Output:** Raw text transcript.

### Data Handling
- **Audio Data:** The raw audio data will be transient, existing only long enough to be processed by the local transcription engine. It will *not* be persistently stored or sent off-device.
- **Transcript Data:** The resulting text transcript will be stored in `chrome.storage.local` as part of a new saved item.

---

## 📊 User Interface & Interaction

### Popup UI (`popup.html` / `popup.js`)
- **Controls:**
    - "Start Transcription" button (disables when active).
    - "Stop Transcription" button (enables when active).
- **Status Indicators:**
    - "Ready to Transcribe" (idle state).
    - "Transcribing..." (active state, possibly with a timer or animation).
    - "Processing Audio..." (while local AI is transcribing).
    - "Transcription Complete!" / "Error: ..."
- **Integration:** The popup will communicate with the background service worker to initiate/stop transcription and receive status updates.

### Saved Item Display
- **New Item Type:** A new item type (e.g., `type: "transcription"`) will be created in `chrome.storage.local` to store the transcript.
- **Content:** The full text transcript will be saved as the `content` of this new item.
- **UI:** The extension's panel (if integrated later) would display this item similarly to how existing text-based items are shown, potentially within a scrollable text area. For this standalone MVP, a simple display in the popup or a dedicated page could suffice initially for demonstration.

---

## 🔐 Privacy & Anonymization

### Core Principle
- All transcription occurs locally. Audio data never leaves the user's device for transcription.
- User retains full control over the generated text.

### Anonymization Workflow
1.  **Raw Transcript Saved:** The raw, unanonymized transcript is saved as an item.
2.  **User-Triggered Anonymization:** A button (e.g., "Anonymize Transcript") will be provided to the user. When clicked, the existing (or adapted) anonymization function will process the transcript locally.
3.  **Post-Anonymization AI:** Only *after* the user has explicitly anonymized the transcript locally, can they then optionally send it for further AI analysis (e.g., key point extraction, summarization), which might involve cloud APIs (this aspect is out of scope for *this* MVP extension but important for future integration).

---

## 💾 Storage & Download

### Local Storage
- All transcripts and settings are stored in `chrome.storage.local`.
- No recordings or transcripts are sent to cloud storage by this extension.

### Export (Optional for MVP, but valuable)
- A basic mechanism to copy the transcript to the clipboard or download as a `.txt` file could be considered for demonstrating functionality.

---

## 🛡️ Safety & Lifecycle Management

### 1. **Cleanup on Tab Closure**
- The background service worker will monitor `chrome.tabs.onRemoved`. If the transcribed tab is closed during an active transcription, the process must be gracefully stopped, and the offscreen document closed.

### 2. **Offscreen Document Lifecycle**
- Create the offscreen document only when transcription starts.
- Close it immediately after transcription stops or an error occurs.
- Never leave orphaned offscreen contexts.

### 3. **Error Handling & Permissions**
- Robust error handling for `getDisplayMedia` (user denies permissions, tab closes unexpectedly).
- Clear user prompts for necessary permissions (`activeTab`, `scripting`, `offscreen`).

---

## 📦 Deliverables Checklist

**Required Files (for new standalone extension):**
- [ ] `manifest.json` - Extension configuration
- [ ] `background.js` - Service worker coordinator
- [ ] `offscreen.html` - Hidden document for audio capture
- [ ] `offscreen.js` - `MediaRecorder` implementation & audio stream handling
- [ ] `popup.html` - User interface for controls
- [ ] `popup.js` - UI logic and messaging to background
- [ ] `transcription-worker.js` (or similar) - Web Worker to run `transformers.js` model for transcription
- [ ] `storage.js` - Utility for `chrome.storage` operations
- [ ] `icons/` - Extension icons (16x16, 48x48, 128x128)

**Optional but Recommended:**
- [ ] `README.md` - Installation and usage instructions
- [ ] `PRIVACY.md` - Privacy policy (critical for a transcription tool)

---

## 🚀 Implementation Sequence (High-Level)

### Phase 1: Foundation
1.  Create `manifest.json` with correct permissions.
2.  Set up `background.js` to manage offscreen document lifecycle.
3.  Implement `popup.html` and `popup.js` for basic Start/Stop controls and status display.

### Phase 2: Audio Capture Core
4.  Build `offscreen.html` and `offscreen.js` for `getDisplayMedia` and `MediaRecorder` setup.
5.  Implement message passing between `popup` ↔ `background` ↔ `offscreen` to start/stop capture.
6.  Verify audio stream can be captured and converted into a `Blob`.

### Phase 3: Local Transcription Integration
7.  Integrate `transformers.js` (or chosen local AI) with a Whisper model.
8.  Feed the captured audio `Blob` into the local transcription model and retrieve text.
9.  Handle progress updates from the transcription process.

### Phase 4: Storage & Display
10. Store the resulting transcript as a new item in `chrome.storage.local`.
11. Display the transcript within the popup, or a simple dedicated `results.html` page.

### Phase 5: Polish & Lifecycle
12. Add robust error handling.
13. Implement cleanup on tab closure.
14. Ensure clear user status indicators.

---

## ⚠️ Common Pitfalls to Avoid

| Issue | Wrong Approach | Correct Approach |
|-------|---------------|------------------|
| **Audio Capture in Service Worker** | Direct `getDisplayMedia` or `MediaRecorder` in `background.js` | Use offscreen document |
| **Sending Audio to Cloud** | Implicitly sending audio for transcription | Explicitly use local AI; if cloud is ever considered, require *clear* user consent |
| **State Management** | Store state only in service worker variables | Use `chrome.storage` for persistent state across service worker terminations |
| **Long-Running Tasks** | Expecting service worker to handle long transcription | Delegate to Offscreen Document / Web Worker for intensive processing |

---

**End of Specification**
*This document provides the architectural foundation for Claude Code to generate a production-ready Chrome extension for meeting transcription.*
