// e2e/helpers/fixtures.js
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const sharp = require('sharp');

const FIXTURES_DIR = path.join(__dirname, '../fixtures');
const SAMPLE_MANGA_DIR = path.join(FIXTURES_DIR, 'sample-manga');
const CHAPTER_01_DIR = path.join(SAMPLE_MANGA_DIR, 'Chapter 01');
const CBZ_PATH = path.join(SAMPLE_MANGA_DIR, 'sample-comic.cbz');
const TEMP_OUTPUT_DIR = path.join(__dirname, '../temp-output');

/**
 * Ensure sample manga directory and CBZ file exist.
 * Generates 3 clean, valid JPEG pages if not already present.
 */
async function ensureSampleManga() {
  fs.mkdirSync(CHAPTER_01_DIR, { recursive: true });
  fs.mkdirSync(TEMP_OUTPUT_DIR, { recursive: true });

  const pages = [
    { name: '01.jpg', color: { r: 240, g: 240, b: 240 } },
    { name: '02.jpg', color: { r: 230, g: 230, b: 230 } },
    { name: '03.jpg', color: { r: 220, g: 220, b: 220 } },
  ];

  for (const page of pages) {
    const filePath = path.join(CHAPTER_01_DIR, page.name);
    if (!fs.existsSync(filePath)) {
      await sharp({
        create: {
          width: 800,
          height: 1200,
          channels: 3,
          background: page.color,
        },
      })
        .jpeg({ quality: 80 })
        .toFile(filePath);
    }
  }

  // Generate sample-comic.cbz if not exists
  if (!fs.existsSync(CBZ_PATH)) {
    const zip = new AdmZip();
    for (const page of pages) {
      zip.addLocalFile(path.join(CHAPTER_01_DIR, page.name));
    }
    zip.writeZip(CBZ_PATH);
  }

  return {
    sampleDir: SAMPLE_MANGA_DIR,
    chapterDir: CHAPTER_01_DIR,
    cbzPath: CBZ_PATH,
  };
}

/**
 * Clean up all files in temp-output directory.
 */
function cleanTempOutput() {
  if (fs.existsSync(TEMP_OUTPUT_DIR)) {
    fs.rmSync(TEMP_OUTPUT_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(TEMP_OUTPUT_DIR, { recursive: true });
}

module.exports = {
  ensureSampleManga,
  cleanTempOutput,
  FIXTURES_DIR,
  SAMPLE_MANGA_DIR,
  CHAPTER_01_DIR,
  CBZ_PATH,
  TEMP_OUTPUT_DIR,
};
