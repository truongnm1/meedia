<div align="center">

<img src="app-icon.png" width="96" alt="MEEDIA Logo" />

# MEEDIA

**"It's ME's Media."**  
A fast, lightweight desktop media player for Windows. Sub-5MB. Completely offline.

[![Platform](https://img.shields.io/badge/platform-Windows%2010%20%7C%2011-blue?style=flat-square)](https://github.com)
[![Built with Tauri](https://img.shields.io/badge/built%20with-Tauri%202-24C8D8?style=flat-square&logo=tauri&logoColor=white)](https://tauri.app)
[![Rust](https://img.shields.io/badge/backend-Rust-DEA584?style=flat-square&logo=rust&logoColor=white)](https://www.rust-lang.org)
[![React](https://img.shields.io/badge/frontend-React%2019-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev)
[![Installer Size](https://img.shields.io/badge/installer%20size-~1.5%20MB-brightgreen?style=flat-square)](https://github.com)

</div>

---

## Downloads

Pre-built binaries are available under [Releases](https://github.com):

| Package | Format | Size | Notes |
| :--- | :--- | :--- | :--- |
| **MEEDIA Setup (.exe)** | NSIS | ~1.5 MB | Standard Windows installer with Start Menu & desktop shortcuts. |
| **MEEDIA Installer (.msi)** | MSI | ~2.2 MB | Windows Installer package for managed deployments. |

> **Note on Windows SmartScreen**: Open-source releases without a paid code-signing certificate may trigger a *"Windows protected your PC"* prompt on first launch. Click **More info** -> **Run anyway** to continue.

---

## Features

- **Lightweight**: ~1.5 MB installer, sub-5 MB installed size, and ~50 MB RAM usage during playback.
- **Audio & Video Playback**:
  - Audio: MP3, FLAC, WAV, OGG, M4A, AAC, OPUS, ALAC.
  - Video: MP4, MKV, WEBM, MOV with GPU hardware acceleration.
- **Fast Directory Scanning**: Multithreaded folder scanner built in Rust (`rayon` + `walkdir`) that reads large libraries with thousands of files without UI lockup.
- **Cinema Fullscreen**: Auto-hides playback controls, the progress bar, and the mouse cursor after 2.5 seconds of inactivity.
- **Keyboard Navigation**: Seek with arrow keys (`←`/`→`), adjust volume, toggle mute, and jump to timestamps with live seeker feedback.
- **My Mix (Offline Playlist)**: Locally tracks your playback frequency over a rolling 14-day window to generate a dynamic mix. No algorithms in the cloud, no telemetry, and entries older than two weeks are automatically deleted.
- **Metadata Inspector**: View technical audio information including sample rate, bitrate, channels, and embedded artwork via Lofty.
- **Offline & Read-Only**: Operates completely air-gapped with zero network requests. Files are accessed strictly read-only.

---

## Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| `Space` or `K` | Play / Pause |
| `←` / `→` | Seek ±5 seconds |
| `Shift` + `←` / `→` | Seek ±10 seconds |
| `Ctrl` + `←` / `→` | Seek ±30 seconds |
| `J` / `L` | Seek -10s / +10s |
| `↑` / `↓` | Volume ±5% |
| `M` | Mute / Unmute |
| `0` – `9` | Seek to 0% – 90% |
| `Home` / `End` | Jump to start / end |
| `F` or `F11` | Toggle Fullscreen |
| `N` / `P` | Next / Previous track |
| `Esc` | Exit fullscreen / Close modals |

---

## Building from Source

### Prerequisites
- [Node.js](https://nodejs.org/) (v18+)
- [Rust & Cargo](https://rustup.rs/)
- Visual Studio C++ Build Tools

### Development
```powershell
git clone https://github.com/<your-username>/meedia.git
cd meedia
npm install
npm run tauri dev
```

### Production Build
```powershell
npm run tauri build
```
Compiled installers are generated in `src-tauri/target/release/bundle/msi/` and `src-tauri/target/release/bundle/nsis/`.

---

## Privacy & Local Storage

MEEDIA makes zero network connections. Settings are saved strictly on your local machine using WebView2 `localStorage`:
- Selected root folder path
- Master volume level
- Dark / Light theme preference
- Rolling 14-day local playback history for My Mix

---

## License

MIT License.
