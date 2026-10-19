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
      crowdTarget: 520, crowdMood: 'gathering', publicAnger: 42,
      cityPopulation: this.config.cityPopulation || 5000, mobilizationSurge: 0, roadBlockage: 0.04,
      activeNegotiation: null, negotiationSequence: 0, lastMobilizationHour: -8, protestPhase: 'Гражданское собрание',
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
      responseCooldown: 0, lastResponseAction: null
    };
    this.companies = cfg.companies.map(c => ({ ...c, baseDemand: c.demand, lastProfit: 0, lastHiring: 0, lobby: 0, taxPaid: 0, status: 'stable' }));
    this.parties = cfg.parties.map(p => ({ ...p }));
    this.news = [];
    this.announcements = [];
    this.history = Array.from({ length: 28 }, (_, i) => 98 + Math.sin(i * 0.37) * 3 + Math.random() * 1.6);
    this._hourAccumulator = 0;
    this._tickNumber = 0;
    this._eventHeat = 0;
    this.state.crowdTarget = this._estimateCrowdSize();
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
        if (inc.type === 'fire' || inc.type === 'arson') inc.severity -= 23;
        else if (inc.type === 'accident') inc.severity -= 6;
      }
      if (inc.serviceProgress && inc.serviceProgress.police && ['clash', 'riot', 'blockade', 'disturbance', 'demonstration'].includes(inc.type)) {
        inc.severity -= inc.type === 'clash' || inc.type === 'riot' ? 13 : 7;
      }
      if (inc.serviceProgress && inc.serviceProgress.ambulance && ['medical', 'accident', 'clash', 'riot'].includes(inc.type)) {
        inc.medicalCare = (inc.medicalCare || 0) + 1;
        if (inc.medicalCare > 1) inc.severity -= 17;
      }
      if (inc.severity <= 0 || (inc.age > 11 && inc.severity < 50)) this.resolveIncident(inc.id, 'Ситуация стабилизирована службами.');
      else if (inc.age > 10 && (inc.type === 'fire' || inc.type === 'arson')) { s.pollution = SIM_U.clamp(s.pollution + 1, 0, 100); }
      if (inc.age > 4 && !inc.impactApplied && inc.severity >= 55) {
        inc.impactApplied = true;
        if (inc.type === 'clash' || inc.type === 'riot') { s.stability -= inc.type === 'riot' ? 4.2 : 2.2; s.trust -= 0.8; s.casualties += SIM_U.randomInt(0, inc.type === 'riot' ? 4 : 2); }
        if (inc.type === 'fire' || inc.type === 'arson') { s.stability -= inc.type === 'arson' ? 2.6 : 1.2; s.publicAnger += 2; }
        if (inc.type === 'medical') { s.trust -= 0.4; }
      }
    }
    s.incidents = s.incidents.filter(i => i.status !== 'resolved' || s.hoursElapsed - i.resolvedAt < 3);

    const tension = this._calculateTension();
    s.tension = tension;
    s.publicAnger = SIM_U.clamp(s.publicAnger * 0.985 + (tension - 35) * 0.055 + Math.max(0, p.tax - 25) * 0.012 + Math.max(0, 48 - p.welfare) * 0.018, 0, 100);
    s.policePresence = SIM_U.clamp(s.policePresence * 0.985 + p.policing * 0.015 - (s.militaryDeployed ? 0.4 : 0), 8, 100);

    // A small dispute can become a much larger street mobilisation when daily pressures compound.
    if (s.tension > 69 && Math.random() < 0.045 && s.activeStrikes < 3) {
      s.activeStrikes += 1;
      s.mobilizationSurge = Math.min(s.cityPopulation * 0.18, s.mobilizationSurge + SIM_U.randomInt(120, 420));
      this._eventHeat = SIM_U.clamp(this._eventHeat + 4, 0, 30);
      this.addNews('city', 'alert', 'Отраслевое объединение объявило предупредительную забастовку', 'Работники требуют переговоров о реальных доходах, графике труда и стоимости жизни. Часть маршрутов общественного транспорта переходит на сокращённый режим.');
      this.announce('ГОРОДСКАЯ СЛУЖБА: в нескольких районах возможны задержки общественного транспорта из-за трудовой акции. Планируйте дополнительное время на дорогу.', 'warning');
    }
    if (s.activeStrikes > 0 && Math.random() < (p.welfare > 60 ? 0.055 : 0.018)) s.activeStrikes -= 1;

    // Mobilisation waves: demonstrations can grow quickly, remain peaceful, or spill into disruptive incidents.
    const mobilisationCooldown = s.hoursElapsed - (s.lastMobilizationHour ?? -8);
    const waveChance = tension > 73 ? 0.15 : tension > 55 ? 0.095 : tension > 39 ? 0.045 : 0.012;
    if (mobilisationCooldown >= 3 && Math.random() < waveChance) {
      s.lastMobilizationHour = s.hoursElapsed;
      const surge = SIM_U.randomInt(100, 260) + Math.round(tension * SIM_U.random(2.2, 7.5));
      s.mobilizationSurge = Math.min(s.cityPopulation * 0.72, s.mobilizationSurge + surge);
      this._eventHeat = SIM_U.clamp(this._eventHeat + (tension > 70 ? 3.5 : 1.4), 0, 30);
      const peaceful = tension < 65 && Math.random() < 0.76;
      const headline = peaceful ? 'К площади присоединились новые группы граждан' : 'Стихийное собрание переросло в массовую уличную акцию';
      const detail = peaceful
        ? 'К работникам и жителям присоединились студенты, семьи и представители местных инициатив. На плакатах разные требования; координаторы предлагают публичную встречу.'
        : 'На площадь прибывают новые группы с разными требованиями. Часть участников пытается перекрыть движение, отдельные стычки требуют присутствия служб.';
      this.addNews('city', peaceful ? 'info' : 'alert', headline, detail);
      if (!peaceful && tension > 70 && Math.random() < 0.48) this._spawnIncident(Math.random() < 0.62 ? 'blockade' : 'riot');
    }
    s.mobilizationSurge *= 0.94;
    s.crowdTarget = Math.round(s.crowdTarget * 0.48 + this._estimateCrowdSize() * 0.52);
    const attendanceRatio = s.crowdTarget / Math.max(1, s.cityPopulation);
    s.roadBlockage = SIM_U.clamp((attendanceRatio - 0.09) * 1.45 + s.activeStrikes * 0.12 + (tension > 70 ? 0.12 : 0), 0.02, 0.98);
    s.protestPhase = tension > 82 ? 'Столкновения и локальные пожары' : tension > 68 ? 'Массовая мобилизация · движение затруднено' : attendanceRatio > 0.34 ? 'Многотысячное собрание' : tension > 48 ? 'Марш и переговорные требования' : 'Гражданское собрание';

    const incidentChance = tension > 82 ? 0.19 : tension > 70 ? 0.105 : tension > 55 ? 0.055 : tension > 42 ? 0.027 : 0.012;
    const unresolved = s.incidents.filter(i => i.status !== 'resolved');
    if (unresolved.length < this.config.maxIncidents && Math.random() < incidentChance) {
      const choices = tension > 82 ? ['riot','arson','clash','medical'] : tension > 68 ? ['blockade','clash','medical','fire'] : ['demonstration','disturbance','medical','accident'];
      this._spawnIncident(choices[SIM_U.randomInt(0, choices.length - 1)]);
    }

    if (Math.random() < 0.045) this._ambientNews();
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
    s.stability = SIM_U.clamp(s.stability + (s.tension < 40 ? 0.3 : -0.33) + (s.gdpGrowth > 2 ? 0.12 : 0) - (s.incidents.some(i => ['clash','riot'].includes(i.type) && i.status !== 'resolved') ? 1.2 : 0) - (s.militaryDeployed ? 0.5 : 0) + SIM_U.random(-0.5, 0.5), 8, 97);
    s.trust = SIM_U.clamp(s.trust + (p.mediaFreedom - 60) * 0.009 + (s.approval > 55 ? 0.07 : -0.06) - (s.militaryDeployed ? 0.65 : 0) - (s.emergencyDays > 0 ? 0.18 : 0) + SIM_U.random(-0.35, 0.35), 8, 95);
    this._updatePartySupport();
    this._changeWeather();
    s.crimeIndex = SIM_U.clamp(s.crimeIndex + (s.tension - 42) * 0.025 - p.policing * 0.003 + SIM_U.random(-0.8, 0.8), 6, 95);
    s.crowdTarget = this._estimateCrowdSize();
    s.roadBlockage = SIM_U.clamp((s.crowdTarget / Math.max(1, s.cityPopulation) - 0.09) * 1.45 + s.activeStrikes * 0.12 + (s.tension > 70 ? 0.12 : 0), 0.02, 0.98);
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

  _estimateCrowdSize() {
    const s = this.state;
    if (!s) return 450;
    const p = s.policies || {};
    const population = Math.max(500, s.cityPopulation || this.config.cityPopulation || 5000);
    const tension = SIM_U.clamp(s.tension == null ? 38 : s.tension, 0, 100) / 100;
    const anger = SIM_U.clamp(s.publicAnger == null ? 42 : s.publicAnger, 0, 100) / 100;
    const hardship = SIM_U.clamp(
      Math.max(0, (s.unemployment - 5) / 12) * 0.075 +
      Math.max(0, (s.inflation - 2) / 10) * 0.07 +
      Math.max(0, ((p.tax || 22) - 22) / 78) * 0.12 +
      Math.max(0, (50 - (p.welfare == null ? 54 : p.welfare)) / 100) * 0.12 +
      Math.max(0, (50 - (p.healthcare == null ? 62 : p.healthcare)) / 100) * 0.055 +
      Math.max(0, (50 - (p.infrastructure == null ? 55 : p.infrastructure)) / 100) * 0.035 +
      Math.max(0, (100 - s.stability) / 100) * 0.04,
      0, 0.42
    );
    let ratio = 0.012 + Math.pow(tension, 1.55) * 0.24 + anger * 0.075 + hardship;
    ratio += Math.min(0.30, (s.activeStrikes || 0) * 0.085);
    ratio += Math.min(0.30, Math.max(0, s.mobilizationSurge || 0) / population);
    if (s.weather && ['storm','cold','heat'].includes(s.weather.id)) ratio *= 0.90;
    if (s.militaryDeployed) ratio = Math.min(1, ratio + 0.07); // deployment can draw counter-demonstrators
    return Math.round(SIM_U.clamp(ratio, 0.025, 1) * population);
  }

  getProtestGroups() {
    const s = this.state, p = s.policies;
    const clamp = (v) => SIM_U.clamp(v, 8, 98);
    const groups = [
      { id: 'workers', name: 'Работники и профсоюзы', short: 'РАБОТА', representative: 'Мари Дюваль, координатор профсоюзов', demand: p.welfare < 42 || s.unemployment > 9 ? 'индексация доходов, защита рабочих мест и переговоры по минимальной зарплате' : 'защита реальных доходов и предсказуемый график труда', grievance: clamp(45 + (s.unemployment - 7) * 3.2 + (s.inflation - 3) * 2.6 + (54 - p.welfare) * 0.42), color: '#c47d70', stance: 'переговоры возможны', share: 0.23 },
      { id: 'families', name: 'Семьи и пенсионеры', short: 'ЦЕНЫ', representative: 'Ирина Лебедева, совет районных жителей', demand: 'сдержать стоимость продуктов, коммунальных услуг и лекарств', grievance: clamp(42 + (s.inflation - 3) * 3.8 + (54 - p.welfare) * 0.25 + (62 - p.healthcare) * 0.18), color: '#d3b87f', stance: 'мирное давление', share: 0.20 },
      { id: 'transport', name: 'Водители и городской транспорт', short: 'ДОРОГИ', representative: 'Жюль Моро, делегат транспортного объединения', demand: p.tax > 50 ? 'снизить налоговую нагрузку и расходы на содержание транспорта' : 'обновить транспорт, дороги и условия труда водителей', grievance: clamp(38 + (p.tax - 22) * 0.36 + (55 - p.infrastructure) * 0.34 + s.activeStrikes * 5), color: '#8ca8b5', stance: s.activeStrikes ? 'готовятся к забастовке' : 'готовы к диалогу', share: 0.17 },
      { id: 'youth', name: 'Студенты и молодые горожане', short: 'БУДУЩЕЕ', representative: 'Самира Нури, студенческая ассамблея', demand: p.mediaFreedom < 35 ? 'гарантии свободы собраний, прозрачность решений и доступное образование' : 'доступное образование, жильё и рабочие места для молодёжи', grievance: clamp(40 + (s.unemployment - 6) * 3.1 + (58 - p.mediaFreedom) * 0.23 + (50 - p.welfare) * 0.14), color: '#9296c5', stance: 'организуют открытое собрание', share: 0.15 },
      { id: 'environment', name: 'Экологические объединения', short: 'ЭКОЛОГИЯ', representative: 'Эмиль Каспер, гражданская экологическая сеть', demand: p.environment < 35 ? 'план сокращения выбросов и открытый аудит промышленных предприятий' : 'публичный экологический аудит и сроки очистки воздуха', grievance: clamp(34 + s.pollution * 0.36 + (48 - p.environment) * 0.22), color: '#82a879', stance: 'ненасильственная акция', share: 0.07 },
      { id: 'teachers', name: 'Учителя и работники образования', short: 'ШКОЛЫ', representative: 'Лоран Мартен, совет работников образования', demand: 'финансирование школ, достойная оплата и снижение перегрузки классов', grievance: clamp(38 + (58 - p.welfare) * 0.25 + (62 - p.infrastructure) * 0.31 + s.unemployment * 0.4), color: '#a4b0cf', stance: 'публичная петиция и собрание', share: 0.06 },
      { id: 'healthworkers', name: 'Медики и социальные работники', short: 'МЕДИЦИНА', representative: 'Клер Бонне, межотраслевой совет медиков', demand: 'дополнительные смены, доступность лечения и удержание персонала', grievance: clamp(40 + (60 - p.healthcare) * 0.48 + (54 - p.welfare) * 0.16), color: '#83b7ad', stance: 'профсоюзная акция', share: 0.07 },
      { id: 'farmers', name: 'Фермеры и малый бизнес', short: 'РАСХОДЫ', representative: 'Пьер Дюран, федерация местных производителей', demand: 'предсказуемые налоги, доступное топливо и справедливые закупочные цены', grievance: clamp(35 + (p.tax - 22) * 0.42 + (s.inflation - 3) * 2.2 + (100 - s.trust) * 0.12), color: '#c6a77d', stance: 'региональный конвой и переговоры', share: 0.08 },
      { id: 'suburbs', name: 'Пригороды и пассажирские объединения', short: 'ПРОЕЗД', representative: 'Надя Фонтен, совет пригородных пассажиров', demand: 'доступный транспорт, регулярные маршруты и безопасные пересадки', grievance: clamp(37 + (55 - p.infrastructure) * 0.42 + s.activeStrikes * 4 + (s.inflation - 3) * 1.2), color: '#8cb6c7', stance: 'марш и временные дорожные ограничения', share: 0.07 },
      { id: 'taxpayers', name: 'Движение налогоплательщиков', short: 'НАЛОГИ', representative: 'Алекс Рено, гражданский бюджетный комитет', demand: p.tax > 35 ? 'снизить налоговую ставку и раскрыть расходование бюджета' : 'публиковать бюджетные контракты и результаты аудита', grievance: clamp(35 + (p.tax - 22) * 0.52 + (100 - s.trust) * 0.12), color: '#d0a46c', stance: 'требуют публичного отчёта', share: 0.10 },
      { id: 'rights', name: 'Гражданские права и наблюдатели', short: 'ПРАВА', representative: 'Элен Руссо, независимая правозащитная коалиция', demand: 'публичные протоколы задержаний, независимый надзор и гарантии свободы собраний', grievance: clamp(28 + (100 - p.mediaFreedom) * 0.42 + (100 - s.trust) * 0.20 + (s.militaryDeployed ? 15 : 0)), color: '#baa0c5', stance: 'наблюдение и правовая помощь', share: 0.06 },
      { id: 'hardliners', name: 'Радикальная периферийная группа', short: 'РАДИКАЛЫ', representative: 'Неформальная группа без единого признанного представителя', demand: 'отмена последних решений кабинета и независимое расследование действий силовых ведомств', grievance: clamp(14 + (s.tension - 40) * 0.85 + s.publicAnger * 0.22), color: '#ba7168', stance: s.tension > 70 ? 'часть участников склонна к силовым действиям' : 'маргинальная группа', share: SIM_U.clamp(0.025 + s.tension * 0.00085, 0.035, 0.12) },
      { id: 'supporters', name: 'Сторонники правительства', short: 'ПОРЯДОК', representative: 'Виктор Савин, гражданская платформа', demand: 'восстановить работу транспорта и обеспечить безопасность жителей', grievance: clamp(33 + (100 - s.stability) * 0.36 + s.crimeIndex * 0.16), color: '#78aaa2', stance: 'поддерживают восстановление порядка', share: 0.07 }
    ];
    // Group estimates are mutually exclusive shares of the current crowd, avoiding double-counted turnout.
    const totalShare = groups.reduce((sum, group) => sum + group.share, 0) || 1;
    let assigned = 0;
    return groups.map((g, index) => {
      const participants = index === groups.length - 1
        ? Math.max(1, Math.round((s.crowdTarget || 500) - assigned))
        : Math.max(1, Math.round((s.crowdTarget || 500) * g.share / totalShare));
      assigned += participants;
      return { ...g, participants, grievance: Math.round(g.grievance) };
    });
  }

  startNegotiations(preferredGroupId = null) {
    const s = this.state;
    if (s.activeNegotiation) { this._notify('negotiation', s.activeNegotiation); return s.activeNegotiation; }
    const groups = this.getProtestGroups().filter(g => g.id !== 'supporters');
    // Prioritise a grievance with both real turnout and an elevated dissatisfaction score.
    const eligible = groups.filter(g => g.grievance >= 40).sort((a, b) => (b.grievance * Math.sqrt(b.participants)) - (a.grievance * Math.sqrt(a.participants)));
    const group = groups.find(g => g.id === preferredGroupId) || eligible[0] || groups[0];
    const message = group.id === 'hardliners'
      ? 'Мы не считаем обычную встречу достаточной. Нужны публичные обязательства и независимый контроль.'
      : `Наши участники требуют ${group.demand}. Мы готовы говорить, если встреча закончится публичным обязательством, а не общей фразой.`;
    s.activeNegotiation = {
      id: ++s.negotiationSequence, groupId: group.id, groupName: group.name,
      representative: group.representative, demand: group.demand, grievance: group.grievance,
      participants: group.participants, round: 1, stage: 'opening',
      transcript: [{ speaker: group.representative, text: message, side: 'citizens' }]
    };
    s.lastAction = `Начат публичный диалог: ${group.name}.`;
    this.addNews('politics', 'info', `Правительство открыло переговоры: ${group.name}`, `Представители заявили требование: ${group.demand}. Состав участников и повестка могут меняться по мере развития событий.`);
    this.announce(`ПРАВИТЕЛЬСТВО: начаты консультации с представителями группы «${group.name}». Итоги и принятые обязательства будут опубликованы.`, 'info');
    this._notify('negotiation', s.activeNegotiation);
    return s.activeNegotiation;
  }

  resolveNegotiation(choice) {
    const s = this.state, n = s.activeNegotiation;
    if (!n) return false;
    const group = this.getProtestGroups().find(g => g.id === n.groupId) || { id: n.groupId, name: n.groupName, demand: n.demand };
    const append = (speaker, text, side = 'government') => n.transcript.push({ speaker, text, side });
    const commit = (strength = 1) => {
      const p = s.policies;
      const change = (key, amount) => { p[key] = Math.round(SIM_U.clamp(p[key] + amount * strength, 0, 100)); };
      if (group.id === 'workers') change('welfare', 5);
      else if (group.id === 'families') { change('welfare', 4); change('healthcare', 2); }
      else if (group.id === 'transport') change('infrastructure', 5);
      else if (group.id === 'youth') { change('mediaFreedom', 4); change('welfare', 2); }
      else if (group.id === 'environment') change('environment', 6);
      else if (group.id === 'taxpayers') change('tax', -5);
      else if (group.id === 'hardliners') { change('mediaFreedom', 3); s.trust = SIM_U.clamp(s.trust + 2 * strength, 0, 100); }
      s.publicAnger = SIM_U.clamp(s.publicAnger - 13 * strength, 0, 100);
      s.tension = SIM_U.clamp(s.tension - 8 * strength, 0, 100);
      s.trust = SIM_U.clamp(s.trust + 4 * strength, 0, 100);
      s.approval = SIM_U.clamp(s.approval + 1.8 * strength, 0, 100);
      s.activeStrikes = Math.max(0, s.activeStrikes - (strength > 0.7 ? 1 : 0));
      s.mobilizationSurge = Math.max(0, s.mobilizationSurge - Math.round(250 * strength));
      this._eventHeat = SIM_U.clamp(this._eventHeat - 3 * strength, 0, 30);
    };

    if (n.stage === 'opening') {
      if (choice === 'accept') {
        commit(1);
        append('Правительство', `Требование «${n.demand}» принято как направление государственной политики. Ведомство опубликует сроки и бюджет исполнения.`, 'government');
        append(n.representative, 'Мы зафиксируем это обязательство. Участники будут оценивать уже конкретные действия, а не только сегодняшние слова.', 'citizens');
        this.addNews('politics', 'good', `Достигнута предварительная договорённость с группой «${n.groupName}»`, `Кабинет принял часть требований: ${n.demand}. Обязательство отражено в политическом пакете.`);
        s.activeNegotiation = null;
      } else if (choice === 'counter') {
        append('Правительство', `Мы предлагаем поэтапный план по вопросу «${n.demand}»: первый шаг в ближайший модельный месяц, открытый отчёт о расходах и повторная встреча с делегатами.`, 'government');
        n.stage = 'counter'; n.round = 2;
        append(n.representative, 'Мы готовы вынести поэтапное предложение на обсуждение, но хотим увидеть конкретные сроки и механизм контроля. Улучшите предложение или подтвердите его публично.', 'citizens');
      } else if (choice === 'hearing') {
        s.trust = SIM_U.clamp(s.trust + 5.5, 0, 100); s.publicAnger = SIM_U.clamp(s.publicAnger - 4, 0, 100); s.tension = SIM_U.clamp(s.tension - 4, 0, 100);
        s.lastAction = `Назначены публичные слушания по требованиям группы «${n.groupName}».`;
        append('Правительство', 'Назначаем открытые слушания с публикацией протокола, бюджетных ограничений и альтернатив. Приглашаем представителей нескольких групп.', 'government');
        append(n.representative, 'Мы примем участие, если материалы будут доступны заранее, а критические замечания останутся в протоколе.', 'citizens');
        this.addNews('politics', 'info', `Назначены публичные слушания: ${n.groupName}`, 'Слушания получат открытый протокол. Немедленного изменения политики пока не принято.');
        s.activeNegotiation = null;
      } else if (choice === 'reject') {
        s.publicAnger = SIM_U.clamp(s.publicAnger + 11, 0, 100); s.tension = SIM_U.clamp(s.tension + 7, 0, 100); s.trust = SIM_U.clamp(s.trust - 3.5, 0, 100);
        s.mobilizationSurge = Math.min(s.cityPopulation, s.mobilizationSurge + SIM_U.randomInt(300, 900));
        this._eventHeat = SIM_U.clamp(this._eventHeat + 5, 0, 30);
        append('Правительство', 'Кабинет отказывается принять требование в предложенном виде и не предлагает немедленной компенсации.', 'government');
        append(n.representative, 'Это не ответ на причины протеста. Мы вынесем отказ на собрание; часть участников потребует продолжения акции.', 'citizens');
        this.addNews('city', 'alert', `Переговоры с группой «${n.groupName}» завершились без соглашения`, 'Отказ увеличил общественное недовольство. Координаторы обсуждают дальнейшие действия; реакция участников различается.');
        s.activeNegotiation = null;
      } else return false;
    } else if (n.stage === 'counter') {
      if (choice === 'counter_accept') {
        commit(0.62);
        append(n.representative, 'Мы принимаем поэтапный вариант при условии ежемесячного публичного отчёта и новой встречи по результатам первого шага.', 'citizens');
        this.addNews('politics', 'good', `Стороны согласовали поэтапный план: ${n.groupName}`, 'Договорённость включает контроль сроков, открытый отчёт и повторную консультацию.');
        s.activeNegotiation = null;
      } else if (choice === 'counter_improve') {
        commit(1.15);
        append('Правительство', 'Кабинет усиливает своё предложение: фиксирует срок первого этапа, открытый мониторинг и персонально ответственное ведомство.', 'government');
        append(n.representative, 'С таким дополнением мы готовы приостановить призывы к эскалации и проверить выполнение обязательств на следующей встрече.', 'citizens');
        this.addNews('politics', 'good', `Переговоры дали результат: ${n.groupName}`, 'Кабинет расширил пакет уступок и согласовал механизм контроля исполнения.');
        s.activeNegotiation = null;
      } else if (choice === 'counter_end') {
        s.publicAnger = SIM_U.clamp(s.publicAnger + 5, 0, 100); s.tension = SIM_U.clamp(s.tension + 3, 0, 100); s.trust = SIM_U.clamp(s.trust - 1.5, 0, 100);
        append(n.representative, 'Общей позиции пока нет. Мы сохраняем право на новые собрания и вернёмся к вопросу позднее.', 'citizens');
        this.addNews('politics', 'warning', `Переговоры приостановлены: ${n.groupName}`, 'Стороны договорились сохранить каналы связи, но план действий не согласован.');
        s.activeNegotiation = null;
      } else return false;
    } else return false;
    s.lastActionHours = 0;
    this._refreshDerived();
    this._notify('negotiation-result', { choice, negotiation: n, active: s.activeNegotiation });
    this._notify('update');
    return true;
  }

  _calculateTension() {
    const s = this.state;
    const p = s.policies;
    let tension = 24 + (60 - s.approval) * 0.7 + (s.unemployment - 6) * 2 + (s.inflation - 3) * 1.6 + (100 - s.stability) * 0.15;
    tension -= (p.policing - 45) * 0.075;
    tension -= (p.welfare - 50) * 0.1;
    tension -= (p.healthcare - 50) * 0.06;
    tension += (p.tax - 22) * 0.22;
    tension += (50 - p.infrastructure) * 0.045;
    tension += (50 - p.mediaFreedom) * 0.055;
    tension += (s.publicAnger - 42) * 0.12;
    tension += (s.weather.effect < -1 ? 2 : 0) + s.activeStrikes * 5 + this._eventHeat * 0.45;
    if (s.militaryDeployed) tension += 6;
    if (s.emergencyDays > 0) tension += 3;
    const liveIncidents = s.incidents.filter(i => i.status !== 'resolved');
    tension += liveIncidents.filter(i => ['clash','riot','fire','arson','blockade'].includes(i.type)).length * 2.2;
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
    if (s.responseCooldown > 0 && action === s.lastResponseAction && action !== 'ignore') {
      this._notify('toast', { message: 'Эта мера уже введена; штаб оценивает её результат. Можно выбрать другой вариант реакции или подождать.', tone: 'warning' });
      return false;
    }
    const center = { x: SIM_U.randomInt(540, 740), y: SIM_U.randomInt(360, 465) };
    if (action === 'negotiate') {
      this.startNegotiations();
      return true;
    } else if (action === 'police') {
      s.policePresence = SIM_U.clamp(s.policePresence + 24, 0, 100);
      s.crimeIndex = SIM_U.clamp(s.crimeIndex - 3, 0, 100);
      s.stability = SIM_U.clamp(s.stability + 1.2, 0, 100);
      s.trust = SIM_U.clamp(s.trust - 1.6, 0, 100);
      s.tension = SIM_U.clamp(s.tension + (s.tension > 62 ? 2.5 : -2), 0, 100);
      s.lastAction = 'Направлено дополнительное полицейское подкрепление. Приоритет — безопасные коридоры и предотвращение столкновений.';
      this.addNews('city', 'alert', 'К площади Республики направлено дополнительное полицейское подкрепление', 'Командование сообщило о задаче разделять конфликтующие группы, обеспечивать доступ медикам и не перекрывать эвакуационные маршруты.');
      this.announce('ПОЛИЦИЯ: сформированы безопасные проходы. Не препятствуйте движению медицинских и пожарных бригад.', 'warning');
      for (let i = 0; i < 4; i++) s.vehicleOrders.push({ id: ++s.vehicleSequence, service: 'police', x: center.x + SIM_U.randomInt(-90, 90), y: center.y + SIM_U.randomInt(-35, 35), incidentId: null, purpose: 'reinforcement' });
      s.mobilizationSurge = Math.min(s.cityPopulation, s.mobilizationSurge + (s.tension > 65 ? 420 : 100));
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
      for (let i = 0; i < 3; i++) s.vehicleOrders.push({ id: ++s.vehicleSequence, service: 'police', x: center.x + SIM_U.randomInt(-70, 70), y: center.y + SIM_U.randomInt(-30, 30), incidentId: null, purpose: 'emergency' });
      s.mobilizationSurge = Math.min(s.cityPopulation, s.mobilizationSurge + 360);
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
      for (let i = 0; i < 3; i++) s.vehicleOrders.push({ id: ++s.vehicleSequence, service: 'military', x: center.x + SIM_U.randomInt(-60, 60), y: center.y + SIM_U.randomInt(-24, 24), incidentId: null, purpose: 'support' });
      s.mobilizationSurge = Math.min(s.cityPopulation, s.mobilizationSurge + 650);
      s.responseCooldown = 6;
    } else if (action === 'ignore') {
      s.tension = SIM_U.clamp(s.tension + (s.tension > 48 ? 2.1 : -0.5), 0, 100);
      s.trust = SIM_U.clamp(s.trust + 0.4, 0, 100);
      s.lastAction = 'Штаб продолжает наблюдение. Новые силы не направляются; инциденты остаются на ответственности дежурных служб.';
      this.addNews('politics', 'info', 'Кабинет решил продолжить наблюдение без новых ограничений', 'В официальном сообщении указано, что дополнительные меры пока не вводятся. Представители собрания ожидают публичного графика консультаций.');
      s.responseCooldown = 1;
    } else return false;
    s.lastActionHours = 0;
    s.lastResponseAction = action;
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
        { value: 'disturbance', weight: tension < 50 ? 34 : 14 },
        { value: 'clash', weight: tension > 60 ? 28 : 7 },
        { value: 'riot', weight: tension > 76 ? 24 : 2 },
        { value: 'arson', weight: tension > 78 ? 14 : 1 },
        { value: 'blockade', weight: tension > 52 || s.activeStrikes ? 24 : 3 },
        { value: 'medical', weight: 16 },
        { value: 'fire', weight: tension > 65 ? 11 : 3 },
        { value: 'demonstration', weight: 28 },
        { value: 'accident', weight: s.weather.id === 'storm' ? 27 : 12 }
      ];
      type = SIM_U.weightedPick(options, 'weight').value;
    }
    const dictionary = {
      disturbance: { label: 'Нарушение порядка', service: 'police', severity: SIM_U.randomInt(28, 58), level: 'warning', x: SIM_U.randomInt(480, 820), y: SIM_U.randomInt(330, 470) },
      clash: { label: 'Столкновение групп', service: 'police', severity: SIM_U.randomInt(58, 88), level: 'critical', x: SIM_U.randomInt(500, 780), y: SIM_U.randomInt(345, 475) },
      medical: { label: 'Медицинская помощь', service: 'ambulance', severity: SIM_U.randomInt(26, 56), level: 'warning', x: SIM_U.randomInt(480, 830), y: SIM_U.randomInt(340, 480) },
      fire: { label: 'Очаг возгорания', service: 'fire', severity: SIM_U.randomInt(55, 86), level: 'critical', x: SIM_U.randomInt(520, 770), y: SIM_U.randomInt(355, 470) },
      arson: { label: 'Поджог имущества', service: 'fire', severity: SIM_U.randomInt(66, 94), level: 'critical', x: SIM_U.randomInt(480, 820), y: SIM_U.randomInt(360, 505) },
      riot: { label: 'Массовые столкновения', service: 'police', severity: SIM_U.randomInt(70, 96), level: 'critical', x: SIM_U.randomInt(460, 830), y: SIM_U.randomInt(365, 485) },
      blockade: { label: 'Блокирование проезда', service: 'police', severity: SIM_U.randomInt(32, 72), level: 'warning', x: SIM_U.randomInt(520, 780), y: SIM_U.randomInt(540, 566) },
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
    if (type === 'fire' || type === 'arson') {
      this.addNews('city', 'critical', type === 'arson' ? 'Зарегистрирован умышленный поджог имущества' : 'На площади зарегистрировано возгорание', 'Диспетчерская направила пожарную бригаду. Медицинские службы находятся в готовности, проходы для техники должны оставаться свободными.');
      this.announce('ЭКСТРЕННОЕ ОПОВЕЩЕНИЕ: в центральном районе работает пожарная бригада. Не приближайтесь к ограждённой зоне и не перекрывайте проезд.', 'critical');
    } else if (type === 'clash' || type === 'riot') {
      this.addNews('city', 'alert', type === 'riot' ? 'Массовые столкновения на части площади' : 'Поступило сообщение о столкновении на площади', 'Дежурные службы оценивают обстановку. Приоритет — оказание помощи пострадавшим и разъединение конфликтующих сторон.');
      this.announce('ПОЛИЦИЯ: в отдельном секторе площади ограничено движение пешеходов. Пользуйтесь обходными маршрутами и выполняйте указания дежурных.', 'warning');
    } else if (type === 'medical') {
      this.addNews('city', 'warning', 'На площади потребовалась медицинская помощь', 'Диспетчерская направила бригаду скорой помощи. Сотрудники просят освободить коридор для подъезда автомобиля.');
    } else if (type === 'blockade') {
      this.addNews('city', 'warning', 'Участники акции перекрыли часть проезда', 'Движение замедлено, автобусы и легковые автомобили скапливаются перед площадью. Полиция организует коридор для экстренных служб.');
      this.announce('ТРАНСПОРТНАЯ ДИСПЕТЧЕРСКАЯ: проезд у площади частично перекрыт. Выбирайте объезд; не блокируйте путь экстренным бригадам.', 'warning');
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
    if (inc.type === 'fire' || inc.type === 'arson') this.state.firesControlled += 1;
    if ((inc.type === 'clash' || inc.type === 'riot') && inc.severity > 65) this.state.casualties += SIM_U.randomInt(0, 1);
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
    if (typeof this._estimateCrowdSize === 'function') s.crowdTarget = Math.round((s.crowdTarget || 500) * 0.68 + this._estimateCrowdSize() * 0.32);
    const attendanceRatio = s.crowdTarget / Math.max(1, s.cityPopulation || this.config.cityPopulation || 5000);
    s.roadBlockage = SIM_U.clamp((attendanceRatio - 0.09) * 1.45 + (s.activeStrikes || 0) * 0.12 + (s.tension > 70 ? 0.12 : 0), 0.02, 0.98);
    s.protestPhase = s.tension > 82 ? 'Столкновения и локальные пожары' : s.tension > 68 ? 'Массовая мобилизация · движение затруднено' : attendanceRatio > 0.34 ? 'Многотысячное собрание' : s.tension > 48 ? 'Марш и переговорные требования' : 'Гражданское собрание';
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
    // Preserve the saved live-crowd estimate and its corresponding traffic state.
    // Recomputing during load used to smooth the value a second time and alter the save immediately.
    const savedSceneState = {
      crowdTarget: this.state.crowdTarget,
      roadBlockage: this.state.roadBlockage,
      protestPhase: this.state.protestPhase
    };
    this._refreshDerived(false);
    Object.assign(this.state, savedSceneState);
    this._notify('load');
  }
}

window.RepublicSimulation = RepublicSimulation;
