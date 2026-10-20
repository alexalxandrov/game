'use strict';
/*
 * KONTUR v3 — layered crisis systems.
 * Browser-only extension of the original Phaser/HTML/CSS/JS architecture.
 * Violence, equipment and incident outcomes are abstract simulation tokens.
 */
(function installCrisisLayer() {
  const Sim = window.RepublicSimulation;
  if (!Sim) return;
  const SP = Sim.prototype;
  const clamp = (v, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, Number(v) || 0));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const irnd = (a, b) => Math.floor(rnd(a, b + 1));
  const choose = list => list[Math.floor(Math.random() * list.length)];
  const alive = inc => inc && inc.status !== 'resolved';
  const original = {};
  ['reset','loadSnapshot','tick','_hourlyStep','_dailyStep','_spawnIncident','addNews','serviceArrive','resolveIncident','enactAction','applyPolicies','_estimateCrowdSize','_updatePartySupport'].forEach(k => original[k] = SP[k]);

  SP._initCrisisState = function(migrating = false) {
    const s = this.state;
    const defaults = {
      crowdFatigue: 8, movementAsh: 0, movementDays: 0, publicSupportProtest: 44,
      orderSupport: 38, mediaResonance: 58, rumorLevel: 12,
      doctrine: 'Наблюдение', doctrineCode: 'observe', policeMorale: 72,
      policeFatigue: 12, policeShiftHours: 0, forceCap: 3,
      policeTools: { gas: 14, water: 10, flash: 8, rubber: 22, live: 4 },
      policeCommandOverride: null, policeOrder: 'Наблюдение и защита проходов', policeActionSeq: 0,
      policeLastActionAt: -6, reinforcementRequests: 0, reinforcementETA: 0,
      injuries: [], injuredTotal: 0, woundedLight: 0, woundedMedium: 0, woundedHeavy: 0, woundedCritical: 0, deaths: 0,
      fireZones: [], gasZones: [], smokeZones: [], barricades: [], lootEvents: [],
      building: { integrity: 100, perimeter: 82, status: 'Цел', siege: 0, occupation: false, lastDamageAt: -999 },
      assets: [
        { id:'city-hall-front', name:'Фасад здания правительства', kind:'building', x:640, y:225, radius:75, integrity:100, condition:'Цел', repairCost:24 },
        { id:'transit-stop', name:'Остановка у площади', kind:'street', x:520, y:552, radius:30, integrity:100, condition:'Цел', repairCost:2 },
        { id:'lamp-west', name:'Уличные фонари, запад', kind:'street', x:330, y:492, radius:20, integrity:100, condition:'Цел', repairCost:1 },
        { id:'shop-east', name:'Фасад торгового квартала', kind:'shop', x:1050, y:430, radius:38, integrity:100, condition:'Цел', repairCost:8 },
        { id:'bus-shelter', name:'Стеклянный павильон', kind:'street', x:1110, y:565, radius:28, integrity:100, condition:'Цел', repairCost:3 },
        { id:'bank-west', name:'Отделение банка', kind:'bank', x:225, y:420, radius:40, integrity:100, condition:'Цел', repairCost:16 }
      ],
      roadVehicles: [], serviceFleet: [], vehicleDamageCount: 0, vehiclesBurned: 0, hijackedVehicles: 0,
      radioFeed: [], radioSequence: 0, lastRadioAt: -99, lastRumorAt: -99,
      promises: [], promiseSequence: 0, lastControversialPolicy: null,
      repairsQueue: [], propertyDamageCost: 0, externalAttention: 0,
      stateMode: 'Обычное управление', stateModeCode: 'normal', stateModeChangedAt: 0, activeDistrict: 'center',
      temporaryCabinet: false, investigationOpen: false, investigationCount: 0,
      movementPartyFormed: false, partyFormedAt: null,
      referendum: null, referendumSequence: 0,
      primeMinister: 'Ирина Волкова', ministers: ['Марек Линден · финансы','Софи Ренар · внутренние дела','Ян Вейден · транспорт','Леа Морен · здравоохранение'], resignationCount: 0, ministerResignations: 0, lastResignationAt: -999, lastMinisterResignationAt: -999,
      districts: [
        { id:'center', name:'Площадь и мэрия', kind:'площадь', crowd:0, tension:38, blockage:0.04, incidents:0, contagion:0.16 },
        { id:'station', name:'Вокзальный узел', kind:'перекрёсток', crowd:0, tension:32, blockage:0.03, incidents:0, contagion:0.13 },
        { id:'workers', name:'Рабочий квартал', kind:'проспект', crowd:0, tension:40, blockage:0.02, incidents:0, contagion:0.16 },
        { id:'ring', name:'Кольцевая дорога', kind:'кольцевая', crowd:0, tension:27, blockage:0.02, incidents:0, contagion:0.12 },
        { id:'suburbs', name:'Пригородный сектор', kind:'пригород', crowd:0, tension:28, blockage:0.01, incidents:0, contagion:0.10 }
      ],
      protestsStarted: 0, crackdownCount: 0, promiseBetrayals: 0, lastFlashpointAt: -999,
      crushRisk: 0, supplyShock: 0, movementPeakDay: 1, crisisEvents: 0, historyLog: [],
      doctrineDecisionAt: 0, radioQuiet: false, fireSpreadCount: 0, riotFatigue: 0,
      recentViolenceSource: 'unknown', recentViolenceAt: -999
    };
    Object.keys(defaults).forEach(k => {
      if (s[k] === undefined || s[k] === null) s[k] = JSON.parse(JSON.stringify(defaults[k]));
    });
    if (!Array.isArray(s.injuries)) s.injuries = [];
    if (!Array.isArray(s.fireZones)) s.fireZones = [];
    if (!Array.isArray(s.gasZones)) s.gasZones = [];
    if (!Array.isArray(s.smokeZones)) s.smokeZones = [];
    if (!Array.isArray(s.barricades)) s.barricades = [];
    if (!Array.isArray(s.radioFeed)) s.radioFeed = [];
    if (!Array.isArray(s.promises)) s.promises = [];
    if (!Array.isArray(s.districts)) s.districts = defaults.districts;
    if (!Array.isArray(s.assets)) s.assets = defaults.assets;
    if (!s.building) s.building = defaults.building;
    if (!s.policeTools) s.policeTools = defaults.policeTools;
    if (s.primeMinister) s.primeMinister = String(s.primeMinister);
    if (!Array.isArray(s.ministers) || !s.ministers.length) s.ministers = ['Марек Линден · финансы','Софи Ренар · внутренние дела','Ян Вейден · транспорт','Леа Морен · здравоохранение'];
    // v2 -> v3 soft migration: preserve all prior game state, add defaults only.
    if (migrating) {
      s.cityPopulation = clamp(s.cityPopulation || this.config.cityPopulation || 5000, 500, 10000000);
      s.crowdTarget = clamp(s.crowdTarget || 520, 0, s.cityPopulation);
      s.roadBlockage = clamp(s.roadBlockage || 0.04, 0, 1);
      this._radio('Диспетчерская', 'Система', 'Сохранение предыдущей версии адаптировано к модели кризисов v3; базовые показатели сохранены.', 'info', 'system');
    }
    s.forceCap = clamp(s.forceCap, 0, 7);
    s.cityPopulation = clamp(s.cityPopulation || this.config.cityPopulation || 5000, 500, 10000000);
    s.injuries = s.injuries.slice(-300);
    s.radioFeed = s.radioFeed.slice(0, 80);
    s.promises = s.promises.slice(-50);
    s.barricades = s.barricades.slice(-24);
    s.gasZones = s.gasZones.slice(-20);
    s.fireZones = s.fireZones.slice(-30);
    s.assets.forEach(a => { a.integrity = clamp(a.integrity, 0, 100); a.condition = this._assetCondition(a.integrity, a.condition); });
    if (!s.districts.length) s.districts = defaults.districts;
    s.districts.forEach(d => { d.crowd = Number(d.crowd) || 0; d.tension = clamp(d.tension || 30); d.blockage = clamp(d.blockage || 0, 0, 1); });
    this._updateDistricts(false);
  };

  SP._assetCondition = function(integrity, old) {
    if (integrity <= 0) return 'Разрушен';
    if (old === 'Горит') return 'Горит';
    if (integrity < 30) return 'Сильно повреждён';
    if (integrity < 72) return 'Повреждён';
    return 'Цел';
  };

  SP._radio = function(channel, speaker, text, tone = 'info', source = 'system', incidentId = null) {
    const s = this.state;
    if (!s.radioFeed) s.radioFeed = [];
    const item = {
      id: ++s.radioSequence, day: s.day, hour: s.hour, minute: s.minute || 0,
      channel, speaker, text, tone, source, incidentId, at: Number(s.hoursElapsed) || 0
    };
    s.radioFeed.unshift(item);
    if (s.radioFeed.length > 80) s.radioFeed.length = 80;
    s.lastRadioAt = s.hoursElapsed || 0;
    if (this._notify && !s.radioQuiet) this._notify('radio', item);
    return item;
  };

  SP._eventRecord = function(source, type, title, details = '', severity = 1) {
    const s = this.state;
    s.crisisEvents = (s.crisisEvents || 0) + 1;
    s.historyLog = s.historyLog || [];
    s.historyLog.unshift({ day:s.day, hour:s.hour, source, type, title, details, severity, at:s.hoursElapsed || 0 });
    if (s.historyLog.length > 100) s.historyLog.length = 100;
    s.recentViolenceSource = source;
    s.recentViolenceAt = s.hoursElapsed || 0;
    this._applyCrisisOpinion(source, type, severity);
    const mediaFreedom = clamp(s.policies && s.policies.mediaFreedom != null ? s.policies.mediaFreedom : 50);
    const resonance = clamp(s.mediaResonance == null ? 58 : s.mediaResonance);
    const publicEvent = ['police','protest','citizens','fire','medical','government','random'].includes(source);
    if (publicEvent && severity >= 0.72) {
      const reach = (0.18 + mediaFreedom / 100 * 0.82) * (0.35 + resonance / 100 * 0.65);
      const excluded = ['brutality','martyr','martyr-critical','critical-injury'];
      if (!excluded.includes(type)) s.mobilizationSurge = Math.min(s.cityPopulation || 5000, (s.mobilizationSurge || 0) + Math.round(35 * Math.max(0.2, severity) * reach));
      s.mediaLastReach = Math.round(reach * 100);
      s.crowdFatigue = clamp((s.crowdFatigue || 0) + 0.035 * severity * reach, 0, 100);
    }
  };

  SP._applyCrisisOpinion = function(source, type, severity = 1) {
    const s = this.state;
    const m = Math.max(0.1, severity);
    if (type === 'brutality' || type === 'police-killed' || type === 'police-critical-injury') {
      const mediaFreedom = s.policies && s.policies.mediaFreedom != null ? s.policies.mediaFreedom : (s.mediaFreedom == null ? 50 : s.mediaFreedom);
      const resonance = 0.45 + clamp(mediaFreedom, 0, 100) / 100 * 1.25 + clamp(s.mediaResonance, 0, 100) / 220;
      s.publicAnger = clamp(s.publicAnger + 2.8 * m * resonance);
      s.publicSupportProtest = clamp(s.publicSupportProtest + 3.0 * m * resonance);
      s.orderSupport = clamp(s.orderSupport - 1.6 * m);
      s.mobilizationSurge = Math.min(s.cityPopulation, (s.mobilizationSurge || 0) + Math.round(140 * m * resonance));
      s.trust = clamp(s.trust - 1.3 * m * resonance);
      s.approval = clamp(s.approval - 0.8 * m * resonance);
      s.crackdownCount = (s.crackdownCount || 0) + 1;
      s.investigationOpen = true;
      s.investigationCount = (s.investigationCount || 0) + 1;
    } else if (type === 'looting' || type === 'arson' || type === 'radical-attack' || type === 'special-vehicle-attack') {
      s.publicSupportProtest = clamp(s.publicSupportProtest - 2.3 * m);
      s.orderSupport = clamp(s.orderSupport + 2.5 * m);
      s.trust = clamp(s.trust - 0.3 * m);
      s.publicAnger = clamp(s.publicAnger + 0.6 * m);
    } else if (type === 'peaceful-concession' || type === 'recul') {
      s.publicSupportProtest = clamp(s.publicSupportProtest + 0.6 * m);
      s.orderSupport = clamp(s.orderSupport - 0.3 * m);
    } else if (type === 'negotiated-settlement') {
      s.publicSupportProtest = clamp(s.publicSupportProtest - 1.2 * m);
      s.orderSupport = clamp(s.orderSupport + 0.4 * m);
    }
  };

  SP._publishCrisisEvent = function(source, type, title, body, opts = {}) {
    const severity = opts.severity == null ? 1 : opts.severity;
    const channel = opts.channel || (source === 'police' ? 'Полиция' : source === 'fire' ? 'Пожарные' : source === 'medical' ? 'Медики' : source === 'government' ? 'Правительственный' : source === 'citizens' || source === 'protest' ? 'Гражданский' : 'Диспетчерская');
    const speaker = opts.speaker || ({ police:'Командование', fire:'Начальник смены', medical:'Старший бригады', government:'Правительственный канал', citizens:'Гражданский эфир', protest:'Диспетчер наблюдения', random:'Диспетчерская' })[source] || 'Диспетчерская';
    if (opts.radio !== false) this._radio(channel, speaker, opts.radioText || body, opts.tone || 'info', source, opts.incidentId || null);
    this._eventRecord(source, type, title, body, severity);
    if (opts.news !== false) {
      this._skipNewsRadio = true;
      try { original.addNews.call(this, opts.category || (source === 'government' ? 'politics' : source === 'economy' ? 'economy' : 'city'), opts.level || (severity > 1.4 ? 'critical' : severity > 0.8 ? 'alert' : 'info'), title, body); }
      finally { this._skipNewsRadio = false; }
    }
    if (opts.announce) this.announce(opts.announce, opts.level || 'warning');
    // Every material event prompts an immediate doctrine review, without counting as another duty hour.
    // The guard prevents feedback loops if a doctrine review issues a command that itself creates an event.
    if (!this._doctrineEventReview && typeof this._updatePoliceDoctrine === 'function') {
      this._doctrineEventReview = true;
      try { this._updatePoliceDoctrine(true); } finally { this._doctrineEventReview = false; }
    }
  };

  SP._makeInjury = function(kind, severity, x = 640, y = 420, cause = 'crowd', source = 'protest', victim = null, incidentId = null) {
    const s = this.state;
    const validKinds = ['ушибы и ссадины','перелом','ожог','дым/газ','травма глаз и дыхания','тяжёлая травма','огнестрельная травма','сердечный приступ','давка'];
    if (!validKinds.includes(kind)) kind = 'ушибы и ссадины';
    const grades = ['лёгкая','средняя','тяжёлая','критическая','гибель'];
    const grade = clamp(Math.round(severity), 0, 4);
    const injury = {
      id: `MED-${s.day}-${String((s.injuredTotal || 0) + 1).padStart(4,'0')}`,
      kind, severity: grade, grade: grades[grade], x:clamp(x, 20, 1260), y:clamp(y, 280, 626),
      cause, source, victim: victim || `Гражданин №${(s.injuredTotal || 0) + 1}`,
      incidentId, timer:0, status: grade >= 4 ? 'deceased' : 'awaiting', stabilized:false,
      createdAt:s.hoursElapsed || 0, lastUpdateAt:s.hoursElapsed || 0, visualState: grade >= 3 ? 'лежит' : grade === 2 ? 'сидит' : 'на ногах', martyr:false,
      degradationInterval: kind.includes('сердеч') ? 1 : kind.includes('огнестр') || kind.includes('ожог') ? 1.5 : kind.includes('дым') ? 2 : 2.5
    };
    s.injuries.push(injury);
    if (s.injuries.length > 300) s.injuries.splice(0, s.injuries.length - 300);
    s.injuredTotal = (s.injuredTotal || 0) + 1;
    this._countInjuryGrade(injury, 1);
    if (grade >= 4) this._registerDeath(injury);
    else if (grade >= 3) this._registerMartyrInjury(injury);
    this._radio('Медики', 'Диспетчер медицинской службы', `${injury.id}: ${kind}, тяжесть — ${injury.grade}. Местоположение передано бригаде.`, grade >= 3 ? 'critical' : 'warning', source, incidentId);
    // An untreated casualty is a real dispatchable event. Nearby casualties share a medical call.
    const linkedIncident=incidentId?s.incidents.find(i=>i.id===incidentId):null;
    if (injury.status !== 'deceased' && (!linkedIncident || linkedIncident.type !== 'medical') && s.incidents.filter(i => alive(i)).length < this.config.maxIncidents) {
      injury.sourceIncidentId=incidentId||null;
      let medicalCall = s.incidents.find(i => alive(i) && i.type === 'medical' && Math.hypot((i.x || 0) - injury.x, (i.y || 0) - injury.y) < 185);
      if (!medicalCall) {
        medicalCall = this._spawnIncident('medical');
        if (medicalCall) {
          medicalCall.x = injury.x; medicalCall.y = injury.y;
          medicalCall.severity = Math.max(medicalCall.severity || 0, grade >= 3 ? 78 : 48);
          medicalCall.source = 'medical';
          medicalCall.districtId=linkedIncident&&linkedIncident.districtId||s.activeDistrict||'center';
        }
      }
      if (medicalCall) injury.incidentId = medicalCall.id;
    }
    return injury;
  };

  SP._countInjuryGrade = function(injury, delta) {
    const s = this.state;
    const keys = ['woundedLight','woundedMedium','woundedHeavy','woundedCritical'];
    if (delta < 0) {
      const index = Number.isInteger(injury._countedGrade) ? injury._countedGrade : clamp(injury.severity, 0, 3);
      if (keys[index]) s[keys[index]] = Math.max(0, (s[keys[index]] || 0) - 1);
      injury._countedGrade = null;
    } else {
      const index = clamp(injury.severity, 0, 3);
      if (keys[index]) s[keys[index]] = Math.max(0, (s[keys[index]] || 0) + 1);
      injury._countedGrade = index;
    }
  };

  SP._registerMartyrInjury = function(injury) {
    const s = this.state;
    if (!injury || injury._martyrEventPublished || injury.severity < 3 || injury.status === 'deceased') return;
    injury._martyrEventPublished = true;
    injury.martyr = true;
    s.investigationOpen = true;
    s.investigationCount = (s.investigationCount || 0) + 1;
    s.movementAsh = clamp((s.movementAsh || 0) + 9, 0, 100);
    s.mobilizationSurge = Math.min(s.cityPopulation || 5000, (s.mobilizationSurge || 0) + 175);
    this._publishCrisisEvent(injury.source === 'police' || injury.cause === 'live-fire' || injury.cause === 'force' ? 'police' : 'medical', 'martyr-critical', 'Критическое ранение стало политическим событием', `Пострадавший ${injury.id} получил критическую травму. В публичной повестке возникло требование независимой проверки; обстоятельства занесены в историю республики.`, { severity:1.05, channel:'Медики', speaker:'Старший медицинской бригады', tone:'critical', incidentId:injury.incidentId });
  };

  SP._registerDeath = function(injury) {
    const s = this.state;
    if (injury._deathRegistered) return;
    injury._deathRegistered = true; injury.status = 'deceased'; injury.grade = 'гибель'; injury.martyr = injury.source === 'police' || injury.cause === 'police' || injury.cause === 'force' || injury.cause === 'live-fire';
    s.deaths = (s.deaths || 0) + 1; s.casualties = (s.casualties || 0) + 1;
    if (Number.isInteger(injury._countedGrade)) this._countInjuryGrade(injury, -1);
    const martyrText = injury.martyr ? 'Гибель участника вызвала требование независимого расследования; сформирована памятная акция.' : 'Смерть пострадавшего усилила общественный запрос на помощь семьям и проверку обстоятельств.';
    this._publishCrisisEvent(injury.martyr ? 'police' : 'medical', injury.martyr ? 'martyr' : 'fatality', injury.martyr ? 'Событие-мученик: требование независимого расследования' : 'Медицинская служба сообщила о смерти пострадавшего', martyrText, { severity:injury.martyr ? 2.3 : 1.4, channel:'Медики', speaker:'Старший бригады', tone:'critical', announce:injury.martyr ? 'ЭКСТРЕННОЕ ОПОВЕЩЕНИЕ: поступило сообщение о гибели человека. Просим сохранять проходы свободными. Обстоятельства будут проверены.' : undefined });
    s.movementAsh = clamp((s.movementAsh || 0) + (injury.martyr ? 20 : 7), 0, 100);
    s.mobilizationSurge = Math.min(s.cityPopulation, (s.mobilizationSurge || 0) + (injury.martyr ? 420 : 120));
    s.investigationOpen = true;
  };

  SP._advanceInjuries = function() {
    const s = this.state;
    const now = s.hoursElapsed || 0;
    for (const injury of s.injuries) {
      if (injury.status === 'deceased' || injury.status === 'transported' || injury.status === 'treated') continue;
      if (injury.stabilized) {
        injury.timer += 1;
        if (injury.timer > 3) {
          injury.status = 'transported'; injury.visualState = 'на носилках';
          if (Number.isInteger(injury._countedGrade)) this._countInjuryGrade(injury, -1);
          this._radio('Медики','Диспетчерская',`${injury.id}: транспортировка завершена; пациента передали медицинскому учреждению.`,'good','medical',injury.incidentId);
        }
        continue;
      }
      injury.timer += 1;
      injury.lastUpdateAt = now;
      if (injury.timer >= (injury.degradationInterval || 2.5)) {
        injury.timer = 0;
        if (injury.severity < 4) {
          this._countInjuryGrade(injury, -1);
          injury.severity += 1;
          injury.grade = ['лёгкая','средняя','тяжёлая','критическая','гибель'][injury.severity];
          injury.visualState = injury.severity >= 3 ? 'лежит' : 'сидит';
          if (injury.severity < 4) this._countInjuryGrade(injury, 1);
          this._radio('Медики', 'Диспетчерская', `${injury.id}: состояние ухудшилось до уровня «${injury.grade}»; уточняется время прибытия помощи.`, injury.severity >= 3 ? 'critical' : 'warning', 'medical', injury.incidentId);
          if (injury.severity === 3) this._registerMartyrInjury(injury);
          if (injury.severity >= 4) this._registerDeath(injury);
        }
      }
    }
    // Remove only old resolved records; the archive remains long enough for news and inquiries.
    s.injuries = s.injuries.filter(i => i.status === 'awaiting' || i.status === 'deceased' || (now - (i.createdAt || 0)) < 72);
  };

  SP._updateFirePhysics = function() {
    const s = this.state;
    const weather = s.weather || { id:'clear', temperature:18 };
    const activeFires = s.incidents.filter(i => alive(i) && ['fire','arson'].includes(i.type));
    for (const inc of activeFires) {
      const weatherFactor = weather.id === 'rain' || weather.id === 'storm' ? 0.48 : weather.id === 'heat' || (weather.temperature || 18) > 29 ? 1.35 : 1;
      const windFactor = weather.id === 'storm' ? 1.32 : (s.windSpeed || 0) > 45 ? 1.2 : 1;
      const volunteers=Math.min(2.2,Math.max(0,s.volunteerFireSupport||0)*0.18);
      const growth=inc.serviceProgress&&inc.serviceProgress.fire?-Math.max(2,(inc.fireArea||8)*0.075):Math.max(0.15,(1.2+(inc.fireIntensity||0.6)*2)*weatherFactor*windFactor-volunteers);
      inc.fireArea = clamp((inc.fireArea || 8) + growth, 0, 1000);
      if (inc.serviceProgress && inc.serviceProgress.fire) inc.fireIntensity = Math.max(0.08, (inc.fireIntensity || 0.7) - 0.16);
      else inc.fireIntensity = clamp((inc.fireIntensity || 0.55) + 0.012 * weatherFactor, 0.25, 2.2);
      inc.fireRadius = Math.min(130, 12 + Math.sqrt(Math.max(0, inc.fireArea)) * 5.1);
      inc.smokeRadius = Math.min(220, inc.fireRadius * (1.3 + (weather.id === 'fog' ? 0.5 : 0)));
      inc.windDrift = weather.id === 'storm' ? Math.sin((s.hour || 0) * 0.3) * 24 : (s.windDirection || 1) * (weatherFactor > 1 ? 12 : 4);
      const zone = s.fireZones.find(z => z.id === inc.id);
      const zdata = { id:inc.id, x:inc.x, y:inc.y, area:inc.fireArea, radius:inc.fireRadius, smokeRadius:inc.smokeRadius, intensity:inc.fireIntensity, windDrift:inc.windDrift, source:inc.type, condition:'Горит', at:inc.createdAt };
      if (zone) Object.assign(zone, zdata); else s.fireZones.push(zdata);
      if (inc.fireArea > 24 && (s.hoursElapsed||0)-(inc.lastSmokeCasualtyAt||-999)>3 && Math.random() < 0.11 * (weather.id==='fog'?1.35:1)) {
        inc.lastSmokeCasualtyAt=s.hoursElapsed||0;
        this._makeInjury('дым/газ',Math.random()<0.22?2:Math.random()<0.68?1:0,inc.x+rnd(-inc.smokeRadius*.45,inc.smokeRadius*.45),inc.y+rnd(-inc.smokeRadius*.25,inc.smokeRadius*.25),'smoke','fire',null,inc.id);
      }
      const smokeId=`SMOKE-${inc.id}`;
      let smoke=s.smokeZones.find(z=>z.id===smokeId);
      const smokeData={id:smokeId,sourceId:inc.id,x:inc.x,y:inc.y,radius:inc.smokeRadius,life:3,kind:'fire',intensity:inc.fireIntensity};
      if(smoke) Object.assign(smoke,smokeData); else s.smokeZones.push(smokeData);
      const radius = inc.fireRadius + 12;
      for (const asset of s.assets) {
        if (Math.hypot(asset.x - inc.x, asset.y - inc.y) < radius + (asset.radius || 15)) {
          if (!inc.serviceProgress || !inc.serviceProgress.fire) {
            asset.integrity = clamp(asset.integrity - 1.6 * inc.fireIntensity * weatherFactor, 0, 100);
            asset.condition = asset.integrity <= 0 ? 'Разрушен' : 'Горит';
            asset.lastDamageAt = s.hoursElapsed;
            s.propertyDamageCost += 0.04 * inc.fireIntensity;
            if (asset.kind === 'building') {
              s.building.integrity = clamp(s.building.integrity - 0.7 * inc.fireIntensity, 0, 100);
              s.building.status = s.building.integrity <= 0 ? 'Разрушено' : s.building.integrity < 45 ? 'Сильно повреждено' : 'Повреждено';
            }
          }
        }
      }
      if ((inc.fireArea || 0) > 45 && !inc.spreadCooldown) {
        inc.spreadCooldown = 0;
        if (Math.random() < 0.055 * weatherFactor && activeFires.length < 5 && s.incidents.filter(alive).length < this.config.maxIncidents) {
          inc.spreadCooldown = 4;
          const drift=Number(inc.windDrift)||0;
          // Secondary fires start near the active fire front; wind shifts the local spread instead of teleporting it.
          const candidates=[
            {x:inc.x+drift*2.0+rnd(-28,28),y:inc.y+rnd(-24,24)},
            {x:inc.x+drift*1.5+rnd(-48,48),y:inc.y+rnd(-34,34)},
            {x:inc.x+rnd(-66,66),y:inc.y+rnd(-46,46)}
          ];
          const target=choose(candidates);
          const next = this._spawnIncident('fire');
          if (next) { next.x = clamp(target.x,50,1230); next.y = clamp(target.y,300,630); next.fireArea = 4; next.fireIntensity = 0.5; next.spreadFrom = inc.id; s.fireSpreadCount = (s.fireSpreadCount || 0) + 1; this._radio('Пожарные','Диспетчерская',`Вторичный очаг зафиксирован рядом с ${inc.label.toLowerCase()}; требуется дополнительная бригада.`, 'critical','fire',next.id); }
        }
      }
      if (inc.spreadCooldown > 0) inc.spreadCooldown -= 1;
      s.pollution = clamp(s.pollution + 0.16 * inc.fireIntensity, 0, 100);
    }
    s.fireZones = s.fireZones.filter(z => activeFires.some(i => i.id === z.id));
    // A structure stops burning after every nearby active source is contained; repairs can then begin.
    for (const asset of s.assets) {
      if (asset.condition === 'Горит') {
        const nearbyFire=activeFires.some(i=>Math.hypot(asset.x-i.x,asset.y-i.y)<(i.fireRadius||20)+(asset.radius||15));
        if(!nearbyFire) asset.condition=this._assetCondition(asset.integrity,'Повреждён');
      }
      if (asset.condition === 'Горит') continue;
      if (asset.integrity < 100 && s.treasury > -2 && Math.random() < 0.24 + (s.policies.infrastructure || 50) * 0.002) {
        const cost = (asset.repairCost || 3) / 1000;
        if (s.treasury >= cost) {
          s.treasury -= cost; asset.integrity = clamp(asset.integrity + 1.5 + (s.policies.infrastructure || 50)*0.02,0,100);
          asset.condition = this._assetCondition(asset.integrity, asset.condition);
        }
      }
    }
  };

  SP._updateBarricades = function() {
    const s = this.state;
    for (const b of s.barricades) {
      if (b.status === 'cleared' || b.status === 'burned') continue;
      if (b.burning) { b.health = Math.max(0, b.health - 12); b.condition = 'Горит'; }
      if (b.health <= 0) { b.status = b.burning ? 'burned' : 'cleared'; continue; }
      if (b.status === 'building') { b.health = Math.min(b.maxHealth || 100, b.health + 10); if (b.health >= (b.maxHealth || 100)) b.status = 'standing'; }
    }
    s.barricades = s.barricades.filter(b => b.status !== 'cleared' && b.status !== 'burned');
    const blockadePower = s.barricades.reduce((sum,b) => sum + (b.health/100) * 0.10,0);
    const firePower = s.fireZones.reduce((sum,z) => sum + Math.min(0.08,(z.area||0)*0.00025),0);
    const crowdRatio = (s.crowdTarget || 0) / Math.max(1,s.cityPopulation || 5000);
    s.roadBlockage = clamp(0.025 + Math.max(0,crowdRatio - 0.08)*1.15 + (s.activeStrikes || 0)*0.115 + blockadePower + firePower + (s.tension > 75 ? 0.07 : 0),0.02,0.98);
  };

  SP._updateDistricts = function(emit = true, stepTension = true) {
    const s=this.state, districts=s.districts||[];
    if(!districts.length) return;
    const total=Math.round(clamp(s.crowdTarget||0,0,s.cityPopulation||5000));
    const weights=[0.38,0.17,0.19,0.12,0.14].slice(0,districts.length);
    const weightSum=weights.reduce((a,b)=>a+b,0)||1;
    const raw=districts.map((d,i)=>Math.max(0,total*(weights[i]||0.1)/weightSum+(d.contagion||0)*Math.max(0,s.mobilizationSurge||0)*0.05-(s.crowdFatigue||0)*total*0.00008));
    const rawSum=raw.reduce((a,b)=>a+b,0)||1, scaled=raw.map(v=>v*Math.min(1,total/rawSum));
    let assigned=0;
    districts.forEach((d,i)=>{
      const active=s.incidents.filter(inc=>alive(inc)&&(inc.districtId||'center')===d.id);
      d.incidents=active.length;
      d.crowd=i===districts.length-1?Math.max(0,total-assigned):Math.round(scaled[i]||0);
      assigned+=d.crowd;
      const neighbor=districts[(i+1)%districts.length];
      const baseTension=(s.tension||38)+(d.crowd/Math.max(1,s.cityPopulation||5000))*22+d.incidents*3.2+(d.blockage||0)*13;
      if (stepTension) d.tension=clamp((d.tension||30)*0.72+baseTension*0.28+((neighbor&&neighbor.tension>65)?2.2:0),4,100);
      else d.tension=clamp(d.tension||30,4,100);
      d.blockage=clamp(0.015+(d.crowd/Math.max(1,s.cityPopulation||5000)-0.04)*1.55+d.incidents*0.055+(d.tension>75?0.10:0),0.01,0.95);
    });
    // Guard against rounding drift when the number of defined districts changes.
    const totalAssigned=districts.reduce((n,d)=>n+d.crowd,0);
    if(totalAssigned!==total) districts[districts.length-1].crowd=Math.max(0,districts[districts.length-1].crowd+total-totalAssigned);
    if(emit)this._notify('districts');
  };

  SP._districtAnchor = function(id) {
    return ({
      center:{x:640,y:426}, station:{x:220,y:413}, workers:{x:360,y:510},
      ring:{x:1010,y:518}, suburbs:{x:1100,y:352}
    })[id] || {x:640,y:426};
  };

  SP._maybeDistrictEvents = function() {
    const s=this.state, now=s.hoursElapsed||0;
    for (const district of (s.districts||[])) {
      if (district.tension < 61 || now-(district.lastIncidentAt||-999)<4) continue;
      const activeHere=s.incidents.some(i=>alive(i)&&(i.districtId||'center')===district.id);
      const probability=clamp((district.tension-56)*0.00125 + (district.blockage>0.55?0.025:0),0,0.085);
      if (activeHere || Math.random()>=probability || s.incidents.filter(alive).length>=this.config.maxIncidents) continue;
      let type;
      if (district.kind==='кольцевая' || district.kind==='перекрёсток') type=choose(['blockade','accident','clash']);
      else if (district.kind==='пригород') type=choose(['demonstration','blockade','medical']);
      else if (district.kind==='проспект') type=choose(['blockade','clash','fire']);
      else type=choose(district.tension>82?['clash','riot','fire','looting']:['demonstration','blockade','clash']);
      const inc=this._spawnIncident(type);
      if (!inc) continue;
      inc.districtId=district.id; inc.locationType=district.kind;
      const anchor=this._districtAnchor(district.id);
      inc.x=clamp(anchor.x+rnd(-46,46),30,1250); inc.y=clamp(anchor.y+rnd(-28,28),285,625);
      district.lastIncidentAt=now;
      this._radio('Диспетчерская','Региональный диспетчер',`В секторе «${district.name}» зарегистрировано событие ${inc.label.toLowerCase()}; камеры местного узла передают данные в общий штаб.`,inc.severity>75?'critical':'warning','random',inc.id);
      break;
    }
  };

  SP._updatePoliceDoctrine = function(eventDriven = false) {
    const s = this.state;
    const active = s.incidents.filter(alive);
    const activeRiots = active.filter(i => ['riot','clash','looting','building_assault','radical_attack'].includes(i.type)).length;
    const buildingThreat = (s.building.integrity < 70) || s.building.siege > 0 || active.some(i => i.type === 'building_assault');
    const forceInLimits = s.forceCap || 0;
    const crowdRatio = (s.crowdTarget || 0) / Math.max(1, (s.policePresence || 30) * 24 + (s.militaryDeployed ? 420 : 0));
    if (!eventDriven) {
      s.policeShiftHours = (s.policeShiftHours || 0) + 1;
      s.policeFatigue = clamp((s.policeFatigue || 0) + 0.42 + (activeRiots > 0 ? 0.28 : 0) - ((s.policeShiftHours % 12 === 0) ? 1.8 : 0));
      s.policeMorale = clamp((s.policeMorale || 70) + (s.policies.policing - 50)*0.006 + (s.policeFatigue > 60 ? -0.38 : 0.04) + (s.trust < 30 ? -0.12 : 0.06) + (s.emergencyDays ? -0.08 : 0));
    }
    let doctrine = 'Наблюдение', code = 'observe';
    if (s.policeCommandOverride && s.hoursElapsed < s.policeCommandOverride.until) {
      doctrine = s.policeCommandOverride.label; code = s.policeCommandOverride.code;
    } else {
      s.policeCommandOverride = null;
      if (buildingThreat) { doctrine = 'Защита объекта'; code = 'protect'; }
      else if (crowdRatio > 2.0 || (s.policeMorale < 22 && activeRiots > 0)) { doctrine = 'Отступление'; code = 'withdraw'; }
      else if (activeRiots > 0 && (s.tension > 72 || s.policeFatigue < 52)) { doctrine = 'Сдерживание'; code = 'contain'; }
      else if (s.tension > 83 && forceInLimits >= 3 && activeRiots > 1 && s.policeMorale > 45) { doctrine = 'Разгон'; code = 'disperse'; }
      else if (active.length > 1 || s.tension > 55) { doctrine = 'Сдерживание'; code = 'contain'; }
      if (s.policeFatigue > 78 && Math.random() < 0.6) { doctrine = 'Отступление'; code = 'withdraw'; }
    }
    const changed = code !== s.doctrineCode;
    s.doctrine = doctrine; s.doctrineCode = code; s.doctrineDecisionAt = s.hoursElapsed;
    if (changed && this._radio) this._radio('Полиция','Дежурный командир',`Доктрина обновлена: ${doctrine.toLowerCase()}. Мораль ${Math.round(s.policeMorale)}/100, усталость ${Math.round(s.policeFatigue)}/100.`, code === 'disperse' ? 'warning' : 'info','police');
    // Event-driven reviews choose doctrine instantly but do not issue repeated tactical actions.
    if (eventDriven) return;
    // Autonomous command decisions are not overwritten by a user order unless the explicit priority interval is active.
    if (s.policeCommandOverride && s.hoursElapsed < s.policeCommandOverride.until) return;
    const hoursSinceAction = (s.hoursElapsed || 0) - (s.policeLastActionAt || -9);
    if (hoursSinceAction < 2.2 || Math.random() > 0.58) return;
    if (code === 'withdraw') {
      s.policeOrder = 'Отвести отдельные группы, сохранить коридоры для медиков';
      this._radio('Полиция','Командир сектора','Численное преимущество у толпы; отдельные патрули отходят к безопасному рубежу.','warning','police');
    } else if (code === 'protect') {
      s.policeOrder = 'Усилить охраняемый периметр здания';
      s.building.perimeter = clamp(s.building.perimeter + 2.5);
      this._radio('Полиция','Командир объекта','Периметр усилен; проход для служб остаётся открытым.','warning','police');
    } else if (code === 'contain') {
      s.policeOrder = 'Сдерживание и разделение конфликтующих сторон';
      if (activeRiots > 0 && Math.random() < 0.24) this._policeContact(null, 'AI');
    } else if (code === 'disperse') {
      s.policeOrder = 'Штаб обсуждает ограниченное применение средств принуждения';
      if (Math.random() < 0.20 && forceInLimits >= 2) this.commandPolice(s.policeTools.gas > 0 ? 'gas' : 'physical', true);
    } else {
      s.policeOrder = 'Наблюдение; непосредственного вмешательства нет';
      if (active.length === 0 && s.tension < 48) s.policeFatigue = Math.max(0,s.policeFatigue - 0.5);
    }
    s.policeLastActionAt = s.hoursElapsed || 0;
  };

  SP._policeContact = function(target = null, source = 'police') {
    const s = this.state;
    const x = target && Number.isFinite(target.x) ? target.x : 640 + rnd(-160,160);
    const y = target && Number.isFinite(target.y) ? target.y : 410 + rnd(-65,90);
    const chances = clamp(0.2 + s.policeFatigue/220 + (s.doctrineCode === 'disperse' ? 0.18 : 0) - (s.doctrineCode === 'withdraw' ? 0.22 : 0),0.03,0.72);
    if (Math.random() < chances) {
      const n = irnd(1, Math.max(1, Math.min(4, Math.ceil((s.policePresence || 30)/24))));
      s.arrests = (s.arrests || 0) + n;
      this._radio('Полиция','Патруль','Один участник задержан для установления обстоятельств; медицинский коридор не перекрыт.','warning','police');
      if (Math.random() < 0.45) this._makeInjury('ушибы и ссадины',0,x,y,'contact','police',null,null);
      if (source !== 'AI') s.policeActionSeq = (s.policeActionSeq || 0) + 1;
      return { detained:true, count:n, x, y };
    }
    this._radio('Полиция','Патруль','Попытка задержания не завершена; сотрудники сохраняют дистанцию.','info','police');
    return { detained:false, count:0, x,y };
  };

  SP.commandPolice = function(method, autonomous = false) {
    const s = this.state;
    const methods = {
      talk:{label:'Переговоры на линии',code:'talk',level:0,trust:-0.2,anger:-5,order:'Переговорщики работают на линии; коридоры для служб остаются открытыми'},
      cordon:{label:'Кордон и защита периметра',code:'cordon',level:1,trust:-0.6,anger:1.5,order:'Построение кордона; задача — защита объекта и разделение конфликтующих групп'},
      gas:{label:'Слезоточивый газ',code:'gas',level:2,trust:-2.2,anger:5,order:'Зона раздражающего аэрозоля отмечена; доступна помощь людям, покидающим сектор'},
      water:{label:'Водомёт',code:'water',level:3,trust:-3.1,anger:6.5,order:'Зона водомёта обозначена; движение толпы нарушено, медики приведены в готовность'},
      flash:{label:'Светошумовые средства',code:'flash',level:3,trust:-3.4,anger:8,order:'Зафиксирован эпизод паники; диспетчерская направляет медиков для предупреждения давки'},
      physical:{label:'Физический контакт и задержания',code:'physical',level:4,trust:-4.1,anger:9,order:'Произошёл физический контакт; фиксируются задержания и травмы'},
      rubber:{label:'Нелетальные боеприпасы (абстрактная модель)',code:'rubber',level:5,trust:-7,anger:15,order:'Зарегистрированы тяжёлые травмы; введена проверка пропорциональности действий'},
      live:{label:'Крайнее применение огнестрельного оружия (абстрактная модель)',code:'live',level:7,trust:-18,anger:30,order:'Критический инцидент; применение силы немедленно передано на независимое расследование'},
      retreat:{label:'Отступление и снижение контакта',code:'withdraw',level:0,trust:1.3,anger:-2.5,order:'Командование приказало отступить и сохранить медицинские проходы'},
      corridor:{label:'Коридор для экстренных служб',code:'corridor',level:0,trust:0.6,anger:-1,order:'Полиция формирует коридор для пожарных и скорой помощи'},
      rotate:{label:'Ротация смены',code:'rotate',level:0,trust:0.4,anger:0,order:'Уставшие группы заменены; начинается короткая восстановительная смена'},
      reinforce:{label:'Запрос подкрепления извне города',code:'reinforce',level:1,trust:-0.3,anger:1,order:'Запрошено подкрепление; расчётное прибытие зависит от дорожной обстановки'},
      arrest:{label:'Точечное задержание',code:'physical',level:4,trust:-1.3,anger:3,order:'Начата попытка точечного задержания конкретного нарушителя'},
      deescalate:{label:'Снижение напряжённости',code:'talk',level:0,trust:1.1,anger:-4,order:'Штаб отозвал эскалационные приказы, усилена связь с организаторами'}
    };
    const cfg = methods[method];
    if (!cfg) return false;
    if (cfg.level > (s.forceCap == null ? 3 : s.forceCap)) {
      this._radio('Полиция','Дежурный командир',`Приказ «${cfg.label}» отклонён: верхняя граница силы установлена на уровне ${s.forceCap}/7.`, 'warning','police');
      this._notify('toast',{message:`Приказ не выполнен: допустимый уровень силы ${s.forceCap}/7.`,tone:'warning'});
      return false;
    }
    const toolKey = method === 'gas' ? 'gas' : method === 'water' ? 'water' : method === 'flash' ? 'flash' : method === 'rubber' ? 'rubber' : method === 'live' ? 'live' : null;
    if (toolKey && (!s.policeTools || s.policeTools[toolKey] <= 0)) {
      this._radio('Полиция','Склад снабжения',`Средство «${cfg.label}» недоступно: запас исчерпан. Запросите пополнение.`, 'warning','police');
      this._notify('toast',{message:'Запас средства исчерпан; оно будет недоступно до пополнения.',tone:'warning'});
      return false;
    }
    if (toolKey) s.policeTools[toolKey] -= 1;
    const now = s.hoursElapsed || 0;
    s.policeOrder = cfg.order;
    s.lastAction = cfg.order;
    s.policeLastActionAt = now;
    s.policeActionSeq = (s.policeActionSeq || 0) + 1;
    s.lastPoliceAction = { seq:s.policeActionSeq, method, label:cfg.label, autonomous:!!autonomous, at:now };
    if (!autonomous) s.policeCommandOverride = { code:cfg.code, label:cfg.label, until:now + (['talk','deescalate','corridor','rotate'].includes(method) ? 2 : 1.5) };
    s.doctrine = cfg.label; s.doctrineCode = cfg.code;
    s.publicAnger = clamp(s.publicAnger + cfg.anger * (method === 'live' ? 1 : 0.75));
    s.trust = clamp(s.trust + cfg.trust);
    s.policeFatigue = clamp(s.policeFatigue + (cfg.level > 2 ? 4.2 : 0.8));
    s.policeMorale = clamp(s.policeMorale + (method === 'retreat' ? -1.5 : method === 'rotate' ? 7 : cfg.level > 3 ? -3 : 0.6));
    s.recentViolenceSource = 'police'; s.recentViolenceAt = now;

    if (method === 'talk' || method === 'deescalate') {
      s.publicSupportProtest = clamp(s.publicSupportProtest - 1.5);
      s.tension = clamp(s.tension - 4.5); s.mobilizationSurge = Math.max(0,(s.mobilizationSurge || 0)-100);
      if (Math.random() < 0.55) s.activeStrikes = Math.max(0,(s.activeStrikes || 0)-1);
    } else if (method === 'cordon') {
      s.building.perimeter = clamp(s.building.perimeter + 12);
      s.barricades.forEach(b => { if (Math.random() < 0.4) b.health = Math.max(0,b.health-10); });
      s.roadBlockage = clamp(s.roadBlockage + 0.03,0,1);
    } else if (method === 'gas') {
      const zone={id:`GAS-${s.day}-${s.policeActionSeq}`,x:640+rnd(-160,160),y:415+rnd(-65,85),radius:95,life:3,intensity:1,source:'police'};
      s.gasZones.unshift(zone); s.smokeZones.unshift({ ...zone, radius:120, kind:'gas' });
      const count=irnd(2,5); for(let i=0;i<count;i++) this._makeInjury('дым/газ',Math.random()<0.28?1:0,zone.x+rnd(-zone.radius,zone.radius),zone.y+rnd(-zone.radius*.5,zone.radius*.5),'gas','police',null,null);
      s.crowdFatigue=clamp(s.crowdFatigue+3); s.mobilizationSurge=Math.min(s.cityPopulation,(s.mobilizationSurge||0)+100);
    } else if (method === 'water') {
      const zone={id:`WATER-${s.day}-${s.policeActionSeq}`,x:640+rnd(-100,100),y:470+rnd(-25,70),radius:130,life:1.8,intensity:1,source:'police'};
      s.gasZones.unshift({ ...zone, kind:'water' });
      for(let i=0;i<irnd(2,6);i++) this._makeInjury(Math.random()<0.55?'ушибы и ссадины':'перелом',Math.random()<0.35?2:1,zone.x+rnd(-zone.radius,zone.radius),zone.y+rnd(-zone.radius*.4,zone.radius*.4),'water','police',null,null);
      s.crushRisk=clamp(s.crushRisk+12); s.tension=clamp(s.tension+3);
    } else if (method === 'flash') {
      const zone={id:`FLASH-${s.day}-${s.policeActionSeq}`,x:640+rnd(-120,120),y:410+rnd(-65,75),radius:110,life:0.65,intensity:1,source:'police',kind:'flash'};
      s.gasZones.unshift(zone); s.crushRisk=clamp(s.crushRisk+28);
      for(let i=0;i<irnd(3,7);i++) this._makeInjury('давка',Math.random()<0.22?2:0,zone.x+rnd(-zone.radius,zone.radius),zone.y+rnd(-zone.radius*.5,zone.radius*.5),'panic','police',null,null);
      s.crowdFatigue=clamp(s.crowdFatigue+8);
    } else if (method === 'physical' || method === 'arrest') {
      const result=this._policeContact(null, autonomous?'AI':'police');
      if(Math.random()<0.62) this._makeInjury(Math.random()<0.28?'перелом':'ушибы и ссадины',Math.random()<0.22?2:0,result.x,result.y,'contact','police',null,null);
      s.crushRisk=clamp(s.crushRisk+8);
    } else if (method === 'rubber') {
      for(let i=0;i<irnd(2,4);i++) this._makeInjury('тяжёлая травма',Math.random()<0.48?3:2,640+rnd(-160,160),420+rnd(-65,80),'projectile','police',null,null);
      s.crushRisk=clamp(s.crushRisk+14);
    } else if (method === 'live') {
      const count=irnd(1,3);
      for(let i=0;i<count;i++) this._makeInjury('огнестрельная травма',Math.random()<0.42?4:3,640+rnd(-100,100),420+rnd(-50,65),'live-fire','police',null,null);
      s.investigationOpen=true; s.externalAttention=clamp(s.externalAttention+24); s.stability=clamp(s.stability-6);
    } else if (method === 'retreat') {
      s.policePresence=clamp(s.policePresence-3); s.policeFatigue=Math.max(0,s.policeFatigue-4); s.tension=clamp(s.tension-1.5);
    } else if (method === 'corridor') {
      s.emergencyCorridor=true; s.corridorUntil=now+3; s.roadBlockage=clamp(s.roadBlockage-0.20,0.02,0.98);
      s.barricades.forEach(b=>{if(b.x>500&&b.x<800)b.health=Math.max(0,b.health-22);});
    } else if (method === 'rotate') {
      s.policeFatigue=Math.max(0,s.policeFatigue-34); s.policeMorale=clamp(s.policeMorale+9); s.policeShiftHours=0;
      s.policeTools.gas=Math.min(24,(s.policeTools.gas||0)+4); s.policeTools.flash=Math.min(14,(s.policeTools.flash||0)+2); s.policeTools.water=Math.min(18,(s.policeTools.water||0)+3);
    } else if (method === 'reinforce') {
      s.reinforcementRequests=(s.reinforcementRequests||0)+1; s.reinforcementETA=2+Math.ceil((s.roadBlockage||0)*6);
      s.vehicleOrders.push({id:++s.vehicleSequence,service:'police',x:640,y:414,incidentId:null,purpose:'reinforcement',external:true,eta:s.reinforcementETA});
      s.policePresence=clamp(s.policePresence+5);
    }
    if (['gas','water','flash','physical','rubber','live'].includes(method)) {
      const brutalityOdds = clamp(({gas:.11,water:.16,flash:.17,physical:.24,rubber:.37,live:.82})[method] + s.policeFatigue/450 + (s.doctrineCode==='disperse'?.16:0) - (s.doctrineCode==='contain'?.07:0),.02,.96);
      if (Math.random()<brutalityOdds) {
        this._publishCrisisEvent('police','brutality','Поступили жалобы на непропорциональное применение силы','Независимые наблюдатели сообщают о спорном силовом эпизоде. Видеозаписи и показания направлены комиссии; общественный отклик зависит от свободы СМИ.',{severity:method==='live'?2.0:method==='rubber'?1.4:0.9,channel:'Гражданский',speaker:'Группа наблюдателей',tone:'critical',announce:'ОПЕРАТИВНОЕ СООБЩЕНИЕ: опубликована жалоба на применение силы. Просим не распространять неподтверждённые сведения; комиссия проверит обстоятельства.'});
      }
      if(method==='rubber' || method==='live') s.investigationOpen=true;
    }
    this._radio('Полиция',autonomous?'Автономное командование':'Правительственный штаб',cfg.order, cfg.level>=5?'critical':cfg.level>=2?'warning':'info','police');
    if(!autonomous) this._publishCrisisEvent('government','police-order',`Приказ штаба: ${cfg.label}`,cfg.order,{severity:cfg.level>=5?1.4:0.35,news:false,radio:false});
    this._notify('police-command',{method,autonomous,seq:s.policeActionSeq});
    return true;
  };

  SP.setForceCap = function(value) {
    const s=this.state; s.forceCap=clamp(Math.round(value),0,7);
    this._radio('Правительственный','Кабинет министров',`Установлена верхняя граница допустимой силы: ${s.forceCap}/7. Командование сохраняет автономию в рамках ограничения.`, 'info','government');
    this._notify('update');
  };

  SP._createBarricade = function(x=640,y=558, source='protest') {
    const s=this.state;
    if(s.barricades.filter(b=>b.status!=='cleared'&&b.status!=='burned').length>=18) return null;
    const b={id:`BAR-${s.day}-${s.barricades.length+1}-${irnd(10,99)}`,x:clamp(x,100,1180),y:clamp(y,540,600),health:irnd(42,78),maxHealth:100,status:'building',condition:'Строится',burning:false,source,createdAt:s.hoursElapsed||0};
    s.barricades.push(b); s.roadBlockage=clamp(s.roadBlockage+0.04,0,0.98);
    this._radio('Гражданский','Наблюдатель на улице','На проезжей части формируется временная баррикада из уличных предметов; движение меняет маршрут.','warning',source);
    if(source==='protest') this._applyCrisisOpinion('protest','blockade',0.4);
    return b;
  };

  SP._updateCrowdDynamics = function() {
    const s=this.state, now=s.hoursElapsed||0;
    const active=s.incidents.filter(alive);
    const riots=active.filter(i=>['riot','clash','looting','building_assault','radical_attack'].includes(i.type)).length;
    const protests=active.filter(i=>['demonstration','blockade'].includes(i.type)).length;
    const d=now-(s.lastFlashpointAt||-999);
    s.crushRisk=clamp((s.crushRisk||0)*0.90 + (s.crowdTarget/Math.max(1,s.cityPopulation)>0.6?4:0) + (s.tension>80?4:0) + (s.doctrineCode==='flash'||s.doctrineCode==='water'?8:0) - (s.emergencyCorridor?5:0));
    if(s.crushRisk>52 && d>3 && Math.random()<0.28) {
      s.lastFlashpointAt=now;
      const n=irnd(2,5);
      for(let i=0;i<n;i++) this._makeInjury('давка',Math.random()<0.15?2:0,640+rnd(-220,220),450+rnd(-60,100),'panic','crowd',null,null);
      this._publishCrisisEvent('protest','crush','Паника вызвала локальную давку','Люди пытаются выйти из плотного сектора. Координаторы просят открыть проход, медицинские бригады проверяют пострадавших.',{severity:0.9,channel:'Гражданский',speaker:'Волонтёр на площади',tone:'critical'});
      s.protestPhase='Давка и исход из плотного сектора';
    }
    // Flashpoints can jump the phase even when aggregate tension is only moderate.
    const flashpoint = active.find(i => !i.flashpointApplied && (i.type==='building_assault'||i.type==='gas'||i.type==='riot'||i.type==='radical_attack'||i.type==='fire'));
    if(flashpoint && s.tension>43) {
      flashpoint.flashpointApplied=true; s.lastFlashpointAt=now; s.phaseCode='clashes';
      s.protestPhase='Столкновения: единичный эпизод изменил обстановку';
      s.publicAnger=clamp(s.publicAnger+3); s.mobilizationSurge=Math.min(s.cityPopulation,(s.mobilizationSurge||0)+irnd(100,260));
      this._radio('Гражданский','Координатор группы','Обстановка резко изменилась после локального инцидента. Разные группы спорят о дальнейших действиях.','warning','protest',flashpoint.id);
    }
    const ratio=s.crowdTarget/Math.max(1,s.cityPopulation);
    if(riots>0) { s.phaseCode='clashes'; s.protestPhase= active.some(i=>i.type==='looting')?'Столкновения и эпизоды мародёрства':'Столкновения в отдельных секторах'; }
    else if(s.building.siege>15) { s.phaseCode='pressure'; s.protestPhase='Давление на периметр здания'; }
    else if(ratio>0.48 || protests>1) { s.phaseCode='march'; s.protestPhase='Многотысячный марш и дорожные блокады'; }
    else if(s.tension>54) { s.phaseCode='pressure'; s.protestPhase='Давление на кабинет и переговорная мобилизация'; }
    else { s.phaseCode='assembly'; s.protestPhase='Гражданское собрание'; }
    if(riots>0) s.riotFatigue=clamp((s.riotFatigue||0)+1.6);
    else s.riotFatigue=Math.max(0,(s.riotFatigue||0)-0.6);
    // Casseurs/looters and radical fringe are a small tail, not the whole movement.
    if(s.tension>63 && ratio>0.12 && now-(s.lastLootAt||-99)>4 && Math.random()<(s.tension>82?.18:.06)) {
      s.lastLootAt=now;
      const targets=['банк','премиальный магазин','продовольственный магазин','здание мэрии'];
      const target=choose(targets);
      const inc=this._spawnIncident('looting');
      if(inc){inc.lootTarget=target;inc.districtId=choose(['center','station','workers']);}
      this._publishCrisisEvent('protest','looting',`Зафиксирована попытка мародёрства: цель — ${target}`,`Небольшая группа отделилась от собрания; большинство участников не присоединилось. Общественная оценка акции стала более неоднородной.`,{severity:0.9,channel:'Гражданский',speaker:'Городской наблюдатель',tone:'warning'});
    }
    if(s.tension>70 && ratio>0.26 && now-(s.lastBarricadeAt||-99)>4 && Math.random()<(s.tension>82?.24:.10)) {
      // Construction and ignition are separate events. A new barrier never starts burning by itself.
      s.lastBarricadeAt=now; this._createBarricade(640+rnd(-180,180),566,'protest');
    }
    if(s.tension>80 && ratio>0.54 && s.building.integrity>0 && now-(s.lastSiegeAt||-99)>8 && Math.random()<0.12) {
      s.lastSiegeAt=now; s.building.siege=clamp(s.building.siege+irnd(12,28));
      const inc=this._spawnIncident('building_assault');
      if(inc){inc.districtId='center';inc.x=640+rnd(-80,80);inc.y=290+rnd(0,35);}
      this._publishCrisisEvent('protest','building-assault','Группа участников приблизилась к периметру здания правительства','Остальные организаторы призывают не заходить внутрь. Охрана усиливает периметр, входы для служб остаются обозначены.',{severity:1.25,channel:'Полиция',speaker:'Командир охраны',tone:'critical'});
    }
    if(s.tension>84 && ratio>0.32 && now-(s.lastRadicalAt||-999)>9 && Math.random()<0.025) {
      s.lastRadicalAt=now;
      const inc=this._spawnIncident('radical_attack');
      if(inc){inc.label='Редкий инцидент с тяжёлым оружием (абстрактный токен)';inc.severity=94;inc.districtId=choose(['center','station','workers']);}
      this._publishCrisisEvent('protest','radical-attack','Зарегистрирован редкий тяжёлый инцидент','Событие моделируется как абстрактный токен с серьёзными последствиями; участники, не относящиеся к радикальной группе, отходят от места происшествия.',{severity:1.8,channel:'Диспетчерская',speaker:'Оперативный дежурный',tone:'critical',announce:'ЭКСТРЕННОЕ ОПОВЕЩЕНИЕ: в одном секторе зарегистрирован тяжёлый инцидент. Отойдите от зоны происшествия, оставьте доступ экстренным службам.'});
      if(inc && Math.random()<0.65) this._makeInjury('огнестрельная травма',Math.random()<0.4?4:3,inc.x,inc.y,'radical-attack','protest',null,inc.id);
    }
  };

  SP._advancePromises = function() {
    const s=this.state, now=s.hoursElapsed||0;
    for(const promise of s.promises) {
      if(promise.status!=='pending') continue;
      if(now>=promise.deadlineAt) {
        promise.status='overdue'; s.promiseBetrayals=(s.promiseBetrayals||0)+1;
        s.publicAnger=clamp(s.publicAnger+9); s.trust=clamp(s.trust-5); s.tension=clamp(s.tension+5);
        s.mobilizationSurge=Math.min(s.cityPopulation,(s.mobilizationSurge||0)+irnd(300,900));
        this._publishCrisisEvent('government','promise-betrayal',`Просрочено обязательство правительства: ${promise.title}`,`Дедлайн истёк без исполнения. Доверие к кабинету снизилось; инициаторы готовят новую волну акции.`,{severity:1.2,channel:'Гражданский',speaker:'Координатор движения',tone:'critical'});
      }
    }
  };

  SP.makePromise = function(groupId = null) {
    const s=this.state; const g=(this.getProtestGroups()||[]).find(x=>x.id===groupId) || (this.getProtestGroups()||[]).filter(x=>x.id!=='supporters').sort((a,b)=>b.grievance-a.grievance)[0];
    if(!g) return null;
    const targetKey = g.id==='workers'||g.id==='families'||g.id==='teachers'?'welfare':g.id==='healthworkers'?'healthcare':g.id==='transport'||g.id==='suburbs'?'infrastructure':g.id==='environment'?'environment':g.id==='taxpayers'||g.id==='farmers'?'tax':g.id==='rights'||g.id==='youth'?'mediaFreedom':'welfare';
    const title=`Публичное обязательство: ${g.name}`;
    const pr={id:++s.promiseSequence,title,groupId:g.id,groupName:g.name,demand:g.demand,targetKey,deadlineAt:(s.hoursElapsed||0)+48,deadlineDay:s.day+2,status:'pending',createdAt:s.hoursElapsed||0,cost:targetKey==='welfare'?0.018:targetKey==='healthcare'?0.022:targetKey==='infrastructure'?0.02:0.009};
    s.promises.unshift(pr); s.promises=s.promises.slice(0,50);
    this._publishCrisisEvent('government','promise',title,`Кабинет обязался продвинуть вопрос «${g.demand}». Срок исполнения — 48 модельных часов; обязательство можно выполнить в панели контроля.`,{severity:0.35,channel:'Правительственный',speaker:'Пресс-служба правительства',tone:'info'});
    return pr;
  };

  SP.fulfillPromise = function(id) {
    const s=this.state, pr=s.promises.find(p=>p.id===id && p.status==='pending'); if(!pr) return false;
    const cost=pr.cost||0.01;
    if(s.treasury < cost) { this._notify('toast',{message:'В казне недостаточно средств для исполнения обязательства в текущем виде.',tone:'warning'}); return false; }
    s.treasury-=cost; s.policies[pr.targetKey]=clamp(s.policies[pr.targetKey]+(pr.targetKey==='tax'?-3:4),0,100);
    pr.status='fulfilled'; pr.fulfilledAt=s.hoursElapsed||0;
    s.trust=clamp(s.trust+3.2); s.approval=clamp(s.approval+1.5); s.publicAnger=clamp(s.publicAnger-3.6); s.tension=clamp(s.tension-2.5);
    this._publishCrisisEvent('government','promise-fulfilled',`Обязательство исполнено: ${pr.groupName}`,`Кабинет отчитался по вопросу «${pr.demand}». Средства выделены, изменения отражены в политике.`,{severity:0.55,channel:'Правительственный',speaker:'Пресс-служба правительства',tone:'good'});
    this._refreshDerived(); this._notify('update'); return true;
  };

  SP.revokeMeasure = function() {
    const s=this.state, previous=s.lastControversialPolicy;
    if(previous && previous.before) {
      s.policies={...s.policies,...previous.before};
      s.publicAnger=clamp(s.publicAnger-12); s.tension=clamp(s.tension-7); s.trust=clamp(s.trust+2.2); s.approval=clamp(s.approval+1.5);
      s.movementAsh=clamp(s.movementAsh+6); s.reversedMeasures=(s.reversedMeasures||0)+1;
      this._publishCrisisEvent('government','recul','Кабинет отозвал спорную меру',`Решение «${previous.title||'последний пакет политики'}» отозвано. Нынешняя волна теряет часть импульса, но последующие мобилизации будут быстрее собирать участников.`,{severity:0.65,channel:'Правительственный',speaker:'Глава правительства',tone:'good'});
      s.lastControversialPolicy=null; this._refreshDerived(); this._notify('update'); return true;
    }
    // Fallback for a first-turn use: rescind the most recently changed high-impact field.
    s.publicAnger=clamp(s.publicAnger-5); s.tension=clamp(s.tension-3); s.trust=clamp(s.trust+0.8);
    this._publishCrisisEvent('government','recul','Кабинет объявил пересмотр спорной меры','В архиве ещё нет полного снимка предыдущей политики; объявлена официальная проверка и приостановлена подготовка новых ограничений.',{severity:0.35,channel:'Правительственный',speaker:'Глава правительства',tone:'info'});
    this._refreshDerived(); return true;
  };

  SP.startReferendum = function(issue = 'Пересмотр спорного пакета государственной политики') {
    const s=this.state;
    if(s.referendum && s.referendum.status==='open') return false;
    s.referendum={id:++s.referendumSequence,issue,startedAt:s.hoursElapsed||0,endsAt:(s.hoursElapsed||0)+72,endDay:s.day+3,status:'open',support:clamp(48+(s.publicSupportProtest-s.orderSupport)*0.22+rnd(-5,5)),turnout:0};
    this._publishCrisisEvent('government','referendum-called','Назначено общегородское голосование',`Вопрос: ${issue}. Голосование длится три модельных дня; результат влияет на курс правительства, но не завершает симуляцию.`,{severity:0.5,channel:'Правительственный',speaker:'Избирательная комиссия',tone:'info'});
    return true;
  };

  SP._updateReferendum = function() {
    const s=this.state, r=s.referendum;
    if(!r||r.status!=='open'||(s.hoursElapsed||0)<r.endsAt) return;
    r.turnout=clamp(34+Math.abs(s.publicSupportProtest-s.orderSupport)*0.26+Math.random()*14,20,91);
    r.support=clamp(r.support+(s.publicSupportProtest-s.orderSupport)*0.14+rnd(-4,4));
    r.status=r.support>=50?'passed':'rejected';
    if(r.status==='passed') { s.trust=clamp(s.trust+5); s.publicAnger=clamp(s.publicAnger-7); s.policies.welfare=clamp(s.policies.welfare+3); s.policies.mediaFreedom=clamp(s.policies.mediaFreedom+2); }
    else { s.publicAnger=clamp(s.publicAnger+4); s.trust=clamp(s.trust-1.8); }
    this._publishCrisisEvent('government','referendum-result',`Итог гражданского голосования: ${r.status==='passed'?'инициатива поддержана':'инициатива не набрала большинства'}`,`Явка — ${Math.round(r.turnout)}%, поддержка — ${Math.round(r.support)}%. Республика продолжает работу в рамках изменившегося политического контекста.`,{severity:0.6,channel:'Правительственный',speaker:'Избирательная комиссия',tone:r.status==='passed'?'good':'warning'});
  };

  SP._updateRepublicMode = function() {
    const s=this.state;
    let code='normal', label='Обычное управление';
    if(s.trust<13 && s.stability<24) { code='collapse'; label='Коллапс доверия · временное правительство и расследование'; }
    else if(s.treasury < -3 || s.budgetTrend < -16) { code='fiscal'; label='Фискальный кризис · временные меры и аудит расходов'; }
    else if(s.building.integrity<25 || s.deaths>=5) { code='emergency'; label='Государственный кризис · расследование и внешнее внимание'; }
    else if(s.trust<28 || s.stability<28) { code='fragile'; label='Политическая нестабильность · усиленный парламентский контроль'; }
    if(code!==s.stateModeCode) {
      const previous=s.stateModeCode; s.stateModeCode=code; s.stateMode=label; s.stateModeChangedAt=s.hoursElapsed||0;
      if(code!=='normal') {
        s.externalAttention=clamp(s.externalAttention+8); s.investigationOpen=true;
        if(code==='collapse') { s.temporaryCabinet=true; s.primeMinister=choose(['Марек Вальдис','Клер Бонне','Эмиль Каспер','Жюль Моро','Ирина Волкова']); }
        this._publishCrisisEvent('government','state-mode',`Изменение режима управления: ${label}`,`Предыдущее состояние: ${previous||'не определено'}. Игровая симуляция продолжается; последствия, долги, расследования и политические обязательства сохраняются.`,{severity:1.4,channel:'Правительственный',speaker:'Секретариат кабинета',tone:'critical'});
      } else if(previous!=='normal') {
        s.temporaryCabinet=false;
        this._publishCrisisEvent('government','state-recovery','Республика перешла к обычному управлению','Ключевые показатели восстановились выше порогов режима кризиса. Исторические решения и обязательства остаются в журнале.',{severity:0.5,channel:'Правительственный',speaker:'Секретариат кабинета',tone:'good'});
      }
    }
  };

  SP._maybeResign = function() {
    const s=this.state, now=s.hoursElapsed||0;
    if(now-(s.lastResignationAt||-999)<72) return;
    if((s.trust<10 && s.approval<17 && Math.random()<0.06) || (s.deaths>=6 && s.investigationOpen && Math.random()<0.05)) {
      s.lastResignationAt=now; s.resignationCount=(s.resignationCount||0)+1;
      const old=s.primeMinister; s.primeMinister=choose(['Марек Вальдис','Клер Бонне','Эмиль Каспер','Жюль Моро','Надя Фонтен','Ирина Волкова']);
      s.trust=clamp(s.trust+5); s.approval=clamp(s.approval+2); s.militaryDeployed=false;
      this._publishCrisisEvent('government','resignation',`${old} покидает пост главы правительства`,`В условиях кризиса назначен новый глава кабинета — ${s.primeMinister}. Политическая система сохраняется, а расследования и долги переходят новой администрации.`,{severity:1.6,channel:'Правительственный',speaker:'Парламентский секретариат',tone:'critical'});
    }
  };

  SP._maybeMinisterResignation = function() {
    const s=this.state, now=s.hoursElapsed||0;
    if (!Array.isArray(s.ministers) || !s.ministers.length || now-(s.lastMinisterResignationAt||-999)<36) return;
    const pressure=(s.trust<25?0.025:0)+(s.deaths>1?0.02:0)+(s.investigationOpen?0.012:0)+(s.treasury<0?0.01:0);
    if (pressure<=0 || Math.random()>pressure) return;
    const index=Math.floor(Math.random()*s.ministers.length), departed=s.ministers.splice(index,1)[0];
    const replacements=['Эва Сорель · финансы','Томас Келлер · внутренние дела','Мирей Дюпон · транспорт','Никола Фонтен · здравоохранение','Павел Деран · инфраструктура'];
    s.ministers.push(choose(replacements.filter(name=>!s.ministers.includes(name))));
    s.lastMinisterResignationAt=now; s.ministerResignations=(s.ministerResignations||0)+1;
    s.trust=clamp(s.trust-1.2); s.approval=clamp(s.approval-0.8);
    this._publishCrisisEvent('government','minister-resignation',`Министр подал в отставку: ${departed.split(' · ')[0]}`,`Кадровое решение связано с длительным кризисом и парламентскими вопросами. Преемник назначен, профильное ведомство продолжает работу.`,{severity:0.8,channel:'Правительственный',speaker:'Парламентский секретариат',tone:'warning'});
  };

  SP._maybeFormMovementParty = function() {
    const s=this.state;
    if(s.movementPartyFormed || s.movementDays<5 || s.publicSupportProtest<42 || s.crowdTarget<s.cityPopulation*0.12) return;
    const p={id:'movement-'+(s.day||1),name:'Гражданское движение Вереска',short:'ГДВ',color:'#c68d78',support:clamp(8+s.publicSupportProtest*0.20,5,28),ideology:'Децентрализация, социальные гарантии и прозрачность',movementParty:true};
    this.parties.push(p); s.movementPartyFormed=true; s.partyFormedAt=s.day;
    this._publishCrisisEvent('citizens','movement-party','Гражданское движение объявило о создании политической партии','Сеть организаторов решила участвовать в выборах и выдвинуть программу; объединение не представляет все группы протеста.',{severity:0.65,channel:'Гражданский',speaker:'Оргкомитет движения',tone:'info'});
  };

  SP._crisisHourlyStep = function() {
    const s=this.state, now=s.hoursElapsed||0;
    this._updatePoliceDoctrine();
    this._advanceInjuries();
    this._updateFirePhysics();
    this._updateBarricades();
    this._updateCrowdDynamics();
    this._updatePromises();
    this._updateReferendum();
    this._updateRepublicMode();
    this._maybeResign();
    this._maybeMinisterResignation();
    this._maybeFormMovementParty();
    this._updateDistricts(false);
    this._maybeDistrictEvents();
    const siegeIncident=s.incidents.find(i=>alive(i)&&i.type==='building_assault');
    if (s.building.siege>0) {
      if (s.doctrineCode==='protect' && s.policeMorale>18) {
        s.building.siege=Math.max(0,s.building.siege-(2.5+s.building.perimeter*0.025));
        s.building.perimeter=clamp(s.building.perimeter+0.5);
      } else if (siegeIncident && s.crowdTarget>s.cityPopulation*0.32) {
        s.building.siege=clamp(s.building.siege+1.4+s.tension*0.018);
        s.building.perimeter=Math.max(0,s.building.perimeter-(s.tension>80?3.1:1.2));
      }
      if (s.building.siege>=90 && s.building.perimeter<=8 && !s.building.occupation) {
        s.building.occupation=true; s.building.status='Здание занято'; s.building.integrity=clamp(s.building.integrity-14);
        s.stability=clamp(s.stability-10); s.trust=clamp(s.trust-7); s.temporaryCabinet=true;
        this._publishCrisisEvent('protest','building-occupied','Участники заняли часть здания правительства','Работа кабинета перенесена во временный штаб; службы охраняют проходы. Игра продолжается, а событие останется в политической истории.',{severity:2.0,channel:'Правительственный',speaker:'Секретариат кабинета',tone:'critical',announce:'ЭКСТРЕННОЕ ОПОВЕЩЕНИЕ: работа здания правительства временно ограничена. Следуйте указаниям служб и не приближайтесь к повреждённым входам.'});
      }
      if (s.building.occupation && s.doctrineCode==='protect' && Math.random()<0.22) {
        s.building.occupation=false; s.building.siege=Math.max(0,s.building.siege-28); s.building.perimeter=clamp(s.building.perimeter+18); s.building.status=s.building.integrity<25?'Сильно повреждено':'Повреждено'; s.temporaryCabinet=false;
        this._publishCrisisEvent('police','building-secured','Контроль над зданием правительства восстановлен','Охраняемый периметр возвращён под контроль; повреждения и политические последствия остаются в модели.',{severity:0.8,channel:'Полиция',speaker:'Командир объекта',tone:'good'});
      }
    }
    for (const loot of s.incidents.filter(i=>alive(i)&&i.type==='looting'&&!i.lootDamageApplied)) {
      loot.lootDamageApplied=true;
      const target=loot.lootTarget||'продовольственный магазин';
      const targetAsset=target.includes('банк')?s.assets.find(a=>a.kind==='bank'):target.includes('мэрии')?s.assets.find(a=>a.kind==='building'):s.assets.find(a=>a.kind==='shop')||s.assets.find(a=>a.kind==='street');
      if(targetAsset){targetAsset.integrity=clamp(targetAsset.integrity-12);targetAsset.condition=targetAsset.integrity<28?'Сильно повреждён':'Повреждён';s.propertyDamageCost=(s.propertyDamageCost||0)+((targetAsset.repairCost||4)*0.0008);}
      s.businessMood=clamp((s.businessMood||55)-2); s.crimeIndex=clamp(s.crimeIndex+1.4);
    }
    // Road disruptions create a measurable supply shock in logistics, retail and food production.
    const block=clamp(s.roadBlockage,0,1), strike=s.activeStrikes||0;
    s.supplyShock=clamp(s.supplyShock*0.86 + block*11 + strike*2.5 + (s.barricades.length?1.5:0),0,30);
    if(block>0.38 || strike>0) {
      for(const c of this.companies||[]) {
        if(['Транспорт','Продовольствие','Торговля','Промышленность'].includes(c.sector)) {
          const pressure=(block*0.35 + strike*0.28 + (s.fireZones.length?0.3:0));
          c.production=clamp(c.production-pressure,25,115);
          c.demand=clamp(c.demand+pressure*0.16,25,120);
          c.price=clamp(c.price*(1+pressure*0.0005),0.72,2.4);
          if(c.sector==='Транспорт' && block>0.45 && Math.random()<0.06) c.status='shortage';
        }
      }
      s.gdpGrowth=clamp(s.gdpGrowth-block*0.05-strike*0.035-s.supplyShock*0.008,-18,14);
      s.inflation=clamp(s.inflation+block*0.012+strike*0.008+(s.fireZones.length?0.01:0),-2,60);
    } else {
      s.supplyShock=Math.max(0,s.supplyShock-0.15);
    }
    // Duty consumables are finite; stocks refill gradually if budget and service funding allow.
    if(s.hour===4 && s.treasury>0) {
      const support=(s.policies.policing||45)/100;
      s.policeTools.gas=Math.min(24,s.policeTools.gas + Math.floor(1+support*2));
      s.policeTools.water=Math.min(18,s.policeTools.water + 1);
      s.policeTools.flash=Math.min(14,s.policeTools.flash + (support>0.75?1:0));
      s.policeTools.rubber=Math.min(32,s.policeTools.rubber + (support>0.9?2:1));
      s.policeTools.live=Math.min(6,s.policeTools.live + (support>0.95?1:0));
    }
    // Rumours propagate farther when institutional trust is low and social media resonance is high.
    if(now-(s.lastRumorAt||-999)>2.5 && Math.random() < (0.06 + (100-s.trust)*0.001 + s.mediaResonance*0.0006)) {
      s.lastRumorAt=now; s.rumorLevel=clamp(s.rumorLevel+irnd(3,9));
      const rumours = ['В сети расходятся неподтверждённые сведения о задержаниях; редакции проверяют записи.','Жители спорят о причине закрытия нескольких улиц; официальная сводка запаздывает.','В мессенджерах появилась противоречивая информация о состоянии пострадавших.','Анонимные сообщения преувеличивают численность собрания; оценка камер отличается.'];
      this._radio('Гражданский','Неформальный канал',choose(rumours),s.trust<30?'warning':'info','rumour');
      if(s.trust<28) { s.publicAnger=clamp(s.publicAnger+1.2); s.tension=clamp(s.tension+0.8); }
      s.mobilizationSurge=Math.min(s.cityPopulation,(s.mobilizationSurge||0)+Math.round(s.rumorLevel*0.8));
    } else s.rumorLevel=Math.max(0,s.rumorLevel-0.45);
    // Dispatch radio chatter is event-driven, plus a small amount of background traffic.
    if(Math.random()<0.42) {
      const lines=[
        ['Полиция','Патруль 12','Сектор проверен, остаёмся на связи.'],
        ['Диспетчерская','Городская диспетчерская','Канал свободен; следующая сводка по состоянию проезда через четверть часа.'],
        ['Медики','Бригада 04','Приняли вызов, уточняем подъезд и состав пострадавших.'],
        ['Пожарные','Расчёт 2','Оборудование проверено, ожидаем разрешения на въезд в сектор.'],
        ['Правительственный','Секретариат кабинета','Протокол переговоров направлен ответственному ведомству.'],
        ['Гражданский','Волонтёрская сеть','Вода и первая помощь доступны у восточного выхода; не закрывайте проход.']
      ];
      const line=choose(lines); this._radio(line[0],line[1],line[2], s.tension>80?'warning':'info','ambient');
    }
    this._updateDistricts(false);
    // Weekly rhythm and fatigue. Saturday/Sunday (model days 6–7) amplify turnout; exhausted waves shrink.
    const dayOfWeek=((s.day-1)%7)+1;
    if(dayOfWeek>=6 && s.lastWeekendBoostDay!==s.day) {
      s.lastWeekendBoostDay=s.day;
      const boost=Math.round(s.cityPopulation*(s.tension>70?0.045:0.018)*(1-(s.crowdFatigue||0)/130));
      s.mobilizationSurge=Math.min(s.cityPopulation,(s.mobilizationSurge||0)+boost);
      if(boost>100) this._radio('Гражданский','Городской наблюдатель',`Выходной день усилил явку; к основной площади присоединяются участники из районов (оценка +${boost}).`,'info','protest');
    }
    if(this.state.hour===0) {
      s.crowdFatigue=clamp(s.crowdFatigue+(s.crowdTarget/s.cityPopulation>0.4?3.1:-4.3),0,96);
      s.movementAsh=clamp(s.movementAsh*0.985,0,100);
      s.movementDays=(s.crowdTarget>s.cityPopulation*0.08)?(s.movementDays||0)+1:Math.max(0,(s.movementDays||0)-0.25);
      s.publicSupportProtest=clamp(s.publicSupportProtest+(s.crowdTarget/s.cityPopulation>0.4?1.4:-0.9)+(s.movementAsh*0.012));
      s.orderSupport=clamp(s.orderSupport+(s.supplyShock>6?1.2:0.2)-(s.tension>80?0.45:0));
    }
    if(s.policeFatigue>82 && Math.random()<0.10) {
      s.policeMorale=clamp(s.policeMorale-5); this._publishCrisisEvent('police','police-disorganization','На дежурстве зафиксирована дезорганизация уставшей смены','Несколько патрулей запросили замену; командование должно выбрать ротацию либо сохранение текущего состава.',{severity:0.75,channel:'Полиция',speaker:'Командир смены',tone:'warning'});
    }
    // A fire can ignite vehicles/barricades, while emergency corridors reduce secondary risk.
    if(s.fireZones.length && Math.random()<0.20) {
      const b=s.barricades.find(x=>x.status!=='cleared'&&x.status!=='burned'&&!x.burning&&s.fireZones.some(z=>Math.hypot(z.x-x.x,z.y-x.y)<(z.radius||18)+14));
      if(b && Math.random()<0.45) {
        if (typeof this._v5IgniteBarricade === 'function') this._v5IgniteBarricade(b, 'распространение огня с соседнего очага');
        else { b.burning=true; b.condition='Горит'; b.fireStartedAt=now; b.ignitionCause='распространение огня с соседнего очага'; }
        this._radio('Пожарные','Наблюдатель','Огонь перекинулся на баррикаду в пределах соседнего очага; зона дыма расширяется.','critical','fire');
      }
    }
    if(s.emergencyCorridor && now>(s.corridorUntil||0)) s.emergencyCorridor=false;
    s.gasZones=s.gasZones.filter(z=>z.life>0); s.smokeZones=s.smokeZones.filter(z=>z.life>0);
    s.gasZones.forEach(z=>z.life-=1); s.smokeZones.forEach(z=>z.life-=1);
    s.lastCrisisStep=now;
  };

  SP.reset = function() {
    original.reset.call(this);
    this._initCrisisState(false);
    this._radio('Диспетчерская','Система','Оперативные службы на связи. Автономное командование активно; дальнейшее развитие зависит от решений и событий.','info','system');
    this._notify('reset');
  };

  SP.loadSnapshot = function(snapshot) {
    const migrate = !snapshot || !snapshot.version || String(snapshot.version).startsWith('2.');
    original.loadSnapshot.call(this, snapshot);
    this._initCrisisState(migrate);
    this._notify('load');
  };

  SP.tick = function(speed = 1) {
    original.tick.call(this, speed);
    // Attendance may change between model hours; redistribute it immediately, but keep district tension hourly.
    this._updateDistricts(false, false);
  };

  SP._hourlyStep = function() {
    original._hourlyStep.call(this);
    this._initCrisisState(false);
    this._crisisHourlyStep();
    this._updateRepublicMode();
    this._refreshDerived(false);
  };

  SP._dailyStep = function() {
    const before=this.state.policies ? {...this.state.policies}:null;
    original._dailyStep.call(this);
    this._initCrisisState(false);
    if(before && this.state.stateModeCode==='collapse' && this.state.day%5===0) {
      this._publishCrisisEvent('government','external-attention','Международные наблюдатели запросили сводку по кризису','Вымышленная внешняя комиссия запросила данные о задержаниях, доступе прессы и оказании медицинской помощи.',{severity:0.6,channel:'Правительственный',speaker:'Пресс-служба',tone:'warning'});
    }
    this._updateDistricts(false);
  };

  SP._spawnIncident = function(forcedType = null) {
    const mapping={ barricade:'blockade', looting:'disturbance', building_assault:'riot', radical_attack:'riot', gas:'disturbance', water:'clash', flash:'clash', crush:'medical', special_vehicle_attack:'disturbance', hijack:'accident', traffic_crash:'accident' };
    const requested=forcedType;
    const mapped=mapping[requested]||requested;
    const inc=original._spawnIncident.call(this,mapped);
    if(!inc) return inc;
    const s=this.state;
    if(requested && mapping[requested]) {
      inc.type=requested;
      const labels={barricade:'Строительство баррикады',looting:'Попытка мародёрства',building_assault:'Попытка штурма здания правительства',radical_attack:'Тяжёлый инцидент радикальной группы',gas:'Зона раздражающего аэрозоля',water:'Применение водомёта',flash:'Паника после светошумового эпизода',crush:'Давка и пострадавшие',special_vehicle_attack:'Нападение на специальный транспорт',hijack:'Угон остановленного автомобиля',traffic_crash:'ДТП с последствиями для движения'};
      inc.label=labels[requested]||inc.label; inc.source=['looting','building_assault','radical_attack','barricade'].includes(requested)?'protest':requested==='special_vehicle_attack'?'crowd':'random';
    }
    inc.districtId=inc.districtId||choose(['center','center','station','workers','ring','suburbs']);
    inc.locationType=(s.districts||[]).find(d=>d.id===inc.districtId)?.kind||'площадь';
    const geometryRisk=inc.locationType==='перекрёсток'?1.22:inc.locationType==='кольцевая'?1.14:inc.locationType==='проспект'?1.08:inc.locationType==='пригород'?0.78:1;
    if(['clash','riot','traffic_crash','blockade','fire','arson','building_assault','looting'].includes(inc.type)) inc.geometryRisk=geometryRisk;
    if(inc.districtId!=='center' && requested && ['looting','radical_attack','traffic_crash','special_vehicle_attack'].includes(requested)) {
      const anchor=this._districtAnchor(inc.districtId); inc.x=clamp(anchor.x+rnd(-35,35),30,1250); inc.y=clamp(anchor.y+rnd(-24,24),285,625);
    }
    inc.createdAt=Number.isFinite(inc.createdAt)?inc.createdAt:(s.hoursElapsed||0);
    inc.serviceProgress=inc.serviceProgress||{};
    if(inc.geometryRisk) inc.severity=clamp(inc.severity*inc.geometryRisk,1,100);
    if(['fire','arson'].includes(inc.type)) {
      inc.fireArea=inc.fireArea||irnd(5,12); inc.fireIntensity=inc.fireIntensity||clamp(inc.severity/100,0.35,1.2); inc.fireRadius=inc.fireRadius||18; inc.smokeRadius=inc.smokeRadius||26;
      if(!s.fireZones.some(z=>z.id===inc.id)) s.fireZones.unshift({id:inc.id,x:inc.x,y:inc.y,area:inc.fireArea,radius:inc.fireRadius,smokeRadius:inc.smokeRadius,intensity:inc.fireIntensity,source:inc.type,condition:'Горит',at:inc.createdAt});
    }
    if(inc.type==='blockade'||inc.type==='barricade') {
      if(!s.barricades.some(b=>b.incidentId===inc.id) && s.barricades.filter(b=>b.status!=='cleared'&&b.status!=='burned').length<18) {
        const b=this._createBarricade(inc.x,Math.max(540,inc.y),inc.source||'protest'); b.incidentId=inc.id;
      }
    }
    if(inc.type==='building_assault') { s.building.siege=clamp(s.building.siege+irnd(8,20)); inc.x=640+rnd(-65,65); inc.y=300+rnd(-4,20); }
    if(inc.type==='looting') inc.lootTarget=inc.lootTarget||choose(['банк','премиальный магазин','продовольственный магазин','здание мэрии']);
    if(inc.type==='radical_attack') inc.severity=Math.max(inc.severity,86);
    if(inc.type==='clash'||inc.type==='riot'||inc.type==='radical_attack'||inc.type==='building_assault') {
      s.phaseCode='clashes'; s.lastFlashpointAt=s.hoursElapsed||0;
    }
    // Dispatch reports precede newspaper headlines by design.
    const channel = ['fire','arson'].includes(inc.type)?'Пожарные':inc.type==='medical'||inc.type==='crush'?'Медики':'Диспетчерская';
    this._radio(channel,'Оперативный дежурный',`Зарегистрировано событие ${inc.id}: ${inc.label}. Координаты переданы ближайшим службам; движение пересчитывается.`,inc.level==='critical'?'critical':'warning',inc.source||'random',inc.id);
    // The incident itself triggers an immediate AI doctrine review; force and fatigue still advance on model hours.
    if (!this._doctrineEventReview && typeof this._updatePoliceDoctrine === 'function') {
      this._doctrineEventReview = true;
      try { this._updatePoliceDoctrine(true); } finally { this._doctrineEventReview = false; }
    }
    return inc;
  };

  SP.addNews = function(category, level, title, body) {
    if(!this._skipNewsRadio) {
      const t=`${title||''} ${body||''}`.toLowerCase();
      let channel='Диспетчерская', speaker='Редактор оперативной ленты', source='random';
      if(/полици|кордон|задерж|разгон|силы|применени силы|военн/.test(t)) {channel='Полиция';speaker='Пресс-служба полиции';source='police';}
      else if(/пожар|возгоран|огонь|поджог|дым/.test(t)) {channel='Пожарные';speaker='Старший пожарной смены';source=/поджог/.test(t)?'protest':'fire';}
      else if(/медицин|ранен|пострадав|скорая|гибел/.test(t)) {channel='Медики';speaker='Медицинская диспетчерская';source='medical';}
      else if(category==='politics') {channel='Правительственный';speaker='Пресс-служба правительства';source='government';}
      else if(/протест|марк|баррикад|мародёр|толп|забаст/.test(t)) {channel='Гражданский';speaker='Городской наблюдатель';source='protest';}
      this._radio(channel,speaker,`${title}: ${body}`,level==='critical'?'critical':level==='alert'||level==='warning'?'warning':'info',source);
    }
    return original.addNews.call(this,category,level,title,body);
  };

  SP.serviceArrive = function(service, incidentId, vehicleId = null) {
    original.serviceArrive.call(this,service,incidentId,vehicleId);
    const s=this.state, inc=incidentId?s.incidents.find(i=>i.id===incidentId):null;
    this._radio(service==='fire'?'Пожарные':service==='ambulance'?'Медики':'Полиция',`${service==='fire'?'Расчёт пожарных':service==='ambulance'?'Бригада скорой помощи':'Патруль'} ${vehicleId||''}`.trim(),`Прибыли к ${inc?inc.label.toLowerCase():'назначенному сектору'}. Оценка места начата; диспетчерская получит подтверждение.`, 'info',service,incidentId);
    if(service==='ambulance') {
      const ix=inc?inc.x:640, iy=inc?inc.y:420;
      const nearby=s.injuries.filter(i=>i.status==='awaiting'&&!i.stabilized&&Math.hypot(i.x-ix,i.y-iy)<190).sort((a,b)=>b.severity-a.severity);
      nearby.slice(0,10).forEach((injury,index)=>{
        injury.stabilized=true; injury.timer=0; injury.status='stabilized'; injury.visualState=index<2?'на носилках':'сидит';
        this._radio('Медики','Старший бригады',`${injury.id}: первичная стабилизация; тяжесть — ${injury.grade}. Подготовка к транспортировке.`,injury.severity>=3?'critical':'info','medical',incidentId);
      });
      if(nearby.length) this._publishCrisisEvent('medical','triage',`Медики стабилизировали пострадавших (${nearby.length})`,`Бригада провела первичную сортировку. Состояние тяжёлых пациентов продолжит учитываться в модели до транспортировки.`,{severity:0.3,news:false,radio:false});
    } else if(service==='fire' && inc) {
      inc.fireContainmentStarted=true;
      this._radio('Пожарные','Начальник расчёта',`Площадь очага ${Math.round(inc.fireArea||8)} усл. ед.; интенсивность ${Math.round((inc.fireIntensity||0.6)*100)}%. Начато охлаждение и локализация.`, 'warning','fire',incidentId);
    } else if(service==='police' && inc) {
      if(inc.type==='blockade'||inc.type==='barricade') {
        const b=s.barricades.find(x=>x.incidentId===inc.id)||s.barricades.find(x=>Math.abs(x.x-inc.x)<90);
        if(b && s.doctrineCode==='corridor') b.health=Math.max(0,b.health-30);
      }
    }
  };

  SP.resolveIncident = function(id, note='Инцидент закрыт диспетчерской.') {
    const inc=this.state.incidents.find(i=>i.id===id);
    const before=inc&&inc.status!=='resolved';
    original.resolveIncident.call(this,id,note);
    if(before && inc) {
      if(['fire','arson'].includes(inc.type)) {
        const z=this.state.fireZones.find(x=>x.id===inc.id); if(z) z.condition='Потушено';
        this._radio('Пожарные','Начальник расчёта',`${inc.label}: активное горение локализовано; проводится проливка и проверка соседних объектов.`,'good','fire',id);
      }
      if(['blockade','barricade'].includes(inc.type)) this.state.barricades.forEach(b=>{if(b.incidentId===id)b.health=0;});
      if(inc.type==='building_assault') this.state.building.siege=Math.max(0,this.state.building.siege-18);
    }
  };

  SP.enactAction = function(action) {
    const special={police:'reinforce', emergency:'cordon', military:'reinforce'};
    const result=original.enactAction.call(this,action);
    if(result) {
      const s=this.state;
      if(action==='police') {
        s.policeCommandOverride={code:'contain',label:'Сдерживание',until:(s.hoursElapsed||0)+3};
        s.policePresence=clamp(s.policePresence+7); s.policeMorale=clamp(s.policeMorale+1.2);
        this._radio('Полиция','Командование','Приказ правительства принят. Командование самостоятельно выбирает построение и допустимое средство в пределах установленных ограничений.','warning','police');
      } else if(action==='emergency') {
        s.policeCommandOverride={code:'protect',label:'Защита объекта',until:(s.hoursElapsed||0)+4};
        this._radio('Полиция','Командование','Введён особый режим координации. Доктрина не отменяет обязанности фиксировать применение силы.','warning','police');
      } else if(action==='military') {
        s.policeCommandOverride={code:'protect',label:'Защита объекта',until:(s.hoursElapsed||0)+3};
        s.publicSupportProtest=clamp(s.publicSupportProtest+4); s.orderSupport=clamp(s.orderSupport+2);
        this._radio('Правительственный','Оперативный штаб','Военная помощь выделена; её наличие не гарантирует спокойствия и может привлечь контрдемонстрации.','critical','government');
      } else if(action==='ignore') {
        s.policeCommandOverride={code:'observe',label:'Наблюдение',until:(s.hoursElapsed||0)+1};
        this._radio('Полиция','Дежурный командир','Правительственный штаб не запросил нового вмешательства. Дальнейшие решения принимаются по локальным обстоятельствам.','info','police');
      }
      this._updateDistricts(false); this._updateRepublicMode();
    }
    return result;
  };

  SP.applyPolicies = function(next) {
    const s=this.state, before={...s.policies};
    const changedKeys=Object.keys(next||{}).filter(k=>Number(next[k])!==Number(before[k]));
    const result=original.applyPolicies.call(this,next);
    if(changedKeys.length) s.lastControversialPolicy={before,title:`изменение: ${changedKeys.join(', ')}`,at:s.hoursElapsed||0};
    if(changedKeys.some(k=>['tax','welfare','healthcare','mediaFreedom','environment'].includes(k))) {
      const notable=changedKeys.some(k=>Math.abs(Number(next[k])-Number(before[k]))>=12);
      if(notable) {
        s.movementAsh=clamp(s.movementAsh+4); s.mediaResonance=clamp(s.mediaResonance+2);
      }
    }
    this._radio('Правительственный','Секретариат кабинета',`Новый политический пакет передан ведомствам. Бюджетный баланс: ${Math.round(result.afterBudget.balance)} млн в сутки.`,result.afterBudget.balance<0?'warning':'info','government');
    this._updateDistricts(false);
    return result;
  };

  SP._estimateCrowdSize = function() {
    const base=original._estimateCrowdSize.call(this);
    const s=this.state||{}; const population=Math.max(500,s.cityPopulation||5000);
    const ash=(s.movementAsh||0)*population*0.0016;
    const movementSupport=((s.publicSupportProtest||44)-44)*population*0.0017;
    const fatigue=(s.crowdFatigue||0)*population*0.0011;
    const weekend=(((s.day-1)%7)+1)>=6 ? population*0.012 : 0;
    const riotAmplifier=(s.deaths||0)>0 ? Math.min(population*0.25,(s.deaths||0)*population*0.012) : 0;
    return Math.round(clamp(base+ash+movementSupport+weekend+riotAmplifier-fatigue,Math.max(30,population*0.005),population));
  };

  SP._updatePartySupport = function() {
    original._updatePartySupport.call(this);
    const movement=this.parties.find(p=>p.movementParty);
    if(movement) {
      const s=this.state;
      const target=clamp(4+s.publicSupportProtest*0.25+(s.movementPartyFormed?2:0)-(s.riotFatigue||0)*0.045,3,34);
      movement.support=movement.support*0.86+target*0.14;
      const total=this.parties.reduce((sum,p)=>sum+p.support,0)||1;
      this.parties.forEach(p=>p.support=p.support/total*100);
    }
  };

  SP._updatePromises = SP._advancePromises;

  // A group without a recognized representative can respond only to public commitments.
  const originalStartNegotiations=SP.startNegotiations;
  SP.startNegotiations=function(preferredGroupId=null) {
    if(preferredGroupId==='hardliners') {
      this.makePromise('hardliners');
      this._radio('Гражданский','Наблюдатель переговоров','Радикальная периферийная группа не имеет признанного представителя; прямой раунд переговоров не открыт. Кабинет публикует обязательство для всех наблюдателей.','warning','government');
      return null;
    }
    const groups=(this.getProtestGroups()||[]).filter(g=>!['supporters','hardliners'].includes(g.id));
    const eligible=groups.filter(g=>g.grievance>=40).sort((a,b)=>(b.grievance*Math.sqrt(b.participants))-(a.grievance*Math.sqrt(a.participants)));
    const fallback=eligible[0]||groups[0];
    return originalStartNegotiations.call(this,preferredGroupId&&preferredGroupId!=='hardliners'?preferredGroupId:(fallback&&fallback.id)||null);
  };

  // The endless loop never ends because of a zeroed metric: crisis regimes are state transitions only.
  SP.forceEndlessInvariant = function() { return true; };
})();

/* Scene layer: moving police formations, casualty sprites, vehicle states and live zone overlays. */
(function installWorldCrisisLayer() {
  const clamp = (v, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, Number(v) || 0));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const choose = list => list[Math.floor(Math.random() * list.length)];
  const Scene=window.RepublicCityScene; if(!Scene) return;
  const P=Scene.prototype, original={};
  ['create','_pickPersonType','_spawnTrafficCar','_updatePeople','_syncCrowd','_dispatchVehicle','_updateVehicles','_updateTraffic','_renderEnvironment','_launchCrowdProjectile','_updateProjectiles','update'].forEach(k=>original[k]=P[k]);

  P.create=function() {
    original.create.call(this);
    this.injurySprites=this.injurySprites||new Map(); this.crisisLastActionSeq=0; this.crisisEffectTimer=0;
    this.vehicleAlertTimer=0; this.roadEventTimer=18; this.currentWeatherBlend=0;
    this._crisisOverlay=this.add.graphics().setDepth(8999);
    this._injuryLabels=this.add.container(0,0).setDepth(8998);
    this.crisisDistrictNodes=[{x:1083,y:329,id:'center'},{x:1187,y:348,id:'station'},{x:1098,y:388,id:'workers'},{x:1190,y:397,id:'ring'},{x:1136,y:429,id:'suburbs'}];
    this.crisisHud=this.add.graphics().setScrollFactor(0).setDepth(12000);
    this.crisisHudTitle=this.add.text(14,12,'КАМЕРА · ПЛОЩАДЬ И МЭРИЯ',{fontFamily:'monospace',fontSize:'10px',color:'#e5ddc7',backgroundColor:'#172226',padding:{x:6,y:4}}).setScrollFactor(0).setDepth(12001).setAlpha(.94);
    this.crisisCameraDistrict=null;
    this._updateDistrictCamera(0,this.sim.state,true);
  };

  P._pickPersonType=function() {
    const picked=original._pickPersonType.call(this);
    const s=this.sim.state;
    if(picked.protester && s.tension>66 && Math.random()<0.022) { picked.behavior='casseur'; picked.role='casseur'; picked.type='agitator'; picked.sign='РАЗРУШЕНИЕ'; picked.demand='локальная цель'; }
    else if(picked.protester && s.tension>68 && Math.random()<0.018) { picked.behavior='provocateur'; picked.role='provocateur'; picked.type='agitator'; picked.sign='ПРОВОКАЦИЯ'; }
    else if(picked.protester && s.tension>60 && Math.random()<0.045) { picked.behavior='looter'; picked.role='looter'; picked.type=Math.random()<0.25?'agitator':'civilian'; picked.sign='СВОЁ'; picked.demand='локальная цель'; }
    else if(picked.protester && s.tension>52 && Math.random()<0.11) { picked.behavior='organizer'; picked.role='organizer'; picked.sign=picked.sign||'СОБРАНИЕ'; }
    else if(picked.protester && s.tension>75 && Math.random()<0.055) { picked.behavior='radical'; picked.role='radical'; picked.type='agitator'; picked.sign='РАДИКАЛЫ'; }
    if(!picked.role) picked.role=picked.behavior||picked.type;
    return picked;
  };

  P._spawnTrafficCar=function(x,direction,lane,initial=false) {
    const car=original._spawnTrafficCar.call(this,x,direction,lane,initial);
    car.condition='Цел'; car.driverState='в машине'; car.hijacked=false; car.vehicleRecordId=null; car.crisisEventCooldown=0; car.smoke=0;
    const stateVehicles=this.sim.state.roadVehicles || (this.sim.state.roadVehicles=[]);
    const slot=stateVehicles[this.trafficCars.length-1];
    if(slot) {
      car.vehicleRecordId=slot.id; car.condition=slot.condition||'Цел'; car.driverState=slot.driverState||'в машине'; car.hijacked=!!slot.hijacked;
    } else {
      const record={id:`ROAD-${this.sim.state.day}-${stateVehicles.length+1}`,type:car.bus?'автобус':'легковой автомобиль',condition:'Цел',driverState:'в машине',x:car.x,y:car.y,lane:car.lane,hijacked:false,fire:0,incidentCooldown:0};
      stateVehicles.push(record); car.vehicleRecordId=record.id;
    }
    return car;
  };

  P._dispatchVehicle=function(order) {
    original._dispatchVehicle.call(this,order);
    const v=this.vehicles[this.vehicles.length-1];
    if(!v) return;
    v.condition='Цел'; v.driverState='в машине'; v.disabled=false; v.convoy=!!order.convoy; v.travelDelay=0; v.blockedTime=0; v.incidentCooldown=0;
    v.baseSpeed=v.speed;
    if (order.external) {
      v.phase='staging'; v.externalAt=(this.sim.state.hoursElapsed||0)+Math.max(1,Number(order.eta)||2);
      v.sprite.setAlpha(0.62);
    }
    const list=this.sim.state.serviceFleet||(this.sim.state.serviceFleet=[]);
    list.push({id:v.id,service:v.service,condition:'Цел',driverState:'в машине',phase:v.phase,purpose:v.purpose,incidentId:v.incidentId,createdAt:this.sim.state.hoursElapsed||0,externalAt:v.externalAt||null,disabled:false,convoy:v.convoy});
    if(list.length>100) list.splice(0,list.length-100);
  };

  P._updatePeople=function(dt,s) {
    original._updatePeople.call(this,dt,s);
    this._updateAutonomousPolice(dt,s);
    // Arrests are persistent states, not a three-second sprite decoration.
    for (const agent of this.people || []) {
      if (!agent.detained) continue;
      if (this.currentTime >= (agent.detainedUntil || 0)) {
        agent.detained = false; agent.behavior = agent.protester ? 'flee' : 'peaceful';
        agent.speed = agent.protester ? 44 : 34; agent.timer = 1.8; agent.tx = clamp(agent.x + (agent.x < 640 ? 1 : -1) * 40, 35, 1240);
        if (agent.sprite && agent.sprite.clearTint) agent.sprite.clearTint();
      } else {
        agent.tx = agent.x; agent.ty = agent.y; agent.speed = 0; agent.timer = 1; agent.wait = 1;
        if (agent.sprite) agent.sprite.setTint(0xd6b56b).setAlpha(0.95);
        if (agent.placard) agent.placard.setVisible(false);
      }
    }
    const fires=s.fireZones||[]; let fireHelpers=0;
    (this.people||[]).filter(a=>a.behavior==='helper'&&!a.detained).forEach(agent=>{
      if(!fires.length) {agent.volunteeringAtFire=false;return;}
      const target=fires.reduce((best,z)=>!best||Math.hypot(z.x-agent.x,z.y-agent.y)<Math.hypot(best.x-agent.x,best.y-agent.y)?z:best,null);
      const dist=target?Math.hypot(target.x-agent.x,target.y-agent.y):Infinity;
      if(target && dist>38 && dist<330 && (agent.fireTargetAt||0)<this.currentTime) {
        agent.fireTargetAt=this.currentTime+2600;agent.tx=clamp(target.x+rnd(-26,26),32,1245);agent.ty=clamp(target.y+rnd(18,40),300,625);agent.timer=2.4;agent.speed=34;
      }
      if(target&&dist<(target.radius||20)+30) {fireHelpers++;agent.volunteeringAtFire=true;if(!agent.fireVolunteerReported){agent.fireVolunteerReported=true;this.sim._radio('Гражданский','Добровольная помощь','Волонтёры помогают вывести людей из задымлённого сектора и передают пожарным информацию о соседних очагах.','info','citizens');}}
      else agent.fireVolunteerReported=false;
    });
    s.volunteerFireSupport=fireHelpers;
    this._syncInjurySprites(dt,s);
  };

  P._updateAutonomousPolice=function(dt,s) {
    const police=this.crowdPolice||[]; if(!police.length||!dt) return;
    const incidents=s.incidents.filter(i=>i.status!=='resolved');
    const hostile=this.people.filter(a=>a.protester && ['agitator','radical','looter','arsonist','volatile','casseur','provocateur'].includes(a.behavior));
    const crowdRatio=(s.crowdTarget||0)/Math.max(1,(s.policePresence||35)*24+(s.militaryDeployed?420:0));
    const targetIncident=incidents.slice().sort((a,b)=>(b.severity||0)-(a.severity||0))[0];
    const danger=targetIncident && ['riot','clash','arson','fire','looting','building_assault','radical_attack','special_vehicle_attack'].includes(targetIncident.type);
    police.forEach((officer,index)=>{
      const data=officer.getData('officerAI')||{fatigue:0,detainCooldown:0,burningHandled:false};
      data.fatigue=clamp(data.fatigue+dt*(s.policeFatigue>60?0.7:0.15),0,100);
      data.detainCooldown=Math.max(0,data.detainCooldown-dt);
      const side=index%2===0?-1:1;
      let tx=officer.getData('baseX')||430+(index%9)*47;
      let ty=officer.getData('baseY')||368+Math.floor(index/9)*23;
      if(s.doctrineCode==='withdraw' || crowdRatio>2.0) { tx=side<0?250+index%5*20:1010+index%5*20; ty=410+Math.floor(index/5)*18; }
      else if(s.doctrineCode==='protect' || s.building.siege>0) { tx=545+(index%8)*27; ty=302+Math.floor(index/8)*13; }
      else if(danger && targetIncident) {
        const angle=(index/Math.max(1,police.length))*Math.PI*2;
        const radius=26+(index%3)*9;
        tx=clamp(targetIncident.x+Math.cos(angle)*radius,40,1240); ty=clamp(targetIncident.y+Math.sin(angle)*radius,300,610);
      } else if((s.doctrineCode==='cordon' || s.doctrineCode==='contain') && incidents.length>0) {
        tx=435+(index%10)*44; ty=361+Math.floor(index/10)*22;
      }
      const dx=tx-officer.x,dy=ty-officer.y,dist=Math.hypot(dx,dy)||1;
      const speed=(s.policeFatigue>75?18:46)*(s.doctrineCode==='withdraw'?1.25:1);
      officer.x+=dx/dist*Math.min(dist,speed*dt); officer.y+=dy/dist*Math.min(dist,speed*dt);
      officer.setDepth(officer.y+7);
      if(s.doctrineCode==='withdraw') officer.setTint(0x9a9d96); else if(s.doctrineCode==='disperse') officer.setTint(0xdba28a); else officer.clearTint();
      if(s.policeMorale<18 && Math.random()<0.0003) { const away=officer.x<640?-1:1; officer.x=clamp(officer.x+away*20,30,1250); }
      // A concrete nearby agent can be detained. This is a single-agent interaction, not a global switch.
      if(data.detainCooldown<=0 && s.doctrineCode==='contain' && s.policeMorale>25 && crowdRatio<1.7 && hostile.length && Math.random()<dt*0.018) {
        const target=hostile.reduce((best,a)=>Math.hypot(a.x-officer.x,a.y-officer.y)<Math.hypot(best.x-officer.x,best.y-officer.y)?a:best,hostile[0]);
        if(target && Math.hypot(target.x-officer.x,target.y-officer.y)<44 && !target.detained) {
          target.detained=true; target.detainedUntil=this.currentTime+9000; target.behavior='detained'; target.tx=target.x;target.ty=target.y;target.timer=9;target.wait=9; target.speed=0;
          data.detainCooldown=7; s.arrests=(s.arrests||0)+1;
          this.sim._radio('Полиция','Патруль',`Задержан конкретный участник ${target.groupId||'собрания'}; проводится проверка обстоятельств.`,'warning','police');
          this.sim._radio('Гражданский','Очевидец','На краю собрания прошла точечная задержка; собравшиеся требуют назвать основание.','warning','police');
          this.sim.state.policeActionSeq=(s.policeActionSeq||0)+1;
          this.interactionMarks.push({type:'police-contact',x:target.x,y:target.y,expires:this.currentTime+1200});
        }
      }
      const burningUntil=officer.getData('burningUntil')||0;
      if(burningUntil>this.currentTime && !data.burningHandled) {
        data.burningHandled=true; this.sim._makeInjury('ожог',2,officer.x,officer.y,'fire','protest',null,null);
        this.sim._publishCrisisEvent('protest','special-vehicle-attack','Полицейский получил травму при столкновении','Инцидент зафиксирован в медицинском канале. Командование пересматривает защиту персонала и риск ответной эскалации.',{severity:0.85,channel:'Медики',speaker:'Старший бригады',tone:'critical'});
      }
      officer.setData('officerAI',data);
    });
  };

  P._launchCrowdProjectile=function(agent) {
    const startCount=(this.projectiles||[]).length;
    original._launchCrowdProjectile.call(this,agent);
    const p=(this.projectiles||[]).slice(startCount)[0]; if(!p)return;
    const tension=this.sim.state.tension||0;
    const variants=agent.behavior==='radical'?['stone','bottle','smoke','firebrand','firebrand']:
      agent.behavior==='arsonist'?['firebrand','smoke','petard']:
      tension>82?['stone','bottle','petard','smoke','firebrand']:
      ['stone','bottle','petard','smoke'];
    p.kind=choose(variants); p.tokenOnly=true;
    if(p.kind==='smoke') p.effect='visibility';
    if(p.kind==='stone'||p.kind==='bottle') p.effect='property-or-contact';
  };

  P._updateProjectiles=function(dt,s) {
    if(!this.projectiles||!this.projectiles.length||dt<=0)return;
    const U=window.GameUtils;
    for(let i=this.projectiles.length-1;i>=0;i--) {
      const p=this.projectiles[i];p.elapsed+=dt;const t=U.clamp(p.elapsed/p.duration,0,1);
      p.x=p.startX+(p.targetX-p.startX)*t;p.y=p.startY+(p.targetY-p.startY)*t-Math.sin(t*Math.PI)*31;
      if(t<1) continue;
      this.interactionMarks.push({type:'throw-impact',x:p.targetX,y:p.targetY,expires:this.currentTime+850});
      const underLimit=s.incidents.filter(inc=>inc.status!=='resolved').length<this.sim.config.maxIncidents;
      if(!s.paused&&p.kind==='firebrand') {
        if(p.targetOfficer) {
          p.targetOfficer.setData('burningUntil',this.currentTime+2200);
          this.interactionMarks.push({type:'police-fire',x:p.targetOfficer.x,y:p.targetOfficer.y,expires:this.currentTime+2200});
          if(underLimit){const inc=this.sim.addIncident('clash');if(inc){inc.x=p.targetOfficer.x;inc.y=p.targetOfficer.y;}}
        } else if(Math.random()<(s.tension>82?.58:.39)&&underLimit) {
          const inc=this.sim.addIncident('arson');if(inc){inc.x=p.targetX;inc.y=p.targetY;inc.districtId=s.activeDistrict||'center';}
        }
      } else if(!s.paused&&p.kind==='smoke') {
        const z={id:`CROWD-SMOKE-${s.day}-${Math.floor(this.currentTime)}-${i}`,x:p.targetX,y:p.targetY,radius:55,life:2,kind:'crowd-smoke',source:'protest'};
        s.smokeZones.unshift(z);s.smokeZones=s.smokeZones.slice(0,30);
        s.gasZones.unshift({...z});s.gasZones=s.gasZones.slice(0,24);
        this.people.forEach(a=>{if(a.protester&&Math.hypot(a.x-z.x,a.y-z.y)<z.radius*1.5&&Math.random()<.3){a.behavior='flee';a.tx=clamp(a.x+rnd(-100,100),32,1244);a.ty=clamp(a.y+rnd(-45,42),300,620);a.speed=58;a.timer=1.6;}});
        this.sim._radio('Гражданский','Городской наблюдатель','В секторе появился дымовой токен; обзор камеры ухудшен, часть участников отходит от плотной зоны.','warning','protest');
      } else if(!s.paused&&['stone','bottle'].includes(p.kind)) {
        const targetAsset=choose(s.assets.filter(a=>a.condition!=='Разрушен'));
        if(targetAsset&&Math.random()<.25){targetAsset.integrity=clamp(targetAsset.integrity-4);targetAsset.condition='Повреждён';s.propertyDamageCost=(s.propertyDamageCost||0)+(targetAsset.repairCost||2)*0.00012;}
        if(p.targetOfficer&&Math.random()<.1)this.sim._makeInjury('ушибы и ссадины',0,p.targetOfficer.x,p.targetOfficer.y,'thrown-token','protest',null,null);
        if(Math.random()<(s.tension>80?.16:.06)&&underLimit){const inc=this.sim.addIncident('clash');if(inc){inc.x=p.targetX;inc.y=p.targetY;inc.districtId=s.activeDistrict||'center';}}
      } else if(!s.paused&&p.kind==='petard'&&Math.random()<(s.tension>80?.12:.06)&&underLimit) {
        const inc=this.sim.addIncident('clash');if(inc){inc.x=p.targetX;inc.y=p.targetY;inc.districtId=s.activeDistrict||'center';}
      }
      this.projectiles.splice(i,1);
    }
  };

  P._syncInjurySprites=function(dt,s) {
    if(!this.injurySprites) this.injurySprites=new Map();
    const visible=(s.injuries||[]).filter(i=>i.status==='awaiting'||i.status==='stabilized').slice(-18);
    const wanted=new Set(visible.map(i=>i.id));
    for(const [id,obj] of this.injurySprites) {
      if(!wanted.has(id)) {obj.sprite.destroy();obj.mark.destroy();this.injurySprites.delete(id);}
    }
    visible.forEach(i=>{
      let obj=this.injurySprites.get(i.id);
      if(!obj) {
        const texture=`person-civilian-${Math.floor(Math.random()*8)}`;
        const sprite=this.add.image(i.x,i.y,texture).setOrigin(.5,.72).setScale(.77).setAngle(i.severity>=2?85:0).setAlpha(.85).setDepth(i.y+15);
        const mark=this.add.text(i.x,i.y-10,i.severity>=3?'✚':'•',{fontFamily:'monospace',fontSize:'10px',color:i.severity>=3?'#e16f65':'#dbb977',backgroundColor:'#202a2b',padding:{x:2,y:1}}).setOrigin(.5,1).setDepth(i.y+24);
        obj={sprite,mark};this.injurySprites.set(i.id,obj);
      }
      obj.sprite.setPosition(i.x,i.y).setAngle(i.severity>=2?85:0).setDepth(i.y+15).setTint(i.severity>=3?0xd9786f:0xd7c5a1);
      obj.mark.setPosition(i.x,i.y-10).setDepth(i.y+24).setAlpha(.65+Math.sin(this.currentTime*.012+i.x)*.3);
    });
  };

  P._updateVehicles=function(s,dt) {
    // Reinforcement units remain off-screen until their model-time ETA elapses.
    (this.vehicles||[]).forEach(v=>{
      if(v && v.phase==='staging' && (s.hoursElapsed||0)>=(v.externalAt||Infinity)) {
        v.phase='outbound'; v.routeStage=0; v.age=0;
        if(v.sprite) v.sprite.setAlpha(1);
        this.sim._radio('Диспетчерская','Дежурный диспетчер','Внешнее подкрепление прибыло на городскую границу; экипаж входит в дорожную сеть и будет учитывать заторы.','info','police');
      }
    });
    original._updateVehicles.call(this,s,dt);
    const records=s.serviceFleet||[];
    this.vehicles.forEach(v=>{
      if(!v) return;
      const record=records.find(r=>r.id===v.id); if(record){record.phase=v.phase;record.condition=v.condition||'Цел';record.driverState=v.driverState||'в машине';record.disabled=!!v.disabled;record.convoy=!!v.convoy;}
      const exposed=(s.tension||0)>86 && !v.convoy && v.phase!=='staging' && (v.phase==='onsite'||(v.blockedTime||0)>7);
      if(exposed&&!v.hijacked&&!v.disabled&&Math.random()<Math.max(0,dt||0)*0.0045) {
        v.hijacked=true;v.hijackedAt=s.hoursElapsed||0;v.driverState='экипаж покидает машину';v.condition='Повреждён';v.hijackImpactAt=(s.hoursElapsed||0)+0.18;v.hijackImpactApplied=false;
        this.sim.state.hijackedVehicles=(s.hijackedVehicles||0)+1;
        this.sim._publishCrisisEvent('protest','special-vehicle-hijack',`Потерян контроль над спецмашиной «${v.service}»`,`Экипаж покинул транспорт после инцидента в перегруженном секторе. Машина не выполняет штатную задачу; диспетчер направил замену и проверяет безопасность экипажа.`,{severity:1.25,channel:'Диспетчерская',speaker:'Городской диспетчер',tone:'critical',incidentId:v.incidentId});
      }
      if(v.hijacked&&!v.hijackImpactApplied&&(s.hoursElapsed||0)>=(v.hijackImpactAt||Infinity)) {
        v.hijackImpactApplied=true;v.driverState='вне машины';v.condition=Math.random()<0.18?'Горит':'Повреждён';v.disabled=true;v.phase='disabled';v.stoppedAt={x:v.x,y:v.y};v.speed=0;
        if(record){record.condition=v.condition;record.driverState=v.driverState;record.disabled=true;record.phase='disabled';}
        this.sim.state.vehicleDamageCount=(s.vehicleDamageCount||0)+1;
        if(v.service==='ambulance')this.sim._makeInjury('ушибы и ссадины',1,v.x,v.y,'vehicle-attack','crowd',null,null);
        this.sim._radio('Диспетчерская','Дежурный диспетчер','Спецмашина выведена из работы; маршрут службы временно закрыт. Назначена резервная бригада, время прибытия зависит от дорожной обстановки.','critical','random',v.incidentId);
      }
      if(v.phase==='disabled') { if(v.stoppedAt){v.x=v.stoppedAt.x;v.y=v.stoppedAt.y;v.sprite.setPosition(v.x,v.y);} v.speed=0; return; }
      if(v.disabled) return;
      if(v.phase==='outbound') {
        const targetIncident=(s.incidents||[]).find(i=>i.id===v.incidentId);
        const localDistrict=(s.districts||[]).find(d=>d.id===(targetIncident&&targetIncident.districtId||'center'));
        const blockage=clamp(localDistrict?Math.max(s.roadBlockage*0.45,localDistrict.blockage):s.roadBlockage,0,1);
        const nearRoad=v.y>530 || v.x>480&&v.x<810;
        if(nearRoad && blockage>0.4 && !s.emergencyCorridor) {
          v.blockedTime=(v.blockedTime||0)+dt;
          if(v.blockedTime>2.6) {
            v.speed=Math.max(20,(v.baseSpeed||102)*(1-blockage*.76));
            if(v.blockedTime>5 && Math.random()<dt*0.018) this.sim._radio('Диспетчерская','Водитель спецмашины',`${v.service==='ambulance'?'Скорая':v.service==='fire'?'Пожарная бригада':'Патруль'} задерживается в очереди; расчёт прибытия увеличен.`, 'warning',v.service,v.incidentId);
          }
        } else { v.blockedTime=Math.max(0,(v.blockedTime||0)-dt*1.5); v.speed=Math.min(v.baseSpeed||102, v.speed+dt*14); }
      }
      // Fire zones can disable unattended special vehicles; an escort reduces exposure.
      const nearFire=(s.fireZones||[]).find(z=>Math.hypot(v.x-z.x,v.y-z.y)<(z.radius||18)+18);
      if(nearFire && v.phase==='onsite' && v.incidentCooldown<=0 && Math.random()<dt*(v.convoy?0.018:0.055)) {
        v.incidentCooldown=18; v.disabled=true; v.phase='disabled'; v.stoppedAt={x:v.x,y:v.y};
        v.condition='Горит'; v.driverState='покидает машину'; v.sprite.setTint(0xd66b40).setAlpha(.78);
        const rec=records.find(r=>r.id===v.id);if(rec){rec.disabled=true;rec.condition=v.condition;rec.driverState=v.driverState;rec.phase=v.phase;}
        this.sim.state.vehicleDamageCount=(s.vehicleDamageCount||0)+1;
        this.sim._publishCrisisEvent('fire','special-vehicle-fire',`Спецтранспорт «${v.service}» повреждён огнём`,`Экипаж покидает опасный сектор; служба временно приостанавливает работу на этом участке. Диспетчерская назначает замену.`,{severity:1.1,channel:'Пожарные',speaker:'Диспетчер',tone:'critical'});
        if(v.service==='ambulance') this.sim._makeInjury('дым/газ',1,v.x,v.y,'vehicle-fire','fire',null,v.incidentId);
      }
      // Special vehicles are vulnerable in a crowded/violent zone unless a corridor or escort is present.
      if(v.phase==='onsite' && !v.convoy && v.incidentCooldown<=0 && s.tension>78 && Math.random()<dt*0.004) {
        v.incidentCooldown=18;
        if(Math.random()<0.28) {
          v.disabled=true; v.phase='disabled'; v.stoppedAt={x:v.x,y:v.y}; v.condition='Повреждён'; v.driverState='покидает машину';
          const rec=records.find(r=>r.id===v.id);if(rec){rec.disabled=true;rec.condition=v.condition;rec.driverState=v.driverState;}
          this.sim.state.vehicleDamageCount=(s.vehicleDamageCount||0)+1;
          this.sim._publishCrisisEvent('protest','special-vehicle-attack',`Повреждена спецмашина службы «${v.service}»`,'Бригада временно прекращает работу в секторе. Диспетчерская направляет замену; экипаж проверяется медиками.',{severity:1.2,channel:'Диспетчерская',speaker:'Городской диспетчер',tone:'critical'});
          v.sprite.setTint(0xc45a4e); v.sprite.setAlpha(.65);
          if(v.service==='ambulance') this.sim._makeInjury('ушибы и ссадины',1,v.x,v.y,'vehicle-attack','crowd',null,v.incidentId);
        }
      }
      v.incidentCooldown=Math.max(0,(v.incidentCooldown||0)-dt);
    });
  };

  P._updateTraffic=function(dt,s) {
    original._updateTraffic.call(this,dt,s);
    if(!dt) return;
    const now=s.hoursElapsed||0;
    const records=s.roadVehicles||(s.roadVehicles=[]);
    for(const car of this.trafficCars) {
      let rec=records.find(r=>r.id===car.vehicleRecordId);
      if(!rec) {rec={id:car.vehicleRecordId||`ROAD-${records.length+1}`,type:car.bus?'автобус':'легковой автомобиль',condition:car.condition||'Цел',driverState:car.driverState||'в машине',hijacked:!!car.hijacked,fire:0};records.push(rec);car.vehicleRecordId=rec.id;}
      rec.x=car.x;rec.y=car.y;rec.condition=car.condition;rec.driverState=car.driverState;rec.hijacked=!!car.hijacked;rec.fire=car.smoke||0; rec.updatedAt=now;
      if(records.length>100) records.splice(0,records.length-100);
      if(car.condition==='Горит') {
        car.smoke=Math.min(100,(car.smoke||0)+dt*2); car.fireAge=(car.fireAge||0)+dt; car.sprite.setTint(0xe28450); car.speed=0;
        if(car.driverState==='покидает машину' && (car.driverExitAt||0)===0) {car.driverExitAt=now+0.08;}
        if(car.driverState==='покидает машину' && now>=(car.driverExitAt||Infinity)) car.driverState=Math.random()<0.12?'водитель пострадал':'водитель бежит';
        if(car.fireAge>16) {
          car.condition='Выгорел'; car.driverState=car.driverState==='водитель пострадал'?'водитель пострадал':'вне машины'; car.speed=0; car.sprite.setTint(0x373a39).setAlpha(.82);
          if(!car.burnedEventSent){car.burnedEventSent=true;this.sim.state.vehiclesBurned=(s.vehiclesBurned||0)+1;this.sim._radio('Пожарные','Расчёт','Транспорт выгорел; проводится проливка и проверка повторного возгорания.','warning','fire');}
        }
      }
      else if(car.condition==='Повреждён') { car.sprite.setTint(0xb7a082); car.speed=Math.min(car.speed,9); }
      else if(car.condition==='Выгорел') { car.speed=0; car.sprite.setTint(0x373a39).setAlpha(.82); }
      else if(car.hijacked) {
        car.driverState='машина угнана'; car.speed=Math.min(122,(car.speed||55)+dt*10); car.baseSpeed=116; car.sprite.setTint(0xd69b62);
        const crossing=car.x>500&&car.x<790;
        if(crossing && s.roadBlockage>0.35 && !car.impactApplied) {
          car.impactApplied=true;car.condition='Повреждён';car.hijacked=false;car.driverState='водитель пострадал';car.speed=0;
          this.sim._publishCrisisEvent('protest','vehicle-impact','Угнанный автомобиль столкнулся с препятствием у площади','Удар вызвал панику и перекрыл полосу движения; медики и полиция направлены к месту. Эпизод моделируется без тактических подробностей.',{severity:1.3,channel:'Диспетчерская',speaker:'Дорожный диспетчер',tone:'critical'});
          this.sim._makeInjury('перелом',Math.random()<0.45?3:2,car.x,car.y,'vehicle-impact','protest',null,null);
          if(s.building && Math.abs(car.x-640)<55) {s.building.integrity=clamp(s.building.integrity-8,0,100);s.building.status=s.building.integrity<25?'Разрушено':'Повреждено';}
          if(this.trafficCars.some(other=>other!==car&&Math.abs(other.x-car.x)<34&&Math.abs(other.y-car.y)<18)) {
            s.vehicleDamageCount=(s.vehicleDamageCount||0)+1;
            this.sim._radio('Диспетчерская','Дорожный диспетчер','После первого столкновения повреждён соседний автомобиль; образовалась цепочка ДТП, полоса закрыта.','critical','random');
          }
          if(s.incidents.filter(i=>i.status!=='resolved').length<this.sim.config.maxIncidents) this.sim.addIncident('traffic_crash');
        }
      } else {
        for(const z of (s.fireZones||[])) {
          if(Math.hypot(car.x-z.x,car.y-z.y)<(z.radius||20)+18 && Math.random()<dt*0.15) {
            car.condition='Горит';car.driverState='покидает машину';
            this.sim._publishCrisisEvent('fire','vehicle-fire','Огонь перекинулся на транспорт','Автомобиль стал вторичным очагом; полоса временно закрыта. Водитель покидает машину, пожарные получили вызов.',{severity:0.85,channel:'Пожарные',speaker:'Диспетчер',tone:'critical'});
            s.vehicleDamageCount=(s.vehicleDamageCount||0)+1;
            car.fireAge=0;
            if(s.incidents.filter(i=>i.status!=='resolved').length<this.sim.config.maxIncidents) {
              const fireCall=this.sim.addIncident('fire');
              if(fireCall){fireCall.x=car.x;fireCall.y=car.y;fireCall.districtId=(s.districts||[]).slice().sort((a,b)=>Math.hypot(a.blockage||0,0)-Math.hypot(b.blockage||0,0))[0]?.id||s.activeDistrict||'center';}
            }
            break;
          }
        }
      }
      // Small incidents are event based, limited to avoid a runaway event loop.
      car.crisisEventCooldown=Math.max(0,(car.crisisEventCooldown||0)-dt);
      if(car.crisisEventCooldown<=0 && !s.paused && s.tension>82 && s.roadBlockage>0.62 && car.condition==='Цел' && Math.random()<dt*0.0007) {
        car.crisisEventCooldown=28;
        if(Math.random()<0.34) {
          car.condition='Брошен'; car.driverState='водитель покидает машину'; car.speed=0;
          this.sim._radio('Диспетчерская','Городской диспетчер','Водитель оставил автомобиль у заблокированной полосы; возможны объезд и дополнительная очередь.','warning','random');
          if(Math.random()<0.28) {car.hijacked=true;this.sim.state.hijackedVehicles=(s.hijackedVehicles||0)+1;this.sim._radio('Полиция','Патруль','Сообщение о возможном угоне оставленного транспортного средства передано дежурному сектору.','critical','protest');}
        }
      }
    }
  };

  P._renderEnvironment=function(s,time) {
    original._renderEnvironment.call(this,s,time);
    const g=this.fx; if(!g) return;
    // Larger fire areas, drifting smoke, damaged building and barricade silhouettes.
    (s.fireZones||[]).forEach(z=>{
      if(z.condition==='Потушено'){const left=clamp((z.smokeLife||0)/20,0,1);if(left>0){const smoke=Math.max(18,z.smokeRadius||32);g.fillStyle(0x353d3d,.09*left);g.fillEllipse((z.x||0)+(z.windDrift||0),(z.y||0)-smoke*.4,smoke*2.1,smoke*.85);for(let k=0;k<3;k++){const up=(time*.006+k*12)%(smoke+18);g.fillStyle(0x4b5251,.045*left);g.fillEllipse((z.x||0)+Math.sin(time*.001+k)*smoke*.2,(z.y||0)-up-10,9+up*.25,7+up*.2);}}return;}
      const pulse=.65+Math.sin(time*.013+(z.x||0))*.16;
      const radius=Math.max(12,z.radius||18), smoke=Math.max(radius,z.smokeRadius||32);
      g.fillStyle(0x292f31,0.045);g.fillEllipse((z.x||0)+(z.windDrift||0), (z.y||0)-smoke*.22,smoke*2.15,smoke*1.05);
      for(let k=0;k<4;k++) {
        const drift=Math.sin(time*.0015+k*2.1+(z.x||0))*(smoke*.24);
        const up=(time*.012+k*15)%(smoke+28);
        g.fillStyle(0x454c4b,Math.max(.02,.12-up/(smoke+28)*.08));g.fillCircle((z.x||0)+(z.windDrift||0)+drift,(z.y||0)-up-14,8+up*.20);
      }
      g.fillStyle(0xef8039,.075+pulse*.045);g.fillEllipse(z.x,z.y+1,radius*3.25,radius*.78);
      g.fillStyle(0xdf6334,.14+pulse*.07);g.fillEllipse(z.x,z.y,radius*1.7,radius*.46);
      for(let i=0;i<5;i++){const fx=z.x+Math.sin(time*.009+i*2.5)*radius*.25;const fy=z.y-(time*.014+i*8)%(radius+26);g.fillStyle(i%2?0xffbc65:0xe35e32,.55);g.fillTriangle(fx-4,fy,fx+4,fy,fx,fy-10);}
    });
    (s.gasZones||[]).forEach(z=>{
      const radius=z.radius||90;const a=clamp((z.life||0)/3,.02,.22);
      const color=z.kind==='water'?0x8ebbc2:z.kind==='flash'?0xe7cf9c:0xa4b5a4;
      g.fillStyle(color,a*.62);g.fillEllipse(z.x+(z.drift||0),z.y-3,radius*1.85,radius*.92);
      g.fillStyle(color,a*.28);g.fillEllipse(z.x-radius*.22,z.y+2,radius*1.42,radius*.66);
    });
    (s.barricades||[]).forEach(b=>{
      if(b.status==='cleared'||b.status==='burned')return;
      const hp=clamp(b.health/100);g.fillStyle(b.burning?0xb75f43:0x5c5d54,.86);g.fillRect(b.x-31,b.y-9,62,18);
      g.fillStyle(b.burning?0xf09a50:0xc8b37d,.75);g.fillRect(b.x-27,b.y-6,54,3);
      g.lineStyle(1,0xd8c5a3,.45);g.strokeRect(b.x-31,b.y-9,62,18);
      g.fillStyle(0xc8564b,.85);g.fillRect(b.x-28,b.y+5,56*hp,2);
    });
    // Damaged street assets remain visible even after the immediate fire effect fades.
    (s.assets||[]).filter(a=>a.condition==='Повреждён'||a.condition==='Сильно повреждён'||a.condition==='Разрушен'||a.condition==='Горит').forEach(a=>{
      const r=Math.max(7,(a.radius||18)*.52);const col=a.condition==='Горит'?0xe2753a:a.condition==='Разрушен'?0x252a29:0x9f5549;
      g.fillStyle(col,a.condition==='Горит'?.18:.11);g.fillEllipse(a.x,a.y+2,r*2.5,r*.72);
      if(a.condition==='Горит'){g.fillStyle(0xf8a14b,.8);g.fillTriangle(a.x-3,a.y,a.x+3,a.y,a.x,a.y-9);}
    });
    // Building condition is visible as the seal/cornice loses integrity.
    if(s.building && s.building.integrity<100) {
      const damage=1-s.building.integrity/100;g.fillStyle(0x2a2723,Math.min(.32,damage*.42));g.fillRect(497,129,286,100);
      g.lineStyle(2,0xb75f4b,Math.min(.8,damage));g.strokeRect(493,126,294,108);
      for(let i=0;i<Math.floor(damage*9);i++){const x=516+i*29;g.lineStyle(1.5,0x463d36,.8);g.beginPath();g.moveTo(x,138);g.lineTo(x+5,155+i%4*7);g.lineTo(x+2,173+i%5*5);g.strokePath();}
    }
    const smokeLevel=(s.fireZones||[]).reduce((v,z)=>v+(z.smokeRadius||0)/900,0)+(s.gasZones||[]).reduce((v,z)=>v+(z.kind==='gas'?0.07:0.025),0);
    if(smokeLevel>0.05) {g.fillStyle(0x656e6b,Math.min(.28,smokeLevel));g.fillRect(0,260,1280,300);}
    // Sector map and status remain pinned to the screen while the live camera moves.
    this._renderFixedCrisisHUD(s,time);
    // Damaged/burning road traffic reflects condition changes without replacing the live camera.
    for(const car of this.trafficCars||[]) {
      if(car.condition==='Брошен') {g.lineStyle(2,0xd0ad71,.5);g.beginPath();g.moveTo(car.x-8,car.y-4);g.lineTo(car.x+8,car.y+4);g.moveTo(car.x+8,car.y-4);g.lineTo(car.x-8,car.y+4);g.strokePath();}
      if(car.condition==='Горит') {const flicker=.6+Math.sin(time*.04+car.x)*.25;g.fillStyle(0xec743b,flicker*.18);g.fillEllipse(car.x,car.y-3,35,13);g.fillStyle(0xffb764,flicker);g.fillTriangle(car.x-6,car.y-4,car.x,car.y-20,car.x+6,car.y-4);g.fillStyle(0x484d4a,.2);g.fillEllipse(car.x-3,car.y-18,11,6);}
    }
  };

  P._updateCrisisActionVisuals=function() {
    const s=this.sim.state, action=s.lastPoliceAction;
    if(!action || action.seq===this.crisisLastActionSeq) return;
    this.crisisLastActionSeq=action.seq;
    if(['gas','water','flash'].includes(action.method)) {
      const zone=(s.gasZones||[])[0];if(zone) this.interactionMarks.push({type:'throw-impact',x:zone.x,y:zone.y,expires:this.currentTime+1200});
      this.people.forEach(a=>{if(a.protester && Math.random()<0.28){a.behavior='flee';a.tx=clamp(a.x+(a.x<640?-1:1)*rnd(55,140),40,1240);a.ty=clamp(a.y+rnd(-50,40),300,620);a.speed=rnd(55,90);a.timer=1.6;}});
    } else if(action.method==='retreat') {
      (this.crowdPolice||[]).forEach((p,i)=>{p.setTint(0x9a9d96);p.setData('aiTarget',{x:i%2?1050:230,y:412});});
    } else if(action.method==='cordon') {
      (this.crowdPolice||[]).forEach((p,i)=>{p.setData('aiTarget',{x:535+(i%8)*30,y:308+Math.floor(i/8)*14});});
    } else if(action.method==='physical'||action.method==='rubber'||action.method==='live') {
      const hostile=this.people.filter(a=>a.protester&&!a.detained); if(hostile.length) {
        const a=hostile.reduce((best,q)=>!best||Math.hypot(q.x-640,q.y-420)<Math.hypot(best.x-640,best.y-420)?q:best,null);
        this.interactionMarks.push({type:'police-contact',x:a.x,y:a.y,expires:this.currentTime+1300});
        if(action.method==='physical'&&Math.random()<0.48){a.detained=true;a.detainedUntil=this.currentTime+9000;a.behavior='detained';a.speed=0;this.sim._radio('Полиция','Патруль',`Участник ${a.groupId||'неустановленной группы'} задержан; данные переданы в оперативный журнал.`,'warning','police');}
        else if(action.method!=='live'){a.behavior='flee';a.tx=clamp(a.x+(a.x<640?-1:1)*70,18,1262);a.speed=58;}
      }
    }
  };


  P._updateDistrictCamera=function(deltaMs=0,s=this.sim&&this.sim.state,immediate=false) {
    if(!s||!this.cameras||!this.cameras.main)return;
    const anchors={center:{x:640,y:420,label:'ПЛОЩАДЬ И МЭРИЯ'},station:{x:220,y:413,label:'ВОКЗАЛЬНЫЙ УЗЕЛ'},workers:{x:360,y:490,label:'РАБОЧИЙ КВАРТАЛ'},ring:{x:1010,y:490,label:'КОЛЬЦЕВАЯ ДОРОГА'},suburbs:{x:1100,y:368,label:'ПРИГОРОДНЫЙ СЕКТОР'}};
    const id=s.activeDistrict||'center';
    if(id===this.crisisCameraDistrict)return;
    this.crisisCameraDistrict=id;
    const a=anchors[id]||anchors.center, camera=this.cameras.main;
    if(immediate){camera.centerOn(a.x,a.y);camera.setZoom(1.0);} else {camera.pan(a.x,a.y,680,'Sine.easeInOut');camera.setZoom(id==='center'?1.0:1.06);}
    if(this.crisisHudTitle)this.crisisHudTitle.setText(`КАМЕРА · ${a.label}`);
  };

  P._renderFixedCrisisHUD=function(s,time) {
    const g=this.crisisHud;if(!g)return;
    g.clear();
    const x=1015,y=12,w=251,h=132;
    g.fillStyle(0x172226,.9);g.fillRoundedRect(x,y,w,h,4);
    g.lineStyle(1,0x9aab9f,.5);g.strokeRoundedRect(x,y,w,h,4);
    g.fillStyle(0xcab98f,.8);g.fillRect(x+10,y+9,4,4);
    g.fillStyle(0xe1ded0,.82);g.fillRect(x+17,y+11,66,1);
    const nodes=[{id:'center',x:x+58,y:y+47},{id:'station',x:x+23,y:y+62},{id:'workers',x:x+89,y:y+66},{id:'ring',x:x+143,y:y+75},{id:'suburbs',x:x+195,y:y+43}];
    const edges=[[0,1],[0,2],[2,3],[3,4],[1,2],[2,4]];
    g.lineStyle(1,0x7f9186,.5);edges.forEach(([a,b])=>{g.beginPath();g.moveTo(nodes[a].x,nodes[a].y);g.lineTo(nodes[b].x,nodes[b].y);g.strokePath();});
    nodes.forEach(n=>{const d=(s.districts||[]).find(v=>v.id===n.id)||{tension:30,blockage:0,crowd:0};const t=clamp(d.tension);const color=t>75?0xd56c5c:t>55?0xd4ad6a:0x7baca0;g.fillStyle(color,.9);g.fillRect(n.x-3,n.y-3,6,6);if(n.id===(s.activeDistrict||'center')){g.lineStyle(2,0xf1d7a5,.9);g.beginPath();g.moveTo(n.x-7,n.y);g.lineTo(n.x+7,n.y);g.moveTo(n.x,n.y-7);g.lineTo(n.x,n.y+7);g.strokePath();}});
    g.fillStyle(0xbec8bf,.8);g.fillRect(x+10,y+91,w-20,1);
    const active=(s.districts||[]).find(d=>d.id===(s.activeDistrict||'center'))||{name:'Площадь',crowd:0,tension:0,blockage:0};
    const lines=[`${active.name.toUpperCase()}`,`ЯВКА ${Math.round(active.crowd||0)} · НАПРЯЖЕНИЕ ${Math.round(active.tension||0)}%`,`ДОРОГИ ${Math.round((active.blockage||0)*100)}% · ДЕНЬ ${s.day} ${String(s.hour).padStart(2,'0')}:${String(s.minute||0).padStart(2,'0')}`];
    // Screen-fixed text is used for crisp telemetry across camera movement.
    if(!this.crisisHudReadout){this.crisisHudReadout=this.add.text(x+10,y+95,'',{fontFamily:'monospace',fontSize:'7px',color:'#cdd6ce',lineSpacing:1}).setScrollFactor(0).setDepth(12002);}
    this.crisisHudReadout.setText(lines.join('\n'));
  };

  P.update=function(time,deltaMs) {
    this._updateDistrictCamera(deltaMs,this.sim&&this.sim.state,false);
    original.update.call(this,time,deltaMs);
    this._updateCrisisActionVisuals();
    this.vehicleAlertTimer+=deltaMs||0;
    if(this.vehicleAlertTimer>900) {this.vehicleAlertTimer=0; if(window.dashboardUI && typeof window.dashboardUI.renderCrisisMonitor==='function') window.dashboardUI.renderCrisisMonitor();}
  };
})();

/* Dashboard controls and telemetry for the added systems. */
(function installCrisisUI() {
  const clamp = (v, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, Number(v) || 0));
  const UI=window.RepublicDashboardUI; if(!UI) return;
  const P=UI.prototype, original={};
  ['_bind','_onSimEvent','renderAll','updateStats','updateIncidents','saveGame','loadGame'].forEach(k=>original[k]=P[k]);
  P._bind=function() {
    original._bind.call(this);
    document.querySelectorAll('[data-crisis-action]').forEach(button=>button.addEventListener('click',()=>{
      const action=button.dataset.crisisAction;
      if(action==='revoke') {this.sim.revokeMeasure();this.toast('Мера отозвана','Общественная реакция и будущая мобилизация пересчитаны.','warning');}
      else if(action==='promise') {const p=this.sim.makePromise();if(p)this.toast('Обязательство опубликовано',`${p.title}. Срок — через 48 модельных часов.`,'info');}
      else if(action==='referendum') {const ok=this.sim.startReferendum();this.toast(ok?'Голосование объявлено':'Голосование уже идёт',ok?'Результат появится через три модельных дня.':'Дождитесь завершения текущего голосования.',ok?'success':'warning');}
      else if(action==='police-reinforce') {this.sim.commandPolice('reinforce');this.toast('Запрос передан','Подкрепление будет учитывать загруженность улиц.','info');}
      else if(action==='police-rotate') {this.sim.commandPolice('rotate');this.toast('Смена ротируется','Усталость снижена, мораль подразделения пересчитана.','success');}
      else if(action==='police-corridor') {this.sim.commandPolice('corridor');this.toast('Коридор организуется','Проезд скорой и пожарных получает приоритет.','info');}
      else if(action==='police-talk') {this.sim.commandPolice('talk');this.toast('Переговорщики направлены','Командование продолжит самостоятельно оценивать обстановку.','info');}
      else if(action.startsWith('force-')) {const method=action.slice(6);const ok=this.sim.commandPolice(method);if(ok)this.toast('Приказ принят',this.sim.state.policeOrder,method==='live'||method==='rubber'?'warning':'info');}
      this.renderAll(true);
    }));
    const cap=document.getElementById('force-cap');
    if(cap){cap.value=String(this.sim.state.forceCap??3);cap.addEventListener('input',()=>{const value=Number(cap.value);document.getElementById('force-cap-value').textContent=`${value}/7`;});cap.addEventListener('change',()=>this.sim.setForceCap(Number(cap.value)));}
    const doctrine=document.getElementById('doctrine-select');
    if(doctrine) doctrine.addEventListener('change',()=>{
      const map={observe:['observe','Наблюдение'],contain:['contain','Сдерживание'],disperse:['disperse','Разгон'],protect:['protect','Защита объекта'],withdraw:['withdraw','Отступление']};
      const value=map[doctrine.value];if(!value)return;
      this.sim.state.policeCommandOverride={code:value[0],label:value[1],until:(this.sim.state.hoursElapsed||0)+4};
      this.sim.state.doctrine=value[1];this.sim.state.doctrineCode=value[0];
      this.sim._radio('Правительственный','Штаб','Политическое руководство установило временный приоритет доктрины; автономное командование сохраняет выбор конкретного решения.','info','government');this.renderAll(true);
    });
    document.getElementById('radio-clear')?.addEventListener('click',()=>{this.sim.state.radioFeed=[];this.renderRadio();});
    document.getElementById('district-list')?.addEventListener('click',e=>{const btn=e.target.closest('[data-district-action]');if(!btn)return;const d=this.sim.state.districts.find(x=>x.id===btn.dataset.districtAction);if(!d)return;this.sim.state.activeDistrict=d.id;window.worldScene?._updateDistrictCamera(0,this.sim.state,false);this.sim._notify('districts');this.toast('Камера переключена',`${d.name}: напряжённость ${Math.round(d.tension)}%, блокировка ${Math.round(d.blockage*100)}%. Обзор переключается плавно, все сектора продолжают моделироваться.`, 'info');});
    document.getElementById('promise-list')?.addEventListener('click',e=>{const btn=e.target.closest('[data-fulfill-promise]');if(btn){const ok=this.sim.fulfillPromise(Number(btn.dataset.fulfillPromise));this.toast(ok?'Обязательство исполнено':'Не удалось исполнить',ok?'Изменения внесены в политику и бюджет.':'Проверьте статус обязательства и состояние казны.',ok?'success':'warning');this.renderAll(true);}});
  };

  P._onSimEvent=function(type,payload) {
    if(type==='radio') {this.renderRadio(); this.renderCrisisMonitor(); return;}
    if(type==='districts') {this.renderDistricts(); return;}
    if(type==='police-command') {this.renderCrisisMonitor();}
    original._onSimEvent.call(this,type,payload);
    if(['reset','load','update','daily','derived','policy','action','incident','incident-resolved','service-arrive','negotiation-result'].includes(type)) {this.renderCrisisMonitor();this.renderDistricts();}
  };
  P.renderAll=function(force=false) {original.renderAll.call(this,force);this.renderCrisisMonitor();this.renderDistricts();this.renderRadio();};
  P.updateStats=function() {
    original.updateStats.call(this);
    const s=this.sim.state;
    const pm=document.getElementById('prime-minister-name');if(pm)pm.textContent=s.primeMinister||'Ирина Волкова';
    const ver=document.querySelector('.app-footer span');if(ver)ver.textContent='КОНТУР // ВЕРСИЯ 9.0.0';
    const mode=document.getElementById('state-mode');if(mode) {mode.textContent=s.stateMode||'Обычное управление';mode.className=`state-mode ${s.stateModeCode||'normal'}`;}
    const active=(s.districts||[]).find(d=>d.id===(s.activeDistrict||'center'));
    const subtitle=document.getElementById('world-subtitle');if(subtitle&&active)subtitle.textContent=`Камера мониторинга: ${active.name} · напряжённость ${Math.round(active.tension)}% · загрузка дорог ${Math.round(active.blockage*100)}%`;
    const ph=document.getElementById('police-doctrine-label');if(ph)ph.textContent=s.doctrine||'Наблюдение';
    const moral=document.getElementById('police-morale-value');if(moral)moral.textContent=`${Math.round(s.policeMorale||0)}%`;
    const fat=document.getElementById('police-fatigue-value');if(fat)fat.textContent=`${Math.round(s.policeFatigue||0)}%`;
    const injuries=document.getElementById('injuries-value');if(injuries)injuries.textContent=String((s.injuries||[]).filter(i=>i.status==='awaiting'||i.status==='stabilized').length);
    const deaths=document.getElementById('deaths-value');if(deaths)deaths.textContent=String(s.deaths||0);
    const build=document.getElementById('building-integrity');if(build)build.textContent=`${Math.round(s.building?.integrity??100)}% · ${s.building?.status||'Цел'}`;
    const support=document.getElementById('movement-support');if(support)support.textContent=`${Math.round(s.publicSupportProtest||0)}%`;
    const orders=document.getElementById('order-support');if(orders)orders.textContent=`${Math.round(s.orderSupport||0)}%`;
    const toolmap={gas:'gas-stock',water:'water-stock',flash:'flash-stock',rubber:'rubber-stock',live:'live-stock'};
    Object.entries(toolmap).forEach(([k,id])=>{const e=document.getElementById(id);if(e)e.textContent=String(s.policeTools?.[k]??0);});
  };

  P.renderCrisisMonitor=function() {
    const s=this.sim.state;
    const summary=document.getElementById('crisis-summary');
    if(summary) summary.innerHTML='';
    const addStat=(label,value,detail,cls='')=>{
      if(!summary)return;const el=document.createElement('div');el.className=`crisis-stat ${cls}`;
      const l=document.createElement('span');l.textContent=label;const v=document.createElement('strong');v.textContent=value;const d=document.createElement('small');d.textContent=detail;el.append(l,v,d);summary.append(el);
    };
    addStat('РАНЕНЫЕ',(s.injuries||[]).filter(i=>i.status==='awaiting'||i.status==='stabilized').length,`всего случаев ${s.injuredTotal||0}`,'warn');
    addStat('ПОГИБШИЕ',s.deaths||0,'влияют на расследование и явку',(s.deaths||0)?'danger':'');
    addStat('ЗАПАСЫ ГАЗА',s.policeTools?.gas??0,'абстрактные единицы');
    addStat('ПРОЧНОСТЬ ОБЪЕКТА',`${Math.round(s.building?.integrity??100)}%`,s.building?.status||'Цел',(s.building?.integrity??100)<40?'danger':'' );
    const injuryBreakdown=document.getElementById('injury-breakdown');
    if(injuryBreakdown) injuryBreakdown.textContent=`Лёгкие ${s.woundedLight||0} · средние ${s.woundedMedium||0} · тяжёлые ${s.woundedHeavy||0} · критические ${s.woundedCritical||0}`;
    const injuryList=document.getElementById('injury-list');
    if(injuryList) {
      injuryList.innerHTML='';
      const active=(s.injuries||[]).filter(i=>i.status==='awaiting'||i.status==='stabilized').slice(0,7);
      if(!active.length){const empty=document.createElement('p');empty.className='radio-empty';empty.textContent='Пострадавших, ожидающих помощи, нет.';injuryList.append(empty);}
      active.forEach(i=>{const row=document.createElement('div');row.className='injury-row';const a=document.createElement('strong');a.textContent=`${i.id} · ${i.grade}`;const b=document.createElement('small');b.textContent=`${i.kind} · ${i.status==='stabilized'?'стабилизирован':'ожидает помощи'} · ${Math.round(i.x)}, ${Math.round(i.y)}`;row.append(a,b);injuryList.append(row);});
    }
    const promises=document.getElementById('promise-list');
    if(promises) {
      promises.innerHTML='';const items=(s.promises||[]).slice(0,5);
      if(!items.length){const empty=document.createElement('p');empty.className='radio-empty';empty.textContent='Активных публичных обязательств нет.';promises.append(empty);}
      items.forEach(p=>{const row=document.createElement('div');row.className='promise-row';const copy=document.createElement('div');const title=document.createElement('strong');title.textContent=p.title;const detail=document.createElement('small');detail.textContent=`${p.status==='fulfilled'?'ИСПОЛНЕНО':p.status==='overdue'?'ПРОСРОЧЕНО':`срок: день ${p.deadlineDay}`} · ${p.demand}`;copy.append(title,detail);row.append(copy);if(p.status==='pending'){const b=document.createElement('button');b.type='button';b.textContent='Исполнить';b.dataset.fulfillPromise=String(p.id);row.append(b);}promises.append(row);});
    }
    const stateMode=document.getElementById('state-mode');if(stateMode){stateMode.textContent=s.stateMode||'Обычное управление';stateMode.className=`state-mode ${s.stateModeCode||'normal'}`;}
  };

  P.renderDistricts=function() {
    const container=document.getElementById('district-list');if(!container)return;container.innerHTML='';
    (this.sim.state.districts||[]).forEach(d=>{
      const row=document.createElement('div');row.className='district-row';
      const copy=document.createElement('div');copy.className='district-copy';
      const name=document.createElement('strong');name.textContent=d.name;const detail=document.createElement('small');detail.textContent=`${d.kind} · ${d.incidents||0} инцид. · явка ≈ ${Math.round(d.crowd||0)}`;copy.append(name,detail);
      const meters=document.createElement('div');meters.className='district-meters';const line=document.createElement('div');line.className='district-meter';const fill=document.createElement('i');fill.style.width=`${clamp(d.tension)}%`;line.append(fill);const block=document.createElement('span');block.textContent=`${Math.round(d.blockage*100)}%`;meters.append(line,block);
      const action=document.createElement('button');action.type='button';action.textContent=(this.sim.state.activeDistrict||'center')===d.id?'Камера ✓':'Камера';action.dataset.districtAction=d.id;if((this.sim.state.activeDistrict||'center')===d.id)row.classList.add('district-active');row.append(copy,meters,action);container.append(row);
    });
  };

  P.renderRadio=function() {
    const container=document.getElementById('radio-feed');if(!container)return;
    const items=(this.sim.state.radioFeed||[]).slice(0,22);container.innerHTML='';
    if(!items.length){const p=document.createElement('p');p.className='radio-empty';p.textContent='Эфир свободен. Ожидание первого сообщения.';container.append(p);return;}
    items.forEach(item=>{
      const row=document.createElement('article');row.className=`radio-row radio-${item.tone||'info'}`;
      const meta=document.createElement('div');meta.className='radio-meta';const time=document.createElement('span');time.textContent=`Д${String(item.day).padStart(2,'0')} ${String(item.hour).padStart(2,'0')}:${String(item.minute||0).padStart(2,'0')}`;const chan=document.createElement('strong');chan.textContent=item.channel;meta.append(time,chan);
      const who=document.createElement('small');who.textContent=item.speaker;
      const text=document.createElement('p');text.textContent=item.text;
      row.append(meta,who,text);container.append(row);
    });
  };

  P.saveGame=function(automatic=false) {
    try {
      localStorage.setItem('kontur-republic-save-v3',JSON.stringify(this.sim.snapshot()));
      this._lastSaveAt=new Date();const label=document.getElementById('last-save-label');if(label)label.textContent=`СОХРАНЕНО ${this._lastSaveAt.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}`;
      if(!automatic)this.toast('Игра сохранена','Политика, экономика, служебный эфир, инциденты и история кризисов записаны в браузере.','success');return true;
    } catch(err) {if(!automatic)this.toast('Не удалось сохранить','Браузер запретил localStorage. Попробуйте открыть проект через локальный сервер.','error');return false;}
  };
  P.loadGame=function() {
    try {
      let raw=localStorage.getItem('kontur-republic-save-v3');
      let migrated=false;
      if(!raw){raw=localStorage.getItem('kontur-republic-save-v2');migrated=!!raw;}
      if(!raw){this.toast('Сохранение не найдено','Сначала сохраните игру кнопкой со стрелкой вниз.','warning');return false;}
      this.sim.loadSnapshot(JSON.parse(raw));this.draft={...this.sim.state.policies};this._syncPolicyInputs();this.renderAll(true);
      document.getElementById('last-save-label').textContent=migrated?'ЗАГРУЖЕНО И АДАПТИРОВАНО ИЗ v2':'ЗАГРУЖЕНО ИЗ БРАУЗЕРА';
      this.toast('Сохранение загружено',migrated?'Состояние v2 сохранено; для новых систем добавлены начальные параметры.':'Предыдущее состояние восстановлено.','success');return true;
    } catch(err) {this.toast('Ошибка загрузки',`Сохранение не удалось прочитать: ${err.message}`,'error');return false;}
  };
})();
