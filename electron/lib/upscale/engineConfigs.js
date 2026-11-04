/**
 * Engine & Model Registry for AI Image Upscale.
 *
 * Three NCNN-Vulkan engines:
 *   - waifu2x-ncnn-vulkan  (nihui)   — MIT
 *   - realesrgan-ncnn-vulkan (xinntao) — MIT
 *   - realcugan-ncnn-vulkan (nihui)   — MIT
 *
 * All engines use Vulkan API for GPU acceleration on any platform/GPU.
 * Quality is equivalent to waifu2x-caffe (same CUNet/UpResNet10 model weights).
 */

const ENGINES = {
  waifu2x: {
    id: 'waifu2x',
    binaryName: 'waifu2x-ncnn-vulkan',
    license: 'MIT',
    repo: 'https://github.com/nihui/waifu2x-ncnn-vulkan',
    supportsDenoise: true,
    denoiseRange: [-1, 0, 1, 2, 3],
  },
  realesrgan: {
    id: 'realesrgan',
    binaryName: 'realesrgan-ncnn-vulkan',
    license: 'MIT',
    repo: 'https://github.com/xinntao/Real-ESRGAN-ncnn-vulkan',
    supportsDenoise: false,
    denoiseRange: [],
  },
  realcugan: {
    id: 'realcugan',
    binaryName: 'realcugan-ncnn-vulkan',
    license: 'MIT',
    repo: 'https://github.com/nihui/realcugan-ncnn-vulkan',
    supportsDenoise: true,
    denoiseRange: [-1, 0, 1, 2, 3],
  },
};

const MODELS = [
  // ── waifu2x models ──
  {
    id: 'cunet',
    engineId: 'waifu2x',
    label: 'CUNet (Highest Quality)',
    labelVi: 'CUNet (Chất lượng cao nhất)',
    suffixTag: 'cunet',
    scales: [2],
    modelDirName: 'models-cunet',
    description: 'Best quality for 2D illustration — same as waifu2x-caffe CUNet',
    descriptionVi: 'Chất lượng cao nhất cho ảnh 2D — cùng model waifu2x-caffe CUNet',
    prosEn: ['Highest quality among waifu2x models', 'Best for manga/anime line art', 'Strong denoise support'],
    consEn: ['Only supports 2x scale', 'Slower than UpRGB'],
    prosVi: ['Chất lượng cao nhất trong các model waifu2x', 'Tốt nhất cho nét vẽ manga/anime', 'Khử nhiễu mạnh'],
    consVi: ['Chỉ hỗ trợ phóng to 2x', 'Chậm hơn UpRGB'],
    estimatedSizeMB: 7,
    bundled: true,
  },
  {
    id: 'upconv7_anime',
    engineId: 'waifu2x',
    label: 'UpRGB (Anime)',
    labelVi: 'UpRGB (Anime)',
    suffixTag: 'upconv7_anime',
    scales: [2],
    modelDirName: 'models-upconv_7_anime_style_art_rgb',
    description: 'Fast 2D illustration upscale',
    descriptionVi: '2D illustration nhanh',
    prosEn: ['Tuned specifically for anime art style', 'Good balance of speed & quality', 'Low VRAM usage'],
    consEn: ['Only 2x scale', 'Not ideal for real photos', 'Older model generation'],
    prosVi: ['Tối ưu riêng cho phong cách anime', 'Cân bằng tốt giữa tốc độ & chất lượng', 'Dùng ít VRAM'],
    consVi: ['Chỉ hỗ trợ 2x', 'Không phù hợp ảnh thật', 'Thế hệ model cũ'],
    estimatedSizeMB: 4,
    bundled: true,
  },
  {
    id: 'upconv7_photo',
    engineId: 'waifu2x',
    label: 'UpPhoto',
    labelVi: 'UpPhoto',
    suffixTag: 'upconv7_photo',
    scales: [2],
    modelDirName: 'models-upconv_7_photo',
    description: 'Photo / anime upscale',
    descriptionVi: 'Ảnh thật / anime',
    prosEn: ['Works for both photos and anime', 'Preserves natural textures', 'Good denoise on photos'],
    consEn: ['Only 2x scale', 'Jack of all trades, master of none', 'Older architecture'],
    prosVi: ['Hoạt động cho cả ảnh thật và anime', 'Giữ được texture tự nhiên', 'Khử nhiễu tốt trên ảnh chụp'],
    consVi: ['Chỉ hỗ trợ 2x', 'Đa năng nhưng không chuyên sâu', 'Kiến trúc cũ'],
    estimatedSizeMB: 4,
    bundled: true,
  },
  // ── realesrgan models ──
  {
    id: 'realesrgan-x4plus-anime',
    engineId: 'realesrgan',
    label: 'Real-ESRGAN Anime 4x',
    labelVi: 'Real-ESRGAN Anime 4x',
    suffixTag: 'realesrgan_anime',
    scales: [4],
    modelName: 'realesrgan-x4plus-anime',
    description: 'Best for restoring low-quality anime images / JPEG artifacts',
    descriptionVi: 'Tốt nhất cho phục hồi ảnh anime chất lượng thấp / JPEG nén',
    prosEn: ['Excellent at removing JPEG artifacts', 'Native 4x scale — very sharp output', 'Best for restoring old/low-res manga scans'],
    consEn: ['Only 4x (can be too large)', 'Slower — heavy GAN model', 'No denoise parameter (built-in)'],
    prosVi: ['Loại bỏ artifact JPEG xuất sắc', 'Phóng to 4x gốc — đầu ra rất sắc nét', 'Tốt nhất cho phục hồi scan manga cũ/thấp'],
    consVi: ['Chỉ 4x (có thể quá lớn)', 'Chậm — model GAN nặng', 'Không có tham số khử nhiễu (tích hợp sẵn)'],
    estimatedSizeMB: 17,
    bundled: true,
  },
  {
    id: 'realesrgan-x4plus',
    engineId: 'realesrgan',
    label: 'Real-ESRGAN General 4x',
    labelVi: 'Real-ESRGAN Tổng quát 4x',
    suffixTag: 'realesrgan',
    scales: [4],
    modelName: 'realesrgan-x4plus',
    description: 'General purpose / real photos',
    descriptionVi: 'Đa năng / ảnh thật',
    prosEn: ['Best for real-world photos', 'Strong face & texture restoration', 'Handles complex scenes well'],
    consEn: ['Heavy GAN model (~64 MB)', 'Only 4x scale', 'May over-smooth anime line art'],
    prosVi: ['Tốt nhất cho ảnh thật', 'Phục hồi mặt người & texture mạnh', 'Xử lý tốt cảnh phức tạp'],
    consVi: ['Model tương đối nặng (~64 MB)', 'Chỉ hỗ trợ 4x', 'Có thể làm mờ nét vẽ anime'],
    estimatedSizeMB: 64,
    bundled: true,
  },
  {
    id: 'realesr-animevideov3',
    engineId: 'realesrgan',
    label: 'Real-ESRGAN Video v3',
    labelVi: 'Real-ESRGAN Video v3',
    suffixTag: 'animevideov3',
    scales: [2, 3, 4],
    modelName: 'realesr-animevideov3',
    description: 'Lightweight, fast, multi-scale',
    descriptionVi: 'Nhẹ, nhanh, đa scale',
    prosEn: ['Supports 2x, 3x, 4x — most flexible', 'Very fast & lightweight (~6 MB)', 'Great for batch processing'],
    consEn: ['Lower quality than x4plus-anime', 'Designed for video (less sharp on stills)', 'No denoise control'],
    prosVi: ['Hỗ trợ 2x, 3x, 4x — linh hoạt nhất', 'Rất nhanh & nhẹ (~6 MB)', 'Phù hợp xử lý hàng loạt'],
    consVi: ['Chất lượng thấp hơn x4plus-anime', 'Thiết kế cho video (kém sắc nét trên ảnh tĩnh)', 'Không điều chỉnh được khử nhiễu'],
    estimatedSizeMB: 6,
    bundled: true,
  },
  {
    id: 'mangajanai-2x-1600p',
    engineId: 'realesrgan',
    label: 'MangaJaNai 2x (1600p B&W)',
    labelVi: 'MangaJaNai 2x (1600p Đen trắng)',
    suffixTag: 'mangajanai_2x',
    scales: [2],
    modelName: 'mangajanai-2x-1600p',
    description: 'Specialized for B&W manga pages (~1600px height) — restores halftone patterns & cleans moiré',
    descriptionVi: 'Chuyên dụng cho manga đen trắng (~1600px) — phục hồi hạt trame & khử nhiễu moiré',
    prosEn: ['Best-in-class halftone screentone restoration', 'Cleans harsh moiré patterns', 'Fast 2x upscale'],
    consEn: ['Optimized for B&W manga, not photos', 'Fixed 2x scale'],
    prosVi: ['Khôi phục hạt trame chuẩn in ấn tốt nhất', 'Khử vân sọc moiré vượt trội', 'Tốc độ 2x nhanh'],
    consVi: ['Tối ưu cho manga đen trắng, không hợp ảnh chụp', 'Chỉ hỗ trợ 2x'],
    estimatedSizeMB: 32,
    bundled: true,
  },
  {
    id: 'mangajanai-4x-1600p',
    engineId: 'realesrgan',
    label: 'MangaJaNai 4x (1600p B&W)',
    labelVi: 'MangaJaNai 4x (1600p Đen trắng)',
    suffixTag: 'mangajanai_4x',
    scales: [4],
    modelName: 'mangajanai-4x-1600p',
    description: 'Deep restoration for high-res B&W manga pages — print-like quality',
    descriptionVi: 'Phục hồi sâu cho manga đen trắng độ phân giải cao — chất lượng tương đương bản in',
    prosEn: ['Highest quality screentone recovery', 'Native 4x scale for large screens/print', 'Completely eliminates JPEG block artifacts'],
    consEn: ['Slower processing time', 'Large output file size', 'Only 4x scale'],
    prosVi: ['Chất lượng tái tạo trame cao nhất', 'Phóng to 4x sắc nét cho màn hình lớn/in ấn', 'Xóa sạch khối nén JPEG'],
    consVi: ['Xử lý chậm hơn bản 2x', 'File ảnh đầu ra dung lượng lớn', 'Chỉ hỗ trợ 4x'],
    estimatedSizeMB: 32,
    bundled: true,
  },
  {
    id: 'illustrationjanai-4x',
    engineId: 'realesrgan',
    label: 'IllustrationJaNai 4x (Color / Cover)',
    labelVi: 'IllustrationJaNai 4x (Trang màu / Bìa)',
    suffixTag: 'illustrationjanai_4x',
    scales: [4],
    modelName: 'illustrationjanai-4x',
    description: 'Trained on high-quality manga covers & color illustrations — vibrant lines and smooth gradients',
    descriptionVi: 'Huấn luyện riêng cho bìa manga & tranh màu — nét vẽ căng mịn và chuyển màu mượt',
    prosEn: ['Superb color fidelity & line clarity', 'Preserves intricate cover art details', 'Clean color gradient transitions'],
    consEn: ['Only 4x scale', 'Heavy processing compared to 2x'],
    prosVi: ['Tái hiện màu sắc và đường nét bìa truyện xuất sắc', 'Giữ trọn chi tiết hội họa tinh xảo', 'Mịn màng không bị lem màu'],
    consVi: ['Chỉ hỗ trợ 4x', 'Nặng hơn so với model 2x'],
    estimatedSizeMB: 32,
    bundled: true,
  },
  // ── realcugan models ──
  {
    id: 'realcugan-se',
    engineId: 'realcugan',
    label: 'Real-CUGAN SE',
    labelVi: 'Real-CUGAN SE',
    suffixTag: 'cugan',
    scales: [2, 3, 4],
    modelDirName: 'models-se',
    description: 'Balanced sharpness and natural look — by Bilibili AI Lab',
    descriptionVi: 'Cân bằng sắc nét và tự nhiên — Bilibili AI Lab',
    prosEn: ['Best balance of sharpness & naturalness', 'Multi-scale (2x/3x/4x)', 'Fine denoise control (-1 to 3)', 'By Bilibili AI Lab — trained on anime data'],
    consEn: ['Slightly slower than waifu2x UpResNet10', 'CUGAN-specific artifacts on some photos'],
    prosVi: ['Cân bằng tốt nhất giữa sắc nét & tự nhiên', 'Đa scale (2x/3x/4x)', 'Điều chỉnh khử nhiễu tinh (-1 đến 3)', 'Bilibili AI Lab — huấn luyện trên dữ liệu anime'],
    consVi: ['Chậm hơn một chút so với waifu2x UpResNet10', 'Có thể xuất hiện artifact trên ảnh thật'],
    estimatedSizeMB: 12,
    bundled: true,
  },
  {
    id: 'realcugan-pro',
    engineId: 'realcugan',
    label: 'Real-CUGAN Pro',
    labelVi: 'Real-CUGAN Pro',
    suffixTag: 'cugan_pro',
    scales: [2, 3],
    modelDirName: 'models-pro',
    description: 'Enhanced version — sharper output',
    descriptionVi: 'Phiên bản cải tiến — đầu ra sắc nét hơn',
    prosEn: ['Sharper than SE variant', 'Better edge preservation', 'Good denoise support'],
    consEn: ['Only 2x & 3x scale', 'Slightly more aggressive sharpening'],
    prosVi: ['Sắc nét hơn phiên bản SE', 'Giữ cạnh viền tốt hơn', 'Khử nhiễu tốt'],
    consVi: ['Chỉ hỗ trợ 2x & 3x', 'Làm sắc hơi mạnh tay'],
    estimatedSizeMB: 12,
    bundled: true,
  },
  {
    id: 'realcugan-nose',
    engineId: 'realcugan',
    label: 'Real-CUGAN NoSE',
    labelVi: 'Real-CUGAN NoSE',
    suffixTag: 'cugan_nose',
    scales: [2],
    modelDirName: 'models-nose',
    description: 'No denoise, upscale only — preserves original grain',
    descriptionVi: 'Không khử nhiễu, chỉ phóng to — giữ nguyên grain gốc',
    prosEn: ['Preserves original grain/texture perfectly', 'Fastest CUGAN variant'],
    consEn: ['Only 2x scale', 'No denoise — noisy input stays noisy', 'Not suitable for JPEG-compressed sources'],
    prosVi: ['Giữ nguyên grain/texture gốc hoàn hảo', 'Nhanh nhất trong các CUGAN'],
    consVi: ['Chỉ hỗ trợ phóng to 2x', 'Không khử nhiễu — ảnh nhiễu vẫn nhiễu', 'Không phù hợp ảnh nén JPEG nặng'],
    estimatedSizeMB: 12,
    bundled: true,
  },
];

function getEngineConfig(engineId) {
  return ENGINES[engineId] || null;
}

function getAllEngines() {
  return Object.values(ENGINES);
}

function getAllModels() {
  return MODELS;
}

function getModelsByEngine(engineId) {
  return MODELS.filter((m) => m.engineId === engineId);
}

function getModelConfig(modelId) {
  return MODELS.find((m) => m.id === modelId) || null;
}

module.exports = {
  ENGINES,
  MODELS,
  getEngineConfig,
  getAllEngines,
  getAllModels,
  getModelsByEngine,
  getModelConfig,
};
