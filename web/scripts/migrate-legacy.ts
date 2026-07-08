import { Pool } from 'pg';
import { migrateLegacy } from '../src/lib/migrate-legacy-core';

const legacyUrl = process.env.LEGACY_DATABASE_URL;
const targetUrl = process.env.DATABASE_URL;
// Safe by default: rehearse (rollback) unless --execute is passed. --dry-run
// is accepted as a no-op for backward compat with the old invert-of-this flag.
const execute = process.argv.includes('--execute');
const dryRun = !execute;

if (!legacyUrl || !targetUrl) {
  console.error('Set LEGACY_DATABASE_URL (old Flask DB) and DATABASE_URL (new, empty DB). Pass --execute to commit — otherwise this rehearses only.');
  process.exit(1);
}
if (legacyUrl === targetUrl) {
  console.error('LEGACY_DATABASE_URL and DATABASE_URL must be different databases.');
  process.exit(1);
}

async function main(): Promise<void> {
  console.log(execute
    ? '>>> EXECUTE MODE — changes will be committed'
    : '>>> DRY RUN (default) — nothing will be committed; pass -- --execute to commit');
  // max: 1 is load-bearing — BEGIN/COMMIT span multiple query() calls, which is only safe on a single pinned connection.
  const legacy = new Pool({ connectionString: legacyUrl, max: 1 });
  // max: 1 is load-bearing — BEGIN/COMMIT span multiple query() calls, which is only safe on a single pinned connection.
  const target = new Pool({ connectionString: targetUrl, max: 1 });
  try {
    const report = await migrateLegacy(legacy, target, { dryRun });
    console.log(`${dryRun ? '[DRY RUN — rolled back] ' : ''}Migrated:`, report);
    if (report.warnings.length) console.warn('Warnings:\n- ' + report.warnings.join('\n- '));
  } catch (e) {
    console.error('Migration failed (no changes committed):', e instanceof Error ? e.message : e);
    process.exitCode = 1;
  } finally {
    await legacy.end();
    await target.end();
  }
}

void main();
