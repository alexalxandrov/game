'use strict';
/* KONTUR v6 — coordinated crowds, hardline autonomous police, localized gas reactions and street-clash effects.
   Force, projectile and injury outcomes are abstract game mechanics; no real-world tactical detail is modeled. */
(function installKonturV6() {
  const Sim = window.RepublicSimulation;
  const Scene = window.RepublicCityScene;
  const UI = window.RepublicDashboardUI;
  if (!Sim || !Scene || !UI) return;

  const clamp = (v, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, Number(v) || 0));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const choose = list => list[Math.floor(Math.random() * list.length)];
  const alive = x => x && x.status !== 'resolved';
  const SP = Sim.prototype, P = Scene.prototype, UP = UI.prototype;
  const simOld = {}, sceneOld = {}, uiOld = {};
  ['_initCrisisState','_updateCrowdDynamics','_updatePoliceDoctrine','commandPolice','reset','loadSnapshot'].forEach(k => simOld[k] = SP[k]);
  ['create','_pickPersonType','_v4CoordinateCrowd','_updateCrisisActionVisuals','_updateProjectiles','_renderEnvironment','update'].forEach(k => sceneOld[k] = P[k]);
  ['updateStats','saveGame','loadGame'].forEach(k => uiOld[k] = UP[k]);

  if (window.GAME_CONFIG) {
    window.GAME_CONFIG.version = '6.0.0';
    window.GAME_CONFIG.minutesPerTick = 1;
  }

  // Fresh games begin with a hardline policing profile. Legacy saves keep their history and current crowd anger.
  SP._initCrisisState = function(migrating = false) {
    if (simOld._initCrisisState) simOld._initCrisisState.call(this, migrating);
    const s = this.state;
    if (!s) return;
    if (!s.v6Initialized) {
      s.v6Initialized = true;
      s.v6PoliceProfile = 'Жёсткий автономный режим';
      s.v6PoliceAggression = 78;
      s.v6Organization = clamp(24 + (Number(s.crowdAnger || 0) / 1000) * 24, 0, 100);
      s.v6Radicalization = clamp((Number(s.crowdAnger || 0) / 1000) * 18, 0, 100);
      s.v6LastProcessedPoliceSeq = Number(s.policeActionSeq || 0);
      s.v6LastForceMethod = null;
      s.v6LastForceAt = -999;
      s.v6TacticalActionCount = 0;
      s.forceCap = 7;
      s.policeTools = Object.assign({ gas: 18, water: 12, flash: 10, rubber: 24, live: 4 }, s.policeTools || {});
      if (!migrating) s.crowdAnger = Math.max(280, clamp(s.crowdAnger || 0, 0, 1000));
    } else {
      s.v6PoliceAggression = clamp(s.v6PoliceAggression ?? 78, 0, 100);
      s.v6Organization = clamp(s.v6Organization ?? 24, 0, 100);
      s.v6Radicalization = clamp(s.v6Radicalization ?? 0, 0, 100);
      s.v6LastProcessedPoliceSeq = Number(s.v6LastProcessedPoliceSeq ?? s.policeActionSeq ?? 0);
      s.v6TacticalActionCount = Number(s.v6TacticalActionCount || 0);
    }
  };

  // A use-of-force event propagates through trust, anger and movement organization. Autonomous command has no soft-policy ceiling.
  SP.commandPolice = function(method, autonomous = false) {
    const s = this.state;
    if (autonomous && s) {
      const anger = clamp(s.crowdAnger || 0, 0, 1000);
      const hardlineFloor = anger > 840 ? 7 : anger > 580 ? 6 : anger > 300 ? 5 : 4;
      s.forceCap = Math.max(Number(s.forceCap || 0), hardlineFloor);
    }
    const beforeSeq = Number(s?.policeActionSeq || 0);
    const ok = simOld.commandPolice ? simOld.commandPolice.call(this, method, autonomous) : false;
    if (!ok || !s) return ok;
    if (['gas','water','flash','physical','rubber','live'].includes(method)) {
      const backlash = { gas:26, water:34, flash:38, physical:47, rubber:66, live:135 }[method] || 0;
      s.crowdAnger = clamp((s.crowdAnger || 0) + backlash, 0, 1000);
      s.v6Radicalization = clamp((s.v6Radicalization || 0) + backlash * 0.095, 0, 100);
      s.v6Organization = clamp((s.v6Organization || 0) + 2.2 + backlash * 0.035, 0, 100);
      s.publicSupportProtest = clamp((s.publicSupportProtest || 44) + (method === 'live' ? 9 : method === 'rubber' ? 6 : 3.2), 0, 100);
      s.trust = clamp((s.trust || 0) - (method === 'live' ? 5.5 : method === 'rubber' ? 3 : 1.1), 0, 100);
      s.tension = clamp((s.tension || 0) + (method === 'live' ? 12 : method === 'rubber' ? 7 : 3.5), 0, 100);
      s.v6LastForceMethod = method;
      s.v6LastForceAt = Number(s.hoursElapsed || 0);
      s.v6LastProcessedPoliceSeq = Number(s.policeActionSeq || beforeSeq);
      // Tag the newest zone so the render and crowd AI distinguish police gas from protest smoke.
      const zone = (s.gasZones || []).find(z => String(z.id || '').startsWith('GAS-') || String(z.id || '').startsWith('WATER-') || String(z.id || '').startsWith('FLASH-'));
      if (zone && (!zone.kind || zone.source === 'police')) {
        zone.kind = method === 'gas' ? 'gas' : method === 'water' ? 'water' : 'flash';
        zone.source = 'police';
      }
    }
    if (autonomous) {
      s.v6TacticalActionCount = (s.v6TacticalActionCount || 0) + 1;
      const world = window.worldScene;
      if (world) world.v6LastActionRealMs = Number(world.currentTime || 0);
    }
    return ok;
  };

  // Faster event-driven backlash: a single force event can push the movement into a new phase immediately.
  SP._updateCrowdDynamics = function() {
    if (simOld._updateCrowdDynamics) simOld._updateCrowdDynamics.call(this);
    const s = this.state; if (!s) return;
    const seq = Number(s.policeActionSeq || 0);
    const last = s.lastPoliceAction;
    if (last && seq > Number(s.v6LastProcessedPoliceSeq || 0) && ['gas','water','flash','physical','rubber','live'].includes(last.method)) {
      const boost = { gas:12, water:17, flash:18, physical:22, rubber:34, live:72 }[last.method] || 0;
      s.crowdAnger = clamp((s.crowdAnger || 0) + boost, 0, 1000);
      s.v6Radicalization = clamp((s.v6Radicalization || 0) + boost * 0.12, 0, 100);
      s.v6Organization = clamp((s.v6Organization || 0) + 1.8, 0, 100);
      s.v6LastProcessedPoliceSeq = seq;
    }
    const anger = clamp(s.crowdAnger || 0, 0, 1000);
    const hot = (s.incidents || []).filter(alive).filter(i => ['riot','clash','building_assault','radical_attack','arson','fire','looting'].includes(i.type)).length;
    const forceRecent = Number(s.hoursElapsed || 0) - Number(s.v6LastForceAt ?? -999) < 2.5;
    s.v6Organization = clamp((s.v6Organization || 0) + 0.45 + anger / 330 + Math.min(4, hot * 0.7) + (forceRecent ? 1.8 : 0), 0, 100);
    s.v6Radicalization = clamp((s.v6Radicalization || 0) + Math.max(0, anger - 230) / 520 + Math.min(3.2, hot * 0.55) + (forceRecent ? 2.4 : 0) - (anger < 200 ? 0.8 : 0), 0, 100);
    // The crowd gradually shares orders and changes repertoire; phases are not locked to a single random event.
    if (anger < 220) s.v6CrowdPhase = 'собрание';
    else if (anger < 420) s.v6CrowdPhase = 'организованный марш';
    else if (anger < 620) s.v6CrowdPhase = 'давление на кордон';
    else if (anger < 820) s.v6CrowdPhase = 'уличные столкновения';
    else s.v6CrowdPhase = 'массовый штурм';
  };

  // Maintain the existing doctrine model, but ensure it cannot silently demote the autonomous force ceiling.
  SP._updatePoliceDoctrine = function(eventDriven = false) {
    const s = this.state;
    const before = Number(s?.policeActionSeq || 0);
    const result = simOld._updatePoliceDoctrine ? simOld._updatePoliceDoctrine.call(this, eventDriven) : undefined;
    if (s) {
      const anger = clamp(s.crowdAnger || 0, 0, 1000);
      s.forceCap = Math.max(Number(s.forceCap || 0), anger > 840 ? 7 : anger > 580 ? 6 : anger > 300 ? 5 : 4);
      if (Number(s.policeActionSeq || 0) > before) {
        s.v6LastPoliceDoctrineActionAt = Number(s.hoursElapsed || 0);
      }
    }
    return result;
  };

  // New agents are more likely to organize or radicalize when force and grievance rise.
  P._pickPersonType = function() {
    const picked = sceneOld._pickPersonType ? sceneOld._pickPersonType.call(this) : {};
    const s = this.sim?.state || {};
    if (!picked.protester) return picked;
    const anger = clamp(s.crowdAnger || 0, 0, 1000);
    const radical = clamp((Number(s.v6Radicalization || 0) * 0.55 + anger / 1000 * 54 + Number(s.v6Organization || 0) * 0.18), 0, 100);
    const roll = Math.random() * 100;
    if (anger >= 285 && roll < 8 + radical * 0.16) {
      picked.behavior = 'organizer'; picked.role = 'organizer'; picked.sign = picked.sign || 'КООРДИНАЦИЯ';
    }
    if (anger >= 430 && roll < 4 + radical * 0.34) {
      picked.behavior = Math.random() < 0.5 ? 'agitator' : 'casseur'; picked.role = picked.behavior; picked.type = 'agitator'; picked.sign = picked.behavior === 'casseur' ? 'ФРОНТ' : 'ОТВЕТ';
    }
    if (anger >= 610 && roll < 3 + radical * 0.43) {
      picked.behavior = Math.random() < 0.55 ? 'radical' : 'provocateur'; picked.role = picked.behavior; picked.type = 'agitator'; picked.sign = 'РАДИКАЛЫ';
    }
    if (anger >= 760 && roll < 2 + radical * 0.27) {
      picked.behavior = Math.random() < 0.42 ? 'arsonist' : 'volatile'; picked.role = picked.behavior; picked.type = 'agitator'; picked.sign = 'ПРЯМОЕ ДЕЙСТВИЕ';
    }
    picked.v6GroupId = picked.groupId || 'общая координация';
    picked.v6Radicality = radical;
    return picked;
  };

  // Coordination system: the crowd advances in shared phases, then individual members fill distinct slots.
  // Police gas is removed from the legacy evacuation pass; it gets a localized, graded resistance response below.
  P._v4CoordinateCrowd = function(dt, s) {
    const actualZones = s?.gasZones;
    if (s && Array.isArray(actualZones)) s.gasZones = actualZones.filter(z => !(z && z.source === 'police' && (z.kind === 'gas' || String(z.id || '').startsWith('GAS-'))));
    try { if (sceneOld._v4CoordinateCrowd) sceneOld._v4CoordinateCrowd.call(this, dt, s); }
    finally { if (s && actualZones) s.gasZones = actualZones; }
    if (!s || !dt) return;
    const now = Number(this.currentTime || 0);
    const anger = clamp(s.crowdAnger || 0, 0, 1000);
    const phase = anger < 220 ? 'gather' : anger < 420 ? 'march' : anger < 620 ? 'pressure' : anger < 820 ? 'clashes' : 'siege';
    this.v6CrowdCoordPulse = (this.v6CrowdCoordPulse || 0) - dt * 1000;
    if (this.v6CrowdCoordPulse <= 0) {
      this.v6CrowdCoordPulse = rnd(950, 1800);
      this.v6OrderVersion = (this.v6OrderVersion || 0) + 1;
      s.v6CrowdOrderVersion = this.v6OrderVersion;
    }
    const police = this.crowdPolice || [];
    const phaseTargetY = phase === 'gather' ? 424 : phase === 'march' ? 397 : phase === 'pressure' ? 365 : phase === 'clashes' ? 388 : 321;
    for (let i = 0; i < (this.people || []).length; i++) {
      const a = this.people[i];
      if (!a || !a.sprite?.active || !a.protester || a.detained) continue;
      if (Number(a.v5BurningUntil || 0) > now || Number(a.v6GasEvacuatingUntil || 0) > now) continue;

      // Role changes occur in waves, not only when a new sprite is spawned.
      if (now >= Number(a.v6RoleChangeAt || 0)) {
        a.v6RoleChangeAt = now + rnd(1600, 3900);
        const role = a.role || a.behavior || 'peaceful';
        const base = clamp((anger - 210) / 760, 0, 1) * 0.7 + clamp(s.v6Radicalization || 0) / 100 * 0.35;
        const forceRecent = Number(s.hoursElapsed || 0) - Number(s.v6LastForceAt ?? -999) < 3;
        const p = clamp(base + (forceRecent ? 0.20 : 0), 0, 0.88);
        if (anger >= 285 && ['peaceful','marcher','chant','occupy','blocker','organizer'].includes(role) && Math.random() < p * 0.46) {
          a.behavior = 'organizer'; a.role = 'organizer'; a.v6RoleStage = Math.max(a.v6RoleStage || 0, 1);
        }
        if (anger >= 420 && ['peaceful','marcher','chant','occupy','blocker','organizer'].includes(a.role || a.behavior) && Math.random() < p * 0.52) {
          a.behavior = 'agitator'; a.role = 'agitator'; a.type = 'agitator'; a.v6RoleStage = Math.max(a.v6RoleStage || 0, 2);
          a.sprite.setTint?.(0xd6b49b);
        }
        if (anger >= 590 && ['agitator','organizer','provocateur'].includes(a.role || a.behavior) && Math.random() < p * 0.54) {
          a.behavior = Math.random() < 0.46 ? 'radical' : 'casseur'; a.role = a.behavior; a.type = 'agitator'; a.v6RoleStage = Math.max(a.v6RoleStage || 0, 3);
          a.sprite.setTint?.(a.behavior === 'radical' ? 0xc87e76 : 0x9e7770);
        }
        if (anger >= 760 && ['radical','casseur','agitator','provocateur','volatile'].includes(a.role || a.behavior) && Math.random() < p * 0.30) {
          a.behavior = Math.random() < 0.45 ? 'arsonist' : 'volatile'; a.role = a.behavior; a.v6RoleStage = 4;
        }
      }

      const aggressive = ['agitator','radical','casseur','arsonist','volatile','provocateur','looter'].includes(a.behavior);
      if (now >= Number(a.v6NextOrderAt || 0)) {
        a.v6NextOrderAt = now + rnd(900, 2500) * (anger > 700 ? 0.78 : 1);
        const slot = Number(a.v4Id ?? i + 1), theta = slot * 2.3999632297;
        const orderRoll = Math.random();
        if (phase === 'gather') {
          a.tx = clamp(640 + Math.cos(theta) * rnd(95,300), 185,1095);
          a.ty = clamp(430 + Math.sin(theta * 0.73) * rnd(20,80), 340,530);
        } else if (phase === 'march') {
          a.tx = clamp(640 + Math.cos(theta) * rnd(110,280), 200,1080);
          a.ty = clamp(397 + Math.sin(theta * 0.81) * rnd(18,56), 325,510);
        } else if (phase === 'pressure') {
          a.tx = clamp(640 + Math.cos(theta) * rnd(55,190), 365,915);
          a.ty = clamp(phaseTargetY + Math.sin(theta * 1.2) * rnd(8,44), 305,455);
        } else if (phase === 'clashes') {
          if (aggressive && police.length && orderRoll < 0.62) {
            const officer = police.reduce((best,o) => !best || Math.hypot(o.x-a.x,o.y-a.y) < Math.hypot(best.x-a.x,best.y-a.y) ? o : best, null);
            if (officer) { a.tx = clamp(officer.x + (a.x < officer.x ? -16 : 16),220,1060); a.ty = clamp(officer.y + rnd(8,22),300,620); }
          } else {
            a.tx = clamp(640 + Math.cos(theta) * rnd(55,245), 325,955);
            a.ty = clamp(388 + Math.sin(theta * 1.4) * rnd(12,64), 300,470);
          }
        } else {
          if (aggressive && orderRoll < 0.47 && s.building?.integrity > 0 && !s.building?.occupation) {
            a.tx = clamp(640 + Math.cos(theta) * rnd(10,60),575,705);
            a.ty = rnd(294,331);
          } else if (police.length && orderRoll < 0.77) {
            const officer = police.reduce((best,o) => !best || Math.hypot(o.x-a.x,o.y-a.y) < Math.hypot(best.x-a.x,best.y-a.y) ? o : best, null);
            if (officer) { a.tx = clamp(officer.x + (a.x < officer.x ? -14 : 14),220,1060); a.ty = clamp(officer.y + rnd(8,25),292,620); }
          } else {
            a.tx = clamp(640 + Math.cos(theta) * rnd(50,185),395,885);
            a.ty = clamp(phaseTargetY + Math.sin(theta) * rnd(8,44),290,440);
          }
        }
        a.timer = rnd(0.5, 1.25);
        a.v6OrderVersion = this.v6OrderVersion;
      }

      // Before full street-clash phase, a few organized cells begin throwing abstract tokens earlier.
      a.v6ThrowCooldown = Math.max(0, Number(a.v6ThrowCooldown || 0) - dt);
      if (anger > 325 && anger < 590 && aggressive && a.v6ThrowCooldown <= 0 && Math.random() < dt * (0.026 + anger / 26000)) {
        this._launchCrowdProjectile?.(a);
        a.v6ThrowCooldown = rnd(4.2, 8.5);
      }
    }
    this._v6HandleActivePoliceGas(dt, s);
  };

  P._v6ReactToPoliceGas = function(agent, zone, method = 'gas') {
    const now = Number(this.currentTime || 0);
    if (!agent || !zone || !agent.protester || agent.detained) return;
    agent.v6GasReactedZones = agent.v6GasReactedZones || [];
    if (agent.v6GasReactedZones.includes(zone.id)) return;
    agent.v6GasReactedZones.push(zone.id);
    if (agent.v6GasReactedZones.length > 12) agent.v6GasReactedZones.shift();
    const anger = clamp(this.sim?.state?.crowdAnger || 0, 0, 1000);
    const distance = Math.hypot(agent.x - zone.x, agent.y - zone.y);
    const vulnerable = ['peaceful','marcher','chant','organizer','helper'].includes(agent.behavior);
    const fleeChance = method === 'gas' ? (anger > 720 ? 0.08 : vulnerable ? 0.17 : 0.06) : method === 'water' ? 0.22 : 0.19;
    const roll = Math.random();
    if (roll < fleeChance) {
      // Only a small local minority evacuates; the crowd as a whole holds and reorganizes.
      const dx = agent.x - zone.x, dy = agent.y - zone.y, n = Math.hypot(dx, dy) || 1;
      agent.behavior = 'flee'; agent.v6GasEvacuatingUntil = now + rnd(2300, 4300);
      agent.tx = clamp(agent.x + dx / n * rnd(70,135) + rnd(-22,22), 35,1245);
      agent.ty = clamp(agent.y + dy / n * rnd(32,65), 288,620);
      agent.speed = rnd(58,84); agent.timer = rnd(1.6,2.5); agent.v4EvacuatingUntil = 0;
      agent.sprite?.setAlpha(0.94);
    } else if (anger > 420 && roll < (anger > 720 ? 0.74 : 0.61)) {
      // Remaining members hold ranks, pass face-covering gestures as a visual state and push back together.
      agent.v6GasHoldingUntil = now + rnd(1800,3500);
      agent.v6GasGesture = true;
      const alreadyHardline = ['radical','casseur','arsonist','volatile','looter','provocateur'].includes(agent.behavior);
      if (anger > 610 && (alreadyHardline || Math.random() < 0.72)) {
        agent.behavior = Math.random() < 0.5 ? 'radical' : (alreadyHardline ? agent.behavior : 'casseur'); agent.role = agent.behavior; agent.type = 'agitator';
      } else { agent.behavior = 'organizer'; agent.role = 'organizer'; }
      const side = agent.x < zone.x ? -1 : 1;
      agent.tx = clamp(agent.x + side * rnd(18,45), 45,1235);
      agent.ty = clamp(agent.y + rnd(-18,18), 300,555);
      agent.speed = rnd(19,36); agent.timer = rnd(1.4,2.4); agent.v4EvacuatingUntil = 0;
      agent.sprite?.setTint?.(anger > 610 ? 0xc98b7b : 0xb4b4a0);
    } else {
      // Organizers and harder groups do not flee from the cloud; some deliberately maintain pressure.
      agent.v6GasHoldingUntil = now + rnd(1200,2800);
      agent.behavior = anger > 650 && Math.random() < 0.56 ? 'radical' : (agent.behavior === 'flee' ? 'organizer' : agent.behavior);
      if (anger > 610 && Math.random() < 0.36) {
        const officers = this.crowdPolice || [];
        const officer = officers.reduce((best,o) => !best || Math.hypot(o.x-agent.x,o.y-agent.y) < Math.hypot(best.x-agent.x,best.y-agent.y) ? o : best, null);
        if (officer) { agent.tx = clamp(officer.x + (agent.x < officer.x ? -18:18), 220,1060); agent.ty = clamp(officer.y + 17,292,610); agent.speed = rnd(34,53); }
      }
      agent.timer = rnd(1.2,2.2); agent.v4EvacuatingUntil = 0;
      if (agent.sprite?.clearTint) agent.sprite.clearTint();
    }
    agent.v6GasLastDistance = distance;
  };

  P._v6HandleActivePoliceGas = function(dt, s) {
    const now = Number(this.currentTime || 0);
    const zones = (s.gasZones || []).filter(z => z && Number(z.life || 0) > 0 && z.source === 'police' && (z.kind === 'gas' || z.kind === 'water' || z.kind === 'flash' || String(z.id || '').startsWith('GAS-')));
    if (!zones.length) return;
    for (const agent of this.people || []) {
      if (!agent?.protester || agent.detained || Number(agent.v6GasEvacuatingUntil || 0) > now) continue;
      const zone = zones.find(z => Math.hypot(agent.x - z.x, agent.y - z.y) < (Number(z.radius || 80) * 0.88 + 12));
      if (zone) this._v6ReactToPoliceGas(agent, zone, zone.kind || (String(zone.id).startsWith('GAS-') ? 'gas' : 'gas'));
    }
  };

  P._updateCrisisActionVisuals = function() {
    const s = this.sim?.state, action = s?.lastPoliceAction;
    if (!action || action.seq === this.crisisLastActionSeq) return;
    this.crisisLastActionSeq = action.seq;
    this.v6LastActionRealMs = Number(this.currentTime || 0);
    if (['gas','water','flash'].includes(action.method)) {
      const prefix = action.method === 'gas' ? 'GAS-' : action.method === 'water' ? 'WATER-' : 'FLASH-';
      const zone = (s.gasZones || []).find(z => String(z.id || '').startsWith(prefix)) || (s.gasZones || [])[0];
      if (zone) {
        zone.source = 'police'; zone.kind = action.method;
        this.v6PoliceProjectiles = this.v6PoliceProjectiles || [];
        const nearest = (this.crowdPolice || []).slice().sort((a,b)=>Math.hypot(a.x-zone.x,a.y-zone.y)-Math.hypot(b.x-zone.x,b.y-zone.y))[0];
        if (nearest) this.v6PoliceProjectiles.push({x:nearest.x,y:nearest.y-10,targetX:zone.x,targetY:zone.y,elapsed:0,duration:.32,kind:action.method});
        this._v6HandleActivePoliceGas(0.016, s);
      }
      // Deliberately do not call the legacy action renderer: it scattered a random 28% of the entire crowd.
      return;
    }
    if (sceneOld._updateCrisisActionVisuals) sceneOld._updateCrisisActionVisuals.call(this);
    if (['physical','rubber','live'].includes(action.method)) {
      const anger = clamp(s.crowdAnger || 0, 0, 1000);
      const targets = (this.people || []).filter(a => a?.protester && !a.detained && ['agitator','radical','casseur','arsonist','volatile','provocateur','organizer'].includes(a.behavior));
      const officers = this.crowdPolice || [];
      const count = action.method === 'live' ? 2 : action.method === 'rubber' ? 5 : Math.min(3, officers.length);
      this.v6PoliceProjectiles = this.v6PoliceProjectiles || [];
      for (let i=0;i<count;i++) {
        const target = targets.length ? targets[Math.floor(Math.random()*targets.length)] : null;
        const officer = officers.length ? officers[(i*3 + Math.floor(Math.random()*officers.length)) % officers.length] : null;
        if (target && officer && ['rubber','live'].includes(action.method)) this.v6PoliceProjectiles.push({x:officer.x,y:officer.y-9,targetX:target.x,targetY:target.y-7,elapsed:0,duration:rnd(.16,.36),kind:action.method});
        if (target && Math.hypot(target.x-(officer?.x||640),target.y-(officer?.y||420)) < 90 && anger > 520 && Math.random() < 0.22) {
          target.behavior = 'radical'; target.role = 'radical'; target.type = 'agitator'; target.v6CounterattackUntil = Number(this.currentTime || 0) + 4000;
        }
      }
    }
  };

  // Crowd projectiles and impacts now increase cohesion and escalation instead of being cosmetic-only.
  P._updateProjectiles = function(dt, s) {
    const landed = (this.projectiles || []).filter(p => !p.landed && Number(p.elapsed || 0) + dt >= Number(p.duration || 0)).map(p => ({ kind:p.kind, x:p.targetX, y:p.targetY, targetOfficer:!!p.targetOfficer }));
    if (sceneOld._updateProjectiles) sceneOld._updateProjectiles.call(this, dt, s);
    for (const p of landed) {
      if (s.paused) continue;
      if (['stone','bottle','petard','smoke','firebrand'].includes(p.kind)) {
        const extra = p.kind === 'firebrand' ? 7.5 : p.kind === 'petard' ? 4 : 2.2;
        s.crowdAnger = clamp((s.crowdAnger || 0) + extra, 0, 1000);
        s.v6Organization = clamp((s.v6Organization || 0) + 0.5, 0, 100);
        if (p.targetOfficer) s.v6Radicalization = clamp((s.v6Radicalization || 0) + 0.8, 0, 100);
      }
    }
  };

  // Visual shot tracers and melee pulses are small/local. No large circular incident-radius overlays.
  P.create = function() {
    if (sceneOld.create) sceneOld.create.call(this);
    this.v6CombatFx = this.add.graphics().setDepth(9007);
    this.v6PoliceProjectiles = [];
    this.v6FightFlashes = [];
    this.v6TacticalTimer = 0;
    this.v6LastActionRealMs = -99999;
    this.v6LastScuffleAt = -99999;
  };

  P._v6StartStreetClash = function(s) {
    const now = Number(this.currentTime || 0), anger = clamp(s.crowdAnger || 0, 0, 1000);
    if (anger < 430 || now - Number(this.v6LastScuffleAt || -99999) < 4300) return;
    const candidates = (this.people || []).filter(a => a?.protester && !a.detained && ['agitator','radical','casseur','arsonist','volatile','provocateur','organizer'].includes(a.behavior));
    const officers = (this.crowdPolice || []).filter(o => o?.active);
    if (!candidates.length || !officers.length) return;
    const pair = candidates.map(a => ({a, o:officers.reduce((best,o)=>!best||Math.hypot(o.x-a.x,o.y-a.y)<Math.hypot(best.x-a.x,best.y-a.y)?o:best,null)}))
      .filter(p => p.o && Math.hypot(p.o.x-p.a.x,p.o.y-p.a.y) < 58)
      .sort((p,q)=>Math.hypot(p.o.x-p.a.x,p.o.y-p.a.y)-Math.hypot(q.o.x-q.a.x,q.o.y-q.a.y))[0];
    if (!pair || Math.random() > clamp(0.22 + anger / 1350, 0.22, 0.9)) return;
    this.v6LastScuffleAt = now;
    this.v6FightFlashes.push({x:(pair.a.x+pair.o.x)/2,y:(pair.a.y+pair.o.y)/2,expires:now+620,type:'melee'});
    pair.a.behavior = anger > 650 ? 'radical' : 'agitator'; pair.a.role = pair.a.behavior; pair.a.type = 'agitator';
    pair.a.v6NextOrderAt = 0;
    const policeInitiated = ['disperse','contain','protect'].includes(s.doctrineCode) && Math.random() < (s.v6PoliceAggression || 78)/100;
    const injuryName = Math.random() < 0.24 ? 'перелом' : 'ушибы и ссадины';
    this.sim._makeInjury?.(injuryName, injuryName === 'перелом' && Math.random() < 0.45 ? 2 : 0, pair.a.x, pair.a.y, 'street-clash', policeInitiated ? 'police' : 'protest', null, null);
    if (!policeInitiated && anger > 550 && Math.random() < 0.42) {
      const officerInjury = Math.random() < 0.24 ? 'перелом' : 'ушибы и ссадины';
      this.sim._makeInjury?.(officerInjury, officerInjury === 'перелом' && Math.random() < 0.38 ? 2 : 0, pair.o.x, pair.o.y, 'street-clash', 'protest', `Полицейский №${String(pair.o.id || 'дежурный')}`, null);
      this.v6FightFlashes.push({x:pair.o.x,y:pair.o.y,expires:now+720,type:'melee'});
      this.sim._radio?.('Полиция','Линия кордона','Сотрудник получил травмы в ответном столкновении; резервная пара закрывает участок.','critical','protest');
    }
    const existing = (s.incidents || []).find(i => alive(i) && ['clash','riot'].includes(i.type) && Math.hypot(i.x-pair.a.x,i.y-pair.a.y)<70);
    if (!existing && (s.incidents || []).filter(alive).length < this.sim.config.maxIncidents) {
      const inc = this.sim.addIncident('clash'); if (inc) { inc.x=pair.a.x;inc.y=pair.a.y;inc.districtId='center';inc.locationType='площадь';inc.severity=Math.max(inc.severity||0,60); }
    }
    this.sim._radio?.('Полиция','Очевидец у линии','Столкновение переросло в рукопашную свалку; офицеры и участники оттесняют друг друга, медикам передан вызов.','critical','police');
  };

  P._v6SchedulePoliceAction = function(deltaMs, s) {
    if (!s || s.paused || !deltaMs) return;
    this.v6TacticalTimer = (this.v6TacticalTimer || 0) + Math.min(80, deltaMs);
    if (this.v6TacticalTimer < 1050) return;
    this.v6TacticalTimer = 0;
    const nowMs = Number(this.currentTime || 0);
    const anger = clamp(s.crowdAnger || 0, 0, 1000);
    const active = (s.incidents || []).filter(alive);
    const protesters = (this.people || []).filter(a => a?.protester && !a.detained).length;
    if (protesters < 8 && anger < 180) return;
    // Street clashes have their own event clock, independent from the tactical order cooldown.
    this._v6StartStreetClash(s);
    const minGap = anger > 780 || active.some(i => ['riot','clash','building_assault','arson','radical_attack'].includes(i.type)) ? 3600 : 5700;
    if (nowMs - Number(this.v6LastActionRealMs || -99999) < minGap) return;
    // A difficult but playable default: police frequently resort to force, then climb the ladder as the crisis grows.
    const tools = s.policeTools || {};
    let choices;
    if (anger < 330) choices = [['gas',.39],['physical',.27],['cordon',.18],['water',.10],['flash',.03],['talk',.03]];
    else if (anger < 520) choices = [['gas',.32],['physical',.30],['water',.16],['flash',.12],['cordon',.10]];
    else if (anger < 700) choices = [['physical',.27],['rubber',.22],['gas',.18],['water',.17],['flash',.16]];
    else if (anger < 850) choices = [['rubber',.28],['physical',.25],['water',.18],['flash',.16],['gas',.13]];
    else choices = [['rubber',.31],['physical',.22],['water',.17],['flash',.15],['gas',.12],['live',.03]];
    if (anger > 930 && (s.deaths > 0 || (s.building?.siege || 0) > 94) && (tools.live || 0) > 0 && Math.random() < 0.11) choices = [['live',1]];
    const canUse = method => !['gas','water','flash','rubber','live'].includes(method) || Number(tools[method] || 0) > 0;
    let pool = choices.filter(([m]) => canUse(m)); if (!pool.length) pool = [['physical',.7],['cordon',.3]];
    const total = pool.reduce((sum, item) => sum + item[1], 0);
    let roll = Math.random() * total, method = pool[pool.length-1][0];
    for (const [m,w] of pool) { roll -= w; if (roll <= 0) { method = m; break; } }
    const before = Number(s.policeActionSeq || 0);
    const ok = this.sim.commandPolice(method, true);
    if (ok) {
      this.v6LastActionRealMs = nowMs;
      this._v6StartStreetClash(s);
      if (Number(s.policeActionSeq || 0) === before) s.v6TacticalActionCount = (s.v6TacticalActionCount || 0) + 1;
    }
  };

  P._v6RenderCombatFX = function(s, time) {
    const g = this.v6CombatFx; if (!g) return;
    g.clear();
    this.v6PoliceProjectiles = (this.v6PoliceProjectiles || []).filter(p => p.elapsed < p.duration);
    for (const p of this.v6PoliceProjectiles) {
      const t = clamp(p.elapsed / p.duration, 0, 1);
      const x = p.x + (p.targetX-p.x)*t, y = p.y + (p.targetY-p.y)*t;
      const c = p.kind === 'live' ? 0xf2d2b7 : p.kind === 'rubber' ? 0xd8b68c : p.kind === 'water' ? 0x92c7d7 : 0xc3c5a9;
      g.lineStyle(p.kind === 'live' ? 1.8 : 1.2, c, .82*(1-t));
      g.beginPath().moveTo(p.x,p.y).lineTo(x,y).strokePath();
      if (t > .78) {
        g.lineStyle(1.2,0xf0b88a,.85*(1-t)); g.beginPath().moveTo(x-4,y-3).lineTo(x+4,y+3).strokePath();
        g.beginPath().moveTo(x-3,y+4).lineTo(x+3,y-4).strokePath();
      }
    }
    for (const p of this.v6FightFlashes || []) {
      const fade = clamp((p.expires-time)/620,0,1);
      g.lineStyle(2.2,0xe6ae79,fade*.85).beginPath().moveTo(p.x-7,p.y-6).lineTo(p.x+6,p.y+5).strokePath();
      g.lineStyle(1.6,0xb65e55,fade*.9).beginPath().moveTo(p.x+5,p.y-7).lineTo(p.x-4,p.y+6).strokePath();
      g.fillStyle(0xe7c28e,fade*.75).fillEllipse(p.x,p.y,9,5);
    }
    this.v6FightFlashes = (this.v6FightFlashes || []).filter(p => p.expires > time);
    this.v6PoliceProjectiles.forEach(p => { p.elapsed += 1/60; });
  };

  P._renderEnvironment = function(s,time) {
    if (sceneOld._renderEnvironment) sceneOld._renderEnvironment.call(this,s,time);
    this._v6RenderCombatFX(s,time || 0);
  };

  P.update = function(time,deltaMs) {
    if (sceneOld.update) sceneOld.update.call(this,time,deltaMs);
    this._v6SchedulePoliceAction(deltaMs, this.sim?.state);
  };

  // UI and automatic browser saves use a new versioned key; older saves remain available for migration.
  UP.saveGame = function(automatic = false) {
    try {
      localStorage.setItem('kontur-republic-save-v6', JSON.stringify(this.sim.snapshot()));
      const label = document.getElementById('last-save-label');
      if (label) label.textContent = `СОХРАНЕНО v6 ${new Date().toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}`;
      if (!automatic) this.toast('Игра сохранена','Сохранены координация толпы, автономная полиция и история кризиса.','success');
      return true;
    } catch (err) { if (!automatic) this.toast('Не удалось сохранить',`Браузер не разрешил запись: ${err.message}`,'error'); return false; }
  };
  UP.loadGame = function() {
    try {
      const keys = ['kontur-republic-save-v6','kontur-republic-save-v5','kontur-republic-save-v4','kontur-republic-save-v3','kontur-republic-save-v2'];
      let raw = null; for (const key of keys) { raw = localStorage.getItem(key); if (raw) break; }
      if (!raw) { this.toast('Сохранение не найдено','Сначала сохраните игру.','warning'); return false; }
      const snap = JSON.parse(raw); this.sim.loadSnapshot(snap); this.draft = {...this.sim.state.policies}; this._syncPolicyInputs(); this.renderAll(true);
      const label = document.getElementById('last-save-label'); if (label) label.textContent = 'ЗАГРУЖЕНО / МИГРАЦИЯ К v6';
      this.toast('Сохранение загружено','История сохранена, добавлены механики версии 6.0.0.','success'); return true;
    } catch (err) { this.toast('Ошибка загрузки',`Не удалось прочитать сохранение: ${err.message}`,'error'); return false; }
  };
  UP.updateStats = function() {
    if (uiOld.updateStats) uiOld.updateStats.call(this);
    const footer = document.querySelector('.app-footer span'); if (footer) footer.textContent = 'КОНТУР // ВЕРСИЯ 6.0.0';
  };
  document.addEventListener('DOMContentLoaded', () => {
    const footer = document.querySelector('.app-footer span'); if (footer) footer.textContent = 'КОНТУР // ВЕРСИЯ 6.0.0';
    const intro = document.querySelector('.police-command-panel .panel-intro');
    if (intro) intro.textContent = 'Полиция действует автономно и по умолчанию придерживается жёсткого профиля. ИИ меняет доктрину и средства по ходу кризиса; применение силы ускоряет мобилизацию и радикализацию, а уставшие подразделения могут терять строй.';
  }, { once:true });
})();
