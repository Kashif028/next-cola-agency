/**
 * Tier 2: F15 - Delivery Route & Vehicle Stock Issuance (Boundary & Corner Cases)
 */

const { describe, it, beforeEach, assert } = require('../framework/harness.js');
const { createDatabase } = require('../framework/db.js');
const { seedDatabase } = require('../fixtures/seed_data.js');
const { DomainEngine } = require('../framework/domain_engine.js');

describe('Tier 2: F15 - Route Dispatch Boundary & Corner Cases', () => {
  let db;
  let engine;

  beforeEach(() => {
    db = createDatabase();
    seedDatabase(db);
    engine = new DomainEngine(db);
  });

  it('F15-B1: Dispatches vehicle with minimum quantity (exactly 1 loose bottle)', () => {
    const tripId = engine.dispatchTrip({
      tripCode: 'TRIP-B15-1',
      tripDate: '2026-11-02',
      routeId: 1,
      driverId: 3,
      vehicleNumber: 'LES-2489',
      items: [{ productId: 1, loadedPacks: 0, loadedLoose: 1 }],
    });

    const item = db.prepare('SELECT total_loaded_base FROM trip_load_items WHERE trip_id = ?').get(tripId);
    assert.strictEqual(item.total_loaded_base, 1);
  });

  it('F15-B2: Dispatches vehicle taking exactly 100% of warehouse stock of an SKU', () => {
    // Product 4 has 360 base units (30 packs)
    const tripId = engine.dispatchTrip({
      tripCode: 'TRIP-B15-2',
      tripDate: '2026-11-02',
      routeId: 1,
      driverId: 3,
      vehicleNumber: 'LES-2489',
      items: [{ productId: 4, loadedPacks: 30, loadedLoose: 0 }],
    });

    assert.strictEqual(engine.getProduct(4).stock_base_units, 0, 'Warehouse stock must drop to exactly 0');
  });

  it('F15-B3: Multiple simultaneous vehicle dispatches on same date to different beats', () => {
    const t1 = engine.dispatchTrip({
      tripCode: 'TRIP-BEAT-1',
      tripDate: '2026-11-02',
      routeId: 1,
      driverId: 3,
      vehicleNumber: 'LES-2489',
      items: [{ productId: 2, loadedPacks: 10, loadedLoose: 0 }],
    });

    const t2 = engine.dispatchTrip({
      tripCode: 'TRIP-BEAT-2',
      tripDate: '2026-11-02',
      routeId: 2,
      driverId: 3,
      vehicleNumber: 'LXZ-9012',
      items: [{ productId: 2, loadedPacks: 10, loadedLoose: 0 }],
    });

    assert.ok(t1 > 0);
    assert.ok(t2 > t1);
  });

  it('F15-B4: Trip load records vehicle registration number preserving exact alphanumeric string', () => {
    const tripId = engine.dispatchTrip({
      tripCode: 'TRIP-REG-01',
      tripDate: '2026-11-02',
      routeId: 3,
      driverId: 3,
      vehicleNumber: 'MN-1234-A',
      items: [{ productId: 3, loadedPacks: 5, loadedLoose: 0 }],
    });

    const trip = db.prepare('SELECT vehicle_number FROM delivery_trips WHERE id = ?').get(tripId);
    assert.strictEqual(trip.vehicle_number, 'MN-1234-A');
  });

  it('F15-B5: Rejects dispatching vehicle with negative pack quantity', () => {
    assert.throws(
      () => engine.dispatchTrip({
        tripCode: 'TRIP-ERR-NEG',
        tripDate: '2026-11-02',
        routeId: 1,
        driverId: 3,
        vehicleNumber: 'LES-2489',
        items: [{ productId: 2, loadedPacks: -5, loadedLoose: 0 }],
      }),
      /cannot be negative/
    );
  });
});
