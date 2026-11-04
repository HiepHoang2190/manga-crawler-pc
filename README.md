<p align="center">
  <img src="public/data/icon.png" alt="Manga Crawler Logo" width="100" height="100" style="border-radius: 20px;" />
</p>

<h1 align="center">Manga Crawler PC</h1>

<p align="center">
  <b>Phần mềm máy tính tất-cả-trong-một: Tải truyện, đọc offline, xử lý ảnh chuyên sâu với AI tăng tốc GPU và tự động hóa quy trình xuất bản Ebook.</b>
</p>

<p align="center">
  <a href="README.md"><b>Tiếng Việt</b></a> • <a href="README.en.md"><b>English</b></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/phiên%20bản-3.0.46-blue.svg" alt="Phiên bản 3.0.46" />
  <img src="https://img.shields.io/badge/Electron-35+-47848F?logo=electron&logoColor=white" alt="Electron" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black" alt="React 19" />
  <img src="https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white" alt="Vite" />
  <img src="https://img.shields.io/badge/TailwindCSS-v4-38B2AC?logo=tailwind-css&logoColor=white" alt="Tailwind CSS" />
  <img src="https://img.shields.io/badge/nền%20tảng-macOS%20%7C%20Windows-lightgrey.svg" alt="Nền tảng" />
  <img src="https://img.shields.io/badge/giấy%20phép-MIT-green.svg" alt="Giấy phép" />
</p>

---

## 📖 Giới Thiệu Tổng Quan

**Manga Crawler PC** là bộ công cụ desktop đa nền tảng hiệu năng cao được phát triển dành cho độc giả yêu thích truyện tranh, lưu trữ số và những người làm nội dung ebook. Phần mềm kết hợp công nghệ tải đa luồng từ hơn 60+ website truyện hàng đầu, tích hợp bộ công cụ xử lý ảnh chuyên nghiệp, nâng cấp chất lượng bằng AI (Upscale GPU), trình đọc truyện offline mượt mà và bàn làm việc tự động hoá theo sơ đồ trực quan (Workflow Canvas).

---

## ✨ Các Tính Năng Nổi Bật

### 1. 🚀 Động Cơ Tải Truyện Tốc Độ Cao
* **Hơn 60+ Nguồn Truyện Tích Hợp Sẵn**: Hỗ trợ đầy đủ các cổng truyện lớn trong nước và quốc tế (Cứu Truyện, MangaPlus, NetTruyen, MangaDex, AsuraScans, Comick, Webtoons, Bato, TruyenQQ, v.v.).
* **Đường Ống Tải Đa Luồng**: Tải song song nhiều ảnh cùng lúc, tự động thử lại khi gián đoạn mạng, chống trùng lặp.
* **Cơ Chế Phục Hồi Thông Minh (Smart Resume)**: Tự động ghi nhớ tiến trình (idempotent), tiếp tục tải phần còn thiếu mà không phải tải lại các trang đã có.
* **Vượt Rào Cản Cloudflare & Anti-bot**: Tích hợp phiên trình duyệt thông minh để đồng bộ cookie bảo mật trực tiếp trong ứng dụng.
* **Hệ Thống Plugin Mở Rộng**: Cho phép tự viết thêm connector bằng JavaScript và cài đặt nhanh vào ứng dụng qua giao diện Quản lý Plugin mà không cần biên dịch lại code.

### 2. 🤖 Xưởng Công Cụ & Xử Lý Ảnh AI (Tools Studio)
* **Nâng Cấp Ảnh AI Tăng Tốc GPU (Upscale)**: Sử dụng mạng nơ-ron NCNN-Vulkan (**waifu2x**, **Real-ESRGAN**, **Real-CUGAN**) để làm nét và phóng to ảnh truyện mà không vỡ hạt. Tự động khai thác sức mạnh GPU (Vulkan) trên Windows và chip Apple Silicon (M1/M2/M3/M4).
* **Dịch Truyện & Nhận Diện Ký Tự AI (OCR)**: Tích hợp mô hình Manga OCR (chạy offline qua ONNX hoặc đám mây) kết hợp các dịch vụ AI dịch thuật thông minh (DeepL, Gemini, OpenAI, Claude).
* **Cắt Đôi Trang Tự Động (Split Double Pages)**: Nhận diện chính xác các trang đôi (hai trang ghép liền) và tự động cắt thành 2 trang đơn với chiều đọc tuỳ chỉnh (Phải sang Trái / Trái sang Phải).
* **Cắt Viền & Làm Thẳng Tự Động (Crop & Deskew)**: Tự động nhận diện đường biên, gọt bỏ viền thừa của bản scan và xoay thẳng các trang bị nghiêng.
* **Nén Ảnh Tối Ưu Dung Lượng**: Nén hàng loạt giữ nguyên chất lượng hiển thị bằng bộ giải mã MozJPEG, WebP và PNG.
* **Đổi Tên Hàng Loạt & Tìm Ảnh Trùng**: Hỗ trợ đổi tên theo biểu thức chính quy (Regex) và thuật toán hash nhận diện ảnh trùng lặp.

### 3. 📚 Xưởng Đóng Gói Ebook (Ebook Studio)
* **Xuất Đa Định Dạng**: Đóng gói các chương truyện hoặc thư mục ảnh thành file **CBZ**, **PDF**, **EPUB** hoặc **MOBI**.
* **Tối Ưu Hoá Riêng Cho Máy Đọc Sách Kindle**: Tự động chia đôi trang, điều chỉnh tỷ lệ khung hình, chuyển sang thang độ xám (grayscale) và tạo mục lục chương (TOC) tương thích chuẩn màn hình E-ink của Kindle.
* **Gộp & Tách File Hàng Loạt**: Gộp nhiều chương thành một tập truyện dày (Omnibus) hoặc chia nhỏ file nén lớn thành các chương riêng biệt.

### 4. 🔀 Tự Động Hóa Quy Trình (Workflow Studio)
* **Bàn Làm Việc Kéo Thả Trực Quan**: Kết nối các nút xử lý theo dạng sơ đồ khối linh hoạt.
* **Chuỗi Xử Lý Khép Kín 1 Chạm**: Ví dụ: `Tải truyện` ➔ `Nâng cấp AI 2x` ➔ `Chia đôi trang` ➔ `Nén MozJPEG` ➔ `Xuất ra EPUB Kindle` chỉ với một lần bấm chạy.
* **Tự Động Nối Cổng & Theo Dõi Tiến Độ**: Hiển thị trạng thái hoàn thành trực tiếp trên từng khối chức năng.

### 5. 📖 Trình Đọc Truyện & Thư Viện Cá Nhân
* **Trình Đọc Không Quảng Cáo**: Đọc trực tiếp các file nén lưu trữ (CBZ, ZIP, CBR, RAR, PDF, EPUB) hoặc các thư mục truyện đã tải trên máy.
* **Đa Dạng Chế Độ Đọc**: Đọc cuộn liên tục kiểu Webtoon mượt mà, đọc từng trang đơn hoặc xem trang đôi. Hỗ trợ toàn màn hình và thu phóng (50% – 300%).
* **Quản Lý Thư Viện**: Theo dõi bộ truyện yêu thích, tự động lưu lịch sử đọc, tự động kiểm tra và thông báo khi có chương mới ra mắt.

### 6. 🎨 Giao Diện Đẳng Cấp & 12 Bộ Màu Signature
* **Kiến Trúc StudioLayout Hiện Đại**: Các thanh panel phân chia linh hoạt, hỗ trợ kéo resize mượt mà (`ResizeSplitter`), thanh cuộn độc lập và kính mờ bóng bẩy.
* **12 Chủ Đề Màu Độc Bản**: Tím hoàng hôn, Đỏ Crimson, Cyberpunk, Rừng nhiệt đới, Slate... chuyển đổi 1-chạm giữa Light mode và Dark mode.
* **Đa Ngôn Ngữ Hoàn Chỉnh**: Hỗ trợ 100% tiếng Việt và tiếng Anh.

---

## 🖥️ Yêu Cầu Hệ Thống

| Nền tảng | Kiến trúc chip | Phiên bản hệ điều hành tối thiểu |
|---|---|---|
| **Windows** | x64 | Windows 10 (bản 1809 trở lên) hoặc Windows 11 |
| **macOS** | Apple Silicon (`arm64`) | macOS 12 Monterey trở lên |
| **macOS** | Intel (`x64`) | macOS 11 Big Sur trở lên |

> **Lưu ý về AI Upscale**: Tính năng nâng cấp ảnh AI cần máy có card đồ hoạ hỗ trợ Vulkan (bao gồm card Intel Iris, chip Apple Silicon Metal, NVIDIA GeForce, AMD Radeon).

---

## 🛠️ Công Nghệ Nền Tảng

* **Nhân Ứng Dụng**: [Electron](https://www.electronjs.org/) (v35+) chạy trên nền Node.js 22
* **Giao Diện Frontend**: [React 19](https://react.dev/), [Vite 6](https://vitejs.dev/)
* **Giao Diện Đồ Hoạ**: [Tailwind CSS v4](https://tailwindcss.com/)
* **Xử Lý Hình Ảnh Lõi**: [Sharp](https://sharp.pixelplumbing.com/) (libvips), [Canvas](https://github.com/Automattic/node-canvas), [pdf-lib](https://pdf-lib.js.org/)
* **Trí Tuệ Nhân Tạo & Học Máy**: Bộ thực thi NCNN-Vulkan, [ONNX Runtime Node](https://onnxruntime.ai/)
* **Hậu Cần & Đám Mây (Tuỳ chọn)**: [Supabase](https://supabase.com/) Edge Functions (Deno runtime) quản lý gói người dùng & đồng bộ đám mây

---

## 🚀 Hướng Dẫn Dành Cho Lập Trình Viên

### Yêu Cầu Cài Đặt
* [Node.js](https://nodejs.org/) phiên bản `>= 22.0.0`
* [npm](https://www.npmjs.com/) phiên bản `>= 10.0.0`
* [Git](https://git-scm.com/)

### Cài Đặt Môi Trường

1. **Clone repository về máy**:
   ```bash
   git clone https://github.com/suutamebooktruyentranh2025-hub/manga-clawer-pc.git
   cd manga-clawer-pc
   ```

2. **Cài đặt các gói phụ thuộc**:
   ```bash
   npm install --force
   ```

3. **Thiết lập biến môi trường (tuỳ chọn)**:
   > **Lưu ý**: Nếu bạn chỉ sử dụng ứng dụng thông thường và **không dùng chức năng đăng nhập qua Supabase** thì **KHÔNG CẦN** tạo file `.env`. Toàn bộ tính năng cốt lõi (tải truyện, đọc offline, xử lý ảnh AI, đóng gói ebook) đều hoạt động đầy đủ mà không cần cấu hình.
   > 
   > *(Lưu ý: Chỉ bản ứng dụng desktop (Electron) mới hỗ trợ đăng nhập Google).*
   ```bash
   cp .env.example .env
   # Chỉ cấu hình nếu bạn tự triển khai máy chủ Supabase riêng để quản lý tài khoản
   ```

### Chạy Môi Trường Phát Triển (Dev Mode)

Khởi chạy ứng dụng desktop Electron cùng máy chủ Vite:

```bash
npm run electron:dev
```

### Chạy Kiểm Thử (Tests)

```bash
# Chạy toàn bộ Unit test & Integration test (Jest)
npm test

# Chạy test ở chế độ theo dõi file (watch mode)
npm run test:watch

# Kiểm tra tình trạng kết nối các nguồn truyện trực tuyến
npm run test:connectors

# Chạy kiểm thử tự động giao diện E2E (Playwright)
npm run test:e2e
```

### Đóng Gói Ứng Dụng (Build & Release)

```bash
# Đóng gói cho macOS (tạo file DMG cho cả chip Intel và Apple Silicon)
npm run electron:build:mac

# Đóng gói cho Windows (tạo bộ cài đặt .exe với trình cài NSIS)
npm run electron:build:win

# Đóng gói cho cả hai nền tảng
npm run electron:build:all
```

---

## 📂 Cấu Trúc Thư Mục Dự Án

```text
├── build/                # Biểu tượng và hình ảnh giao diện bộ cài đặt Windows NSIS
├── e2e/                  # Bộ kịch bản kiểm thử tự động E2E (Playwright)
├── electron/             # Quy trình chính (Main Process) của Electron
│   ├── config/           # Cấu hình link tải bản phát hành và các module bổ sung
│   ├── ipc/              # Bộ xử lý IPC (tải truyện, xử lý ảnh, xuất file, đọc truyện...)
│   ├── lib/              # Dịch vụ backend Node.js (connectors, upscale, auth, ebook)
│   ├── main.js           # Điểm khởi động chính của Electron
│   └── preload.js        # Cầu nối Context Bridge & bảo mật IPC
├── public/               # Tài nguyên tĩnh, icon nguồn truyện và hình ảnh hướng dẫn
├── scripts/              # Script hỗ trợ build, liên kết thư viện native & release
├── src/                  # Giao diện người dùng React 19 (Renderer Process)
│   ├── app/              # App providers, bộ bắt lỗi và khung bao ngoài
│   ├── features/         # Các module chức năng (Trang chủ, Công cụ, Ebook, Tự động hoá...)
│   ├── i18n/             # Từ điển đa ngôn ngữ (en.js, vi.js)
│   ├── platform/         # Kết nối nguồn truyện và bộ điều hợp nền tảng
│   ├── shared/           # Hệ thống component chuẩn hoá (StudioLayout, ResizeSplitter...)
│   └── utils/            # Tiện ích phía client, sao lưu dữ liệu và cài đặt cá nhân
├── supabase/             # Edge Functions & migrations cho các tính năng tài khoản
└── vite.config.js        # Cấu hình đóng gói Vite
```

---

## 🤝 Đóng Góp Phát Triển

Mọi đóng góp, báo cáo lỗi (issue) và pull request đều được hoan nghênh nồng nhiệt!
1. Fork dự án về tài khoản của bạn.
2. Tạo nhánh tính năng mới (`git checkout -b feature/TinhNangTuyetVoi`).
3. Commit thay đổi (`git commit -m 'feat: thêm TinhNangTuyetVoi'`).
4. Đẩy lên nhánh của bạn (`git push origin feature/TinhNangTuyetVoi`).
5. Tạo Pull Request trên GitHub.

---

## 📜 Giấy Phép & Tuyên Bố Miễn Trừ Trách Nhiệm

* Dự án được phân phối dưới giấy phép nguồn mở **MIT License**.
* **Tuyên bố**: Phần mềm này được phát triển hoàn toàn vì mục đích học tập, đọc truyện cá nhân, sao lưu và chuyển đổi định dạng tài liệu số. Vui lòng tôn trọng quyền tác giả và ủng hộ các tác giả truyện tranh cùng các nhà xuất bản bằng cách mua ấn bản chính thức.
