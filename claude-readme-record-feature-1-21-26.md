# Chrome Recording Extension - Technical Specification
**Document Version:** 1.0  
**Date:** January 21, 2026  
**Target:** Claude Code CLI Tool  
**Architecture:** Manifest V3 (Required)

---

## 📋 Executive Summary

This document specifies requirements for building a Chrome extension that records screen and audio with user anonymization. The extension must comply with Manifest V3 architecture constraints, particularly the requirement to use Offscreen Documents for media recording.

### **Simplified Description**
A Chrome extension that records your screen and audio (both computer sounds and microphone) while keeping your identity private through randomized user IDs.

---

## 🎯 Core Objective

Build a Manifest V3 Chrome extension that:
- Records screen video + dual audio sources (system + microphone)
- Stores recordings locally with anonymized filenames
- Maintains privacy through persistent random user identification
- Handles Manifest V3's architectural constraints properly

---

## 🏗️ Architecture Requirements

### 1. **Manifest V3 Structure**

```json
{
  "manifest_version": 3,
  "permissions": [
    "storage",
    "tabs",
    "offscreen",
    "activeTab"
  ],
  "background": {
    "service_worker": "background.js"
  }
}
```

**Critical Components:**
- **Background Service Worker** (`background.js`) - Coordinates recording state
- **Offscreen Document** (`offscreen.html` + `offscreen.js`) - Handles MediaRecorder API
- **Popup UI** (`popup.html` + `popup.js`) - User interface for Start/Stop controls
- **Storage Module** - Manages anonymous user ID persistence

### 2. **Why Offscreen Document is Required**

**Manifest V3 Constraint:** Service workers cannot directly access:
- `navigator.mediaDevices.getDisplayMedia()`
- `MediaRecorder` API
- DOM-based APIs

**Solution:** Use `chrome.offscreen` API to create a hidden document context where recording actually occurs.

---

## 🎬 Recording Features

### Video Capture
- **Source Options:** Current tab OR full screen (user selectable)
- **API:** `navigator.mediaDevices.getDisplayMedia()`
- **Output Format:** `.webm` container

### Audio Mixing (Critical Implementation)

**Challenge:** Chrome's default behavior captures either microphone OR system audio, not both.

**Solution:** Use Web Audio API to merge streams:

```javascript
// Pseudocode structure
const audioContext = new AudioContext();
const destination = audioContext.createMediaStreamDestination();

// Stream 1: System/Tab audio from screen capture
const systemSource = audioContext.createMediaStreamSource(displayStream);
systemSource.connect(destination);

// Stream 2: Microphone audio
const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
const micSource = audioContext.createMediaStreamSource(micStream);
micSource.connect(destination);

// Combined stream
const mixedAudioStream = destination.stream;
```

**Codec Recommendation:**  
Use `video/webm;codecs=vp9,opus` for consistent cross-version compatibility.

---

## 🔐 Anonymization System

### Implementation Logic

1. **First Install Detection:**
   - Check `chrome.storage.local` for existing `anonymousUserId`
   - If not found, generate random ID

2. **ID Generation Pattern:**
   ```javascript
   const userId = `User-${Math.floor(1000 + Math.random() * 9000)}`;
   // Example output: "User-4829"
   ```

3. **Persistence:**
   - Store in `chrome.storage.local` (survives browser restarts)
   - Never expose real system username, email, or Chrome profile name

4. **File Naming Convention:**
   ```
   [Anonymized-ID]_Record_[Timestamp].webm
   
   Example: User-4829_Record_20260121-143022.webm
   ```

---

## 💾 Storage & Download

### Local File Saving
- **Target:** User's default Downloads folder
- **API:** `chrome.downloads.download()`
- **Auto-Save:** Trigger immediately when recording stops
- **No Cloud Storage:** All data remains local to user's machine

### Metadata Privacy
- Filenames use only anonymous ID + timestamp
- No geolocation, device fingerprints, or PII in metadata
- `.webm` EXIF stripping (if applicable)

---

## 🛡️ Safety & Lifecycle Management

### 1. **Cleanup on Tab Closure**
```javascript
// In background service worker
chrome.tabs.onRemoved.addListener((tabId) => {
  if (isRecording && recordingTabId === tabId) {
    stopRecording();
    closeOffscreenDocument();
  }
});
```

### 2. **Offscreen Document Lifecycle**
- Create only when recording starts
- Close immediately after recording stops
- Never leave orphaned offscreen contexts

### 3. **User Status Indicators**
**In Popup UI:**
- ✅ "Ready to Record" (idle state)
- 🔴 "Recording..." (active state)
- ⏸️ "Processing..." (encoding/saving state)

---

## 📦 Deliverables Checklist

**Required Files:**
- [ ] `manifest.json` - Extension configuration
- [ ] `background.js` - Service worker coordinator
- [ ] `offscreen.html` - Hidden document for recording
- [ ] `offscreen.js` - MediaRecorder implementation + audio mixing
- [ ] `popup.html` - User interface
- [ ] `popup.js` - UI logic and messaging
- [ ] `storage.js` - Anonymization utilities
- [ ] `icons/` - Extension icons (16x16, 48x48, 128x128)

**Optional but Recommended:**
- [ ] `README.md` - Installation and usage instructions
- [ ] `PRIVACY.md` - Privacy policy and data handling explanation

---

## 🚀 Implementation Sequence

### Phase 1: Foundation
1. Create manifest with correct permissions
2. Set up background service worker skeleton
3. Implement anonymous ID generation and storage

### Phase 2: Recording Core
4. Build offscreen document with MediaRecorder
5. Implement Web Audio API mixing for dual audio sources
6. Test screen capture with combined audio

### Phase 3: Integration
7. Create popup UI with Start/Stop controls
8. Wire message passing between popup ↔ background ↔ offscreen
9. Implement file download with anonymized naming

### Phase 4: Polish
10. Add status indicators and error handling
11. Implement cleanup on tab closure
12. Test full lifecycle (install → record → save → uninstall)

---

## ⚠️ Common Pitfalls to Avoid

| Issue | Wrong Approach | Correct Approach |
|-------|---------------|------------------|
| **Recording in Service Worker** | Direct MediaRecorder in `background.js` | Use offscreen document |
| **Audio Mixing** | Hope `getDisplayMedia` captures both | Explicitly mix with Web Audio API |
| **User Identification** | Use `chrome.identity` or system username | Generate random persistent ID |
| **State Management** | Store state in service worker variables | Use `chrome.storage` for persistence |

---

## 📚 Reference Resources

### Official Documentation
- [Chrome Offscreen API](https://developer.chrome.com/docs/extensions/reference/offscreen/)
- [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
- [MediaRecorder API](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder)
- [Manifest V3 Migration Guide](https://developer.chrome.com/docs/extensions/migrating/)

### Key Concepts Video
- "How to build and use a Chrome recording extension" - Covers microphone + tab audio architecture

---

## 🔍 Testing Checklist

**Before Deployment:**
- [ ] Recording captures video correctly
- [ ] System audio is audible in playback
- [ ] Microphone audio is audible in playback
- [ ] Both audio sources are synchronized
- [ ] Anonymous ID persists across browser restarts
- [ ] Files save with correct naming pattern
- [ ] Offscreen document closes after recording
- [ ] No console errors in any context (popup, background, offscreen)
- [ ] Extension works after Chrome restart
- [ ] Cleanup happens when tab is closed during recording

---

## 📝 Notes for Claude Code

**When implementing this specification:**

1. **Start with the Offscreen Document** - This is the most complex part and the foundation of MV3 recording
2. **Test audio mixing separately** - Verify dual-source mixing works before integrating with video
3. **Use `chrome.runtime.sendMessage()`** - For communication between popup, background, and offscreen contexts
4. **Handle async operations carefully** - Service worker can be terminated; use storage for state persistence
5. **Validate permissions** - Ensure user grants both screen capture AND microphone permissions

**Expected Output:**
A fully functional Chrome extension folder that can be loaded via `chrome://extensions` in Developer Mode and immediately used for recording with privacy-preserving anonymization.

---

**End of Specification**  
*This document provides the architectural foundation for Claude Code to generate production-ready extension code.*
