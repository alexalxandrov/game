'use strict';
const SIM_U = window.GameUtils;

class RepublicSimulation {
  constructor() {
    this.listeners = new Set();
    this.config = window.GAME_CONFIG;
    this.reset();
  }

  reset() {
    const cfg = this.config || window.GAME_CONFIG;
    this.state = {
      day: 1, hour: 8, minute: 0, speed: 1, paused: false,
      approval: 56, stability: 72, trust: 61, tension: 38,
      unemployment: 7.4, inflation: 4.2, gdpGrowth: 1.8, marketIndex: 102.4,
      treasury: 18.6, dailyRevenue: 146, dailySpending: 158,
      crowdTarget: 86, crowdMood: 'gathering', publicAnger: 42,
      weather: { id: 'clear', label: 'Ясно', icon: '☼', temperature: 18, effect: 0 },
      policies: { tax: 22, welfare: 54, policing: 45, healthcare: 62, infrastructure: 55, environment: 48, mediaFreedom: 68 },
      governmentParty: 'civic', emergencyDays: 0, militaryDeployed: false,
      crimeIndex: 31, serviceQuality: 61, inequality: 43, pollution: 44,
      policePresence: 35, lastAction: 'Нет решения, требующего немедленного вмешательства.',
      lastActionHours: 0, incidents: [], vehicleOrders: [], vehicleSequence: 0,
      resolvedIncidents: 0, casualties: 0, arrests: 0, firesControlled: 0,
      budgetTrend: -0.2, taxMorale: 51, activeStrikes: 0,
      electionResult: null, electionsHeld: 0, hoursElapsed: 0,
      sectorMood: { workers: 52, business: 54, publicServices: 58, youth: 49, regions: 51 },
      previousMetrics: { unemployment: 7.5, inflation: 4.1, gdpGrowth: 1.7 },
      responseCooldown: 0
    };
    this.companies = cfg.companies.map(c => ({ ...c, baseDemand: c.demand, lastProfit: 0, lastHiring: 0, lobby: 0, taxPaid: 0, status: 'stable' }));
    this.parties = cfg.parties.map(p => ({ ...p }));
    this.news = [];
    this.announcements = [];
    this.history = Array.from({ length: 28 }, (_, i) => 98 + Math.sin(i * 0.37) * 3 + Math.random() * 1.6);
    this._hourAccumulator = 0;
    this._tickNumber = 0;
    this._eventHeat = 0;
    this._lastDailyBudget = 0;
    this._lastDayApproval = this.state.approval;
    this._toastQueue = [];
    this._createInitialBriefing();
    this._refreshDerived();
    this._notify('reset');
  }

  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  _notify(type = 'update', payload = null) { for (const fn of this.listeners) { try { fn(type, payload); } catch (err) { console.error(err); } } }

  _createInitialBriefing() {
    this.news = [
      { id: 1, day: 1, hour: 8, category: 'politics', level: 'info', title: 'Кабинет министров открыл рабочую неделю', body: 'В повестке — проект бюджета, состояние городской инфраструктуры и встреча с представителями отраслевых объединений.' },
      { id: 2, day: 1, hour: 8, category: 'city', level: 'info', title: 'На площади Республики проходит собрание граждан', body: 'Участники обсуждают стоимость коммунальных услуг. Обстановка остаётся спокойной, на месте дежурят городские службы.' },
      { id: 3, day: 1, hour: 7, category: 'economy', level: 'info', title: 'Индекс деловой активности держится выше базового уровня', body: 'Компании отмечают устойчивый спрос в торговле и продовольственном секторе, промышленность ожидает новых заказов.' },
      { id: 4, day: 1, hour: 7, category: 'politics', level: 'info', title: 'Оппозиционные фракции запросили слушания по бюджету', body: 'Комитет парламента предложил рассмотреть расходы на здравоохранение, региональные дороги и поддержку семей.' },
      { id: 5, day: 1, hour: 6, category: 'city', level: 'info', title: 'Городские службы работают в штатном режиме', body: 'Патрули и экстренные бригады находятся на дежурстве. Существенных нарушений движения не зафиксировано.' },
      { id: 6, day: 1, hour: 6, category: 'economy', level: 'info', title: 'Цены на продукты растут медленнее, чем месяц назад', body: 'Розничные сети связывают динамику с более стабильными поставками и сезонным увеличением предложения.' }
    ];
    this.announcements = [
      { id: 1, day: 1, hour: 8, text: 'ОПЕРАТИВНОЕ СООБЩЕНИЕ: городские службы работают штатно. Следите за официальными уведомлениями.', level: 'info' },
      { id: 2, day: 1, hour: 8, text: 'ГОРОДСКАЯ СЛУЖБА: на площади Республики открыт проход к остановкам общественного транспорта.', level: 'info' }
    ];
  }

  tick(speed = 1) {
    if (this.state.paused) return;
    const advance = this.config.minutesPerTick * speed;
    this.state.minute += advance;
    this.state.hoursElapsed += advance / 60;
    while (this.state.minute >= 60) {
      this.state.minute -= 60;
      this.state.hour += 1;
      this._hourlyStep();
      if (this.state.hour >= 24) {
        this.state.hour = 0;
        this.state.day += 1;
        this._dailyStep();
      }
    }
    this.state.tension = this._calculateTension();
    this._refreshDerived(false);
    this._tickNumber += 1;
    if (this._tickNumber % 2 === 0) this._notify('update');
  }

  _hourlyStep() {
    const s = this.state;
    const p = s.policies;
    this._economyStep();
    s.lastActionHours += 1;
    if (s.responseCooldown > 0) s.responseCooldown -= 1;
    if (s.emergencyDays > 0 && s.hour % 24 === 0) s.emergencyDays = Math.max(0, s.emergencyDays - 1);
    if (s.emergencyDays <= 0) s.militaryDeployed = false;

    for (const inc of s.incidents) {
      if (inc.status === 'resolved') continue;
      inc.age += 1;
      if (inc.serviceProgress && inc.serviceProgress.fire) {
        if (inc.type === 'fire') inc.severity -= 23;
        else if (inc.type === 'accident') inc.severity -= 6;
      }
      if (inc.serviceProgress && inc.serviceProgress.police && ['clash', 'disturbance', 'demonstration'].includes(inc.type)) {
        inc.severity -= inc.type === 'clash' ? 13 : 5;
      }
      if (inc.serviceProgress && inc.serviceProgress.ambulance && ['medical', 'accident', 'clash'].includes(inc.type)) {
        inc.medicalCare = (inc.medicalCare || 0) + 1;
        if (inc.medicalCare > 1) inc.severity -= 17;
      }
      if (inc.severity <= 0 || (inc.age > 11 && inc.severity < 50)) this.resolveIncident(inc.id, 'Ситуация стабилизирована службами.');
      else if (inc.age > 10 && inc.type === 'fire') { s.pollution = SIM_U.clamp(s.pollution + 1, 0, 100); }
      if (inc.age > 4 && !inc.impactApplied && inc.severity >= 55) {
        inc.impactApplied = true;
        if (inc.type === 'clash') { s.stability -= 2.2; s.trust -= 0.8; s.casualties += SIM_U.randomInt(0, 2); }
        if (inc.type === 'fire') { s.stability -= 1.2; s.publicAnger += 2; }
        if (inc.type === 'medical') { s.trust -= 0.4; }
      }
    }
    s.incidents = s.incidents.filter(i => i.status !== 'resolved' || s.hoursElapsed - i.resolvedAt < 3);

    const tension = this._calculateTension();
    s.tension = tension;
    const goal = SIM_U.clamp(Math.round(18 + tension * 1.05 + (s.weather.effect < 0 ? -7 : 0) + (s.activeStrikes ? 20 : 0) + SIM_U.random(-12, 17)), 12, this.config.maxCrowd);
    s.crowdTarget = Math.round(s.crowdTarget * 0.82 + goal * 0.18);
    s.publicAnger = SIM_U.clamp(s.publicAnger * 0.985 + (tension - 35) * 0.045, 0, 100);
    s.policePresence = SIM_U.clamp(s.policePresence * 0.985 + p.policing * 0.015 - (s.militaryDeployed ? 0.4 : 0), 8, 95);
    if (s.tension > 72 && Math.random() < 0.025 && s.activeStrikes < 3) {
      s.activeStrikes += 1;
      this._eventHeat = SIM_U.clamp(this._eventHeat + 4, 0, 30);
      this.addNews('city', 'alert', 'Отраслевое объединение объявило предупредительную забастовку', 'Работники требуют переговоров о реальных доходах и стоимости жизни. Срок акции пока не определён.');
      this.announce('ГОРОДСКАЯ СЛУЖБА: в нескольких районах возможны задержки общественного транспорта из-за трудовой акции.', 'warning');
    }
    if (s.activeStrikes > 0 && Math.random() < (p.welfare > 60 ? 0.08 : 0.035)) s.activeStrikes -= 1;

    const incidentChance = tension > 78 ? 0.075 : tension > 62 ? 0.047 : tension > 45 ? 0.026 : 0.012;
    const unresolved = s.incidents.filter(i => i.status !== 'resolved');
    if (unresolved.length < this.config.maxIncidents && Math.random() < incidentChance) this._spawnIncident();

    if (Math.random() < 0.035) this._ambientNews();
    if (s.weather.id === 'storm' && Math.random() < 0.04 && unresolved.length < this.config.maxIncidents) this._spawnIncident('accident');
    this._eventHeat = Math.max(0, this._eventHeat - 0.35);
    this._refreshDerived();
  }

  _economyStep() {
    const s = this.state;
    const p = s.policies;
    const previousUnemployment = s.unemployment;
    let totalHiring = 0;
    let totalDemand = 0;
    let totalPriceChange = 0;
    let totalPollution = 0;
    let totalWage = 0;
    let sectorCount = 0;
    const totalRevenue = this._budgetEstimate(p).revenue;
    const totalSpending = this._budgetEstimate(p).spending;

    for (const c of this.companies) {
      let sectorDemandEffect = 0;
      if (c.sector === 'Продовольствие') sectorDemandEffect += (p.welfare - 50) * 0.035;
      if (c.sector === 'Энергетика') sectorDemandEffect += s.weather.id === 'cold' ? 1.7 : s.weather.id === 'heat' ? 1.1 : 0;
      if (c.sector === 'Строительство') sectorDemandEffect += (p.infrastructure - 50) * 0.045;
      if (c.sector === 'Промышленность') sectorDemandEffect -= Math.max(0, p.environment - 55) * 0.035;
      if (c.sector === 'Транспорт') sectorDemandEffect += (p.infrastructure - 50) * 0.02;
      const macroEffect = (s.gdpGrowth - 1.8) * 0.014 - (s.inflation - 4.2) * 0.025 + (p.welfare - 54) * 0.003 + sectorDemandEffect * 0.1 + (c.baseDemand - c.demand) * 0.04;
      c.demand = SIM_U.clamp(c.demand + macroEffect + SIM_U.random(-0.24, 0.24), 35, 116);
      const previousProduction = c.production;
      c.production = SIM_U.clamp(c.production + (c.demand - c.production) * 0.095 + SIM_U.random(-0.8, 0.8), 35, 112);
      const shortage = c.demand - c.production;
      const previousPrice = c.price;
      c.price = SIM_U.clamp(c.price * (1 + shortage * 0.00034 + (s.inflation - 3.5) * 0.00007 + SIM_U.random(-0.0013, 0.0013)), 0.72, 1.95);
      const margin = (c.demand * 0.094 + (c.price - 1) * 9 - p.tax * 0.17 - c.pollution * Math.max(0, p.environment - 45) * 0.004 + SIM_U.random(-1.8, 1.8));
      const profit = margin;
      c.lastProfit = profit;
      c.capital = SIM_U.clamp(c.capital + profit * 0.24, 120, 2200);
      const hiringPressure = (c.demand - 72) * 0.055 + (c.capital > 400 ? 0.25 : -0.3) - Math.max(0, p.tax - 26) * c.sensitivity * 0.08;
      let hiring = 0;
      if (hiringPressure > 0.2 && Math.random() < 0.65) hiring = SIM_U.randomInt(4, 28);
      else if (hiringPressure < -0.5 && Math.random() < 0.6) hiring = -SIM_U.randomInt(3, 24);
      c.employees = Math.max(400, c.employees + hiring);
      c.lastHiring = hiring;
      totalHiring += hiring;
      c.wage = SIM_U.clamp(c.wage + (s.inflation > 5.5 ? 0.002 : 0.0005) + (c.demand > 90 ? 0.001 : 0) + SIM_U.random(-0.0013, 0.0013), 0.65, 1.8);
      c.taxPaid = Math.max(0.1, profit * p.tax * 0.035 + c.employees / 100000);
      c.lobby = SIM_U.clamp(c.lobby * 0.94 + Math.max(0, c.capital - 450) * 0.002 + SIM_U.random(0, 0.6), 0, 18);
      c.pollution = SIM_U.clamp(c.pollution + (c.production - 70) * 0.013 - (p.environment - 50) * 0.012 + SIM_U.random(-0.4, 0.4), 5, 100);
      c.status = c.demand - c.production > 11 ? 'shortage' : profit < -1 ? 'pressure' : c.demand > 90 && profit > 3 ? 'growth' : 'stable';
      totalDemand += c.demand;
      totalPriceChange += c.price - previousPrice;
      totalPollution += c.pollution;
      totalWage += c.wage;
      sectorCount += 1;
      if (previousProduction < 0) totalHiring += 0;
    }
    const avgDemand = totalDemand / Math.max(1, this.companies.length);
    const avgPriceDelta = totalPriceChange / Math.max(1, this.companies.length);
    const avgPollution = totalPollution / Math.max(1, this.companies.length);
    const avgWage = totalWage / Math.max(1, sectorCount);
    s.unemployment = SIM_U.clamp(s.unemployment - totalHiring * 0.000042 + (s.inflation > 7 ? 0.008 : 0) + SIM_U.random(-0.018, 0.018), 2.1, 22);
    s.inflation = SIM_U.clamp(s.inflation + avgPriceDelta * 0.68 + (s.weather.id === 'heat' ? 0.012 : 0) - (avgDemand < 75 ? 0.012 : 0) + SIM_U.random(-0.018, 0.018), -1, 24);
    s.gdpGrowth = SIM_U.clamp(s.gdpGrowth + (avgDemand - 82) * 0.0009 - Math.max(0, s.inflation - 5) * 0.003 + (p.infrastructure - 55) * 0.00015 + SIM_U.random(-0.01, 0.01), -12, 12);
    s.marketIndex = SIM_U.clamp(s.marketIndex + (avgDemand - 82) * 0.002 + (s.gdpGrowth - 1.8) * 0.001 + SIM_U.random(-0.04, 0.04), 64, 143);
    this.history.push(s.marketIndex);
    if (this.history.length > 40) this.history.shift();
    s.pollution = SIM_U.clamp(avgPollution - (p.environment - 50) * 0.09 + SIM_U.random(-0.3, 0.3), 5, 100);
    s.serviceQuality = SIM_U.clamp(38 + p.healthcare * 0.35 + p.infrastructure * 0.14 + p.welfare * 0.12 + SIM_U.random(-0.15, 0.15), 25, 96);
    s.inequality = SIM_U.clamp(55 - p.welfare * 0.24 + (s.unemployment - 6) * 1.2 + (p.tax < 18 ? 3 : 0) + SIM_U.random(-0.12, 0.12), 15, 85);
    s.taxMorale = SIM_U.clamp(69 - Math.max(0, p.tax - 18) * 1.45 + (s.gdpGrowth > 2 ? 4 : 0) + SIM_U.random(-0.3, 0.3), 12, 90);
    s.dailyRevenue = totalRevenue;
    s.dailySpending = totalSpending;
    s.treasury += (totalRevenue - totalSpending) / 1000 / 24;
    s.budgetTrend = ((totalRevenue - totalSpending) / Math.max(1, totalSpending)) * 100;
    s.previousMetrics = s.previousMetrics || { unemployment: previousUnemployment, inflation: s.inflation, gdpGrowth: s.gdpGrowth };
    if (Math.abs(s.unemployment - previousUnemployment) > 0.11 && Math.random() < 0.09) {
      this.addNews('economy', s.unemployment > previousUnemployment ? 'warning' : 'good', s.unemployment > previousUnemployment ? 'Компании сокращают найм на фоне слабого спроса' : 'Частный сектор расширяет занятость', s.unemployment > previousUnemployment ? 'Часть предприятий перенесла инвестиции. Экономисты ждут реакции кабинета на состояние рынка труда.' : 'Предприятия торговли и продовольственного сектора сообщили о вакансиях и дополнительных сменах.');
    }
    if (s.inflation > 7.5 && Math.random() < 0.12) this.addNews('economy', 'alert', 'Рост цен заметнее всего в энергетике и логистике', 'Издержки поставщиков переходят в конечные цены. Аналитики обращают внимание на стоимость перевозок и энергоресурсов.');
  }

  _dailyStep() {
    const s = this.state;
    const p = s.policies;
    s.previousMetrics = { unemployment: s.unemployment, inflation: s.inflation, gdpGrowth: s.gdpGrowth };
    const macroScore = (s.gdpGrowth - 1.5) * 0.32 - (s.unemployment - 6.5) * 0.26 - (s.inflation - 3.5) * 0.17;
    const serviceScore = (s.serviceQuality - 60) * 0.045;
    const economicGrievance = (s.unemployment - 6.5) * 0.16 + (s.inflation - 3.5) * 0.12;
    const change = macroScore + serviceScore - economicGrievance + (p.welfare - 54) * 0.014 + (p.healthcare - 62) * 0.009 + (p.infrastructure - 55) * 0.007 - Math.max(0, p.tax - 25) * 0.018 + SIM_U.random(-1.1, 1.1) - this._eventHeat * 0.035;
    s.approval = SIM_U.clamp(s.approval + change, 5, 94);
    s.stability = SIM_U.clamp(s.stability + (s.tension < 40 ? 0.3 : -0.33) + (s.gdpGrowth > 2 ? 0.12 : 0) - (s.incidents.some(i => i.type === 'clash' && i.status !== 'resolved') ? 0.8 : 0) - (s.militaryDeployed ? 0.5 : 0) + SIM_U.random(-0.5, 0.5), 8, 97);
    s.trust = SIM_U.clamp(s.trust + (p.mediaFreedom - 60) * 0.009 + (s.approval > 55 ? 0.07 : -0.06) - (s.militaryDeployed ? 0.65 : 0) - (s.emergencyDays > 0 ? 0.18 : 0) + SIM_U.random(-0.35, 0.35), 8, 95);
    this._updatePartySupport();
    this._changeWeather();
    s.crimeIndex = SIM_U.clamp(s.crimeIndex + (s.tension - 42) * 0.025 - p.policing * 0.003 + SIM_U.random(-0.8, 0.8), 6, 95);
    s.crowdTarget = SIM_U.clamp(Math.round(18 + s.tension * 1.05 + s.activeStrikes * 12 + SIM_U.random(-5, 14)), 12, this.config.maxCrowd);
    if (s.emergencyDays > 0) this.announce(`ПРАВИТЕЛЬСТВО: действует режим чрезвычайного положения. До пересмотра режима — ${s.emergencyDays} дн.`, 'warning');
    else if (s.tension > 70) this.announce('ГОРОДСКОЕ ОПОВЕЩЕНИЕ: на центральной площади многолюдно. Используйте обозначенные проходы и выполняйте требования экстренных служб.', 'warning');
    else this.announce('ГОРОДСКОЕ ОПОВЕЩЕНИЕ: обстановка в центральном районе контролируется городскими службами.', 'info');
    if (s.day % this.config.electionInterval === 0 && s.day > 1) this._holdElection();
    if (s.day % 5 === 0) {
      this.addNews('politics', 'info', 'Опубликован ежедневный обзор работы кабинета', `Одобрение правительства — ${Math.round(s.approval)}%. Ключевые темы повестки: цены, качество услуг и состояние городских дорог.`);
    }
    this._notify('daily');
  }

  _updatePartySupport() {
    const s = this.state;
    const p = s.policies;
    const byId = Object.fromEntries(this.parties.map(x => [x.id, x]));
    const target = {
      civic: 30 + (s.approval - 50) * 0.26 + (s.trust - 55) * 0.08,
      labor: 23 + (p.welfare - 50) * 0.15 - (s.unemployment - 6.5) * 0.32 + (s.inequality - 42) * 0.07,
      reform: 19 + (s.gdpGrowth - 1.5) * 1.1 + (22 - p.tax) * 0.23 + (s.taxMorale - 50) * 0.06,
      green: 13 + (p.environment - 48) * 0.12 - (s.pollution - 40) * 0.09,
      regional: 10 + (p.infrastructure - 55) * 0.1 + (s.inequality - 42) * 0.035
    };
    const total = this.parties.reduce((sum, party) => {
      const candidate = byId[party.id];
      candidate.support = SIM_U.clamp(candidate.support * 0.92 + (target[party.id] || 10) * 0.08 + SIM_U.random(-0.35, 0.35), 2, 58);
      return sum + candidate.support;
    }, 0);
    this.parties.forEach(party => party.support = party.support / total * 100);
  }

  _holdElection() {
    const s = this.state;
    const ranked = [...this.parties].sort((a, b) => b.support - a.support);
    const winner = ranked[0];
    const incumbentWon = winner.id === s.governmentParty;
    s.electionsHeld += 1;
    s.electionResult = { day: s.day, winner: winner.name, voteShare: winner.support, incumbentWon };
    s.governmentParty = winner.id;
    s.approval = SIM_U.clamp(s.approval + (incumbentWon ? 4.2 : -1.6) + SIM_U.random(-1, 1), 5, 94);
    s.trust = SIM_U.clamp(s.trust + (incumbentWon ? 1.8 : 0.2) + SIM_U.random(-0.5, 0.5), 8, 95);
    this.addNews('politics', 'alert', `Итоги выборов: ${winner.name} получила наибольшую долю голосов`, `По модельному подсчёту партия набрала ${SIM_U.fmt(winner.support, 1)}%. ${incumbentWon ? 'Коалиция сохраняет мандат.' : 'Формируется новая правительственная коалиция.'}`);
    this.announce(`ИЗБИРАТЕЛЬНАЯ КОМИССИЯ: предварительные итоги опубликованы. ${winner.name} — ${SIM_U.fmt(winner.support, 1)}%.`, 'warning');
    if (!incumbentWon) {
      const shift = s.policies.tax > 27 ? -2 : 1;
      s.policies.welfare = SIM_U.clamp(s.policies.welfare + shift, 0, 100);
      s.policies.infrastructure = SIM_U.clamp(s.policies.infrastructure + 1, 0, 100);
    }
    this._notify('election', s.electionResult);
  }

  _changeWeather() {
    if (Math.random() > 0.58) return;
    const patterns = [
      { id: 'clear', label: 'Ясно', icon: '☼', temperature: SIM_U.randomInt(16, 25), effect: 0.3 },
      { id: 'cloud', label: 'Облачно', icon: '☁', temperature: SIM_U.randomInt(11, 19), effect: 0 },
      { id: 'rain', label: 'Дождь', icon: '☂', temperature: SIM_U.randomInt(8, 15), effect: -0.8 },
      { id: 'fog', label: 'Туман', icon: '≋', temperature: SIM_U.randomInt(6, 12), effect: -0.6 },
      { id: 'heat', label: 'Жара', icon: '☼', temperature: SIM_U.randomInt(28, 34), effect: -0.7 },
      { id: 'storm', label: 'Гроза', icon: 'ϟ', temperature: SIM_U.randomInt(10, 17), effect: -1.8 },
      { id: 'cold', label: 'Похолодание', icon: '❄', temperature: SIM_U.randomInt(-3, 6), effect: -0.9 }
    ];
    const previous = this.state.weather.id;
    this.state.weather = SIM_U.choose(patterns);
    if (previous !== this.state.weather.id) {
      this.addNews('city', 'info', `Погодная служба: ${this.state.weather.label.toLowerCase()} в центральном районе`, `Температура ${Math.round(this.state.weather.temperature)}°. Погодные условия учтены в модели спроса, передвижения людей и работы служб.`);
      if (['storm', 'heat', 'cold'].includes(this.state.weather.id)) this.announce(`МЕТЕОСЛУЖБА: ${this.state.weather.label.toUpperCase()}. Температура ${Math.round(this.state.weather.temperature)}°. Будьте внимательны на улице.`, 'warning');
    }
  }

  _calculateTension() {
    const s = this.state;
    const p = s.policies;
    let tension = 24 + (60 - s.approval) * 0.7 + (s.unemployment - 6) * 2 + (s.inflation - 3) * 1.6 + (100 - s.stability) * 0.15;
    tension -= (p.policing - 45) * 0.075;
    tension -= (p.welfare - 50) * 0.1;
    tension -= (p.healthcare - 50) * 0.06;
    tension += (s.weather.effect < -1 ? 2 : 0) + s.activeStrikes * 5 + this._eventHeat * 0.45;
    if (s.militaryDeployed) tension += 6;
    if (s.emergencyDays > 0) tension += 3;
    const liveIncidents = s.incidents.filter(i => i.status !== 'resolved');
    tension += liveIncidents.filter(i => i.type === 'clash' || i.type === 'fire').length * 2;
    return SIM_U.clamp(tension, 4, 98);
  }

  _budgetEstimate(policies = this.state.policies) {
    const s = this.state;
    const revenue = 146 + (policies.tax - 22) * 4.15 + (s.gdpGrowth - 1.8) * 2.1 + (s.marketIndex - 102) * 0.3;
    const spending = 158 + (policies.welfare - 54) * 0.62 + (policies.healthcare - 62) * 0.48 + (policies.infrastructure - 55) * 0.43 + (policies.policing - 45) * 0.33 + (policies.environment - 48) * 0.23;
    return { revenue: Math.max(45, revenue), spending: Math.max(60, spending), balance: revenue - spending };
  }

  previewBudget(policies) { return this._budgetEstimate(policies); }

  applyPolicies(next) {
    const s = this.state;
    const previous = { ...s.policies };
    const beforeBudget = this._budgetEstimate(previous);
    s.policies = { ...previous, ...next };
    const afterBudget = this._budgetEstimate(s.policies);
    const welfareDiff = s.policies.welfare - previous.welfare;
    const healthcareDiff = s.policies.healthcare - previous.healthcare;
    const freedomDiff = s.policies.mediaFreedom - previous.mediaFreedom;
    const taxDiff = s.policies.tax - previous.tax;
    s.approval = SIM_U.clamp(s.approval + welfareDiff * 0.035 + healthcareDiff * 0.025 + freedomDiff * 0.012 - Math.max(0, taxDiff) * 0.16 + Math.max(0, -taxDiff) * 0.06, 5, 94);
    s.trust = SIM_U.clamp(s.trust + freedomDiff * 0.035 - Math.max(0, 50 - s.policies.mediaFreedom) * 0.025, 8, 95);
    s.taxMorale = SIM_U.clamp(s.taxMorale - taxDiff * 0.8, 10, 95);
    s.lastAction = 'Пакет экономической и социальной политики утверждён.';
    s.lastActionHours = 0;
    this._eventHeat = SIM_U.clamp(this._eventHeat + Math.max(0, taxDiff - 4) * 0.5 + Math.max(0, -welfareDiff) * 0.06, 0, 30);
    this.addNews('politics', 'alert', 'Кабинет утвердил новый пакет государственной политики', `Налог на прибыль — ${s.policies.tax}%; социальная поддержка — ${s.policies.welfare}/100; расходы на здравоохранение — ${s.policies.healthcare}/100. Оценка дневного баланса бюджета: ${SIM_U.signed(afterBudget.balance, 1, ' млн кр.')}.`);
    this.announce('КАБИНЕТ МИНИСТРОВ: вступили в силу обновлённые параметры экономической и социальной политики. Подробности опубликованы в правительственном бюллетене.', 'info');
    if (afterBudget.balance < beforeBudget.balance - 8) this.addNews('economy', 'warning', 'Аналитики пересматривают прогноз дефицита бюджета', 'Новый набор обязательств увеличивает потребность в доходах или заимствованиях. Эффект для услуг и спроса будет проявляться постепенно.');
    this._refreshDerived();
    this._notify('policy');
    return { beforeBudget, afterBudget };
  }

  enactAction(action) {
    const s = this.state;
    if (s.responseCooldown > 0 && action !== 'ignore') {
      this._notify('toast', { message: 'Штаб ещё оценивает предыдущие меры. Попробуйте позднее.', tone: 'warning' });
      return false;
    }
    const center = { x: SIM_U.randomInt(540, 740), y: SIM_U.randomInt(360, 465) };
    if (action === 'negotiate') {
      s.tension = SIM_U.clamp(s.tension - 8, 0, 100);
      s.publicAnger = SIM_U.clamp(s.publicAnger - 8, 0, 100);
      s.trust = SIM_U.clamp(s.trust + 2.4, 0, 100);
      s.approval = SIM_U.clamp(s.approval + 1.1, 0, 100);
      s.activeStrikes = Math.max(0, s.activeStrikes - 1);
      s.lastAction = 'Переговоры начаты. Представители граждан приглашены за стол диалога.';
      this.addNews('politics', 'good', 'Правительство начало переговоры с представителями собрания', 'Встреча посвящена стоимости жизни, доступности муниципальных услуг и графику консультаций. Стороны договорились продолжить обсуждение.');
      this.announce('ПРАВИТЕЛЬСТВО: представители граждан приглашены к открытому диалогу. Просим сохранять проходы для экстренных служб.', 'info');
      s.vehicleOrders.push({ id: ++s.vehicleSequence, service: 'police', x: center.x, y: center.y, incidentId: null, purpose: 'liaison' });
      s.responseCooldown = 2;
    } else if (action === 'police') {
      s.policePresence = SIM_U.clamp(s.policePresence + 24, 0, 100);
      s.crimeIndex = SIM_U.clamp(s.crimeIndex - 3, 0, 100);
      s.stability = SIM_U.clamp(s.stability + 1.2, 0, 100);
      s.trust = SIM_U.clamp(s.trust - 1.6, 0, 100);
      s.tension = SIM_U.clamp(s.tension + (s.tension > 62 ? 2.5 : -2), 0, 100);
      s.lastAction = 'Направлено дополнительное полицейское подкрепление. Приоритет — безопасные коридоры и предотвращение столкновений.';
      this.addNews('city', 'alert', 'К площади Республики направлено дополнительное полицейское подкрепление', 'Командование сообщило о задаче разделять конфликтующие группы, обеспечивать доступ медикам и не перекрывать эвакуационные маршруты.');
      this.announce('ПОЛИЦИЯ: сформированы безопасные проходы. Не препятствуйте движению медицинских и пожарных бригад.', 'warning');
      for (let i = 0; i < 2; i++) s.vehicleOrders.push({ id: ++s.vehicleSequence, service: 'police', x: center.x + SIM_U.randomInt(-55, 55), y: center.y + SIM_U.randomInt(-22, 22), incidentId: null, purpose: 'reinforcement' });
      s.responseCooldown = 3;
    } else if (action === 'emergency') {
      s.emergencyDays = Math.max(s.emergencyDays, 2);
      s.stability = SIM_U.clamp(s.stability + 5.5, 0, 100);
      s.tension = SIM_U.clamp(s.tension + 7, 0, 100);
      s.trust = SIM_U.clamp(s.trust - 5.5, 0, 100);
      s.approval = SIM_U.clamp(s.approval - 2.6, 0, 100);
      s.lastAction = 'Введён временный режим чрезвычайного положения сроком на два модельных дня. Требуется последующий пересмотр.';
      this.addNews('politics', 'alert', 'Правительство объявило режим чрезвычайного положения на два дня', 'Мера расширяет координационные полномочия служб, но ограничивает часть обычных процедур. Парламентский комитет запросил обоснование и сроки пересмотра.');
      this.announce('ОПОВЕЩЕНИЕ: в центральном районе действует временный особый правовой режим. Следуйте указаниям городских служб и официальным сообщениям.', 'critical');
      s.vehicleOrders.push({ id: ++s.vehicleSequence, service: 'police', x: center.x, y: center.y, incidentId: null, purpose: 'emergency' });
      s.responseCooldown = 5;
    } else if (action === 'military') {
      s.militaryDeployed = true;
      s.emergencyDays = Math.max(s.emergencyDays, 1);
      s.stability = SIM_U.clamp(s.stability + 7, 0, 100);
      s.tension = SIM_U.clamp(s.tension + 14, 0, 100);
      s.trust = SIM_U.clamp(s.trust - 12, 0, 100);
      s.approval = SIM_U.clamp(s.approval - 6.5, 0, 100);
      s.publicAnger = SIM_U.clamp(s.publicAnger + 14, 0, 100);
      s.lastAction = 'Запрошена военная помощь гражданским службам. Решение существенно повышает риск долгосрочного кризиса доверия.';
      this.addNews('politics', 'critical', 'Военные подразделения привлечены к обеспечению порядка в центральном районе', 'Решение вызвало общественную дискуссию о пределах полномочий. Правозащитные организации требуют прозрачного контроля и быстрого возврата к гражданскому управлению.');
      this.announce('ОПОВЕЩЕНИЕ: привлечены дополнительные силы для поддержки экстренных служб. Избегайте опасных зон и сохраняйте свободными проезды.', 'critical');
      s.vehicleOrders.push({ id: ++s.vehicleSequence, service: 'military', x: center.x, y: center.y, incidentId: null, purpose: 'support' });
      s.responseCooldown = 6;
    } else if (action === 'ignore') {
      s.tension = SIM_U.clamp(s.tension + (s.tension > 48 ? 2.1 : -0.5), 0, 100);
      s.trust = SIM_U.clamp(s.trust + 0.4, 0, 100);
      s.lastAction = 'Штаб продолжает наблюдение. Новые силы не направляются; инциденты остаются на ответственности дежурных служб.';
      this.addNews('politics', 'info', 'Кабинет решил продолжить наблюдение без новых ограничений', 'В официальном сообщении указано, что дополнительные меры пока не вводятся. Представители собрания ожидают публичного графика консультаций.');
      s.responseCooldown = 1;
    } else return false;
    s.lastActionHours = 0;
    this._eventHeat = SIM_U.clamp(this._eventHeat + (action === 'military' ? 10 : action === 'emergency' ? 5 : action === 'police' ? 2 : action === 'negotiate' ? -5 : 1), 0, 30);
    this._refreshDerived();
    this._notify('action', action);
    return true;
  }

  _spawnIncident(forcedType = null) {
    const s = this.state;
    const tension = s.tension;
    let type = forcedType;
    if (!type) {
      const options = [
        { value: 'disturbance', weight: tension < 50 ? 45 : 18 },
        { value: 'clash', weight: tension > 65 ? 38 : 10 },
        { value: 'medical', weight: 20 },
        { value: 'fire', weight: tension > 65 ? 15 : 4 },
        { value: 'demonstration', weight: 26 },
        { value: 'accident', weight: s.weather.id === 'storm' ? 27 : 12 }
      ];
      type = SIM_U.weightedPick(options, 'weight').value;
    }
    const dictionary = {
      disturbance: { label: 'Нарушение порядка', service: 'police', severity: SIM_U.randomInt(28, 58), level: 'warning', x: SIM_U.randomInt(480, 820), y: SIM_U.randomInt(330, 470) },
      clash: { label: 'Столкновение групп', service: 'police', severity: SIM_U.randomInt(58, 88), level: 'critical', x: SIM_U.randomInt(500, 780), y: SIM_U.randomInt(345, 475) },
      medical: { label: 'Медицинская помощь', service: 'ambulance', severity: SIM_U.randomInt(26, 56), level: 'warning', x: SIM_U.randomInt(480, 830), y: SIM_U.randomInt(340, 480) },
      fire: { label: 'Очаг возгорания', service: 'fire', severity: SIM_U.randomInt(55, 86), level: 'critical', x: SIM_U.randomInt(520, 770), y: SIM_U.randomInt(355, 470) },
      demonstration: { label: 'Собрание граждан', service: 'police', severity: SIM_U.randomInt(18, 46), level: 'info', x: SIM_U.randomInt(490, 800), y: SIM_U.randomInt(335, 465) },
      accident: { label: 'Дорожное происшествие', service: 'ambulance', severity: SIM_U.randomInt(36, 68), level: 'warning', x: SIM_U.randomInt(400, 870), y: SIM_U.randomInt(515, 560) }
    };
    const base = dictionary[type];
    if (!base || s.incidents.filter(i => i.status !== 'resolved').length >= this.config.maxIncidents) return null;
    const inc = {
      id: `INC-${String(s.day).padStart(2, '0')}-${String(++s.vehicleSequence).padStart(3, '0')}`,
      type, label: base.label, service: base.service, severity: base.severity,
      level: base.level, x: base.x, y: base.y, age: 0,
      status: 'open', createdAt: s.hoursElapsed, resolvedAt: null,
      serviceProgress: {}, dispatchedServices: {}, impactApplied: false, medicalCare: 0
    };
    s.incidents.push(inc);
    if (type === 'fire') {
      this.addNews('city', 'critical', 'На площади зарегистрировано возгорание', 'Диспетчерская направила пожарную бригаду. Медицинские службы находятся в готовности, проходы для техники должны оставаться свободными.');
      this.announce('ЭКСТРЕННОЕ ОПОВЕЩЕНИЕ: в центральном районе работает пожарная бригада. Не приближайтесь к ограждённой зоне и не перекрывайте проезд.', 'critical');
    } else if (type === 'clash') {
      this.addNews('city', 'alert', 'Поступило сообщение о столкновении на площади', 'Дежурные службы оценивают обстановку. Приоритет — оказание помощи пострадавшим и разъединение конфликтующих сторон.');
      this.announce('ПОЛИЦИЯ: в отдельном секторе площади ограничено движение пешеходов. Пользуйтесь обходными маршрутами и выполняйте указания дежурных.', 'warning');
    } else if (type === 'medical') {
      this.addNews('city', 'warning', 'На площади потребовалась медицинская помощь', 'Диспетчерская направила бригаду скорой помощи. Сотрудники просят освободить коридор для подъезда автомобиля.');
    } else if (type === 'accident') {
      this.addNews('city', 'warning', 'Дорожная служба сообщает о происшествии у площади', 'Возможны кратковременные задержки. Экстренные службы направлены к месту, водителям следует снижать скорость.');
    }
    this._notify('incident', inc);
    return inc;
  }

  addIncident(type) { return this._spawnIncident(type); }

  resolveIncident(id, note = 'Инцидент закрыт диспетчерской.') {
    const inc = this.state.incidents.find(item => item.id === id);
    if (!inc || inc.status === 'resolved') return;
    inc.status = 'resolved';
    inc.resolvedAt = this.state.hoursElapsed;
    this.state.resolvedIncidents += 1;
    if (inc.type === 'fire') this.state.firesControlled += 1;
    if (inc.type === 'clash' && inc.severity > 65) this.state.casualties += SIM_U.randomInt(0, 1);
    this.addNews('city', 'good', `${inc.label}: ситуация стабилизирована`, note);
    this._notify('incident-resolved', inc);
  }

  serviceArrive(service, incidentId, vehicleId = null) {
    const s = this.state;
    const inc = incidentId ? s.incidents.find(i => i.id === incidentId) : null;
    if (inc && inc.status !== 'resolved') {
      inc.serviceProgress[service] = true;
      inc.status = 'responding';
      if (service === 'ambulance') {
        this.addNews('city', 'info', 'Медицинская бригада прибыла к месту вызова', 'Пострадавшим оказывается помощь; диспетчерская уточняет необходимость дополнительных ресурсов.');
      } else if (service === 'fire') {
        this.addNews('city', 'info', 'Пожарная бригада приступила к ликвидации возгорания', 'Пожарные локализуют очаг. После проверки безопасного периметра движение будет постепенно восстановлено.');
      }
    } else if (service === 'police' && !inc) {
      s.policePresence = SIM_U.clamp(s.policePresence + 3, 0, 100);
      if (s.tension > 50 && Math.random() < 0.45) s.tension = SIM_U.clamp(s.tension - 1.5, 0, 100);
    }
    this._notify('service-arrive', { service, incidentId, vehicleId });
  }

  _ambientNews() {
    const s = this.state;
    const candidates = [];
    if (s.marketIndex > 106) candidates.push({ category: 'economy', level: 'good', title: 'Розничный оборот прибавил за счёт внутреннего спроса', body: 'Предприятия торговли сообщают о более активном потоке покупателей. Эксперты ожидают, что эффект будет зависеть от динамики реальных доходов.' });
    if (s.pollution > 58) candidates.push({ category: 'city', level: 'warning', title: 'Экологический мониторинг отметил повышенную нагрузку воздуха', body: 'Основной вклад в модельный показатель дают промышленность и энергетика. Ведомства обсуждают график проверок и инвестиции в модернизацию.' });
    if (s.serviceQuality > 70) candidates.push({ category: 'politics', level: 'good', title: 'Муниципальные учреждения отмечают снижение очередей', body: 'Дополнительные смены и обновление инфраструктуры сократили время ожидания в нескольких учреждениях.' });
    if (s.tension > 62) candidates.push({ category: 'city', level: 'alert', title: 'На центральных улицах сохраняется повышенная активность', body: 'Муниципальный транспорт работает с возможными задержками. Диспетчерская рекомендует учитывать текущие ограничения движения.' });
    if (s.unemployment > 9) candidates.push({ category: 'economy', level: 'warning', title: 'Экономисты призывают обсудить программы занятости', body: 'Эксперты предлагают оценить переобучение, поддержку малого бизнеса и доступность вакансий в регионах.' });
    if (candidates.length) { const item = SIM_U.choose(candidates); this.addNews(item.category, item.level, item.title, item.body); }
  }

  addNews(category, level, title, body) {
    const item = { id: `${this.state.day}-${this.state.hour}-${Date.now()}-${Math.random().toString(16).slice(2, 5)}`, day: this.state.day, hour: this.state.hour, category, level, title, body };
    this.news.unshift(item);
    if (this.news.length > this.config.maxNews) this.news.length = this.config.maxNews;
    this._notify('news', item);
    return item;
  }

  announce(text, level = 'info') {
    const item = { id: `${this.state.day}-${this.state.hour}-${Date.now()}`, day: this.state.day, hour: this.state.hour, text, level };
    this.announcements.unshift(item);
    if (this.announcements.length > 12) this.announcements.length = 12;
    this._notify('announcement', item);
    return item;
  }

  _refreshDerived(notify = true) {
    const s = this.state;
    s.tension = this._calculateTension();
    s.crowdMood = s.tension > 76 ? 'volatile' : s.tension > 60 ? 'tense' : s.tension > 42 ? 'gathering' : 'calm';
    s.dailyRevenue = this._budgetEstimate().revenue;
    s.dailySpending = this._budgetEstimate().spending;
    if (notify) this._notify('derived');
  }

  snapshot() {
    return {
      version: this.config.version,
      state: SIM_U.safeClone(this.state),
      companies: SIM_U.safeClone(this.companies),
      parties: SIM_U.safeClone(this.parties),
      news: SIM_U.safeClone(this.news),
      announcements: SIM_U.safeClone(this.announcements),
      history: SIM_U.safeClone(this.history),
      tickNumber: this._tickNumber,
      eventHeat: this._eventHeat
    };
  }

  loadSnapshot(snapshot) {
    if (!snapshot || !snapshot.state || !Array.isArray(snapshot.companies)) throw new Error('Файл сохранения имеет неверный формат.');
    this.state = snapshot.state;
    this.companies = snapshot.companies;
    this.parties = Array.isArray(snapshot.parties) ? snapshot.parties : this.config.parties.map(p => ({ ...p }));
    this.news = Array.isArray(snapshot.news) ? snapshot.news : [];
    this.announcements = Array.isArray(snapshot.announcements) ? snapshot.announcements : [];
    this.history = Array.isArray(snapshot.history) ? snapshot.history : [];
    this._tickNumber = snapshot.tickNumber || 0;
    this._eventHeat = snapshot.eventHeat || 0;
    this._hourAccumulator = 0;
    this._refreshDerived(false);
    this._notify('load');
  }
}

window.RepublicSimulation = RepublicSimulation;
