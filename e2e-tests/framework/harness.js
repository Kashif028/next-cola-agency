/**
 * Standalone Test Harness for Logar Traders E2E Test Suite
 * Zero external cloud or npm dependencies.
 */

const assert = require('node:assert');

class TestHarness {
  constructor() {
    this.suites = [];
    this.currentSuite = null;
    this.stats = {
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      durationMs: 0,
    };
  }

  describe(title, fn) {
    const parentSuite = this.currentSuite;
    const suite = {
      title,
      parent: parentSuite,
      tests: [],
      beforeEachHooks: [],
      afterEachHooks: [],
      beforeAllHooks: [],
      afterAllHooks: [],
    };

    if (parentSuite) {
      parentSuite.tests.push(suite);
    } else {
      this.suites.push(suite);
    }

    this.currentSuite = suite;
    try {
      fn();
    } finally {
      this.currentSuite = parentSuite;
    }
  }

  it(title, fn) {
    if (!this.currentSuite) {
      throw new Error(`Test "${title}" must be inside a describe block`);
    }
    this.currentSuite.tests.push({
      title,
      fn,
      type: 'test',
    });
  }

  beforeEach(fn) {
    if (this.currentSuite) {
      this.currentSuite.beforeEachHooks.push(fn);
    }
  }

  afterEach(fn) {
    if (this.currentSuite) {
      this.currentSuite.afterEachHooks.push(fn);
    }
  }

  beforeAll(fn) {
    if (this.currentSuite) {
      this.currentSuite.beforeAllHooks.push(fn);
    }
  }

  afterAll(fn) {
    if (this.currentSuite) {
      this.currentSuite.afterAllHooks.push(fn);
    }
  }

  async runSuite(suite, ancestorBeforeEach = [], ancestorAfterEach = []) {
    const beforeEachHooks = [...ancestorBeforeEach, ...suite.beforeEachHooks];
    const afterEachHooks = [...suite.afterEachHooks, ...ancestorAfterEach];

    for (const hook of suite.beforeAllHooks) {
      await hook();
    }

    for (const item of suite.tests) {
      if (item.type === 'test') {
        this.stats.total++;
        const testStart = performance.now();
        try {
          for (const hook of beforeEachHooks) {
            await hook();
          }

          await item.fn();

          for (const hook of afterEachHooks) {
            await hook();
          }

          const duration = Math.round(performance.now() - testStart);
          this.stats.passed++;
          console.log(`    \x1b[32m✔\x1b[0m ${item.title} \x1b[90m(${duration}ms)\x1b[0m`);
        } catch (err) {
          const duration = Math.round(performance.now() - testStart);
          this.stats.failed++;
          console.error(`    \x1b[31m✖\x1b[0m ${item.title} \x1b[90m(${duration}ms)\x1b[0m`);
          console.error(`      \x1b[31mError: ${err.message}\x1b[0m`);
          if (err.stack) {
            const stackLines = err.stack.split('\n').slice(1, 4).join('\n');
            console.error(`      \x1b[90m${stackLines}\x1b[0m`);
          }
        }
      } else {
        // Nested suite
        console.log(`\n  \x1b[1m\x1b[36m▶ ${item.title}\x1b[0m`);
        await this.runSuite(item, beforeEachHooks, afterEachHooks);
      }
    }

    for (const hook of suite.afterAllHooks) {
      await hook();
    }
  }

  async runAll() {
    const start = performance.now();
    for (const suite of this.suites) {
      console.log(`\n\x1b[1m\x1b[34m■ ${suite.title}\x1b[0m`);
      await this.runSuite(suite);
    }
    this.stats.durationMs = Math.round(performance.now() - start);
    return this.stats;
  }
}

// Custom assertions with zero-drift financial checks
const customAssert = {
  ...assert,
  paisaEqual(actual, expected, message) {
    const act = Math.round(Number(actual));
    const exp = Math.round(Number(expected));
    assert.strictEqual(
      act,
      exp,
      (message || '') + ` (Expected Paisa/Rupee ${exp}, got ${act})`
    );
  },
  nearEqual(actual, expected, tolerance = 0.01, message) {
    const diff = Math.abs(Number(actual) - Number(expected));
    assert.ok(
      diff <= tolerance,
      (message || '') + ` (Expected ${expected} ±${tolerance}, got ${actual})`
    );
  },
};

const defaultHarness = new TestHarness();

module.exports = {
  TestHarness,
  defaultHarness,
  describe: (title, fn) => defaultHarness.describe(title, fn),
  it: (title, fn) => defaultHarness.it(title, fn),
  test: (title, fn) => defaultHarness.it(title, fn),
  beforeEach: (fn) => defaultHarness.beforeEach(fn),
  afterEach: (fn) => defaultHarness.afterEach(fn),
  beforeAll: (fn) => defaultHarness.beforeAll(fn),
  afterAll: (fn) => defaultHarness.afterAll(fn),
  assert: customAssert,
};
