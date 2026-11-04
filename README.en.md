<p align="center">
  <img src="public/data/icon.png" alt="Manga Crawler Logo" width="100" height="100" style="border-radius: 20px;" />
</p>

<h1 align="center">Manga Crawler PC</h1>

<p align="center">
  <b>A powerful, all-in-one desktop application to crawl, read, process, and convert manga/comics with GPU-accelerated AI tools and visual workflows.</b>
</p>

<p align="center">
  <a href="README.md"><b>Tiếng Việt</b></a> • <a href="README.en.md"><b>English</b></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-3.0.46-blue.svg" alt="Version 3.0.46" />
  <img src="https://img.shields.io/badge/Electron-35+-47848F?logo=electron&logoColor=white" alt="Electron" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black" alt="React 19" />
  <img src="https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white" alt="Vite" />
  <img src="https://img.shields.io/badge/TailwindCSS-v4-38B2AC?logo=tailwind-css&logoColor=white" alt="Tailwind CSS" />
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows-lightgrey.svg" alt="Platform" />
  <img src="https://img.shields.io/badge/license-MIT-green.svg" alt="License" />
</p>

---

## 📖 Overview

**Manga Crawler PC** is a high-performance cross-platform desktop suite built for manga enthusiasts, digital archivists, and comic creators. It combines a robust multi-threaded download engine supporting over 60+ comic websites with state-of-the-art image processing, AI upscaling, offline reading, ebook packaging, and an automated visual workflow canvas.

---

## ✨ Key Features

### 1. 🚀 High-Speed Download Engine
* **60+ Built-in Connectors**: Native support for top Vietnamese and international manga portals (CuuTruyen, MangaPlus, NetTruyen, MangaDex, AsuraScans, Comick, Webtoons, Bato, and more).
* **Multi-threaded Pipeline**: Concurrent image fetching with auto-retry, chunked streaming, and deduplication.
* **Smart Resume & Checkpoints**: Idempotent download mechanism — resume interrupted downloads without re-fetching already saved pages.
* **Cloudflare & Anti-bot Bypass**: Built-in interactive browser session to securely sync Cloudflare cookies.
* **Extensible Plugin System**: Write and install custom JavaScript connectors dynamically through the Plugins Manager without rebuilding the app.

### 2. 🤖 AI Image Studio & Tools
* **GPU-Accelerated AI Upscale**: Enhance low-resolution scans with NCNN-Vulkan neural networks (**waifu2x**, **Real-ESRGAN**, **Real-CUGAN**). Auto-detects Vulkan GPU acceleration on Windows and macOS.
* **AI Manga Translation & OCR**: Integrated Manga OCR (ONNX local/offline or cloud vision) combined with AI translation providers (DeepL, Gemini, OpenAI, Claude).
* **Smart Page Splitter**: Auto-detects and splits double-page spreads into single pages with customizable reading flow (Right-to-Left / Left-to-Right).
* **Auto-Crop & Deskew**: Detects borders, crops unwanted scan margins, and straightens tilted scans automatically.
* **High-Efficiency Compression**: Lossless and visually lossless batch optimization with MozJPEG, WebP, and PNG.
* **Batch Rename & Deduplication**: Fast template-based renaming and perceptual hash duplicate image detection.

### 3. 📚 Ebook Studio (Packaging & Conversion)
* **Multi-format Packaging**: Export any downloaded or local comic folder into **CBZ**, **PDF**, **EPUB**, or **MOBI**.
* **Kindle Optimizer**: Prepares manga specifically for Kindle E-ink readers (spread splitting, resolution downsampling, grayscale conversion, and automated Table of Contents).
* **Batch Merge & Split**: Merge multiple chapters into an omnibus volume or split heavy archives into chapters.

### 4. 🔀 Workflow Studio (Node-based Automation Canvas)
* **Visual Graph Pipeline**: Chain operations together using a visual drag-and-drop flowchart editor.
* **Automate End-to-End**: Example: `Download Manga` ➔ `AI 2x Upscale` ➔ `Split Double Pages` ➔ `Compress MozJPEG` ➔ `Export to CBZ / Kindle EPUB` with one click.
* **Port Auto-Connection**: Smart node linking with progress visualization at each step.

### 5. 📖 Offline Reader & Library Manager
* **Distraction-Free Reader**: Read local archives (CBZ, ZIP, CBR, RAR, PDF, EPUB) and downloaded folders directly in the app.
* **Multiple Reading Modes**: Seamless vertical webtoon strip, single-page, and double-page spread. Fullscreen and custom zoom (50%–300%).
* **Library Tracking**: Track favorites, reading progress, history logs, and receive notifications when new chapters are detected.

### 6. 🎨 Modern Glassmorphic UI & 12 Themes
* **StudioLayout Architecture**: Two and three-column resizable studio panels with overlay handles (`ResizeSplitter`) and isolated scrollbars.
* **12 Signature Themes**: Handcrafted palettes (Deep Purple, Crimson, Cyberpunk, Forest, Slate, etc.) with seamless Dark/Light mode switching.
* **100% Internationalized**: Fully localized in English and Vietnamese.

---

## 🖥️ System Requirements & Support

| Platform | Architecture | Minimum OS |
|---|---|---|
| **Windows** | x64 | Windows 10 (1809+) or Windows 11 |
| **macOS** | Apple Silicon (`arm64`) | macOS 12 Monterey or later |
| **macOS** | Intel (`x64`) | macOS 11 Big Sur or later |

> **Note for AI Upscale**: GPU acceleration requires a graphics card compatible with Vulkan API (integrated Intel Iris / Apple Silicon Metal / NVIDIA GeForce / AMD Radeon).

---

## 🛠️ Tech Stack

* **Shell & Core**: [Electron](https://www.electronjs.org/) (v35+) with Node.js 22 runtime
* **UI Framework**: [React 19](https://react.dev/), [Vite 6](https://vitejs.dev/)
* **Styling**: [Tailwind CSS v4](https://tailwindcss.com/)
* **Image Processing**: [Sharp](https://sharp.pixelplumbing.com/) (libvips), [Canvas](https://github.com/Automattic/node-canvas), [pdf-lib](https://pdf-lib.js.org/)
* **AI & Machine Learning**: NCNN-Vulkan Binaries, [ONNX Runtime Node](https://onnxruntime.ai/)
* **Backend & Cloud (Optional)**: [Supabase](https://supabase.com/) Edge Functions (Deno runtime) for user entitlements & credit sync

---

## 🚀 Getting Started for Developers

### Prerequisites
* [Node.js](https://nodejs.org/) `>= 22.0.0`
* [npm](https://www.npmjs.com/) `>= 10.0.0`
* [Git](https://git-scm.com/)

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/suutamebooktruyentranh2025-hub/manga-clawer-pc.git
   cd manga-clawer-pc
   ```

2. **Install dependencies**:
   ```bash
   npm install --force
   ```

3. **Set up environment variables (optional)**:
   > **Note**: If you are using the app normally and **do not use Supabase login**, you **DO NOT NEED** to create a `.env` file. All core features (manga downloading, offline reading, AI image processing, and ebook export) work completely out-of-the-box without it.
   > 
   > *(Note: Google sign-in is only supported in the desktop (Electron) application).*
   ```bash
   cp .env.example .env
   # Only required if you deploy your own Supabase backend for member authentication
   ```

### Development Mode

Run the Electron desktop application with Vite dev server:

```bash
npm run electron:dev
```

### Running Tests

```bash
# Run unit and integration tests (Jest)
npm test

# Run tests in watch mode
npm run test:watch

# Test live connectors health
npm run test:connectors

# Run end-to-end tests (Playwright)
npm run test:e2e
```

### Packaging & Releasing

```bash
# Package for macOS (Universal / arm64 / x64 DMG)
npm run electron:build:mac

# Package for Windows (NSIS Installer .exe)
npm run electron:build:win

# Package both platforms
npm run electron:build:all
```

---

## 📂 Project Structure

```text
├── build/                # Windows NSIS installer icons and graphics
├── e2e/                  # Playwright end-to-end test suites & fixtures
├── electron/             # Electron main process
│   ├── config/           # Release links & remote extras manifests
│   ├── ipc/              # IPC handlers (download, tools, export, reader, etc.)
│   ├── lib/              # Core Node.js services (connectors, upscale, auth, ebook)
│   ├── main.js           # Electron main entry point
│   └── preload.js        # Context bridge & secure API exposure
├── public/               # Static assets, connector icons, and help guides
├── scripts/              # Build scripts, native module linkers & release utilities
├── src/                  # React 19 renderer frontend
│   ├── app/              # App providers, error boundaries, and root components
│   ├── features/         # Feature modules (home, tools-studio, ebook-studio, workflow, etc.)
│   ├── i18n/             # Localization dictionary (en.js, vi.js)
│   ├── platform/         # Connector UI hooks and platform adapters
│   ├── shared/           # Design system components (StudioLayout, ResizeSplitter, SearchableSelect)
│   └── utils/            # Client utilities, storage backups, and preferences
├── supabase/             # Edge Functions & migrations for cloud features
└── vite.config.js        # Vite bundler configuration
```

---

## 🤝 Contributing

Contributions, bug reports, and pull requests are warmly welcomed!
1. Fork the Project.
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`).
3. Commit your Changes (`git commit -m 'feat: add some AmazingFeature'`).
4. Push to the Branch (`git push origin feature/AmazingFeature`).
5. Open a Pull Request.

---

## 📜 License & Disclaimer

* Distributed under the **MIT License**.
* **Disclaimer**: This software is intended strictly for personal reading, archival, and format conversion of freely accessible content. Please respect copyright laws and support authors and official publishing platforms by purchasing original licensed works.

