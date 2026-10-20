'use strict';
/* KONTUR v5 — continuous time, autonomous police, causal fires, camps, barriers and richer procedural effects.
   All crowd-control equipment and projectiles are abstract game tokens, not real-world instructions. */
(function installKonturV5() {
  const Sim = window.RepublicSimulation;
  const Scene = window.RepublicCityScene;
  const UI = window.RepublicDashboardUI;
  if (!Sim || !Scene || !UI) return;

  const clamp = (v, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, Number(v) || 0));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const irnd = (a, b) => Math.floor(rnd(a, b + 1));
  const choose = a => a[Math.floor(Math.random() * a.length)];
  const alive = i => i && i.status !== 'resolved';
  const onFire = c => c && ['Горит', 'Тлеет'].includes(c.condition);
  const SP = Sim.prototype;
  const P = Scene.prototype;
  const UP = UI.prototype;
  const simOld = {};
  ['_initCrisisState','_hourlyStep','_updatePoliceDoctrine','_updateFirePhysics','_createBarricade','_spawnIncident','_updateCrowdDynamics','_registerDeath','_makeInjury','_igniteCamp','commandPolice','reset','loadSnapshot'].forEach(k => simOld[k] = SP[k]);
  const sceneOld = {};
  ['create','_addPerson','_updatePeople','_v4UpdatePoliceAI','_updateProjectiles','_renderEnvironment','_renderFixedCrisisHUD','update'].forEach(k => sceneOld[k] = P[k]);
  const uiOld = {};
  ['updateStats','saveGame','loadGame'].forEach(k => uiOld[k] = UP[k]);

  // v5 state is additive, so v2-v4 saves can be migrated without erasing previous history.
  SP._initCrisisState = function(migrating = false) {
    if (simOld._initCrisisState) simOld._initCrisisState.call(this, migrating);
    const s = this.state;
    if (!s) return;
    s.crowdAnger = clamp(s.crowdAnger ?? Math.round((s.tension || 38) * 3 + (s.publicAnger || 42) * 3), 0, 1000);
    s.policeMorale = clamp(s.policeMorale ?? 72);
    s.policeFatigue = clamp(s.policeFatigue ?? 12);
    s.policeTools = Object.assign({ gas:14, water:10, flash:8, rubber:22, live:4 }, s.policeTools || {});
    s.forceCap = clamp(s.forceCap ?? 2, 0, 7);
    s.campSites = Array.isArray(s.campSites) && s.campSites.length ? s.campSites : [];
    s.barricades = Array.isArray(s.barricades) ? s.barricades : [];
    s.fireZones = Array.isArray(s.fireZones) ? s.fireZones : [];
    s.gasZones = Array.isArray(s.gasZones) ? s.gasZones : [];
    s.smokeZones = Array.isArray(s.smokeZones) ? s.smokeZones : [];
    s.injuries = Array.isArray(s.injuries) ? s.injuries : [];
    s.assets = Array.isArray(s.assets) ? s.assets : [];
    s.radioFeed = Array.isArray(s.radioFeed) ? s.radioFeed : [];
    if (!Number.isFinite(s.lastCampGrowthAt)) s.lastCampGrowthAt = Number(s.hoursElapsed || 0);
    if (!Number.isFinite(s.v5LastPoliceActionAt)) s.v5LastPoliceActionAt = Number(s.lastV4PoliceActionAt || -999);
    if (!Number.isFinite(s.v5ForceCapAt)) s.v5ForceCapAt = Number(s.hoursElapsed || 0);
    if (!Number.isFinite(s.v5BarricadeSeq)) s.v5BarricadeSeq = s.barricades.length;
    if (!Number.isFinite(s.v5ColorSmokeSeq)) s.v5ColorSmokeSeq = 0;
    if (!Number.isFinite(s.v5BuildingCollapseCount)) s.v5BuildingCollapseCount = 0;
    if (s.building) {
      if (!Number.isFinite(s.building.integrity)) s.building.integrity = 100;
      s.building.integrity = clamp(s.building.integrity, 0, 100);
      s.building.occupation = Boolean(s.building.occupation);
      if (s.building.integrity <= 0 && !s.building.collapseConsequencesApplied) s.building.collapsePending = true;
    }
    // Earlier saves sometimes marked a barricade as burning without a source. Stop that phantom fire on import.
    for (const b of s.barricades) {
      if (b.burning && !b.fireIncidentId && !(s.fireZones || []).some(z => Math.hypot(z.x - b.x, z.y - b.y) < 65)) {
        b.burning = false;
        if (b.condition === 'Горит') b.condition = 'Строится';
      }
      b.length = Number(b.length) || rnd(68, 118);
      b.material = b.material || 'смешанная';
      b.tires = Number(b.tires) || irnd(2, 6);
    }
    this._updateDistricts?.(false, false);
  };

  // Central clock: GAME_CONFIG.minutesPerTick=1 and main.js ticks once per second at 1x.
  if (window.GAME_CONFIG) {
    window.GAME_CONFIG.version = '5.2.0';
    window.GAME_CONFIG.minutesPerTick = 1;
  }

  // Camp growth may happen at any hour, including after dark. It is socially generated, never spontaneous ignition.
  SP._v5MaybeGrowCamps = function() {
    const s = this.state;
    if (!s) return;
    const now = Number(s.hoursElapsed || 0);
    if (now - Number(s.lastCampGrowthAt ?? now) < 2.7) return;
    const anger = clamp(s.crowdAnger || 0, 0, 1000);
    const attendance = Number(s.crowdTarget || 0);
    const hour = Number(s.hour || 0) + Number(s.minute || 0) / 60;
    const night = hour >= 20 || hour < 6;
    s.lastCampGrowthAt = now;
    if (attendance < 90 && anger < 160 && Math.random() > 0.08) return;
    const chance = clamp(0.07 + Math.max(0, attendance - 300) / 9000 + anger / 2100 + (night ? 0.11 : 0), 0.06, 0.76);
    if (Math.random() > chance) return;

    const burned = (s.campSites || []).filter(c => c.condition === 'Выжжен' && now - Number(c.burnedAt || 0) >= 3).sort((a, b) => (a.burnedAt || 0) - (b.burnedAt || 0));
    const living = (s.campSites || []).filter(c => !['Выжжен','Снят'].includes(c.condition));
    const canAdd = (s.campSites || []).length < 8 && living.length < 6;
    if (burned.length && (!canAdd || Math.random() < 0.45)) {
      const camp = burned[0];
      camp.condition = 'Повреждён';
      camp.integrity = irnd(34, 62);
      camp.tentCount = Math.max(2, irnd(2, Math.max(3, Math.round((camp.tentCount || 4) * 0.6))));
      camp.fireRemaining = 0; camp.fireIntensity = 0; camp.ignitionCause = null;
      camp.rebuildAt = (s.day || 1) + irnd(2, 5);
      camp.lastRebuiltAt = now;
      this._radio?.('Гражданский','Координатор лагеря',`${camp.name}: после выгоревших палаток установлены новые временные укрытия.`, 'info','citizens');
      this._publishCrisisEvent?.('citizens','camp-restored',`Возвращается палаточный лагерь: ${camp.name}`,'Часть участников восстановила укрытия на прежнем месте. Новые палатки появились после организационного решения, а не автоматически после пожара.',{severity:0.35,channel:'Гражданский',speaker:'Наблюдатель на площади',tone:'info'});
      return;
    }
    if (!canAdd) return;
    const sites = [
      { x:270,y:467,radius:28,name:'Лагерь у западной ограды' }, { x:430,y:512,radius:27,name:'Южный палаточный лагерь' },
      { x:790,y:501,radius:30,name:'Лагерь у боковой аллеи' }, { x:1010,y:475,radius:30,name:'Восточный лагерь' },
      { x:555,y:468,radius:25,name:'Лагерь волонтёров' }, { x:850,y:525,radius:28,name:'Лагерь у остановки' },
      { x:355,y:511,radius:27,name:'Запасной палаточный лагерь' }, { x:970,y:516,radius:26,name:'Лагерь у внешней дороги' }
    ];
    const activeFireFronts=(s.incidents||[]).filter(i=>alive(i)&&['fire','arson','building_fire','roof_fire','camp_fire','vehicle_fire'].includes(i.type));
    const eligible = sites.filter(p => (s.campSites || []).every(c => Math.hypot(c.x-p.x,c.y-p.y) > (c.radius || 30)+p.radius+26) && Math.hypot(640-p.x,285-p.y)>110 && activeFireFronts.every(i=>Math.hypot((i.x||640)-p.x,(i.y||420)-p.y)>(i.fireRadius||24)+p.radius+12));
    if (!eligible.length) return;
    const site = choose(eligible);
    const id = `camp-v5-${(s.day||1)}-${Math.round(now*10)}-${irnd(10,99)}`;
    const camp = { id, name:site.name, x:site.x, y:site.y, radius:site.radius, integrity:irnd(72,100), condition:'Цел', fireRemaining:0, fireIntensity:0, tentCount:irnd(2,5), rebuildAt:0, createdAt:now, createdAtNight:night };
    s.campSites.push(camp);
    this._radio?.('Гражданский','Координатор лагеря',`${camp.name}: группа добровольцев поставила временные палатки ${night ? 'после наступления темноты' : 'днём'}. Пожарных рисков пока не обнаружено.`, 'info','citizens');
    this._publishCrisisEvent?.('citizens','camp-established',`Появился новый палаточный лагерь: ${camp.name}`,`Укрытия установлены в ${night ? 'ночное время' : 'дневное время'} на свободном месте площади. Лагерь остаётся обычным объектом сцены до появления отдельного источника опасности.`,{severity:0.3,channel:'Гражданский',speaker:'Волонтёрский пункт',tone:'info'});
  };

  SP._hourlyStep = function() {
    const result = simOld._hourlyStep.call(this);
    this._v5MaybeGrowCamps();
    this._v5ApplyBuildingCollapse();
    return result;
  };

  SP._v5ApplyBuildingCollapse = function() {
    const s = this.state, b = s && s.building;
    if (!b || Number(b.integrity) > 0 || b.collapseConsequencesApplied) return;
    b.integrity = 0; b.status = 'Разрушено'; b.occupation = true; b.collapsePending = false; b.collapseConsequencesApplied = true;
    s.v5BuildingCollapseCount = (s.v5BuildingCollapseCount || 0) + 1;
    s.temporaryCabinet = true; s.investigationOpen = true; s.stability = clamp((s.stability || 0) - 22); s.trust = clamp((s.trust || 0) - 18);
    s.approval = clamp((s.approval || 0) - 10); s.crowdAnger = clamp((s.crowdAnger || 0) + 110, 0, 1000);
    s.stateMode = 'Разрушение здания правительства — временный кабинет'; s.stateModeCode = 'collapse'; s.stateModeChangedAt = s.hoursElapsed || 0;
    this._radio?.('Правительственный','Секретариат кабинета','Здание правительства утратило несущую целостность. Работа кабинета перенесена во временное помещение; спасательные службы ограничивают доступ к обломкам.','critical','government');
    this._radio?.('Диспетчерская','Оперативный дежурный','Код объекта: структурное разрушение. Пожарные и медики работают у фасада; периметр опасной зоны расширен.','critical','emergency');
    this._publishCrisisEvent?.('government','government-building-collapse','Разрушено здание правительства','Республика не прекращает существование: кабинет переходит к временному управлению, начинается независимое расследование причин разрушения, а ущерб и последствия остаются в политической истории.',{severity:2.4,channel:'Правительственный',speaker:'Секретариат кабинета',tone:'critical',announce:'ЭКСТРЕННОЕ ОПОВЕЩЕНИЕ: здание правительства разрушено. Не приближайтесь к фасаду и оставьте проезд спасательным службам.'});
  };

  // Barricades can be built on the plaza or on the roadway. Their fire must always have a source.
  SP._createBarricade = function(x = 640, y = 558, source = 'protest') {
    const b = simOld._createBarricade.call(this, x, y, source);
    if (!b) return b;
    const s = this.state;
    let by = Number(y);
    if (by <= 0 || !Number.isFinite(by)) by = 558;
    if (by >= 540 && by < 570 && source === 'protest' && (s.crowdAnger || 0) > 440 && Math.random() < 0.34) by = rnd(465, 520);
    b.y = clamp(by, 454, 602);
    b.x = clamp(Number(x) || 640, 90, 1190);
    b.length = b.length || irnd(76, 122);
    b.tires = b.tires || irnd(2, 7);
    b.material = b.material || choose(['покрышки и ограждения','деревянные щиты','контейнеры и шины','металлические секции']);
    b.fireIncidentId = b.fireIncidentId || null;
    b.createdAt = Number(s.hoursElapsed || 0);
    return b;
  };

  SP._spawnIncident = function(type = null) {
    const inc = simOld._spawnIncident.call(this, type);
    if (!inc) return inc;
    inc.districtId = 'center'; inc.locationType = 'площадь';
    if (inc.type === 'blockade' || inc.type === 'barricade') {
      const b = (this.state.barricades || []).find(q => q.incidentId === inc.id);
      if (b) {
        b.x = clamp(inc.x || 640, 100, 1180);
        b.y = Math.random() < 0.42 ? clamp(inc.y || 488, 455, 520) : clamp(inc.y || 558, 540, 602);
      }
    }
    return inc;
  };

  // Burning tyres/debris cause a proper fire incident and then use the common weather/response/spread model.
  SP._v5IgniteBarricade = function(b, cause = 'попадание огненного токена') {
    const s = this.state;
    if (!b || b.burning || ['cleared','burned'].includes(b.status)) return false;
    b.burning = true; b.condition = 'Горит'; b.fireStartedAt = Number(s.hoursElapsed || 0); b.ignitionCause = cause; b.health = Math.min(Number(b.health || 70), 58);
    let inc = (s.incidents || []).find(i => alive(i) && ['fire','arson','building_fire','roof_fire','camp_fire','vehicle_fire'].includes(i.type) && Math.hypot(i.x-b.x,i.y-b.y) < 62);
    if (!inc && (s.incidents || []).filter(alive).length < this.config.maxIncidents) {
      inc = this.addIncident('fire');
      if (inc) { inc.x = b.x; inc.y = b.y-2; inc.fireArea = 14; inc.fireIntensity = 0.85; inc.fireRadius = 24; inc.smokeRadius = 58; inc.label = 'Горящая баррикада'; inc.districtId = 'center'; inc.locationType = 'площадь'; }
    }
    b.fireIncidentId = inc?.id || b.fireIncidentId || null;
    b.fireZoneId = inc?.id || `BAR-FIRE-${b.id}`;
    const fireZone = { id:b.fireZoneId, x:b.x, y:b.y-4, area:Math.max(12, Number(inc?.fireArea)||16), radius:Math.max(22, Number(inc?.fireRadius)||28), smokeRadius:Math.max(58, Number(inc?.smokeRadius)||64), intensity:Math.max(.8, Number(inc?.fireIntensity)||.9), windDrift:(s.windDirection||1)*7, source:'barricade', condition:'Горит', at:Number(s.hoursElapsed||0) };
    s.fireZones = s.fireZones || [];
    const zoneIndex=s.fireZones.findIndex(z=>z.id===fireZone.id);
    if(zoneIndex>=0) Object.assign(s.fireZones[zoneIndex],fireZone); else s.fireZones.unshift(fireZone);
    this._radio?.('Пожарные','Наблюдатель на площади',`Загорелась баррикада из ${b.material || 'уличных предметов'}. Зафиксирован источник открытого огня; пожарная бригада направлена к очагу.`, 'critical','fire',inc?.id || null);
    this._publishCrisisEvent?.('protest','barricade-fire','На площади загорелась баррикада',`Огонь начался после ${cause}. Дым распространяется по ветру; рядом стоящие объекты могут получить повреждения.`,{severity:1.15,channel:'Пожарные',speaker:'Диспетчерская',tone:'critical'});
    this._updatePoliceDoctrine?.(true);
    return true;
  };

  // Create a causal, persistent fire source for any flammable asset and expose smoke on the same rendered frame.
  SP._v5IgniteAsset = function(asset, cause = 'попадание абстрактного зажигательного токена') {
    const s=this.state;
    if(!asset || asset.condition==='Разрушен' || Number(asset.integrity||0)<=0) return null;
    asset.condition='Горит'; asset.ignitionCause=cause; asset.lastIgnitionAt=Number(s.hoursElapsed||0);
    let inc=(s.incidents||[]).find(i=>alive(i)&&['fire','arson','building_fire','roof_fire','camp_fire','vehicle_fire'].includes(i.type)&&Math.hypot((i.x||640)-asset.x,(i.y||420)-asset.y)<Math.max(i.fireRadius||18,(asset.radius||20)+20));
    if(!inc && (s.incidents||[]).filter(alive).length<this.config.maxIncidents){
      inc=this.addIncident('fire');
      if(inc){inc.x=asset.x;inc.y=asset.y;inc.fireArea=14;inc.fireIntensity=.85;inc.fireRadius=Math.max(24,(asset.radius||20)+10);inc.smokeRadius=Math.max(56,(asset.radius||20)*2.4);inc.label=`Пожар: ${asset.name||'объект площади'}`;inc.districtId='center';inc.locationType='площадь';inc.ignitionCause=cause;}
    }
    asset.fireIncidentId=inc?.id||asset.fireIncidentId||null;
    const zoneId=inc?.id||`ASSET-FIRE-${asset.id}`;
    asset.fireZoneId=zoneId;
    s.fireZones=s.fireZones||[];
    const z={id:zoneId,x:asset.x,y:asset.y,area:Math.max(12,Number(inc?.fireArea)||14),radius:Math.max(22,Number(inc?.fireRadius)||(asset.radius||20)),smokeRadius:Math.max(56,Number(inc?.smokeRadius)||(asset.radius||20)*2.4),intensity:Math.max(.75,Number(inc?.fireIntensity)||.85),windDrift:(s.windDirection||1)*7,source:'asset',sourceAssetId:asset.id,condition:'Горит',at:Number(s.hoursElapsed||0)};
    const idx=s.fireZones.findIndex(q=>q.id===z.id);if(idx>=0)Object.assign(s.fireZones[idx],z);else s.fireZones.unshift(z);
    this._radio?.('Пожарные','Наблюдатель на площади',`${asset.name||'Объект'} загорелся после ${cause}; создан отдельный очаг, дым и распространение рассчитываются моделью.`, 'critical','fire',inc?.id||null);
    return inc||z;
  };

  // New autonomous doctrine: preserve an observation option, but active danger leads to visible action.
  SP._updatePoliceDoctrine = function(eventDriven = false) {
    const s = this.state; if (!s) return;
    const now = Number(s.hoursElapsed || 0);
    const active = (s.incidents || []).filter(alive);
    const violent = active.filter(i => ['riot','clash','looting','building_assault','radical_attack','arson','special_vehicle_attack','traffic_crash','fire'].includes(i.type));
    const activeFire = (s.fireZones || []).some(z => z.condition !== 'Выжжен') || active.some(i => ['fire','arson','building_fire','roof_fire','camp_fire','vehicle_fire'].includes(i.type));
    const anger = clamp(s.crowdAnger || 0, 0, 1000);
    const siege = Number(s.building?.siege || 0);
    const trueBuildingThreat = siege > 68 || Number(s.building?.integrity ?? 100) < 16 || (s.building?.occupation && siege > 30);
    const crowdRatio = Number(s.crowdTarget || 0) / Math.max(1, (Number(s.policePresence || 30) * 28) + (s.militaryDeployed ? 260 : 0));
    s.forceCap = anger >= 975 && (Number(s.deaths || 0) > 0 || trueBuildingThreat) ? 7 : anger >= 900 ? 6 : anger >= 765 ? 5 : anger >= 590 ? 4 : anger >= 410 ? 3 : anger >= 240 ? 2 : 1;
    s.policeCommandOverride = null;

    if (!eventDriven) {
      s.policeShiftHours = (s.policeShiftHours || 0) + 1;
      const rest = s.policeShiftHours % 8 === 0 ? 1.4 : 0;
      s.policeFatigue = clamp((s.policeFatigue || 12) + 0.34 + (violent.length || activeFire ? 0.42 : 0.06) - rest);
      s.policeMorale = clamp((s.policeMorale || 72) + ((s.policies?.policing || 45) - 50) * 0.003 - (s.policeFatigue > 78 ? 0.35 : 0) - (s.trust < 20 ? 0.18 : 0.03));
    }
    let code = 'observe', doctrine = 'Наблюдение';
    if (s.policeMorale < 10 && crowdRatio > 2.5 && violent.length) { code = 'withdraw'; doctrine = 'Отступление из опасного сектора'; }
    else if (trueBuildingThreat && anger > 800 && Math.random() < 0.48) { code = 'protect'; doctrine = 'Защита объекта при штурме'; }
    else if (anger >= 820 && violent.length > 0 && s.policeMorale > 18 && s.forceCap >= 5) { code = 'disperse'; doctrine = 'Наступление и рассредоточение толпы'; }
    else if (activeFire || violent.length >= 2 || anger > 650) { code = 'contain'; doctrine = 'Сдерживание активных очагов'; }
    else if (trueBuildingThreat) { code = 'protect'; doctrine = 'Защита периметра здания'; }
    else if (anger > 370 || active.length) { code = 'cordon'; doctrine = 'Кордон и открытые коридоры'; }
    else if (s.policeFatigue > 86 && Math.random() < 0.45) { code = 'withdraw'; doctrine = 'Ротация и отход'; }

    const changed = code !== s.doctrineCode;
    s.doctrineCode = code; s.doctrine = doctrine; s.doctrineDecisionAt = now;
    if (changed) this._radio?.('Полиция','Автономное командование',`Решение ИИ: ${doctrine.toLowerCase()}. Злость ${Math.round(anger)}/1000; численность на площади ${Math.round(s.crowdTarget || 0)}; мораль ${Math.round(s.policeMorale)}%.`, code === 'disperse' ? 'warning' : 'info','police');

    const risk = Math.max(anger / 1000, violent.length ? 0.48 : 0, activeFire ? 0.52 : 0, trueBuildingThreat ? 0.76 : 0);
    // Major incidents can trigger an immediate response, not just a doctrine change.
    // A shorter event cooldown keeps the response visible at the 1 min / real second clock.
    const eventThreat = active.some(i => ['riot','clash','looting','building_assault','radical_attack','arson','special_vehicle_attack','traffic_crash','fire'].includes(i.type));
    if (eventDriven && !(eventThreat || activeFire || trueBuildingThreat || anger >= 520)) return;
    const cooldown = now - Number(s.v5LastPoliceActionAt ?? -999);
    if (eventDriven ? cooldown < 0.14 : cooldown < 0.55) return;
    const actChance = eventDriven ? Math.max(0.72, risk >= 0.55 ? 0.96 : 0.72) : (risk < 0.18 ? 0.30 : risk < 0.38 ? 0.56 : risk < 0.63 ? 0.78 : 0.94);
    if (Math.random() > actChance) return;
    const tools = s.policeTools || {};
    let method;
    if ((s.policeFatigue > 84 && Math.random() < 0.32) || (['gas','flash','water'].every(k => (tools[k] || 0) <= 0) && anger > 300 && Math.random() < 0.5)) method = 'rotate';
    else if (s.roadBlockage > 0.68 && !s.emergencyCorridor && Math.random() < 0.38) method = 'corridor';
    else if (code === 'withdraw') method = Math.random() < 0.72 ? 'retreat' : 'corridor';
    else if (code === 'observe') method = Math.random() < 0.72 ? 'talk' : 'cordon';
    else if (anger < 260 && !violent.length) method = Math.random() < 0.72 ? 'talk' : 'cordon';
    else if (anger < 430) method = (tools.gas > 0 && Math.random() < 0.52) ? 'gas' : 'cordon';
    else if (anger < 610) method = tools.gas > 0 && Math.random() < 0.52 ? 'gas' : tools.water > 0 && Math.random() < 0.35 ? 'water' : 'physical';
    else if (anger < 790) method = tools.water > 0 && Math.random() < 0.28 ? 'water' : tools.flash > 0 && Math.random() < 0.24 ? 'flash' : tools.gas > 0 ? 'gas' : 'physical';
    else if (anger < 945) method = tools.rubber > 0 && Math.random() < 0.36 ? 'rubber' : tools.water > 0 && Math.random() < 0.24 ? 'water' : tools.flash > 0 && Math.random() < 0.24 ? 'flash' : tools.gas > 0 ? 'gas' : 'physical';
    else if ((s.deaths || 0) > 0 && trueBuildingThreat && tools.live > 0 && s.policeMorale > 48 && Math.random() < 0.09) method = 'live';
    else method = tools.rubber > 0 && Math.random() < 0.5 ? 'rubber' : tools.gas > 0 ? 'gas' : 'physical';

    if (trueBuildingThreat && Math.random() < 0.28) method = 'cordon';
    if (method === 'live' && s.forceCap < 7) method = tools.rubber > 0 ? 'rubber' : 'physical';
    const beforeSeq = Number(s.policeActionSeq || 0);
    const previousActionAt = Number(s.v5LastPoliceActionAt ?? -999);
    // Reserve the cooldown before execution so nested event reviews cannot recursively order a second action.
    s.v5LastPoliceActionAt = now;
    const ok = this.commandPolice(method, true);
    if (ok) {
      s.v5LastPoliceActionAt = now; s.lastV4PoliceActionAt = now;
      // commandPolice records its tactical action. Keep the commander's strategic doctrine separate from that action label.
      s.v5LastForceMethod = method;
      s.doctrineCode = code; s.doctrine = doctrine;
      if (s.lastPoliceAction) s.lastPoliceAction.v5StrategicDoctrine = code;
      if (method === 'reinforce') s.reinforcementETA = Math.max(1, s.reinforcementETA || 1);
    } else if (Number(s.policeActionSeq || 0) === beforeSeq) {
      s.v5LastPoliceActionAt = previousActionAt;
      // An unavailable tool is itself an operational decision; record it and retry with a softer option later.
      if (method === 'gas' || method === 'water' || method === 'flash' || method === 'rubber' || method === 'live') {
        this._radio?.('Полиция','Склад и командование',`Средство ${method} недоступно; подразделения меняют тактику с учётом остатка снабжения.`, 'warning','police');
      }
    }
  };

  // Police advance, hold a semicircle at the capitol, patrol or withdraw. Only this function moves officers.
  P._v4UpdatePoliceAI = function(dt, s) {
    if (!dt || dt <= 0 || !s) return;
    const officers = this.crowdPolice || [];
    if (!officers.length) return;
    const active = (s.incidents || []).filter(alive);
    const hot = active.filter(i => ['riot','clash','looting','building_assault','radical_attack','arson','special_vehicle_attack','fire'].includes(i.type)).sort((a,b)=>(b.severity||0)-(a.severity||0))[0];
    const anger = clamp(s.crowdAnger || 0, 0, 1000);
    const doctrine = s.doctrineCode || 'observe';
    const siege = Number(s.building?.siege || 0);
    const attacking = siege > 68 || active.some(i=>i.type==='building_assault');
    officers.forEach((officer, i) => {
      if (!officer || !officer.active) return;
      const phase = (this.currentTime || 0) * 0.00017 + i * 0.77;
      let tx = 640 + Math.cos(phase) * 178;
      let ty = 421 + Math.sin(phase * 0.83) * 46;
      if (doctrine === 'withdraw') {
        tx = i % 2 ? 1030 - (i % 6) * 12 : 250 + (i % 6) * 12;
        ty = 412 + Math.floor(i/6) * 18;
      } else if (doctrine === 'protect' || (attacking && anger < 820)) {
        const t = (i + 0.5) / Math.max(1, officers.length);
        tx = 310 + t * 660;
        ty = 335 + Math.sin(t * Math.PI) * 50 + (i % 3) * 3;
      } else if (doctrine === 'disperse') {
        // A visibly advancing line, not an invisible change to the status label.
        const t = i / Math.max(1, officers.length - 1);
        tx = 300 + t * 680;
        ty = 386 + Math.sin(t * Math.PI * 2) * 10 - Math.min(35, Math.max(0, (anger - 760) * 0.18));
        officer.setTint(0xd5a58a);
      } else if (doctrine === 'contain' || doctrine === 'cordon') {
        if (hot && i % 4 !== 3) {
          const t = (i + 0.5) / Math.max(1, officers.length);
          const radiusX = Math.min(145, 42 + (hot.severity || 40) * 0.78);
          const radiusY = Math.min(70, 20 + (hot.severity || 40) * 0.28);
          tx = clamp((hot.x || 640) + Math.cos(t * Math.PI * 2 + phase * 0.05) * radiusX, 220, 1060);
          ty = clamp((hot.y || 420) + Math.sin(t * Math.PI * 2 + phase * 0.05) * radiusY, 292, 615);
        } else {
          const t = i / Math.max(1, officers.length - 1);
          tx = 380 + t * 520;
          ty = doctrine === 'disperse' ? 386 : 422 + Math.sin(t * Math.PI) * 15;
        }
        if (doctrine !== 'disperse') officer.clearTint();
      } else {
        const side = (i % 4) - 1.5;
        tx = 640 + Math.cos(phase) * (190 + side * 8);
        ty = 417 + Math.sin(phase * 0.85) * 48;
        officer.clearTint();
      }
      // Officers temporarily redirect toward a live event unless it is an immediate building breach.
      if (hot && doctrine !== 'protect' && doctrine !== 'withdraw' && doctrine !== 'disperse' && Math.hypot(officer.x-hot.x, officer.y-hot.y) > 50) {
        const targetT = (i % Math.max(1, officers.length)) / Math.max(1, officers.length - 1);
        if (i % 3 !== 2) { tx = clamp((hot.x || 640) + (targetT - 0.5) * 100, 220, 1060); ty = clamp((hot.y || 420) + (i % 3 - 1) * 24, 290, 615); }
      }
      const dx = tx - officer.x, dy = ty - officer.y, dist = Math.hypot(dx, dy) || 1;
      const speed = s.policeFatigue > 85 ? 23 : doctrine === 'withdraw' ? 66 : doctrine === 'disperse' ? 62 : doctrine === 'protect' ? 46 : doctrine === 'contain' ? 53 : 36;
      const step = Math.min(dist, speed * dt);
      officer.x = clamp(officer.x + dx / dist * step, 210, 1070);
      officer.y = clamp(officer.y + dy / dist * step, 292, 618);
      officer.setPosition(officer.x, officer.y).setDepth(officer.y + 7);
      officer.setData('aiTarget', { x:tx, y:ty });
      officer.setData('v5Doctrine', doctrine);
      officer.setData('v5Moving', dist > 3);
      if (doctrine === 'withdraw') officer.setTint(0x919992);
      else if (doctrine === 'disperse') officer.setTint(0xd7ad8c);
      else if (doctrine === 'protect') officer.setTint(0xd7c9a5);
      else officer.clearTint();

      const detainCooldown = Math.max(0, Number(officer.getData('v5DetainCooldown') || 0) - dt);
      officer.setData('v5DetainCooldown', detainCooldown);
      if (detainCooldown <= 0 && ['contain','disperse'].includes(doctrine) && anger > 560 && Math.random() < dt * 0.035) {
        const target = (this.people || []).filter(a => a.protester && !a.detained && ['radical','casseur','looter','arsonist','provocateur','agitator'].includes(a.behavior)).sort((a,b)=>Math.hypot(a.x-officer.x,a.y-officer.y)-Math.hypot(b.x-officer.x,b.y-officer.y))[0];
        if (target && Math.hypot(target.x-officer.x,target.y-officer.y) < 28) {
          target.detained = true; target.detainedUntil = this.currentTime + 11000; target.behavior='detained'; target.tx=target.x; target.ty=target.y; target.speed=0; target.sprite?.setTint(0xd5b46a);
          s.arrests = (s.arrests || 0) + 1; officer.setData('v5DetainCooldown', rnd(7, 13));
          this.sim._radio?.('Полиция','Автономный патруль',`Задержан конкретный участник (${target.role || target.behavior}); группа продолжает движение.`, 'warning','police');
        }
      }
    });
  };

  // Remember each person’s previous coordinate so physical lines can stop a northward breakthrough.
  P._updatePeople = function(dt, s) {
    const previous = new Map((this.people || []).map(a => [a, { x:a.x, y:a.y }]));
    if (sceneOld._updatePeople) sceneOld._updatePeople.call(this, dt, s);
    const anger = clamp(s?.crowdAnger || 0, 0, 1000);
    const doctrine = s?.doctrineCode || 'observe';
    const lineForX = x => {
      if (doctrine === 'protect') {
        const t = clamp((x - 420) / 440, 0, 1);
        return x >= 310 && x <= 970 ? 335 + Math.sin(t * Math.PI) * 50 : null;
      }
      if (['cordon','contain','disperse'].includes(doctrine)) {
        const y = doctrine === 'disperse' ? 393 - (anger > 820 ? 17 : 0) : 424;
        return x >= (doctrine === 'disperse' ? 300 : 375) && x <= (doctrine === 'disperse' ? 980 : 905) ? y : null;
      }
      return null;
    };
    for (const a of this.people || []) {
      if (!a || !a.sprite || a.detained) continue;
      const prev = previous.get(a) || { x:a.x, y:a.y };
      if (Number(a.v5BurningUntil || 0) > Number(this.currentTime || 0)) {
        a.behavior = 'flee'; a.tx = Number(a.v5BurnTx || a.tx); a.ty = Number(a.v5BurnTy || a.ty); a.speed = Math.max(88, Number(a.speed || 0));
      }
      const lineY = lineForX(a.x);
      if (lineY !== null && a.y < lineY + 8 && !a.v5InsidePerimeter) {
        const crossedThisStep = prev.y >= lineY + 1 && a.y < lineY + 7;
        // A real breach is a rare, explicit outcome of a severe assault—not a loophole in collision checks.
        const nowMs = Number(this.currentTime || 0);
        const canAttemptBreach = crossedThisStep && nowMs >= Number(a.v5NextBreachCheck || 0);
        const breachChance = canAttemptBreach && doctrine === 'protect' && (s.building?.siege || 0) > 91 && anger > 975 ? 0.012 : 0;
        if (canAttemptBreach) a.v5NextBreachCheck = nowMs + rnd(2500,4500);
        if (canAttemptBreach && Math.random() <= breachChance) {
          a.v5InsidePerimeter = true;
          s.building.siege = clamp((s.building.siege || 0) + 2, 0, 100);
          this.sim._radio?.('Диспетчерская','Наблюдатель у периметра','Зафиксирован локальный прорыв линии; командование перестраивает охрану входа.','critical','protest');
        } else {
          // Also eject an agent that loaded/spawned on the protected side, which the old crossing-only test missed.
          a.y = lineY + 10; a.sprite.y = a.y; a.ty = Math.max(Number(a.ty || 0), lineY + 18);
          a.v5BlockedByPolice = true;
        }
      }
      // Individual officers are physical obstacles too; repulse by one body-width instead of allowing sprite overlap.
      for (const o of this.crowdPolice || []) {
        const dx = a.x - o.x, dy = a.y - o.y, d = Math.hypot(dx, dy);
        if (d > 0.1 && d < 13 && a.protester) {
          const k = (13 - d) / d;
          a.x = clamp(a.x + dx * k, 80, 1200);
          a.y = clamp(a.y + dy * k, 286, 620);
          a.sprite.setPosition(a.x, a.y).setDepth(a.y + 3);
          if (a.ty < a.y && anger < 960) a.ty = a.y + rnd(8, 26);
        }
      }
      // Barricades block crossing; agents tend to route around an endpoint rather than ghost through.
      for (const b of s.barricades || []) {
        if (['cleared','burned'].includes(b.status) || !b.length) continue;
        const prevSide = prev.y - b.y, side = a.y - b.y;
        const spansX = Math.abs(a.x - b.x) < (b.length || 90) / 2 - 5;
        if (spansX && prevSide * side <= 0 && Math.abs(prevSide) > 0.5) {
          const sign = a.x < b.x ? -1 : a.x > b.x ? 1 : (a.v4Id % 2 ? -1 : 1);
          a.x = clamp(b.x + sign * ((b.length || 90) / 2 + rnd(13, 24)), 55, 1225);
          a.tx = a.x; a.sprite.x = a.x;
        }
        if (Math.abs(a.x - b.x) < (b.length || 90) / 2 - 5 && Math.abs(a.y - b.y) < 7) {
          a.y = b.y + (prevSide >= 0 ? 8 : -8); a.sprite.y = a.y;
          a.ty = a.y + (prevSide >= 0 ? 18 : -18);
        }
      }
      a.v5PrevX = a.x; a.v5PrevY = a.y;
    }
  };

  P._addPerson = function(index) {
    if (sceneOld._addPerson) sceneOld._addPerson.call(this, index);
    const a = (this.people || [])[this.people.length - 1];
    if (!a) return;
    a.v5Flag = Boolean(a.protester && Math.random() < 0.16);
    a.v5FlagColor = choose([0xb6423d,0xc6b15e,0x4b8491,0x69886f,0x8b719f,0xe0d6bd]);
    a.v5FlagPattern = irnd(0, 2);
    a.v5BurningUntil = Number(a.v5BurningUntil || 0);
    a.v5BurnInjuryDone = Boolean(a.v5BurnInjuryDone);
  };

  // Firebrand impacts can affect a person, barricade, building, or camp; the effects are model-level abstractions.
  P._updateProjectiles = function(dt, s) {
    const landed = (this.projectiles || []).filter(p => !p.landed && p.elapsed + dt >= p.duration).map(p => ({ ...p }));
    if (sceneOld._updateProjectiles) sceneOld._updateProjectiles.call(this, dt, s);
    for (const p of landed) {
      if (p.kind === 'petard' || p.kind === 'smoke') {
        s.v5ColorSmokeSeq = (s.v5ColorSmokeSeq || 0) + 1;
        const colors = [0xe34f58,0x38a8b7,0xd7c146,0x8e70d6,0x6aa77c,0xd9e5e6];
        const z = { id:`V5-COLOR-${s.day}-${s.v5ColorSmokeSeq}`, x:p.targetX, y:p.targetY, radius:p.kind === 'smoke' ? 65 : 45, life:p.kind === 'smoke' ? 3.4 : 1.7, kind:'colored-smoke', color:choose(colors), drift:rnd(-18,18), createdAt:this.currentTime || 0, source:'protest' };
        s.smokeZones = s.smokeZones || []; s.smokeZones.unshift(z); s.smokeZones = s.smokeZones.slice(0, 32);
      }
      if (p.kind !== 'firebrand' || s.paused) continue;
      const px = Number(p.targetX || p.x || 640), py = Number(p.targetY || p.y || 420);
      // Nearest eligible bystander(s) visibly catch fire and receive a burn injury; no continuous damage spam.
      const hitPeople = (this.people || []).filter(a => a && a.sprite && !a.detained && Math.hypot(a.x-px,a.y-py) < 23).sort((a,b)=>Math.hypot(a.x-px,a.y-py)-Math.hypot(b.x-px,b.y-py)).slice(0,2);
      for (const a of hitPeople) {
        if (a.v5BurningUntil > this.currentTime) continue;
        a.v5BurningUntil = (this.currentTime || 0) + rnd(5200, 8500); a.v5BurnInjuryDone = true; a.behavior = 'flee';
        const dx = a.x - px, dy = a.y - py, n = Math.hypot(dx,dy) || 1;
        a.tx = clamp(a.x + dx/n*rnd(110,180), 35, 1245); a.ty = clamp(a.y + dy/n*rnd(55,105), 286, 620); a.speed = rnd(82,116); a.timer = 2.8;
        a.v5BurnTx = a.tx; a.v5BurnTy = a.ty;
        const sev = Math.random() < 0.18 ? 3 : Math.random() < 0.5 ? 2 : 1;
        this.sim._makeInjury?.('ожоги', sev, a.x, a.y, 'firebrand-impact', 'protest', null, null);
        this.sim._radio?.('Медики','Наблюдатель на площади','У человека ожоговая травма после попадания горящего игрового токена; пострадавший отходит от эпицентра.','critical','medical');
      }
      if (p.targetOfficer && p.targetOfficer.active) {
        p.targetOfficer.setData('burningUntil', (this.currentTime || 0) + 6200);
        if (!p.targetOfficer.getData('v5BurnInjuryDone')) {
          p.targetOfficer.setData('v5BurnInjuryDone', true);
          this.sim._makeInjury?.('ожоги', Math.random() < 0.35 ? 2 : 1, p.targetOfficer.x, p.targetOfficer.y, 'firebrand-impact', 'protest', null, null);
        }
      }
      for (const b of s.barricades || []) {
        if (Math.hypot(b.x-px,b.y-py) < (b.length || 90) / 2 + 18) this.sim._v5IgniteBarricade(b, 'попадание абстрактного зажигательного токена');
      }
      const buildingNear = Math.hypot(640-px, 235-py) < 90 || Boolean(p.targetBuilding);
      const buildingAsset = (s.assets || []).find(a => a.kind === 'building');
      if (buildingNear) {
        if (!p.targetBuilding) s.building.integrity = clamp((s.building.integrity ?? 100) - rnd(5,12));
        s.building.lastDamageAt = s.hoursElapsed || 0;
        if (buildingAsset && buildingAsset.integrity > 0) {
          if (!p.targetBuilding) buildingAsset.integrity = clamp(buildingAsset.integrity - rnd(5,12));
          if (buildingAsset.integrity > 0) this.sim._v5IgniteAsset?.(buildingAsset, 'попадание абстрактного зажигательного токена');
          else buildingAsset.condition = 'Разрушен';
        }
        if (s.building.integrity <= 0) s.building.status = 'Разрушено';
        else if (s.building.integrity < 35) s.building.status = 'Сильно повреждено';
        else if (s.building.integrity < 75) s.building.status = 'Повреждено';
        // If the legacy hit created an incident, upgrade it with precise position and a visible fire/smoke zone immediately.
        let inc=(s.incidents||[]).find(i=>alive(i)&&['fire','arson','building_fire','roof_fire','camp_fire','vehicle_fire'].includes(i.type)&&Math.hypot((i.x||640)-px,(i.y||235)-py)<100);
        if (!inc && (s.incidents||[]).filter(alive).length < this.sim.config.maxIncidents) {
          inc = this.sim.addIncident('arson');
          if (inc) { inc.x=px;inc.y=py;inc.fireArea=16;inc.fireIntensity=1.1;inc.fireRadius=28;inc.smokeRadius=62;inc.label='Зажигательный инцидент у фасада';inc.ignitionCause='попадание абстрактного зажигательного токена'; }
        }
        if (inc) {
          inc.x=px;inc.y=py;inc.fireArea=Math.max(16,inc.fireArea||0);inc.fireIntensity=Math.max(1.05,inc.fireIntensity||0);inc.fireRadius=Math.max(28,inc.fireRadius||0);inc.smokeRadius=Math.max(62,inc.smokeRadius||0);
          s.fireZones=s.fireZones||[];const z={id:inc.id,x:px,y:py,area:inc.fireArea,radius:inc.fireRadius,smokeRadius:inc.smokeRadius,intensity:inc.fireIntensity,windDrift:(s.windDirection||1)*8,source:'arson',condition:'Горит',at:inc.createdAt};const zi=s.fireZones.findIndex(q=>q.id===z.id);if(zi>=0)Object.assign(s.fireZones[zi],z);else s.fireZones.unshift(z);
        }
      }
      const asset = (s.assets || []).filter(a=>a.condition!=='Разрушен' && a.kind!=='building' && Math.hypot(a.x-px,a.y-py)<(a.radius||22)+20).sort((a,b)=>Math.hypot(a.x-px,a.y-py)-Math.hypot(b.x-px,b.y-py))[0];
      if (asset) { asset.integrity = clamp(asset.integrity - rnd(6,14)); asset.lastDamageAt=s.hoursElapsed||0; if(asset.integrity>0)this.sim._v5IgniteAsset?.(asset, 'попадание абстрактного зажигательного токена'); else asset.condition='Разрушен'; }
      // Give nearby traffic a persistent event source too: smoke and fire are linked to the damaged vehicle's position.
      const vehicleHits=[...(this.trafficCars||[]),...(this.vehicles||[])].filter(v=>v&&v.sprite?.active&&Math.hypot(v.x-px,v.y-py)<26).slice(0,1);
      for(const v of vehicleHits){
        v.condition='Горит';v.disabled=true;v.speed=0;v.baseSpeed=0;v.fireStartedAt=s.hoursElapsed||0;v.fireAge=0;v.smoke=Math.max(v.smoke||0,1);
        if(v.sprite?.setTint)v.sprite.setTint(0x7d4a39);
        if(v.sprite?.setAlpha)v.sprite.setAlpha(1);
        if(v.phase){v.phase='disabled';v.stoppedAt={x:v.x,y:v.y};}
        if(v.vehicleRecordId){const rec=(s.roadVehicles||[]).find(r=>r.id===v.vehicleRecordId);if(rec){rec.condition='Горит';rec.driverState='покидает машину';rec.fire=1;rec.x=v.x;rec.y=v.y;}}
        const serviceRec=(s.serviceFleet||[]).find(r=>r.id===v.id);if(serviceRec){serviceRec.condition='Горит';serviceRec.driverState='покидает машину';serviceRec.disabled=true;serviceRec.phase='disabled';}
        let inc=(s.incidents||[]).find(i=>alive(i)&&['fire','arson','building_fire','roof_fire','camp_fire','vehicle_fire'].includes(i.type)&&Math.hypot((i.x||0)-v.x,(i.y||0)-v.y)<35);
        if(!inc && (s.incidents||[]).filter(alive).length<this.sim.config.maxIncidents) inc=this.sim.addIncident('fire');
        if(inc){inc.x=v.x;inc.y=v.y;inc.fireArea=Math.max(12,inc.fireArea||0);inc.fireIntensity=Math.max(.8,inc.fireIntensity||0);inc.fireRadius=Math.max(24,inc.fireRadius||0);inc.smokeRadius=Math.max(58,inc.smokeRadius||0);inc.label='Горящий транспорт';inc.districtId='center';inc.locationType='площадь';inc.ignitionCause='попадание абстрактного зажигательного токена';s.fireZones=s.fireZones||[];const z={id:inc.id,x:inc.x,y:inc.y,area:inc.fireArea,radius:inc.fireRadius,smokeRadius:inc.smokeRadius,intensity:inc.fireIntensity,windDrift:(s.windDirection||1)*9,source:'vehicle',sourceVehicleId:v.vehicleRecordId||v.id||null,condition:'Горит',at:inc.createdAt};const zi=s.fireZones.findIndex(q=>q.id===z.id);if(zi>=0)Object.assign(s.fireZones[zi],z);else s.fireZones.unshift(z);}
        this.sim._radio?.('Пожарные','Диспетчерская','Зажигательный токен попал в транспорт. Машина остановлена, экипаж/водитель покидает опасную зону, видимый очаг передан пожарным.','critical','fire',inc?.id||null);
      }
      // A zero-integrity government building changes state immediately, not at the next hourly tick.
      this.sim._v5ApplyBuildingCollapse?.();
      // A witnessed firebrand/impact is a flashpoint: command reviews the threat and may act immediately.
      this.sim._updatePoliceDoctrine?.(true);
    }
  };

  // Make smoke plumes, color flares, night darkness, pennants, tires and larger living flames visible at 60 FPS.
  P.create = function() {
    if (sceneOld.create) sceneOld.create.call(this);
    this.v5NightFx = this.add.graphics().setDepth(8990);
    this.v5FlagFx = this.add.graphics().setDepth(8993);
    this.v5BarrierFx = this.add.graphics().setDepth(8995);
    this.v5SmokeFx = this.add.graphics().setDepth(9002);
    this.v5FlameFx = this.add.graphics().setDepth(9003);
    this.v5FrontFx = this.add.graphics().setDepth(9004);
    this.v5BuildingLabel = this.add.text(640, 257, 'ПЕРИМЕТР ПРАВИТЕЛЬСТВА', { fontFamily:'monospace', fontSize:'9px', fontStyle:'bold', color:'#efe4cb', backgroundColor:'#263033dd', padding:{x:5,y:3}, align:'center' }).setOrigin(0.5,0.5).setDepth(9004);
    this.v5ActionLabel = null;
  };

  P._v5RenderNight = function(s) {
    const g = this.v5NightFx; if (!g) return;
    g.clear();
    const hour = Number(s.hour || 0) + Number(s.minute || 0) / 60;
    let alpha = 0;
    if (hour < 4.5 || hour > 21.5) alpha = 0.63;
    else if (hour < 7.1) alpha = 0.63 * (7.1 - hour) / 2.6;
    else if (hour > 18.2) alpha = 0.63 * (hour - 18.2) / 3.3;
    if (s.weather?.id === 'fog') alpha = Math.min(0.69, alpha + 0.06);
    if (s.weather?.id === 'storm') alpha = Math.min(0.72, alpha + 0.07);
    if (alpha > 0.005) g.fillStyle(0x07131e, alpha).fillRect(0,0,1280,640);
    if (alpha > 0.12) {
      for (const [x,y,r] of [[182,390,30],[1094,385,31],[333,451,22],[945,448,23],[640,285,25]]) {
        g.fillStyle(0xf7ce88, alpha*0.12).fillCircle(x,y,r*1.7);
        g.fillStyle(0xffdf9b, alpha*0.36).fillCircle(x,y,Math.max(2,r*0.18));
      }
    }
  };

  P._v5RenderFlagsAndBarricades = function(s, time) {
    const f = this.v5FlagFx, bfx = this.v5BarrierFx;
    if (!f || !bfx) return;
    f.clear(); bfx.clear();
    // Generic fictional banners. Different palettes/patterns avoid copying any specific real movement's insignia.
    for (const camp of s.campSites || []) {
      if (['Выжжен','Снят'].includes(camp.condition)) continue;
      for (let i=0;i<Math.min(3, camp.tentCount || 2);i++) {
        const x=camp.x-(camp.radius||30)*0.52+i*11;
        f.lineStyle(1.25,0x323734,0.85).beginPath().moveTo(x,camp.y-18).lineTo(x,camp.y-43).strokePath();
        const color=[0xb44842,0x688a79,0xd2b95f][(i+Math.floor(camp.createdAt||0))%3];
        f.fillStyle(color,0.96).beginPath().moveTo(x+1,camp.y-42).lineTo(x+14,camp.y-38).lineTo(x+1,camp.y-30).closePath().fillPath();
      }
    }
    for (const a of this.people || []) {
      if (!a.v5Flag || !a.protester || a.detained || !a.sprite?.active) continue;
      const wave=Math.sin(time*.006+(a.v4Id||0)) * 3;
      f.lineStyle(1.2,0x373b38,.9).beginPath().moveTo(a.x+3,a.y-8).lineTo(a.x+3,a.y-23).strokePath();
      f.fillStyle(a.v5FlagColor||0xb6423d,.96).beginPath().moveTo(a.x+4,a.y-23).lineTo(a.x+14+wave,a.y-19).lineTo(a.x+4,a.y-13).closePath().fillPath();
      if (a.v5FlagPattern===1) { f.lineStyle(1,0xe5dec8,.8).beginPath().moveTo(a.x+5,a.y-19).lineTo(a.x+11,a.y-18).strokePath(); }
      if (a.v5FlagPattern===2) { f.fillStyle(0xe8dec1,.9).fillCircle(a.x+7,a.y-18,1.25); }
    }
    for (const bar of s.barricades || []) {
      if (['cleared'].includes(bar.status)) continue;
      const x=bar.x, y=bar.y, len=bar.length||88, health=clamp(bar.health ?? 40,0,100);
      bfx.fillStyle(0x111719,.24).fillEllipse(x,y+9,len*1.05,16);
      // Overturned street barriers and wood beams.
      bfx.fillStyle(bar.burning?0x383631:0x4b504d,.95).fillRoundedRect(x-len/2,y-8,len,14,2);
      bfx.lineStyle(1.5,bar.burning?0x252422:0x8d8c7c,.9).strokeRoundedRect(x-len/2,y-8,len,14,2);
      for (let j=0;j<4;j++) {
        const px=x-len*.38+j*(len*.23);
        bfx.fillStyle(bar.burning?0x3d3b34:(j%2?0x796b53:0x655844),.96).fillRoundedRect(px-11,y-16+(j%2)*3,22,9,1);
        bfx.lineStyle(1,0x969080,.55).beginPath().moveTo(px-9,y-14).lineTo(px+9,y-9).strokePath();
      }
      const tires=Math.min(7,bar.tires||3);
      for(let j=0;j<tires;j++) {
        const tx=x-len*.35+j*(len*.70/Math.max(1,tires-1));
        bfx.fillStyle(bar.burning?0x252522:0x1f2525,.98).fillEllipse(tx,y+2,12,10);
        bfx.lineStyle(1,bar.burning?0x55453a:0x596260,.75).strokeEllipse(tx,y+2,12,10);
        bfx.fillStyle(0x656a65,.42).fillCircle(tx,y+2,2.5);
      }
      bfx.fillStyle(0xe2ba65,.92).fillRect(x-len*.42,y-6,len*.84,2);
      bfx.fillStyle(0x252b2a,.88).fillRect(x-len/2,y-20,Math.max(4,len*health/100),2);
      if (bar.burning || bar.condition==='Горит') {
        const p=.7+Math.sin(time*.024+x)*.2;
        bfx.fillStyle(0x25221d,.36).fillEllipse(x,y-7,len*.55,15);
        for(let k=0;k<3;k++){const fx=x+(k-1)*len*.23+Math.sin(time*.021+k*2+x)*3;const fh=13+((time*.008+k*0.31+x*.01)%1)*17;
          bfx.fillStyle(k%2?0xdf5b2e:0xf48a39,p).fillTriangle(fx-5,y-5,fx,y-fh-7,fx+6,y-5);
          bfx.fillStyle(0xffd16b,p*.9).fillTriangle(fx-2.3,y-6,fx,y-fh*.7,fx+2.5,y-6);
        }
      }
    }
  };

  P._v5RenderSmokeAndFire = function(s, time) {
    const smoke = this.v5SmokeFx, flames = this.v5FlameFx, front = this.v5FrontFx;
    if (!smoke || !flames || !front) return;
    smoke.clear(); flames.clear(); front.clear();
    const fires = (s.fireZones || []).filter(z => z && !['Выжжен','Потушено'].includes(z.condition) && (z.radius || 0) > 0 && (!String(z.id||'').startsWith('ASSET-FIRE-') || (s.assets||[]).some(a=>a.id===z.sourceAssetId&&a.condition==='Горит')));
    const drawPlume = (x,y,radius,intensity,drift,seed,colorOverride=null) => {
      const maxR=Math.max(22,Math.min(145,radius||32));
      for(let k=0;k<8;k++) {
        const phase=(time*.00034+k*.129+(seed%97)*.013)%1;
        const rise=phase*maxR*2.05;
        const sway=Math.sin(time*.0008+k*1.8+seed)*maxR*.19;
        const puffR=(5+phase*maxR*.18)*(0.82+intensity*.18);
        const alpha=(0.25*(1-phase))*(colorOverride?0.60:1);
        const px=x+(drift||0)*phase+sway+(k%2?7:-5);
        const py=y-12-rise;
        if (colorOverride) {
          smoke.fillStyle(colorOverride,alpha).fillEllipse(px,py,puffR*2.4,puffR*1.75);
          smoke.fillStyle(colorOverride,alpha*.26).fillEllipse(px-puffR*.2,py-puffR*.2,puffR*2.8,puffR*2.1);
        } else {
          const col = phase>.55 ? 0x555c5a : 0x343b3a;
          smoke.fillStyle(col,alpha).fillEllipse(px,py,puffR*2.5,puffR*1.7);
          smoke.fillStyle(0x848b86,alpha*.38).fillEllipse(px-puffR*.23,py-puffR*.22,puffR*1.8,puffR*1.2);
        }
      }
    };
    fires.forEach((z,index) => {
      const area=Math.max(0,Number(z.area||12));
      const intensity=clamp(z.intensity||0.7,.1,2.4);
      const r=Math.min(66,Math.max(11,Math.sqrt(area)*3.35));
      const smokeR=Math.min(150,Number(z.smokeRadius||z.radius*2.6||42));
      drawPlume(z.x,z.y,smokeR,intensity,z.windDrift||8,index+String(z.id||'').length);
      const flicker=.78+Math.sin(time*.035+z.x*.3+index)*.16+Math.sin(time*.019+z.y)*.10;
      flames.fillStyle(0x332b25,.12*intensity).fillEllipse(z.x,z.y+1,r*4.3,r*.64);
      flames.fillStyle(0xff8b30,.15*intensity).fillEllipse(z.x,z.y-8,r*2.9,r*1.05);
      const tongues=Math.min(15,Math.max(6,Math.round(6+area/18)));
      for(let k=0;k<tongues;k++) {
        const off=((k/(tongues-1))-.5)*r*2;
        const wobble=Math.sin(time*.031+k*2.1+z.x*.015)*4;
        const h=(15+((Math.sin(time*.027+k*1.73+z.y*.02)+1)*.5)*Math.min(94,22+area*.62))*flicker;
        const bx=z.x+off+wobble;
        flames.fillStyle(k%3===0?0xd94825:0xf17028,.88).fillTriangle(bx-r*.18,z.y-1,bx+wobble*.5,z.y-h-5,bx+r*.2,z.y-1);
        flames.fillStyle(k%2?0xffc14d:0xffdc75,.9).fillTriangle(bx-r*.075,z.y-3,bx+1,z.y-h*.56-4,bx+r*.09,z.y-3);
      }
      for(let k=0;k<3;k++) {
        const ex=z.x+Math.sin(time*.016+k*4+z.y)*r*1.4, ey=z.y-14-((time*.018+k*.33+index*.1)%1)*24;
        flames.fillStyle(0xffc56a,.45).fillCircle(ex,ey,1.1+(k%2));
      }
    });
    // Vehicle fires have persistent object state; keep rendering until the vehicle has burned out.
    for (const v of [...(this.trafficCars||[]),...(this.vehicles||[])]) {
      if(!v || !v.sprite?.active || !['Горит','Выгорел'].includes(v.condition)) continue;
      const x=Number(v.x||0),y=Number(v.y||0),burning=v.condition==='Горит';
      if(burning){
        const t=.78+Math.sin(time*.031+x*.03)*.18;
        flames.fillStyle(0xf05a25,.24*t).fillEllipse(x,y-7,34,28);
        for(let k=0;k<5;k++){
          const fx=x+(k-2)*5+Math.sin(time*.023+k*2.2+x)*2;
          const fh=13+((Math.sin(time*.027+k*1.7+y*.01)+1)*.5)*23;
          flames.fillStyle(k%3===0?0xd84425:0xf17a2b,.91).fillTriangle(fx-3,y-1,fx+Math.sin(time*.02+k)*3,y-fh,fx+4,y-1);
          flames.fillStyle(0xffc85d,.86).fillTriangle(fx-1.2,y,fx,y-fh*.52,fx+1.5,y);
        }
        drawPlume(x,y-3,64,1.05,(s.windDirection||1)*11,(v.id||v.vehicleRecordId||1).toString().length+500);
      } else {
        smoke.fillStyle(0x303533,.28).fillEllipse(x,y-5,25,13);
      }
    }
    // Color smoke grenades are deliberately stylised plumes, distinct from dark structural fires and gas.
    for (const z of s.smokeZones || []) {
      if (z.kind !== 'colored-smoke' || Number(z.life||0) <= 0) continue;
      const col = Number(z.color || 0xe34f58);
      const fade = clamp(Math.min(1,Number(z.life||0)/1.25),0,1);
      drawPlume(z.x,z.y,Math.min(95,Number(z.radius||48)),.9,z.drift||0,String(z.id||'').length,col);
      smoke.fillStyle(col,0.10*fade).fillEllipse(z.x,z.y-9,(z.radius||48)*2.2,(z.radius||48)*1.2);
    }
    // Gas and water effects occupy visible zones; wind gradually drifts the cloud across the plaza.
    for (const z of s.gasZones || []) {
      if (Number(z.life||0)<=0) continue;
      const radius=Number(z.radius||80), drift=(s.windDirection||1)*Math.min(32,Number(z.intensity||1)*10);
      if (z.kind==='water') {
        flames.lineStyle(3,0x93c3d3,.22).beginPath().moveTo(640,592).lineTo(z.x,z.y).strokePath();
        flames.fillStyle(0x80b6cf,.09).fillEllipse(z.x,z.y,radius*1.65,radius*.68);
      } else if (z.kind==='gas' || String(z.id||'').startsWith('GAS')) {
        drawPlume(z.x+drift,z.y,Math.min(110,radius*.9),.5,drift,String(z.id||'').length,0x9ca98d);
        smoke.fillStyle(0x9aa992,.075).fillEllipse(z.x+drift,z.y,radius*1.55,radius*.72);
      } else if (z.kind==='flash') {
        const pulse=.3+.7*Math.max(0,Math.sin(time*.04));
        flames.fillStyle(0xf4e8bc,.19*pulse).fillEllipse(z.x,z.y,radius*1.75,radius*.52);
      }
    }
    // Flames on people are short-lived but persistent enough to show the impact and panic response.
    for (const a of this.people || []) {
      if (!a || !a.sprite || !a.sprite.active) continue;
      if (Number(a.v5BurningUntil||0) > (this.currentTime||0)) {
        const timeLeft=(a.v5BurningUntil-this.currentTime);
        const p=.78+Math.sin(time*.036+(a.v4Id||0))*0.16;
        flames.fillStyle(0xed5525,.36*p).fillEllipse(a.x,a.y-11,17,25);
        for(let k=0;k<3;k++) {
          const dx=(k-1)*4+Math.sin(time*.022+k*2+a.x)*2;
          const h=10+((time*.012+k*.39+a.y*.01)%1)*13;
          flames.fillStyle(k===1?0xffc65c:0xef6b2d,.88).fillTriangle(a.x+dx-3,a.y-5,a.x+dx,a.y-h-9,a.x+dx+3,a.y-5);
        }
        if(timeLeft%550<50) drawPlume(a.x,a.y-4,14,.55,4,a.v4Id||1);
      }
    }
    for (const officer of this.crowdPolice || []) {
      if (Number(officer.getData('burningUntil') || 0) > (this.currentTime || 0)) {
        const p=.72+Math.sin(time*.033+officer.x)*.18;
        flames.fillStyle(0xed5525,.42*p).fillEllipse(officer.x,officer.y-10,16,22);
        for(let k=0;k<3;k++) { const dx=(k-1)*4+Math.sin(time*.025+k*1.9+officer.x)*2; const h=12+((time*.012+k*.31+officer.y*.01)%1)*11;
          flames.fillStyle(k===1?0xffc65c:0xef6b2d,.9).fillTriangle(officer.x+dx-3,officer.y-4,officer.x+dx,officer.y-h-8,officer.x+dx+3,officer.y-4);
        }
      }
    }
    // Government-building condition and the assault objective are visibly different from a static intact facade.
    const b=s.building||{}, integrity=clamp(b.integrity ?? 100);
    const buildingAsset=(s.assets||[]).find(a=>a.kind==='building');
    // Every flammable world asset gets visible flame and soot, not only the central fire incident.
    for (let idx=0; idx<(s.assets||[]).length; idx++) {
      const asset=s.assets[idx];
      if (!asset || asset.kind==='building' || asset.condition!=='Горит' || Number(asset.integrity||0)<=0) continue;
      const ax=Number(asset.x||640), ay=Number(asset.y||450), ar=clamp(asset.radius||14,8,38);
      const phase=.78+Math.sin(time*.031+idx*1.7+ax)*.18;
      flames.fillStyle(0xe95625,.16*phase).fillEllipse(ax,ay-7,ar*2.3,ar*2.7);
      for(let k=0;k<4;k++) {
        const fx=ax+(k-1.5)*ar*.42+Math.sin(time*.029+k*2+idx)*2;
        const fh=(12+((Math.sin(time*.025+k*1.8+ay*.01)+1)*.5)*Math.min(34,13+ar*.6))*phase;
        flames.fillStyle(k%3===0?0xd84624:0xf17a2b,.9).fillTriangle(fx-ar*.16,ay+1,fx,ay-fh,fx+ar*.17,ay+1);
        flames.fillStyle(0xffcb69,.84).fillTriangle(fx-ar*.06,ay,fx,ay-fh*.57,fx+ar*.07,ay);
      }
      if (idx%2===0) drawPlume(ax,ay-3,ar*2,Math.max(.45,Number(asset.fireIntensity||.7)),(s.windDirection||1)*8,idx+1200);
    }
    if (integrity < 99) {
      const damage=1-integrity/100;
      front.fillStyle(0x22221e,Math.min(.56,damage*.62)).fillRect(492,125,296,105);
      front.lineStyle(2,0x382d27,Math.min(.96,.25+damage)).strokeRect(494,127,292,103);
      for(let k=0;k<Math.floor(damage*18);k++) {
        const x=505+(k*37%270),y=130+(k*23%89);
        front.lineStyle(1.4,k%3?0x292d2b:0x8b4e3a,.75).beginPath().moveTo(x,y).lineTo(x+6,y+11).lineTo(x+2,y+20).strokePath();
      }
      for(let k=0;k<Math.floor(damage*8);k++) {
        const x=531+(k*41%215),y=151+(k*17%51);
        front.fillStyle(0x131b1c,.88).fillRect(x,y,8,12);
      }
    }
    if (integrity<=0 || b.status==='Разрушено') {
      front.fillStyle(0x262725,.88).fillTriangle(488,235,530,185,548,245);
      front.fillStyle(0x343530,.94).fillTriangle(730,244,770,194,795,248);
      front.fillStyle(0x1a1d1c,.84).fillRect(500,194,286,54);
      for(let k=0;k<16;k++) {
        const x=500+(k*53%287),y=245+(k*17%27);
        front.fillStyle(k%2?0x3e413d:0x5a5348,.86).fillRoundedRect(x,y,8+(k%3)*3,4+(k%2)*2,1);
      }
      this.v5BuildingLabel?.setText('ЗДАНИЕ РАЗРУШЕНО · ВРЕМЕННЫЙ КАБИНЕТ').setColor('#f2c3ae').setBackgroundColor('#401f1bdd');
    } else if (b.occupation) {
      this.v5BuildingLabel?.setText('ЗДАНИЕ ЗАНЯТО · КАБИНЕТ ЭВАКУИРОВАН').setColor('#f0b3a3').setBackgroundColor('#40201ddd');
    } else if ((b.siege||0)>55 || (s.incidents||[]).some(i=>alive(i)&&i.type==='building_assault')) {
      this.v5BuildingLabel?.setText('ОСАДА / ПОПЫТКА ПРОРЫВА').setColor('#f0d19c').setBackgroundColor('#3f2c1add');
    } else if (integrity < 46 || buildingAsset?.condition==='Горит') {
      this.v5BuildingLabel?.setText(`ФАСАД ГОРИТ · ЦЕЛОСТНОСТЬ ${Math.round(integrity)}%`).setColor('#ffd0a2').setBackgroundColor('#48251ddd');
    } else {
      this.v5BuildingLabel?.setText(`ПРАВИТЕЛЬСТВО · ПРОЧНОСТЬ ${Math.round(integrity)}%`).setColor('#efe4cb').setBackgroundColor('#263033dd');
    }
    if (buildingAsset?.condition==='Горит' || (integrity<46 && integrity>0)) {
      const int=clamp((100-integrity)/100,.2,1.2);
      for(let k=0;k<7;k++) {
        const x=514+k*41+Math.sin(time*.022+k)*5;
        const h=(18+((Math.sin(time*.031+k*1.7)+1)*.5)*30)*int;
        flames.fillStyle(k%3===0?0xdd4d28:0xf1782c,.9).fillTriangle(x-8,246,x,235-h,x+7,246);
        flames.fillStyle(0xffca69,.86).fillTriangle(x-3,245,x,239-h*.58,x+3,245);
      }
      drawPlume(640,235,66,1.25,(s.windDirection||1)*18,773);
    }
  };

  const priorRender = P._renderEnvironment;
  P._renderEnvironment = function(s,time) {
    if (priorRender) priorRender.call(this,s,time);
    this._v5RenderNight(s);
    this._v5RenderFlagsAndBarricades(s,time||0);
    this._v5RenderSmokeAndFire(s,time||0);
  };

  // Building collapse can be caused by incident spread and happens at the next simulation-hour boundary.
  const priorFirePhysics = SP._updateFirePhysics;
  SP._updateFirePhysics = function() {
    const stateBefore=this.state;
    const burningAssetsBefore=(stateBefore?.assets||[]).filter(a=>a && a.condition==='Горит' && Number(a.integrity||0)>0).map(a=>({asset:a, hasLiveCause:(stateBefore.incidents||[]).some(i=>alive(i)&&['fire','arson','building_fire','roof_fire','camp_fire','vehicle_fire'].includes(i.type)&&(i.id===a.fireIncidentId || Math.hypot((i.x||0)-a.x,(i.y||0)-a.y)<(i.fireRadius||22)+(a.radius||18)))}));
    if (priorFirePhysics) priorFirePhysics.call(this);
    const s=this.state;
    if (!s) return;
    const now=Number(s.hoursElapsed||0);
    const fires=(s.incidents||[]).filter(i=>alive(i)&&['fire','arson','building_fire','roof_fire','camp_fire','vehicle_fire'].includes(i.type));
    s.fireZones=s.fireZones||[];
    const activeFireIds=new Set(fires.map(i=>i.id));
    // A standalone ignition without an available incident still remains a real fire source. If an incident was resolved, allow its asset to leave the burning state.
    for(const item of burningAssetsBefore){
      const a=item.asset;
      const hasCauseNow=fires.some(i=>i.id===a.fireIncidentId || Math.hypot((i.x||0)-a.x,(i.y||0)-a.y)<(i.fireRadius||22)+(a.radius||18));
      if(!item.hasLiveCause && !hasCauseNow && Number(a.integrity||0)>0) a.condition='Горит';
    }
    // The legacy fire system prunes to incident IDs. Keep separately keyed camp/asset/barrier sources as long as the object is burning.
    s.fireZones=s.fireZones.filter(z=>(z.condition==='Потушено' && (Number(z.smokeLife)||0)>0) || activeFireIds.has(z.id) || (z.source==='camp' && (s.campSites||[]).some(c=>`CAMP-${c.id}`===z.id&&onFire(c))) || (z.source==='barricade' && (s.barricades||[]).some(b=>b.fireZoneId===z.id&&b.burning)) || (z.source==='asset' && (s.assets||[]).some(a=>a.fireZoneId===z.id&&a.condition==='Горит')) || (String(z.id||'').startsWith('ASSET-FIRE-') && (s.assets||[]).some(a=>a.fireZoneId===z.id&&a.condition==='Горит')));
    // Restore or update immediate flame/smoke zones after the old hourly model pass.
    const ensureZone=(z)=>{const idx=s.fireZones.findIndex(q=>q.id===z.id);if(idx>=0)Object.assign(s.fireZones[idx],z);else s.fireZones.unshift(z);};
    for(const asset of s.assets||[]) if(asset && asset.condition==='Горит' && Number(asset.integrity||0)>0){
      const inc=fires.find(i=>i.id===asset.fireIncidentId) || fires.find(i=>Math.hypot((i.x||0)-asset.x,(i.y||0)-asset.y)<(i.fireRadius||25)+(asset.radius||18));
      const id=inc?.id||asset.fireZoneId||`ASSET-FIRE-${asset.id}`;asset.fireZoneId=id;
      ensureZone({id,x:asset.x,y:asset.y,area:Math.max(12,asset.fireArea||14),radius:Math.max(22,inc?.fireRadius||asset.radius||22),smokeRadius:Math.max(56,inc?.smokeRadius||(asset.radius||22)*2.4),intensity:Math.max(.75,inc?.fireIntensity||asset.fireIntensity||.85),windDrift:(s.windDirection||1)*7,source:'asset',sourceAssetId:asset.id,condition:'Горит',at:now});
    }
    for(const b of s.barricades||[]) if(b&&b.burning){
      const inc=fires.find(i=>i.id===b.fireIncidentId)||fires.find(i=>Math.hypot((i.x||0)-b.x,(i.y||0)-b.y)<(i.fireRadius||25)+20);
      const id=inc?.id||b.fireZoneId||`BAR-FIRE-${b.id}`;b.fireZoneId=id;
      ensureZone({id,x:b.x,y:b.y-4,area:Math.max(12,inc?.fireArea||b.fireArea||14),radius:Math.max(22,inc?.fireRadius||24),smokeRadius:Math.max(56,inc?.smokeRadius||60),intensity:Math.max(.75,inc?.fireIntensity||.85),windDrift:(s.windDirection||1)*7,source:'barricade',condition:'Горит',at:now});
    }
    for(const camp of s.campSites||[]) if(camp&&onFire(camp)) ensureZone({id:`CAMP-${camp.id}`,x:camp.x,y:camp.y,area:Math.max(8,(100-(camp.integrity||0))*1.5),radius:(camp.radius||28)*.8,smokeRadius:(camp.radius||28)*2.8,intensity:camp.fireIntensity||.8,windDrift:(s.windDirection||1)*7,source:'camp',condition:'Горит',at:now});
    for(const b of s.barricades||[]) {
      if(!b.burning || ['cleared','burned'].includes(b.status)) continue;
      const rain=['rain','storm'].includes(s.weather?.id)?0.78:1;
      b.health=Math.max(0,Number(b.health||1)-(s.emergencyCorridor?18:10)*rain);
      const nearby=fires.some(i=>Math.hypot(i.x-b.x,i.y-b.y)<Math.max(i.fireRadius||18,36));
      if (!nearby && now-(b.lastReinforcedAt||0)>0.4 && (s.incidents||[]).filter(alive).length<this.config.maxIncidents) {
        const inc=this.addIncident('fire');
        if(inc){inc.x=b.x;inc.y=b.y;inc.fireArea=12;inc.fireIntensity=.8;inc.fireRadius=22;inc.smokeRadius=52;inc.label='Тление и горение баррикады';inc.source='fire-spread';b.fireIncidentId=inc.id;}
        b.lastReinforcedAt=now;
      }
      if(b.health<=0) { b.burning=false;b.status='burned';b.condition='Выжжена';b.burnedAt=now; const z=(s.fireZones||[]).find(q=>q.id===b.fireIncidentId||q.id===b.fireZoneId);if(z)z.condition='Выжжена'; }
    }
    for(const camp of s.campSites||[]) {
      if (!onFire(camp)) {
        const adjacentFire=(s.fireZones||[]).find(z=>z.condition==='Горит' && Math.hypot(z.x-camp.x,z.y-camp.y)<(z.radius||20)+(camp.radius||25)*0.68);
        if(adjacentFire && Math.random()<0.22) this._igniteCamp?.(camp,`распространение огня от очага ${adjacentFire.source||'на площади'}`);
        continue;
      }
      const incident=(s.incidents||[]).find(i=>alive(i)&&['fire','arson','building_fire','roof_fire','camp_fire','vehicle_fire'].includes(i.type)&&Math.hypot(i.x-camp.x,i.y-camp.y)<Math.max(i.fireRadius||18,36));
      if(incident && !camp.incidentId) camp.incidentId=incident.id;
    }
    this._v5ApplyBuildingCollapse();
  };

  // Improve blocked road geometry: spread fire only to a nearby barrier rather than igniting an arbitrary one.
  const priorCrowdDynamics = SP._updateCrowdDynamics;
  SP._updateCrowdDynamics = function() {
    if (priorCrowdDynamics) priorCrowdDynamics.call(this);
    const s=this.state; if(!s) return;
    const fires=(s.fireZones||[]).filter(z=>z.condition==='Горит');
    if(!fires.length) return;
    for(const b of s.barricades||[]) {
      if(b.burning || ['cleared','burned'].includes(b.status)) continue;
      const near=fires.some(z=>Math.hypot(z.x-b.x,z.y-b.y)<(z.radius||20)+12);
      if(near && Math.random()<0.12) this._v5IgniteBarricade(b,'распространение открытого огня от соседнего очага');
    }
  };

  // Keep the single-site camera centered on the entire 1280x640 scene; prevent the roof from wrapping beneath the road.
  P._updateDistrictCamera = function(deltaMs=0,s=this.sim&&this.sim.state,immediate=false) {
    if (!s || !this.cameras?.main) return;
    if (immediate) this.cameras.main.centerOn(640,320);
    else {
      this.cameras.main.stopFollow?.();
      const current = this.cameras.main.midPoint;
      if (!current || Math.abs(current.x-640)>0.5 || Math.abs(current.y-320)>0.5) this.cameras.main.centerOn(640,320);
    }
    this.cameras.main.setZoom(1);
  };

  // Better crisis monitor copy and current save key.
  UP.updateStats = function() {
    if (uiOld.updateStats) uiOld.updateStats.call(this);
    const footer=document.querySelector('.app-footer span'); if(footer) footer.textContent='КОНТУР // ВЕРСИЯ 5.2.0';
  };
  UP.saveGame = function(automatic=false) {
    try {
      localStorage.setItem('kontur-republic-save-v5', JSON.stringify(this.sim.snapshot()));
      const label=document.getElementById('last-save-label'); if(label) label.textContent=`СОХРАНЕНО v5.2 ${new Date().toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}`;
      if (!automatic) this.toast('Игра сохранена','Сохранены ход времени, ИИ полиции, очаги огня, лагеря и повреждения объектов.','success');
      return true;
    } catch(err) { if(!automatic) this.toast('Не удалось сохранить',`Браузер не разрешил запись: ${err.message}`,'error'); return false; }
  };
  UP.loadGame = function() {
    try {
      const raw=localStorage.getItem('kontur-republic-save-v5') || localStorage.getItem('kontur-republic-save-v4') || localStorage.getItem('kontur-republic-save-v3') || localStorage.getItem('kontur-republic-save-v2');
      if(!raw){this.toast('Сохранение не найдено','Сначала сохраните игру.','warning');return false;}
      const snap=JSON.parse(raw); this.sim.loadSnapshot(snap); this.draft={...this.sim.state.policies}; this._syncPolicyInputs(); this.renderAll(true);
      const label=document.getElementById('last-save-label');if(label)label.textContent='ЗАГРУЖЕНО И АДАПТИРОВАНО К v5.2';
      this.toast('Сохранение загружено','Поля v5 добавлены; прежняя политическая история сохранена.','success');return true;
    } catch(err) { this.toast('Ошибка загрузки',`Не удалось прочитать сохранение: ${err.message}`,'error'); return false; }
  };

  // Keep the main help text synchronized with the new clock and autonomous response.
  document.addEventListener('DOMContentLoaded', () => {
    const panel=document.querySelector('.police-command-panel');
    if(panel){const p=panel.querySelector('.panel-intro');if(p)p.textContent='ИИ-командование пересматривает доктрину каждый модельный час и после крупных событий. Подразделения физически перемещаются, держат или меняют линию, применяют средства в зависимости от риска и могут отступить либо потерять организацию. Игрок не отдаёт тактических приказов.';}
    const footer=document.querySelector('.app-footer span');if(footer)footer.textContent='КОНТУР // ВЕРСИЯ 5.2.0';
  }, {once:true});
})();
