/**
 * Script tải favicon của tất cả connector về local.
 * Sử dụng Google Favicon API để đảm bảo chất lượng nhất quán.
 * 
 * Tự động đọc danh sách connectors từ electron/lib/connectors/index.js
 * 
 * Chạy: npm run icons:download
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const OUTPUT_DIR = path.join(__dirname, '../public/data/site-icons');

/**
 * Tự động load danh sách connectors từ registry
 * @returns {Array<{id: string, domain: string}>}
 */
function loadConnectorsFromRegistry() {
  const connectorRegistry = require('../electron/lib/platform/connectors/index.js');
  const connectors = connectorRegistry.listConnectors();
  
  return connectors.map(c => {
    // Extract hostname from domain URL
    let hostname = c.domain;
    try {
      const url = new URL(c.domain);
      hostname = url.hostname;
    } catch (e) {
      // If not a valid URL, use as-is
    }
    
    return {
      id: c.id,
      domain: hostname,
      label: c.label
    };
  });
}

const CONNECTORS = loadConnectorsFromRegistry();

/**
 * Tạo URL Google Favicon API
 * @param {string} domain - Domain của website
 * @returns {string} - URL để tải favicon
 */
function getGoogleFaviconUrl(domain) {
  const url = `http://${domain}`;
  return `https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(url)}&size=64`;
}

// Tạo thư mục nếu chưa có
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

function downloadFile(url, outputPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(outputPath);

    https
      .get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        },
      })
      .on('response', (response) => {
        if (response.statusCode === 200) {
          response.pipe(file);
          file.on('finish', () => {
            file.close();
            resolve();
          });
        } else if (response.statusCode === 301 || response.statusCode === 302) {
          // Follow redirect
          file.close();
          fs.unlinkSync(outputPath);
          downloadFile(response.headers.location, outputPath).then(resolve).catch(reject);
        } else {
          file.close();
          fs.unlinkSync(outputPath);
          reject(new Error(`HTTP ${response.statusCode}`));
        }
      })
      .on('error', (err) => {
        file.close();
        if (fs.existsSync(outputPath)) {
          fs.unlinkSync(outputPath);
        }
        reject(err);
      });
  });
}

const IGNORE_CONNECTORS = ['vivicomic']; // Manual icon because Google API returns fallback

async function downloadAllIcons() {
  console.log(`📥 Downloading ${CONNECTORS.length} site icons via Google Favicon API...\n`);
  console.log(`📂 Output: ${OUTPUT_DIR}\n`);

  let success = 0;
  let failed = 0;

  for (const connector of CONNECTORS) {
    if (IGNORE_CONNECTORS.includes(connector.id)) {
      console.log(`⏩ Skipping ${connector.id} (Manual icon)`);
      continue;
    }

    const faviconUrl = getGoogleFaviconUrl(connector.domain);
    const outputPath = path.join(OUTPUT_DIR, `${connector.id}.png`);
    const displayName = `${connector.id} (${connector.label})`.padEnd(35);
    process.stdout.write(`⏳ ${displayName} ... `);

    try {
      await downloadFile(faviconUrl, outputPath);
      const stats = fs.statSync(outputPath);
      console.log(`✅ ${(stats.size / 1024).toFixed(1)} KB`);
      success++;
    } catch (err) {
      console.log(`❌ ${err.message}`);
      failed++;
    }
  }

  console.log(`\n✨ Done! ${success} success, ${failed} failed.`);
  
  if (success > 0) {
    console.log(`\n💡 Icons saved to: ${OUTPUT_DIR}`);
    console.log(`💡 Total connectors: ${CONNECTORS.length}`);
  }
}

downloadAllIcons().catch(console.error);
