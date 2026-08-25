#!/usr/bin/env tsx
/**
 * RadioZec — Zkool Account Setup
 *
 * Interactive script to create or import a Zcash viewing key into Zkool,
 * then outputs the account ID to add to .env.
 *
 * Usage:
 *   npx tsx server/scripts/setup-zkool.ts
 *   # or via npm:
 *   npm run setup:zkool
 */

import { ZkoolClient } from '../src/zkool';
import { config } from '../src/config';
import * as readline from 'readline';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function ask(question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve));
}

async function main() {
  console.log('');
  console.log('╔════════════════════════════════════════════╗');
  console.log('║     📻 RadioZec — Zkool Account Setup     ║');
  console.log('╚════════════════════════════════════════════╝');
  console.log('');

  const zkool = new ZkoolClient(config.gqlUrl);

  // 1. Test connection
  console.log(`Connecting to Zkool at ${config.gqlUrl}...`);
  const ok = await zkool.init(false);
  if (!ok) {
    console.error('');
    console.error('❌ Cannot connect to Zkool GraphQL endpoint.');
    console.error(`   Make sure the Zkool daemon is running at: ${config.gqlUrl}`);
    console.error('   You can set GQL_URL in your .env file.');
    process.exit(1);
  }
  console.log('✓ Connected to Zkool.\n');

  // 2. List existing accounts
  const accounts = await zkool.getAccounts();

  if (accounts.length > 0) {
    console.log('Existing accounts:');
    console.log('─────────────────────────────────────────');
    for (const acc of accounts) {
      const bal = (acc.balance / 1e8).toFixed(8);
      console.log(`  ID: ${acc.id}  |  Name: "${acc.name}"  |  Balance: ${bal} ZEC  |  Height: ${acc.height}`);
    }
    console.log('');

    const useExisting = await ask('Use an existing account? (y/N): ');
    if (useExisting.toLowerCase() === 'y') {
      const idStr = await ask('Enter account ID: ');
      const id = parseInt(idStr, 10);
      const found = accounts.find((a) => a.id === id);
      if (!found) {
        console.error(`❌ Account ID ${id} not found.`);
        process.exit(1);
      }
      printResult(id, found.name);
      rl.close();
      return;
    }
  } else {
    console.log('No accounts found in Zkool.\n');
  }

  // 3. Import a new viewing key
  console.log('── Import a Viewing Key ──');
  console.log('You need a Zcash Unified Full Viewing Key (UFVK) or Sapling extended');
  console.log('full viewing key to watch for incoming donations.\n');

  const key = await ask('Viewing key (UFVK or zxviews...): ');
  if (!key.trim()) {
    console.error('❌ No key provided.');
    process.exit(1);
  }

  const name = (await ask('Account name (e.g. "RadioZec Donations"): ')).trim() || 'RadioZec';
  const birthStr = await ask('Birth height (0 to scan from genesis, or a recent height): ');
  const birth = parseInt(birthStr, 10) || 0;
  const aindexStr = await ask('Account index (usually 0): ');
  const aindex = parseInt(aindexStr, 10) || 0;

  console.log(`\nImporting key as "${name}" (birth: ${birth}, aindex: ${aindex})...`);

  const result = await zkool.createNewAccount(key, aindex, birth, name);

  if (result.createAccount === null) {
    console.error('❌ Failed to create account. The key may be invalid or already imported.');
    process.exit(1);
  }

  const newId = result.createAccount;
  printResult(newId, name);
  rl.close();
}

function printResult(id: number, name: string) {
  console.log('');
  console.log('╔════════════════════════════════════════════╗');
  console.log(`║  ✅ Account ready!  ID: ${String(id).padEnd(19)}║`);
  console.log('╚════════════════════════════════════════════╝');
  console.log('');
  console.log('Add this to your .env file:');
  console.log('');
  console.log(`  ZKOOL_ACCOUNT_ID=${id}`);
  console.log('');
  console.log(`Account "${name}" will be used for donation scanning.`);
  console.log('Then start RadioZec with: ./start.sh');
  console.log('');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
