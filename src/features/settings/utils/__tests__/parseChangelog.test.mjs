import assert from 'node:assert/strict';
import { parseChangelog } from '../parseChangelog.mjs';

describe('parseChangelog', () => {
  it('handles null, undefined, and empty string gracefully', () => {
    assert.deepEqual(parseChangelog(null), []);
    assert.deepEqual(parseChangelog(undefined), []);
    assert.deepEqual(parseChangelog(''), []);
    assert.deepEqual(parseChangelog('   \n  \n'), []);
  });

  it('parses standard bullet points without tags as general items', () => {
    const raw = '- Cập nhật giao diện\n- Tăng tốc độ đọc file\n* Hỗ trợ truyện tranh mới';
    const items = parseChangelog(raw);
    assert.equal(items.length, 3);
    assert.equal(items[0].type, 'general');
    assert.equal(items[0].content, 'Cập nhật giao diện');
    assert.equal(items[1].type, 'general');
    assert.equal(items[1].content, 'Tăng tốc độ đọc file');
    assert.equal(items[2].type, 'general');
    assert.equal(items[2].content, 'Hỗ trợ truyện tranh mới');
  });

  it('categorizes items with [New], [Mới], ✨ as new', () => {
    const raw = `
- [New] Thêm tính năng dịch đa luồng
- [Mới] Bổ sung Claude 3.5 Sonnet
- ✨ Giao diện Manga Studio mới
    `;
    const items = parseChangelog(raw);
    assert.equal(items.length, 3);
    assert.equal(items[0].type, 'new');
    assert.equal(items[0].content, 'Thêm tính năng dịch đa luồng');
    assert.equal(items[1].type, 'new');
    assert.equal(items[1].content, 'Bổ sung Claude 3.5 Sonnet');
    assert.equal(items[2].type, 'new');
    assert.equal(items[2].content, 'Giao diện Manga Studio mới');
  });

  it('categorizes items with [Fix], [Sửa lỗi], 🐛 as fix', () => {
    const raw = `
- [Fix] Sửa lỗi crash khi tải ảnh webp
- [Sửa lỗi] Khắc phục lỗi font tiếng Nhật
- 🐛 Xử lý lỗi timeout connector
    `;
    const items = parseChangelog(raw);
    assert.equal(items.length, 3);
    assert.equal(items[0].type, 'fix');
    assert.equal(items[0].content, 'Sửa lỗi crash khi tải ảnh webp');
    assert.equal(items[1].type, 'fix');
    assert.equal(items[1].content, 'Khắc phục lỗi font tiếng Nhật');
    assert.equal(items[2].type, 'fix');
    assert.equal(items[2].content, 'Xử lý lỗi timeout connector');
  });

  it('categorizes items with [Improve], [Cải tiến], ⚡ as improve', () => {
    const raw = `
- [Improve] Tối ưu bộ nhớ đệm
- [Cải tiến] Tăng tốc độ nhận diện bóng thoại
- ⚡ Nâng cấp hiệu năng vẽ canvas
    `;
    const items = parseChangelog(raw);
    assert.equal(items.length, 3);
    assert.equal(items[0].type, 'improve');
    assert.equal(items[0].content, 'Tối ưu bộ nhớ đệm');
    assert.equal(items[1].type, 'improve');
    assert.equal(items[1].content, 'Tăng tốc độ nhận diện bóng thoại');
    assert.equal(items[2].type, 'improve');
    assert.equal(items[2].content, 'Nâng cấp hiệu năng vẽ canvas');
  });

  it('handles mixed content and escaped newlines', () => {
    const raw = '[Mới] Tính năng tự động cập nhật\\nSửa lỗi crash khi đóng app\\n- [Tối ưu] Giảm 50% CPU khi cuộn trang';
    const items = parseChangelog(raw);
    assert.equal(items.length, 3);
    assert.equal(items[0].type, 'new');
    assert.equal(items[0].content, 'Tính năng tự động cập nhật');
    assert.equal(items[1].type, 'general');
    assert.equal(items[1].content, 'Sửa lỗi crash khi đóng app');
    assert.equal(items[2].type, 'improve');
    assert.equal(items[2].content, 'Giảm 50% CPU khi cuộn trang');
  });
});
