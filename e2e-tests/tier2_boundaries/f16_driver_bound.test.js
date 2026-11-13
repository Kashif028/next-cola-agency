/**
 * Tier 2: F16 - Driver Settlement & Reconciliation (Boundary & Corner Cases)
 */

const { describe, it, beforeEach, assert } = require('../framework/harness.js');
const { createDatabase } = require('../framework/db.js');
const { seedDatabase } = require('../fixtures/seed_data.js');
const { DomainEngine } = require('../framework/domain_engine.js');

describe('Tier 2: F16 - Driver Settlement Boundary & Corner Cases', () => {
  let db;
  let engine;

  beforeEach(() => {
    db = createDatabase();
    seedDatabase(db);
    engine = new DomainEngine(db);
  });

  it('F16-B1: Driver returns 100% unsold inventory (all morning units returned to warehouse)', () => {
    const whStockBefore = engine.getProduct(2).stock_base_units; // 600

    const tripId = engine.dispatchTrip({
      tripCode: 'TRIP-B16-1',
      tripDate: '2026-11-02',
      routeId: 1,
      driverId: 3,
      vehicleNumber: 'LES-2489',
      items: [{ productId: 2, loadedPacks: 10, loadedLoose: 0 }], // 60 bottles
    });

    // Driver returns all 10 cartons unsold
    engine.settleTrip({
      tripId,
      settlementDate: '2026-11-02',
      returns: [{ productId: 2, returnedPacks: 10, returnedLoose: 0 }],
    });

    assert.strictEqual(engine.getProduct(2).stock_base_units, whStockBefore, 'All stock must be restored to warehouse');
  });

  it('F16-B2: Driver returns 0 units (100% sold on route with zero remaining stock)', () => {
    const tripId = engine.dispatchTrip({
      tripCode: 'TRIP-B16-2',
      tripDate: '2026-11-02',
      routeId: 1,
      driverId: 3,
      vehicleNumber: 'LES-2489',
      items: [{ productId: 2, loadedPacks: 10, loadedLoose: 0 }], // 60 bottles
    });

    db.prepare('UPDATE trip_load_items SET sold_base = 60 WHERE trip_id = ?').run(tripId);

    const settle = engine.settleTrip({
      tripId,
      settlementDate: '2026-11-02',
      returns: [{ productId: 2, returnedPacks: 0, returnedLoose: 0 }],
    });

    assert.strictEqual(settle.totalStockVariance, 0, 'Zero variance when 100% sold');
  });

  it('F16-B3: Driver shortage of exactly 1 base unit (missing single bottle)', () => {
    const tripId = engine.dispatchTrip({
      tripCode: 'TRIP-B16-3',
      tripDate: '2026-11-02',
      routeId: 1,
      driverId: 3,
      vehicleNumber: 'LES-2489',
      items: [{ productId: 1, loadedPacks: 2, loadedLoose: 0 }], // 48 bottles
    });

    // Expected return: 48 bottles. Driver returns 1 crate + 23 loose = 47 bottles. Shortage = -1
    const settle = engine.settleTrip({
      tripId,
      settlementDate: '2026-11-02',
      returns: [{ productId: 1, returnedPacks: 1, returnedLoose: 23 }],
    });

    assert.strictEqual(settle.totalStockVariance, -1, 'Must detect shortage of exactly -1 bottle');
  });

  it('F16-B4: Driver submits surplus / excess cash handover', () => {
    const tripId = engine.dispatchTrip({
      tripCode: 'TRIP-B16-4',
      tripDate: '2026-11-02',
      routeId: 1,
      driverId: 3,
      vehicleNumber: 'LES-2489',
      items: [{ productId: 2, loadedPacks: 1, loadedLoose: 0 }],
    });

    // Expected cash = 0, Driver hands over 1,000 PKR excess
    const settle = engine.settleTrip({
      tripId,
      settlementDate: '2026-11-02',
      returns: [{ productId: 2, returnedPacks: 1, returnedLoose: 0 }],
      cashHandedOver: 1000.00,
    });

    assert.strictEqual(settle.cashVariance, 1000.00, 'Cash variance must be +1,000 PKR');
  });

  it('F16-B5: Driver settlement with zero empty crates returned succeeds cleanly', () => {
    const tripId = engine.dispatchTrip({
      tripCode: 'TRIP-B16-5',
      tripDate: '2026-11-02',
      routeId: 1,
      driverId: 3,
      vehicleNumber: 'LES-2489',
      items: [{ productId: 1, loadedPacks: 5, loadedLoose: 0 }],
    });

    const settle = engine.settleTrip({
      tripId,
      settlementDate: '2026-11-02',
      returns: [{ productId: 1, returnedPacks: 5, returnedLoose: 0 }],
      emptyCratesReturned: 0,
    });

    assert.strictEqual(settle.status, 'SETTLED');
  });
});
