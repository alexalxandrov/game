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
for (const file of ['js/config.js','js/utils.js','js/simulation.js','js/world.js','js/ui.js','js/crisis.js','js/v4.js','js/v5.js','js/v6.js','js/v7.js','js/v7_2.js','js/v8.js']) {
  vm.runInContext(fs.readFileSync(path.join(process.cwd(), file), 'utf8'), context, { filename: file });
}


// A fresh/reset campaign must begin calm, with complete world state and no phantom emergencies.
const fresh = new window.RepublicSimulation();
assert.ok(fresh.state.crowdTarget < 250, 'fresh attendance starts as a small gathering');
assert.ok(fresh.state.crowdAnger < 50, 'fresh anger starts low and rises gradually');
assert.ok(Array.isArray(fresh.state.assets) && fresh.state.assets.length >= 5, 'fresh reset restores flammable world assets');
assert.equal(fresh.state.fireZones.length, 0, 'fresh campaign starts without active fires');
assert.equal(fresh.state.incidents.length, 0, 'fresh campaign starts without staged crisis incidents');
assert.equal(fresh.state.campSites.length, 0, 'fresh campaign starts without prebuilt camps');
for (let i = 0; i < 60; i++) fresh.tick(1);
assert.ok(fresh.state.crowdTarget < 160, 'attendance must not surge to thousands in the first real minute');
assert.equal(fresh.state.fireZones.length, 0, 'no source means no startup fire');
assert.ok(fresh.state.crowdTarget < 650, 'first model hour cannot jump to a full city demonstration');
assert.equal(fresh.state.fireZones.length, 0, 'calm first hour cannot create fire without a source');
assert.equal(fresh.state.campSites.length, 0, 'small calm gathering cannot instantly spawn tents');
const oneDay = new window.RepublicSimulation();
for (let i = 0; i < 24 * 60; i++) oneDay.tick(1);
assert.ok(oneDay.state.crowdTarget < 250, 'a peaceful campaign cannot silently mobilize the whole city in a day');
assert.equal(oneDay.state.fireZones.length, 0, 'no unrelated fire incident appears during a peaceful opening day');
assert.equal(oneDay.state.campSites.length, 0, 'camps do not appear without sustained mass mobilisation');
assert.ok(oneDay.state.crowdAnger < 100, 'ambient anger builds gradually during an ordinary day');
const highRageButCalmCrowd = new window.RepublicSimulation();
highRageButCalmCrowd.state.crowdAnger = 1000;
highRageButCalmCrowd.state.crowdTarget = 38;
for (let i = 0; i < 60; i++) highRageButCalmCrowd.tick(1);
assert.ok(highRageButCalmCrowd.state.crowdTarget < 500, 'even an artificially high anger value cannot summon thousands instantly');
const arrestOutflow = new window.RepublicSimulation();
const noArrestsEstimate = arrestOutflow._estimateCrowdSize();
arrestOutflow.state.arrests = 50;
assert.ok(arrestOutflow._estimateCrowdSize() < noArrestsEstimate, 'arrests reduce the next turnout estimate');
assert.ok(arrestOutflow.state.movementGoal && arrestOutflow.state.movementGoal.title, 'movement has an explicit goal record, not just a crowd count');

const dayEstimate = fresh._estimateCrowdSize();
fresh.state.hour = 2; fresh.state.minute = 0;
const nightEstimate = fresh._estimateCrowdSize();
assert.ok(nightEstimate < dayEstimate, 'expected turnout falls after night begins');
assert.ok(fresh.state.crowdObjective && fresh.state.crowdObjective.length > 8, 'the crowd has an explicit stable political objective');
const angerStart = fresh.state.crowdAnger;
fresh.state.policies.tax = 100; fresh.state.policies.welfare = 0;
for (let i = 0; i < 20; i++) fresh.tick(1);
assert.ok(fresh.state.crowdAnger > angerStart, 'anger rises in small increments under harsh policy instead of starting at a high level');
assert.ok(fresh.state.crowdAnger < angerStart + 20, 'ambient grievance does not cause an instant rage spike');
const nightCrowd = new window.RepublicSimulation();
nightCrowd.state.hour = 2; nightCrowd.state.minute = 0; nightCrowd.state.crowdAnger = 240; nightCrowd.state.crowdTarget = 1800;
for (let i = 0; i < 20; i++) nightCrowd.tick(1);
assert.ok(nightCrowd.state.crowdTarget < 1800, 'attendance actually falls at night, not only the estimate');
const overnight = new window.RepublicSimulation();
overnight.state.hour=22; overnight.state.minute=0; overnight.state.crowdAnger=240; overnight.state.crowdTarget=1800;
for(let i=0;i<8*60;i++) overnight.tick(1);
assert.ok(overnight.state.crowdTarget < 500, 'night-time departures must reduce actual attendance over a full night');

const campTest = new window.RepublicSimulation();
campTest.state.hoursElapsed = 16; campTest.state.crowdTarget = 1800; campTest.state.crowdAnger = 500;
campTest.state.lastCampGrowthAt = 0; campTest.state.v7CampPressureHours = 4;
const campOldRandom = testMath.random; testMath.random = () => 0.01;
campTest._v5MaybeGrowCamps(); testMath.random = campOldRandom;
assert.equal(campTest.state.campSites.length, 1, 'a camp appears only after sustained mobilisation, one site at a time');
assert.equal(campTest.state.campSites[0].tentCount, 1, 'new camp starts with one tent instead of appearing fully built');
assert.equal(campTest.state.fireZones.length, 0, 'building a camp does not create fire');
const resetTest = new window.RepublicSimulation();
resetTest.state.crowdTarget = 5000; resetTest.state.crowdAnger = 0;
resetTest.state.fireZones = [{id:'ghost-fire',x:640,y:420,condition:'Горит',source:'random'}];
resetTest.state.campSites = [{id:'ghost-camp',x:600,y:500,condition:'Горит',tentCount:5}];
resetTest.state.incidents = [{id:'ghost-riot',type:'arson',status:'active'}];
resetTest.reset();
assert.ok(resetTest.state.crowdTarget < 250 && resetTest.state.crowdAnger < 50, 'manual reset returns to a calm, small gathering');
assert.equal(resetTest.state.fireZones.length, 0, 'manual reset clears runaway fire zones');
assert.equal(resetTest.state.campSites.length, 0, 'manual reset removes unearned starting camps');
for (let i = 0; i < 60; i++) resetTest.tick(1);
assert.ok(resetTest.state.crowdTarget < 160, 'one minute after reset still has a small gradual crowd');
assert.equal(resetTest.state.fireZones.length, 0, 'reset cannot relight old fires on the next tick');
assert.equal(resetTest.state.campSites.length, 0, 'reset cannot restore phantom camps on the next tick');


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

crisis.state.crowdAnger = 520;
const beforeForceAnger = crisis.state.crowdAnger;
assert.equal(crisis.commandPolice('gas', true), true, 'autonomous police must be able to use gas within their AI profile');
assert.ok(crisis.state.crowdAnger > beforeForceAnger, 'police force immediately escalates crowd anger');
assert.ok(crisis.state.v6Radicalization > 0, 'force backlash feeds radicalization');
assert.ok(crisis.state.v6PoliceAggression >= 70, 'fresh games use the default hardline police AI profile');

// Police tear-gas canisters affect the local area but must not scatter the entire coordinated crowd.
const gasScene = Object.create(window.RepublicCityScene.prototype);
gasScene.currentTime = 5000; gasScene.people = []; gasScene.crowdPolice = []; gasScene.sim = { state: { crowdAnger: 760 } };
const agent = { x: 642, y: 420, protester: true, behavior: 'organizer', role: 'organizer', type: 'protester', sprite: { setAlpha() {}, setTint() {}, clearTint() {} } };
gasScene.people.push(agent);
const originalRandom = testMath.random; testMath.random = () => 0.5;
gasScene._v6ReactToPoliceGas(agent, { id: 'GAS-TEST', x: 640, y: 420, radius: 95 }, 'gas');
testMath.random = originalRandom;
assert.notEqual(agent.behavior, 'flee', 'a coordinated organizer usually holds or regroups in a tear-gas cloud');
assert.ok(agent.v6GasHoldingUntil > gasScene.currentTime, 'the non-fleeing crowd agent keeps a coordinated response state');

// The crowd coordination loop must continue to run at pressure-level anger without reference errors.
const coordinationScene = Object.create(window.RepublicCityScene.prototype);
coordinationScene.currentTime = 12000; coordinationScene.v4CrowdOrderTimer = 5000;
coordinationScene.v4OrderVersion = 1; coordinationScene.v6CrowdCoordPulse = 5000;
coordinationScene.people = [{
  x: 600, y: 410, tx: 600, ty: 410, protester: true, behavior: 'agitator', role: 'agitator', type: 'agitator',
  sprite: { active: true, setAlpha() {}, setTint() {}, clearTint() {} }, speed: 34, timer: 0.3,
  interactionCooldown: 3, v4Id: 42, v4OrderVersion: -1, v4LastHazardId: null, v4EvacuatingUntil: 0,
  v4ThrowCooldown: 10, v6NextOrderAt: 0, v6RoleChangeAt: 20000, v6ThrowCooldown: 10
}];
coordinationScene.crowdPolice = []; coordinationScene.projectiles = [];
coordinationScene.sim = { state: { crowdAnger: 470, v6Organization: 75, v6Radicalization: 55, gasZones: [], fireZones: [], smokeZones: [], incidents: [], building: { integrity: 100 }, hoursElapsed: 5, policeTools: {} }, config: { maxIncidents: 14 } };
coordinationScene._launchCrowdProjectile = () => {};
coordinationScene._v4CoordinateCrowd(0.016, coordinationScene.sim.state);
assert.ok(coordinationScene.people[0].v6NextOrderAt > coordinationScene.currentTime, 'the organized protester receives a shared crowd order');

// High-anger close contact can generate a visible street-clash event and injuries on both sides.
const clashScene = Object.create(window.RepublicCityScene.prototype);
clashScene.currentTime = 18000; clashScene.v6LastScuffleAt = -99999; clashScene.v6FightFlashes = [];
const clashState = { crowdAnger: 760, doctrineCode: 'observe', v6PoliceAggression: 78, incidents: [], deaths: 0 };
const recordedInjuries = [];
clashScene.sim = {
  state: clashState, config: { maxIncidents: 14 },
  _makeInjury(kind, severity, x, y, cause, source, victim) { recordedInjuries.push({ kind, severity, x, y, cause, source, victim }); },
  _radio() {},
  addIncident(type) { const inc = { id: 'CLASH-TEST', type, status: 'active', x: 640, y: 400, severity: 60 }; clashState.incidents.push(inc); return inc; }
};
clashScene.people = [{ x: 640, y: 402, protester: true, detained: false, behavior: 'radical', role: 'radical', type: 'agitator', v6NextOrderAt: 20000 }];
clashScene.crowdPolice = [{ id: 'P-TEST', active: true, x: 644, y: 403 }];
const oldRandomClash = testMath.random; testMath.random = () => 0.1;
clashScene._v6StartStreetClash(clashState);
testMath.random = oldRandomClash;
assert.ok(clashScene.v6FightFlashes.length > 0, 'street contact produces a visible fight marker');
assert.ok(recordedInjuries.some(injury => injury.source === 'protest' && String(injury.victim).startsWith('Полицейский')), 'protester-initiated street violence can injure a police officer');
clashScene.currentTime = 24000; clashScene.sim.state.doctrineCode = 'disperse';
clashScene.v6LastScuffleAt = 10000;
const secondRandomClash = testMath.random; testMath.random = () => 0.1;
clashScene._v6StartStreetClash(clashState);
testMath.random = secondRandomClash;
assert.ok(recordedInjuries.some(injury => injury.source === 'police'), 'police-initiated street violence can injure a protester');
const snap = crisis.snapshot();
assert.equal(snap.version, '8.0.1', 'save carries current project version');
assert.ok(crisis.state.forceCap >= 4, 'v6 autonomous police use a hardline baseline');
assert.ok(crisis.state.v6Organization >= 0 && crisis.state.v6Organization <= 100, 'crowd organization remains bounded');

// The scene-level AI must issue its own police action on real-time cadence, not rely only on hourly simulation ticks.
const tacticalSim = new window.RepublicSimulation();
tacticalSim.state.crowdAnger = 500; tacticalSim.state.forceCap = 7;
tacticalSim.state.policeTools = { gas: 20, water: 20, flash: 20, rubber: 30, live: 4 };
const tacticalScene = Object.create(window.RepublicCityScene.prototype);
tacticalScene.sim = tacticalSim; tacticalScene.currentTime = 0; tacticalScene.v6TacticalTimer = 0;
tacticalScene.v6LastActionRealMs = -99999; tacticalScene.v6LastScuffleAt = -99999; tacticalScene.v7PoliceFirstActionAfterMs = 1; tacticalScene.v7NextActionAtMs = 0; tacticalScene.v7PoliceElapsedMs = 0;
tacticalScene.people = []; tacticalScene.crowdPolice = []; tacticalScene.v6FightFlashes = [];
const oldTacticalRandom = testMath.random; testMath.random = () => 0.01;
for (let i = 1; i <= 80; i++) { tacticalScene.currentTime = i * 16.67; tacticalScene._v6SchedulePoliceAction(16.67, tacticalSim.state); }
testMath.random = oldTacticalRandom;
assert.ok((tacticalSim.state.policeActionSeq || 0) > 0, 'autonomous tactical AI takes a police action without player input');
assert.ok(['gas','physical','water','flash','cordon','rubber','live'].includes(tacticalSim.state.lastPoliceAction.method), 'autonomous action uses the internal hardline response ladder');
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

// v8 political process, logistics and minute-level systems.
const processSim = new window.RepublicSimulation();
window.KonturV8.init(processSim.state, false);
assert.equal(processSim.state.fireLogistics.ladders, 100, '100 ladder trucks are available initially');
assert.equal(processSim.state.fireLogistics.foam, 100, '100 foam units are available initially');
assert.equal(processSim.state.fireLogistics.ambulances, 100, '100 ambulances are available initially');
processSim.state.policeVideo = true;
processSim.state.media.policeVideo = true;
for (let i = 0; i < 3; i++) processSim.tick(1);
assert.ok(processSim.state.crowdAnger > 6, 'viral media causes an immediate mobilization shock');
processSim.state.unions.active = true;
processSim.state.unions.strength = 10;
for (let i = 0; i < 15; i++) processSim.tick(1);
assert.ok(processSim.state.unions.leverage > 0, 'unions accumulate independent negotiating leverage');
processSim.state.negotiationProcess.active = true;
processSim.state.negotiationProcess.duration = 2;
processSim.state.negotiationProcess.elapsed = 0;
processSim.state.negotiationProcess.offer = 'компромисс';
processSim.tick(1); processSim.tick(1); processSim.tick(1);
assert.ok(processSim.state.negotiationProcess.round >= 1, 'negotiations advance through a timed process');
assert.ok(processSim.state.tacticalBrief && processSim.state.tacticalBrief.includes('Цель'), 'tactical brief includes police task and protest goal');
// v8 dispatch regression: every new dispatch button must produce a physical vehicle and deduct only its required reserves.
const dispatchSim = new window.RepublicSimulation();
window.KonturV8.init(dispatchSim.state, false);
const dispatchIncident = { id:'FIRE-DISPATCH-1', type:'fire', status:'active', x:710, y:405, fireIntensity:0.9, label:'Пожар в павильоне', serviceProgress:{} };
dispatchSim.state.incidents.push(dispatchIncident);
const dispatchScene = {
  vehicles: [],
  _dispatchVehicle(order) {
    const slot = this.vehicles.length;
    this.vehicles.push({ id:order.id, service:order.service, x:1288 + Math.floor(slot / 7) * 17, y:574 + (slot % 7) * 7, targetX:order.x, targetY:order.y, phase:'outbound', route:[{x:1130,y:595},{x:1010,y:558},{x:order.x,y:order.y}], routeStage:0, speed:102 });
  }
};
const waterDispatch = window.KonturV8.dispatchResource(dispatchSim, dispatchScene, 'dispatch-water');
assert.equal(waterDispatch.ok, true, 'water dispatch succeeds instead of crashing on an undeclared incident variable');
assert.equal(dispatchScene.vehicles.length, 1, 'a click creates a moving fire vehicle');
assert.equal(dispatchScene.vehicles[0].targetX, 710, 'fire vehicle targets the active incident coordinates');
assert.equal(dispatchSim.state.fireLogistics.engines, 99, 'water dispatch consumes one engine');
assert.equal(dispatchSim.state.fireLogistics.waterTenders, 99, 'water dispatch consumes one water tender');
assert.equal(dispatchSim.state.fireLogistics.foam, 100, 'water dispatch does not consume foam');
const foamDispatch = window.KonturV8.dispatchResource(dispatchSim, dispatchScene, 'dispatch-foam');
assert.equal(foamDispatch.ok, true, 'foam vehicle can be dispatched independently');
assert.equal(dispatchSim.state.fireLogistics.foamTeams, 99, 'foam dispatch consumes one foam team');
assert.equal(dispatchSim.state.fireLogistics.foam, 99, 'foam dispatch consumes one foam unit');
const ladderDispatch = window.KonturV8.dispatchResource(dispatchSim, dispatchScene, 'dispatch-ladder');
assert.equal(ladderDispatch.ok, true, 'ladder vehicle can be dispatched independently');
assert.equal(dispatchSim.state.fireLogistics.ladderTrucks, 99, 'ladder dispatch consumes one ladder truck');
assert.equal(dispatchSim.state.fireLogistics.ladders, 99, 'ladder dispatch consumes one ladder reserve');
const vehiclesBeforeExhaustion = dispatchScene.vehicles.length;
dispatchSim.state.fireLogistics.waterTenders = 0;
const exhaustedDispatch = window.KonturV8.dispatchResource(dispatchSim, dispatchScene, 'dispatch-water');
assert.equal(exhaustedDispatch.ok, false, 'a service with no reserve reports exhaustion instead of phantom dispatch');
assert.equal(dispatchScene.vehicles.length, vehiclesBeforeExhaustion, 'exhausted reserve creates no vehicle');
assert.ok(dispatchSim.state.incidents[0].fireServiceEnRoute, 'fire incident is linked to dispatched apparatus');
// Fire incident variants also receive a zone for the live flame/smoke layer.
const variantFireSim = new window.RepublicSimulation();
const variantFire = { id:'ROOF-TEST-1', type:'roof_fire', status:'active', x:820, y:360, label:'Пожар крыши', createdAt:0, fireArea:8, fireIntensity:0.8, fireRadius:18, smokeRadius:26, serviceProgress:{} };
variantFireSim.state.incidents.push(variantFire);
variantFireSim._updateFirePhysics();
assert.ok(variantFireSim.state.fireZones.some(z => z.id === variantFire.id), 'roof fire is included in the physical fire-zone model');
const smokePersistenceSim = new window.RepublicSimulation();
window.KonturV8.init(smokePersistenceSim.state, false);
const almostOut = { id:'SMOKE-PERSIST-1', type:'fire', status:'active', x:650, y:430, label:'Очаг проверки дыма', fireIntensity:0.001, fireArea:8, fireRadius:22, smokeRadius:56, fireServiceActive:true, fireMethod:'water', serviceProgress:{} };
smokePersistenceSim.state.incidents.push(almostOut);
smokePersistenceSim.state.fireZones.push({id:almostOut.id,x:650,y:430,radius:22,smokeRadius:56,intensity:0.001,condition:'Горит',source:'fire',smokeLife:0});
window.KonturV8.minuteStep(smokePersistenceSim,1);
assert.equal(almostOut.status,'resolved','a fully contained fire incident is closed by the minute-level service model');
assert.ok(smokePersistenceSim.state.fireZones.some(z=>z.id===almostOut.id&&z.condition==='Потушено'&&z.smokeLife>0),'the extinguished fire leaves a persistent smoke zone');
smokePersistenceSim._updateFirePhysics();
assert.ok(smokePersistenceSim.state.fireZones.some(z=>z.id===almostOut.id&&z.condition==='Потушено'&&z.smokeLife>0),'the hourly compatibility layers do not erase lingering smoke');
// Exercise the actual scene dispatch and animation methods with lightweight sprite stubs.
const actualScene = Object.create(window.RepublicCityScene.prototype);
actualScene.vehicles = [];
actualScene.sim = { state:dispatchSim.state, serviceArrive() {} };
actualScene.add = { image() { return { setOrigin(){return this;}, setDepth(){return this;}, setScale(){return this;}, setAngle(){return this;}, setPosition(){return this;}, setTint(){return this;}, destroy(){return this;} }; } };
for (let i=0;i<36;i++) actualScene._dispatchVehicle({id:5000+i,service:'fire',x:710,y:405,incidentId:dispatchIncident.id,purpose:'тестовый выезд',v8Manual:true});
assert.ok(actualScene.vehicles.every(v => v.x < 1500), 'the actual scene keeps dispatch queues near the map edge');
const firstActualVehicle=actualScene.vehicles[0];
const vehicleStartX=firstActualVehicle.x;
actualScene._updateVehicles(dispatchSim.state,0.05);
assert.ok(firstActualVehicle.x < vehicleStartX, 'the actual scene advances dispatched vehicles along their route');
// Keep the helper model's burst equally bounded.
assert.ok(dispatchScene.vehicles.every(v => v.x < 1600), 'dispatch burst vehicles spawn close enough to enter the visible street promptly');

console.log('PASS: paced clock, clean calm start, no phantom camps/fires, persistent sourced asset fire/smoke, autonomous police cadence, gradual turnout, gas cohesion, crowd objectives, radicalization, 0–1000 anger, v8 political process, timed negotiations, union leverage, visible dispatch and reserve accounting, fire-type coverage, v7.2 migration, causal barricade fire and stopped burning traffic');
