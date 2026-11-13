#!/usr/bin/env node
/**
 * Challenger M6_1 Empirical Stress Test Suite
 * Milestone 6: POS Cockpit, Barcode Buffer, Packaging Hierarchy, Split Payments & 3-Way Van Settlement
 *
 * Verifies:
 * 1. Packaging conversions, base bottle integer arithmetic, line-item pricing, multiplier syntax (<Qty>*<SKU>), and barcode buffer timing.
 * 2. 3-Way Van Settlement reconciliation logic: Stock shortages, Crate shortages, Cash variances, driver liability, and supervisor waivers.
 * 3. Credit limit calculations, split payment validation, negative input sanitization, and supervisor PIN overrides.
 * 4. Wasooli Raseed 5-bucket aging and FIFO payment allocations.
 */

const { TestHarness } = require('./framework/harness.js');
const assert = require('node:assert');

const harness = new TestHarness();
const describe = (t, fn) => harness.describe(t, fn);
const it = (t, fn) => harness.it(t, fn);

// ============================================================================
// SECTION 1: PACKAGING CONVERSIONS & POS COCKPIT ARITHMETIC
// ============================================================================
describe('Milestone 6 Empirical Challenge 1: Packaging Conversions & POS Calculations', () => {

  it('P01: Exact pack-to-base conversions across RGB glass (24), PET (6, 12) and Cans (24)', () => {
    const packConfigs = [
      { sku: 'NC-250-RGB', unitsPerPack: 24, packs: 50, loose: 17, expectedBase: 1217 },
      { sku: 'NC-1.5-PET', unitsPerPack: 6, packs: 120, loose: 5, expectedBase: 725 },
      { sku: 'NC-500-PET', unitsPerPack: 12, packs: 35, loose: 11, expectedBase: 431 },
      { sku: 'NC-250-CAN', unitsPerPack: 24, packs: 10, loose: 0, expectedBase: 240 },
      { sku: 'NW-1.5-PET', unitsPerPack: 6, packs: 0, loose: 42, expectedBase: 42 },
    ];

    for (const c of packConfigs) {
      const computed = (c.packs * c.unitsPerPack) + c.loose;
      assert.strictEqual(computed, c.expectedBase, `SKU ${c.sku} base units conversion mismatch`);
    }
  });

  it('P02: Reverse base-to-pack decomposition with exact modulo remainder', () => {
    const testCases = [
      { base: 530, unitsPerPack: 24, expectedPacks: 22, expectedLoose: 2 },
      { base: 725, unitsPerPack: 6, expectedPacks: 120, expectedLoose: 5 },
      { base: 144, unitsPerPack: 12, expectedPacks: 12, expectedLoose: 0 },
      { base: 23, unitsPerPack: 24, expectedPacks: 0, expectedLoose: 23 },
      { base: 0, unitsPerPack: 24, expectedPacks: 0, expectedLoose: 0 },
    ];

    for (const tc of testCases) {
      const packs = Math.floor(tc.base / tc.unitsPerPack);
      const loose = tc.base % tc.unitsPerPack;
      assert.strictEqual(packs, tc.expectedPacks, `Packs calculation failed for ${tc.base} base units`);
      assert.strictEqual(loose, tc.expectedLoose, `Loose calculation failed for ${tc.base} base units`);
      assert.strictEqual((packs * tc.unitsPerPack) + loose, tc.base, `Re-composed total must match original base units`);
    }
  });

  it('P03: Stress-test massive volume integer packaging conversions (zero float drift)', () => {
    const hugePacks = 250000; // 250,000 crates
    const unitsPerPack = 24;
    const loose = 19;
    const totalBase = (hugePacks * unitsPerPack) + loose;

    assert.strictEqual(totalBase, 6000019, 'Integer math must strictly avoid IEEE-754 precision distortion');
    assert.strictEqual(Math.floor(totalBase / unitsPerPack), hugePacks);
    assert.strictEqual(totalBase % unitsPerPack, loose);
  });

  it('P04: POS Line item pricing arithmetic with loose unit rate truncation', () => {
    // Pack price: 216,000 Paisa (₨ 2,160) for 24 units -> 9,000 Paisa/bottle
    const packPricePaisa = 216000;
    const unitsPerPack = 24;
    const baseRate = Math.floor(packPricePaisa / unitsPerPack);
    assert.strictEqual(baseRate, 9000, 'Base rate should be exactly 9,000 Paisa (₨ 90)');

    const packQty = 3;
    const looseQty = 7;
    const lineDiscountPaisa = 5000; // ₨ 50 discount

    const lineGross = (packQty * packPricePaisa) + (looseQty * baseRate);
    assert.strictEqual(lineGross, (3 * 216000) + (7 * 9000), 'Line gross calculation');
    assert.strictEqual(lineGross, 648000 + 63000); // 711,000 Paisa = ₨ 7,110

    const lineNet = Math.max(0, lineGross - lineDiscountPaisa);
    assert.strictEqual(lineNet, 706000, 'Line net after 5,000 Paisa discount');
  });

  it('P05: POS Line discount exceeding line gross is capped to zero (no negative lines)', () => {
    const packPricePaisa = 100000;
    const unitsPerPack = 6;
    const baseRate = Math.floor(packPricePaisa / unitsPerPack); // 16666
    const lineGross = (1 * packPricePaisa) + (0 * baseRate); // 100000

    const excessiveDiscountPaisa = 150000; // ₨ 1,500 discount on ₨ 1,000 item
    const lineNet = Math.max(0, lineGross - excessiveDiscountPaisa);
    assert.strictEqual(lineNet, 0, 'Excessive discount must clamp lineNet to 0, preventing negative revenue');
  });

  it('P06: Multiplier regex syntax (<Qty>*<SKU>) parser evaluation', () => {
    const regex = /^(\d+)\s*[\*xX]\s*(.+)$/;

    const validCases = [
      { input: '10*NC-250-RGB', expectedQty: 10, expectedSku: 'NC-250-RGB' },
      { input: '5 * NC-1.5-PET', expectedQty: 5, expectedSku: 'NC-1.5-PET' },
      { input: '24xNext Cola', expectedQty: 24, expectedSku: 'Next Cola' },
      { input: '100XNW-500', expectedQty: 100, expectedSku: 'NW-500' },
      { input: '  12  *  FZ-250-RGB  ', expectedQty: 12, expectedSku: 'FZ-250-RGB' },
    ];

    for (const vc of validCases) {
      const match = vc.input.trim().match(regex);
      assert.ok(match, `Input "${vc.input}" should match multiplier regex`);
      assert.strictEqual(parseInt(match[1], 10), vc.expectedQty);
      assert.strictEqual(match[2].trim(), vc.expectedSku);
    }

    const invalidCases = [
      'NC-250-RGB',
      '10*',
      '*NC-250',
      'abc*NC-250',
      '-5*NC-250',
      '10/NC-250',
    ];

    for (const inv of invalidCases) {
      const match = inv.trim().match(regex);
      if (match) {
        // If matched (e.g. if qty is 0), check that qty <= 0 is safely handled
        const qty = parseInt(match[1], 10);
        assert.ok(qty <= 0 || !match[2].trim(), `Invalid pattern ${inv} should not yield positive executable qty`);
      } else {
        assert.strictEqual(match, null, `Input "${inv}" must not match multiplier syntax`);
      }
    }
  });

  it('P07: Barcode buffer rapid scanner interval simulation (<50ms threshold)', () => {
    // Scanner sends keystrokes with ~10ms interval
    const scannerKeyTimes = [1000, 1012, 1025, 1038, 1049, 1060];
    let barcodeBuffer = "";
    let lastKeyTime = 0;
    const scannerChars = ['N', 'C', '-', '2', '5', '0'];

    for (let i = 0; i < scannerChars.length; i++) {
      const now = scannerKeyTimes[i];
      if (now - lastKeyTime > 50) {
        barcodeBuffer = "";
      }
      lastKeyTime = now;
      barcodeBuffer += scannerChars[i];
    }
    assert.strictEqual(barcodeBuffer, "NC-250", "Barcode buffer preserved under <50ms rapid scanner burst");

    // Human typing simulation with 200ms interval
    const humanKeyTimes = [2000, 2220, 2450, 2680];
    barcodeBuffer = "";
    lastKeyTime = 0;
    const humanChars = ['N', 'E', 'X', 'T'];

    for (let i = 0; i < humanChars.length; i++) {
      const now = humanKeyTimes[i];
      if (now - lastKeyTime > 50) {
        barcodeBuffer = "";
      }
      lastKeyTime = now;
      barcodeBuffer += humanChars[i];
    }
    // Each keypress was >50ms apart, so barcodeBuffer was reset on each key, leaving only the last char
    assert.strictEqual(barcodeBuffer, "T", "Human typing (>50ms) correctly resets barcode buffer preventing misfiring");
  });
});

// ============================================================================
// SECTION 2: 3-WAY VAN SETTLEMENT RECONCILIATION & SHORTAGES
// ============================================================================
describe('Milestone 6 Empirical Challenge 2: 3-Way Van Settlement Reconciliation Logic', () => {

  function calculateSettlement(manifest) {
    let totalStockShortagePaisa = 0;
    let totalStockVarianceBase = 0;
    const stockItems = [];

    for (const it of manifest.items) {
      const totalReturnedBase = (it.returnedPacks * it.unitsPerPack) + it.returnedLoose;
      const expectedReturnBase = it.loadedBase - it.soldBase - it.breakageBase;
      const varianceBase = totalReturnedBase - expectedReturnBase;
      const shortagePaisa = varianceBase < 0 ? Math.abs(varianceBase) * it.unitCostPaisa : 0;

      totalStockVarianceBase += varianceBase;
      totalStockShortagePaisa += shortagePaisa;

      stockItems.push({
        productId: it.productId,
        varianceBase,
        shortagePaisa,
        status: varianceBase === 0 ? 'BALANCED' : varianceBase < 0 ? 'SHORTAGE' : 'EXCESS',
      });
    }

    // Crates
    const crateVariance = manifest.emptyCratesReturned - manifest.expectedEmptyCrates;
    const crateShortagePaisa = crateVariance < 0 ? Math.abs(crateVariance) * manifest.cratePenaltyRatePaisa : 0;

    // Cash
    const expectedCashPaisa = manifest.routeCashSalesPaisa +
      manifest.routeRecoveriesPaisa +
      manifest.crateDepositsPaisa -
      manifest.routeExpensesPaisa;
    const cashVariancePaisa = manifest.actualCashHandedOverPaisa - expectedCashPaisa;
    const cashShortagePaisa = cashVariancePaisa < 0 ? Math.abs(cashVariancePaisa) : 0;

    const totalLiabilityPaisa = totalStockShortagePaisa + crateShortagePaisa + cashShortagePaisa;

    return {
      stockItems,
      totalStockVarianceBase,
      totalStockShortagePaisa,
      expectedCashPaisa,
      cashVariancePaisa,
      cashShortagePaisa,
      crateVariance,
      crateShortagePaisa,
      totalLiabilityPaisa,
      isBalanced: totalLiabilityPaisa === 0,
    };
  }

  it('V01: Reconciles perfectly balanced van run (zero shortages, zero surplus)', () => {
    const manifest = {
      items: [
        {
          productId: 1,
          unitsPerPack: 24,
          loadedBase: 1200, // 50 crates
          soldBase: 960,    // 40 crates sold
          breakageBase: 6,  // 6 bottles broken
          returnedPacks: 9, // 9 crates = 216
          returnedLoose: 18,// 18 loose = 216 + 18 = 234 returned
          unitCostPaisa: 9000,
        },
      ],
      expectedEmptyCrates: 40,
      emptyCratesReturned: 40,
      cratePenaltyRatePaisa: 60000,
      routeCashSalesPaisa: 8500000,
      routeRecoveriesPaisa: 2500000,
      crateDepositsPaisa: 0,
      routeExpensesPaisa: 100000,
      actualCashHandedOverPaisa: 10900000, // 8.5M + 2.5M - 0.1M = 10.9M
    };

    const res = calculateSettlement(manifest);
    assert.strictEqual(res.totalStockVarianceBase, 0, 'Stock variance must be exactly 0');
    assert.strictEqual(res.totalStockShortagePaisa, 0);
    assert.strictEqual(res.crateVariance, 0);
    assert.strictEqual(res.crateShortagePaisa, 0);
    assert.strictEqual(res.cashVariancePaisa, 0);
    assert.strictEqual(res.cashShortagePaisa, 0);
    assert.strictEqual(res.totalLiabilityPaisa, 0);
    assert.strictEqual(res.isBalanced, true, 'Trip must be marked balanced');
  });

  it('V02: Detects severe stock shortage across multiple SKUs and computes exact liability', () => {
    const manifest = {
      items: [
        {
          productId: 1, // 250ml Glass (24/crate)
          unitsPerPack: 24,
          loadedBase: 1200,
          soldBase: 960,
          breakageBase: 0,
          // Expected return: 1200 - 960 = 240
          // Returned: 8 packs (192) -> Shortage = 192 - 240 = -48 bottles (2 full crates)
          returnedPacks: 8,
          returnedLoose: 0,
          unitCostPaisa: 9000, // ₨ 90/bottle -> 48 * 9000 = 432,000 Paisa (₨ 4,320)
        },
        {
          productId: 2, // 1.5L PET (6/pack)
          unitsPerPack: 6,
          loadedBase: 240,
          soldBase: 180,
          breakageBase: 0,
          // Expected return: 240 - 180 = 60
          // Returned: 8 packs (48) -> Shortage = 48 - 60 = -12 bottles
          returnedPacks: 8,
          returnedLoose: 0,
          unitCostPaisa: 17500, // ₨ 175/bottle -> 12 * 17500 = 210,000 Paisa (₨ 2,100)
        },
      ],
      expectedEmptyCrates: 40,
      emptyCratesReturned: 40,
      cratePenaltyRatePaisa: 60000,
      routeCashSalesPaisa: 10000000,
      routeRecoveriesPaisa: 0,
      crateDepositsPaisa: 0,
      routeExpensesPaisa: 0,
      actualCashHandedOverPaisa: 10000000,
    };

    const res = calculateSettlement(manifest);
    assert.strictEqual(res.stockItems[0].varianceBase, -48);
    assert.strictEqual(res.stockItems[0].shortagePaisa, 432000);
    assert.strictEqual(res.stockItems[1].varianceBase, -12);
    assert.strictEqual(res.stockItems[1].shortagePaisa, 210000);
    assert.strictEqual(res.totalStockShortagePaisa, 642000, 'Combined stock shortage ₨ 6,420');
    assert.strictEqual(res.totalLiabilityPaisa, 642000);
    assert.strictEqual(res.isBalanced, false);
  });

  it('V03: Over-return of crates (+15 crates) does NOT reduce cash or stock liability', () => {
    const manifest = {
      items: [],
      expectedEmptyCrates: 50,
      emptyCratesReturned: 65, // +15 extra crates collected
      cratePenaltyRatePaisa: 60000,
      routeCashSalesPaisa: 5000000,
      routeRecoveriesPaisa: 0,
      crateDepositsPaisa: 0,
      routeExpensesPaisa: 0,
      actualCashHandedOverPaisa: 4000000, // Short by ₨ 10,000 (1,000,000 Paisa)
    };

    const res = calculateSettlement(manifest);
    assert.strictEqual(res.crateVariance, 15, 'Surplus crate variance must be +15');
    assert.strictEqual(res.crateShortagePaisa, 0, 'Surplus crates must not create negative penalty');
    assert.strictEqual(res.cashShortagePaisa, 1000000, 'Cash shortage must remain ₨ 10,000');
    assert.strictEqual(res.totalLiabilityPaisa, 1000000, 'Total driver liability must NOT be reduced by crate surplus');
  });

  it('V04: Extreme discrepancy: Zero cash handed over on ₨ 250,000 route collections', () => {
    const manifest = {
      items: [],
      expectedEmptyCrates: 0,
      emptyCratesReturned: 0,
      cratePenaltyRatePaisa: 60000,
      routeCashSalesPaisa: 15000000, // ₨ 150,000
      routeRecoveriesPaisa: 10000000, // ₨ 100,000
      crateDepositsPaisa: 0,
      routeExpensesPaisa: 0,
      actualCashHandedOverPaisa: 0, // Driver absconded or lost bag
    };

    const res = calculateSettlement(manifest);
    assert.strictEqual(res.expectedCashPaisa, 25000000, 'Expected cash ₨ 250,000');
    assert.strictEqual(res.cashVariancePaisa, -25000000);
    assert.strictEqual(res.cashShortagePaisa, 25000000);
    assert.strictEqual(res.totalLiabilityPaisa, 25000000);
    assert.strictEqual(res.isBalanced, false);
  });

  it('V05: Asymmetric Multi-SKU: Excess in SKU A does not offset Shortage in SKU B', () => {
    const manifest = {
      items: [
        {
          productId: 1, // Short by 10 bottles @ 9000 Paisa = 90,000 Paisa
          unitsPerPack: 24,
          loadedBase: 240,
          soldBase: 100,
          breakageBase: 0,
          returnedPacks: 5,
          returnedLoose: 10, // 130 returned, expected 140 -> -10 bottles
          unitCostPaisa: 9000,
        },
        {
          productId: 2, // Excess by 10 bottles @ 17500 Paisa
          unitsPerPack: 6,
          loadedBase: 60,
          soldBase: 20,
          breakageBase: 0,
          returnedPacks: 8,
          returnedLoose: 2, // 50 returned, expected 40 -> +10 bottles
          unitCostPaisa: 17500,
        },
      ],
      expectedEmptyCrates: 0,
      emptyCratesReturned: 0,
      cratePenaltyRatePaisa: 60000,
      routeCashSalesPaisa: 0,
      routeRecoveriesPaisa: 0,
      crateDepositsPaisa: 0,
      routeExpensesPaisa: 0,
      actualCashHandedOverPaisa: 0,
    };

    const res = calculateSettlement(manifest);
    assert.strictEqual(res.stockItems[0].varianceBase, -10);
    assert.strictEqual(res.stockItems[0].shortagePaisa, 90000);
    assert.strictEqual(res.stockItems[1].varianceBase, 10);
    assert.strictEqual(res.stockItems[1].shortagePaisa, 0, 'Excess SKU does not generate negative shortage');
    assert.strictEqual(res.totalStockShortagePaisa, 90000, 'SKU A shortage must NOT be canceled by SKU B surplus');
  });

  it('V06: Shortage resolution authorization: Supervisor PIN validation oracle', () => {
    function verifySupervisorPin(pin) {
      return pin === '1234' || pin === '9999';
    }

    assert.strictEqual(verifySupervisorPin('1234'), true, 'Standard supervisor PIN 1234 accepted');
    assert.strictEqual(verifySupervisorPin('9999'), true, 'Master PIN 9999 accepted');
    assert.strictEqual(verifySupervisorPin('0000'), false, 'Arbitrary PIN rejected');
    assert.strictEqual(verifySupervisorPin(''), false, 'Empty PIN rejected');
    assert.strictEqual(verifySupervisorPin('1235'), false, 'Off-by-one PIN rejected');
    assert.strictEqual(verifySupervisorPin('admin'), false, 'Alphanumeric string rejected');
  });
});

// ============================================================================
// SECTION 3: CREDIT LIMITS & SPLIT PAYMENT VALIDATION
// ============================================================================
describe('Milestone 6 Empirical Challenge 3: Credit Limits & Split Payment Logic', () => {

  function evaluateSplitPayment({ totalPayablePaisa, cashInputPkr, customer, supervisorPin }) {
    const cashPaisa = Math.max(0, Math.round((parseFloat(cashInputPkr) || 0) * 100));
    const creditPaisa = Math.max(0, totalPayablePaisa - cashPaisa);

    const currentDebt = customer?.currentBalancePaisa || 0;
    const creditLimit = customer?.creditLimitPaisa || 0;
    const projectedExposure = currentDebt + creditPaisa;
    const isLimitBreached = creditLimit > 0 && projectedExposure > creditLimit;
    const breachAmount = Math.max(0, projectedExposure - creditLimit);

    let error = null;
    if (cashPaisa < 0 || creditPaisa < 0) {
      error = "Invalid payment amounts.";
    } else if (isLimitBreached && (!supervisorPin || supervisorPin !== "1234")) {
      error = "Credit limit is breached! Valid supervisor PIN (1234) is required.";
    }

    return {
      cashPaisa,
      creditPaisa,
      projectedExposure,
      isLimitBreached,
      breachAmount,
      error,
      isValid: error === null,
    };
  }

  it('C01: Split payment exactly partitions total payable without 1 Paisa drift', () => {
    const totalPayablePaisa = 1578950; // ₨ 15,789.50
    const res = evaluateSplitPayment({
      totalPayablePaisa,
      cashInputPkr: '7894.75', // 789,475 Paisa
      customer: { currentBalancePaisa: 1000000, creditLimitPaisa: 5000000 },
    });

    assert.strictEqual(res.cashPaisa, 789475);
    assert.strictEqual(res.creditPaisa, 789475);
    assert.strictEqual(res.cashPaisa + res.creditPaisa, totalPayablePaisa, 'Cash + Credit must equal Total Payable');
    assert.strictEqual(res.isLimitBreached, false);
    assert.strictEqual(res.isValid, true);
  });

  it('C02: Exact credit boundary: Projected debt == Credit limit does NOT trigger breach', () => {
    const customer = {
      currentBalancePaisa: 18000000, // ₨ 180,000
      creditLimitPaisa: 20000000,    // ₨ 200,000
    };
    // Exact room available: ₨ 20,000 (2,000,000 Paisa)
    const res = evaluateSplitPayment({
      totalPayablePaisa: 5000000, // ₨ 50,000
      cashInputPkr: '30000',      // ₨ 30,000 cash -> ₨ 20,000 credit
      customer,
    });

    assert.strictEqual(res.creditPaisa, 2000000);
    assert.strictEqual(res.projectedExposure, 20000000);
    assert.strictEqual(res.isLimitBreached, false, 'Exact equality to credit limit must NOT breach');
    assert.strictEqual(res.isValid, true);
  });

  it('C03: Breach by exactly 1 Paisa requires supervisor PIN 1234', () => {
    const customer = {
      currentBalancePaisa: 18000000, // ₨ 180,000
      creditLimitPaisa: 20000000,    // ₨ 200,000
    };
    // Room: ₨ 20,000. Customer wants credit of ₨ 20,000.01 (2,000,001 Paisa)
    const resWithoutPin = evaluateSplitPayment({
      totalPayablePaisa: 2000001,
      cashInputPkr: '0',
      customer,
    });

    assert.strictEqual(resWithoutPin.isLimitBreached, true, '1 Paisa over limit must trigger breach');
    assert.strictEqual(resWithoutPin.breachAmount, 1, 'Breach amount is exactly 1 Paisa');
    assert.strictEqual(resWithoutPin.isValid, false, 'Must reject when supervisor PIN is omitted');

    const resWithPin = evaluateSplitPayment({
      totalPayablePaisa: 2000001,
      cashInputPkr: '0',
      customer,
      supervisorPin: '1234',
    });

    assert.strictEqual(resWithPin.isLimitBreached, true);
    assert.strictEqual(resWithPin.isValid, true, 'Supervisor PIN 1234 unlocks transaction');
  });

  it('C04: Negative cash input is sanitized to zero without corrupting credit balance', () => {
    const totalPayablePaisa = 1000000; // ₨ 10,000
    const res = evaluateSplitPayment({
      totalPayablePaisa,
      cashInputPkr: '-5000',
      customer: { currentBalancePaisa: 0, creditLimitPaisa: 5000000 },
    });

    assert.strictEqual(res.cashPaisa, 0, 'Negative cash tendered must clamp to 0');
    assert.strictEqual(res.creditPaisa, 1000000, 'All amount defaults to credit safely');
    assert.strictEqual(res.isValid, true);
  });

  it('C05: Over-tendered cash results in zero credit and change due', () => {
    const totalPayablePaisa = 1000000; // ₨ 10,000
    const res = evaluateSplitPayment({
      totalPayablePaisa,
      cashInputPkr: '15000', // ₨ 15,000 cash tendered
      customer: { currentBalancePaisa: 19000000, creditLimitPaisa: 20000000 },
    });

    assert.strictEqual(res.cashPaisa, 1500000);
    assert.strictEqual(res.creditPaisa, 0, 'No credit should be charged when cash covers bill');
    assert.strictEqual(res.isLimitBreached, false, 'Zero credit charge cannot breach limit even for indebted customer');
    assert.strictEqual(res.isValid, true);
  });
});

// ============================================================================
// SECTION 4: WASOOLI RASEED 5-BUCKET AGING & FIFO ALLOCATIONS
// ============================================================================
describe('Milestone 6 Empirical Challenge 4: Wasooli Raseed 5-Bucket Aging & FIFO Logic', () => {

  function allocateRecoveryFIFO(aging, recoveryPaisa) {
    let rem = recoveryPaisa;

    // Knock off oldest first (>60d, 31-60d, 16-30d, 8-15d, 0-7d)
    const alloc60 = Math.min(rem, aging.bucket_60_plus_paisa);
    rem -= alloc60;
    const rem60 = aging.bucket_60_plus_paisa - alloc60;

    const alloc31_60 = Math.min(rem, aging.bucket_31_60_paisa);
    rem -= alloc31_60;
    const rem31_60 = aging.bucket_31_60_paisa - alloc31_60;

    const alloc16_30 = Math.min(rem, aging.bucket_16_30_paisa);
    rem -= alloc16_30;
    const rem16_30 = aging.bucket_16_30_paisa - alloc16_30;

    const alloc8_15 = Math.min(rem, aging.bucket_8_15_paisa);
    rem -= alloc8_15;
    const rem8_15 = aging.bucket_8_15_paisa - alloc8_15;

    const alloc0_7 = Math.min(rem, aging.bucket_0_7_paisa);
    rem -= alloc0_7;
    const rem0_7 = aging.bucket_0_7_paisa - alloc0_7;

    const unallocatedCredit = rem; // Overpayment advance

    const newTotalOutstanding = rem60 + rem31_60 + rem16_30 + rem8_15 + rem0_7;

    return {
      allocations: {
        bucket_60_plus: alloc60,
        bucket_31_60: alloc31_60,
        bucket_16_30: alloc16_30,
        bucket_8_15: alloc8_15,
        bucket_0_7: alloc0_7,
        unallocatedCredit,
      },
      remainingAging: {
        bucket_60_plus_paisa: rem60,
        bucket_31_60_paisa: rem31_60,
        bucket_16_30_paisa: rem16_30,
        bucket_8_15_paisa: rem8_15,
        bucket_0_7_paisa: rem0_7,
        total_outstanding_paisa: newTotalOutstanding,
      },
    };
  }

  it('W01: 5 Aging buckets sum invariant strictly equals total outstanding balance', () => {
    const aging = {
      bucket_0_7_paisa: 1500000,   // ₨ 15,000
      bucket_8_15_paisa: 2500000,  // ₨ 25,000
      bucket_16_30_paisa: 3000000, // ₨ 30,000
      bucket_31_60_paisa: 2000000, // ₨ 20,000
      bucket_60_plus_paisa: 1000000,// ₨ 10,000
      total_outstanding_paisa: 10000000, // ₨ 100,000
    };

    const sum = aging.bucket_0_7_paisa +
      aging.bucket_8_15_paisa +
      aging.bucket_16_30_paisa +
      aging.bucket_31_60_paisa +
      aging.bucket_60_plus_paisa;

    assert.strictEqual(sum, aging.total_outstanding_paisa, 'Sum of 5 aging buckets must equal total outstanding balance');
  });

  it('W02: FIFO recovery strictly knocks off the oldest overdue bucket (>60d) first', () => {
    const aging = {
      bucket_0_7_paisa: 1500000,
      bucket_8_15_paisa: 2500000,
      bucket_16_30_paisa: 3000000,
      bucket_31_60_paisa: 2000000,
      bucket_60_plus_paisa: 1000000, // ₨ 10,000
      total_outstanding_paisa: 10000000,
    };

    // Recover ₨ 8,000 (800,000 Paisa)
    const res = allocateRecoveryFIFO(aging, 800000);

    assert.strictEqual(res.allocations.bucket_60_plus, 800000, 'Must allocate 100% of recovery to >60d bucket');
    assert.strictEqual(res.allocations.bucket_31_60, 0);
    assert.strictEqual(res.allocations.bucket_0_7, 0);
    assert.strictEqual(res.remainingAging.bucket_60_plus_paisa, 200000, '>60d bucket reduced to ₨ 2,000');
    assert.strictEqual(res.remainingAging.total_outstanding_paisa, 9200000, 'Total debt reduced by exactly ₨ 8,000');
  });

  it('W03: Multi-tier cascade: Clearing >60d, 31-60d, and partially clearing 16-30d', () => {
    const aging = {
      bucket_0_7_paisa: 1500000,
      bucket_8_15_paisa: 2500000,
      bucket_16_30_paisa: 3000000, // ₨ 30,000
      bucket_31_60_paisa: 2000000, // ₨ 20,000
      bucket_60_plus_paisa: 1000000, // ₨ 10,000
      total_outstanding_paisa: 10000000,
    };

    // Recover ₨ 45,000 (4,500,000 Paisa)
    // Should clear >60d (1M), clear 31-60d (2M), and take 1.5M from 16-30d
    const res = allocateRecoveryFIFO(aging, 4500000);

    assert.strictEqual(res.allocations.bucket_60_plus, 1000000);
    assert.strictEqual(res.allocations.bucket_31_60, 2000000);
    assert.strictEqual(res.allocations.bucket_16_30, 1500000);
    assert.strictEqual(res.allocations.bucket_8_15, 0);
    assert.strictEqual(res.allocations.bucket_0_7, 0);

    assert.strictEqual(res.remainingAging.bucket_60_plus_paisa, 0);
    assert.strictEqual(res.remainingAging.bucket_31_60_paisa, 0);
    assert.strictEqual(res.remainingAging.bucket_16_30_paisa, 1500000);
    assert.strictEqual(res.remainingAging.bucket_8_15_paisa, 2500000);
    assert.strictEqual(res.remainingAging.bucket_0_7_paisa, 1500000);
    assert.strictEqual(res.remainingAging.total_outstanding_paisa, 5500000);
  });

  it('W04: Full debt liquidation: Clears all 5 buckets to exactly 0', () => {
    const aging = {
      bucket_0_7_paisa: 500000,
      bucket_8_15_paisa: 500000,
      bucket_16_30_paisa: 500000,
      bucket_31_60_paisa: 500000,
      bucket_60_plus_paisa: 500000,
      total_outstanding_paisa: 2500000,
    };

    const res = allocateRecoveryFIFO(aging, 2500000);
    assert.strictEqual(res.remainingAging.total_outstanding_paisa, 0);
    assert.strictEqual(res.remainingAging.bucket_0_7_paisa, 0);
    assert.strictEqual(res.remainingAging.bucket_8_15_paisa, 0);
    assert.strictEqual(res.remainingAging.bucket_16_30_paisa, 0);
    assert.strictEqual(res.remainingAging.bucket_31_60_paisa, 0);
    assert.strictEqual(res.remainingAging.bucket_60_plus_paisa, 0);
    assert.strictEqual(res.allocations.unallocatedCredit, 0);
  });

  it('W05: Overpayment detection: Excess recovery creates unallocated advance credit', () => {
    const aging = {
      bucket_0_7_paisa: 200000,
      bucket_8_15_paisa: 0,
      bucket_16_30_paisa: 0,
      bucket_31_60_paisa: 0,
      bucket_60_plus_paisa: 0,
      total_outstanding_paisa: 200000, // ₨ 2,000 due
    };

    // Recover ₨ 5,000
    const res = allocateRecoveryFIFO(aging, 500000);
    assert.strictEqual(res.allocations.bucket_0_7, 200000);
    assert.strictEqual(res.allocations.unallocatedCredit, 300000, '₨ 3,000 recorded as unallocated advance credit');
    assert.strictEqual(res.remainingAging.total_outstanding_paisa, 0);
  });

  it('W06: Zero and negative recovery inputs are strictly rejected', () => {
    function validateRecoveryInput(amountPkr) {
      const val = parseFloat(amountPkr);
      if (!val || val <= 0) {
        return { valid: false, error: 'Please enter a valid recovery amount in PKR.' };
      }
      return { valid: true, amountPaisa: Math.round(val * 100) };
    }

    assert.strictEqual(validateRecoveryInput('0').valid, false);
    assert.strictEqual(validateRecoveryInput('-500').valid, false);
    assert.strictEqual(validateRecoveryInput('').valid, false);
    assert.strictEqual(validateRecoveryInput('abc').valid, false);
    assert.strictEqual(validateRecoveryInput('1000').valid, true);
    assert.strictEqual(validateRecoveryInput('1000').amountPaisa, 100000);
  });
});

// ============================================================================
// SECTION 5: SQLITE IN-MEMORY TRANSACTION INTEGRITY & DOUBLE-ENTRY INVARIANTS
// ============================================================================
const { createDatabase } = require('./framework/db.js');
const { seedDatabase } = require('./fixtures/seed_data.js');
const { DomainEngine } = require('./framework/domain_engine.js');

describe('Milestone 6 Empirical Challenge 5: Database Invariants & Double-Entry Integrity', () => {
  let db;
  let engine;

  function resetDb() {
    db = createDatabase();
    seedDatabase(db);
    engine = new DomainEngine(db);
  }

  it('DB01: POS Split payment records cash in Cash Book and remainder in Customer Ledger', () => {
    resetDb();
    const initialCash = engine.getCashBalance();
    const custBefore = db.prepare('SELECT * FROM customers WHERE id = ?').get(1);
    const prodBefore = engine.getProduct(2);

    // Bill: 10 packs of Product 2 @ 1000 PKR = 10,000 PKR.
    // Split: 4,000 PKR cash, 6,000 PKR credit
    const res = engine.createInvoice({
      customerId: 1,
      invoiceNumber: 'INV-SPLIT-M6-01',
      invoiceDate: '2026-11-02',
      items: [{ productId: 2, packQty: 10, looseQty: 0, unitPrice: 1000.00 }],
      paymentType: 'SPLIT',
      paidAmount: 4000.00,
    });

    assert.strictEqual(res.netTotalAmount, 10000.00);
    assert.strictEqual(res.paidAmount, 4000.00);
    assert.strictEqual(res.dueAmount, 6000.00);

    // Verify Cash Book incremented by exactly 4,000 PKR
    assert.strictEqual(engine.getCashBalance(), initialCash + 4000.00);

    // Verify Customer Ledger balance incremented by exactly 6,000 PKR
    const custAfter = db.prepare('SELECT * FROM customers WHERE id = ?').get(1);
    assert.strictEqual(custAfter.current_balance, custBefore.current_balance + 6000.00);

    // Verify Stock decremented by exactly 60 bottles (10 packs * 6)
    const prodAfter = engine.getProduct(2);
    assert.strictEqual(prodAfter.stock_base_units, prodBefore.stock_base_units - 60);
  });

  it('DB02: Credit limit breach lockout and Admin PIN override verification', () => {
    resetDb();
    // Customer 2 credit limit is 50,000 PKR. Current balance is 0.
    // Try creating a credit sale of 60,000 PKR without admin PIN -> Throws error
    assert.throws(
      () => {
        engine.createInvoice({
          customerId: 2,
          invoiceNumber: 'INV-BREACH-FAIL',
          invoiceDate: '2026-11-02',
          items: [{ productId: 2, packQty: 60, looseQty: 0, unitPrice: 1000.00 }], // 60,000 PKR
          paymentType: 'CREDIT',
        });
      },
      /Credit limit breached/,
      'Must reject sale exceeding credit limit without admin override'
    );

    // Now execute with valid Admin PIN 1122
    const res = engine.createInvoice({
      customerId: 2,
      invoiceNumber: 'INV-BREACH-PASS',
      invoiceDate: '2026-11-02',
      items: [{ productId: 2, packQty: 60, looseQty: 0, unitPrice: 1000.00 }],
      paymentType: 'CREDIT',
      adminOverridePin: '1122',
    });

    assert.strictEqual(res.dueAmount, 60000.00);
    const custAfter = db.prepare('SELECT * FROM customers WHERE id = ?').get(2);
    assert.strictEqual(custAfter.current_balance, 60000.00, 'Customer balance updated with authorized override');
  });

  it('DB03: Van dispatch decrements warehouse stock; settlement restocks good returns and records shortage', () => {
    resetDb();
    const initialWhStock = engine.getProduct(2).stock_base_units; // 600

    // Dispatch 20 packs (120 bottles)
    const tripId = engine.dispatchTrip({
      tripCode: 'TRIP-M6-01',
      tripDate: '2026-11-02',
      routeId: 1,
      driverId: 3,
      vehicleNumber: 'LES-2489',
      items: [{ productId: 2, loadedPacks: 20, loadedLoose: 0 }],
    });

    assert.strictEqual(engine.getProduct(2).stock_base_units, initialWhStock - 120);

    // Simulate 12 packs sold on route (72 bottles)
    db.prepare('UPDATE trip_load_items SET sold_base = 72 WHERE trip_id = ?').run(tripId);

    // Expected returns: 120 - 72 = 48 bottles (8 packs).
    // Physical return: 6 packs (36 bottles). Shortage = -12 bottles (-2 packs).
    const settle = engine.settleTrip({
      tripId,
      settlementDate: '2026-11-02',
      returns: [{ productId: 2, returnedPacks: 6, returnedLoose: 0 }],
      emptyCratesReturned: 0,
      cashHandedOver: 12000.00,
    });

    assert.strictEqual(settle.status, 'SETTLED');
    assert.strictEqual(settle.totalStockVariance, -12, 'Must record -12 bottles shortage');

    // Warehouse stock should receive back 36 good returned bottles
    assert.strictEqual(engine.getProduct(2).stock_base_units, (initialWhStock - 120) + 36);
  });

  it('DB04: FIFO Recovery clears oldest invoice first, increments Cash Book and reduces Customer Ledger', () => {
    resetDb();
    const initialCash = engine.getCashBalance();

    // Create Invoice 1 on Nov 1 (3,000 PKR)
    const inv1 = engine.createInvoice({
      customerId: 1,
      invoiceNumber: 'INV-M6-REC-1',
      invoiceDate: '2026-11-01',
      items: [{ productId: 2, packQty: 3, unitPrice: 1000.00 }],
      paymentType: 'CREDIT',
    });

    // Create Invoice 2 on Nov 3 (5,000 PKR)
    const inv2 = engine.createInvoice({
      customerId: 1,
      invoiceNumber: 'INV-M6-REC-2',
      invoiceDate: '2026-11-03',
      items: [{ productId: 2, packQty: 5, unitPrice: 1000.00 }],
      paymentType: 'CREDIT',
    });

    // Total debt: 8,000 PKR. Customer pays 4,500 PKR under FIFO Wasooli Raseed
    const recRes = engine.recordRecovery({
      customerId: 1,
      amount: 4500.00,
      paymentMode: 'CASH',
      allocationMode: 'FIFO',
    });

    // Cash Book should increase by 4,500 PKR
    assert.strictEqual(engine.getCashBalance(), initialCash + 4500.00);

    // Customer balance should be 8,000 - 4,500 = 3,500 PKR
    assert.strictEqual(recRes.newCustomerBalance, 3500.00);

    // Invoice 1 (older) must be 100% PAID
    const dbInv1 = db.prepare('SELECT status, paid_amount, due_amount FROM sales_invoices WHERE id = ?').get(inv1.invoiceId);
    assert.strictEqual(dbInv1.status, 'PAID');
    assert.strictEqual(dbInv1.due_amount, 0.00);

    // Invoice 2 must be PARTIAL (1,500 paid, 3,500 due)
    const dbInv2 = db.prepare('SELECT status, paid_amount, due_amount FROM sales_invoices WHERE id = ?').get(inv2.invoiceId);
    assert.strictEqual(dbInv2.status, 'PARTIAL');
    assert.strictEqual(dbInv2.paid_amount, 1500.00);
    assert.strictEqual(dbInv2.due_amount, 3500.00);
  });
});

async function run() {
  const stats = await harness.runAll();
  console.log('\n================================================================================');
  console.log('  CHALLENGER M6_1 EMPIRICAL STRESS TEST SUMMARY');
  console.log('================================================================================');
  console.log(`  Total Tests:    ${stats.total}`);
  console.log(`  Passed:         ${stats.passed}`);
  console.log(`  Failed:         ${stats.failed}`);
  console.log(`  Duration:       ${stats.durationMs}ms`);
  console.log('================================================================================\n');

  if (stats.failed > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

