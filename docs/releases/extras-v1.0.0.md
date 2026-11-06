# Manga Crawler Extras v1.0.0 — Gói Bổ Trợ AI Phục Chế & Upscale

Gói tài nguyên mở rộng chính thức dành cho ứng dụng **Manga Crawler (Sưu Tầm Ebook Truyện Tranh)**. Gói này cung cấp các mô hình trí tuệ nhân tạo (AI) và công cụ tăng độ phân giải hình ảnh bằng GPU Vulkan/Metal để phục chế truyện tranh cũ mờ nhòe, kèm môi trường thực thi dịch thuật offline.

---

## 📦 Hướng Dẫn Chọn File Tải Theo Thiết Bị

Vui lòng chọn **đúng 1 file zip** tương ứng với hệ điều hành và phần cứng máy tính của bạn:

| Tên Tệp Zip | Hệ Điều Hành & Phần Cứng Tương Thích | Dung Lượng |
| :--- | :--- | :--- |
| **`manga-crawler-extras-win-x64.zip`** | **Windows 10 / 11 64-bit**<br>• PC, máy bàn hoặc laptop chạy CPU Intel hoặc AMD.<br>• Hỗ trợ card đồ họa NVIDIA, AMD Radeon hoặc Intel HD/UHD/Iris Graphics. | ~264 MB |
| **`manga-crawler-extras-mac-arm64.zip`** | **macOS Apple Silicon (Chip M)**<br>• MacBook Pro, MacBook Air, Mac mini, Mac Studio, iMac chạy chip **M1, M2, M3, M4** (bao gồm bản Pro / Max / Ultra). | ~251 MB |
| **`manga-crawler-extras-mac-x64.zip`** | **macOS Intel**<br>• Các đời máy Mac sản xuất từ năm **2020 trở về trước** chạy chip xử lý của **Intel** (Core i5, i7, i9). | ~238 MB |

---

## 🌟 Các Thành Phần & Tính Năng Nổi Bật

### 1. Bộ 3 Mô Hình AI MangaJaNai (Mới Nhất)
Được huấn luyện chuyên sâu cho nét vẽ truyện tranh và truyện màu:
- **`mangajanai-2x-1600p`** *(Khuyên Dùng Cho Truyện Tranh)*: Khử nhiễu nén JPEG, làm sắc nét đường line art và bảo toàn hạt tram (screentone) của các bản scan truyện cũ, nâng độ phân giải lên chuẩn đọc tối ưu 1600p.
- **`mangajanai-4x-1600p`**: Tái tạo lại chi tiết nét vẽ sắc sảo dành cho các trang truyện scan độ phân giải cực thấp hoặc mờ nhòe nghiêm trọng.
- **`illustrationjanai-4x`**: Chuyên phục chế tranh vẽ màu, ảnh bìa volume, artbook và trang màu đầu chương.

### 2. Bộ Engine C++ NCNN Tối Ưu Bằng GPU (Vulkan / Metal)
- Tích hợp sẵn các engine nhị phân: **Real-ESRGAN**, **Waifu2x** và **Real-CUGAN**.
- Chạy trực tiếp và độc lập 100% bằng GPU, **hoàn toàn không cần cài đặt Python, PyTorch hay CUDA phức tạp**.

### 3. Môi Trường Dịch Thuật Offline (ONNX Runtime)
- Cung cấp sẵn runtime native để chạy tính năng dịch bong bóng thoại truyện tranh bằng AI mà không cần gửi dữ liệu lên máy chủ bên ngoài.

---

## 💡 Cách Sử Dụng Trong Ứng Dụng Manga Crawler

### Cách 1: Tải Tự Động (Khuyên Dùng — 1 Click)
- Mở ứng dụng **Manga Crawler** > Vào mục **Xuất file** > Tab **Upscale (Nâng cấp ảnh AI)**.
- Khi có thông báo chưa có gói tài nguyên, bạn chỉ cần bấm nút **"Cài đặt tự động"** (hoặc vào tab **Cài đặt** > mục **Gói tài nguyên mở rộng**). Ứng dụng sẽ tự động tải file zip phù hợp từ trang Release này và tự động giải nén.

### Cách 2: Cài Đặt Thủ Công Từ Tệp Zip
- Tải file `.zip` phù hợp với máy tính của bạn ở danh sách đính kèm bên dưới.
- Trong ứng dụng Manga Crawler, bấm **"Chọn file .zip có sẵn"** và chọn tệp vừa tải về. Ứng dụng sẽ tự động thiết lập và sẵn sàng sử dụng ngay lập tức.
