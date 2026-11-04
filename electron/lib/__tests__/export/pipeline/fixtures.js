const sharp = require('sharp');

async function skewedPagePng({ width = 800, height = 1000, angle = 3 } = {}) {
  const lines = [];
  for (let y = 80; y < height - 80; y += 30) {
    lines.push(`<rect x="100" y="${y}" width="${width - 200}" height="5" fill="#000"/>`);
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`
    + `<rect width="100%" height="100%" fill="#fff"/>`
    + `<g transform="rotate(${angle} ${width / 2} ${height / 2})">${lines.join('')}</g></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function borderedPagePng({ width = 600, height = 800, border = 40, borderColor = '#000' } = {}) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`
    + `<rect width="100%" height="100%" fill="${borderColor}"/>`
    + `<rect x="${border}" y="${border}" width="${width - 2 * border}" height="${height - 2 * border}" fill="#fff"/>`
    + `<rect x="${width / 2 - 50}" y="${height / 2 - 50}" width="100" height="100" fill="#555"/></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function doublePagePng({ width = 1600, height = 1100 } = {}) {
  const centre = Math.floor(width / 2);
  const halfSearch = Math.max(1, Math.floor(width * 0.05));
  const xMin = Math.max(0, centre - halfSearch);
  const xMax = Math.min(width - 1, centre + halfSearch);
  const gutterHalf = Math.max(1, Math.round((width * 20) / 1600));
  const gutterLeft = centre - gutterHalf;
  const gutterRight = centre + gutterHalf;

  const shapes = [];
  for (let x = 60; x < xMin; x += 40) {
    shapes.push(`<rect x="${x}" y="100" width="20" height="${height - 200}" fill="#444"/>`);
  }
  for (let x = xMax + 1; x < width - 60; x += 40) {
    shapes.push(`<rect x="${x}" y="100" width="20" height="${height - 200}" fill="#444"/>`);
  }
  for (let x = xMin; x <= xMax; x++) {
    if (x >= gutterLeft && x <= gutterRight) continue;
    for (let y = 100; y < height - 200; y += 25) {
      const fill = ((x + Math.floor(y / 25)) % 2) ? '#666' : '#bbb';
      shapes.push(`<rect x="${x}" y="${y}" width="1" height="20" fill="${fill}"/>`);
    }
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`
    + `<rect width="100%" height="100%" fill="#fff"/>${shapes.join('')}</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function decodeRaw(buffer) {
  const { data, info } = await sharp(buffer).toColourspace('srgb').raw().toBuffer({ resolveWithObject: true });
  return { data, info: { width: info.width, height: info.height, channels: info.channels } };
}

module.exports = { skewedPagePng, borderedPagePng, doublePagePng, decodeRaw };
