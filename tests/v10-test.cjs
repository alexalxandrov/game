'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const document={addEventListener(){},querySelectorAll(){return[]},querySelector(){return null},getElementById(){return null}};
const window={addEventListener(){},setTimeout(){}};
class PhaserScene{constructor(){}}
const Phaser={Scene:PhaserScene,Scale:{FIT:1,CENTER_BOTH:1},AUTO:1};
const testMath=Object.create(Math);let seed=1009;testMath.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const storage=new Map();
const context={window,document,console,Math:testMath,Date,JSON,Number,String,Array,Object,Boolean,Set,Map,Infinity,parseInt,parseFloat,Phaser,localStorage:{getItem(k){return storage.has(k)?storage.get(k):null},setItem(k,v){storage.set(k,String(v))}},setInterval(){},clearInterval(){},setTimeout(){}};
window.Phaser=Phaser;vm.createContext(context);
for(const file of ['js/config.js','js/utils.js','js/simulation.js','js/world.js','js/ui.js','js/crisis.js','js/v4.js','js/v5.js','js/v6.js','js/v7.js','js/v7_2.js','js/v8.js','js/v9.js','js/v10.js'])vm.runInContext(fs.readFileSync(path.join(process.cwd(),file),'utf8'),context,{filename:file});
assert.equal(window.GAME_CONFIG.version,'10.0.0','v10 version owns the app');
const sim=new window.RepublicSimulation();window.gameSimulation=sim;window.KonturV10.ensureState(sim.state);
const t=window.KonturV9.createTrack(sim,{party:'Профсоюзная коалиция',topic:'Трудовые требования и индексация',demand:'индексация зарплат на 7% с ретроактивной выплатой',format:'mediated'});
const mandate=sim.state.v9Decisions.find(d=>d.trackId===t.id&&d.type==='mandate');
window.KonturV9.resolveDecision(sim,mandate.id,'mediator');
assert.equal(t.duration,1080,'mediated track duration remains 18 game hours');
assert.equal(t.agenda.length,5,'track has five points');
assert.match(t.agenda[0],/7% с обратной датой|7% с ретроактивной выплатой/i,'labour agenda is concrete, not a generic question');
assert.ok(t.agendaOptions[0].some(c=>/7% с ретроактивной выплатой/i.test(c[1])),'the first labor question has specific answer options');
assert.ok(t.agendaOptions[1].some(c=>/увольнен/i.test(c[1])),'agenda options vary by question');
// Pending agreement obligations do not become binding before ratification.
sim.state.promises=[{id:900,title:'provisional',status:'provisional',negotiationId:t.id,targetKey:'welfare'}];
t.acceptedTopics.push(t.agenda[0],t.agenda[1],t.agenda[2]);t.partialTopics.push(t.agenda[3]);t.rejectedTopics.push(t.agenda[4]);t.stage='agenda';t.agendaIndex=t.agenda.length;t.endAt=100;
window.KonturV10.queueRatification(sim,t);
const ratify=sim.state.v9Decisions.find(d=>d.type==='v10-ratification'&&d.trackId===t.id);
assert.ok(ratify,'complete agreement receives a separate ratification stage');
window.KonturV10.resolveCustomDecision(sim,ratify.id,'vote');
assert.ok(t.closed,'ratification finalizes the track');
assert.ok(sim.state.negotiationArchive.some(x=>x.id===t.id),'completed track moves into archive');
assert.ok(!sim.state.negotiationTracks.some(x=>x.id===t.id),'completed track is removed from the active lines');
assert.equal(sim.state.promises.find(p=>p.negotiationId===t.id).status,'pending','ratified obligations become active');
const archivedCount=sim.state.negotiationArchive.length;
window.KonturV10.deleteArchiveEntry(sim.state,t.id);
assert.equal(sim.state.negotiationArchive.length,archivedCount-1,'individual archive deletion removes transcript entry');
// Press, crowd stewards and social-media actions have stateful effects.
const previousSurge=sim.state.mobilizationSurge||0;
window.KonturV10.executeCivicAction(sim,'press');
assert.equal(sim.state.v10Media.pressTeams,2,'press deployment persists during its assignment');
window.KonturV10.executeCivicAction(sim,'stewards');
assert.equal(sim.state.v10Crowd.stewards,4,'crowd stewards have a timed assignment');
window.KonturV10.executeCivicAction(sim,'viral');
assert.ok(sim.state.mobilizationSurge>previousSurge,'viral call creates an actual mobilisation impulse');
// Elections produce seats, then a real coalition-formation decision.
sim.state.v10ElectionCycle={phase:'campaign',electionsCalledAt:0,electionAt:0,history:[]};
window.KonturV10.conductElection(sim);
assert.equal(sim.state.v10ElectionCycle.phase,'coalition','election result triggers coalition bargaining');
assert.equal(Object.values(sim.state.v10Parliament.seats).reduce((a,b)=>a+b,0),200,'seat distribution preserves a 200-seat parliament');
assert.ok(sim.state.v9Decisions.some(d=>d.type==='v10-election-coalition'),'post-election coalition decision is created');
// A tied referendum is associated with the negotiation track and finalized on result.
const t2=window.KonturV9.createTrack(sim,{party:'Парламентская оппозиция',topic:'Выборы и закон о парламенте',demand:'изменить дату выборов и правила подсчёта'});
const mandate2=sim.state.v9Decisions.find(d=>d.trackId===t2.id&&d.type==='mandate');window.KonturV9.resolveDecision(sim,mandate2.id,'direct');
t2.acceptedTopics.push(t2.agenda[0]);t2.stage='ratification';t2.ratificationQueued=true;
const rd={type:'v10-ratification',trackId:t2.id,payload:{trackId:t2.id}};sim.state.v9Decisions.push({...rd,id:'TEST-REF',status:'queued',choices:[],timeout:100,defaultChoice:'referendum'});
window.KonturV10.resolveCustomDecision(sim,'TEST-REF','referendum');
assert.equal(t2.stage,'referendum','referendum ratification waits for voters');
assert.equal(sim.state.referendum.v10NegotiationId,t2.id,'referendum is linked to the exact agreement');
sim.state.referendum.status='passed';sim.state.referendum.turnout=63;sim.state.referendum.support=54;sim._updateReferendum();
assert.ok(t2.closed,'referendum result finalizes negotiation');
assert.equal(t2.result.outcome,'Соглашение ратифицировано референдумом','referendum outcome is explicitly recorded');
// Package-linked obligations must be fulfilled in order, even after their transcript is archived.
const tp=window.KonturV9.createTrack(sim,{party:'Работники транспорта',topic:'Бюджет транспорта',demand:'этапное финансирование маршрутов'});
const mp=sim.state.v9Decisions.find(d=>d.trackId===tp.id&&d.type==='mandate');window.KonturV9.resolveDecision(sim,mp.id,'direct');
tp.packageOffer={condition:'следующий транш после независимой проверки'};tp.obligations=[9101,9102,9103];
sim.state.promises.push(
  {id:9101,title:'Этап 1',status:'pending',negotiationId:tp.id,packageCondition:tp.packageOffer.condition,packageSequence:0,targetKey:'welfare',cost:0.001},
  {id:9102,title:'Этап 2',status:'pending',negotiationId:tp.id,packageCondition:tp.packageOffer.condition,packageSequence:1,targetKey:'welfare',cost:0.001},
  {id:9103,title:'Этап 3',status:'pending',negotiationId:tp.id,packageCondition:tp.packageOffer.condition,packageSequence:2,targetKey:'welfare',cost:0.001}
);
// Even deleting the archived protocol must not erase dependency metadata from the obligations.
sim.state.negotiationTracks=sim.state.negotiationTracks.filter(x=>x.id!==tp.id);
sim.state.negotiationArchive=sim.state.negotiationArchive.filter(x=>x.id!==tp.id);
assert.equal(sim.fulfillPromise(9102),false,'a dependent package obligation cannot skip its prior phase even after protocol deletion');
assert.equal(sim.state.promises.find(p=>p.id===9102).status,'pending','blocked package obligation remains pending');
assert.equal(sim.fulfillPromise(9101),true,'the first package phase can be fulfilled');
assert.equal(sim.fulfillPromise(9102),true,'the second phase becomes available after the first is fulfilled');
assert.equal(sim.fulfillPromise(9103),true,'the final phase follows in order');
// Counteroffers can go through a mediator; rejecting one can progress to an actual walkout.
const t3=window.KonturV9.createTrack(sim,{party:'Городское движение',topic:'Площадь и публичные гарантии',demand:'открытая публикация приказов и условия окончания акции'});
const m3=sim.state.v9Decisions.find(d=>d.trackId===t3.id&&d.type==='mandate');window.KonturV9.resolveDecision(sim,m3.id,'direct');
window.KonturV10.queueCounteroffer(sim,t3,'публикация приказов');
const co=sim.state.v9Decisions.find(d=>d.type==='v10-counteroffer'&&d.trackId===t3.id&&['queued','pending'].includes(d.status));
assert.ok(co,'rejection can produce a first-class counteroffer decision');
window.KonturV10.resolveCustomDecision(sim,co.id,'shuttle');
assert.equal(t3.mediatorRounds,1,'shuttle diplomacy runs a recorded mediator round');
assert.equal(t3.stage,'agenda','mediation resumes the track after a pause');
const t4=window.KonturV9.createTrack(sim,{party:'Коалиция протеста',topic:'Правила публичного собрания',demand:'публиковать условия разрешения и гарантии участников'});
const m4=sim.state.v9Decisions.find(d=>d.trackId===t4.id&&d.type==='mandate');window.KonturV9.resolveDecision(sim,m4.id,'direct');
window.KonturV10.queueCounteroffer(sim,t4,'гарантии участников');
const co4=sim.state.v9Decisions.find(d=>d.type==='v10-counteroffer'&&d.trackId===t4.id&&['queued','pending'].includes(d.status));
window.KonturV10.resolveCustomDecision(sim,co4.id,'reject');
const ult=sim.state.v9Decisions.find(d=>d.type==='v10-ultimatum'&&d.trackId===t4.id&&['queued','pending'].includes(d.status));
assert.ok(ult,'rejected counteroffer raises a time-bounded ultimatum');
window.KonturV10.resolveCustomDecision(sim,ult.id,'stand');
assert.ok(t4.closed&&t4.v10Walkout,'ultimatum refusal closes the track with a walkout outcome');
// Loading a legacy save migrates into the v10 slot without modifying the original slot.
const legacyRaw=JSON.stringify(sim.snapshot());storage.set('kontur-republic-save-v2',legacyRaw);storage.delete('kontur-republic-save-v10');
const dashboard=Object.create(window.RepublicDashboardUI.prototype);dashboard.sim=sim;dashboard.toast=()=>{};dashboard._syncPolicyInputs=()=>{};dashboard.renderAll=()=>{};dashboard.draft={};
assert.equal(dashboard.loadGame(),true,'legacy save loads through an explicit user action');
assert.ok(storage.has('kontur-republic-save-v10'),'legacy state is copied into the versioned v10 slot');
assert.equal(storage.get('kontur-republic-save-v2'),legacyRaw,'the legacy slot remains unchanged');
const oldLegacy=storage.get('kontur-republic-save-v2');sim.state.trust=81;assert.equal(dashboard.saveGame(true),true,'v10 save writes successfully');
assert.equal(storage.get('kontur-republic-save-v2'),oldLegacy,'new saves do not overwrite the old browser slot');
assert.equal(JSON.parse(storage.get('kontur-republic-save-v10')).state.trust,81,'the v10 slot stores the current model state');
console.log('PASS: v10 active/archive separation, individual history deletion, concrete subject-specific agenda, conditional obligation activation, formal ratification, parliamentary election/coalition phase, press and livestream assignments, crowd self-organization, linked referendum outcome, sequential package enforcement, mediator shuttle, timed ultimatum and walkout, non-destructive save migration');
