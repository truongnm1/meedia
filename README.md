<div align="center">

<img src="app-icon.png" width="110" alt="MEEDIA Logo" />

# MEEDIA

**"It's ME's Media."**  
Fast. Offline. Sub-5MB. The personal, lightweight desktop player built for your music and videos.

[![Platform](https://img.shields.io/badge/platform-Windows%2010%20%7C%2011-blue?style=flat-square)](https://github.com)
[![Built with Tauri](https://img.shields.io/badge/built%20with-Tauri%202-24C8D8?style=flat-square&logo=tauri&logoColor=white)](https://tauri.app)
[![Rust](https://img.shields.io/badge/backend-Rust-DEA584?style=flat-square&logo=rust&logoColor=white)](https://www.rust-lang.org)
[![React](https://img.shields.io/badge/frontend-React%2019-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev)
[![Installer Size](https://img.shields.io/badge/installer%20size-~1.5%20MB-brightgreen?style=flat-square)](https://github.com)
[![Privacy](https://img.shields.io/badge/privacy-100%25%20Offline-success?style=flat-square)](https://github.com)

</div>

---

## 📥 Downloads

Get the latest pre-compiled installers from the **[Releases](https://github.com)** tab:

| Package | Format | Size | Description |
| :--- | :--- | :--- | :--- |
| **MEEDIA Setup (.exe)** | `NSIS Installer` | **~1.5 MB** | Recommended for most Windows users. Quick installation with desktop & Start Menu shortcuts. |
| **MEEDIA Installer (.msi)** | `Windows Installer` | **~2.2 MB** | Standard Windows installer package for enterprise / managed deployment. |

### How to Install:
1. Go to the **Releases** section on the right-hand sidebar of this GitHub page.
2. Under **Assets**, click on either `MEEDIA_x.x.x_x64-setup.exe` or `MEEDIA_x.x.x_x64_en-US.msi` to download.
3. Run the downloaded installer.
4. Launch **MEEDIA** from your Start Menu or Desktop!

> [!NOTE]
> **Windows SmartScreen Notice**: Because MEEDIA is an independent open-source project without a paid EV code-signing certificate, Windows SmartScreen may show a blue warning (*"Windows protected your PC"*). Click **"More info"** and then **"Run anyway"** to continue.

---

## ✨ Features

* **⚡ Ultra-Lightweight & Instant Startup**:
  - Installer is only **~1.5 MB**; installed footprint is **under 5 MB**.
  - Highly optimized memory footprint (~50 MB RAM during playback) unlike bulky Electron players.
* **🎵 Universal Format Support**:
  - **Audio**: MP3, FLAC, WAV, OGG, M4A, AAC, OPUS, ALAC.
  - **Video**: MP4, MKV, WEBM, MOV with native GPU hardware-accelerated compositing.
* **📂 Blazing-Fast Library Scanner**:
  - Multithreaded folder scanning powered by Rust (`rayon` + `walkdir`).
  - Instantly traverses folders containing 10,000+ media files with zero UI freezing.
* **🎛️ Bold, Sharp & Clean Interface**:
  - Razor-sharp borders (`rounded-none`), high contrast typography, signature `#facc15` yellow accent, and seamless **Dark / Light** themes.
* **🎚️ Reactive SoundWave Visualizer**:
  - Integrated real-time audio visualizer responding dynamically to rhythm and drum transient impulses.
* **🎬 Cinema Mode Video Playback**:
  - Native HTML5 Fullscreen with zero stutter or lag (16 MB streaming buffer).
  - Complete idle autohide: progress bar, header, and mouse cursor automatically disappear after 2.5s of inactivity.
* **⌨️ Seeker-Attached Hotkeys**:
  - Seek with `←` / `→` arrow keys: the floating timestamp illuminates directly over the yellow seeker knob.
* **🧠 "MY MIX" Smart Offline Playlist**:
  - Automatically curates your most frequently and recently played tracks based on a rolling 14-day window.
  - 100% offline—no cloud profiling, no accounts, and entries older than 2 weeks are automatically purged.
* **🏷️ Lofty Metadata Inspector**:
  - Deep-inspect audio bitrate, sample rate, channels, codec, duration, and embedded cover art.
* **🔒 100% Private & Read-Only**:
  - Zero internet calls, zero telemetry, zero background indexing daemons.
  - Never modifies or writes to your media files.

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| `Space` or `K` | Play / Pause |
| `←` / `→` | Seek backward / forward 5 seconds |
| `Shift` + `←` / `→` | Seek backward / forward 10 seconds |
| `Ctrl` + `←` / `→` | Seek backward / forward 30 seconds |
| `J` / `L` | Seek -10s / +10s (YouTube standard) |
| `↑` / `↓` | Volume up / down (±5%) |
| `M` | Mute / Unmute (restores previous volume) |
| `0` – `9` | Jump to 0%, 10%, 20% ... 90% of duration |
| `Home` / `End` | Jump to beginning (`0:00`) or end |
| `F` or `F11` | Toggle Fullscreen |
| `N` / `P` | Next / Previous track |
| `Esc` | Exit fullscreen / Close modals |

---

## 🛠️ Building from Source

If you prefer to compile MEEDIA yourself:

### Prerequisites
1. **Node.js** (v18 or higher): [nodejs.org](https://nodejs.org/)
2. **Rust & Cargo**: [rustup.rs](https://rustup.rs/)
3. **Visual Studio C++ Build Tools**: Required by Rust on Windows.

### Development Mode
```powershell
# 1. Clone the repository
git clone https://github.com/<your-username>/meedia.git
cd meedia

# 2. Install frontend dependencies
npm install

# 3. Launch in development mode with live reload
npm run tauri dev
```

### Production Build
To package your own `.msi` and `.exe` installer bundles:
```powershell
npm run tauri build
```
The compiled binaries will be output to:
`src-tauri/target/release/bundle/msi/` and `src-tauri/target/release/bundle/nsis/`.

---

## 🔒 Privacy & Data Storage

* **Network Activity**: 0 bytes sent or received over the internet. MEEDIA runs completely air-gapped.
* **Local Storage**: Stores only 4 local preference keys in WebView2's sandboxed local storage:
  - Selected root folder path
  - Master volume level
  - Theme preference (`dark` / `light`)
  - Rolling 14-day play history for the "My Mix" smart playlist
* **File Safety**: All media files are opened strictly in read-only mode (`std::fs::File::open`).

---

## 📄 License

This project is open-source under the [MIT License](LICENSE).
