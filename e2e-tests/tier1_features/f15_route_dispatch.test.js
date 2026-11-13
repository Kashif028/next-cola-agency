/**
 * Tier 1: Feature 15 - Delivery Route & Vehicle Stock Issuance
 * Minimum 5 test cases covering delivery beats, vehicle manifests, morning stock loading, and gate pass.
 */

const { describe, it, beforeEach, assert } = require('../framework/harness.js');
const { createDatabase } = require('../framework/db.js');
const { seedDatabase } = require('../fixtures/seed_data.js');
const { DomainEngine } = require('../framework/domain_engine.js');

describe('Tier 1: F15 - Delivery Route & Vehicle Stock Issuance', () => {
  let db;
  let engine;

  beforeEach(() => {
    db = createDatabase();
    seedDatabase(db);
    engine = new DomainEngine(db);
  });

  it('F15-T1: Dispatches delivery trip and marks status DISPATCHED', () => {
    const tripId = engine.dispatchTrip({
      tripCode: 'TRIP-202611-01',
      tripDate: '2026-11-02',
      routeId: 1,
      driverId: 3,
      vehicleNumber: 'LES-2489',
      items: [{ productId: 2, loadedPacks: 20, loadedLoose: 0 }],
    });

    const trip = db.prepare('SELECT * FROM delivery_trips WHERE id = ?').get(tripId);
    assert.ok(trip, 'Trip record must exist');
    assert.strictEqual(trip.status, 'DISPATCHED');
    assert.strictEqual(trip.vehicle_number, 'LES-2489');
  });

  it('F15-T2: Deducts morning vehicle load from central warehouse stock', () => {
    const whStockBefore = engine.getProduct(2).stock_base_units; // 600

    engine.dispatchTrip({
      tripCode: 'TRIP-202611-02',
      tripDate: '2026-11-02',
      routeId: 1,
      driverId: 3,
      vehicleNumber: 'LES-2489',
      items: [{ productId: 2, loadedPacks: 30, loadedLoose: 0 }], // 180 bottles
    });

    const whStockAfter = engine.getProduct(2).stock_base_units;
    assert.strictEqual(whStockAfter, whStockBefore - 180, 'Warehouse stock should reduce by 180 bottles');
  });

  it('F15-T3: Rejects vehicle dispatch when requested stock exceeds warehouse inventory', () => {
    assert.throws(
      () => engine.dispatchTrip({
        tripCode: 'TRIP-ERR-01',
        tripDate: '2026-11-02',
        routeId: 1,
        driverId: 3,
        vehicleNumber: 'LES-2489',
        items: [{ productId: 4, loadedPacks: 50, loadedLoose: 0 }], // 50 * 12 = 600 > 360 available
      }),
      /Insufficient stock for route load/,
      'Should reject overload exceeding warehouse stock'
    );
  });

  it('F15-T4: Supports multi-SKU loading manifest on single vehicle run', () => {
    const tripId = engine.dispatchTrip({
      tripCode: 'TRIP-202611-03',
      tripDate: '2026-11-02',
      routeId: 2,
      driverId: 3,
      vehicleNumber: 'LXZ-9012',
      items: [
        { productId: 1, loadedPacks: 10, loadedLoose: 0 }, // 240 bottles
        { productId: 2, loadedPacks: 10, loadedLoose: 0 }, // 60 bottles
        { productId: 3, loadedPacks: 5, loadedLoose: 0 },  // 120 cans
      ],
    });

    const loadItems = db.prepare('SELECT * FROM trip_load_items WHERE trip_id = ?').all(tripId);
    assert.strictEqual(loadItems.length, 3, 'Manifest must have 3 distinct SKU lines');
  });

  it('F15-T5: Trip load records exact integer base units for every loaded line item', () => {
    const tripId = engine.dispatchTrip({
      tripCode: 'TRIP-202611-04',
      tripDate: '2026-11-02',
      routeId: 1,
      driverId: 3,
      vehicleNumber: 'LES-2489',
      items: [{ productId: 1, loadedPacks: 2, loadedLoose: 5 }], // 2 * 24 + 5 = 53 bottles
    });

    const loadRow = db.prepare('SELECT total_loaded_base FROM trip_load_items WHERE trip_id = ?').get(tripId);
    assert.strictEqual(loadRow.total_loaded_base, 53, 'Total base loaded must be 53 bottles');
  });
});
