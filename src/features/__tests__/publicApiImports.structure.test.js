const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '../..');

function walk(dir, acc = []) {
  for (const name of fs.readdirSync(dir)) {
    if (name === 'node_modules') continue;
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) walk(p, acc);
    else if (/\.(js|jsx|mjs)$/.test(name)) acc.push(p);
  }
  return acc;
}

test('no file outside a feature imports that feature internals', () => {
  const featureRoot = path.join(SRC, 'features');
  const features = fs.readdirSync(featureRoot).filter((n) => n !== '__tests__');
  const files = walk(SRC);
  const violations = [];
  for (const file of files) {
    const rel = path.relative(SRC, file);
    const src = fs.readFileSync(file, 'utf8');
    for (const feat of features) {
      const featDir = path.join('features', feat);
      const inThisFeature = rel.startsWith(featDir + path.sep) || rel.startsWith('features/' + feat + '/');
      if (inThisFeature) continue;
      const re = new RegExp(`from ['"].*/features/${feat}/(?!index)[^'"]+['"]`);
      if (re.test(src)) violations.push(`${rel} -> ${feat} internal`);
    }
  }
  expect(violations).toEqual([]);
});
