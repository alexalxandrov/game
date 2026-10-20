'use strict';
/* KONTUR v7.2 — fresh campaign isolation, bounded turnout, gradual anger and event-caused escalation. */
(function installKonturV72() {
  const Sim = window.RepublicSimulation;
  const Scene = window.RepublicCityScene;
  const UI = window.RepublicDashboardUI;
  if (!Sim || !Scene || !UI) return;
  const SP = Sim.prototype, P = Scene.prototype, UP = UI.prototype;
  const prior = {};
  ['reset','tick','_estimateCrowdSize','_spawnIncident','_v5MaybeGrowCamps','_updateCrowdObjective','_updateCrowdDynamics','_v5IgniteAsset','_igniteCamp','_v5IgniteBarricade'].forEach(k => prior[k] = SP[k]);
  const priorUI = {};
  ['saveGame','loadGame','updateStats'].forEach(k => priorUI[k] = UP[k]);
  const clamp = (v, lo=0, hi=100) => Math.max(lo, Math.min(hi, Number(v) || 0));
  const alive = x => x && x.status !== 'resolved';
  const SAVE_KEY = 'kontur-republic-save-v8';

  if (window.GAME_CONFIG) {
    window.GAME_CONFIG.version = '7.2.0';
    window.GAME_CONFIG.minutesPerTick = 1;
  }

  function ensureArrays(s) {
    for (const key of ['incidents','campSites','fireZones','gasZones','smokeZones','barricades','lootEvents','injuries','radioFeed','promises','repairsQueue','roadVehicles','serviceFleet','historyLog','districts']) {
      if (!Array.isArray(s[key])) s[key] = [];
    }
  }
  function cleanBaseline(sim) {
    const s = sim.state;
    if (!s) return;
    ensureArrays(s);
    s.day = 1; s.hour = 8; s.minute = 0; s.hoursElapsed = 0;
    s.v7PacingInitialized = true; s.v7_2PacingInitialized = true;
    s.cityPopulation = Number(sim.config?.cityPopulation || 5000);
    s.crowdTarget = 38;
    s.crowdAnger = 6; s.publicAnger = 22; s.tension = 18;
    s.mobilizationSurge = 0; s.movementAsh = 0; s.crowdFatigue = 5;
    s.movementDays = 0; s.activeStrikes = 0; s.lastMobilizationHour = -8;
    s.lastV4CrowdEventAt = -999; s.lastV4PoliceActionAt = -999; s.v5LastPoliceActionAt = -999; s.v6LastForceAt = -999;
    s.v6LastForceMethod = null; s.v6Organization = 4; s.v6Radicalization = 0; s.v6PoliceAggression = 78;
    s.v7DeparturePressure = 0; s.v7AmbientAngerCarry = 0; s.v7LastArrestsSeen = Number(s.arrests || 0); s.v7LastVehicleBurnedSeen = Number(s.vehiclesBurned || 0);
    s.v7CampPressureHours = 0; s.v7CampLowPresenceHours = 0; s.v7LastFireTick = -999;
    s.v7_2ExplicitFireDepth = 0; s.v7_2LastIncidentCount = 0; s.v7_2LastTarget = 38;
    s.crowdFatigue = 5; s.crowdMood = 'gathering'; s.crowdPhaseAge = 0; s.crowdDeparturePressure = 0;
    s.v6CrowdPhase = 'собрание'; s.phaseCode = 'assembly'; s.protestPhase = 'Небольшое гражданское собрание';
    s.crowdOrder = { phase:'gather', version:0, targetX:640, targetY:418, nextAt:0 };
    s.crowdPlan = { phase:'gather', version:0, nextAt:0 };
    s.crowdObjectiveCode = 'hearings_costs';
    s.crowdObjective = 'Добиться публичных слушаний по стоимости жизни';
    s.crowdObjectiveProgress = 0; s.crowdObjectiveSetAt = 0; s.crowdObjectiveLastAnnounced = 'hearings_costs';
    s.crowdObjectiveLastProgressAt = 0;
    s.movementGoal = { code:'public-hearings', title:'Добиться публичных слушаний по стоимости жизни', target:'здание правительства', progress:0, stage:'собрание' };
    s.incidents = []; s.fireZones = []; s.gasZones = []; s.smokeZones = []; s.campSites = []; s.barricades = []; s.lootEvents = []; s.injuries = [];
    s.injuredTotal = 0; s.woundedLight = 0; s.woundedMedium = 0; s.woundedHeavy = 0; s.woundedCritical = 0; s.deaths = 0; s.casualties = 0;
    s.arrests = 0; s.vehicleDamageCount = 0; s.vehiclesBurned = 0; s.hijackedVehicles = 0; s.campsBurned = 0;
    s.v7LastArrestsSeen = 0; s.v7LastVehicleBurnedSeen = 0; s.v7DeparturePressure = 0;
    s.policeActionSeq = 0; s.lastPoliceAction = null; s.doctrineCode = 'observe'; s.doctrine = 'Наблюдение';
    s.forceCap = 7; s.policeTools = { gas:18, water:12, flash:10, rubber:24, live:4 };
    s.policeMorale = 72; s.policeFatigue = 8; s.policeShiftHours = 0; s.policeCommandOverride = null;
    s.militaryDeployed = false; s.emergencyDays = 0;
    s.building = Object.assign({}, s.building || {}, {integrity:100, perimeter:82, status:'Цел', siege:0, occupation:false, collapsePending:false, collapseConsequencesApplied:false, lastDamageAt:-999});
    for (const a of s.assets || []) { a.integrity=100; a.condition='Цел'; a.burning=false; a.fireZoneId=null; a.fireIncidentId=null; a.ignitionCause=null; }
    s.temporaryCabinet = false; s.investigationOpen = false; s.stateMode = 'Обычное управление'; s.stateModeCode = 'normal'; s.stateModeChangedAt = 0;
    s.roadBlockage = 0.025; s.roadVehicles = []; s.serviceFleet = [];
    s.radioFeed = []; s.radioSequence = 0; s.lastRadioAt = -99; s.promises = []; s.repairsQueue = []; s.historyLog = [];
    s.v5PoliceActionCount=0; s.v6TacticalActionCount=0; s.lastCrowdTrigger=null; s.lastFlashpointAt=-999;
    s.lastCampGrowthAt=0; s.v7LastPoliceActionAtReal=null; s.v7NextPoliceActionAtReal=null;
    s.lastWeekendBoostDay = 1; s.movementPartyFormed=false; s._eventHeat=0;
    sim._eventHeat=0;
    sim._refreshDerived?.(false);
    // Some older refresh functions estimate attendance as a side effect; the starter ledger wins.
    s.crowdTarget = 38;
    s.crowdAnger = 6; s.publicAnger = 22; s.tension = 18;
    if (sim._updateDistricts) sim._updateDistricts(false, false);
  }

  SP.reset = function(...args) {
    const result = prior.reset ? prior.reset.apply(this, args) : undefined;
    cleanBaseline(this);
    this._notify?.('reset');
    if (Array.isArray(this.companies)) { try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.snapshot())); } catch (_) {} }
    return result;
  };

  function timeOfDayFactor(s) {
    const h = ((Number(s.hour || 0) + Number(s.minute || 0)/60) % 24 + 24) % 24;
    const anger = clamp(s.crowdAnger,0,1000)/1000;
    let f;
    if (h < 5) f=0.065;
    else if (h < 7) f=0.065 + (0.27-0.065)*(h-5)/2;
    else if (h < 9) f=0.27 + (0.64-0.27)*(h-7)/2;
    else if (h < 17) f=0.64 + (0.82-0.64)*(h-9)/8;
    else if (h < 20) f=0.82 - (0.82-0.37)*(h-17)/3;
    else if (h < 22) f=0.37 - (0.37-0.13)*(h-20)/2;
    else f=0.105;
    if (h < 6 || h >= 21) f += anger*0.075 + clamp(s.movementAsh,0,100)/100*0.018;
    return clamp(f,0.055,0.90);
  }

  SP._estimateCrowdSize = function() {
    const s=this.state; if(!s) return 0;
    const pop=Math.max(500,Number(s.cityPopulation||this.config?.cityPopulation||5000));
    const t=clamp(s.tension??18,0,100)/100;
    const r=clamp(s.crowdAnger??6,0,1000)/1000;
    const pub=clamp(s.publicAnger??22,0,100);
    const p=s.policies||{};
    const hardship=clamp(
      Math.max(0,(Number(s.unemployment||0)-5)*13)+
      Math.max(0,(Number(s.inflation||0)-4)*9)+
      Math.max(0,(Number(p.tax??22)-22)*2.0)+
      Math.max(0,(48-Number(p.welfare??54))*2.0)+
      Math.max(0,(45-Number(s.stability||0))*1.1),0,420);
    const active=(s.incidents||[]).filter(alive);
    const protests=active.filter(i=>['demonstration','blockade','barricade','clash','riot','building_assault','radical_attack','looting'].includes(i.type)).length;
    const raw=18 + 210*Math.pow(t,1.3) + 2750*Math.pow(r,1.92) + Math.max(0,pub-24)*0.9 + hardship*0.72
      + Math.min(260,protests*42) + Math.min(220,Math.max(0,Number(s.mobilizationSurge||0))*0.055)
      + Math.min(140,clamp(s.movementAsh||0,0,100)*1.4)
      - clamp(s.crowdFatigue||0,0,100)*2.6
      - Math.min(pop*0.23,Math.max(0,Number(s.arrests||0))*14)
      - Math.min(pop*0.08,Math.max(0,Number(s.deaths||0))*20)
      - Math.min(pop*0.08,Math.max(0,Number(s.v7DeparturePressure||0)));
    const liveFire=(s.fireZones||[]).some(z=>z&&z.condition==='Горит');
    const activeGas=(s.gasZones||[]).some(z=>z&&Number(z.life||0)>0&&['gas','petard','flash','water'].includes(z.kind));
    const hazard=1-(liveFire?0.10:0)-(activeGas?0.055:0);
    return Math.round(clamp(raw*timeOfDayFactor(s)*hazard,0,pop));
  };

  SP.tick = function(speed=1) {
    const s0=this.state;
    const before=Number(s0?.crowdTarget||0), angerBefore=Number(s0?.crowdAnger||0);
    const beforeIncidents=new Set((s0?.incidents||[]).map(i=>i.id));
    const beforeForce=Number(s0?.policeActionSeq||0);
    const beforeHour=Number(s0?.hoursElapsed||0);
    const result=prior.tick ? prior.tick.call(this,speed) : undefined;
    const s=this.state; if(!s || s.paused) return result;
    const rate=clamp(speed,1,4);
    const newIncidents=(s.incidents||[]).filter(i=>!beforeIncidents.has(i.id)&&alive(i));
    const forceChanged=Number(s.policeActionSeq||0)!==beforeForce;
    const deltaAnger=Number(s.crowdAnger||0)-angerBefore;
    if(!newIncidents.length&&!forceChanged) {
      // Do not inherit large ambient jumps from older hourly layers.
      s.crowdAnger=clamp(angerBefore + clamp(deltaAnger,-0.12,0.045*rate),0,1000);
    }
    const arrests=Math.max(0,Number(s.arrests||0));
    const arrestsPrev=Math.max(0,Number(s.v7LastArrestsSeen||0));
    if(arrests>arrestsPrev) s.v7DeparturePressure=Math.min((s.cityPopulation||5000)*0.18,(Number(s.v7DeparturePressure)||0)+(arrests-arrestsPrev)*18);
    s.v7LastArrestsSeen=arrests;
    const burned=Math.max(0,Number(s.vehiclesBurned||0));
    const burnedPrev=Math.max(0,Number(s.v7LastVehicleBurnedSeen||0));
    if(burned>burnedPrev) s.v7DeparturePressure=Math.min((s.cityPopulation||5000)*0.1,(Number(s.v7DeparturePressure)||0)+(burned-burnedPrev)*18);
    s.v7LastVehicleBurnedSeen=burned;
    s.v7DeparturePressure=Math.max(0,(Number(s.v7DeparturePressure)||0)*0.9990);
    const desired=this._estimateCrowdSize();
    const anger=clamp(s.crowdAnger||0,0,1000), h=Number(s.hour||0);
    const night=h>=21||h<6;
    const fire=(s.fireZones||[]).some(z=>z&&z.condition==='Горит');
    const gas=(s.gasZones||[]).some(z=>z&&Number(z.life||0)>0&&['gas','petard','flash','water'].includes(z.kind));
    const up=(anger<140?0.65:anger<330?1.15:anger<600?2.0:anger<800?3.0:4.4)*rate;
    const down=Math.min(night?8:fire||gas?4.8:2.8, Math.max(night?2.8:fire||gas?1.9:0.9,(before-desired)*(night?0.011:0.006)))*rate;
    let attendance=before;
    if(desired>before) attendance += Math.min(desired-before,up);
    else if(desired<before) attendance -= Math.min(before-desired,down);
    s.crowdTarget=Math.round(clamp(attendance,0,Number(s.cityPopulation||5000)));
    s.v7_2LastTarget=desired;
    // Ambient anger grows by fractions of a point per model minute, with no generic large jumps.
    const p=s.policies||{};
    const pressure=clamp(Math.max(0,Number(p.tax??22)-22)*0.018 + Math.max(0,48-Number(p.welfare??54))*0.014 + Math.max(0,Number(s.inflation||0)-4)*0.006 + Math.max(0,Number(s.unemployment||0)-5)*0.005,0,0.22);
    if(!newIncidents.length&&!forceChanged) s.crowdAnger=clamp(angerBefore+0.035+pressure*0.40,0,1000);
    else s.crowdAnger=clamp(s.crowdAnger,0,1000);
    // The goal is tied to the movement's actions and visible formation, not just a label.
    const a=clamp(s.crowdAnger,0,1000);
    const phase=a<220?'gather':a<420?'march':a<620?'pressure':a<810?'clashes':'siege';
    s.crowdOrder=s.crowdOrder||{version:0};
    if(s.crowdOrder.phase!==phase) { s.crowdOrder.phase=phase; s.crowdOrder.version=Number(s.crowdOrder.version||0)+1; s.crowdOrder.nextAt=0; }
    s.crowdOrder.targetX=640;
    s.crowdOrder.targetY=phase==='gather'?418:phase==='march'?389:phase==='pressure'?350:phase==='clashes'?330:309;
    if(!s.movementGoal) s.movementGoal={};
    s.movementGoal.code=s.crowdObjectiveCode||'hearings_costs';
    s.movementGoal.title=s.crowdObjective||'Добиться публичных слушаний по стоимости жизни';
    s.movementGoal.target=phase==='gather'?'место собрания':phase==='march'?'маршрут к зданию правительства':phase==='pressure'?'периметр здания правительства':'входы и периметр здания правительства';
    s.movementGoal.progress=clamp(s.crowdObjectiveProgress||0,0,100);
    s.movementGoal.stage=phase;
    if(this._updateDistricts) this._updateDistricts(false,false);
    if(s.crowdObjectiveCode!==undefined) this._updateCrowdObjective?.();
    return result;
  };

  // A fresh peaceful crowd cannot produce random riots or ghost fires. Explicit ignition actions bypass this gate.
  SP._spawnIncident = function(type=null) {
    const s=this.state;
    const crowd=Number(s?.crowdTarget||0), anger=Number(s?.crowdAnger||0), age=Number(s?.hoursElapsed||0);
    const liveFire=(s?.fireZones||[]).some(z=>z&&z.condition==='Горит');
    const depth=Number(s?.v7_2ExplicitFireDepth||0);
    const severe=new Set(['clash','riot','looting','building_assault','radical_attack','barricade','fire','arson']);
    if(!type && crowd<220 && anger<150) return null;
    if(type && severe.has(type) && !depth && crowd<220 && anger<150) return null;
    if(type && ['riot','clash','looting','building_assault','radical_attack','barricade'].includes(type) && crowd<160 && anger<110) return null;
    if(type && ['fire','arson'].includes(type) && !depth && !liveFire && (age<4 || crowd<500 || anger<220)) return null;
    return prior._spawnIncident ? prior._spawnIncident.call(this,type) : null;
  };

  // Preserve deliberate fire-token effects while rejecting ambient, unsourced ignition at calm start.
  for (const method of ['_v5IgniteAsset','_igniteCamp','_v5IgniteBarricade']) {
    const old=prior[method];
    if(typeof old!=='function') continue;
    SP[method]=function(...args) {
      const s=this.state; if(s) s.v7_2ExplicitFireDepth=(Number(s.v7_2ExplicitFireDepth)||0)+1;
      try { return old.apply(this,args); }
      finally { if(s) s.v7_2ExplicitFireDepth=Math.max(0,(Number(s.v7_2ExplicitFireDepth)||1)-1); }
    };
  }

  // Camps require a sustained high turnout and are assembled tent by tent; quiet periods gradually clear them.
  SP._v5MaybeGrowCamps = function() {
    const s=this.state; if(!s) return;
    if(!Array.isArray(s.campSites)) s.campSites=[];
    const now=Number(s.hoursElapsed||0), attendance=Number(s.crowdTarget||0), anger=clamp(s.crowdAnger||0,0,1000);
    const sustained=attendance>=900&&anger>=320;
    s.v7CampPressureHours=Math.max(0,Number(s.v7CampPressureHours||0)+(sustained?1:-0.75));
    if(attendance<260&&anger<240) s.v7CampLowPresenceHours=(Number(s.v7CampLowPresenceHours)||0)+1;
    else s.v7CampLowPresenceHours=Math.max(0,(Number(s.v7CampLowPresenceHours)||0)-1.5);
    if(s.v7CampLowPresenceHours>=6) {
      const camp=s.campSites.find(c=>c&&!['Выжжен','Снят','Разрушен','Горит','Тлеет'].includes(c.condition));
      if(camp) { camp.condition='Снят'; camp.tentCount=0; camp.clearedAt=now; this._radio?.('Гражданский','Координатор лагеря',`${camp.name}: после нескольких спокойных часов участники собрали укрытия и разошлись.`, 'info','citizens'); }
      s.v7CampLowPresenceHours=0;
    }
    for(const camp of s.campSites) {
      if(!camp||['Выжжен','Снят','Разрушен','Горит','Тлеет'].includes(camp.condition)) continue;
      const age=Math.max(0,now-Number(camp.createdAt||now));
      if(attendance>=700&&age>=1.5&&now>=Number(camp.nextTentAt||((camp.createdAt||now)+1.5))&&Number(camp.tentCount||1)<5) {
        camp.tentCount=Number(camp.tentCount||1)+1; camp.nextTentAt=now+1.5;
        this._radio?.('Гражданский','Координатор лагеря',`${camp.name}: волонтёры постепенно установили ещё одно укрытие.`, 'info','citizens');
      }
    }
    if(!sustained || Number(s.v7CampPressureHours||0)<5) return;
    const last=Number(s.lastCampGrowthAt||0);
    const minimum=attendance>1800||anger>720?5.5:9;
    if(now-last<minimum) return;
    const living=s.campSites.filter(c=>c&&!['Выжжен','Снят','Разрушен'].includes(c.condition));
    if(living.length>=3) return;
    const sites=[
      {x:270,y:467,radius:28,name:'Лагерь у западной ограды'}, {x:430,y:512,radius:27,name:'Южный палаточный лагерь'},
      {x:790,y:501,radius:30,name:'Лагерь у боковой аллеи'}, {x:1010,y:475,radius:30,name:'Восточный лагерь'},
      {x:555,y:468,radius:25,name:'Лагерь волонтёров'}, {x:850,y:525,radius:28,name:'Лагерь у остановки'}
    ];
    const activeFires=(s.fireZones||[]).filter(z=>z&&z.condition==='Горит');
    const free=sites.filter(p=>s.campSites.filter(c=>!['Выжжен','Снят','Разрушен'].includes(c.condition)).every(c=>Math.hypot(c.x-p.x,c.y-p.y)>(c.radius||28)+p.radius+24)&&activeFires.every(f=>Math.hypot(f.x-p.x,f.y-p.y)>(f.radius||24)+p.radius+20));
    if(!free.length) return;
    const night=Number(s.hour||0)>=20||Number(s.hour||0)<6;
    const site=free[Math.floor(Math.random()*free.length)];
    const id=`camp-v7_2-${s.day||1}-${Math.round(now*10)}-${Math.floor(Math.random()*90+10)}`;
    s.campSites.push({id,name:site.name,x:site.x,y:site.y,radius:site.radius,integrity:92,condition:'Цел',fireRemaining:0,fireIntensity:0,tentCount:1,nextTentAt:now+1.5,rebuildAt:0,createdAt:now,createdAtNight:night,ignitionCause:null,stage:'организация лагеря'});
    s.lastCampGrowthAt=now; s.v7CampPressureHours=0;
    this._radio?.('Гражданский','Координатор лагеря',`${site.name}: после ${Math.floor(minimum)} часов устойчивого присутствия поставлено первое укрытие. Возгорания нет.`, 'info','citizens');
    this._publishCrisisEvent?.('citizens','camp-established',`Постепенно вырос палаточный лагерь: ${site.name}`,'Первые укрытия установлены после длительного присутствия участников и координации волонтёров; источник огня отсутствует.',{severity:0.2,channel:'Гражданский',speaker:'Волонтёрский пункт',tone:'info'});
  };

  UP.saveGame = function(automatic=false) {
    try {
      localStorage.setItem(SAVE_KEY,JSON.stringify(this.sim.snapshot()));
      const label=document.getElementById('last-save-label');
      if(label) label.textContent=`СОХРАНЕНО v8 ${new Date().toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}`;
      if(!automatic) this.toast('Игра сохранена','Сохранены явка, цель движения и причинные события.','success');
      return true;
    } catch(err) { if(!automatic) this.toast('Ошибка сохранения',err.message,'error'); return false; }
  };
  UP.loadGame = function() {
    try {
      const keys=[SAVE_KEY,'kontur-republic-save-v7_2','kontur-republic-save-v7_1','kontur-republic-save-v7','kontur-republic-save-v6','kontur-republic-save-v5','kontur-republic-save-v4','kontur-republic-save-v3','kontur-republic-save-v2'];
      let raw=null, found=null;
      for(const key of keys){raw=localStorage.getItem(key);if(raw){found=key;break;}}
      if(!raw){this.toast('Сохранение не найдено','Сначала сохраните игру.','warning');return false;}
      const snapshot=JSON.parse(raw); this.sim.loadSnapshot(snapshot);
      const s=this.sim.state;
      if(found!==SAVE_KEY) {
        // Never carry an obviously contaminated pre-7.2 opening into a new campaign.
        if(Number(s.crowdTarget||0)>4500&&Number(s.crowdAnger||0)<250&&!(s.deaths||0)&&!(s.v5BuildingCollapseCount||0)) cleanBaseline(this.sim);
        s.v7_2PacingInitialized=true;
        try { localStorage.setItem(SAVE_KEY,JSON.stringify(this.sim.snapshot())); } catch(_) {}
      }
      this.draft={...this.sim.state.policies}; this._syncPolicyInputs(); this.renderAll(true);
      const label=document.getElementById('last-save-label'); if(label) label.textContent=`ЗАГРУЖЕНО ${found} → v8`;
      this.toast('Сохранение загружено','История сохранена; новая логика явки и событий активна.','success'); return true;
    } catch(err) { this.toast('Ошибка загрузки',`Не удалось прочитать сохранение: ${err.message}`,'error'); return false; }
  };
  UP.updateStats = function() {
    if(priorUI.updateStats) priorUI.updateStats.call(this);
    const foot=document.querySelector('.app-footer span'); if(foot) foot.textContent=`КОНТУР // ВЕРСИЯ ${window.GAME_CONFIG?.version||'7.2.0'}`;
  };
  document.addEventListener('DOMContentLoaded',()=>{const foot=document.querySelector('.app-footer span');if(foot)foot.textContent=`КОНТУР // ВЕРСИЯ ${window.GAME_CONFIG?.version||'7.2.0'}`;},{once:true});
})();
