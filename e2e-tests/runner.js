#!/usr/bin/env node
/**
 * Master E2E Test Suite Runner for Logar Traders POS & Distribution Management System
 * Requires zero external cloud or npm dependencies.
 *
 * Usage:
 *   node e2e-tests/runner.js
 *   node e2e-tests/runner.js --tier=acceptance
 *   node e2e-tests/runner.js --tier=1
 *   node e2e-tests/runner.js --tier=2
 *   node e2e-tests/runner.js --tier=3
 *   node e2e-tests/runner.js --tier=4
 */

const fs = require('node:fs');
const path = require('node:path');
const { defaultHarness } = require('./framework/harness.js');

async function main() {
  console.log('\x1b[1m\x1b[36m================================================================================\x1b[0m');
  console.log('\x1b[1m\x1b[32m  NEXTCO LOGISTICS AGENCY / LOGAR TRADERS POS & DISTRIBUTION SYSTEM\x1b[0m');
  console.log('\x1b[1m\x1b[33m  Comprehensive Opaque-Box E2E Test Suite Runner (Tiers 1 - 4 + Acceptance)\x1b[0m');
  console.log('\x1b[1m\x1b[36m================================================================================\x1b[0m');
  console.log(`\x1b[90mNode.js Version: ${process.version} | Platform: ${process.platform} | Engine: SQLite Native (WAL)\x1b[0m\n`);

  const args = process.argv.slice(2);
  const tierArg = args.find(a => a.startsWith('--tier='));
  const targetTier = tierArg ? tierArg.split('=')[1].toLowerCase() : 'all';

  // 1. Acceptance Criteria Suite
  if (targetTier === 'all' || targetTier === 'acceptance' || targetTier === 'ac') {
    require('./acceptance/acceptance_criteria.test.js');
  }

  // 2. Tier 1: Feature Coverage (23 features x 5 = 115 tests)
  if (targetTier === 'all' || targetTier === '1' || targetTier === 'tier1') {
    const tier1Dir = path.resolve(__dirname, 'tier1_features');
    const t1Files = fs.readdirSync(tier1Dir).filter(f => f.endsWith('.test.js')).sort();
    for (const f of t1Files) {
      require(path.join(tier1Dir, f));
    }
  }

  // 3. Tier 2: Boundary & Corner Cases (23 features x 5 = 115 tests)
  if (targetTier === 'all' || targetTier === '2' || targetTier === 'tier2') {
    const tier2Dir = path.resolve(__dirname, 'tier2_boundaries');
    const t2Files = fs.readdirSync(tier2Dir).filter(f => f.endsWith('.test.js')).sort();
    for (const f of t2Files) {
      require(path.join(tier2Dir, f));
    }
  }

  // 4. Tier 3: Cross-Feature Combinations (23 pairwise tests)
  if (targetTier === 'all' || targetTier === '3' || targetTier === 'tier3') {
    require('./tier3_cross_features/cross_features.test.js');
  }

  // 5. Tier 4: Real-World Application Scenarios (12 multi-step workflows)
  if (targetTier === 'all' || targetTier === '4' || targetTier === 'tier4') {
    require('./tier4_real_world/real_world_scenarios.test.js');
  }

  // 6. Tier 5: Adversarial Hardening (Challenger M7 Suites)
  if (targetTier === 'all' || targetTier === '5' || targetTier === 'tier5') {
    const tier5Dir = path.resolve(__dirname, 'tier5_adversarial');
    if (fs.existsSync(tier5Dir)) {
      const t5Files = fs.readdirSync(tier5Dir).filter(f => f.endsWith('.test.js')).sort();
      for (const f of t5Files) {
        require(path.join(tier5Dir, f));
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
