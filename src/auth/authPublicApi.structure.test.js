const fs = require('fs');
const path = require('path');

test('src/auth/index.js exports AuthProvider and useAuth', () => {
  const src = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8');
  expect(src).toMatch(/AuthProvider/);
  expect(src).toMatch(/useAuth/);
  expect(src).toMatch(/AuthRequiredView/);
  expect(src).toMatch(/GuestCreditBadge/);
  expect(src).toMatch(/FreeUserTokenExhaustedModal/);
});
