#!/usr/bin/env node
/**
 * CF-WordPress Setup Script
 * Automatically creates Cloudflare D1 databases and KV namespaces.
 * Durable Objects are declared in wrangler.toml and provisioned on deploy.
 * and updates wrangler.toml
 *
 * Usage: node scripts/setup.mjs [--account-id ACCOUNT_ID] [--api-token API_TOKEN]
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

function run(cmd, opts = {}) {
  console.log(`  ▶ ${cmd}`);
  try {
    return execSync(cmd, { encoding: 'utf8', cwd: ROOT, ...opts }).trim();
  } catch (e) {
    console.error(`  ✗ Command failed: ${cmd}`);
    console.error(e.stderr || e.message);
    return null;
  }
}

function parseJSON(str) {
  try { return JSON.parse(str); } catch { return null; }
}

async function main() {
  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║     CF-WordPress Setup Wizard            ║');
  console.log('╚══════════════════════════════════════════╝\n');

  // Check wrangler is installed
  const wranglerVersion = run('npx wrangler --version');
  if (!wranglerVersion) {
    console.error('✗ wrangler is not installed. Run: npm install -g wrangler');
    process.exit(1);
  }
  console.log(`✓ Wrangler ${wranglerVersion}`);

  const resourcePrefix = process.env.CLOUDPRESS_RESOURCE_PREFIX || 'cloudpress-cms';

  // ── Create D1 database ──────────────────────────────────────────
  console.log('\n[1/4] Creating D1 database...');
  let d1Id = '';
  const existingD1 = run('npx wrangler d1 list --json');
  const d1List = parseJSON(existingD1) || [];
  const existingDb = d1List.find(db => db.name === resourcePrefix);

  if (existingDb) {
    d1Id = existingDb.uuid;
    console.log(`  ✓ Using existing D1 database: ${resourcePrefix} (${d1Id})`);
  } else {
    const result = run(`npx wrangler d1 create ${resourcePrefix} --json`);
    const data = parseJSON(result);
    if (data?.uuid) {
      d1Id = data.uuid;
      console.log(`  ✓ Created D1 database: ${resourcePrefix} (${d1Id})`);
    } else {
      console.error('  ✗ Failed to create D1 database');
      process.exit(1);
    }
  }

  // ── Create KV namespaces ────────────────────────────────────────
  console.log('\n[2/4] Creating KV namespaces...');
  const kvNames = [`${resourcePrefix}-cache`, `${resourcePrefix}-sessions`, `${resourcePrefix}-options`];
  const kvIds = {};

  const existingKV = run('npx wrangler kv namespace list --json');
  const kvList = parseJSON(existingKV) || [];

  for (const name of kvNames) {
    const existing = kvList.find(ns => ns.title === name);
    if (existing) {
      kvIds[name] = existing.id;
      console.log(`  ✓ Using existing KV: ${name} (${existing.id})`);
    } else {
      const result = run(`npx wrangler kv namespace create "${name}" --json`);
      const data = parseJSON(result);
      if (data?.id) {
        kvIds[name] = data.id;
        console.log(`  ✓ Created KV: ${name} (${data.id})`);
      } else {
        // Try without --json flag
        const result2 = run(`npx wrangler kv namespace create "${name}"`);
        const match = (result2 || '').match(/id = "([^"]+)"/);
        if (match) {
          kvIds[name] = match[1];
          console.log(`  ✓ Created KV: ${name} (${match[1]})`);
        } else {
          console.warn(`  ⚠ Could not create KV ${name}, you may need to create it manually`);
          kvIds[name] = 'REPLACE_WITH_KV_ID';
        }
      }
    }
  }

  // ── Update wrangler.toml ────────────────────────────────────────
  console.log('\n[3/4] Updating wrangler.toml...');
  let toml = readFileSync(join(ROOT, 'wrangler.toml'), 'utf8');

  toml = toml.replace(/(database_name\s*=\s*)"[^"]*"/, `$1"${resourcePrefix}"`);
  toml = toml.replace(/(database_id\s*=\s*)"[^"]*"/, `$1"${d1Id}"`);
  for (const [binding, name] of [['CACHE', kvNames[0]], ['SESSIONS', kvNames[1]], ['OPTIONS', kvNames[2]]]) {
    const expression = new RegExp(`(\\[\\[kv_namespaces\\]\\]\\nbinding = "${binding}"\\nid = )"[^"]*"`);
    toml = toml.replace(expression, `$1"${kvIds[name] || 'REPLACE_WITH_KV_ID'}"`);
  }

  writeFileSync(join(ROOT, 'wrangler.toml'), toml);
  console.log('  ✓ wrangler.toml updated');

  // ── Run migrations ──────────────────────────────────────────────
  console.log('\n[4/4] Running D1 migrations...');
  const migrateLocal = run(`npx wrangler d1 migrations apply ${resourcePrefix} --local`);
  if (migrateLocal !== null) {
    console.log('  ✓ Local migrations applied');
  }

  const migrateRemote = run(`npx wrangler d1 migrations apply ${resourcePrefix}`);
  if (migrateRemote !== null) {
    console.log('  ✓ Remote migrations applied');
  }

  // ── Set secrets ─────────────────────────────────────────────────
  console.log('\n⚠  You need to set the following secrets manually:');
  console.log('  npx wrangler secret put JWT_SECRET');
  console.log('  npx wrangler secret put ENCRYPTION_KEY\n');

  // Generate random secrets suggestion
  const jwtSecret = Array.from(crypto.getRandomValues(new Uint8Array(32))).map(b => b.toString(16).padStart(2, '0')).join('');
  const encKey = Array.from(crypto.getRandomValues(new Uint8Array(32))).map(b => b.toString(16).padStart(2, '0')).join('');
  console.log('  Suggested JWT_SECRET:      ' + jwtSecret);
  console.log('  Suggested ENCRYPTION_KEY:  ' + encKey);
  console.log();

  console.log('╔══════════════════════════════════════════╗');
  console.log('║  Setup complete! Next steps:             ║');
  console.log('║  1. Set secrets (see above)              ║');
  console.log('║  2. npm run dev   (local development)    ║');
  console.log('║  3. npm run deploy (production)          ║');
  console.log('║  4. Visit /wp-setup to install           ║');
  console.log('╚══════════════════════════════════════════╝\n');
}

main().catch(err => {
  console.error('Setup failed:', err);
  process.exit(1);
});
