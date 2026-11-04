'use strict';

const fs = require('fs');
const path = require('path');

const migrations_dir = path.join(__dirname, '../../../../supabase/migrations');

function latestEnsureProfileSql() {
  const file_names = fs
    .readdirSync(migrations_dir)
    .filter((file_name) => file_name.endsWith('.sql'))
    .sort();
  let latest_sql = '';
  for (const file_name of file_names) {
    const sql = fs.readFileSync(path.join(migrations_dir, file_name), 'utf8');
    if (
      sql.includes('FUNCTION public.ensure_current_user_profile')
    ) {
      latest_sql = sql;
    }
  }
  return latest_sql;
}

describe('ensure_current_user_profile SQL', () => {
  test('UPDATE user_entitlements qualifies email to avoid RETURNS TABLE conflict', () => {
    const sql = latestEnsureProfileSql();
    expect(sql).toContain('FUNCTION public.ensure_current_user_profile');
    expect(sql).toMatch(/UPDATE public\.user_entitlements AS e/);
    expect(sql).toMatch(/WHERE e\.email = v_email/);
  });

  test('no migration uses unqualified UPDATE user_entitlements WHERE email', () => {
    const file_names = fs
      .readdirSync(migrations_dir)
      .filter((file_name) => file_name.endsWith('.sql'));
    for (const file_name of file_names) {
      const sql = fs.readFileSync(path.join(migrations_dir, file_name), 'utf8');
      expect(sql).not.toMatch(
        /UPDATE public\.user_entitlements\s+SET[\s\S]*?WHERE\s+email\s*=/,
      );
    }
  });
});
