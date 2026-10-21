'use strict';
// Regression tests for v11 modal repair, consistent save slots and stateful political/protest actions.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const storage=new Map();
const document={readyState:'complete',body:null,addEventListener(){},querySelectorAll(){return[]},querySelector(){return null},getElementById(){return null}};
const window={addEventListener(){}};
class PhaserScene{constructor(){}}
const Phaser={Scene:PhaserScene,Scale:{FIT:1,CENTER_BOTH:1},AUTO:1,Game:class{}};
const testMath=Object.create(Math);let seed=12751;testMath.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const localStorage={getItem(k){return storage.get(k)||null;},setItem(k,v){storage.set(k,String(v));},removeItem(k){storage.delete(k);}};
const context={window,document,console,Math:testMath,Date,JSON,Number,String,Array,Object,Boolean,Set,Map,Infinity,parseInt,parseFloat,Phaser,localStorage,setInterval(){},clearInterval(){},setTimeout(){return 1;},clearTimeout(){}};
window.Phaser=Phaser;window.GAME_CONFIG={version:'10.0.0'};vm.createContext(context);
for(const file of ['js/config.js','js/utils.js','js/simulation.js','js/world.js','js/ui.js','js/crisis.js','js/v4.js','js/v5.js','js/v6.js','js/v7.js','js/v7_2.js','js/v8.js','js/v9.js','js/v10.js','js/v11.js'])vm.runInContext(fs.readFileSync(path.join(process.cwd(),file),'utf8'),context,{filename:file});
assert.equal(window.GAME_CONFIG.version,'11.0.0','v11 is the authoritative version');
const sim=new window.RepublicSimulation();window.gameSimulation=sim;window.KonturV10.ensureState(sim.state);
const t=window.KonturV9.createTrack(sim,{party:'Работники и профсоюзы',topic:'Трудовые требования',demand:'индексация зарплаты на 7% с ретроактивной выплатой'});
const mandate=sim.state.v9Decisions.find(d=>d.trackId===t.id&&d.type==='mandate');
window.KonturV9.resolveDecision(sim,mandate.id,'direct');
sim.state.hour=8;sim.state.minute=30;window.KonturV9.advanceTracks(sim,510);
const agenda=sim.state.v9Decisions.find(d=>d.trackId===t.id&&d.type==='agenda');
assert.ok(agenda,'agenda decision exists');
agenda.title='';agenda.choices=[];
window.KonturV11.repairDecisionData(sim,agenda);
assert.ok(agenda.title.includes('Индексация'),'a missing modal heading is repaired from the issue-specific agenda');
assert.ok(agenda.choices.length>=4,'a decision with missing options restores the topic-specific option set');
assert.ok(agenda.choices.some(c=>c[1].includes('7%')),'restored options preserve the specific negotiated terms');
assert.equal(agenda.defaultChoice,'delay','an existing valid default is retained when present in the repaired options');
// Missing choices on an unrelated saved decision have a visible and deterministic fallback.
const damaged={type:'politics',title:'Бюджет',defaultChoice:'briefing',choices:[],timeout:120};
window.KonturV11.repairDecisionData(sim,damaged);
assert.ok(damaged.choices.length>=2,'generic damaged decisions still receive visible fallback choices');
assert.ok(damaged.choices.some(c=>c[0]==='briefing'),'the fallback keeps the saved default choice code');
// Cabinet policy is a real decision and carries numerical consequences.
const policy=window.KonturV11.queuePolicy(sim,'police-review');
assert.equal(policy.type,'v11-police-review','police oversight opens a mandatory modal decision');
const oldTrust=sim.state.trust,oldAnger=sim.state.crowdAnger;
window.KonturV11.resolveV11Decision(sim,policy,'independent',false);
assert.equal(sim.state.v11PoliceOversight.level,3,'independent oversight has an explicit level');
assert.ok(sim.state.v11PoliceOversight.until>0,'oversight has a time-bounded mandate');
assert.ok(sim.state.trust>oldTrust,'independent oversight improves trust');
assert.ok(sim.state.crowdAnger<oldAnger,'independent oversight reduces public anger');
// Protest assembly choices produce different state transitions.
const assemble=window.KonturV11.queuePolicy(sim,'assembly-vote');
const oldOrganization=sim.state.v6Organization||0;
window.KonturV11.resolveV11Decision(sim,assemble,'peaceful',false);
assert.equal(sim.state.v10Crowd.mandate,'peaceful','the vote is persisted as a crowd mandate');
assert.ok(sim.state.v6Organization>oldOrganization,'a peaceful vote improves collective organization');
sim.state.v11SitInUntil=0;sim._refreshDerived();const oldBlockage=sim.state.roadBlockage;
const sitin=window.KonturV11.queuePolicy(sim,'assembly-vote');
window.KonturV11.resolveV11Decision(sim,sitin,'sit-in',false);
assert.ok(sim.state.v11SitInUntil>0,'a sit-in records an active duration');
assert.ok(sim.state.roadBlockage>oldBlockage,'a sit-in changes derived road blockage rather than only writing a news item');
// A liaison, observers and medical support are modeled as active timed variables.
const liaison=window.KonturV11.queuePolicy(sim,'police-liaison');window.KonturV11.resolveV11Decision(sim,liaison,'liaison',false);
assert.ok(sim.state.v11PoliceLiaisonUntil>0,'liaison mandate is set');
const support=window.KonturV11.queuePolicy(sim,'legal-medical');window.KonturV11.resolveV11Decision(sim,support,'both',false);
assert.ok(sim.state.v11SupportUntil>0&&sim.state.v11MedicalAidActive,'medical/legal support has a timed active effect');
assert.ok(sim.state.emergencyCorridor,'support activates an emergency corridor');
// Save/load now share a consistent v11 key and import v10/v9 slots explicitly.
const dashboard=Object.create(window.RepublicDashboardUI.prototype);dashboard.sim=sim;dashboard.toast=()=>{};dashboard._syncPolicyInputs=()=>{};dashboard.renderAll=()=>{};dashboard.draft={};
assert.equal(dashboard.saveGame(true),true,'v11 save can be written');
assert.ok(storage.has('kontur-republic-save-v11'),'v11 writes to the authoritative save slot');
const oldRaw=JSON.stringify(sim.snapshot());storage.set('kontur-republic-save-v10',oldRaw);storage.delete('kontur-republic-save-v11');
assert.equal(dashboard.loadGame(),true,'v10 save is imported');
assert.ok(storage.has('kontur-republic-save-v11'),'import creates a v11 save');
assert.equal(storage.get('kontur-republic-save-v10'),oldRaw,'source save is preserved without mutation');
// Repeated media actions are rate-limited independently, not globally.
const first=window.KonturV10.executeCivicAction(sim,'viral');
const angerAfterFirst=sim.state.crowdAnger;
const second=window.KonturV10.executeCivicAction(sim,'viral');
assert.equal(first,true,'first viral call is accepted');
assert.equal(second,false,'same call cannot be spammed inside its cooldown');
assert.equal(sim.state.crowdAnger,angerAfterFirst,'blocked call has no repeated state effect');
console.log('PASS: v11 modal-data repair, issue-specific choices, authoritative save key and v10 import, independent police oversight, protest assembly outcomes, timed liaison/medical support, and anti-spam action cooldowns');
