'use strict';
/* KONTUR v4 — one-square continuous crowd crisis model. All force/equipment effects are abstract game tokens. */
(function installKonturV4() {
  const Sim = window.RepublicSimulation;
  const Scene = window.RepublicCityScene;
  const UI = window.RepublicDashboardUI;
  if (!Sim || !Scene || !UI) return;
  const clamp = (v, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, Number(v) || 0));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const irnd = (a, b) => Math.floor(rnd(a, b + 1));
  const choose = a => a[Math.floor(Math.random() * a.length)];
  const alive = i => i && i.status !== 'resolved';
  const CENTER = { id:'center', name:'Площадь Республики', kind:'площадь', crowd:0, tension:38, blockage:0.04, incidents:0, contagion:0.16 };
  const drawCampFlame = (g,cx,baseY,width,height,time,seed,alpha=1) => {
    const layer=(scale,color,opacity,phase)=>{
      const w=width*scale,h=height*scale,pts=[{x:cx-w*.54,y:baseY+2}];
      for(let i=0;i<=22;i++){
        const u=i/22,x=cx-w*.52+u*w*1.04;
        const envelope=.58+.19*Math.sin(Math.PI*u)+.075*Math.sin(Math.PI*3*u+seed*.05+phase);
        const turbulence=.075*Math.sin(time*.012+seed*.03+i*.71+phase)+.04*Math.sin(time*.021+i*1.19+seed*.04);
        pts.push({x,y:baseY-h*Math.max(.23,envelope+turbulence)});
      }
      pts.push({x:cx+w*.54,y:baseY+2});
      g.fillStyle(color,Math.max(0,Math.min(1,alpha*opacity))).fillPoints(pts,true);
    };
    layer(1,0x77271b,.72,0);layer(.84,0xe34b22,.88,1.1);layer(.62,0xff8b30,.94,2.2);layer(.38,0xffc05a,.9,3.4);layer(.20,0xffe2a0,.72,4.2);
  };
  const makeCamps = () => [
    { id:'camp-west', name:'Западный палаточный лагерь', x:365, y:472, radius:34, integrity:100, condition:'Цел', fireRemaining:0, fireIntensity:0, tentCount:5, rebuildAt:0 },
    { id:'camp-east', name:'Восточный палаточный лагерь', x:930, y:468, radius:36, integrity:100, condition:'Цел', fireRemaining:0, fireIntensity:0, tentCount:6, rebuildAt:0 },
    { id:'camp-steps', name:'Лагерь у боковой лестницы', x:500, y:493, radius:28, integrity:100, condition:'Цел', fireRemaining:0, fireIntensity:0, tentCount:3, rebuildAt:0 }
  ];

  const SP = Sim.prototype;
  const old = {};
  ['_initCrisisState','_updateDistricts','_districtAnchor','_spawnIncident','_estimateCrowdSize','_makeInjury','_registerDeath','_updateFirePhysics','_updateCrowdDynamics','_updatePoliceDoctrine','commandPolice','reset','loadSnapshot','tick','_hourlyStep'].forEach(k => old[k] = SP[k]);

  // A single live location: square and government-building perimeter. The city still has a population ledger,
  // but no other map sectors exist in this edition.
  SP._updateDistricts = function(emit = true, stepTension = true) {
    const s = this.state;
    if (!s) return;
    const d = Array.isArray(s.districts) ? s.districts.find(x => x.id === 'center') || { ...CENTER } : { ...CENTER };
    Object.assign(d, { id:'center', name:'Площадь Республики', kind:'площадь', crowd:Math.round(clamp(s.crowdTarget || 0, 0, s.cityPopulation || 5000)), incidents:(s.incidents || []).filter(alive).length });
    const fires = (s.fireZones || []).length;
    const active = (s.incidents || []).filter(alive).length;
    const targetTension = clamp((s.tension || 38) + Math.min(18, active * 2.2) + Math.min(10, fires * 2.5), 0, 100);
    d.tension = stepTension ? clamp((Number(d.tension) || targetTension) * 0.62 + targetTension * 0.38) : clamp(targetTension);
    d.blockage = clamp(0.025 + d.crowd / Math.max(1, s.cityPopulation || 5000) * 0.58 + (s.barricades || []).filter(b => !['cleared','burned'].includes(b.status)).length * 0.055 + fires * 0.035 + (d.tension > 75 ? 0.08 : 0), 0.02, 0.98);
    s.districts = [d]; s.activeDistrict = 'center'; s.roadBlockage = Math.max(Number(s.roadBlockage) || 0, d.blockage);
    for (const inc of s.incidents || []) inc.districtId = 'center';
    if (emit && this._notify) this._notify('districts');
  };

  SP._districtAnchor = function() { return { x:640, y:438 }; };

  SP._initCrisisState = function(migrating = false) {
    if (old._initCrisisState) old._initCrisisState.call(this, migrating);
    const s = this.state;
    if (!s) return;
    s.crowdAnger = Number.isFinite(s.crowdAnger) ? clamp(s.crowdAnger, 0, 1000) : clamp(Math.round((Number(s.tension || 38) * 2.15 + Number(s.publicAnger || 42) * 1.65) * 1.0), 0, 1000);
    s.crowdOrder = s.crowdOrder || { phase:'gather', version:0, targetX:640, targetY:420, nextAt:0 };
    s.casualtyLedger = s.casualtyLedger || { totalCases:Number(s.injuredTotal || 0) + Number(s.deaths || 0), injured:Number(s.injuredTotal || 0), deaths:Number(s.deaths || 0), light:0, medium:0, heavy:0, critical:0 };
    s.casualtyLedger.deaths = Number(s.deaths || s.casualtyLedger.deaths || 0);
    s.campSites = Array.isArray(s.campSites) && s.campSites.length ? s.campSites : makeCamps();
    s.campsBurned = Number(s.campsBurned || 0);
    s.lastV4CrowdEventAt = Number.isFinite(s.lastV4CrowdEventAt) ? s.lastV4CrowdEventAt : -999;
    s.lastV4PoliceActionAt = Number.isFinite(s.lastV4PoliceActionAt) ? s.lastV4PoliceActionAt : -999;
    s.policeCommandOverride = null;
    s.activeDistrict = 'center';
    s.districts = [{ ...CENTER, crowd:Math.round(s.crowdTarget || 0), tension:Number(s.tension || 38), blockage:Number(s.roadBlockage || 0.04) }];
    for (const inc of s.incidents || []) inc.districtId = 'center';
    this._updateDistricts(false, false);
  };

  SP._spawnIncident = function(type = null) {
    const inc = old._spawnIncident ? old._spawnIncident.call(this, type) : null;
    if (!inc) return inc;
    inc.districtId = 'center'; inc.locationType = 'площадь';
    if (!Number.isFinite(inc.x) || inc.x < 250 || inc.x > 1030) inc.x = clamp(640 + rnd(-185, 185), 270, 1010);
    if (!Number.isFinite(inc.y) || inc.y < 290 || inc.y > 620) inc.y = clamp(425 + rnd(-90, 150), 300, 610);
    const s = this.state;
    if (s) {
      const angerRise = ({ demonstration:3, blockade:10, barricade:13, clash:24, riot:38, looting:26, building_assault:55, radical_attack:52, arson:46, fire:20, gas:18, traffic_crash:12, crush:22, special_vehicle_attack:34 })[inc.type] || 4;
      s.crowdAnger = clamp((s.crowdAnger || 180) + angerRise, 0, 1000);
      s.lastCrowdTrigger = inc.type;
    }
    return inc;
  };


  SP._estimateCrowdSize = function() {
    const base = old._estimateCrowdSize ? old._estimateCrowdSize.call(this) : Number(this.state.crowdTarget || 520);
    const s = this.state; const pop = Math.max(500, Number(s.cityPopulation || 5000));
    const anger = clamp(s.crowdAnger || 0, 0, 1000) / 1000;
    const mobilization = Math.round(pop * 0.72 * Math.pow(anger, 1.7));
    const scar = Math.round(pop * clamp(s.movementAsh || 0, 0, 100) / 100 * 0.08);
    return Math.round(clamp(base + mobilization + scar, Math.max(20, pop * 0.004), pop));
  };

  SP._makeInjury = function(kind, severity, x, y, cause, source, victim, incidentId) {
    const s = this.state;
    const initialGrade = clamp(Math.round(severity), 0, 4);
    const injury = old._makeInjury.call(this, kind, severity, x, y, cause, source, victim, incidentId);
    if (injury && s) {
      if (!s.casualtyLedger) s.casualtyLedger = { totalCases:0, injured:0, deaths:0, light:0, medium:0, heavy:0, critical:0 };
      const l = s.casualtyLedger;
      l.totalCases = (l.totalCases || 0) + 1;
      if (initialGrade >= 4) l.deaths = Number(s.deaths || 0);
      else {
        l.injured = (l.injured || 0) + 1;
        const key = ['light','medium','heavy','critical'][Math.min(3, initialGrade)];
        l[key] = (l[key] || 0) + 1;
      }
      l.deaths = Number(s.deaths || l.deaths || 0);
    }
    return injury;
  };

  SP._registerDeath = function(injury) {
    const before = Number(this.state?.deaths || 0);
    const result = old._registerDeath.call(this, injury);
    const s = this.state;
    if (s && s.casualtyLedger) {
      s.casualtyLedger.deaths = Number(s.deaths || before);
      if (Number(s.deaths || 0) > before) s.crowdAnger = clamp((s.crowdAnger || 0) + (injury?.martyr ? 130 : 70), 0, 1000);
    }
    return result;
  };

  SP._updateFirePhysics = function() {
    if (old._updateFirePhysics) old._updateFirePhysics.call(this);
    const s = this.state;
    if (!s) return;
    const activeFires = (s.incidents || []).filter(i => alive(i) && ['fire','arson'].includes(i.type));
    const weather = s.weather || { id:'clear', temperature:18 };
    for (const camp of s.campSites || []) {
      if (camp.condition === 'Горит' || camp.condition === 'Тлеет') {
        const rain = ['rain','storm'].includes(weather.id) ? 0.65 : 1;
        const related = activeFires.find(i => i.id === camp.incidentId);
        const controlled = related && related.serviceProgress && related.serviceProgress.fire;
        camp.fireRemaining = Math.max(0, (camp.fireRemaining || 0) - (controlled ? 1.1 : rain * 0.32));
        camp.fireIntensity = clamp((camp.fireIntensity || 0.6) + (controlled ? -0.22 : rain * 0.025), 0.08, 2.2);
        camp.integrity = Math.max(0, (camp.integrity ?? 100) - (controlled ? 17 : 9 + camp.fireIntensity * 2.2) * rain);
        if (camp.fireRemaining <= 0 || camp.integrity <= 0) {
          camp.condition = 'Выжжен'; camp.integrity = 0; camp.fireRemaining = 0; camp.burnedAt = s.hoursElapsed || 0; camp.rebuildAt = (s.day || 1) + irnd(3, 18);
          s.campsBurned = (s.campsBurned || 0) + 1;
          const z = (s.fireZones || []).find(q => q.id === `CAMP-${camp.id}`); if (z) z.condition = 'Выжжен';
          this._radio('Пожарные','Старший пожарной смены',`${camp.name}: открытое горение прекратилось. Палатки выгорели; остатки остаются опасными до разбора.`, 'warning','fire',camp.incidentId || null);
        } else {
          const z = { id:`CAMP-${camp.id}`, x:camp.x, y:camp.y, area:Math.max(8, (100-camp.integrity)*1.5), radius:camp.radius*0.8, smokeRadius:camp.radius*2.8, intensity:camp.fireIntensity, windDrift:(s.windDirection || 1) * 4, source:'camp', condition:'Горит', at:s.hoursElapsed || 0 };
          const idx = (s.fireZones || []).findIndex(q => q.id === z.id);
          if (idx >= 0) Object.assign(s.fireZones[idx], z); else s.fireZones.push(z);
        }
      } else if (camp.condition === 'Выжжен' && (s.day || 1) >= (camp.rebuildAt || 99999)) {
        // Burnt camps remain as scars for several days, then can return as damaged, smaller shelters.
        // Restoration is gradual and paid from the infrastructure reserve when available.
        if (Number(s.treasury || 0) > 0.08 && (s.policies?.infrastructure || 0) >= 25) {
          s.treasury = Math.max(0, Number(s.treasury || 0) - 0.08);
          camp.condition = 'Повреждён'; camp.integrity = 42; camp.tentCount = Math.max(2, Math.round((camp.tentCount || 4) * 0.65));
          camp.rebuildAt = (s.day || 1) + irnd(2, 6);
          this._radio('Правительственный','Городское хозяйство',`${camp.name}: начато частичное восстановление укрытий после пожара.`, 'info','government');
        } else if ((s.day || 1) >= (camp.rebuildAt || 0) + 7) {
          // Even in austerity, small spontaneous replacement camps may emerge later.
          camp.condition = 'Повреждён'; camp.integrity = 28; camp.tentCount = Math.max(2, Math.round((camp.tentCount || 4) * 0.45));
          camp.rebuildAt = (s.day || 1) + irnd(4, 9);
          this._radio('Гражданский','Волонтёрский пункт',`${camp.name}: на месте выгоревшего лагеря появились временные укрытия.`, 'info','citizens');
        }
      } else if (camp.condition === 'Цел' || camp.condition === 'Повреждён') {
        // A camp ignites only from a real active fire reaching its perimeter or an explicit firebrand impact.
        const nearestFire = activeFires.find(i => Math.hypot((i.x||640)-camp.x, (i.y||420)-camp.y) < (i.fireRadius || 18) + camp.radius * 0.7);
        if (nearestFire) this._igniteCamp(camp, 'распространение открытого огня от соседнего очага');
        if (camp.condition === 'Повреждён' && (s.day || 1) >= (camp.rebuildAt || 99999) && (s.policies?.infrastructure || 0) > 55 && s.treasury > 0.2) {
          camp.condition = 'Цел'; camp.integrity = 72; camp.rebuildAt = 0; s.treasury -= 0.05;
          this._radio('Правительственный','Городское хозяйство',`${camp.name}: восстановлены часть тентов и укрытий из резервного фонда.`, 'info','government');
        }
      }
    }
    // Fires and smoke at camp sites remain visible after the source incident has been resolved.
    for (const camp of s.campSites || []) {
      const id = `CAMP-${camp.id}`;
      if (camp.condition !== 'Горит' && camp.condition !== 'Тлеет') s.fireZones = (s.fireZones || []).filter(z => z.id !== id);
    }
  };

  SP._igniteCamp = function(camp, cause = 'очаг рядом') {
    const s = this.state;
    if (!camp || camp.condition === 'Горит' || camp.condition === 'Тлеет' || camp.condition === 'Выжжен') return false;
    camp.condition = 'Горит'; camp.fireIntensity = rnd(0.65, 1.45); camp.fireRemaining = rnd(2.8, 8.5); camp.integrity = Math.min(camp.integrity ?? 100, 84); camp.ignitionCause = cause;
    camp.lastIgnitionCheck = s.hoursElapsed || 0;
    let inc = camp.incidentId && (s.incidents || []).find(i => i.id === camp.incidentId && alive(i));
    if (!inc && (s.incidents || []).filter(alive).length < this.config.maxIncidents && old._spawnIncident) {
      inc = old._spawnIncident.call(this, 'fire');
      if (inc) { inc.x = camp.x; inc.y = camp.y; inc.districtId = 'center'; inc.locationType = 'площадь'; inc.fireArea = 12; inc.fireIntensity = camp.fireIntensity; inc.fireRadius = 18; inc.smokeRadius = camp.radius * 2.2; camp.incidentId = inc.id; }
    }
    s.fireZones = s.fireZones || [];
    const zone = { id:`CAMP-${camp.id}`, x:camp.x, y:camp.y, area:16, radius:camp.radius*0.8, smokeRadius:camp.radius*2.5, intensity:camp.fireIntensity, windDrift:(s.windDirection || 1)*4, source:'camp', condition:'Горит', at:s.hoursElapsed || 0 };
    s.fireZones.unshift(zone); s.fireZones = s.fireZones.slice(0, 36);
    s.crowdAnger = clamp((s.crowdAnger || 0) + 38, 0, 1000);
    this._publishCrisisEvent?.('fire','camp-fire',`Горит палаточный лагерь: ${camp.name}`,`${camp.name} загорелся (${cause}). Пламя распространяется по тентам, дым ухудшает видимость; пожарные направлены к площади.`,{ severity:1.35, channel:'Пожарные', speaker:'Диспетчерская', tone:'critical' });
    this._radio('Гражданский','Волонтёрский пункт',`Внимание: ${camp.name} горит. Людей просят отходить от дыма и не перекрывать проход пожарным.`, 'critical','fire',inc?.id || null);
    return true;
  };

  SP._updateCrowdDynamics = function() {
    if (old._updateCrowdDynamics) old._updateCrowdDynamics.call(this);
    const s = this.state;
    if (!s) return;
    const active = (s.incidents || []).filter(alive);
    const violent = active.filter(i => ['riot','clash','looting','building_assault','radical_attack','arson','special_vehicle_attack'].includes(i.type)).length;
    const fires = (s.fireZones || []).filter(z => z.condition !== 'Выжжен').length;
    const media = clamp((s.mediaResonance || 55) / 100, 0, 1.5);
    const trustPenalty = (60 - (s.trust || 50)) * 0.035;
    const injuryPressure = Math.min(24, ((s.injuries || []).filter(i => i.status === 'awaiting' || i.status === 'stabilized').length) * 2.1);
    const deathPressure = Math.min(120, (s.deaths || 0) * 24);
    const fatigue = Number(s.crowdFatigue || 0);
    let delta = ((s.tension || 38) - 42) * 0.42 + ((s.publicAnger || 42) - 42) * 0.22 + violent * 8.5 + fires * 2.5 + injuryPressure * 0.42 + deathPressure * 0.15 + trustPenalty - fatigue * 0.055;
    if (['talk','deescalate','corridor','retreat'].includes(s.lastPoliceAction?.method) && (s.hoursElapsed || 0) - (s.lastPoliceAction.at || 0) < 2) delta -= 7;
    if ((s.hoursElapsed || 0) % 24 > 16) delta += 1.5;
    s.crowdAnger = clamp((s.crowdAnger || 180) + delta, 0, 1000);
    s.crowdOrder = s.crowdOrder || { phase:'gather', version:0, nextAt:0 };
    const anger = s.crowdAnger;
    if (anger < 220) { s.crowdOrder.phase = 'gather'; s.protestPhase = 'Мирное собрание и согласованные выступления'; }
    else if (anger < 420) { s.crowdOrder.phase = 'march'; s.protestPhase = 'Организованный марш и коллективные требования'; }
    else if (anger < 620) { s.crowdOrder.phase = 'pressure'; s.protestPhase = 'Согласованное давление на периметр; растут локальные столкновения'; }
    else if (anger < 810) { s.crowdOrder.phase = 'clashes'; s.protestPhase = 'Массовые столкновения, панические волны и поджоги'; }
    else { s.crowdOrder.phase = 'siege'; s.protestPhase = 'Критическая эскалация: штурмовые попытки и пожары на площади'; }
    // One event chain at the plaza. As anger rises, event type evolves rather than switching to another location.
    const now = Number(s.hoursElapsed || 0);
    const cooldown = anger > 820 ? 1.0 : anger > 620 ? 1.6 : anger > 420 ? 2.2 : 3.4;
    if (anger > 250 && now - (s.lastV4CrowdEventAt || -999) >= cooldown && active.length < this.config.maxIncidents) {
      const chance = anger < 420 ? 0.30 : anger < 620 ? 0.48 : anger < 820 ? 0.62 : 0.75;
      if (Math.random() < chance) {
        let choices;
        if (anger < 420) choices = ['demonstration','blockade','barricade'];
        else if (anger < 620) choices = ['clash','blockade','riot','barricade'];
        else if (anger < 810) choices = ['riot','clash','arson','looting','radical_attack'];
        else choices = ['riot','arson','building_assault','radical_attack','special_vehicle_attack'];
        const inc = this._spawnIncident(choose(choices));
        if (inc) {
          inc.districtId = 'center'; inc.locationType = 'площадь';
          if (!Number.isFinite(inc.x) || inc.x < 250 || inc.x > 1030) inc.x = clamp(640 + rnd(-170,170),280,1000);
          if (inc.type === 'building_assault') { inc.x = 640 + rnd(-75,75); inc.y = 300 + rnd(0,24); s.building.siege = clamp((s.building.siege || 0) + rnd(8,18)); }
          s.lastV4CrowdEventAt = now;
        }
      }
    }
    // A movement network survives the visible wave. Old commitments or exhaustion can change its demands, not erase it.
    s.movementAsh = clamp((s.movementAsh || 0) * 0.995 + (anger > 350 ? 0.8 : -0.3), 0, 100);
    this._updateDistricts(false, false);
  };

  SP._updatePoliceDoctrine = function(eventDriven = false) {
    const s = this.state; if (!s) return;
    const now = Number(s.hoursElapsed || 0);
    const active = (s.incidents || []).filter(alive);
    const violent = active.filter(i => ['riot','clash','looting','building_assault','radical_attack','arson','special_vehicle_attack'].includes(i.type));
    const anger = Number(s.crowdAnger || 0);
    const threatToBuilding = (s.building?.integrity ?? 100) < 72 || (s.building?.siege || 0) > 22 || active.some(i => i.type === 'building_assault');
    const danger = violent.length > 0 || (s.fireZones || []).length > 0;
    const crowdRatio = (s.crowdTarget || 0) / Math.max(1, (s.policePresence || 30) * 24 + (s.militaryDeployed ? 420 : 0));
    // Force limits are an internal AI logistics decision, not a player-facing control.
    s.forceCap = anger > 930 && (s.deaths > 0 || threatToBuilding) ? 7 : anger > 820 ? 6 : anger > 700 ? 5 : anger > 560 ? 4 : anger > 390 ? 3 : anger > 230 ? 2 : 1;
    s.policeCommandOverride = null;
    if (!eventDriven) {
      s.policeShiftHours = (s.policeShiftHours || 0) + 1;
      const rest = s.policeShiftHours % 10 === 0 ? 1.8 : 0;
      s.policeFatigue = clamp((s.policeFatigue || 12) + 0.4 + (danger ? 0.48 : 0.08) - rest);
      s.policeMorale = clamp((s.policeMorale || 70) + ((s.policies?.policing || 45) - 50) * 0.004 - (s.policeFatigue > 75 ? 0.38 : 0) + (s.trust < 22 ? -0.15 : 0.04));
    }
    let code = 'observe', doctrine = 'Наблюдение';
    if (s.policeMorale < 12 && crowdRatio > 2.0 && violent.length) { code='withdraw'; doctrine='Отступление'; }
    else if (threatToBuilding) { code='protect'; doctrine='Защита периметра здания'; }
    else if (anger > 820 && violent.length > 1 && s.policeMorale > 24 && s.forceCap >= 5) { code='disperse'; doctrine='Жёсткое сдерживание'; }
    else if (anger > 520 || violent.length || active.length > 1) { code='contain'; doctrine='Сдерживание и разделение групп'; }
    else if (anger > 220 || active.length) { code='cordon'; doctrine='Кордон и открытые коридоры'; }
    else if (s.policeFatigue > 84 && Math.random() < 0.40) { code='withdraw'; doctrine='Ротация и отход'; }
    const changed = code !== s.doctrineCode;
    s.doctrineCode = code; s.doctrine = doctrine; s.doctrineDecisionAt = now;
    if (changed && this._radio) this._radio('Полиция','Автономное командование',`ИИ изменил доктрину: ${doctrine.toLowerCase()}. Злость толпы ${Math.round(anger)}/1000; мораль ${Math.round(s.policeMorale)}%, усталость ${Math.round(s.policeFatigue)}%.`, code==='disperse'?'warning':'info','police');
    if (eventDriven) return;
    if (now - (s.lastV4PoliceActionAt || -999) < 0.72) return;
    const actionChance = danger ? 0.88 : anger > 230 ? 0.68 : 0.24;
    if (Math.random() > actionChance) return; // not intervening is still a valid AI decision
    let method = null;
    if (code === 'withdraw') method = Math.random() < 0.55 ? 'retreat' : 'corridor';
    else if (code === 'protect') method = Math.random() < 0.65 ? 'cordon' : 'corridor';
    else if (code === 'observe') method = Math.random() < 0.7 ? 'talk' : 'corridor';
    else if (anger < 370) method = Math.random() < 0.72 ? 'cordon' : 'talk';
    else if (anger < 560) method = s.policeTools?.gas > 0 && Math.random() < 0.62 ? 'gas' : (s.forceCap >= 4 ? 'physical' : 'cordon');
    else if (anger < 720) method = (s.policeTools?.gas > 0 && Math.random() < 0.42) ? 'gas' : (s.policeTools?.water > 0 && Math.random() < 0.36 ? 'water' : 'physical');
    else if (anger < 880) method = s.policeTools?.flash > 0 && Math.random() < 0.28 ? 'flash' : (s.policeTools?.rubber > 0 && Math.random() < 0.22 ? 'rubber' : (s.policeTools?.gas > 0 ? 'gas' : 'physical'));
    else if ((s.deaths || 0) > 0 && threatToBuilding && s.policeMorale > 55 && Math.random() < 0.06 && s.policeTools?.live > 0) method = 'live';
    else method = s.policeTools?.rubber > 0 && Math.random() < 0.42 ? 'rubber' : (s.policeTools?.water > 0 ? 'water' : 'physical');
    if ((s.policeFatigue || 0) > 82 && Math.random() < 0.35) method = 'rotate';
    if (s.roadBlockage > 0.58 && !s.emergencyCorridor && (Math.random() < 0.25 || violent.some(i => i.type === 'fire' || i.type === 'arson'))) method = 'corridor';
    if (!method) return;
    const ok = this.commandPolice(method, true);
    if (ok) s.lastV4PoliceActionAt = now;
    // As violence exhausts the shift, the AI may call reserve officers; the road system still delays their arrival.
    if (danger && (s.policeFatigue || 0) > 65 && (s.reinforcementRequests || 0) < 5 && Math.random() < 0.18) {
      this.commandPolice('reinforce', true); s.lastV4PoliceActionAt = now;
    }
  };

  SP.commandPolice = function(method, autonomous = false) {
    if (!autonomous) {
      this._radio?.('Полиция','Автономное командование','Ручное тактическое управление отключено: подразделения сами выбирают доктрину и конкретные действия.','info','police');
      return false;
    }
    const before = Number(this.state.crowdAnger || 0);
    const ok = old.commandPolice.call(this, method, true);
    if (!ok) return ok;
    const adds = { talk:-26, deescalate:-36, cordon:12, gas:68, water:84, flash:96, physical:105, rubber:145, live:260, retreat:-28, corridor:-14, rotate:-5, reinforce:4, arrest:86 };
    this.state.crowdAnger = clamp(before + (adds[method] || 0) + (method === 'live' ? 70 : 0), 0, 1000);
    this.state.policeCommandOverride = null;
    this.state.lastPoliceAction.autonomous = true;
    if (['gas','water','flash','physical','rubber','live'].includes(method)) {
      this.state.crowdPlan = this.state.crowdPlan || { phase:'gather', version:0, nextAt:0 };
      this.state.crowdPlan.nextAt = 0;
    }
    return true;
  };

  // Force a single central square after every simulation update, including loading a v3 save.
  SP.tick = function(speed = 1) {
    const result = old.tick.call(this, speed);
    this._updateDistricts(false, false);
    this.state.activeDistrict = 'center';
    return result;
  };
  SP._hourlyStep = function() {
    const result = old._hourlyStep.call(this);
    this._updateDistricts(false, false);
    return result;
  };

  // Scene layer: all agents inhabit one square, move continuously, coordinate in waves, and flee from local hazards.
  const P = Scene.prototype;
  const sceneOld = {};
  ['create','_addPerson','_syncCrowd','_updatePeople','_launchCrowdProjectile','_updateProjectiles','_renderEnvironment','_updateDistrictCamera','_renderFixedCrisisHUD','update'].forEach(k => sceneOld[k] = P[k]);

  P.create = function() {
    // Initialize shared state BEFORE the legacy create routine seeds the first crowd and calls _syncCrowd.
    this.v4CrowdOrderTimer = 0; this.v4OrderVersion = 0; this.v4AgentSequence = 0; this.v4HazardScanTimer = 0;
    this.v4CampGraphics = Array.isArray(this.v4CampGraphics) ? this.v4CampGraphics : [];
    sceneOld.create.call(this);
    this._syncV4CampGraphics();
    if (!this.crisisHudReadout && this.add?.text) {
      this.crisisHudReadout = this.add.text(1020, 107, '', { fontFamily:'monospace', fontSize:'7px', color:'#cdd6ce', lineSpacing:1 }).setScrollFactor(0).setDepth(12002);
    }
    if (this.crisisHudTitle) this.crisisHudTitle.setText('КАМЕРА · ПЛОЩАДЬ РЕСПУБЛИКИ');
    if (this.cameras?.main) { this.cameras.main.stopFollow?.(); this.cameras.main.centerOn(640, 320); this.cameras.main.setZoom(1); }
  };

  P._addPerson = function(index) {
    sceneOld._addPerson.call(this, index);
    const a = this.people[this.people.length - 1]; if (!a) return;
    a.v4Id = ++this.v4AgentSequence; a.districtId = 'center';
    a.x = clamp(640 + rnd(-390,390), 160,1120); a.y = clamp(438 + rnd(-108,88), 310,530);
    a.tx = clamp(a.x + rnd(-100,100), 130,1150); a.ty = clamp(a.y + rnd(-50,50), 300,540);
    a.v4OrderVersion = -1; a.v4EvacuatingUntil = 0; a.v4LastHazardId = null; a.v4ThrowCooldown = rnd(2,11);
    a.sprite.setPosition(a.x,a.y).setDepth(a.y + 3);
  };

  P._syncCrowd = function() {
    sceneOld._syncCrowd.call(this);
    const s = this.sim.state;
    for (let i=0;i<(this.people||[]).length;i++) {
      const a=this.people[i]; a.districtId='center';
    }
    (s.districts||[]).forEach(d=>{ if(d.id!=='center') d.crowd=0; });
    s.districts=[s.districts.find(d=>d.id==='center')||{...CENTER}];s.activeDistrict='center';
    (this.crowdPolice||[]).forEach((officer,i)=>{
      if (!officer.getData('v4PatrolInitialized')) {
        const angle = (i / Math.max(1,this.crowdPolice.length)) * Math.PI * 2;
        const x = clamp(640 + Math.cos(angle)*160 + rnd(-10,10),330,950);
        const y = clamp(425 + Math.sin(angle)*42 + rnd(-8,8),340,512);
        officer.setPosition(x,y).setData('baseX',x).setData('baseY',y).setData('v4PatrolInitialized',true).setData('v4PatrolPhase',angle).setData('v4DetainCooldown',rnd(1,6));
      }
    });
    this._syncV4CampGraphics();
  };

  P._syncV4CampGraphics = function() {
    if (!this.add || !this.sim?.state) return;
    if (!Array.isArray(this.v4CampGraphics)) this.v4CampGraphics = [];
    const camps = this.sim.state.campSites || [];
    while (this.v4CampGraphics.length > camps.length) { this.v4CampGraphics.pop()?.destroy(); }
    while (this.v4CampGraphics.length < camps.length) this.v4CampGraphics.push(this.add.graphics().setDepth(440));
    camps.forEach((camp,i) => {
      const g=this.v4CampGraphics[i]; if(!g) return;
      g.setDepth(camp.y + 3); g.setPosition(0,0); g.clear();
      const burnt=['Выжжен','Разрушен'].includes(camp.condition), burning=['Горит','Тлеет'].includes(camp.condition), damage=camp.integrity<45;
      const count=camp.tentCount||4;
      for(let t=0;t<count;t++) {
        const col=t%3,row=Math.floor(t/3),x=camp.x+(col-1)*19+(row%2?5:0),y=camp.y+row*10;
        const tint=burnt?0x343938:burning?0x34302b:damage?0x756a59:[0xb7a982,0x8b9b91,0x9d9a85][t%3];
        g.fillStyle(0x1e2626,0.5);g.fillEllipse(x+1,y+4,18,5);
        g.fillStyle(tint,0.98);g.fillTriangle(x-9,y+3,x,y-12,x+9,y+3);
        g.lineStyle(1,burnt?0x1d2222:0xd9ceb0,0.7);g.strokeTriangle(x-9,y+3,x,y-12,x+9,y+3);
        g.fillStyle(burning?0x3c3029:burnt?0x242a29:0x566e6e,0.95);g.fillRect(x-1,y-1,3,4);
        if(burning){
          g.lineStyle(1,0x261f1b,.72);g.beginPath().moveTo(x-6,y-3).lineTo(x-2,y+2).lineTo(x+5,y-2).strokePath();
        } else if(burnt) {
          g.lineStyle(1,0x161a19,.8);g.beginPath();g.moveTo(x-6,y-4);g.lineTo(x+5,y+2);g.moveTo(x+2,y-9);g.lineTo(x-4,y+1);g.strokePath();
        }
      }
      if(burning){
        drawCampFlame(g,camp.x,camp.y+5,camp.radius*1.62,camp.radius*.84,this.currentTime,camp.x+i*11,.96);
      }
    });
  };

  P._updateDistrictCamera = function(_deltaMs=0,s=this.sim?.state,immediate=false) {
    if (!s || !this.cameras?.main) return;
    s.activeDistrict='center';
    if (Array.isArray(s.districts)) s.districts.forEach(d=>{ if(d.id!=='center') d.crowd=0; });
    const c=this.cameras.main;
    // Keep the full plaza in frame: no sector hopping or hidden second location.
    if (immediate || Math.abs(c.midPoint?.x - 640) > 10 || Math.abs(c.midPoint?.y - 320) > 10) { c.stopFollow?.(); c.centerOn(640,320); c.setZoom(1); }
    if (this.crisisCameraDistrict !== 'center' && this.crisisHudTitle) this.crisisHudTitle.setText('КАМЕРА · ПЛОЩАДЬ РЕСПУБЛИКИ');
    this.crisisCameraDistrict='center';
  };

  P._renderFixedCrisisHUD = function(s,time) {
    if (!this.crisisHud) return;
    if (!this.crisisHudReadout && this.add?.text) {
      this.crisisHudReadout = this.add.text(1020, 107, '', { fontFamily:'monospace', fontSize:'7px', color:'#cdd6ce', lineSpacing:1 }).setScrollFactor(0).setDepth(12002);
    }
    if (!this.crisisHudReadout) return;
    const g=this.crisisHud;g.clear();
    const x=1010,y=12,w=256,h=116;g.fillStyle(0x172226,.90);g.fillRoundedRect(x,y,w,h,4);g.lineStyle(1,0x9aab9f,.55);g.strokeRoundedRect(x,y,w,h,4);
    const anger=clamp(s.crowdAnger||0,0,1000);const c=anger>800?0xd85e51:anger>580?0xd9a35d:anger>300?0xd8c77b:0x74b1a0;
    g.fillStyle(c,.92);g.fillRect(x+12,y+13,(w-24)*anger/1000,5);g.lineStyle(1,c,.5);g.strokeRect(x+12,y+13,w-24,5);
    const active=(s.incidents||[]).filter(alive).length;
    const camps=(s.campSites||[]);const burning=camps.filter(q=>q.condition==='Горит'||q.condition==='Тлеет').length;
    const pending=(s.injuries||[]).filter(i=>i.status==='awaiting'||i.status==='stabilized').length;
    this.crisisHudReadout.setText([
      `ПЛОЩАДЬ РЕСПУБЛИКИ`,
      `ЯВКА ${Math.round(s.crowdTarget||0)} / ${Math.round(s.cityPopulation||5000)}`,
      `ЗЛОСТЬ ${Math.round(anger)} / 1000 · ${s.protestPhase||'СОБРАНИЕ'}`,
      `ИНЦИДЕНТЫ ${active} · ПОСТРАДАВШИЕ ${pending}`,
      `ЛАГЕРЯ ${(camps.length-burning)} целы · ГОРИТ ${burning}`,
      `ДЕНЬ ${s.day} ${String(s.hour).padStart(2,'0')}:${String(s.minute||0).padStart(2,'0')} · ${s.weather?.label||'погода'}`
    ].join('\n'));
  };

  // Disable the earlier competing position controller; _v4UpdatePoliceAI below is the sole movement authority.
  P._updateAutonomousPolice = function() { /* movement is owned exclusively by _v4UpdatePoliceAI */ };

  P._v4UpdatePoliceAI = function(dt,s) {
    if (!dt || dt <= 0) return;
    const officers=this.crowdPolice||[]; if(!officers.length)return;
    const active=(s.incidents||[]).filter(alive);
    const threat=active.slice().sort((a,b)=>(b.severity||0)-(a.severity||0))[0];
    const assault=active.some(i=>i.type==='building_assault') || (s.building?.siege||0)>25;
    const withdrawing=s.doctrineCode==='withdraw';
    officers.forEach((officer,i)=>{
      const phase=(officer.getData('v4PatrolPhase')||0) + this.currentTime*0.00012;
      const angle=phase + i*0.08;
      let tx=640+Math.cos(angle)*205, ty=430+Math.sin(angle)*58;
      if (withdrawing) { tx=i%2===0?275+(i%5)*15:1000-(i%5)*15; ty=420+Math.floor(i/5)*20; }
      else if (assault) { const a=(i/Math.max(1,officers.length))*Math.PI*2 + this.currentTime*0.00007; tx=640+Math.cos(a)*72; ty=315+Math.abs(Math.sin(a))*58; }
      else if (threat && ['riot','clash','arson','fire','looting','radical_attack','special_vehicle_attack','traffic_crash'].includes(threat.type)) {
        const a=(i/Math.max(1,officers.length))*Math.PI*2 + this.currentTime*0.00008;
        const r=33+(i%4)*9;tx=clamp((threat.x||640)+Math.cos(a)*r,245,1035);ty=clamp((threat.y||430)+Math.sin(a)*r,292,612);
      } else if(s.doctrineCode==='protect') { tx=545+(i%7)*27; ty=330+Math.floor(i/7)*18; }
      else if(s.doctrineCode==='contain'||s.doctrineCode==='disperse'||s.doctrineCode==='cordon') {
        const span=s.doctrineCode==='disperse'?150:230;tx=640+Math.cos(angle)*span;ty=400+Math.sin(angle)*76;
      }
      const dx=tx-officer.x,dy=ty-officer.y,dist=Math.hypot(dx,dy)||1;
      const speed=(s.policeFatigue>78?17:s.doctrineCode==='withdraw'?62:s.doctrineCode==='disperse'?49:35);
      const step=Math.min(dist,speed*dt);officer.x+=dx/dist*step;officer.y+=dy/dist*step;
      // Keep every officer within the square and away from impossible off-screen targets.
      officer.x=clamp(officer.x,220,1060);officer.y=clamp(officer.y,292,620);
      officer.setPosition(officer.x,officer.y).setDepth(officer.y+7);
      officer.setData('aiTarget',{x:tx,y:ty});
      if(s.doctrineCode==='withdraw')officer.setTint(0x9a9d96);else if(s.doctrineCode==='disperse')officer.setTint(0xdba28a);else if(s.doctrineCode==='protect')officer.setTint(0xd1c49b);else officer.clearTint();
      // AI may isolate a specific hostile agent; no player command is involved.
      const dcd=Math.max(0,(officer.getData('v4DetainCooldown')||0)-dt);officer.setData('v4DetainCooldown',dcd);
      if(dcd<=0 && s.doctrineCode==='contain' && (s.crowdAnger||0)>460 && Math.random()<dt*0.018){
        const target=(this.people||[]).filter(a=>a.protester&&!a.detained&&['radical','casseur','looter','arsonist','provocateur','agitator'].includes(a.behavior)).sort((a,b)=>Math.hypot(a.x-officer.x,a.y-officer.y)-Math.hypot(b.x-officer.x,b.y-officer.y))[0];
        if(target&&Math.hypot(target.x-officer.x,target.y-officer.y)<38){target.detained=true;target.detainedUntil=this.currentTime+9000;target.behavior='detained';target.tx=target.x;target.ty=target.y;target.speed=0;target.sprite.setTint(0xd5b46a);s.arrests=(s.arrests||0)+1;officer.setData('v4DetainCooldown',rnd(8,15));this.sim._radio('Полиция','Автономный патруль',`Задержан конкретный участник с ролью «${target.role||target.behavior}». Остальная группа продолжает движение.`, 'warning','police');}
      }
    });
  };

  P._v4CoordinateCrowd = function(dt,s) {
    const now=this.currentTime||0;this.v4CrowdOrderTimer=Math.max(0,(this.v4CrowdOrderTimer||0)-dt*1000);
    if(this.v4CrowdOrderTimer<=0){
      const anger=clamp(s.crowdAnger||0,0,1000);const plan=s.crowdOrder||{phase:'gather'};
      plan.phase=anger<220?'gather':anger<420?'march':anger<620?'pressure':anger<810?'clashes':'siege';
      plan.targetX=640;plan.targetY=anger<220?418:anger<420?389:anger<620?350:anger<810?330:309;
      plan.version=(plan.version||0)+1;plan.nextAt=now+rnd(2200,4400);s.crowdOrder=plan;
      this.v4CrowdOrderTimer=plan.nextAt-now;this.v4OrderVersion=plan.version;
    }
    const anger=clamp(s.crowdAnger||0,0,1000);
    for(let i=0;i<(this.people||[]).length;i++){
      const a=this.people[i];if(!a||!a.sprite||a.detained)continue;
      const hazards=[];
      for(const z of s.gasZones||[]) if((z.life||0)>0) hazards.push({id:z.id,x:z.x,y:z.y,r:(z.radius||85)*(z.kind==='water'?.68:1),kind:z.kind||'gas'});
      for(const z of s.fireZones||[]) if(z.condition!=='Выжжен') hazards.push({id:z.id,x:z.x,y:z.y,r:(z.radius||18)+14,kind:'fire'});
      for(const z of s.smokeZones||[]) if((z.life||0)>0 && z.kind==='fire') hazards.push({id:z.id,x:z.x,y:z.y,r:Math.min(120,(z.radius||40)*0.65),kind:'smoke'});
      let near=null,nd=Infinity;
      for(const h of hazards){const d=Math.hypot(a.x-h.x,a.y-h.y);if(d<h.r+18&&d<nd){near=h;nd=d;}}
      if(near){
        if(a.v4LastHazardId!==near.id||a.v4EvacuatingUntil<now||(a.v4RetargetAt||0)<now){
          const dx=a.x-near.x,dy=a.y-near.y,n=Math.hypot(dx,dy)||1;
          a.tx=clamp(a.x+dx/n*rnd(100,180)+(a.x<640?-25:25),90,1190);
          a.ty=clamp(a.y+dy/n*rnd(65,115)+rnd(-22,22),290,620);
          a.speed=rnd(68,106);a.behavior='flee';a.timer=rnd(1.2,2.8);a.v4EvacuatingUntil=now+rnd(1800,3400);a.v4LastHazardId=near.id;a.v4RetargetAt=now+420;
          a.sprite.setAlpha(.92);
        }
      } else if(a.v4EvacuatingUntil>now){
        a.behavior='flee';
      } else if(a.v4LastHazardId){
        a.v4LastHazardId=null;
        if(a.protester){a.behavior=anger>650?'marcher':anger>400?'organizer':'peaceful';a.speed=rnd(23,47);}
        else {a.behavior=a.type==='supporter'?'support':'peaceful';a.speed=rnd(22,40);}
        a.timer=0.5;
      }
      // Synchronized crowd waves with spread-out slots; agents do not independently wander at random.
      if(!near && a.v4EvacuatingUntil<=now && a.v4OrderVersion!==this.v4OrderVersion){
        const phase=s.crowdOrder?.phase||'gather';const slot=i;
        if(phase==='gather'){
          a.v4SlotX=clamp(640+Math.cos(slot*2.399)*rnd(100,340),210,1070);a.v4SlotY=clamp(425+Math.sin(slot*2.399)*rnd(25,80),335,530);
        } else if(phase==='march'){
          a.v4SlotX=clamp(640+Math.cos(slot*2.399)*rnd(90,315),220,1060);a.v4SlotY=clamp(390+Math.sin(slot*1.7)*rnd(18,55),330,500);
        } else if(phase==='pressure'){
          a.v4SlotX=clamp(640+Math.cos(slot*2.399)*rnd(48,235),370,910);a.v4SlotY=clamp(350+Math.sin(slot*1.7)*rnd(10,48),305,438);
        } else if(phase==='clashes'){
          if(a.protester&&Math.random()<0.16){a.v4SlotX=clamp(a.x+(a.x<640?-1:1)*rnd(90,200),100,1180);a.v4SlotY=clamp(a.y+rnd(-70,80),300,600);}
          else {a.v4SlotX=clamp(640+Math.cos(slot*2.399)*rnd(55,245),330,950);a.v4SlotY=clamp(335+Math.sin(slot*1.7)*rnd(12,68),300,460);}
        } else {
          if(a.protester&&Math.random()<0.23){a.v4SlotX=clamp(a.x+(a.x<640?-1:1)*rnd(110,225),75,1200);a.v4SlotY=clamp(a.y+rnd(-65,110),285,610);}
          else {a.v4SlotX=clamp(640+Math.cos(slot*2.399)*rnd(45,185),395,885);a.v4SlotY=clamp(314+Math.sin(slot*1.7)*rnd(7,46),292,400);}
        }
        a.tx=a.v4SlotX;a.ty=a.v4SlotY;a.timer=rnd(1.2,2.8);a.v4OrderVersion=this.v4OrderVersion;
        if(phase==='clashes'||phase==='siege'){
          if(a.protester&&a.type==='agitator'&&a.interactionCooldown<=0){a.behavior=phase==='siege'&&Math.random()<0.38?'arsonist':Math.random()<0.4?'radical':'agitator';a.interactionCooldown=rnd(4,12);}
          else if(a.protester&&a.behavior==='peaceful'&&Math.random()<0.12)a.behavior='organizer';
        }
      }
      // Low-rate abstract projectiles and object damage make the high-anger phases physically legible.
      a.v4ThrowCooldown=Math.max(0,(a.v4ThrowCooldown||0)-dt);
      if(anger>560&&a.protester&&['agitator','radical','arsonist','casseur','provocateur'].includes(a.behavior)&&a.v4ThrowCooldown<=0&&Math.random()<dt*(anger>820?.24:.105)){
        this._launchCrowdProjectile(a);a.v4ThrowCooldown=rnd(6,15);
      }
    }
  };

  P._updatePeople = function(dt,s) {
    sceneOld._updatePeople.call(this,dt,s);
    this._v4UpdatePoliceAI(dt,s);
    this._v4CoordinateCrowd(dt,s);
  };

  P._launchCrowdProjectile = function(agent) {
    sceneOld._launchCrowdProjectile.call(this,agent);
    const p=(this.projectiles||[])[this.projectiles.length-1];if(!p)return;
    const anger=Number(this.sim.state.crowdAnger||0);
    if(p.kind==='firebrand' && anger>600){
      const camp=(this.sim.state.campSites||[]).filter(c=>!['Горит','Тлеет','Выжжен'].includes(c.condition)).sort((a,b)=>Math.hypot(a.x-agent.x,a.y-agent.y)-Math.hypot(b.x-agent.x,b.y-agent.y))[0];
      if(camp&&Math.random()<(anger>820?.48:.22)){p.targetX=camp.x+rnd(-10,10);p.targetY=camp.y+rnd(-5,8);p.targetCampId=camp.id;}
      else if(anger>820&&Math.random()<.18){p.targetX=640+rnd(-28,28);p.targetY=232+rnd(-5,12);p.targetBuilding=true;}
    }
  };

  P._updateProjectiles = function(dt,s) {
    const landed=(this.projectiles||[]).filter(p=>!p.landed&&p.elapsed+dt>=p.duration).map(p=>({...p}));
    sceneOld._updateProjectiles.call(this,dt,s);
    for(const p of landed){
      if(p.kind==='petard'){
        s.gasZones=s.gasZones||[];s.gasZones.unshift({id:`PANIC-${s.day}-${Math.round(this.currentTime)}-${irnd(10,99)}`,x:p.targetX,y:p.targetY,radius:72,life:1.8,intensity:1,kind:'petard',source:'protest'});
      }
      if(p.kind==='firebrand' && !s.paused){
        if(p.targetCampId){const camp=(s.campSites||[]).find(c=>c.id===p.targetCampId);if(camp)this.sim._igniteCamp(camp,'попадание абстрактного зажигательного токена');}
        else if(p.targetBuilding){s.building.integrity=clamp((s.building.integrity||100)-rnd(5,13));s.building.status=s.building.integrity<25?'Разрушено':'Повреждено';const asset=(s.assets||[]).find(a=>a.kind==='building');if(asset){asset.integrity=clamp(asset.integrity-rnd(6,18));asset.condition=asset.integrity<20?'Разрушен':'Горит';}if(s.incidents.filter(alive).length<this.sim.config.maxIncidents){const fire=this.sim.addIncident('arson');if(fire){fire.x=640+rnd(-30,30);fire.y=232+rnd(-2,16);fire.districtId='center';fire.locationType='площадь';}}}
        else if(Math.random()<(Number(s.crowdAnger||0)>800?.68:.42)){
          const activeFire=(s.incidents||[]).find(i=>alive(i)&&['fire','arson'].includes(i.type)&&Math.hypot(i.x-p.targetX,i.y-p.targetY)<75);
          if(!activeFire&&s.campSites?.some(c=>Math.hypot(c.x-p.targetX,c.y-p.targetY)<48)){
            const camp=s.campSites.slice().sort((a,b)=>Math.hypot(a.x-p.targetX,a.y-p.targetY)-Math.hypot(b.x-p.targetX,b.y-p.targetY))[0];this.sim._igniteCamp(camp,'попадание абстрактного зажигательного токена');
          }else if(!activeFire&&s.incidents.filter(alive).length<this.sim.config.maxIncidents){
            const inc=this.sim.addIncident('arson');if(inc){inc.x=clamp(p.targetX,270,1010);inc.y=clamp(p.targetY,295,620);inc.districtId='center';inc.locationType='площадь';}
          }
        }
      }
    }
  };

  P._renderEnvironment = function(s,time) {
    sceneOld._renderEnvironment.call(this,s,time);
    this._syncV4CampGraphics();
    // Persistent tents/fire rings sit above the ground and below the crowd; smoke and flame are animated.
    if(this.fx){
      for(const camp of s.campSites||[]){
        if(camp.condition==='Горит'||camp.condition==='Тлеет'){
          const r=camp.radius||30;
          this.fx.fillStyle(0x282e2d,.18);this.fx.fillEllipse(camp.x,camp.y-23,r*2.2,r*1.35);
          for(let j=0;j<5;j++){const dx=Math.sin(time*.003+j*1.8+camp.x)*r*.45;const rise=(time*.013+j*13)%(r+34);this.fx.fillStyle(j%2?0x525a56:0x353b39,Math.max(.02,.15-rise/(r+34)*.12));this.fx.fillCircle(camp.x+dx,camp.y-rise-14,5+rise*.22);}
          drawCampFlame(this.fx,camp.x,camp.y+6,r*1.72,r*.92,time,camp.x,.9);

        } else if(camp.condition==='Выжжен'){
          this.fx.fillStyle(0x2c302f,.32);this.fx.fillEllipse(camp.x,camp.y,camp.radius*1.2,camp.radius*.5);
        }
      }
    }
  };

  P.update = function(time,deltaMs) {
    this._updateDistrictCamera(deltaMs,this.sim&&this.sim.state,false);
    sceneOld.update.call(this,time,deltaMs);
    this._updateCrisisActionVisuals?.();
    this._renderFixedCrisisHUD?.(this.sim.state,time);
    this.vehicleAlertTimer=(this.vehicleAlertTimer||0)+(deltaMs||0);
    if(this.vehicleAlertTimer>700){this.vehicleAlertTimer=0;window.dashboardUI?.renderCrisisMonitor?.();}
  };

  // UI: remove player-issued police tactics, keep live doctrine read-only, show explicit injury/death ledger and anger 0–1000.
  const UP = UI.prototype;
  const uiOld = {};
  ['_bind','updateStats','renderCrisisMonitor','renderDistricts','saveGame','loadGame'].forEach(k=>uiOld[k]=UP[k]);
  UP._bind = function() {
    uiOld._bind.call(this);
    document.querySelectorAll('[data-crisis-action^="force-"], [data-crisis-action^="police-"]').forEach(b=>{b.disabled=true;b.setAttribute('aria-disabled','true');});
    document.querySelectorAll('[data-action="police"], [data-district-action]').forEach(b=>{b.hidden=true;});
    const cap=document.getElementById('force-cap');if(cap){cap.disabled=true;cap.value='1';}
    const doctrine=document.getElementById('doctrine-select');if(doctrine)doctrine.disabled=true;
    const districtList=document.getElementById('district-list');if(districtList)districtList.replaceChildren();
  };
  UP.updateStats = function() {
    uiOld.updateStats.call(this);
    const footer=document.querySelector('.app-footer span');if(footer)footer.textContent='КОНТУР // ВЕРСИЯ 4.0.0';
    const s=this.sim.state;const $=id=>document.getElementById(id);
    const anger=Math.round(clamp(s.crowdAnger||0,0,1000));
    if($('crowd-anger-value'))$('crowd-anger-value').textContent=`${anger} / 1000`;
    if($('crowd-anger-bar'))$('crowd-anger-bar').style.width=`${anger/10}%`;
    if($('crowd-anger-bar'))$('crowd-anger-bar').style.background=anger>800?'#d75f53':anger>580?'#d8a05d':anger>300?'#c6b16e':'#65a596';
    const ledger=s.casualtyLedger||{};
    if($('casualty-total-injured'))$('casualty-total-injured').textContent=String(ledger.injured??s.injuredTotal??0);
    if($('casualty-total-deaths'))$('casualty-total-deaths').textContent=String(s.deaths||ledger.deaths||0);
    if($('camp-status-value')){
      const camps=s.campSites||[];const burn=camps.filter(c=>c.condition==='Горит'||c.condition==='Тлеет').length;const intact=camps.filter(c=>c.condition==='Цел'||c.condition==='Повреждён').length;
      $('camp-status-value').textContent=`${intact} целы · ${burn} горят · ${s.campsBurned||0} выгорели`;
    }
    if($('world-subtitle'))$('world-subtitle').textContent=s.protestPhase||'Площадь Республики';
    if($('scene-caption'))$('scene-caption').textContent=anger>820?'Критическая эскалация · организованные волны толпы · ИИ служб продолжает реагировать':anger>600?'Столкновения и панические волны · люди покидают зоны огня, дыма и спецсредств':anger>300?'Коллективное давление на периметр · полиция действует автономно':'Мирное собрание · группы согласуют требования на площади';
  };
  UP.renderCrisisMonitor = function() {
    uiOld.renderCrisisMonitor.call(this);
    const s=this.sim.state;const summary=document.getElementById('crisis-summary');if(!summary)return;
    // Insert an explicit all-time count, separate from active cases awaiting treatment.
    const ledger=s.casualtyLedger||{};
    const make=(label,value,detail,cls='')=>{const el=document.createElement('div');el.className=`crisis-stat ${cls}`;const l=document.createElement('span');l.textContent=label;const v=document.createElement('strong');v.textContent=String(value);const d=document.createElement('small');d.textContent=detail;el.append(l,v,d);return el;};
    summary.prepend(make('ЗЛОСТЬ ТОЛПЫ',`${Math.round(s.crowdAnger||0)} / 1000`,'от спокойствия до критической эскалации',(s.crowdAnger||0)>800?'danger':''));
    summary.prepend(make('ТРАВМЫ ЗА ВСЮ ИСТОРИЮ',ledger.injured??s.injuredTotal??0,'пострадавшие, включая выбывших из активного списка','warn'));
    summary.prepend(make('ПОГИБШИЕ ЗА ВСЮ ИСТОРИЮ',s.deaths||ledger.deaths||0,'смертельные случаи учитываются отдельно',(s.deaths||0)?'danger':''));
    summary.prepend(make('ПАЛАТОЧНЫЕ ЛАГЕРЯ',(s.campSites||[]).filter(c=>c.condition==='Горит'||c.condition==='Тлеет').length,'активные очаги лагерей', (s.campSites||[]).some(c=>c.condition==='Горит'||c.condition==='Тлеет')?'danger':''));
    // Exactly one location in the user-facing monitor.
    const district=document.getElementById('district-list');if(district){district.innerHTML='';const d=(s.districts||[]).find(x=>x.id==='center')||CENTER;const row=document.createElement('div');row.className='district-row district-active';const copy=document.createElement('div');copy.className='district-copy';const name=document.createElement('strong');name.textContent='Площадь Республики';const detail=document.createElement('small');detail.textContent=`явка ${Math.round(s.crowdTarget||0)} · открытые инциденты ${(s.incidents||[]).filter(alive).length} · палаточные лагеря ${(s.campSites||[]).length}`;copy.append(name,detail);const meters=document.createElement('div');meters.className='district-meters';const line=document.createElement('div');line.className='district-meter';const fill=document.createElement('i');fill.style.width=`${clamp(d.tension||s.tension)}%`;line.append(fill);const block=document.createElement('span');block.textContent=`${Math.round((s.roadBlockage||0)*100)}%`;meters.append(line,block);row.append(copy,meters);district.append(row);}
  };
  UP.renderDistricts = function() { this.renderCrisisMonitor?.(); };

  UP.saveGame = function(automatic=false) {
    try {
      localStorage.setItem('kontur-republic-save-v4',JSON.stringify(this.sim.snapshot()));
      const label=document.getElementById('last-save-label');if(label)label.textContent=`СОХРАНЕНО v4 ${new Date().toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}`;
      if(!automatic)this.toast('Игра сохранена','Сохранены политическая история, учёт пострадавших, состояние лагерей и шкала злости толпы.','success');
      return true;
    } catch(err) { if(!automatic)this.toast('Не удалось сохранить',`Браузер не разрешил запись: ${err.message}`,'error');return false; }
  };
  UP.loadGame = function() {
    try {
      const raw=localStorage.getItem('kontur-republic-save-v4')||localStorage.getItem('kontur-republic-save-v3')||localStorage.getItem('kontur-republic-save-v2');
      if(!raw){this.toast('Сохранение не найдено','Сначала сохраните игру.','warning');return false;}
      const snap=JSON.parse(raw);this.sim.loadSnapshot(snap);this.draft={...this.sim.state.policies};this._syncPolicyInputs();this.renderAll(true);
      const label=document.getElementById('last-save-label');if(label)label.textContent=`ЗАГРУЖЕНО И АДАПТИРОВАНО К v4`;
      this.toast('Сохранение загружено','Состояние перенесено в модель одной площади.','success');return true;
    } catch(err){this.toast('Ошибка загрузки',`Не удалось прочитать сохранение: ${err.message}`,'error');return false;}
  };

  // In the visible UI this panel is strictly informational; no button or slider may issue an order.
  document.addEventListener('DOMContentLoaded', () => {
    const panel=document.querySelector('.police-command-panel');
    if(panel){panel.innerHTML=`<div class="panel-heading"><div><span class="section-index">03А / АВТОНОМНАЯ СЛУЖБА</span><h2>Командование полиции · ИИ</h2></div><span class="data-chip">БЕЗ РУЧНЫХ ПРИКАЗОВ</span></div><p class="panel-intro">Командование самостоятельно оценивает события каждый модельный час, меняет доктрину, направляет патрули, организует кордоны и может отступить. Применение силы — внутреннее решение ИИ, а не настройка игрока.</p><div class="police-ai-status"><span>Доктрина <strong id="police-doctrine-label">Наблюдение</strong></span><span>Мораль <strong id="police-morale-value">72%</strong></span><span>Усталость <strong id="police-fatigue-value">12%</strong></span></div>`;}
    const section=document.querySelector('.districts-panel');if(section){const title=section.querySelector('h2');if(title)title.textContent='Единая локация · площадь';const chip=section.querySelector('.data-chip');if(chip)chip.textContent='1 ЛОКАЦИЯ';const intro=section.querySelector('.panel-intro');if(intro)intro.textContent='Вся видимая симуляция происходит на площади Республики: толпа, здание правительства, палаточные лагеря, полиция, транспорт, пожары и медицинские вызовы.';}
  }, {once:true});

  // Save namespace is versioned independently from the earlier release; old saves remain available for import.
  if (window.GAME_CONFIG) window.GAME_CONFIG.version='4.0.0';
})();
