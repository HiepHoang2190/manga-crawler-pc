import fs from 'node:fs';
import path from 'node:path';

function walkSourceFiles(dir, files = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === 'node_modules' || ent.name === 'dist' || ent.name === '__tests__') continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walkSourceFiles(full, files);
    else if (/\.(js|jsx|ts|tsx|mjs)$/.test(ent.name) && !/\.test\.[jt]sx?$|\.test\.mjs$/.test(ent.name)) {
      files.push(full);
    }
  }
  return files;
}

describe('userDataBackup BACKUP_SECTIONS parity with src/ localStorage keys', () => {
  test('every literal localStorage key in src/ is whitelisted in userDataBackup.js', () => {
    const srcDir = path.resolve(process.cwd(), 'src');
    const backupPath = path.join(srcDir, 'utils/userDataBackup.js');
    const backupSrc = fs.readFileSync(backupPath, 'utf8');
    const whitelisted = new Set(
      [...backupSrc.matchAll(/['"]([a-zA-Z0-9_.:-]+)['"]/g)].map((m) => m[1]),
    );

    const missing = [];
    for (const file of walkSourceFiles(srcDir)) {
      if (file === backupPath) continue;
      const content = fs.readFileSync(file, 'utf8');
      for (const m of content.matchAll(
        /localStorage\.(?:getItem|setItem|removeItem)\(\s*['"]([^'"]+)['"]/g,
      )) {
        const key = m[1];
        if (!whitelisted.has(key)) {
          missing.push(`${key} (${path.relative(process.cwd(), file)})`);
        }
      }
    }

    expect(missing).toEqual([]);
  });
});
