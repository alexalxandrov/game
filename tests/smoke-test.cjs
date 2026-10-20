'use strict';
// Dependency-free model smoke test. Run from the project root with: node tests/smoke-test.cjs
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const document = {
  addEventListener() {},
  querySelectorAll() { return []; },
  querySelector() { return null; },
  getElementById() { return null; }
};
const window = { addEventListener() {} };
class PhaserScene { constructor() {} }
const Phaser = { Scene: PhaserScene, Scale: { FIT: 1, CENTER_BOTH: 1 }, AUTO: 1 };
// Seed randomness so an automated smoke test remains reproducible.
const testMath = Object.create(Math);
let seed = 0x4b4f4e54;
testMath.random = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
};
const context = {
  window, document, console, Math: testMath, Date, JSON, Number, String, Array, Object,
  Boolean, Set, Map, Infinity, parseInt, parseFloat, Phaser, localStorage: {
    getItem() { return null; }, setItem() {}
  }, setInterval() {}, clearInterval() {}
};
window.Phaser = Phaser;
vm.createContext(context);
for (const file of ['js/config.js','js/utils.js','js/simulation.js','js/world.js','js/ui.js','js/crisis.js','js/v4.js','js/v5.js']) {
  vm.runInContext(fs.readFileSync(path.join(process.cwd(), file), 'utf8'), context, { filename: file });
}

const sim = new window.RepublicSimulation();
assert.equal(sim.config.minutesPerTick, 1, 'configuration must model one minute per tick');
sim.tick(1);
assert.equal(sim.state.minute, 1, 'one simulation tick must advance exactly one model minute at 1x');
assert.ok(sim.state.hoursElapsed >= 1 / 60, 'elapsed game time should advance');

// A calm scene must not set the encampments on fire in the absence of a source.
for (let i = 0; i < 5 * 60; i++) sim.tick(1);
assert.ok(!sim.state.campSites.some(c => c.condition === 'Горит' || c.condition === 'Тлеет'), 'camp fire must have a source');

// An explicit hit must create a source and keep its flame/smoke zone after a physics step.
const fireSim = new window.RepublicSimulation();
const asset = fireSim.state.assets.find(a => a.kind !== 'building' && Number(a.integrity || 0) > 40);
assert.ok(asset, 'the map needs a flammable asset');
fireSim._v5IgniteAsset(asset, 'тест: явное попадание зажигательного игрового токена');
assert.equal(asset.condition, 'Горит');
assert.ok(fireSim.state.fireZones.some(z => z.source === 'asset' && z.sourceAssetId === asset.id), 'asset fire/smoke zone must appear immediately');
fireSim._updateFirePhysics();
assert.equal(asset.condition, 'Горит', 'burning state persists through hourly fire update');
assert.ok(fireSim.state.fireZones.some(z => z.source === 'asset' && z.sourceAssetId === asset.id), 'fire/smoke zone persists after physics update');

// High-risk situation prompts fully autonomous police decisions and remains endless.
const crisis = new window.RepublicSimulation();
crisis.state.crowdAnger = 1000;
crisis.state.publicAnger = 100;
crisis.state.crowdTarget = 5000;
crisis.state.policeTools = { gas: 20, water: 20, flash: 20, rubber: 30, live: 4 };
crisis.state.forceCap = 7;
const assault = crisis.addIncident('building_assault');
if (assault) { assault.x = 640; assault.y = 310; assault.severity = 90; }
for (let i = 0; i < 6 * 60; i++) crisis.tick(1);
assert.ok((crisis.state.policeActionSeq || 0) > 0, 'police AI must take a tactical action');
assert.ok(crisis.state.crowdAnger >= 0 && crisis.state.crowdAnger <= 1000, 'crowd anger stays within 0–1000');
assert.ok(crisis.state.cityPopulation === 5000, 'large crowds are modelled independently of visible-agent count');

const snap = crisis.snapshot();
assert.equal(snap.version, '5.2.0', 'save carries current project version');
const reloaded = new window.RepublicSimulation();
reloaded.loadSnapshot(snap);
assert.equal(reloaded.state.cityPopulation, 5000);
assert.ok(Array.isArray(reloaded.state.campSites));

const barrier = reloaded._createBarricade(500, 555, 'protest');
assert.ok(barrier && !barrier.burning, 'new barricade is not spontaneously burning');
reloaded._v5IgniteBarricade(barrier, 'тест: источник открытого огня');
assert.ok(barrier.burning && barrier.ignitionCause, 'explicit cause ignites a barricade');
assert.ok(reloaded.state.fireZones.some(z => z.id === barrier.fireZoneId), 'burning barricade creates a visible fire zone');

// A burning vehicle must remain stopped in the traffic integrator, creating a physical queue obstacle.
const testScene = Object.create(window.RepublicCityScene.prototype);
const carSprite = {
  active: true,
  setPosition(x, y) { this.x = x; this.y = y; return this; },
  setDepth() { return this; }, setAlpha() { return this; }, setTint() { return this; }
};
testScene.trafficCars = [{ x: 640, y: 552, direction: 1, lane: 0, speed: 48, baseSpeed: 48, condition: 'Горит', driverState: 'покидает машину', fireAge: 0, smoke: 1, vehicleRecordId: 'BURNING-CAR', sprite: carSprite }];
testScene.vehicles = []; testScene.lastTrafficSpawn = 0;
testScene.sim = { state: { roadBlockage: 0.6, activeStrikes: 0, tension: 0, incidents: [], roadVehicles: [], serviceFleet: [], fireZones: [] }, _radio() {}, _publishCrisisEvent() {}, _makeInjury() {} };
const stoppedX = testScene.trafficCars[0].x;
testScene._updateTraffic(0.05, testScene.sim.state);
assert.equal(testScene.trafficCars[0].x, stoppedX, 'burning vehicle remains fixed in the road');
assert.equal(testScene.trafficCars[0].speed, 0, 'burning vehicle speed is zero');

console.log('PASS: clock, calm camps, persistent asset fire/smoke, autonomous police, 0–1000 anger, save/load, causal barricade fire and stopped burning traffic');
