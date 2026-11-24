const { detectQrCode, DONATE_OR_GROUP_PATTERNS } = require('../../../../export/image/detectors/qrDetector');
const { getSharp } = require('../../../../shared/checkSharp');

describe('qrDetector', () => {
  const sharp = getSharp();

  test('returns hasQr: false on plain image without QR code', async () => {
    const plainBuf = await sharp({
      create: { width: 200, height: 200, channels: 3, background: { r: 200, g: 200, b: 200 } },
    }).jpeg().toBuffer();

    const res = await detectQrCode(plainBuf);
    expect(res.hasQr).toBe(false);
  });

  test('handles tall webtoon buffer without crashing (bounds both width and height)', async () => {
    const tallBuf = await sharp({
      create: { width: 800, height: 4000, channels: 3, background: { r: 240, g: 240, b: 240 } },
    }).jpeg().toBuffer();

    const res = await detectQrCode(tallBuf);
    expect(res.hasQr).toBe(false);
  });

  test('supports adaptive inversion options (bright avgMean vs dark avgMean)', async () => {
    const brightBuf = await sharp({
      create: { width: 300, height: 300, channels: 3, background: { r: 235, g: 235, b: 235 } },
    }).jpeg().toBuffer();
    const darkBuf = await sharp({
      create: { width: 300, height: 300, channels: 3, background: { r: 20, g: 20, b: 20 } },
    }).jpeg().toBuffer();

    const r1 = await detectQrCode(brightBuf, { avgMean: 235 });
    const r2 = await detectQrCode(darkBuf, { avgMean: 20 });
    expect(r1.hasQr).toBe(false);
    expect(r2.hasQr).toBe(false);
  });

  test('returns hasQr: false on invalid or null buffer', async () => {
    const res = await detectQrCode(null);
    expect(res.hasQr).toBe(false);
  });

  test('DONATE_OR_GROUP_PATTERNS matches common links and VietQR/donate keywords', () => {
    const testCases = [
      'https://discord.gg/manga-team',
      'https://t.me/truyentranh',
      'https://facebook.com/nhomdich',
      'momo.vn/pay/0987654321',
      '00020101021138540010A000000727012400069704220110098765432153037045802VN',
      'https://patreon.com/scanlation',
      'https://paypal.me/donate',
    ];

    for (const url of testCases) {
      expect(DONATE_OR_GROUP_PATTERNS.some((p) => p.test(url))).toBe(true);
    }
  });

  test('DONATE_OR_GROUP_PATTERNS does not match normal story dialogue', () => {
    const normalText = 'Xin chao, day la trang truyen so 12 cua bo truyen tranh.';
    expect(DONATE_OR_GROUP_PATTERNS.some((p) => p.test(normalText))).toBe(false);
  });
});
