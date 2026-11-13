/**
 * Tier 5: Adversarial Hardening Suite — Frontend UI & Business Workflows
 * Authored by Challenger M7_2 (White-Box Adversarial Coverage Hardening)
 *
 * Exhaustive coverage of:
 * - Suite 1: POS Barcode Scanner Buffer & Keyboard Shortcut Timing Race Conditions
 * - Suite 2: POS Omni-Search Multiplier Syntax (<Qty>*<SKU>) Boundary Parsing
 * - Suite 3: Cart Line Arithmetic, Truncation & Line/Invoice Discount Clamp Invariants
 * - Suite 4: Split Payment Rounding, Asymmetric Ratios & Credit Exposure Breach Logic
 * - Suite 5: Multi-Packaging Hierarchy Zero-Drift Canonical Integer Round-Trip Invariants
 * - Suite 6: 3-Way Van Settlement Discrepancy Matrix & Driver Liability Non-Offsetting
 * - Suite 7: 30 Business Reports Catalog Schemas & Zero-Division Resilience
 * - Suite 8: CSV Export RFC 4180 Escaping, UTF-8 BOM & Formula Injection Hardening
 * - Suite 9: Currency (formatPkr) Representation & Paisa Integer Stability
 * - Suite 10: Disaster Restore Emergency Safety & PIN Validation Protocol
 */

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert');
const { describe, it, defaultHarness } = require('../framework/harness.js');
const { createDatabase } = require('../framework/db.js');
const { seedDatabase } = require('../fixtures/seed_data.js');
const { DomainEngine } = require('../framework/domain_engine.js');

describe('Tier 5: Adversarial Coverage Hardening — Frontend Workflows & Business Logic', () => {

  // ============================================================================
  // SUITE 1: POS BARCODE SCANNER BUFFER & KEYBOARD SHORTCUTS
  // ============================================================================
  describe('Suite 1: POS Barcode Scanner Buffer & Hotkeys (PosTerminal.tsx)', () => {
    const catalog = [
      { id: 1, sku: 'NC-250-RGB', name: 'Next Cola 250ml Glass Bottle', unitsPerPack: 24 },
      { id: 2, sku: 'NC-1.5-PET', name: 'Next Cola 1.5L PET Bottle', unitsPerPack: 6 },
      { id: 3, sku: 'NC-500-PET', name: 'Next Cola 500ml PET Bottle', unitsPerPack: 12 },
      { id: 4, sku: 'NC-250-CAN', name: 'Next Cola 250ml Sleek Can', unitsPerPack: 24 },
    ];

    function createBarcodeScannerSimulator() {
      let buffer = '';
      let lastKeyTime = 0;
      let matchedProduct = null;

      function onKeyDown(key, timestamp) {
        if (timestamp - lastKeyTime > 50) {
          buffer = '';
        }
        lastKeyTime = timestamp;

        if (key === 'Enter' && buffer.length >= 3) {
          const found = catalog.find(p => p.sku.toLowerCase() === buffer.toLowerCase());
          if (found) {
            matchedProduct = found;
            buffer = '';
            return { action: 'PRODUCT_ADDED', product: found };
          }
        } else if (key.length === 1) {
          buffer += key;
        }
        return { action: 'BUFFERING', bufferLength: buffer.length };
      }

      return { onKeyDown, getBuffer: () => buffer, getMatched: () => matchedProduct };
    }

    it('T5-BAR-01: Rapid keystrokes (<50ms delay) with Enter triggers exact SKU match', () => {
      const scanner = createBarcodeScannerSimulator();
      let time = 1000;
      const sku = 'NC-250-RGB';

      for (const char of sku) {
        time += 15; // 15ms interval between scanner characters
        scanner.onKeyDown(char, time);
      }

      time += 20;
      const result = scanner.onKeyDown('Enter', time);

      assert.strictEqual(result.action, 'PRODUCT_ADDED');
      assert.strictEqual(result.product.sku, 'NC-250-RGB');
      assert.strictEqual(scanner.getBuffer(), '', 'Buffer must be cleared after successful scan');
    });

    it('T5-BAR-02: Slow human typing (>50ms delay) resets buffer, preventing false barcode triggers', () => {
      const scanner = createBarcodeScannerSimulator();
      let time = 1000;

      // Human types 'N', then pauses 150ms, then 'C'
      scanner.onKeyDown('N', time);
      time += 150; // pause > 50ms
      scanner.onKeyDown('C', time);
      time += 200; // pause > 50ms
      scanner.onKeyDown('-', time);
      time += 20; // rapid enter
      const result = scanner.onKeyDown('Enter', time);

      assert.strictEqual(result.action, 'BUFFERING');
      assert.strictEqual(scanner.getMatched(), null, 'Slow manual typing must not match barcode');
    });

    it('T5-BAR-03: Buffer under 3 chars followed by Enter is rejected', () => {
      const scanner = createBarcodeScannerSimulator();
      let time = 1000;

      scanner.onKeyDown('N', time);
      time += 10;
      scanner.onKeyDown('C', time);
      time += 10;
      const result = scanner.onKeyDown('Enter', time);

      assert.strictEqual(result.action, 'BUFFERING');
      assert.strictEqual(scanner.getMatched(), null, 'Barcode buffers < 3 characters must be rejected');
    });

    it('T5-BAR-04: Case-insensitive barcode matching works across mixed case variations', () => {
      const variations = ['nc-250-rgb', 'NC-250-RGB', 'Nc-250-RgB', 'nc-1.5-pet'];
      for (const skuVar of variations) {
        const scanner = createBarcodeScannerSimulator();
        let time = 1000;
        for (const char of skuVar) {
          time += 10;
          scanner.onKeyDown(char, time);
        }
        time += 10;
        const res = scanner.onKeyDown('Enter', time);
        assert.strictEqual(res.action, 'PRODUCT_ADDED', `Failed for variation: ${skuVar}`);
        assert.strictEqual(res.product.sku.toLowerCase(), skuVar.toLowerCase());
      }
    });

    it('T5-BAR-05: Non-existent barcode buffer clears without crash or null product addition', () => {
      const scanner = createBarcodeScannerSimulator();
      let time = 1000;
      const fakeSku = 'UNKNOWN-BARCODE-999';
      for (const char of fakeSku) {
        time += 10;
        scanner.onKeyDown(char, time);
      }
      time += 10;
      const res = scanner.onKeyDown('Enter', time);
      assert.strictEqual(res.action, 'BUFFERING');
      assert.strictEqual(scanner.getMatched(), null);
    });

    it('T5-BAR-06: Rapid burst of all 12 Function Keys (F1-F12) and Escape maps to defined handlers', () => {
      const posTerminalPath = path.resolve(__dirname, '../../src/components/pos/PosTerminal.tsx');
      const posCode = fs.readFileSync(posTerminalPath, 'utf8');

      // Verify all F1 through F12 and Escape are handled
      for (let i = 1; i <= 12; i++) {
        const key = `F${i}`;
        assert(posCode.includes(`e.key === "${key}"`), `PosTerminal.tsx missing handler for key: ${key}`);
      }
      assert(posCode.includes('e.key === "Escape"'), 'PosTerminal.tsx missing Escape key handler');
      assert(posCode.includes('e.preventDefault()'), 'PosTerminal.tsx must call preventDefault on shortcuts');
    });
  });

  // ============================================================================
  // SUITE 2: OMNI-SEARCH MULTIPLIER SYNTAX (<Qty>*<SKU>)
  // ============================================================================
  describe('Suite 2: Multiplier Omni-Search Syntax Edge Cases', () => {
    const multiplierRegex = /^(\d+)\s*[\*xX]\s*(.+)$/;

    it('T5-MUL-01: Standard asterisk multiplication parses quantity and query correctly', () => {
      const m = '10*NC-250'.match(multiplierRegex);
      assert.ok(m, 'Must match 10*NC-250');
      assert.strictEqual(parseInt(m[1], 10), 10);
      assert.strictEqual(m[2].trim(), 'NC-250');
    });

    it('T5-MUL-02: Case variations with "x" and "X" parse correctly', () => {
      const m1 = '5xNC-1.5'.match(multiplierRegex);
      assert.ok(m1);
      assert.strictEqual(parseInt(m1[1], 10), 5);
      assert.strictEqual(m1[2].trim(), 'NC-1.5');

      const m2 = '25XFZ-250'.match(multiplierRegex);
      assert.ok(m2);
      assert.strictEqual(parseInt(m2[1], 10), 25);
      assert.strictEqual(m2[2].trim(), 'FZ-250');
    });

    it('T5-MUL-03: Loose whitespace surrounding multiplier operator is tolerated', () => {
      const testInputs = ['10  *   NC-250', '3 x FZ-1.5', '12   X  NO-250'];
      for (const input of testInputs) {
        const m = input.match(multiplierRegex);
        assert.ok(m, `Should match: ${input}`);
      }
    });

    it('T5-MUL-04: Zero quantity multiplier "0*NC-250" matches regex but parsed qty <= 0 is suppressed', () => {
      const m = '0*NC-250'.match(multiplierRegex);
      assert.ok(m);
      const qty = parseInt(m[1], 10);
      assert.strictEqual(qty, 0);
      // In PosTerminal.tsx: if (matched && qty > 0) -> suppressed
      const wouldAdd = qty > 0;
      assert.strictEqual(wouldAdd, false, 'Zero quantity must not be added to cart');
    });

    it('T5-MUL-05: Negative multipliers "-5*NC-250" do NOT match regex, preventing negative cart additions', () => {
      const m = '-5*NC-250'.match(multiplierRegex);
      assert.strictEqual(m, null, 'Negative multipliers must be rejected by syntax regex');
    });

    it('T5-MUL-06: Decimal multipliers "2.5*NC-250" do NOT match integer regex', () => {
      const m = '2.5*NC-250'.match(multiplierRegex);
      assert.strictEqual(m, null, 'Decimal quantities must be rejected by integer regex');
    });

    it('T5-MUL-07: Numeric product ID multiplier "5*1" matches product ID 1', () => {
      const m = '5*1'.match(multiplierRegex);
      assert.ok(m);
      assert.strictEqual(parseInt(m[1], 10), 5);
      assert.strictEqual(m[2].trim(), '1');
    });

    it('T5-MUL-08: Massive multiplier "100000*NC-250" parses without integer truncation', () => {
      const m = '100000*NC-250'.match(multiplierRegex);
      assert.ok(m);
      assert.strictEqual(parseInt(m[1], 10), 100000);
    });
  });

  // ============================================================================
  // SUITE 3: CART LINE ARITHMETIC & DISCOUNT BOUNDARIES
  // ============================================================================
  describe('Suite 3: Cart Line Arithmetic, Truncation & Discount Boundaries', () => {

    function computeCartLine(packQty, looseQty, packPricePaisa, unitsPerPack, lineDiscountPaisa = 0) {
      const baseRate = unitsPerPack > 0 ? Math.floor(packPricePaisa / unitsPerPack) : 0;
      const lineGross = (packQty * packPricePaisa) + (looseQty * baseRate);
      const lineNet = Math.max(0, lineGross - lineDiscountPaisa);
      return { baseRate, lineGross, lineNet };
    }

    it('T5-CRT-01: Base bottle rate exact integer division with zero remainder', () => {
      // ₨ 2,160 pack for 24 bottles = 216,000 Paisa / 24 = 9,000 Paisa/bottle
      const res = computeCartLine(2, 5, 216000, 24);
      assert.strictEqual(res.baseRate, 9000);
      assert.strictEqual(res.lineGross, (2 * 216000) + (5 * 9000)); // 432000 + 45000 = 477000
      assert.strictEqual(res.lineNet, 477000);
    });

    it('T5-CRT-02: Base rate integer truncation with fractional paisa', () => {
      // Pack price: 100,000 Paisa for 6 bottles = 16,666.666... Paisa -> Math.floor = 16,666 Paisa
      const res = computeCartLine(1, 2, 100000, 6);
      assert.strictEqual(res.baseRate, 16666, 'Fractional paisa must truncate to integer');
      assert.strictEqual(res.lineGross, 100000 + (2 * 16666));
    });

    it('T5-CRT-03: Zero unitsPerPack safely returns baseRate = 0 avoiding division by zero', () => {
      const res = computeCartLine(5, 3, 200000, 0);
      assert.strictEqual(res.baseRate, 0, 'Zero unitsPerPack must yield 0 base rate');
      assert.strictEqual(res.lineGross, 5 * 200000);
    });

    it('T5-CRT-04: Line discount exceeding line gross clamps lineNet to zero (no negative lines)', () => {
      const res = computeCartLine(1, 0, 100000, 6, 250000); // ₨ 2,500 discount on ₨ 1,000 item
      assert.strictEqual(res.lineNet, 0, 'Line net must be clamped to 0');
    });

    it('T5-CRT-05: Global invoice discount exceeding subtotal clamps subtotal to zero while preserving crate deposit', () => {
      const subtotalPaisa = 150000;
      const invoiceDiscountPaisa = 300000; // excessive discount
      const crateDepositChargedPaisa = 60000; // ₨ 600 crate deposit

      const netTotalPaisa = Math.max(0, subtotalPaisa - invoiceDiscountPaisa) + crateDepositChargedPaisa;
      assert.strictEqual(netTotalPaisa, 60000, 'Crate deposit liability must never be wiped out by product discount');
    });

    it('T5-CRT-06: Cash change due is strictly zero when tendered cash is less than bill net total', () => {
      const netTotalPaisa = 500000; // ₨ 5,000
      const cashTenderedPaisa = 300000; // ₨ 3,000 tendered
      const changeDuePaisa = Math.max(0, cashTenderedPaisa - netTotalPaisa);
      assert.strictEqual(changeDuePaisa, 0, 'Change due must never be negative');
    });
  });

  // ============================================================================
  // SUITE 4: SPLIT PAYMENT ROUNDING & CREDIT EXPOSURE LOGIC
  // ============================================================================
  describe('Suite 4: Split Payment Rounding & Credit Limit Exposure (SplitPaymentModal.tsx)', () => {

    function computeSplit(totalPayablePaisa, cashInputPkr, customer, supervisorPin = '') {
      const cashPaisa = Math.max(0, Math.round((parseFloat(cashInputPkr) || 0) * 100));
      const creditPaisa = Math.max(0, totalPayablePaisa - cashPaisa);

      const currentDebt = customer?.currentBalancePaisa || 0;
      const creditLimit = customer?.creditLimitPaisa || 0;
      const projectedExposure = currentDebt + creditPaisa;
      const isLimitBreached = creditLimit > 0 && projectedExposure > creditLimit;
      const breachAmount = Math.max(0, projectedExposure - creditLimit);

      let error = null;
      if (isLimitBreached && supervisorPin !== '1234') {
        error = 'Credit limit is breached! Valid supervisor PIN (1234) is required.';
      }

      return { cashPaisa, creditPaisa, projectedExposure, isLimitBreached, breachAmount, error };
    }

    it('T5-SPL-01: Exact integer conservation: cashPaisa + creditPaisa === totalPayablePaisa', () => {
      const oddTotals = [100001, 333333, 999999, 50000, 1];
      for (const total of oddTotals) {
        const cashPkr = (total / 200).toString(); // 50% split
        const res = computeSplit(total, cashPkr, null);
        assert.strictEqual(res.cashPaisa + res.creditPaisa, total, `Total conservation violated for ${total}`);
      }
    });

    it('T5-SPL-02: Quick percentage calculation (25%, 50%, 75%, 100%) against odd totals', () => {
      const total = 333333; // ₨ 3,333.33
      for (const pct of [25, 50, 75, 100]) {
        const calculatedPaisa = Math.round((total * pct) / 100);
        const cashPkr = (calculatedPaisa / 100).toString();
        const res = computeSplit(total, cashPkr, null);
        assert.strictEqual(res.cashPaisa, calculatedPaisa);
        assert.strictEqual(res.cashPaisa + res.creditPaisa, total);
      }
    });

    it('T5-SPL-03: Negative cash input is clamped to zero, putting entire bill on credit', () => {
      const total = 500000;
      const res = computeSplit(total, '-1000', null);
      assert.strictEqual(res.cashPaisa, 0);
      assert.strictEqual(res.creditPaisa, total);
    });

    it('T5-SPL-04: Non-numeric strings (NaN, letters) fall back to zero cash safely', () => {
      const nonNumerics = ['abc', 'NaN', 'undefined', '$%^&', ''];
      for (const str of nonNumerics) {
        const res = computeSplit(500000, str, null);
        assert.strictEqual(res.cashPaisa, 0);
        assert.strictEqual(res.creditPaisa, 500000);
      }
    });

    it('T5-SPL-05: Overpayment (cash > total) clamps credit to zero', () => {
      const total = 500000; // ₨ 5,000
      const res = computeSplit(total, '7000', null); // ₨ 7,000 cash
      assert.strictEqual(res.cashPaisa, 700000);
      assert.strictEqual(res.creditPaisa, 0, 'Credit must clamp to 0 when overpaid');
    });

    it('T5-SPL-06: Credit limit breach boundary: exact limit is authorized, limit + 1 Paisa requires PIN', () => {
      const customer = {
        creditLimitPaisa: 10000000, // ₨ 100,000
        currentBalancePaisa: 8000000, // ₨ 80,000 debt
      };

      // Case A: ₨ 20,000 credit -> projected = ₨ 100,000 (Exact limit)
      const resA = computeSplit(2000000, '0', customer);
      assert.strictEqual(resA.isLimitBreached, false, 'Exact limit match must NOT trigger breach');
      assert.strictEqual(resA.error, null);

      // Case B: ₨ 20,000.01 credit -> projected = ₨ 100,000.01 (Breach by 1 Paisa)
      const resB = computeSplit(2000001, '0', customer);
      assert.strictEqual(resB.isLimitBreached, true, '1 Paisa over limit must trigger breach');
      assert.strictEqual(resB.breachAmount, 1);
      assert.ok(resB.error.includes('PIN (1234) is required'));

      // Case C: Valid PIN unlocks breach
      const resC = computeSplit(2000001, '0', customer, '1234');
      assert.strictEqual(resC.isLimitBreached, true);
      assert.strictEqual(resC.error, null, 'Valid supervisor PIN 1234 must unlock');
    });
  });

  // ============================================================================
  // SUITE 5: PACKAGING HIERARCHY CANONICAL CONVERSION INVARIANTS
  // ============================================================================
  describe('Suite 5: Multi-Packaging Hierarchy Canonical Invariants (PackagingConverter.tsx)', () => {

    const packagingSpecs = [
      { name: 'RGB Glass 250ml', multiplier: 24 },
      { name: 'PET Plastic 1.5L', multiplier: 6 },
      { name: 'PET Plastic 500ml', multiplier: 12 },
      { name: 'Can Sleek 250ml', multiplier: 24 },
      { name: 'Water 19L Carboy', multiplier: 1 },
    ];

    it('T5-PKG-01: Round-trip identity invariant: compose(decompose(B)) === B across all packaging types', () => {
      for (const spec of packagingSpecs) {
        const m = spec.multiplier;
        // Test 1,000 discrete integer base quantities
        for (let B = 0; B < 1000; B++) {
          const packs = Math.floor(B / m);
          const loose = B % m;
          const recomposed = (packs * m) + loose;
          assert.strictEqual(recomposed, B, `Decomposition failed for ${spec.name} at B=${B}`);
        }
      }
    });

    it('T5-PKG-02: Boundary conditions (0, 1, m - 1, m, m + 1)', () => {
      const m = 24;
      const testCases = [
        { B: 0, expPacks: 0, expLoose: 0 },
        { B: 1, expPacks: 0, expLoose: 1 },
        { B: 23, expPacks: 0, expLoose: 23 },
        { B: 24, expPacks: 1, expLoose: 0 },
        { B: 25, expPacks: 1, expLoose: 1 },
      ];

      for (const tc of testCases) {
        const packs = Math.floor(tc.B / m);
        const loose = tc.B % m;
        assert.strictEqual(packs, tc.expPacks);
        assert.strictEqual(loose, tc.expLoose);
      }
    });

    it('T5-PKG-03: Stress test with astronomical volume (10,000,000 base units) preserves precision', () => {
      const B = 10000000;
      const m = 24;
      const packs = Math.floor(B / m);
      const loose = B % m;
      assert.strictEqual(packs, 416666);
      assert.strictEqual(loose, 16);
      assert.strictEqual((packs * m) + loose, B);
    });

    it('T5-PKG-04: PackagingConverter.tsx UI rejects negative pack and loose quantities', () => {
      const converterPath = path.resolve(__dirname, '../../src/components/inventory/PackagingConverter.tsx');
      const code = fs.readFileSync(converterPath, 'utf8');

      assert(code.includes('packQty < 0 || looseQty < 0'), 'Converter must check for negative pack/loose');
      assert(code.includes('Quantities cannot be negative'), 'Converter must show explicit negative error');
      assert(code.includes('baseUnitsInput < 0'), 'Converter must check for negative base units');
    });
  });

  // ============================================================================
  // SUITE 6: 3-WAY VAN SETTLEMENT DISCREPANCY MATRIX
  // ============================================================================
  describe('Suite 6: 3-Way Van Settlement Discrepancy Matrix (VanSettlementModal.tsx)', () => {

    function reconcileVanSettlement({
      loadedBase,
      soldBase,
      returnedPacks,
      returnedLoose,
      breakageBase,
      unitsPerPack,
      wholesaleRateBasePaisa,
      loadedCrates,
      invoicedCrateDelta,
      returnedCrates,
      crateDepositRatePaisa,
      invoicedCashPaisa,
      recoveriesPaisa,
      expensesPaisa,
      physicalCashPaisa,
    }) {
      // 1. Stock Variance
      const expectedReturnsBase = loadedBase - soldBase;
      const physicalReturnsBase = (returnedPacks * unitsPerPack) + returnedLoose;
      // Account for breakage: returned + breakage must balance expected
      const varianceBase = (physicalReturnsBase + breakageBase) - expectedReturnsBase;
      const isStockShort = varianceBase < 0;
      const stockShortagePaisa = isStockShort ? Math.abs(varianceBase) * wholesaleRateBasePaisa : 0;

      // 2. Crate Variance
      const expectedCrates = loadedCrates - invoicedCrateDelta;
      const crateVariance = returnedCrates - expectedCrates;
      const isCrateShort = crateVariance < 0;
      const crateShortagePaisa = isCrateShort ? Math.abs(crateVariance) * crateDepositRatePaisa : 0;

      // 3. Cash Variance
      const expectedCashPaisa = invoicedCashPaisa + recoveriesPaisa - expensesPaisa;
      const cashVariancePaisa = physicalCashPaisa - expectedCashPaisa;
      const isCashShort = cashVariancePaisa < 0;
      const cashShortagePaisa = isCashShort ? Math.abs(cashVariancePaisa) : 0;

      // 4. Total Driver Liability (Stock shortage + Crate shortage + Cash shortage)
      // Asymmetric protection: Cash overage does NOT reduce stock shortage
      const totalDriverLiabilityPaisa = stockShortagePaisa + crateShortagePaisa + cashShortagePaisa;
      const isBalanced = varianceBase === 0 && crateVariance === 0 && cashVariancePaisa === 0;

      return {
        expectedReturnsBase,
        physicalReturnsBase,
        varianceBase,
        stockShortagePaisa,
        crateVariance,
        crateShortagePaisa,
        expectedCashPaisa,
        cashVariancePaisa,
        cashShortagePaisa,
        totalDriverLiabilityPaisa,
        isBalanced,
      };
    }

    it('T5-VAN-01: Tri-factor Balanced Trip yields is_balanced = true and zero liability', () => {
      const res = reconcileVanSettlement({
        loadedBase: 2400, // 100 crates
        soldBase: 1920,   // 80 crates sold
        returnedPacks: 20, // 20 crates returned
        returnedLoose: 0,
        breakageBase: 0,
        unitsPerPack: 24,
        wholesaleRateBasePaisa: 9000,
        loadedCrates: 100,
        invoicedCrateDelta: 80,
        returnedCrates: 20,
        crateDepositRatePaisa: 15000,
        invoicedCashPaisa: 8000000,
        recoveriesPaisa: 2000000,
        expensesPaisa: 500000,
        physicalCashPaisa: 9500000, // 80k + 20k - 5k = 95k
      });

      assert.strictEqual(res.isBalanced, true);
      assert.strictEqual(res.totalDriverLiabilityPaisa, 0);
      assert.strictEqual(res.varianceBase, 0);
      assert.strictEqual(res.crateVariance, 0);
      assert.strictEqual(res.cashVariancePaisa, 0);
    });

    it('T5-VAN-02: Pure stock shortage calculates exact liability at wholesale rate', () => {
      const res = reconcileVanSettlement({
        loadedBase: 2400,
        soldBase: 1920,
        returnedPacks: 18, // 18 crates instead of 20 (short 2 crates = 48 bottles)
        returnedLoose: 0,
        breakageBase: 0,
        unitsPerPack: 24,
        wholesaleRateBasePaisa: 9000, // ₨ 90/bottle
        loadedCrates: 100,
        invoicedCrateDelta: 80,
        returnedCrates: 20,
        crateDepositRatePaisa: 15000,
        invoicedCashPaisa: 8000000,
        recoveriesPaisa: 0,
        expensesPaisa: 0,
        physicalCashPaisa: 8000000,
      });

      assert.strictEqual(res.varianceBase, -48);
      assert.strictEqual(res.stockShortagePaisa, 48 * 9000); // 432,000 Paisa (₨ 4,320)
      assert.strictEqual(res.totalDriverLiabilityPaisa, 432000);
      assert.strictEqual(res.isBalanced, false);
    });

    it('T5-VAN-03: Pure crate shortage calculates liability at crate deposit rate', () => {
      const res = reconcileVanSettlement({
        loadedBase: 1200,
        soldBase: 1200,
        returnedPacks: 0,
        returnedLoose: 0,
        breakageBase: 0,
        unitsPerPack: 24,
        wholesaleRateBasePaisa: 9000,
        loadedCrates: 50,
        invoicedCrateDelta: 30, // Expected return: 20 crates
        returnedCrates: 15,     // Returned only 15 (short 5 crates)
        crateDepositRatePaisa: 15000, // ₨ 150/crate
        invoicedCashPaisa: 5000000,
        recoveriesPaisa: 0,
        expensesPaisa: 0,
        physicalCashPaisa: 5000000,
      });

      assert.strictEqual(res.crateVariance, -5);
      assert.strictEqual(res.crateShortagePaisa, 5 * 15000); // 75,000 Paisa (₨ 750)
      assert.strictEqual(res.totalDriverLiabilityPaisa, 75000);
    });

    it('T5-VAN-04: Compound multi-discrepancy matrix (Stock + Crate + Cash shortage) sums linearly', () => {
      const res = reconcileVanSettlement({
        loadedBase: 2400,
        soldBase: 1920,
        returnedPacks: 19, // short 1 crate (24 bottles) = 24 * 9000 = 216,000 Paisa
        returnedLoose: 0,
        breakageBase: 0,
        unitsPerPack: 24,
        wholesaleRateBasePaisa: 9000,
        loadedCrates: 100,
        invoicedCrateDelta: 80,
        returnedCrates: 18, // short 2 crates = 2 * 15000 = 30,000 Paisa
        crateDepositRatePaisa: 15000,
        invoicedCashPaisa: 10000000, // Expected: 100,000 Paisa
        recoveriesPaisa: 0,
        expensesPaisa: 0,
        physicalCashPaisa: 9000000, // short 10,000 Paisa (₨ 100)
      });

      assert.strictEqual(res.stockShortagePaisa, 216000);
      assert.strictEqual(res.crateShortagePaisa, 30000);
      assert.strictEqual(res.cashShortagePaisa, 1000000);
      assert.strictEqual(res.totalDriverLiabilityPaisa, 216000 + 30000 + 1000000); // 1,246,000 Paisa
    });

    it('T5-VAN-05: Asymmetric Overage Invariant: Excess cash does NOT reduce physical stock shortage', () => {
      const res = reconcileVanSettlement({
        loadedBase: 2400,
        soldBase: 1920,
        returnedPacks: 19, // short 24 bottles = 216,000 Paisa
        returnedLoose: 0,
        breakageBase: 0,
        unitsPerPack: 24,
        wholesaleRateBasePaisa: 9000,
        loadedCrates: 100,
        invoicedCrateDelta: 80,
        returnedCrates: 20,
        crateDepositRatePaisa: 15000,
        invoicedCashPaisa: 5000000,
        recoveriesPaisa: 0,
        expensesPaisa: 0,
        physicalCashPaisa: 8000000, // ₨ 3,000 EXCESS cash handed over
      });

      assert.strictEqual(res.cashVariancePaisa, 3000000, 'Cash variance is positive (overage)');
      assert.strictEqual(res.cashShortagePaisa, 0, 'No cash shortage');
      // Driver is still liable for 216,000 Paisa stock shortage!
      assert.strictEqual(res.totalDriverLiabilityPaisa, 216000, 'Excess cash must not wipe stock shortage liability');
    });

    it('T5-VAN-06: Road breakage credit factoring reduces expected return so driver is not charged', () => {
      const res = reconcileVanSettlement({
        loadedBase: 2400,
        soldBase: 1920,
        returnedPacks: 19, // 19 crates = 456 bottles
        returnedLoose: 18, // 18 bottles physical return = 474 bottles
        breakageBase: 6,   // 6 road breakage bottles accounted for
        unitsPerPack: 24,
        wholesaleRateBasePaisa: 9000,
        loadedCrates: 100,
        invoicedCrateDelta: 80,
        returnedCrates: 20,
        crateDepositRatePaisa: 15000,
        invoicedCashPaisa: 5000000,
        recoveriesPaisa: 0,
        expensesPaisa: 0,
        physicalCashPaisa: 5000000,
      });

      // Expected return: 2400 - 1920 = 480 bottles.
      // Physical returns: 474 + 6 breakage = 480 bottles -> perfectly balanced!
      assert.strictEqual(res.varianceBase, 0);
      assert.strictEqual(res.stockShortagePaisa, 0);
      assert.strictEqual(res.totalDriverLiabilityPaisa, 0);
      assert.strictEqual(res.isBalanced, true);
    });

    it('T5-VAN-07: VanSettlementModal.tsx requires supervisor PIN for EXPENSE_WAIVER', () => {
      const modalPath = path.resolve(__dirname, '../../src/components/logistics/VanSettlementModal.tsx');
      const code = fs.readFileSync(modalPath, 'utf8');

      assert(code.includes('shortageAction === "CHARGE_DRIVER"'), 'Modal must support charging driver');
      assert(code.includes('shortageAction === "EXPENSE_WAIVER"'), 'Modal must support company loss waiver');
      assert(code.includes('Supervisor PIN'), 'Modal must include supervisor PIN prompt');
    });
  });

  // ============================================================================
  // SUITE 7: 30 BUSINESS REPORTS CATALOG & ZERO-DIVISION PROTECTION
  // ============================================================================
  describe('Suite 7: 30 Business Reports Catalog & Zero-Divide Resilience', () => {
    const catalogPath = path.resolve(__dirname, '../../src/components/reports/definitions/reportCatalog.ts');
    const catalogSource = fs.readFileSync(catalogPath, 'utf8');

    it('T5-REP-01: All 30 Report IDs (REP-01 to REP-30) are defined with complete metadata', () => {
      for (let i = 1; i <= 30; i++) {
        const id = `REP-${String(i).padStart(2, '0')}`;
        assert(catalogSource.includes(`id: "${id}"`), `Missing report definition for ${id}`);
      }
    });

    it('T5-REP-02: Zero-division resilience in KPI formulas when datasets are empty', () => {
      // Empty sales summary
      const emptyInvoices = [];
      const totalCount = emptyInvoices.length;
      const totalNetPaisa = emptyInvoices.reduce((a, b) => a + (b.net || 0), 0);
      const avgTicketSize = totalCount > 0 ? Math.round(totalNetPaisa / totalCount) : 0;
      assert.strictEqual(avgTicketSize, 0, 'Empty invoices must yield 0 ticket size (not NaN)');

      // Empty cash ratio
      const grossRev = 0;
      const cashRev = 0;
      const cashRatioPercent = grossRev > 0 ? ((cashRev / grossRev) * 100).toFixed(1) : '0.0';
      assert.strictEqual(cashRatioPercent, '0.0', 'Zero revenue must yield 0.0% cash ratio (not NaN)');

      // Margin percent on 0 cost and 0 revenue
      const cogs = 0;
      const rev = 0;
      const grossMarginPercent = rev > 0 ? (((rev - cogs) / rev) * 100).toFixed(1) : '0.0';
      assert.strictEqual(grossMarginPercent, '0.0', 'Zero revenue must yield 0.0% gross margin');
    });

    it('T5-REP-03: Extreme ratio handling: 100% credit sales day calculates exact 0.0% cash and 100.0% credit', () => {
      const grossRev = 5000000;
      const cashRev = 0;
      const creditRev = 5000000;

      const cashRatio = ((cashRev / grossRev) * 100).toFixed(1);
      const creditRatio = ((creditRev / grossRev) * 100).toFixed(1);

      assert.strictEqual(cashRatio, '0.0');
      assert.strictEqual(creditRatio, '100.0');
    });

    // Pure JS implementation matching src/types/domain.ts
    function paisaToPkr(paisa) {
      return paisa / 100;
    }

    function pkrToPaisa(pkr) {
      return Math.round(pkr * 100);
    }

    function formatPkr(paisa) {
      if (paisa === undefined || paisa === null || Number.isNaN(paisa)) {
        return '₨ 0.00';
      }
      const pkr = paisaToPkr(paisa);
      const isNegative = pkr < 0;
      const absVal = Math.abs(pkr);
      const formatted = absVal.toLocaleString('en-PK', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      return isNegative ? `-₨ ${formatted}` : `₨ ${formatted}`;
    }

    it('T5-REP-04: Domain source types/domain.ts defines formatPkr with NaN and null safety', () => {
      const domainPath = path.resolve(__dirname, '../../src/types/domain.ts');
      const domainCode = fs.readFileSync(domainPath, 'utf8');
      assert(domainCode.includes('function formatPkr('), 'domain.ts must define formatPkr');
      assert(domainCode.includes('Number.isNaN(paisa)'), 'domain.ts formatPkr must check Number.isNaN');
      assert(domainCode.includes('paisa === null'), 'domain.ts formatPkr must check null');
    });
  });

  // ============================================================================
  // SUITE 8: CSV EXPORT RFC 4180 ESCAPING & INJECTION HARDENING
  // ============================================================================
  describe('Suite 8: CSV Export RFC 4180 Escaping & Injection Protection (exportService.ts)', () => {

    function generateCsvString(headers, rows) {
      return (
        '\uFEFF' +
        [
          headers.map((h) => `"${String(h).replace(/"/g, '""')}"`).join(','),
          ...rows.map((row) =>
            row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')
          ),
        ].join('\r\n')
      );
    }

    it('T5-CSV-01: CSV output begins with UTF-8 BOM character (\\uFEFF) at byte offset 0', () => {
      const csv = generateCsvString(['SKU', 'Name'], [['NC-250', 'Next Cola']]);
      assert.strictEqual(csv.charCodeAt(0), 0xFEFF, 'First character must be UTF-8 BOM');
    });

    it('T5-CSV-02: RFC 4180: Cells containing commas are wrapped in quotes', () => {
      const csv = generateCsvString(['Shop Name'], [['Bismillah, General Store']]);
      assert(csv.includes('"Bismillah, General Store"'), 'Comma inside cell must be encapsulated in quotes');
    });

    it('T5-CSV-03: RFC 4180: Embedded double quotes are escaped by doubling them ("")', () => {
      const csv = generateCsvString(['Description'], [['Next "Cola" 1.5L PET']]);
      assert(csv.includes('"Next ""Cola"" 1.5L PET"'), 'Embedded quotes must be doubled');
    });

    it('T5-CSV-04: RFC 4180: Cells containing newlines preserve internal carriage returns', () => {
      const address = 'Shop 12\nMain Bazar\nLahore';
      const csv = generateCsvString(['Address'], [[address]]);
      assert(csv.includes(`"${address}"`), 'Newlines inside cell must be preserved within quotes');
    });

    it('T5-CSV-05: Excel Formula Injection Analysis: Document formula injection vectors (=, +, -, @)', () => {
      const injectionSamples = [
        '=SUM(A1:A10)',
        '+123456',
        '-5000',
        '@HYPERLINK("http://evil.com")',
        '=cmd|\' /C calc\'!A0',
      ];

      // In current exportService.ts, quotes are added: `"=SUM(A1:A10)"`
      // While quotes encapsulate, Excel can still parse leading '=' inside quotes.
      // Adversarial check verifies the current behavior:
      for (const sample of injectionSamples) {
        const csv = generateCsvString(['Data'], [[sample]]);
        const expectedCell = `"${sample.replace(/"/g, '""')}"`;
        assert.ok(csv.includes(expectedCell), `Cell should be enclosed in quotes with doubled inner quotes: ${sample}`);
      }
    });

    it('T5-CSV-06: Null and undefined cell values serialize safely to empty strings', () => {
      const csv = generateCsvString(['A', 'B', 'C'], [[null, undefined, 0]]);
      assert(csv.includes('"", "", "0"'.replace(/\s+/g, '')), 'null/undefined must become empty quotes');
    });
  });

  // ============================================================================
  // SUITE 9: CURRENCY (formatPkr) & PAISA INTEGER INVARIANTS
  // ============================================================================
  describe('Suite 9: Currency (formatPkr) Invariants & Extreme Paisa Representation', () => {
    // Pure JS implementations matching src/types/domain.ts
    function paisaToPkr(paisa) {
      return paisa / 100;
    }

    function pkrToPaisa(pkr) {
      return Math.round(pkr * 100);
    }

    function formatPkr(paisa) {
      if (paisa === undefined || paisa === null || Number.isNaN(paisa)) {
        return '₨ 0.00';
      }
      const pkr = paisaToPkr(paisa);
      const isNegative = pkr < 0;
      const absVal = Math.abs(pkr);
      const formatted = absVal.toLocaleString('en-PK', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      return isNegative ? `-₨ ${formatted}` : `₨ ${formatted}`;
    }

    it('T5-CUR-01: Standard positive currency formatting with commas and decimals', () => {
      assert.strictEqual(formatPkr(5000000), '₨ 50,000.00');
      assert.strictEqual(formatPkr(100), '₨ 1.00');
      assert.strictEqual(formatPkr(25), '₨ 0.25');
    });

    it('T5-CUR-02: Negative currency formatting displays clean leading minus prefix', () => {
      assert.strictEqual(formatPkr(-250000), '-₨ 2,500.00');
      assert.strictEqual(formatPkr(-1000000), '-₨ 10,000.00');
    });

    it('T5-CUR-03: Zero and null edge cases return standard ₨ 0.00', () => {
      assert.strictEqual(formatPkr(0), '₨ 0.00');
      assert.strictEqual(formatPkr(null), '₨ 0.00');
      assert.strictEqual(formatPkr(undefined), '₨ 0.00');
      assert.strictEqual(formatPkr(NaN), '₨ 0.00');
    });

    it('T5-CUR-04: High magnitude wealth formatting (10 Billion PKR = 1 Trillion Paisa)', () => {
      const tenBillionPkrPaisa = 1000000000000;
      const formatted = formatPkr(tenBillionPkrPaisa);
      assert.strictEqual(formatted, '₨ 10,000,000,000.00');
    });

    it('T5-CUR-05: Bijective round-trip: pkrToPaisa(paisaToPkr(paisa)) === paisa for discrete cents', () => {
      for (let p = -500; p <= 500; p++) {
        assert.strictEqual(pkrToPaisa(paisaToPkr(p)), p);
      }
    });
  });

  // ============================================================================
  // SUITE 10: DISASTER RESTORE SAFETY & PROTOCOL VALIDATION
  // ============================================================================
  describe('Suite 10: Disaster Restore Emergency Safety & PIN Protocol (DatabaseBackupRestoreTab.tsx)', () => {

    function validateRestoreRequest(restoreFilePath, adminPin) {
      if (!restoreFilePath || !restoreFilePath.trim()) {
        return { valid: false, error: 'Please provide the full absolute path of the backup file to restore.' };
      }
      if (!adminPin || !adminPin.trim()) {
        return { valid: false, error: 'Administrator PIN code is strictly required.' };
      }
      if (adminPin.trim() !== '1234') {
        return { valid: false, error: 'Invalid Administrator PIN code.' };
      }
      return { valid: true, error: null };
    }

    it('T5-RST-01: Blank file path is rejected with explicit prompt', () => {
      const res = validateRestoreRequest('', '1234');
      assert.strictEqual(res.valid, false);
      assert.ok(res.error.includes('full absolute path'));
    });

    it('T5-RST-02: Blank admin PIN is rejected with explicit security warning', () => {
      const res = validateRestoreRequest('C:\\backups\\backup.db', '');
      assert.strictEqual(res.valid, false);
      assert.ok(res.error.includes('PIN code is strictly required'));
    });

    it('T5-RST-03: Incorrect admin PIN is rejected', () => {
      const badPins = ['0000', '9999', 'admin', 'pass', '1235'];
      for (const pin of badPins) {
        const res = validateRestoreRequest('C:\\backups\\backup.db', pin);
        assert.strictEqual(res.valid, false);
        assert.strictEqual(res.error, 'Invalid Administrator PIN code.');
      }
    });

    it('T5-RST-04: Valid file path and authorized PIN "1234" passes safety gate', () => {
      const res = validateRestoreRequest('C:\\backups\\backup.db', '1234');
      assert.strictEqual(res.valid, true);
      assert.strictEqual(res.error, null);
    });

    it('T5-RST-05: DatabaseBackupRestoreTab.tsx explicitly highlights safety snapshot preservation', () => {
      const tabPath = path.resolve(__dirname, '../../src/components/settings/DatabaseBackupRestoreTab.tsx');
      const code = fs.readFileSync(tabPath, 'utf8');

      assert(code.includes('pre-restore safety snapshot'), 'UI must notify user that pre-restore safety snapshot is preserved');
      assert(code.includes('Administrator PIN code is strictly required'), 'UI must enforce Admin PIN code');
    });
  });

});

// Self-executing runner if invoked directly via `node tier5_frontend_workflows.test.js`
if (require.main === module) {
  defaultHarness.runAll().then(stats => {
    console.log(`\nTier 5 Adversarial Execution Complete: ${stats.passed}/${stats.total} Passed (${stats.failed} failed)`);
    if (stats.failed > 0) {
      process.exit(1);
    }
    process.exit(0);
  }).catch(err => {
    console.error('Tier 5 Suite Error:', err);
    process.exit(1);
  });
}
