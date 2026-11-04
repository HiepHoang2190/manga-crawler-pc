#!/usr/bin/env node
/**
 * Trích xuất nội dung ghi chú phát hành (release notes) cho tag hiện tại.
 * 
 * - Ưu tiên 1: Đọc từ docs/releases/vX.Y.Z.md, trích xuất từ mục "## 🚀 Chi Tiết Bản Phát Hành"
 * - Ưu tiên 2: Fallback lấy danh sách git commits giữa tag trước và tag hiện tại
 * - Ưu tiên 3: Fallback nội dung mặc định
 * 
 * Kết quả được ghi ra file RELEASE_BODY.md ở thư mục gốc dự án.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function extractReleaseNotes(tagName) {
  const rootDir = path.resolve(__dirname, '..');
  const tag = (
    tagName ||
    process.argv[2] ||
    process.env.TAG_NAME ||
    process.env.GITHUB_REF_NAME ||
    ''
  ).trim();

  let version = '';
  if (tag) {
    version = tag.replace(/^v/i, '');
  } else {
    try {
      version = require(path.join(rootDir, 'package.json')).version;
    } catch {
      version = '1.0.0';
    }
  }

  const normalizedTag = `v${version}`;

  // 1. Thử tìm trong docs/releases/
  const candidateFilenames = [
    `${tag}.md`,
    `${normalizedTag}.md`,
    `${version}.md`,
    `${tag}.markdown`,
    `${normalizedTag}.markdown`,
  ];

  for (const filename of candidateFilenames) {
    const docPath = path.join(rootDir, 'docs', 'releases', filename);
    if (fs.existsSync(docPath)) {
      const rawContent = fs.readFileSync(docPath, 'utf8').trim();

      // Tìm mục "## 🚀 Chi Tiết Bản Phát Hành" (hoặc biến thể không icon)
      const match = rawContent.match(/^##\s*(?:🚀\s*)?(?:Chi Tiết Bản Phát Hành|Release Details).*$/im);
      if (match && match.index !== undefined) {
        const extracted = rawContent.substring(match.index).trim();
        if (extracted) {
          return extracted;
        }
      }

      // Nếu không có mục riêng, trả về toàn bộ nội dung file release
      if (rawContent) {
        return rawContent;
      }
    }
  }

  // 2. Fallback: Lấy git commit logs giữa tag trước và HEAD
  try {
    let prevTag = '';
    try {
      prevTag = execSync('git describe --tags --abbrev=0 HEAD^ 2>/dev/null', {
        cwd: rootDir,
        encoding: 'utf8',
      }).trim();
    } catch {
      prevTag = '';
    }

    const range = prevTag ? `${prevTag}..HEAD` : 'HEAD~10..HEAD';
    const rawLog = execSync(`git log ${range} --pretty=format:"- %s"`, {
      cwd: rootDir,
      encoding: 'utf8',
    }).trim();

    if (rawLog) {
      const cleaned = rawLog
        .split('\n')
        .filter((line) => !/-\s*(?:Merge branch|Merge pull request|release:?\s*\d)/i.test(line))
        .join('\n')
        .trim();

      if (cleaned) {
        return `## 🌟 Thay đổi trong ${tag || normalizedTag}\n\n${cleaned}`;
      }
    }
  } catch {
    // Bỏ qua lỗi git
  }

  // 3. Fallback cuối cùng
  return `## 🌟 Manga Crawler ${tag || normalizedTag}\n\n- Bản cập nhật mới cho Manga Crawler (${tag || normalizedTag}).`;
}

function main() {
  const rootDir = path.resolve(__dirname, '..');
  const notes = extractReleaseNotes();
  const outputPath = path.join(rootDir, 'RELEASE_BODY.md');
  fs.writeFileSync(outputPath, notes + '\n', 'utf8');
  console.log(`[extract-release-notes] Đã tạo thành công ${outputPath}:\n`);
  console.log(notes);
}

if (require.main === module) {
  main();
}

module.exports = { extractReleaseNotes };
