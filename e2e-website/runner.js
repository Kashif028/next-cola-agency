#!/usr/bin/env node
/**
 * Master E2E Test Suite Runner for Android Cold Drink Distribution Agency APK Downloader Website
 * Requires zero external cloud or npm dependencies.
 *
 * Usage:
 *   node e2e-website/runner.js
 *   node e2e-website/runner.js --tier=1
 *   node e2e-website/runner.js --tier=2
 *   node e2e-website/runner.js --tier=3
 *   node e2e-website/runner.js --tier=4
 *   node e2e-website/runner.js --filter="FEAT-CARD"
 */

const fs = require('node:fs');
const path = require('node:path');
const { defaultHarness } = require('./framework/harness.js');

async function main() {
  console.log('\x1b[1m\x1b[36m================================================================================\x1b[0m');
  console.log('\x1b[1m\x1b[32m  ANDROID COLD DRINK DISTRIBUTION AGENCY APK DOWNLOADER WEBSITE\x1b[0m');
  console.log('\x1b[1m\x1b[33m  Comprehensive Standalone E2E Test Suite Runner (Tiers 1 - 4)\x1b[0m');
  console.log('\x1b[1m\x1b[36m================================================================================\x1b[0m');
  console.log(`\x1b[90mNode.js Version: ${process.version} | Platform: ${process.platform} | Mode: Zero-Dependency Offline Pure\x1b[0m\n`);

  const args = process.argv.slice(2);
  const tierArg = args.find(a => a.startsWith('--tier='));
  const targetTier = tierArg ? tierArg.split('=')[1].toLowerCase() : 'all';

  const filterArg = args.find(a => a.startsWith('--filter='));
  if (filterArg) {
    const filterValue = filterArg.split('=')[1];
    defaultHarness.setFilter(filterValue);
    console.log(`\x1b[35mApplying test filter: "${filterValue}"\x1b[0m\n`);
  }

  // 1. Tier 1: Feature Coverage (29 features x 5 = 145 tests)
  if (targetTier === 'all' || targetTier === '1' || targetTier === 'tier1') {
    const tier1Dir = path.resolve(__dirname, 'tier1_features');
    if (fs.existsSync(tier1Dir)) {
      const t1Files = fs.readdirSync(tier1Dir).filter(f => f.endsWith('.test.js')).sort();
      for (const f of t1Files) {
        require(path.join(tier1Dir, f));
      }
    }
  }

  // 2. Tier 2: Boundary & Corner Cases (29 boundary areas x 5 = 145 tests)
  if (targetTier === 'all' || targetTier === '2' || targetTier === 'tier2') {
    const tier2Dir = path.resolve(__dirname, 'tier2_boundaries');
    if (fs.existsSync(tier2Dir)) {
      const t2Files = fs.readdirSync(tier2Dir).filter(f => f.endsWith('.test.js')).sort();
      for (const f of t2Files) {
        require(path.join(tier2Dir, f));
      }
    }
  }

  // 3. Tier 3: Cross-Feature Interactions (29 pairwise tests)
  if (targetTier === 'all' || targetTier === '3' || targetTier === 'tier3') {
    const tier3Dir = path.resolve(__dirname, 'tier3_interactions');
    if (fs.existsSync(tier3Dir)) {
      const t3Files = fs.readdirSync(tier3Dir).filter(f => f.endsWith('.test.js')).sort();
      for (const f of t3Files) {
        require(path.join(tier3Dir, f));
      }
    }
  }

  // 4. Tier 4: Real-World Scenarios (16 workflow tests)
  if (targetTier === 'all' || targetTier === '4' || targetTier === 'tier4') {
    const tier4Dir = path.resolve(__dirname, 'tier4_scenarios');
    if (fs.existsSync(tier4Dir)) {
      const t4Files = fs.readdirSync(tier4Dir).filter(f => f.endsWith('.test.js')).sort();
      for (const f of t4Files) {
        require(path.join(tier4Dir, f));
      }
    }
  }

  const stats = await defaultHarness.runAll();

  console.log('\n\x1b[1m\x1b[36m================================================================================\x1b[0m');
  console.log('\x1b[1m\x1b[37m  FINAL E2E EXECUTION SUMMARY\x1b[0m');
  console.log('\x1b[1m\x1b[36m================================================================================\x1b[0m');
  console.log(`  \x1b[1mTotal Tests Executed:\x1b[0m   ${stats.total}`);
  console.log(`  \x1b[32mPassed:\x1b[0m                 ${stats.passed}`);
  console.log(`  \x1b[31mFailed:\x1b[0m                 ${stats.failed}`);
  console.log(`  \x1b[33mSkipped:\x1b[0m                ${stats.skipped}`);
  console.log(`  \x1b[90mTotal Duration:\x1b[0m         ${stats.durationMs}ms`);

  const passRate = stats.total > 0 ? ((stats.passed / stats.total) * 100).toFixed(1) : 0;
  console.log(`  \x1b[1mSuccess Rate:\x1b[0m           ${passRate === '100.0' ? '\x1b[32m100% PASSED\x1b[0m' : `\x1b[31m${passRate}%\x1b[0m`}`);
  console.log('\x1b[1m\x1b[36m================================================================================\x1b[0m\n');

  if (stats.failed > 0) {
    console.error(`\x1b[31mE2E Test Run Failed with ${stats.failed} assertion failure(s).\x1b[0m`);
    process.exit(1);
  } else {
    console.log(`\x1b[32mAll ${stats.total} E2E Test Cases Verified Successfully with Zero Defects!\x1b[0m`);
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Fatal Runner Error:', err);
  process.exit(1);
});
