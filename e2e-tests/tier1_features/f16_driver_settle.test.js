/**
 * Tier 1: Feature 16 - Driver Settlement & Reconciliation
 * Minimum 5 test cases covering physical returns, cash handover, shortage penalties, and trip settlement.
 */

const { describe, it, beforeEach, assert } = require('../framework/harness.js');
const { createDatabase } = require('../framework/db.js');
const { seedDatabase } = require('../fixtures/seed_data.js');
const { DomainEngine } = require('../framework/domain_engine.js');

describe('Tier 1: F16 - Driver Settlement & Reconciliation', () => {
  let db;
  let engine;

  beforeEach(() => {
    db = createDatabase();
    seedDatabase(db);
    engine = new DomainEngine(db);
  });

  it('F16-T1: Evening unsold stock is physically verified and restored to warehouse inventory', () => {
    // Dispatch 20 cartons of Product 2 (120 bottles)
    const tripId = engine.dispatchTrip({
      tripCode: 'TRIP-F16-1',
      tripDate: '2026-11-02',
      routeId: 1,
      driverId: 3,
      vehicleNumber: 'LES-2489',
      items: [{ productId: 2, loadedPacks: 20, loadedLoose: 0 }],
    });

    const whStockAfterDispatch = engine.getProduct(2).stock_base_units;

    // Driver returns with 5 cartons unsold (30 bottles)
    engine.settleTrip({
      tripId,
      settlementDate: '2026-11-02',
      returns: [{ productId: 2, returnedPacks: 5, returnedLoose: 0 }],
      emptyCratesReturned: 0,
      cashHandedOver: 0,
    });

    const whStockAfterSettle = engine.getProduct(2).stock_base_units;
    assert.strictEqual(whStockAfterSettle, whStockAfterDispatch + 30, 'Warehouse stock should restore 30 unsold bottles');
  });

  it('F16-T2: Reconciles perfect balanced trip with zero stock variance', () => {
    const tripId = engine.dispatchTrip({
      tripCode: 'TRIP-F16-2',
      tripDate: '2026-11-02',
      routeId: 1,
      driverId: 3,
      vehicleNumber: 'LES-2489',
      items: [{ productId: 2, loadedPacks: 10, loadedLoose: 0 }],
    });

    // Simulate that 6 cartons were sold on route
    db.prepare('UPDATE trip_load_items SET sold_base = 36 WHERE trip_id = ?').run(tripId);

    // Returned: 4 cartons (24 bottles) -> Expected return = 10*6 - 36 = 24 -> Variance = 0
    const settleRes = engine.settleTrip({
      tripId,
      settlementDate: '2026-11-02',
      returns: [{ productId: 2, returnedPacks: 4, returnedLoose: 0 }],
      emptyCratesReturned: 0,
    });

    assert.strictEqual(settleRes.totalStockVariance, 0, 'Variance must be 0 for balanced run');
  });

  it('F16-T3: Detects driver stock shortage when physical return is less than expected', () => {
    const tripId = engine.dispatchTrip({
      tripCode: 'TRIP-F16-3',
      tripDate: '2026-11-02',
      routeId: 1,
      driverId: 3,
      vehicleNumber: 'LES-2489',
      items: [{ productId: 2, loadedPacks: 10, loadedLoose: 0 }], // 60 bottles
    });

    // Sold 30 bottles on route, expected return is 30 bottles (5 cartons)
    db.prepare('UPDATE trip_load_items SET sold_base = 30 WHERE trip_id = ?').run(tripId);

    // Driver only returns 3 cartons (18 bottles) -> Shortage = 18 - 30 = -12 bottles
    const settleRes = engine.settleTrip({
      tripId,
      settlementDate: '2026-11-02',
      returns: [{ productId: 2, returnedPacks: 3, returnedLoose: 0 }],
      emptyCratesReturned: 0,
    });

    assert.strictEqual(settleRes.totalStockVariance, -12, 'Must detect -12 bottles shortage');
  });

  it('F16-T4: Settle trip marks delivery trip status as SETTLED', () => {
    const tripId = engine.dispatchTrip({
      tripCode: 'TRIP-F16-4',
      tripDate: '2026-11-02',
      routeId: 1,
      driverId: 3,
      vehicleNumber: 'LES-2489',
      items: [{ productId: 2, loadedPacks: 5, loadedLoose: 0 }],
    });

    engine.settleTrip({
      tripId,
      settlementDate: '2026-11-02',
      returns: [{ productId: 2, returnedPacks: 5, returnedLoose: 0 }],
      emptyCratesReturned: 0,
    });

    const trip = db.prepare('SELECT status FROM delivery_trips WHERE id = ?').get(tripId);
    assert.strictEqual(trip.status, 'SETTLED', 'Trip status must be SETTLED');
  });

  it('F16-T5: Logs empty crates returned from delivery van in settlement record', () => {
    const tripId = engine.dispatchTrip({
      tripCode: 'TRIP-F16-5',
      tripDate: '2026-11-02',
      routeId: 1,
      driverId: 3,
      vehicleNumber: 'LES-2489',
      items: [{ productId: 1, loadedPacks: 10, loadedLoose: 0 }],
    });

    engine.settleTrip({
      tripId,
      settlementDate: '2026-11-02',
      returns: [{ productId: 1, returnedPacks: 2, returnedLoose: 0 }],
      emptyCratesReturned: 8,
    });

    const settlement = db.prepare('SELECT * FROM trip_settlements WHERE trip_id = ?').get(tripId);
    assert.strictEqual(settlement.empty_crates_returned, 8, 'Settlement should record 8 empty crates');
  });
});
