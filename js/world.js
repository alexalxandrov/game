'use strict';
const WORLD_U = window.GameUtils;

class RepublicCityScene extends Phaser.Scene {
  constructor() {
    super({ key: 'RepublicCityScene' });
    this.people = [];
    this.vehicles = [];
    this.lastCrowdSync = 0;
    this.lastIncidentSync = 0;
    this.fpsTimer = 0;
  }

  create() {
    this.sim = window.gameSimulation;
    this._createBackgroundTexture();
    this._createPersonTextures();
    this._createVehicleTextures();
    this.add.image(640, 320, 'city-background').setDepth(0);
    this.night = this.add.graphics().setDepth(9000);
    this.fx = this.add.graphics().setDepth(9001);
    this.fireflies = [];
    this.interactionMarks = [];
    this.projectiles = [];
    this.currentTime = 0;
    this._seedCrowd();
    this._drawStaticLabels();
    this.scale.on('resize', () => { /* Scale.FIT preserves the designed street-camera framing. */ });
    window.worldScene = this;
  }

  _createBackgroundTexture() {
    const w = 1280, h = 640;
    const texture = this.textures.createCanvas('city-background', w, h);
    const ctx = texture.getContext();
    const rand = (min, max) => min + Math.random() * (max - min);
    const polygon = (points, fill, stroke = null, lineWidth = 1) => {
      ctx.beginPath(); ctx.moveTo(points[0][0], points[0][1]);
      for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
      ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
      if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth; ctx.stroke(); }
    };
    const rect = (x, y, width, height, fill, stroke = null) => {
      ctx.fillStyle = fill; ctx.fillRect(x, y, width, height);
      if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1); }
    };
    const line = (x1, y1, x2, y2, color, width = 1) => {
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
    };
    ctx.fillStyle = ctx.createLinearGradient(0, 0, 0, 280);
    ctx.fillStyle.addColorStop?.(0, '#83969a');
    // Recreate a known gradient explicitly; some browsers expose an opaque style object.
    const sky = ctx.createLinearGradient(0, 0, 0, 300);
    sky.addColorStop(0, '#829399'); sky.addColorStop(0.7, '#aab6b4'); sky.addColorStop(1, '#c5c9bd');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);
    // Distant urban silhouettes: low contrast, haze and glass-grid details.
    const blocks = [
      [0, 82, 116, 162, '#647578'], [94, 54, 92, 194, '#65787b'], [170, 97, 112, 150, '#718383'],
      [258, 112, 92, 135, '#7e8d8b'], [931, 95, 106, 154, '#788783'], [1012, 69, 103, 181, '#687b7e'],
      [1100, 42, 98, 210, '#63777b'], [1180, 99, 100, 153, '#7c8987']
    ];
    blocks.forEach((b, idx) => {
      const [x,y,bw,bh,color] = b;
      rect(x, y, bw, bh, color, '#667578');
      rect(x + 5, y + 5, bw - 10, 7, 'rgba(220,226,218,.2)');
      for (let wy = y + 17; wy < y + bh - 9; wy += 13) {
        for (let wx = x + 8; wx < x + bw - 5; wx += 12) {
          const bright = Math.random() > 0.53;
          rect(wx, wy, 6, 7, bright ? '#a8b9b5' : '#53676b');
          line(wx + 1, wy + 1, wx + 5, wy + 1, 'rgba(220,231,222,.23)');
        }
      }
      rect(x + 2, y + bh - 5, bw - 4, 5, '#4e6265');
      if (idx % 2 === 0) rect(x + bw - 13, y - 7, 3, 9, '#5b6e72');
    });
    // Horizon tree line and garden boundary.
    for (let i = 0; i < 85; i++) {
      const x = i * 16 - 6, y = 232 + rand(-9, 5), r = rand(6, 13);
      ctx.fillStyle = WORLD_U.choose(['#53655b','#637465','#596b60','#788275']);
      ctx.beginPath(); ctx.ellipse(x, y, r, r * .7, 0, 0, Math.PI * 2); ctx.fill();
    }
    rect(0, 238, w, 14, '#687873');
    rect(0, 250, w, 12, '#b8b8a9');
    // Parliament/city hall stone body and its cast shadow.
    polygon([[290,246],[336,116],[944,116],[990,246]], 'rgba(34,43,43,.22)');
    rect(333, 111, 614, 136, '#a99f8c', '#5c625e');
    rect(344, 122, 592, 117, '#c8bdab', '#8f8a7b');
    rect(344, 122, 592, 8, '#e0d5c1');
    // Wings with roof detail and sill courses.
    rect(312, 147, 102, 91, '#b8ad9a', '#777a70');
    rect(866, 147, 102, 91, '#b8ad9a', '#777a70');
    rect(303, 143, 120, 8, '#d6cbb6'); rect(857, 143, 120, 8, '#d6cbb6');
    for (let x = 324; x < 410; x += 24) {
      rect(x, 165, 11, 25, '#61777c', '#d6c8b1'); rect(x + 1, 166, 9, 2, '#d7d2c3');
      rect(x, 201, 11, 22, '#697d80', '#d6c8b1');
    }
    for (let x = 879; x < 965; x += 24) {
      rect(x, 165, 11, 25, '#61777c', '#d6c8b1'); rect(x + 1, 166, 9, 2, '#d7d2c3');
      rect(x, 201, 11, 22, '#697d80', '#d6c8b1');
    }
    // Central portico and pediment.
    polygon([[475,130],[640,58],[805,130]], '#bcb19e', '#777b73', 2);
    polygon([[500,124],[640,68],[780,124]], '#d1c6b2', '#8e8e80', 1);
    polygon([[524,120],[640,83],[756,120]], '#b6ad9d');
    rect(484, 121, 312, 12, '#ded3bd', '#85877b');
    rect(496, 130, 288, 101, '#bdb29f', '#8a897c');
    for (let i = 0; i < 9; i++) {
      const x = 509 + i * 32;
      rect(x, 138, 8, 81, '#e2d8c4', '#8a887a');
      rect(x - 3, 135, 14, 5, '#e8ddc8');
      rect(x - 3, 218, 14, 5, '#8d8a7c');
      line(x + 2, 146, x + 2, 213, 'rgba(255,255,255,.35)', 1);
    }
    // Main entrance, doors, lamps and fictional standard.
    rect(608, 170, 64, 62, '#5a6664', '#ded2bb');
    rect(615, 177, 22, 52, '#2d464b', '#817e70'); rect(641, 177, 22, 52, '#304a4d', '#817e70');
    rect(621, 184, 10, 40, '#405e60'); rect(647, 184, 10, 40, '#405e60');
    rect(638, 174, 4, 58, '#c2b59c');
    rect(598, 229, 84, 5, '#8c877a');
    // Windows with stone reveals.
    for (let x = 360; x <= 900; x += 35) {
      if (x > 484 && x < 796) continue;
      rect(x, 139, 18, 37, '#5e7377', '#e1d4bc');
      rect(x + 3, 143, 12, 28, '#90a5a3');
      line(x + 9, 143, x + 9, 171, '#52666a'); line(x + 3, 156, x + 15, 156, '#52666a');
      rect(x, 186, 18, 34, '#596e71', '#e1d4bc');
      rect(x + 3, 190, 12, 26, '#819896');
    }
    rect(340, 233, 600, 9, '#9b9586');
    // Broad front stairs and accessibility ramps.
    for (let i = 0; i < 7; i++) {
      const y = 237 + i * 5;
      const spread = i * 13;
      rect(515 - spread, y, 250 + spread * 2, 5, i % 2 ? '#c8beac' : '#ded4c2', '#958f81');
      line(516 - spread, y + 1, 764 + spread, y + 1, 'rgba(255,255,255,.26)');
    }
    // Roof-mounted fictional civic emblem and flag poles.
    rect(637, 42, 6, 27, '#6f756d');
    polygon([[643,44],[671,50],[643,58]], '#4f9b91');
    rect(430, 119, 2, 30, '#756e60'); polygon([[432,121],[451,125],[432,132]], '#4f988e');
    rect(847, 119, 2, 30, '#756e60'); polygon([[849,121],[868,125],[849,132]], '#c29c59');
    // Forecourt, large stone pavers with perspective convergence.
    rect(0, 262, w, 275, '#9a9d92');
    polygon([[0,262],[1280,262],[1280,537],[0,537]], '#a7a79a');
    // Surface wear, subtle patches and stone joints.
    for (let r = 0; r < 12; r++) {
      const y = 266 + r * r * 1.65;
      line(0, y, w, y, r % 2 ? '#8d938a' : '#c1bca9', r > 8 ? 2 : 1);
    }
    for (let x = -450; x < 1750; x += 56) {
      line(640 + (x - 640) * .10, 263, x, 537, 'rgba(80,91,85,.36)', 1);
    }
    // Paver edge bands, worn patches and fine grain.
    line(0, 274, 1280, 274, '#d0c7b5', 4);
    line(0, 529, 1280, 529, '#747f79', 3);
    for (let i = 0; i < 1400; i++) {
      const x = rand(0, 1280), y = rand(266, 530);
      ctx.fillStyle = Math.random() > .5 ? 'rgba(54,68,64,.10)' : 'rgba(231,226,211,.16)';
      ctx.fillRect(x, y, rand(1, 4), 1);
    }
    // Planters / trees at the sides, drawn as real landscaped beds rather than icons.
    const drawTree = (cx, cy, scale = 1) => {
      ctx.save(); ctx.translate(cx, cy); ctx.scale(scale, scale);
      rect(-23, 1, 46, 32, '#777a6c', '#555e57'); rect(-18, 5, 36, 23, '#5d6e5e');
      rect(-3, -6, 6, 24, '#5f4c3b');
      for (let i = 0; i < 23; i++) {
        const ox = rand(-20, 20), oy = rand(-21, 6), r = rand(4, 10);
        ctx.fillStyle = WORLD_U.choose(['#435e50','#4b6855','#59745b','#637c61','#789071']);
        ctx.beginPath(); ctx.ellipse(ox, oy, r, r * .72, rand(-.5,.5), 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    };
    [[65,365,1.15],[143,445,.9],[1195,365,1.15],[1125,445,.9],[60,489,.7],[1225,488,.7]].forEach(p => drawTree(...p));
    // Benches, lamp posts, bollards and wayfinding signs.
    const drawBench = (x, y) => {
      rect(x, y, 42, 5, '#6d5542'); rect(x + 1, y - 4, 40, 4, '#8b7258');
      rect(x + 4, y + 5, 3, 8, '#4b514c'); rect(x + 35, y + 5, 3, 8, '#4b514c');
      line(x + 3, y - 2, x + 39, y - 2, '#b19771');
    };
    [[258,385],[978,385],[228,475],[1008,475]].forEach(p => drawBench(...p));
    const drawLamp = (x, y) => {
      rect(x - 2, y - 42, 4, 42, '#515e5c'); rect(x - 9, y - 46, 18, 6, '#454f4d');
      rect(x - 6, y - 49, 12, 4, '#d7d0b7'); rect(x - 1, y - 55, 2, 8, '#626c67');
      ctx.fillStyle = 'rgba(243,225,172,.25)'; ctx.beginPath(); ctx.ellipse(x, y - 45, 17, 13, 0, 0, Math.PI*2); ctx.fill();
    };
    [[180,430],[1095,430],[335,494],[945,494]].forEach(p => drawLamp(...p));
    for (let x = 383; x < 900; x += 50) {
      rect(x, 508, 4, 14, '#555d57'); rect(x - 2, 506, 8, 4, '#858779');
    }
    // Roadway across the foreground.
    rect(0, 537, 1280, 103, '#414a4b');
    rect(0, 537, 1280, 5, '#d0c8b4'); rect(0, 543, 1280, 2, '#717a76');
    rect(0, 627, 1280, 4, '#d0c8b4');
    line(0, 589, 1280, 589, '#b4b4a6', 2);
    for (let x = 20; x < 1280; x += 82) rect(x, 586, 42, 4, '#d3c8a9');
    // Curbs, drainage, crossing paint.
    for (let x = 18; x < 1260; x += 38) rect(x, 541, 20, 3, x % 3 ? '#d0c9b8' : '#92988f');
    for (let i = 0; i < 8; i++) rect(580 + i * 18, 553, 10, 26, '#c8c8b9');
    // A parked service bay and urban furniture anchors.
    rect(1094, 551, 120, 31, '#374243', '#89918a');
    rect(1103, 557, 99, 18, '#657979');
    for (let x = 1110; x < 1200; x += 23) rect(x, 560, 16, 11, '#354c50');
    // Tiny markings / pavement stains increase the grounded, documentary feel.
    for (let i = 0; i < 260; i++) {
      const x = rand(0, w), y = rand(540, h);
      ctx.fillStyle = Math.random() > .5 ? 'rgba(235,230,215,.06)' : 'rgba(8,14,15,.1)';
      ctx.fillRect(x, y, rand(2, 13), 1);
    }
    // A fixed weathered camera grain, very low contrast.
    for (let i = 0; i < 600; i++) {
      const x = rand(0, w), y = rand(0, h);
      ctx.fillStyle = Math.random() > .5 ? 'rgba(255,255,255,.025)' : 'rgba(20,28,27,.025)';
      ctx.fillRect(x, y, 1, 1);
    }
    texture.refresh();
  }

  _createPersonTextures() {
    const jacketColors = ['#3f5057','#66574a','#53665d','#55596c','#79634f','#3e454a','#6c4f50','#78807b'];
    const skinColors = ['#c99f80','#b98769','#d7b293','#aa785d','#e0bb94'];
    const hairColors = ['#3d3833','#4b4037','#6a5b4a','#272d2e'];
    const make = (key, type, variant = 0) => {
      const texture = this.textures.createCanvas(key, 16, 23);
      const ctx = texture.getContext();
      const rect = (x,y,w,h,color) => { ctx.fillStyle = color; ctx.fillRect(x,y,w,h); };
      ctx.clearRect(0,0,16,23);
      ctx.fillStyle = 'rgba(19,26,25,.30)'; ctx.beginPath(); ctx.ellipse(8,20,6,2,0,0,Math.PI*2); ctx.fill();
      const skin = skinColors[variant % skinColors.length];
      const hair = hairColors[(variant + Math.floor(variant/2)) % hairColors.length];
      const jacket = jacketColors[variant % jacketColors.length];
      const trouser = ['#333d41','#44403a','#343941','#4f4a43'][variant % 4];
      // Small elevated-view figure: separate legs, arms, torso, hair and fabric highlights.
      rect(4,15,3,5,trouser); rect(9,15,3,5,trouser); rect(3,19,4,2,'#292e2d'); rect(9,19,4,2,'#292e2d');
      if (type === 'police') {
        rect(3,7,10,9,'#253b4b'); rect(1,8,3,6,'#1e3443'); rect(12,8,3,6,'#1e3443');
        rect(3,10,10,2,'#7e9d98'); rect(6,8,4,6,'#334d5b'); rect(5,5,7,3,'#243c4d');
        rect(5,3,7,3,'#253b4a'); rect(6,2,5,2,'#b8a36b'); rect(6,12,4,2,'#baab79');
      } else if (type === 'medic') {
        rect(3,7,10,9,'#d8d4c4'); rect(1,8,3,6,'#bfc9c0'); rect(12,8,3,6,'#bfc9c0');
        rect(6,9,4,5,'#638b85'); rect(7,9,2,5,'#ece6d6'); rect(5,11,6,2,'#ece6d6');
        rect(4,5,8,3,'#d5d0c2');
      } else if (type === 'fire') {
        rect(3,7,10,9,'#b66b3e'); rect(1,8,3,6,'#b66b3e'); rect(12,8,3,6,'#b66b3e');
        rect(3,10,10,2,'#d7c37d'); rect(6,6,5,3,'#d6c77d'); rect(4,4,8,3,'#d6c77d');
      } else if (type === 'military') {
        rect(3,7,10,9,'#5b654d'); rect(1,8,3,6,'#505b47'); rect(12,8,3,6,'#505b47');
        rect(5,10,3,2,'#3e4c3e'); rect(9,13,3,2,'#424c3c'); rect(4,5,8,3,'#647052'); rect(5,3,7,2,'#4e5947');
      } else {
        rect(3,7,10,9,jacket); rect(1,8,3,6,jacket); rect(12,8,3,6,jacket);
        rect(4,8,2,6,'rgba(0,0,0,.12)'); rect(10,8,2,6,'rgba(255,255,255,.09)');
        rect(7,8,1,7,'rgba(25,30,29,.35)');
        if (type === 'supporter') {
          rect(0,5,3,4,'#d2c8ad'); rect(0,5,3,1,'#678f87');
          rect(12,5,3,4,'#d2c8ad'); rect(12,5,3,1,'#678f87');
        }
        if (type === 'agitator') { rect(5,7,6,2,'#87574e'); rect(7,12,2,2,'#b88f61'); }
      }
      // Neck and head are shaded separately, avoiding a flat emoji-like silhouette.
      rect(6,5,4,3,skin); rect(4,1,8,6,skin); rect(4,1,8,2,hair); rect(3,3,2,3,hair); rect(11,3,2,3,hair);
      rect(5,4,1,1,'#423a34'); rect(10,4,1,1,'#423a34'); rect(7,6,3,1,'rgba(93,52,41,.55)');
      if (type === 'civilian' && variant % 3 === 0) rect(4,0,8,2,hair);
      if (type === 'supporter') {
        rect(0,4,3,6,'#bdb39d'); rect(1,5,2,3,'#6c9c91');
      }
      texture.refresh();
    };
    for (let i = 0; i < 8; i++) make(`person-civilian-${i}`, 'civilian', i);
    for (let i = 0; i < 5; i++) make(`person-supporter-${i}`, 'supporter', i + 1);
    for (let i = 0; i < 5; i++) make(`person-agitator-${i}`, 'agitator', i + 2);
    for (let i = 0; i < 3; i++) make(`person-police-${i}`, 'police', i);
    make('person-medic', 'medic', 1); make('person-fire', 'fire', 2); make('person-military', 'military', 1);
  }

  _createVehicleTextures() {
    const build = (key, body, stripe, kind) => {
      const texture = this.textures.createCanvas(key, 42, 24);
      const ctx = texture.getContext();
      const rect = (x,y,w,h,c) => { ctx.fillStyle = c; ctx.fillRect(x,y,w,h); };
      ctx.clearRect(0,0,42,24);
      ctx.fillStyle = 'rgba(7,12,13,.38)'; ctx.beginPath(); ctx.ellipse(21,13,19,9,0,0,Math.PI*2); ctx.fill();
      rect(4,4,34,17,'#202a2b'); rect(2,7,3,10,'#202a2b'); rect(37,7,3,10,'#202a2b');
      rect(4,3,34,16,body); rect(8,5,26,12,body);
      rect(9,5,9,5,'#9eb0ad'); rect(24,5,9,5,'#91a4a2');
      rect(10,6,7,3,'#334a51'); rect(25,6,7,3,'#334a51');
      rect(18,5,6,11,'#303c3e'); rect(19,6,4,8,'#495c5d');
      rect(4,8,34,3,stripe); rect(4,14,34,2,'rgba(10,19,20,.38)');
      rect(5,3,5,2,'#dad5c7'); rect(32,3,5,2,'#dad5c7');
      rect(3,7,2,4,'#d9d5c9'); rect(37,7,2,4,'#d9d5c9');
      rect(3,16,3,3,'#cf6658'); rect(36,16,3,3,'#cf6658');
      if (kind === 'police' || kind === 'ambulance' || kind === 'fire' || kind === 'military') {
        rect(17,2,4,3,'#d44f48'); rect(21,2,4,3,'#4b91d0');
        rect(18,3,2,1,'#f1d7b5'); rect(22,3,2,1,'#d7e7e5');
      }
      if (kind === 'ambulance') { rect(19,7,4,5,'#eee9d9'); rect(18,8,6,3,'#eee9d9'); rect(20,7,2,5,'#b95149'); rect(18,9,6,2,'#b95149'); }
      if (kind === 'fire') { rect(18,6,6,6,'#e0b36c'); rect(20,6,2,6,'#a84d35'); }
      if (kind === 'military') { rect(8,8,8,3,'#667451'); rect(26,8,8,3,'#667451'); }
      // wheel/edge details
      rect(8,2,5,2,'#1c2525'); rect(28,2,5,2,'#1c2525'); rect(8,19,5,2,'#1c2525'); rect(28,19,5,2,'#1c2525');
      texture.refresh();
    };
    build('vehicle-police', '#d9d8cf', '#314957', 'police');
    build('vehicle-ambulance', '#e3e1d8', '#7eaaa0', 'ambulance');
    build('vehicle-fire', '#b94e3c', '#e1b05b', 'fire');
    build('vehicle-military', '#666f59', '#9a9b7c', 'military');
  }

  _seedCrowd() {
    const target = this.sim ? this.sim.state.crowdTarget : 86;
    for (let i = 0; i < target; i++) this._addPerson(i);
  }

  _pickPersonType() {
    const tension = this.sim ? this.sim.state.tension : 38;
    const supportChance = 0.10;
    const agitatorChance = tension > 72 ? 0.25 : tension > 55 ? 0.17 : 0.08;
    const r = Math.random();
    if (r < supportChance) return { type: 'supporter', behavior: 'support' };
    if (r < supportChance + agitatorChance) return { type: 'agitator', behavior: tension > 65 ? 'volatile' : 'provocateur' };
    if (r > 0.94) return { type: 'civilian', behavior: 'helper' };
    return { type: 'civilian', behavior: 'peaceful' };
  }

  _addPerson(index) {
    const picked = this._pickPersonType();
    const variant = WORLD_U.randomInt(0, picked.type === 'civilian' ? 7 : 4);
    const key = `person-${picked.type}-${variant}`;
    const x = WORLD_U.clamp(640 + WORLD_U.random(-285, 285), 80, 1200);
    const y = WORLD_U.clamp(356 + WORLD_U.random(-55, 160), 300, 520);
    const sprite = this.add.image(x, y, key).setOrigin(0.5, 0.78).setDepth(y + 2);
    sprite.setScale(WORLD_U.clamp(0.62 + (y - 320) / 480, 0.62, 1.08));
    if (picked.type === 'supporter' && Math.random() < 0.45) sprite.setTint(0xf3efe1);
    const agent = {
      sprite, x, y, tx: x + WORLD_U.random(-55, 55), ty: y + WORLD_U.random(-24, 24),
      type: picked.type, behavior: picked.behavior,
      speed: WORLD_U.random(8, 21), timer: WORLD_U.random(0.2, 2.2), wobble: Math.random() * 10,
      wait: WORLD_U.random(0, 0.6), lastFlee: 0
    };
    sprite.setData('agent', agent);
    this.people.push(agent);
  }

  _removePerson() {
    const idx = this.people.length - 1;
    if (idx < 0) return;
    this.people[idx].sprite.destroy();
    this.people.pop();
  }

  _drawStaticLabels() {
    const labels = this.add.graphics().setDepth(12);
    labels.fillStyle(0x293b3d, 0.72); labels.fillRoundedRect(562, 252, 156, 18, 2);
    labels.lineStyle(1, 0xc6b994, 0.7); labels.strokeRoundedRect(562, 252, 156, 18, 2);
    this.add.text(640, 261, 'ЗДАНИЕ ПРАВИТЕЛЬСТВА', { fontFamily: 'monospace', fontSize: '8px', color: '#e0d4bb', letterSpacing: 1 }).setOrigin(0.5).setDepth(13).setAlpha(0.8);
  }

  _queueAutomaticServices() {
    const s = this.sim.state;
    for (const inc of s.incidents) {
      if (inc.status === 'resolved') continue;
      let services = [];
      if (inc.type === 'fire') services = ['fire'];
      else if (inc.type === 'medical') services = ['ambulance'];
      else if (inc.type === 'clash') services = ['police', 'ambulance'];
      else if (inc.type === 'accident') services = ['police', 'ambulance'];
      else if (inc.type === 'disturbance') services = ['police'];
      else if (inc.type === 'demonstration' && inc.severity > 34) services = ['police'];
      for (const service of services) {
        inc.dispatchedServices = inc.dispatchedServices || {};
        if (!inc.dispatchedServices[service]) {
          inc.dispatchedServices[service] = true;
          s.vehicleOrders.push({ id: ++s.vehicleSequence, service, x: inc.x, y: inc.y, incidentId: inc.id, purpose: 'incident' });
        }
      }
    }
  }

  _consumeVehicleOrders() {
    const orders = this.sim.state.vehicleOrders;
    while (orders.length) {
      const order = orders.shift();
      this._dispatchVehicle(order);
    }
  }

  _dispatchVehicle(order) {
    const key = order.service === 'fire' ? 'fire' : order.service === 'ambulance' ? 'ambulance' : order.service === 'military' ? 'military' : 'police';
    const laneY = 596 + WORLD_U.random(-5, 5);
    const x = 1290 + this.vehicles.length * 9;
    const sprite = this.add.image(x, laneY, `vehicle-${key}`).setOrigin(0.5, 0.5).setDepth(1000 + laneY);
    const unit = {
      id: order.id, service: key, sprite, x, y: laneY,
      targetX: order.x, targetY: order.y, incidentId: order.incidentId,
      purpose: order.purpose, phase: 'outbound', speed: key === 'military' ? 70 : 102,
      routeStage: 0, route: [{ x: 1130, y: 595 }, { x: 1010, y: 558 }, { x: order.x, y: order.y }],
      target: { x: 1130, y: 595 }, sirenPhase: Math.random() * 7, age: 0,
      arrived: false, returnTimer: 0
    };
    sprite.setScale(key === 'military' ? 1.18 : 1.04);
    this.vehicles.push(unit);
  }

  update(_time, deltaMs) {
    if (!this.sim) return;
    const s = this.sim.state;
    this.currentTime = _time;
    const dt = Math.min(deltaMs / 1000, 0.05);
    this.lastCrowdSync += deltaMs;
    this.lastIncidentSync += deltaMs;
    this.fpsTimer += deltaMs;
    if (this.lastCrowdSync > 950) { this.lastCrowdSync = 0; this._syncCrowd(); }
    if (this.lastIncidentSync > 500) { this.lastIncidentSync = 0; this._queueAutomaticServices(); this._consumeVehicleOrders(); }
    this._updatePeople(s.paused ? 0 : dt, s);
    this._updateProjectiles(s.paused ? 0 : dt, s);
    this._updateVehicles(s.paused ? 0 : dt, s);
    this._renderEnvironment(s, _time);
    if (this.fpsTimer > 650) {
      this.fpsTimer = 0;
      if (window.dashboardUI) window.dashboardUI.setFps(Math.round(this.game.loop.actualFps || 60));
    }
  }

  _syncCrowd() {
    const wanted = WORLD_U.clamp(Math.round(this.sim.state.crowdTarget), 12, this.sim.config.maxCrowd);
    while (this.people.length < wanted) this._addPerson(this.people.length);
    while (this.people.length > wanted) this._removePerson();
    // A handful of stewards/police appear as the situation changes; they remain identifiable by uniform texture.
    const desiredPolice = this.sim.state.policePresence > 58 ? 8 : this.sim.state.policePresence > 42 ? 5 : 3;
    if (!this.crowdPolice || this.crowdPolice.length !== desiredPolice) {
      (this.crowdPolice || []).forEach(p => p.destroy());
      this.crowdPolice = [];
      for (let i = 0; i < desiredPolice; i++) {
        const x = 435 + (i % 4) * 18 + WORLD_U.random(-7, 7), y = 352 + Math.floor(i / 4) * 35 + WORLD_U.random(-5, 5);
        const sprite = this.add.image(x, y, `person-police-${i % 3}`).setOrigin(0.5, 0.78).setDepth(y + 5).setScale(0.82 + (y - 320) / 450);
        this.crowdPolice.push(sprite);
      }
    }
  }

  _updatePeople(dt, s) {
    const tension = s.tension;
    const center = { x: 640, y: 421 };
    for (const a of this.people) {
      a.timer -= dt;
      if (a.timer <= 0) {
        const panic = tension > 75 && (a.behavior === 'volatile' || Math.random() < 0.26);
        if (panic) {
          const awayX = a.x < center.x ? -1 : 1;
          a.tx = WORLD_U.clamp(a.x + awayX * WORLD_U.random(45, 115), 65, 1215);
          a.ty = WORLD_U.clamp(a.y + WORLD_U.random(-55, 30), 305, 522);
          a.speed = WORLD_U.random(33, 57); a.behavior = 'flee'; a.lastFlee = 2;
        } else if (a.behavior === 'flee' && tension < 65) {
          a.behavior = a.type === 'supporter' ? 'support' : 'peaceful'; a.speed = WORLD_U.random(8, 20);
          a.tx = WORLD_U.random(420, 860); a.ty = WORLD_U.random(360, 500);
        } else {
          const gathering = tension > 48;
          a.tx = WORLD_U.clamp((gathering ? center.x : 640) + WORLD_U.random(-260, 260), 75, 1205);
          a.ty = WORLD_U.clamp((gathering ? 427 : 410) + WORLD_U.random(-88, 92), 305, 520);
          if (a.type === 'supporter') { a.tx = WORLD_U.clamp(a.tx + (a.x < center.x ? 28 : -28), 90, 1190); }
          a.speed = a.behavior === 'volatile' ? WORLD_U.random(13, 25) : WORLD_U.random(7, 18);
        }
        a.timer = WORLD_U.random(0.7, 2.6);
      }
      if (dt > 0 && !a.wait) {
        let dx = a.tx - a.x, dy = a.ty - a.y;
        // Local separation steers sprites around nearby people without expensive full pathfinding.
        for (let j = 0; j < this.people.length; j += 5) {
          const b = this.people[j];
          if (a === b) continue;
          const ox = a.x - b.x, oy = a.y - b.y, d2 = ox*ox + oy*oy;
          if (d2 > 0 && d2 < 110) { dx += ox * 0.11; dy += oy * 0.1; }
        }
        const d = Math.sqrt(dx*dx + dy*dy);
        if (d > 2) {
          const step = Math.min(d, a.speed * dt);
          a.x += dx / d * step;
          a.y += dy / d * step;
        }
      }
      a.x = WORLD_U.clamp(a.x, 36, 1242); a.y = WORLD_U.clamp(a.y, 292, 523);
      a.sprite.setPosition(a.x, a.y).setDepth(a.y + (a.type === 'agitator' ? 3 : 1));
      a.sprite.setScale(WORLD_U.clamp(0.65 + (a.y - 310) / 455, 0.65, 1.12));
      if (Math.abs(a.tx - a.x) > 1) a.sprite.setFlipX(a.tx < a.x);
      a.lastFlee = Math.max(0, a.lastFlee - dt);
      if (a.behavior === 'flee') a.sprite.setAlpha(0.93);
      else a.sprite.setAlpha(1);

      a.interactionCooldown = Math.max(0, a.interactionCooldown - dt);
      if (dt > 0 && a.interactionCooldown <= 0 && tension > 62 && a.type === 'agitator' && a.behavior !== 'flee') {
        let nearestOfficer = null, officerDist = Infinity;
        for (const officer of (this.crowdPolice || [])) {
          const ox = officer.x - a.x, oy = officer.y - a.y, d2 = ox * ox + oy * oy;
          if (d2 < officerDist) { officerDist = d2; nearestOfficer = officer; }
        }
        if (nearestOfficer && officerDist < 1350 && Math.random() < 0.12) {
          this.interactionMarks.push({ type: 'police-contact', x: a.x, y: a.y, expires: this.currentTime + 850 });
          const direction = a.x < nearestOfficer.x ? -1 : 1;
          a.behavior = 'flee'; a.tx = U.clamp(a.x + direction * U.random(35, 85), 45, 1235);
          a.ty = U.clamp(a.y + U.random(-30, 26), 300, 520); a.speed = U.random(29, 48); a.timer = 1.8;
          a.interactionCooldown = 8;
          if (Math.random() < 0.045 && this.sim.state.incidents.filter(inc => inc.status !== 'resolved').length < this.sim.config.maxIncidents) this.sim.addIncident('clash');
        } else if (tension > 74 && Math.random() < 0.09) {
          let opponent = null, opponentDist = Infinity;
          for (const b of this.people) {
            if (b === a || b.type !== 'agitator' || b.behavior === 'flee') continue;
            const dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy;
            if (d2 < opponentDist) { opponentDist = d2; opponent = b; }
          }
          if (opponent && opponentDist < 650) {
            this.interactionMarks.push({ type: 'group-conflict', x: (a.x + opponent.x) / 2, y: (a.y + opponent.y) / 2, expires: this.currentTime + 700 });
            for (const participant of [a, opponent]) {
              participant.behavior = 'flee'; participant.tx = U.clamp(participant.x + (participant.x < 640 ? -1 : 1) * U.random(25, 55), 40, 1240);
              participant.ty = U.clamp(participant.y + U.random(-25, 25), 300, 520); participant.speed = U.random(25, 42); participant.timer = 1.5; participant.interactionCooldown = 8;
            }
            if (Math.random() < 0.035 && this.sim.state.incidents.filter(inc => inc.status !== 'resolved').length < this.sim.config.maxIncidents) this.sim.addIncident('clash');
          } else if (tension > 70 && Math.random() < 0.10) {
            this._launchCrowdProjectile(a);
            a.interactionCooldown = 6.5;
          } else a.interactionCooldown = 3;
        } else if (tension > 70 && Math.random() < 0.075) {
          this._launchCrowdProjectile(a);
          a.interactionCooldown = 6.5;
        } else a.interactionCooldown = 2.5;
      }

      // People who behave as stewards move toward medical calls and create a small buffer around responders.
      if (dt > 0 && a.behavior === 'helper' && a.timer < 0.2) {
        const medical = this.sim.state.incidents.find(inc => inc.status !== 'resolved' && ['medical', 'accident'].includes(inc.type));
        if (medical) { a.tx = U.clamp(medical.x + U.random(-36, 36), 40, 1240); a.ty = U.clamp(medical.y + U.random(18, 44), 300, 522); a.timer = 1.4; }
      }
    }
    (this.crowdPolice || []).forEach((sprite, i) => {
      if (dt > 0 && Math.random() < 0.015) sprite.x += WORLD_U.random(-2, 2);
      sprite.setDepth(sprite.y + 4);
    });
  }

  _launchCrowdProjectile(agent) {
    const firebrand = agent.behavior === 'arsonist' || Math.random() < 0.24;
    const sign = agent.x < 640 ? 1 : -1;
    const targetX = U.clamp(agent.x + sign * U.random(28, 94), 70, 1210);
    const targetY = U.clamp(agent.y + U.random(-52, 13), 302, 520);
    this.projectiles.push({
      x: agent.x, y: agent.y - 9, startX: agent.x, startY: agent.y - 9,
      targetX, targetY, elapsed: 0, duration: U.random(0.42, 0.78),
      kind: firebrand ? 'firebrand' : 'petard', landed: false
    });
    this.interactionMarks.push({ type: 'throw', x: agent.x, y: agent.y, expires: this.currentTime + 480 });
    if (firebrand) agent.behavior = 'arsonist';
  }

  _updateProjectiles(dt, s) {
    if (!this.projectiles.length || dt <= 0) return;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.elapsed += dt;
      const t = U.clamp(p.elapsed / p.duration, 0, 1);
      p.x = p.startX + (p.targetX - p.startX) * t;
      p.y = p.startY + (p.targetY - p.startY) * t - Math.sin(t * Math.PI) * 27;
      if (t >= 1) {
        if (!p.landed) {
          p.landed = true;
          this.interactionMarks.push({ type: 'throw-impact', x: p.targetX, y: p.targetY, expires: this.currentTime + 640 });
          if (p.kind === 'firebrand' && Math.random() < 0.36 && s.incidents.filter(inc => inc.status !== 'resolved').length < this.sim.config.maxIncidents) {
            this.sim.addIncident('fire');
          } else if (p.kind === 'petard' && Math.random() < 0.05 && s.incidents.filter(inc => inc.status !== 'resolved').length < this.sim.config.maxIncidents) {
            this.sim.addIncident('clash');
          }
        }
        this.projectiles.splice(i, 1);
      }
    }
  }

  _updateVehicles(s, dt) {
    for (let i = this.vehicles.length - 1; i >= 0; i--) {
      const v = this.vehicles[i];
      v.age += dt;
      v.sirenPhase += dt * 9;
      if (v.phase === 'outbound') {
        const wp = v.route[Math.min(v.routeStage, v.route.length - 1)];
        if (wp) {
          v.target = wp;
          const dx = v.target.x - v.x, dy = v.target.y - v.y;
          const d = Math.sqrt(dx*dx + dy*dy) || 1;
          if (d < 15) {
            if (v.routeStage < v.route.length - 1) v.routeStage += 1;
            else {
              v.phase = 'onsite'; v.returnTimer = v.service === 'fire' ? 3.5 : 2.5;
              v.sprite.setAngle(0);
              this.sim.serviceArrive(v.service, v.incidentId, v.id);
            }
          } else {
            const avoid = this._vehicleAvoidance(v);
            const speed = Math.min(v.speed, d * 3.5);
            v.x += (dx / d + avoid.x) * speed * dt;
            v.y += (dy / d + avoid.y) * speed * dt;
            v.sprite.setAngle(Math.atan2(dy, dx) * 180 / Math.PI);
          }
        }
      } else if (v.phase === 'onsite') {
        v.returnTimer -= dt;
        if (v.returnTimer <= 0) {
          v.phase = 'return';
          v.route = [{ x: 1005, y: 550 }, { x: 1130, y: 595 }, { x: 1320, y: 595 }];
          v.routeStage = 0;
        }
      } else if (v.phase === 'return') {
        const wp = v.route[Math.min(v.routeStage, v.route.length - 1)];
        if (!wp) { v.sprite.destroy(); this.vehicles.splice(i, 1); continue; }
        const dx = wp.x - v.x, dy = wp.y - v.y, d = Math.sqrt(dx*dx + dy*dy) || 1;
        if (d < 15) {
          if (v.routeStage < v.route.length - 1) v.routeStage += 1;
          else { v.sprite.destroy(); this.vehicles.splice(i, 1); continue; }
        } else {
          v.x += dx / d * v.speed * 0.9 * dt; v.y += dy / d * v.speed * 0.9 * dt;
          v.sprite.setAngle(Math.atan2(dy, dx) * 180 / Math.PI);
        }
      }
      // Flashing lights are painted in the FX pass; each car retains a simple crisp pixel silhouette.
      v.sprite.setPosition(v.x, v.y).setDepth(v.y + 25);
      if (v.service === 'military') v.sprite.setTint(0xe1e1cf);
    }
  }

  _vehicleAvoidance(v) {
    let ax = 0, ay = 0;
    for (const other of this.vehicles) {
      if (other === v) continue;
      const dx = v.x - other.x, dy = v.y - other.y, d2 = dx*dx + dy*dy;
      if (d2 > 0 && d2 < 900) { const d = Math.sqrt(d2); ax += dx / d * 0.42; ay += dy / d * 0.42; }
    }
    return { x: WORLD_U.clamp(ax, -0.8, 0.8), y: WORLD_U.clamp(ay, -0.8, 0.8) };
  }

  _renderEnvironment(s, time) {
    const hour = s.hour + s.minute / 60;
    let nightAlpha = 0;
    if (hour < 5 || hour > 21) nightAlpha = 0.38;
    else if (hour < 7) nightAlpha = 0.38 * (7 - hour) / 2;
    else if (hour > 19) nightAlpha = 0.38 * (hour - 19) / 2;
    if (s.weather.id === 'fog') nightAlpha += 0.055;
    this.fx.clear();
    if (nightAlpha > 0.005) {
      this.fx.fillStyle(0x091521, nightAlpha);
      this.fx.fillRect(0, 0, 1280, 640);
    }
    // Lamp halos become visible at dawn/night; the furniture remains static in the underlying scene.
    if (nightAlpha > 0.1) {
      this.fx.fillStyle(0xf5d89c, nightAlpha * 0.14);
      [[180,386],[1095,386],[335,450],[945,450]].forEach(([x,y]) => this.fx.fillCircle(x, y, 24));
    }
    for (const inc of s.incidents) {
      if (inc.status === 'resolved') continue;
      if (inc.type === 'fire') {
        const pulse = 0.72 + Math.sin(time * 0.012 + inc.x) * 0.18;
        this.fx.fillStyle(0xf08b36, 0.12); this.fx.fillCircle(inc.x, inc.y - 5, 30 + pulse * 8);
        this.fx.fillStyle(0xd45e30, 0.26); this.fx.fillCircle(inc.x, inc.y - 8, 19 + pulse * 4);
        for (let j = 0; j < 5; j++) {
          const wobble = Math.sin(time * 0.009 + j * 2.1 + inc.id.length) * 6;
          const rise = (time * 0.018 + j * 9) % 21;
          this.fx.fillStyle(j % 2 ? 0xffc66e : 0xed7041, 0.72 - rise * 0.018);
          this.fx.fillTriangle(inc.x + wobble - 5, inc.y - rise - 2, inc.x + wobble + 6, inc.y - rise - 2, inc.x + wobble, inc.y - rise - 15);
        }
        this.fx.fillStyle(0x5b6460, 0.17); this.fx.fillCircle(inc.x - 6, inc.y - 34 - (time % 150) * 0.06, 9);
      } else if (inc.type === 'clash') {
        this.fx.lineStyle(1.5, 0xd56a5d, 0.6); this.fx.strokeCircle(inc.x, inc.y, 16 + Math.sin(time * 0.006) * 3);
        this.fx.fillStyle(0xd56a5d, 0.17); this.fx.fillCircle(inc.x, inc.y, 18);
      } else if (inc.type === 'medical') {
        this.fx.lineStyle(1, 0x8cc2b7, 0.5); this.fx.strokeCircle(inc.x, inc.y, 13 + Math.sin(time * 0.005) * 2);
      } else if (inc.type === 'accident') {
        this.fx.lineStyle(2, 0xd0b16d, 0.48); this.fx.strokeCircle(inc.x, inc.y, 16);
      }
    }
    this.interactionMarks = this.interactionMarks.filter(mark => mark.expires > time);
    for (const mark of this.interactionMarks) {
      const remaining = U.clamp((mark.expires - time) / 850, 0, 1);
      if (mark.type === 'police-contact') {
        this.fx.lineStyle(1.5, 0xd0ad71, remaining * 0.7);
        this.fx.strokeCircle(mark.x, mark.y - 7, 8 + (1 - remaining) * 5);
        this.fx.lineStyle(2, 0xd0ad71, remaining * 0.7);
        this.fx.beginPath(); this.fx.moveTo(mark.x - 5, mark.y - 12); this.fx.lineTo(mark.x + 5, mark.y - 2); this.fx.strokePath();
      } else if (mark.type === 'throw' || mark.type === 'throw-impact') {
        this.fx.lineStyle(1.5, mark.type === 'throw' ? 0xd5b778 : 0xef8b50, remaining * 0.7);
        this.fx.strokeCircle(mark.x, mark.y - 7, 5 + (1 - remaining) * 8);
        if (mark.type === 'throw-impact') {
          this.fx.fillStyle(0xf1a05a, remaining * 0.45); this.fx.fillCircle(mark.x, mark.y - 4, 9 * remaining + 2);
        }
      } else {
        this.fx.lineStyle(1.5, 0xd47768, remaining * 0.75);
        this.fx.strokeCircle(mark.x, mark.y - 7, 9 + (1 - remaining) * 4);
        this.fx.beginPath(); this.fx.moveTo(mark.x - 6, mark.y - 13); this.fx.lineTo(mark.x + 6, mark.y - 1); this.fx.strokePath();
        this.fx.beginPath(); this.fx.moveTo(mark.x + 6, mark.y - 13); this.fx.lineTo(mark.x - 6, mark.y - 1); this.fx.strokePath();
      }
    }
    // Abstract projectiles are short-lived visual effects, not a physical model of real-world devices.
    for (const p of this.projectiles) {
      const t = U.clamp(p.elapsed / p.duration, 0, 1);
      this.fx.lineStyle(2, p.kind === 'firebrand' ? 0xe36c3f : 0xd5bb75, 0.5);
      this.fx.beginPath(); this.fx.moveTo(p.startX, p.startY - 3); this.fx.lineTo(p.x, p.y); this.fx.strokePath();
      this.fx.fillStyle(p.kind === 'firebrand' ? 0xf16a3e : 0xe7d091, 0.2); this.fx.fillCircle(p.x, p.y, p.kind === 'firebrand' ? 10 : 6);
      this.fx.fillStyle(p.kind === 'firebrand' ? 0xffb35f : 0xf5ead0, 0.95); this.fx.fillCircle(p.x, p.y, p.kind === 'firebrand' ? 3.2 : 2.2);
    }
    // Emergency light reflections blink on vehicles and wet stone.
    for (const v of this.vehicles) {
      if (v.phase === 'return') continue;
      const flash = Math.sin(v.sirenPhase) > 0;
      const c1 = v.service === 'fire' ? 0xf0a85e : 0xd9534f;
      this.fx.fillStyle(flash ? c1 : 0x4e9dd0, nightAlpha > 0.07 ? 0.48 : 0.75);
      this.fx.fillCircle(v.x - 3, v.y - 3, 3.2);
      this.fx.fillStyle(flash ? 0x4d9acb : c1, nightAlpha > 0.07 ? 0.48 : 0.75);
      this.fx.fillCircle(v.x + 3, v.y - 3, 3.2);
      if (nightAlpha > 0.08 && flash) {
        this.fx.fillStyle(c1, 0.055); this.fx.fillCircle(v.x, v.y, 23);
      }
    }
    if (s.weather.id === 'rain' || s.weather.id === 'storm') {
      const count = s.weather.id === 'storm' ? 120 : 62;
      this.fx.lineStyle(1, 0xb7c7ca, s.weather.id === 'storm' ? 0.34 : 0.20);
      for (let i = 0; i < count; i++) {
        const x = (i * 101 + time * (s.weather.id === 'storm' ? 0.32 : 0.18)) % 1280;
        const y = (i * 47 + time * (s.weather.id === 'storm' ? 0.66 : 0.39)) % 640;
        this.fx.beginPath(); this.fx.moveTo(x, y); this.fx.lineTo(x - 4, y + 9); this.fx.strokePath();
      }
    } else if (s.weather.id === 'fog') {
      this.fx.fillStyle(0xc9d3d1, 0.16); this.fx.fillRect(0, 235, 1280, 340);
    } else if (s.weather.id === 'heat') {
      this.fx.lineStyle(1, 0xf0dbad, 0.12);
      for (let i = 0; i < 8; i++) {
        const y = 300 + i * 26 + Math.sin(time * 0.001 + i) * 2;
        this.fx.beginPath(); this.fx.moveTo(40, y); this.fx.lineTo(1240, y + Math.sin(i + time * 0.002) * 5); this.fx.strokePath();
      }
    }
  }
}

window.RepublicCityScene = RepublicCityScene;
