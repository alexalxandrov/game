'use strict';
/* KONTUR v7 — controlled pacing, clean starts, gradual turnout, day/night ebb, and explicit crowd objectives.
   Browser-only additive layer. Fire still requires a cause or propagation from an existing live source. */
(function installKonturV7() {
  const Sim = window.RepublicSimulation;
  const Scene = window.RepublicCityScene;
  const UI = window.RepublicDashboardUI;
  if (!Sim || !Scene || !UI) return;

  const clamp = (v, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, Number(v) || 0));
  const alive = x => x && x.status !== 'resolved';
  const SP = Sim.prototype, P = Scene.prototype, UP = UI.prototype;
  const simOld = {}, sceneOld = {}, uiOld = {};
  ['reset','loadSnapshot','tick','_hourlyStep','_refreshDerived','_estimateCrowdSize','_updateCrowdDynamics','commandPolice','_v5MaybeGrowCamps'].forEach(k => simOld[k] = SP[k]);
  ['create','_visualCrowdTarget','_v6SchedulePoliceAction','_renderEnvironment','update'].forEach(k => sceneOld[k] = P[k]);
  ['saveGame','loadGame','updateStats','renderCrisisMonitor'].forEach(k => uiOld[k] = UP[k]);

  if (window.GAME_CONFIG) {
    window.GAME_CONFIG.version = '7.1.0';
    window.GAME_CONFIG.minutesPerTick = 1;
  }

  // Preserve an intentionally empty camp list; older initialization layers used to repopulate three camps every hour.
  const DEFAULT_ASSETS = [
    { id:'city-hall-front', name:'Фасад здания правительства', kind:'building', x:640, y:225, radius:75, integrity:100, condition:'Цел', repairCost:24 },
    { id:'transit-stop', name:'Остановка у площади', kind:'street', x:520, y:552, radius:30, integrity:100, condition:'Цел', repairCost:2 },
    { id:'lamp-west', name:'Уличные фонари, запад', kind:'street', x:330, y:492, radius:20, integrity:100, condition:'Цел', repairCost:1 },
    { id:'shop-east', name:'Фасад торгового квартала', kind:'shop', x:1050, y:430, radius:38, integrity:100, condition:'Цел', repairCost:8 },
    { id:'bus-shelter', name:'Стеклянный павильон', kind:'street', x:1110, y:565, radius:28, integrity:100, condition:'Цел', repairCost:3 },
    { id:'bank-west', name:'Отделение банка', kind:'bank', x:225, y:420, radius:40, integrity:100, condition:'Цел', repairCost:16 }
  ];

  SP._initCrisisState = function(migrating = false) {
    const stateBefore = this.state;
    const calmStart = !!(stateBefore && stateBefore.v7PacingInitialized);
    const angerBefore = calmStart && Number.isFinite(Number(stateBefore.crowdAnger)) ? Number(stateBefore.crowdAnger) : null;
    const emptyCampsBefore = !!(calmStart && Array.isArray(stateBefore.campSites) && stateBefore.campSites.length === 0);
    const result = simOld._initCrisisState ? simOld._initCrisisState.call(this, migrating) : undefined;
    const s = this.state;
    if (s) {
      // Older layers had a high minimum anger and incomplete reset paths. In v7, preserve
      // the current simulation value and create missing records explicitly instead of
      // letting an initializer reintroduce a crisis or phantom assets.
      if (!Array.isArray(s.assets) || !s.assets.length) s.assets = DEFAULT_ASSETS.map(a => ({...a}));
      // Defensive completion of defaults: older reset wrappers may replace state after the crisis layer initializes it.
      for (const key of ['incidents','campSites','fireZones','gasZones','smokeZones','barricades','lootEvents','injuries','radioFeed','promises','repairsQueue','roadVehicles','serviceFleet','historyLog','districts']) {
        if (!Array.isArray(s[key])) s[key] = [];
      }
      if (!Number.isFinite(Number(s.radioSequence))) s.radioSequence = 0;
      if (!Number.isFinite(Number(s.promiseSequence))) s.promiseSequence = 0;
      if (!Number.isFinite(Number(s.referendumSequence))) s.referendumSequence = 0;
      if (emptyCampsBefore) s.campSites = [];
      if (angerBefore !== null && s.v7PacingInitialized) s.crowdAnger = clamp(angerBefore, 0, 1000);
    }
    return result;
  };

  function setFreshBaseline(sim) {
    const s = sim.state;
    if (!s) return;
    s.v7PacingInitialized = true;
    s.crowdTarget = 65;
    s.crowdAnger = 18;
    s.publicAnger = 28;
    s.tension = 20;
    s.mobilizationSurge = 0;
    s.movementAsh = 0;
    s.crowdFatigue = 7;
    s.movementDays = 0;
    s.activeStrikes = 0;
    s.lastMobilizationHour = -8;
    s.lastV4CrowdEventAt = -999;
    s.lastV4PoliceActionAt = -999;
    s.v5LastPoliceActionAt = -999;
    s.v6LastForceAt = -999;
    s.v6LastForceMethod = null;
    s.v6LastProcessedPoliceSeq = Number(s.policeActionSeq || 0);
    s.v6Organization = 2;
    s.v6Radicalization = 0;
    s.v6PoliceAggression = 78;
    s.v7DeparturePressure = 0;
    s.v7AmbientAngerCarry = 0;
    s.v7LastArrestsSeen = 0;
    s.v7LastVehicleBurnedSeen = 0;
    s.v7CampPressureHours = 0;
    s.v6CrowdPhase = 'собрание';
    s.crowdOrder = { phase:'gather', version:0, targetX:640, targetY:425, nextAt:0 };
    s.crowdPlan = { phase:'gather', version:0, nextAt:0 };
    s.crowdObjectiveCode = 'hearings_costs';
    s.crowdObjective = 'Добиться публичных слушаний по стоимости жизни';
    s.crowdObjectiveProgress = 0;
    s.crowdObjectiveSetAt = 0;
    s.crowdObjectiveLastAnnounced = 'hearings_costs';
    s.crowdObjectiveLastProgressAt = Number(s.hoursElapsed || 0);
    s.crowdPhaseAge = 0;
    s.crowdDeparturePressure = 0;
    s.incidents = [];
    s.assets = Array.isArray(s.assets) && s.assets.length ? s.assets : DEFAULT_ASSETS.map(a => ({...a}));
    s.promises = []; s.repairsQueue = []; s.historyLog = []; s.radioFeed = [];
    s.radioSequence = 0; s.promiseSequence = 0; s.referendumSequence = 0;
    s.fireZones = [];
    s.gasZones = [];
    s.smokeZones = [];
    s.campSites = [];
    s.barricades = [];
    s.lootEvents = [];
    s.injuries = [];
    s.injuredTotal = 0; s.woundedLight = 0; s.woundedMedium = 0; s.woundedHeavy = 0; s.woundedCritical = 0; s.deaths = 0;
    s.casualties = 0;
    s.arrests = 0;
    s.vehicleDamageCount = 0; s.vehiclesBurned = 0; s.hijackedVehicles = 0;
    s.campsBurned = 0;
    s.policeActionSeq = 0;
    s.lastPoliceAction = null;
    s.doctrineCode = 'observe'; s.doctrine = 'Наблюдение';
    s.forceCap = 3;
    s.policeTools = Object.assign({gas:14,water:10,flash:8,rubber:22,live:4}, s.policeTools || {});
    s.policeMorale = 72; s.policeFatigue = 8; s.policeShiftHours = 0;
    s.policeCommandOverride = null;
    s.militaryDeployed = false; s.emergencyDays = 0;
    s.building = Object.assign({}, s.building || {}, {integrity:100, perimeter:82, status:'Цел', siege:0, occupation:false, collapsePending:false, collapseConsequencesApplied:false, lastDamageAt:-999});
    for (const a of s.assets) {
      a.integrity = 100; a.condition = 'Цел'; a.burning = false; a.fireZoneId = null; a.fireIncidentId = null; a.ignitionCause = null;
    }
    s.temporaryCabinet = false; s.investigationOpen = false;
    s.stateMode = 'Обычное управление'; s.stateModeCode = 'normal'; s.stateModeChangedAt = 0;
    s.roadBlockage = 0.025;
    s.roadVehicles = []; s.serviceFleet = [];
    s.radioFeed = []; s.radioSequence = 0; s.lastRadioAt = -99;
    s.v5PoliceActionCount = 0; s.v6TacticalActionCount = 0;
    s.lastCrowdTrigger = null; s.lastFlashpointAt = -999;
    s.lastCampGrowthAt = Number(s.hoursElapsed || 0);
    s.v7LastPoliceActionAtReal = null;
    s.v7NextPoliceActionAtReal = null;
    sim._eventHeat = 0;
    sim._refreshDerived?.(false);
    s.crowdTarget = 65;
    if (sim._updateDistricts) sim._updateDistricts(false, false);
  }

  // Reset is intentionally a clean new scenario; opening v6 autosaves is handled separately by the manual Load button.
  SP.reset = function() {
    const result = simOld.reset ? simOld.reset.call(this) : undefined;
    setFreshBaseline(this);
    this._notify?.('reset');
    if (Array.isArray(this.companies)) { try { localStorage.setItem('kontur-republic-save-v7_1', JSON.stringify(this.snapshot())); } catch (_) {} }
    return result;
  };

  // One desired turnout curve: low at the start, driven by grievances, social support, mobilization and time of day.
  function daylightFactor(s) {
    const h = (Number(s.hour || 0) + Number(s.minute || 0) / 60 + 24) % 24;
    const rage = clamp(s.crowdAnger || 0, 0, 1000) / 1000;
    const lerp = (a,b,t) => a + (b-a) * clamp(t,0,1);
    let base;
    if (h < 5) base = 0.11;
    else if (h < 7) base = lerp(0.11, 0.50, (h-5)/2);
    else if (h < 9) base = lerp(0.50, 0.80, (h-7)/2);
    else if (h < 17) base = lerp(0.80, 0.96, (h-9)/8);
    else if (h < 20) base = lerp(0.96, 0.46, (h-17)/3);
    else if (h < 22) base = lerp(0.46, 0.15, (h-20)/2);
    else base = 0.12;
    // A highly committed movement keeps a night presence, but normal demonstrators go home.
    if (h < 6 || h >= 21) base += rage * 0.10 + clamp(s.movementAsh || 0,0,100) / 100 * 0.025;
    return clamp(base, 0.08, 1.0);
  }

  SP._estimateCrowdSize = function() {
    const s = this.state;
    if (!s) return 180;
    const pop = Math.max(500, Number(s.cityPopulation || this.config.cityPopulation || 5000));
    const tension = clamp(s.tension ?? 38, 0, 100) / 100;
    const rage = clamp(s.crowdAnger ?? 72, 0, 1000) / 1000;
    const publicAnger = clamp(s.publicAnger ?? 42, 0, 100) / 100;
    const policies = s.policies || {};
    const hardship = clamp(
      Math.max(0, (Number(s.unemployment || 0) - 5) * 22) +
      Math.max(0, (Number(s.inflation || 0) - 4) * 15) +
      Math.max(0, (Number(policies.tax ?? 22) - 22) * 4.2) +
      Math.max(0, (48 - Number(policies.welfare ?? 54)) * 4.5) +
      Math.max(0, (45 - Number(s.stability || 0)) * 2.1), 0, 700);
    const active = (s.incidents || []).filter(alive);
    const protestIncidents = active.filter(i => ['demonstration','blockade','barricade','clash','riot','building_assault','radical_attack','looting'].includes(i.type)).length;
    const raw = 38
      + 620 * Math.pow(tension, 1.42)
      + 2180 * Math.pow(rage, 1.70)
      + Math.max(0, publicAnger - 0.30) * 220
      + hardship
      + Math.min(pop * 0.14, Math.max(0, Number(s.mobilizationSurge || 0)) * 0.20)
      + Math.min(320, clamp(s.movementAsh || 0,0,100) * 3.2)
      + Math.min(220, protestIncidents * 35)
      + (Number(s.activeStrikes || 0) * 55)
      - clamp(s.crowdFatigue || 0,0,100) * 6.0
      - Math.min(pop * 0.18, Math.max(0, Number(s.arrests || 0)) * 9)
      - Math.min(pop * 0.06, Math.max(0, Number(s.deaths || 0)) * 16)
      - Math.min(pop * 0.08, Math.max(0, Number(s.v7DeparturePressure || 0)));
    const liveHazard = (s.fireZones || []).some(z => z && z.condition !== 'Выжжен' && z.condition !== 'Потушено');
    const activeGas = (s.gasZones || []).some(z => z && Number(z.life || 0) > 0 && (z.kind === 'gas' || z.id?.startsWith?.('GAS-')));
    const hazardFactor = 1 - (liveHazard ? 0.09 : 0) - (activeGas ? 0.045 : 0);
    const estimate = raw * daylightFactor(s) * hazardFactor;
    return Math.round(clamp(estimate, 0, pop));
  };

  // Derived display values must not overwrite the slowly evolving physical attendance ledger.
  SP._refreshDerived = function(notify = true) {
    const s = this.state;
    const target = s && Number(s.crowdTarget);
    const result = simOld._refreshDerived ? simOld._refreshDerived.call(this, notify) : undefined;
    if (s && Number.isFinite(target)) s.crowdTarget = target;
    return result;
  };

  SP.tick = function(speed = 1) {
    const sBefore = this.state;
    const previous = Number(sBefore?.crowdTarget ?? 185);
    const result = simOld.tick ? simOld.tick.call(this, speed) : undefined;
    const s = this.state;
    if (!s) return result;
    const target = this._estimateCrowdSize();
    const arrestsNow = Math.max(0, Number(s.arrests || 0));
    const arrestsSeen = Math.max(0, Number(s.v7LastArrestsSeen || 0));
    if (arrestsNow > arrestsSeen) s.v7DeparturePressure = Math.min((s.cityPopulation || 5000) * 0.08, (Number(s.v7DeparturePressure) || 0) + (arrestsNow - arrestsSeen) * 11);
    s.v7LastArrestsSeen = arrestsNow;
    const burnedNow = Math.max(0, Number(s.vehiclesBurned || 0));
    const burnedSeen = Math.max(0, Number(s.v7LastVehicleBurnedSeen || 0));
    if (burnedNow > burnedSeen) s.v7DeparturePressure = Math.min((s.cityPopulation || 5000) * 0.08, (Number(s.v7DeparturePressure) || 0) + (burnedNow - burnedSeen) * 18);
    s.v7LastVehicleBurnedSeen = burnedNow;
    // Evacuation effects fade slowly; detained people and serious road incidents reduce attendance for a while.
    s.v7DeparturePressure = Math.max(0, (Number(s.v7DeparturePressure) || 0) * 0.9994);
    const h = Number(s.hour || 0);
    const night = h >= 21 || h < 6;
    const fire = (s.fireZones || []).some(z => z && z.condition === 'Горит');
    const panic = (s.gasZones || []).some(z => z && Number(z.life || 0) > 0 && ['gas','petard','flash'].includes(z.kind));
    const anger = clamp(s.crowdAnger || 0, 0, 1000);
    const rate = Math.max(0.5, Number(speed) || 1);
    // Crowd attendance is an actual changing ledger, not a direct copy of the theoretical ceiling.
    // A quiet crowd grows slowly; large waves need a sustained trigger and never appear in one tick.
    const perTickUp = (anger > 700 ? 10 : anger > 420 ? 6 : anger > 180 ? 3.2 : 1.1) * rate;
    const gap = Math.max(0, previous - target);
    const perTickDown = Math.min(32, Math.max(fire || panic ? 15 : night ? 12 : 5, gap * (night ? 0.022 : (fire || panic ? 0.035 : 0.012)))) * rate;
    let next = previous;
    if (target > previous) next += Math.min(target - previous, perTickUp);
    else if (target < previous) next -= Math.min(previous - target, perTickDown);

    // Ambient anger accumulates gently from policy hardship; sharp jumps remain tied to explicit events.
    const policies = s.policies || {};
    const policyPressure = clamp(Math.max(0, Number(policies.tax ?? 22)-22) * 0.018 + Math.max(0, 48-Number(policies.welfare ?? 54)) * 0.014 + Math.max(0, Number(s.inflation || 0)-4) * 0.006 + Math.max(0, Number(s.unemployment || 0)-5) * 0.005, 0, 0.22);
    const baseDrift = 0.08 + policyPressure * 0.22;
    s.crowdAnger = clamp(anger + baseDrift * rate, 0, 1000);
    s.v7AmbientAngerCarry = (Number(s.v7AmbientAngerCarry) || 0) + baseDrift * rate;
    s.crowdTarget = Math.round(clamp(next, 0, s.cityPopulation || this.config.cityPopulation || 5000));
    s.crowdTarget = Number.isFinite(s.crowdTarget) ? s.crowdTarget : 185;
    if (this._updateDistricts) this._updateDistricts(false, false);
    if (s.crowdObjectiveCode !== v7ObjectiveCode(s)) this._updateCrowdObjective();
    return result;
  };

  // Legacy v6 applies coarse hourly mood corrections. Bound ordinary downward movement so the new campaign
  // develops gradually; explicit events and police actions may still cause immediate, event-driven jumps.
  SP._hourlyStep = function() {
    const s = this.state;
    const angerBefore = Number(s?.crowdAnger || 0);
    const result = simOld._hourlyStep ? simOld._hourlyStep.call(this) : undefined;
    const state = this.state;
    if (state?.v7PacingInitialized && Number.isFinite(angerBefore)) {
      const after = Number(state.crowdAnger || 0);
      if (after < angerBefore - 1.0) state.crowdAnger = clamp(angerBefore - 1.0, 0, 1000);
    }
    return result;
  };

  // Police action deltas are paced to model time: no six force events in the first real minute.
  SP.commandPolice = function(method, autonomous = false) {
    const s = this.state;
    const before = Number(s?.crowdAnger || 0);
    const result = simOld.commandPolice ? simOld.commandPolice.call(this, method, autonomous) : false;
    if (!result || !s) return result;
    const delta = {
      talk:-5, deescalate:-10, corridor:-4, retreat:-8, rotate:-3, cordon:3, reinforce:2,
      arrest:16, gas:28, water:34, flash:32, physical:38, rubber:48, live:92
    }[method] ?? 0;
    s.crowdAnger = clamp(before + delta, 0, 1000);
    if (['gas','water','flash','physical','rubber','live'].includes(method)) {
      s.v7LastForceAtHours = Number(s.hoursElapsed || 0);
      s.v7LastForceMethod = method;
    }
    s.v7LastPoliceActionAtHours = Number(s.hoursElapsed || 0);
    this._updateCrowdObjective?.();
    return result;
  };

  function v7ObjectiveCode(s) {
    const anger = clamp(s.crowdAnger || 0, 0, 1000);
    const p = s.policies || {};
    const grievance = Number(p.tax || 22) >= 35 ? 'taxes' : Number(p.welfare || 54) < 42 ? 'welfare' : Number(p.healthcare || 62) < 45 ? 'healthcare' : (s.trust || 50) < 34 ? 'accountability' : 'costs';
    if (s.building?.occupation) return 'occupation';
    if ((s.building?.siege || 0) >= 72 || anger >= 850) return `building_${grievance}`;
    if (anger >= 650) return `pressure_${grievance}`;
    if (anger >= 420) return `hold_square_${grievance}`;
    if (anger >= 220) return `march_${grievance}`;
    return `hearings_${grievance}`;
  }

  function objectiveText(code) {
    const lookup = {
      taxes:'отмены повышения налогов и пересмотра тарифов',
      welfare:'восстановления социальной поддержки и помощи семьям',
      healthcare:'увеличения финансирования здравоохранения',
      accountability:'независимого расследования и публичного ответа правительства',
      costs:'мер по снижению стоимости жизни'
    };
    const key = code.split('_').at(-1);
    const issue = lookup[key] || lookup.costs;
    if (code === 'occupation') return 'Удержать занятое здание правительства и добиться политических переговоров';
    if (code.startsWith('building_')) return `Добиться ${issue}; часть движения требует прямого доступа к зданию правительства`;
    if (code.startsWith('pressure_')) return `Удерживать давление на периметр и добиться ${issue}`;
    if (code.startsWith('hold_square_')) return `Сохранить контроль над площадью и вынудить кабинет обсуждать ${issue}`;
    if (code.startsWith('march_')) return `Организовать марш и добиться официального ответа: ${issue}`;
    return `Добиться публичных слушаний и официального ответа по вопросу ${issue}`;
  }

  SP._updateCrowdObjective = function() {
    const s = this.state; if (!s) return;
    const code = v7ObjectiveCode(s);
    if (s.crowdObjectiveCode !== code) {
      s.crowdObjectiveCode = code;
      s.crowdObjective = objectiveText(code);
      s.crowdObjectiveProgress = 0;
      s.crowdObjectiveSetAt = Number(s.hoursElapsed || 0);
      if (s.v7PacingInitialized && s.crowdObjectiveLastAnnounced !== code) {
        s.crowdObjectiveLastAnnounced = code;
        this._radio?.('Гражданский','Координационный пункт',`Обновлена общая цель движения: ${s.crowdObjective}. Группы распределяют роли и согласуют дальнейшие действия.`, s.crowdAnger > 620 ? 'warning' : 'info','protest');
      }
    } else {
      // Progress is slow and tied to persistence, organization and whether the movement is actually present.
      const now = Number(s.hoursElapsed || 0);
      const lastProgress = Number(s.crowdObjectiveLastProgressAt || 0);
      if (now - lastProgress >= (1 / 60) - 1e-6) {
        const presence = clamp((s.crowdTarget || 0) / 1800, 0, 1);
        const organization = clamp(s.v6Organization || 0, 0, 100) / 100;
        const resolved = Number(s.lastGovernmentResponseAt || -999) > Number(s.crowdObjectiveSetAt || 0);
        s.crowdObjectiveProgress = clamp((s.crowdObjectiveProgress || 0) + presence * (0.025 + organization * 0.035) + (resolved ? 0.35 : 0), 0, 100);
        s.crowdObjectiveLastProgressAt = now;
      }
    }
    const caption = document.getElementById('scene-caption');
    if (caption) caption.textContent = `ЦЕЛЬ ТОЛПЫ: ${s.crowdObjective || objectiveText(code)}`;
    const subtitle = document.getElementById('world-subtitle');
    if (subtitle) subtitle.textContent = s.protestPhase || 'Площадь Республики';
  };

  SP._updateCrowdDynamics = function() {
    const result = simOld._updateCrowdDynamics ? simOld._updateCrowdDynamics.call(this) : undefined;
    this._updateCrowdObjective();
    return result;
  };

  // Gradual camp emergence/rebuilding. Empty squares do not spontaneously sprout tents or catch fire.
  SP._v5MaybeGrowCamps = function() {
    const s = this.state; if (!s) return;
    if (!Array.isArray(s.campSites)) s.campSites = [];
    const now = Number(s.hoursElapsed || 0);
    const attendance = Number(s.crowdTarget || 0);
    const anger = clamp(s.crowdAnger || 0, 0, 1000);
    const last = Number(s.lastCampGrowthAt ?? 0);
    const seriousPresence = attendance >= 850 && anger >= 300;
    s.v7CampPressureHours = Math.max(0, Number(s.v7CampPressureHours || 0) + (seriousPresence ? 1 : -0.6));
    const night = Number(s.hour || 0) >= 20 || Number(s.hour || 0) < 6;

    // Existing encampments are built up a tent at a time, only while there are enough people to maintain them.
    for (const camp of s.campSites) {
      if (!camp || ['Выжжен','Снят','Разрушен'].includes(camp.condition)) continue;
      const age = Math.max(0, now - Number(camp.createdAt || now));
      const nextTentAt = Number(camp.nextTentAt ?? (Number(camp.createdAt || now) + 1.5));
      if (attendance >= 700 && age >= 1.5 && age >= nextTentAt - Number(camp.createdAt || 0) && Number(camp.tentCount || 1) < 5) {
        camp.tentCount = Number(camp.tentCount || 1) + 1;
        camp.nextTentAt = now + 1.5;
        camp.lastConstructionAt = now;
        this._radio?.('Гражданский','Координатор лагеря',`${camp.name}: волонтёры постепенно установили ещё одно укрытие.`, 'info','citizens');
      }
    }

    const minimum = attendance > 1800 || anger > 720 ? 3.5 : 6.0;
    // Tents require a sustained, visible movement, not one random tick or a quiet plaza.
    if ((attendance < 850 && anger < 450) || Number(s.v7CampPressureHours || 0) < 3) return;
    if (now - last < minimum) return;
    s.lastCampGrowthAt = now;
    const pressure = clamp((attendance - 850) / 2600, 0, 1) * 0.10 + clamp(anger / 1000,0,1) * 0.08;
    const chance = clamp(pressure + (night ? 0.025 : 0), 0.025, 0.16);
    if (Math.random() > chance) return;
    const camps = s.campSites;
    const living = camps.filter(c => !['Выжжен','Снят','Разрушен'].includes(c.condition));
    const burned = camps.filter(c => c.condition === 'Выжжен' && now - Number(c.burnedAt || 0) >= 8);
    if (burned.length && living.length < 3 && Math.random() < 0.35) {
      const camp = burned[0];
      camp.condition = 'Повреждён'; camp.integrity = 40; camp.tentCount = Math.max(1, Math.round((camp.tentCount || 4) * 0.5));
      camp.fireRemaining = 0; camp.fireIntensity = 0; camp.ignitionCause = null; camp.rebuildAt = (s.day || 1) + 3;
      this._radio?.('Гражданский','Координатор лагеря',`${camp.name}: волонтёры восстановили часть укрытий на прежнем месте.`, 'info','citizens');
      return;
    }
    if (living.length >= 3 || camps.length >= 5) return;
    const sites = [
      {x:270,y:467,radius:28,name:'Лагерь у западной ограды'}, {x:430,y:512,radius:27,name:'Южный палаточный лагерь'},
      {x:790,y:501,radius:30,name:'Лагерь у боковой аллеи'}, {x:1010,y:475,radius:30,name:'Восточный лагерь'},
      {x:555,y:468,radius:25,name:'Лагерь волонтёров'}, {x:850,y:525,radius:28,name:'Лагерь у остановки'}
    ];
    const activeFires = (s.fireZones || []).filter(z => z && z.condition === 'Горит');
    const free = sites.filter(p => camps.every(c => Math.hypot(c.x-p.x,c.y-p.y) > (c.radius||28)+p.radius+24) && activeFires.every(f => Math.hypot(f.x-p.x,f.y-p.y) > (f.radius||24)+p.radius+20));
    if (!free.length) return;
    const site = free[Math.floor(Math.random()*free.length)];
    const id = `camp-v7-${s.day||1}-${Math.round(now*10)}-${Math.floor(Math.random()*90+10)}`;
    camps.push({ id, name:site.name, x:site.x, y:site.y, radius:site.radius, integrity:85+Math.floor(Math.random()*16), condition:'Цел', fireRemaining:0, fireIntensity:0, tentCount:1, nextTentAt:now+1.5, rebuildAt:0, createdAt:now, createdAtNight:night, ignitionCause:null, stage:'организация лагеря' });
    this._radio?.('Гражданский','Координатор лагеря',`${site.name}: небольшая группа добровольцев установила первые временные укрытия ${night?'после наступления темноты':'днём'}. Очагов огня нет.`, 'info','citizens');
    this._publishCrisisEvent?.('citizens','camp-established',`Постепенно вырос палаточный лагерь: ${site.name}`,'Лагерь появился после нескольких часов устойчивого присутствия участников и отдельного решения волонтёров; пожар не возник.',{severity:0.25,channel:'Гражданский',speaker:'Волонтёрский пункт',tone:'info'});
  };

  // Clamp the original fire routines to causal sources only. A camp may burn only from a hit or an adjacent live zone.
  const prevFirePhysics = SP._updateFirePhysics;
  SP._updateFirePhysics = function() {
    const s = this.state;
    const validBefore = new Set((s?.fireZones || []).filter(z => z && z.condition === 'Горит' && (z.source || z.ignitionCause)).map(z => z.id));
    const result = prevFirePhysics ? prevFirePhysics.call(this) : undefined;
    if (!s) return result;
    // Drop ghost zones with no active event/object attached. Never delete a valid sourced fire.
    const activeIncidentIds = new Set((s.incidents || []).filter(i => alive(i) && ['fire','arson','building_fire','roof_fire','camp_fire','vehicle_fire'].includes(i.type)).map(i => i.id));
    const burningAssetIds = new Set((s.assets || []).filter(a => a && a.condition === 'Горит').map(a => a.fireZoneId || `ASSET-FIRE-${a.id}`));
    const burningCampIds = new Set((s.campSites || []).filter(c => c && ['Горит','Тлеет'].includes(c.condition)).map(c => `CAMP-${c.id}`));
    const burningBarrierIds = new Set((s.barricades || []).filter(b => b && b.burning).map(b => b.fireZoneId || `BAR-FIRE-${b.id}`));
    s.fireZones = (s.fireZones || []).filter(z => {
      if (!z || z.condition === 'Выжжен') return false;
      if (z.condition === 'Потушено') return Number(z.smokeLife || 0) > 0;
      if (activeIncidentIds.has(z.id) || burningAssetIds.has(z.id) || burningCampIds.has(z.id) || burningBarrierIds.has(z.id)) return true;
      return validBefore.has(z.id) && (z.source || z.ignitionCause);
    });
    for (const c of s.campSites || []) {
      if (!c || !['Горит','Тлеет'].includes(c.condition)) continue;
      const adjacent = s.fireZones.some(z => z && z.id !== `CAMP-${c.id}` && z.condition === 'Горит' && Math.hypot(z.x-c.x,z.y-c.y) < (z.radius||20)+(c.radius||28)*0.68);
      const related = (s.incidents || []).some(i => alive(i) && ['fire','arson','building_fire','roof_fire','camp_fire','vehicle_fire'].includes(i.type) && (i.id === c.incidentId || Math.hypot((i.x||0)-c.x,(i.y||0)-c.y) < (i.fireRadius||16)+(c.radius||28)*0.65));
      if (!c.ignitionCause && !adjacent && !related) {
        c.condition = 'Цел'; c.fireRemaining = 0; c.fireIntensity = 0; c.integrity = Math.max(35, Number(c.integrity || 35));
        s.fireZones = s.fireZones.filter(z => z.id !== `CAMP-${c.id}`);
      }
    }
    return result;
  };

  // Visible-agent count now reaches zero with the attendance ledger instead of retaining a permanent 35-person crowd.
  P._visualCrowdTarget = function() {
    const s = this.sim?.state || {};
    const pop = Math.max(1, Number(s.cityPopulation || this.sim?.config?.cityPopulation || 5000));
    const turnout = clamp(Number(s.crowdTarget ?? 0) / pop, 0, 1);
    const max = Number(this.sim?.config?.maxVisibleAgents || 200);
    if (turnout < 0.0025) return 0;
    return clamp(Math.round(max * Math.pow(turnout, 0.65)), 0, max);
  };

  // Use game-state severity and longer real-time cooldowns; no force action is scheduled immediately at scene creation.
  P.create = function() {
    const result = sceneOld.create ? sceneOld.create.call(this) : undefined;
    this.v7PoliceElapsedMs = 0;
    this.v7PoliceFirstActionAfterMs = 90000;
    this.v7LastActionAtMs = 0;
    this.v7NextActionAtMs = 90000;
    if (this.sim?.state) {
      this.sim.state.v7PacingInitialized = true;
      this.sim.state.crowdObjective = this.sim.state.crowdObjective || 'Добиться публичных слушаний по стоимости жизни';
    }
    return result;
  };

  P._v6SchedulePoliceAction = function(deltaMs, s) {
    if (!s || s.paused || !deltaMs) return;
    this.v7PoliceElapsedMs = (this.v7PoliceElapsedMs || 0) + Math.min(80, deltaMs);
    const elapsed = Number(this.v7PoliceElapsedMs || 0);
    const anger = clamp(s.crowdAnger || 0, 0, 1000);
    const active = (s.incidents || []).filter(alive);
    const majorThreat = active.some(i => ['riot','clash','building_assault','radical_attack','arson','fire','looting','special_vehicle_attack'].includes(i.type));
    const liveFire = (s.fireZones || []).some(z => z && z.condition === 'Горит');
    const gathering = Number(s.crowdTarget || 0) >= 550;
    if (elapsed < (this.v7PoliceFirstActionAfterMs || 42000)) return;
    if (!majorThreat && !liveFire && anger < 185 && !gathering) return;
    if (elapsed < Number(this.v7NextActionAtMs || 0)) return;
    // A threat prompts faster response; calm events retain the option of observation and negotiation.
    const gap = majorThreat || liveFire || anger > 760 ? 8500 : anger > 520 ? 15000 : anger > 280 ? 26000 : 42000;
    this.v7NextActionAtMs = elapsed + gap + Math.random() * gap * 0.28;
    const tools = s.policeTools || {};
    let options;
    if (liveFire || majorThreat) {
      if (anger < 330) options = [['cordon',0.40],['gas',0.25],['physical',0.17],['talk',0.10],['water',0.08]];
      else if (anger < 620) options = [['gas',0.28],['physical',0.26],['water',0.16],['flash',0.12],['cordon',0.10],['rubber',0.08]];
      else options = [['physical',0.24],['rubber',0.24],['gas',0.15],['water',0.14],['flash',0.12],['cordon',0.06],['live',0.05]];
    } else if (anger < 220) options = [['cordon',0.50],['talk',0.35],['gas',0.10],['physical',0.05]];
    else if (anger < 430) options = [['cordon',0.27],['gas',0.30],['physical',0.18],['talk',0.12],['water',0.08],['flash',0.05]];
    else options = [['gas',0.25],['physical',0.24],['rubber',0.17],['water',0.12],['flash',0.12],['cordon',0.06],['live',0.04]];
    const canUse = m => !['gas','water','flash','rubber','live'].includes(m) || Number(tools[m] || 0) > 0;
    const pool = options.filter(([m]) => canUse(m));
    const total = pool.reduce((n, item) => n + item[1], 0) || 1;
    let roll = Math.random() * total, method = pool[pool.length-1]?.[0] || 'cordon';
    for (const [m,w] of pool) { roll -= w; if (roll <= 0) { method = m; break; } }
    const ok = this.sim?.commandPolice?.(method, true);
    if (ok) {
      this.v7LastActionAtMs = elapsed;
      if (this.sim?._updateCrowdObjective) this.sim._updateCrowdObjective();
    }
  };

  // Publish objective instead of a generic caption, and keep the renderer otherwise intact.
  P._renderEnvironment = function(s,time) {
    if (sceneOld._renderEnvironment) sceneOld._renderEnvironment.call(this,s,time);
    this.sim?._updateCrowdObjective?.();
  };
  P.update = function(time,deltaMs) {
    if (sceneOld.update) sceneOld.update.call(this,time,deltaMs);
    this.sim?._updateCrowdObjective?.();
  };

  UP.saveGame = function(automatic = false) {
    try {
      localStorage.setItem('kontur-republic-save-v7_1', JSON.stringify(this.sim.snapshot()));
      const label = document.getElementById('last-save-label');
      if (label) label.textContent = `СОХРАНЕНО v7.1 ${new Date().toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}`;
      if (!automatic) this.toast('Игра сохранена','Сохранены плавная явка, цель движения и причинная модель инцидентов.','success');
      return true;
    } catch (err) { if (!automatic) this.toast('Не удалось сохранить',`Браузер не разрешил запись: ${err.message}`,'error'); return false; }
  };

  UP.loadGame = function() {
    try {
      const keys = ['kontur-republic-save-v7_1','kontur-republic-save-v7','kontur-republic-save-v6','kontur-republic-save-v5','kontur-republic-save-v4','kontur-republic-save-v3','kontur-republic-save-v2'];
      let raw = null, foundKey = null;
      for (const key of keys) { raw = localStorage.getItem(key); if (raw) { foundKey = key; break; } }
      if (!raw) { this.toast('Сохранение не найдено','Сначала сохраните игру.','warning'); return false; }
      const snapshot = JSON.parse(raw);
      this.sim.loadSnapshot(snapshot);
      if (foundKey !== 'kontur-republic-save-v7_1') {
        // Preserve the record/history but remove a runaway old v6 opening state if it is clearly a fresh auto-save disaster.
        const s = this.sim.state;
        if (Number(s.crowdTarget || 0) >= (Number(s.cityPopulation || 5000) * 0.94) && Number(s.crowdAnger || 0) < 300 && !(s.deaths || 0) && !(s.v5BuildingCollapseCount || 0)) {
          s.crowdTarget = 300; s.crowdAnger = 110; s.mobilizationSurge = 0;
          // Legacy v6 could persist an initial runaway crowd/fire. Normalize it only when the saved state
          // has no casualties or collapse history, retaining ordinary historical saves unchanged.
          s.fireZones = []; s.gasZones = []; s.smokeZones = []; s.campSites = []; s.barricades = [];
          s.incidents = (s.incidents || []).filter(i => !['fire','arson','riot','building_assault','radical_attack'].includes(i.type));
          for (const asset of s.assets || []) { asset.integrity = 100; asset.condition = 'Цел'; asset.burning = false; asset.fireZoneId = null; asset.fireIncidentId = null; asset.ignitionCause = null; }
          if (s.building) { s.building.integrity = 100; s.building.status = 'Цел'; s.building.siege = 0; s.building.occupation = false; }
          s.v7PacingInitialized = true; s.v7CampPressureHours = 0; s.v7DeparturePressure = 0;
        }
        s.v7PacingInitialized = true;
        this.sim._updateCrowdObjective?.();
      }
      this.draft = {...this.sim.state.policies}; this._syncPolicyInputs(); this.renderAll(true);
      const label = document.getElementById('last-save-label'); if (label) label.textContent = `ЗАГРУЖЕНО / ${foundKey.toUpperCase()} → v7.1`;
      this.toast('Сохранение загружено','События и история сохранены; темп явки и новые игровые цели работают по модели v7.','success'); return true;
    } catch (err) { this.toast('Ошибка загрузки',`Не удалось прочитать сохранение: ${err.message}`,'error'); return false; }
  };

  UP.updateStats = function() {
    if (uiOld.updateStats) uiOld.updateStats.call(this);
    const footer = document.querySelector('.app-footer span'); if (footer) footer.textContent = 'КОНТУР // ВЕРСИЯ 7.1.0';
  };
  document.addEventListener('DOMContentLoaded', () => {
    const footer = document.querySelector('.app-footer span'); if (footer) footer.textContent = 'КОНТУР // ВЕРСИЯ 7.1.0';
    const subtitle = document.getElementById('world-subtitle');
    if (subtitle && window.gameSimulation?.state?.crowdObjective) subtitle.textContent = window.gameSimulation.state.protestPhase || 'Площадь Республики';
  }, { once:true });
})();
