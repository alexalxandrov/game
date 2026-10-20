'use strict';
const UI_U = window.GameUtils;

class RepublicDashboardUI {
  constructor(simulation) {
    this.sim = simulation;
    this.newsFilter = 'all';
    this.draft = { ...simulation.state.policies };
    this._lastNewsId = null;
    this._lastRenderKey = '';
    this._lastSaveAt = null;
    this._bind();
    this.sim.subscribe((type, payload) => this._onSimEvent(type, payload));
    this.renderAll(true);
  }

  _bind() {
    document.querySelectorAll('[data-policy]').forEach(input => {
      input.addEventListener('input', () => {
        const key = input.dataset.policy;
        this.draft[key] = Number(input.value);
        this._updatePolicyValue(key, Number(input.value));
        this._updateDraftStatus();
        this._updateBudgetPreview();
      });
    });
    document.getElementById('apply-policies').addEventListener('click', () => {
      this.sim.applyPolicies({ ...this.draft });
      this.draft = { ...this.sim.state.policies };
      this._syncPolicyInputs();
      this._updateDraftStatus();
      this.renderAll(true);
      this.toast('Пакет утверждён', 'Новые параметры вступили в силу. Их последствия будут проявляться постепенно.', 'success');
    });
    document.querySelectorAll('[data-action]').forEach(button => {
      button.addEventListener('click', () => {
        const action = button.dataset.action;
        if (action === 'negotiate') { this.openNegotiations(); return; }
        // Military choices are already confirmed in the blocking political-decision layer.
        // Emergency measures are confirmed by the common decision window.
        const success = this.sim.enactAction(action);
        if (success) this.toast('Решение зарегистрировано', this.sim.state.lastAction, action === 'military' || action === 'emergency' ? 'warning' : 'success');
      });
    });
    document.getElementById('open-negotiations').addEventListener('click', () => this.openNegotiations());
    document.getElementById('negotiation-close').addEventListener('click', () => this.closeNegotiations());
    document.getElementById('negotiation-options').addEventListener('click', event => {
      const button = event.target.closest('[data-negotiation-choice]');
      if (button) this.chooseNegotiationResponse(button.dataset.negotiationChoice);
    });
    document.getElementById('protest-agenda').addEventListener('click', event => {
      const button = event.target.closest('[data-negotiate-group]');
      if (button) this.openNegotiations(button.dataset.negotiateGroup);
    });
    document.getElementById('negotiation-overlay').addEventListener('click', event => {
      if (event.target.id === 'negotiation-overlay') this.closeNegotiations();
    });
    document.addEventListener('keydown', event => { if (event.key === 'Escape') this.closeNegotiations(); });
    document.querySelectorAll('[data-speed]').forEach(button => {
      button.addEventListener('click', () => {
        this.speed = Number(button.dataset.speed);
        document.querySelectorAll('[data-speed]').forEach(b => b.classList.toggle('active', b === button));
        this.toast('Скорость изменена', `Темп моделирования: ${this.speed}×`, 'info');
      });
    });
    document.getElementById('pause-btn').addEventListener('click', () => {
      this.sim.state.paused = !this.sim.state.paused;
      this.updateRunStatus();
      this.toast(this.sim.state.paused ? 'Симуляция на паузе' : 'Симуляция продолжена', this.sim.state.paused ? 'Время остановлено; интерфейс и городская сцена доступны.' : 'Модель снова продвигает время.', 'info');
    });
    document.querySelectorAll('[data-filter]').forEach(button => {
      button.addEventListener('click', () => {
        this.newsFilter = button.dataset.filter;
        document.querySelectorAll('[data-filter]').forEach(b => b.classList.toggle('active', b === button));
        this.renderNews();
      });
    });
    document.getElementById('save-btn').addEventListener('click', () => this.saveGame(false));
    document.getElementById('load-btn').addEventListener('click', () => this.loadGame());
    document.getElementById('reset-btn').addEventListener('click', () => {
      if (!window.confirm('Начать новую игру? Текущее состояние останется в сохранении только при предварительном сохранении.')) return;
      this.sim.reset();
      this.draft = { ...this.sim.state.policies };
      this._syncPolicyInputs();
      this.toast('Новая смена началась', 'Республика Вереск вернулась к стартовым условиям.', 'success');
    });
  }

  get speed() { return this._speed || 1; }
  set speed(value) { this._speed = value; }

  _onSimEvent(type, payload) {
    if (type === 'negotiation' || type === 'negotiation-result') {
      this.renderNegotiation();
      if (type === 'negotiation-result' && !this.sim.state.activeNegotiation) {
        this.toast('Переговоры завершены', 'Результат внесён в политическую модель и городскую сводку.', payload && ['reject','counter_end'].includes(payload.choice) ? 'warning' : 'success');
      }
    }
    if (type === 'toast') {
      this.toast('Оперативное сообщение', payload.message, payload.tone || 'info');
      return;
    }
    if (type === 'reset' || type === 'load') {
      this.draft = { ...this.sim.state.policies };
      this._syncPolicyInputs();
      this._lastNewsId = null;
      this.renderAll(true);
      return;
    }
    if (type === 'news') {
      this.renderNews();
      this._updateTicker();
    }
    if (type === 'announcement') this._updateTicker();
    if (type === 'election' && payload) this.toast('Опубликованы итоги выборов', `${payload.winner}: ${UI_U.fmt(payload.voteShare, 1)}% модельных голосов.`, 'warning');
    this.renderAll(false);
  }

  renderAll(force = false) {
    this.updateStats();
    this.updatePolitics();
    this.updateEconomy();
    this.updateIncidents();
    this._updateTicker();
    this.updateRunStatus();
    if (force || this._lastNewsId !== (this.sim.news[0] && this.sim.news[0].id)) this.renderNews();
    this._lastNewsId = this.sim.news[0] && this.sim.news[0].id;
    this._updatePolicyValue('tax', this.draft.tax);
    this._updatePolicyValue('welfare', this.draft.welfare);
    this._updatePolicyValue('policing', this.draft.policing);
    this._updatePolicyValue('healthcare', this.draft.healthcare);
    this._updatePolicyValue('infrastructure', this.draft.infrastructure);
    this._updatePolicyValue('environment', this.draft.environment);
    this._updatePolicyValue('mediaFreedom', this.draft.mediaFreedom);
    this._updateDraftStatus();
    this._updateBudgetPreview();
  }

  updateStats() {
    const s = this.sim.state;
    const $ = id => document.getElementById(id);
    $('clock').textContent = UI_U.time(s.hour, s.minute);
    $('day-count').innerHTML = `${String(((s.day - 1) % this.sim.config.electionInterval) + 1).padStart(2, '0')} <small>/ ${this.sim.config.electionInterval}</small>`;
    const daysToElection = (this.sim.config.electionInterval - (s.day % this.sim.config.electionInterval)) % this.sim.config.electionInterval;
    $('election-countdown').textContent = daysToElection === 0 ? 'СЕГОДНЯ' : `${daysToElection} дн.`;
    $('approval-value').textContent = Math.round(s.approval);
    $('approval-gauge').style.background = `conic-gradient(${s.approval < 35 ? '#c87568' : '#4da295'} 0deg ${s.approval * 3.6}deg, #293b3c ${s.approval * 3.6}deg 360deg)`;
    $('stability-value').textContent = `${Math.round(s.stability)}%`;
    $('stability-bar').style.width = `${s.stability}%`;
    $('trust-value').textContent = `${Math.round(s.trust)}%`;
    $('trust-bar').style.width = `${s.trust}%`;
    $('tension-value').textContent = `${Math.round(s.tension)}%`;
    $('tension-bar').style.width = `${s.tension}%`;
    $('government-party').textContent = (this.sim.parties.find(p => p.id === s.governmentParty) || {}).name || 'Коалиция';
    const activeIncidents = s.incidents.filter(i => i.status !== 'resolved');
    $('crowd-value').textContent = UI_U.fmtInt(s.crowdTarget || 0);
    $('traffic-value').textContent = `${Math.round((s.roadBlockage || 0) * 100)}%`;
    $('scene-substats').textContent = `ГОРОД: ${UI_U.fmtInt(s.cityPopulation || 5000)} ЖИТЕЛЕЙ · ОЦЕНКА ЯВКИ: ${UI_U.fmtInt(s.crowdTarget || 0)} · В КАДРЕ: ${UI_U.fmtInt(window.worldScene ? window.worldScene.people.length : 0)} АГЕНТОВ`;
    $('protest-phase-label').textContent = (s.protestPhase || 'ГРАЖДАНСКОЕ СОБРАНИЕ').toLocaleUpperCase('ru-RU');
    $('incident-value').textContent = String(activeIncidents.length).padStart(2, '0');
    $('vehicles-value').textContent = String(window.worldScene ? window.worldScene.vehicles.length : 0).padStart(2, '0');
    $('world-subtitle').textContent = s.protestPhase || (s.tension > 68 ? 'Массовое собрание · экстренные службы работают в усиленном режиме' : 'Гражданское собрание у здания правительства');
    $('scene-condition').textContent = `${s.hour >= 7 && s.hour < 20 ? 'ДЕНЬ' : 'НОЧЬ'} · ${this._conditionLabel(s.weather.id).toUpperCase()}`;
    $('scene-caption').textContent = s.roadBlockage > 0.62 ? 'Проезд перегружен · формируется очередь · экстренным службам нужен коридор' : s.tension > 76 ? 'Напряжённость высокая · в отдельных секторах возможны столкновения' : s.roadBlockage > 0.32 ? 'Толпа выходит к дороге · скорость городского движения снижена' : 'Камера передаёт непрерывное движение на площади и улице';
    $('weather-icon').textContent = s.weather.icon;
    $('weather-label').textContent = s.weather.label;
    $('temperature').textContent = `${s.weather.temperature > 0 ? '+' : ''}${Math.round(s.weather.temperature)}°`;
    $('treasury-value').textContent = UI_U.fmt(s.treasury, 1);
    const trend = s.budgetTrend;
    $('treasury-change').textContent = `${trend > 0 ? '+' : ''}${UI_U.fmt(trend, 1)}%`;
    $('treasury-change').className = trend >= 0 ? 'delta-positive' : 'delta-negative';
    $('revenue-value').textContent = `${UI_U.fmt(s.dailyRevenue, 0)} млн`;
    $('spending-value').textContent = `${UI_U.fmt(s.dailySpending, 0)} млн`;
    const maxBudget = Math.max(s.dailyRevenue, s.dailySpending, 1);
    $('budget-spending').style.width = `${s.dailySpending / maxBudget * 100}%`;
    $('budget-revenue').style.width = `${s.dailyRevenue / maxBudget * 100}%`;
    const rev = s.previousMetrics || {};
    const unemploymentDiff = s.unemployment - (rev.unemployment ?? s.unemployment);
    const inflationDiff = s.inflation - (rev.inflation ?? s.inflation);
    const gdpDiff = s.gdpGrowth - (rev.gdpGrowth ?? s.gdpGrowth);
    $('unemployment-value').innerHTML = `${UI_U.fmt(s.unemployment, 1)}<small>%</small>`;
    $('inflation-value').innerHTML = `${UI_U.fmt(s.inflation, 1)}<small>%</small>`;
    $('gdp-value').innerHTML = `${s.gdpGrowth >= 0 ? '+' : '−'}${UI_U.fmt(Math.abs(s.gdpGrowth), 1)}<small>%</small>`;
    $('unemployment-trend').textContent = `${unemploymentDiff <= 0 ? '−' : '+'}${UI_U.fmt(Math.abs(unemploymentDiff), 2)} п.п.`;
    $('unemployment-trend').className = unemploymentDiff <= 0 ? '' : 'negative';
    $('inflation-trend').textContent = `${inflationDiff <= 0 ? '−' : '+'}${UI_U.fmt(Math.abs(inflationDiff), 2)} п.п.`;
    $('inflation-trend').className = inflationDiff <= 0 ? '' : 'negative';
    $('gdp-trend').textContent = `${gdpDiff >= 0 ? '+' : '−'}${UI_U.fmt(Math.abs(gdpDiff), 2)} п.п. за модельный час`;
    $('gdp-trend').className = gdpDiff >= 0 ? '' : 'negative';
    $('market-index').textContent = UI_U.fmt(s.marketIndex, 1);
    $('response-note').textContent = s.lastAction;
    $('incident-count-label').textContent = `${activeIncidents.length} ОТКРЫТО`;
    const vehicles = window.worldScene ? window.worldScene.vehicles : [];
    $('police-status').textContent = vehicles.some(v => v.service === 'police' && v.phase !== 'return') ? 'В пути' : s.policePresence > 58 ? 'Усилено' : 'Дежурство';
    $('fire-status').textContent = activeIncidents.some(i => i.type === 'fire' || i.type === 'arson') ? 'Выезд' : vehicles.some(v => v.service === 'fire') ? 'На вызове' : 'Готовы';
    $('medical-status').textContent = activeIncidents.some(i => i.type === 'medical' || i.type === 'accident') ? 'Выезд' : vehicles.some(v => v.service === 'ambulance') ? 'На вызове' : 'Готовы';
    this.drawChart();
  }

  updatePolitics() {
    const partyContainer = document.getElementById('support-breakdown');
    const sorted = [...this.sim.parties].sort((a, b) => b.support - a.support);
    partyContainer.innerHTML = '';
    sorted.forEach(party => {
      const item = document.createElement('div'); item.className = 'support-item';
      const left = document.createElement('div');
      const label = document.createElement('div'); label.className = 'party-label';
      const swatch = document.createElement('i'); swatch.className = 'party-swatch'; swatch.style.background = party.color;
      const text = document.createElement('span'); text.textContent = party.name;
      label.append(swatch, text);
      const bar = document.createElement('div'); bar.className = 'party-bar';
      const fill = document.createElement('span'); fill.style.width = `${party.support}%`; fill.style.background = party.color;
      bar.append(fill); left.append(label, bar);
      const val = document.createElement('strong'); val.textContent = `${UI_U.fmt(party.support, 1)}%`;
      item.append(left, val); partyContainer.append(item);
    });
    const factions = [
      { name: 'Наёмные работники', sub: 'Доходы и условия труда', value: UI_U.clamp(52 + (this.sim.state.policies.welfare - 54) * .22 - (this.sim.state.unemployment - 7.4) * 2.3, 8, 92), color: '#c47d70' },
      { name: 'Предприниматели', sub: 'Налоги и предсказуемость правил', value: this.sim.state.taxMorale, color: '#d0b06c' },
      { name: 'Общественные службы', sub: 'Качество услуг и ресурсы', value: this.sim.state.serviceQuality, color: '#78aaa2' },
      { name: 'Молодые горожане', sub: 'Перспективы и свобода информации', value: UI_U.clamp(this.sim.state.policies.mediaFreedom * .48 + (100 - this.sim.state.unemployment * 7) * .22 + 15, 8, 94), color: '#8b93bf' },
      { name: 'Регионы', sub: 'Связность и инвестиции', value: UI_U.clamp(this.sim.state.policies.infrastructure * .55 + this.sim.state.policies.welfare * .2 + 10, 10, 92), color: '#82a879' }
    ];
    const factionContainer = document.getElementById('factions-list'); factionContainer.innerHTML = '';
    factions.forEach(f => {
      const row = document.createElement('div'); row.className = 'faction-row';
      const copy = document.createElement('div'); copy.className = 'faction-copy';
      const mark = document.createElement('i'); mark.className = 'faction-mark'; mark.style.background = f.color;
      const t = document.createElement('div');
      const name = document.createElement('strong'); name.textContent = f.name;
      const desc = document.createElement('small'); desc.textContent = f.sub;
      t.append(name, desc); copy.append(mark, t);
      const meter = document.createElement('div'); meter.className = 'faction-meter';
      const value = document.createElement('strong'); value.textContent = `${Math.round(f.value)} / 100`;
      const track = document.createElement('div'); const fill = document.createElement('i'); fill.style.width = `${f.value}%`; fill.style.background = f.color; track.append(fill);
      meter.append(value, track); row.append(copy, meter); factionContainer.append(row);
    });
    const agenda = document.getElementById('protest-agenda');
    if (agenda && typeof this.sim.getProtestGroups === 'function') {
      agenda.innerHTML = '';
      const groups = this.sim.getProtestGroups().filter(g => g.id !== 'supporters').sort((a,b) => (b.grievance * Math.sqrt(b.participants)) - (a.grievance * Math.sqrt(a.participants)));
      groups.slice(0, 12).forEach(g => {
        const row = document.createElement('div'); row.className = 'agenda-row';
        const copy = document.createElement('div'); copy.className = 'agenda-copy';
        const top = document.createElement('div'); top.className = 'agenda-topline';
        const name = document.createElement('strong'); name.textContent = g.name;
        const count = document.createElement('span'); count.textContent = `≈ ${UI_U.fmtInt(g.participants)}`;
        top.append(name,count);
        const demand = document.createElement('p'); demand.textContent = g.demand;
        const stance = document.createElement('small'); stance.textContent = `${g.stance} · недовольство ${g.grievance}/100`;
        copy.append(top,demand,stance);
        const action = document.createElement('button'); action.type = 'button'; action.className = 'agenda-talk'; action.textContent = g.id==='hardliners'?'Ответить публично':'Обсудить'; action.dataset.negotiateGroup = g.id; action.setAttribute('aria-label', g.id==='hardliners'?'Опубликовать обязательство для радикальной группы':`Начать переговоры: ${g.name}`);
        row.append(copy,action); agenda.append(row);
      });
    }
  }

  openNegotiations(groupId = null) {
    if(groupId==='hardliners') {
      const promise=this.sim.makePromise('hardliners');
      this.toast('Прямого представителя нет',promise?'Вместо прямых переговоров опубликовано публичное обязательство. Срок и исполнение останутся в журнале.':'Публичное обязательство пока не создано.','warning');
      this.renderAll(true);return;
    }
    this.sim.startNegotiations(groupId);
    this.renderNegotiation();
  }

  closeNegotiations() {
    const overlay = document.getElementById('negotiation-overlay');
    if (overlay) overlay.hidden = true;
  }

  chooseNegotiationResponse(choice) {
    const ok = this.sim.resolveNegotiation(choice);
    if (!ok) return;
    this.renderNegotiation();
    this.renderAll(true);
  }

  renderNegotiation() {
    const overlay = document.getElementById('negotiation-overlay');
    const n = this.sim.state.activeNegotiation;
    if (!n) { overlay.hidden = true; return; }
    overlay.hidden = false;
    document.getElementById('negotiation-title').textContent = `Переговоры: ${n.groupName}`;
    document.getElementById('negotiation-speaker').textContent = `${n.representative} · делегация примерно ${UI_U.fmtInt(n.participants)} участников · раунд ${n.round}`;
    document.getElementById('negotiation-demand').textContent = `ОСНОВНОЕ ТРЕБОВАНИЕ: ${n.demand}`;
    const transcript = document.getElementById('negotiation-transcript'); transcript.innerHTML = '';
    n.transcript.forEach(message => {
      const item = document.createElement('div'); item.className = `transcript-message ${message.side === 'government' ? 'government-message' : 'citizen-message'}`;
      const speaker = document.createElement('strong'); speaker.textContent = message.speaker;
      const body = document.createElement('p'); body.textContent = message.text;
      item.append(speaker,body); transcript.append(item);
    });
    const options = document.getElementById('negotiation-options'); options.innerHTML = '';
    const choices = n.stage === 'opening' ? [
      ['accept','Принять требование','Кабинет берёт на себя обязательство изменить политику.'],
      ['counter','Предложить компромисс','Поэтапный план с публичным контролем исполнения.'],
      ['hearing','Назначить открытые слушания','Протокол, альтернативы и повторная встреча без немедленных уступок.'],
      ['reject','Отказать','Сохранить текущий курс; риск роста недовольства.']
    ] : [
      ['counter_accept','Подтвердить поэтапный план','Принять умеренный вариант и механизм отчётности.'],
      ['counter_improve','Улучшить предложение','Предложить более весомые уступки ради соглашения.'],
      ['counter_end','Прервать переговоры','Каналы связи останутся, но соглашения не будет.']
    ];
    choices.forEach(([value,label,desc]) => {
      const button = document.createElement('button'); button.type='button'; button.className=`negotiation-choice choice-${value}`; button.dataset.negotiationChoice=value;
      const title = document.createElement('strong'); title.textContent=label;
      const detail = document.createElement('small'); detail.textContent=desc;
      button.append(title,detail); options.append(button);
    });
  }

  updateEconomy() {
    const container = document.getElementById('company-list'); container.innerHTML = '';
    this.sim.companies.slice().sort((a, b) => b.demand - a.demand).forEach(c => {
      const row = document.createElement('div'); row.className = 'company-row';
      const name = document.createElement('div'); name.className = 'company-name';
      const strong = document.createElement('strong'); strong.textContent = c.name;
      const small = document.createElement('small'); small.textContent = `${c.sector} · ${UI_U.fmtInt(c.employees)} чел.`;
      name.append(strong, small);
      const demand = document.createElement('div'); demand.className = 'company-demand';
      const dtext = document.createElement('span'); dtext.textContent = `Спрос ${Math.round(c.demand)}`;
      const bar = document.createElement('div'); const fill = document.createElement('i'); fill.style.width = `${UI_U.clamp(c.demand / 115 * 100, 0, 100)}%`;
      fill.style.background = c.status === 'shortage' ? '#d0a362' : c.status === 'pressure' ? '#c87568' : '#769f91';
      bar.append(fill); demand.append(dtext, bar);
      const profit = document.createElement('div'); profit.className = `company-profit${c.lastProfit < 0 ? ' negative' : ''}`;
      profit.textContent = `${c.lastProfit >= 0 ? '+' : '−'}${UI_U.fmt(Math.abs(c.lastProfit), 1)} млн`;
      row.append(name, demand, profit); container.append(row);
    });
    const trend = this.sim.history;
    if (trend.length > 40) trend.splice(0, trend.length - 40);
  }

  updateIncidents() {
    const container = document.getElementById('incident-list'); container.innerHTML = '';
    const active = this.sim.state.incidents.filter(i => i.status !== 'resolved').slice().reverse();
    if (!active.length) {
      const empty = document.createElement('div'); empty.className = 'empty-state';
      empty.textContent = 'Открытых инцидентов нет. Дежурные службы находятся в готовности.';
      container.append(empty); return;
    }
    active.forEach(inc => {
      const row = document.createElement('div'); row.className = 'incident-row';
      const dot = document.createElement('i'); dot.className = `incident-dot${inc.level === 'critical' ? ' critical' : inc.status === 'resolved' ? ' good' : ''}`;
      const copy = document.createElement('div');
      const title = document.createElement('strong'); title.textContent = inc.label;
      const detail = document.createElement('small');
      const serviceNames = { police: 'полиция', fire: 'пожарные', ambulance: 'медики' };
      const serviceText = inc.serviceProgress && Object.keys(inc.serviceProgress).length
        ? `на месте: ${Object.keys(inc.serviceProgress).map(key => serviceNames[key] || key).join(', ')}`
        : 'ожидает прибытия службы';
      detail.textContent = `${inc.id} · ${inc.age} ч · ${serviceText}`;
      copy.append(title, detail);
      const severity = document.createElement('span'); severity.className = 'incident-severity'; severity.textContent = `${Math.round(inc.severity)}%`;
      row.append(dot, copy, severity); container.append(row);
    });
  }

  renderNews() {
    const container = document.getElementById('news-list'); container.innerHTML = '';
    const items = this.sim.news.filter(n => this.newsFilter === 'all' || n.category === this.newsFilter).slice(0, 16);
    document.getElementById('news-count').textContent = `${String(items.length).padStart(2, '0')} ЗАПИСЕЙ`;
    if (!items.length) {
      const empty = document.createElement('div'); empty.className = 'empty-state'; empty.textContent = 'В этой категории пока нет сообщений.'; container.append(empty); return;
    }
    const categories = { politics: 'ПОЛИТИКА', economy: 'ЭКОНОМИКА', city: 'ГОРОД' };
    const icons = { politics: '§', economy: '↗', city: '⌖' };
    items.forEach(news => {
      const item = document.createElement('article'); item.className = 'news-item';
      const icon = document.createElement('div'); icon.className = `news-icon ${news.level || 'info'}`; icon.textContent = icons[news.category] || '•';
      const main = document.createElement('div'); main.className = 'news-item-main';
      const meta = document.createElement('div'); meta.className = 'news-meta';
      const cat = document.createElement('span'); cat.className = 'news-category'; cat.textContent = categories[news.category] || 'СВОДКА';
      const time = document.createElement('span'); time.textContent = `Д${String(news.day).padStart(2, '0')} · ${String(news.hour).padStart(2, '0')}:00`;
      const level = document.createElement('span'); level.textContent = news.level === 'critical' ? 'ЭКСТРЕННО' : news.level === 'alert' ? 'ВНИМАНИЕ' : news.level === 'good' ? 'ОТЧЁТ' : 'ИНФО';
      meta.append(cat, time, level);
      const title = document.createElement('h3'); title.textContent = news.title;
      const body = document.createElement('p'); body.textContent = news.body;
      main.append(meta, title, body); item.append(icon, main); container.append(item);
    });
  }

  _updatePolicyValue(key, value) {
    const ids = { tax: 'tax-value', welfare: 'welfare-value', policing: 'policing-value', healthcare: 'healthcare-value', infrastructure: 'infrastructure-value', environment: 'environment-value', mediaFreedom: 'freedom-value' };
    const el = document.getElementById(ids[key]); if (el) el.textContent = String(Math.round(value));
  }

  _syncPolicyInputs() {
    document.querySelectorAll('[data-policy]').forEach(input => {
      const key = input.dataset.policy;
      input.value = this.draft[key] ?? this.sim.state.policies[key];
      this._updatePolicyValue(key, Number(input.value));
    });
  }

  _updateDraftStatus() {
    const changed = Object.keys(this.draft).some(k => Number(this.draft[k]) !== Number(this.sim.state.policies[k]));
    const tag = document.getElementById('draft-status');
    tag.textContent = changed ? 'ЧЕРНОВИК ИЗМЕНЁН' : 'ТЕКУЩИЙ КУРС';
    tag.classList.toggle('is-draft', changed);
    document.getElementById('apply-policies').disabled = !changed;
  }

  _updateBudgetPreview() {
    const p = this.sim.previewBudget(this.draft);
    const el = document.getElementById('budget-preview');
    el.textContent = `${UI_U.signed(p.balance, 1, ' млн / день')}`;
    el.style.color = p.balance >= 0 ? '#8ebca4' : '#d9b678';
  }

  _updateTicker() {
    const track = document.getElementById('ticker-track');
    const latest = this.sim.announcements.slice(0, 4).map(a => a.text);
    track.textContent = latest.length ? latest.join('   ◆   ') : 'Нет новых оперативных сообщений.';
    const offset = this.sim.announcements[0];
    if (offset && offset.level === 'critical') track.style.color = '#e1a294';
    else if (offset && offset.level === 'warning') track.style.color = '#d9bd87';
    else track.style.color = '#c4d0cb';
  }

  updateRunStatus() {
    const paused = !!this.sim.state.paused;
    const state = document.getElementById('run-state');
    state.textContent = paused ? 'СИМУЛЯЦИЯ НА ПАУЗЕ' : 'СИМУЛЯЦИЯ АКТИВНА';
    const dot = document.querySelector('.status-dot'); dot.style.background = paused ? '#c5a46a' : '#82af99';
    document.getElementById('pause-label').textContent = paused ? 'Продолжить' : 'Пауза';
    document.getElementById('pause-icon').textContent = paused ? '▶' : 'Ⅱ';
  }

  _conditionLabel(id) {
    return ({ clear: 'нормальная видимость', cloud: 'облачно', rain: 'дождь', fog: 'туман', heat: 'жара', storm: 'гроза', cold: 'похолодание' })[id] || 'нормальная видимость';
  }

  drawChart() {
    const canvas = document.getElementById('economy-chart');
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, width, height);
    const w = rect.width, h = rect.height;
    ctx.save(); ctx.scale(dpr, dpr);
    const pad = { left: 4, right: 7, top: 7, bottom: 12 };
    const cw = w - pad.left - pad.right, ch = h - pad.top - pad.bottom;
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(93,118,116,.22)';
    for (let i = 0; i < 4; i++) { const y = pad.top + ch * i / 3; ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(w - pad.right, y); ctx.stroke(); }
    const vals = (this.sim.history || []).slice(-32);
    vals.push(this.sim.state.marketIndex);
    const min = Math.min(...vals) - 2, max = Math.max(...vals) + 2;
    const coords = vals.map((v, i) => ({ x: pad.left + cw * i / Math.max(1, vals.length - 1), y: pad.top + ch * (1 - (v - min) / Math.max(1, max - min)) }));
    const fill = ctx.createLinearGradient(0, pad.top, 0, h);
    fill.addColorStop(0, 'rgba(83,158,143,.22)'); fill.addColorStop(1, 'rgba(83,158,143,0)');
    ctx.beginPath(); coords.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
    ctx.lineTo(coords[coords.length - 1].x, h - pad.bottom); ctx.lineTo(coords[0].x, h - pad.bottom); ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
    ctx.beginPath(); coords.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
    ctx.strokeStyle = '#79b3a3'; ctx.lineWidth = 1.6; ctx.lineJoin = 'round'; ctx.stroke();
    const current = coords[coords.length - 1];
    ctx.strokeStyle = '#d8e3d9'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(current.x, current.y - 3.5); ctx.lineTo(current.x, current.y + 3.5); ctx.stroke();
    ctx.font = '8px ui-monospace, monospace'; ctx.fillStyle = '#718885';
    ctx.fillText(`Д${String(this.sim.state.day).padStart(2, '0')}`, pad.left, h - 1);
    ctx.textAlign = 'right'; ctx.fillText(`БАЗА 100`, w - pad.right, h - 1);
    ctx.restore();
  }

  setFps(value) { const el = document.getElementById('fps-value'); if (el) el.textContent = String(value); }

  toast(title, message, tone = 'info') {
    const stack = document.getElementById('toast-stack');
    const node = document.createElement('div'); node.className = `toast ${tone === 'warning' ? 'warning' : tone === 'error' ? 'error' : ''}`;
    const label = document.createElement('span'); label.className = 'toast-title'; label.textContent = title.toUpperCase();
    const text = document.createElement('span'); text.textContent = message;
    node.append(label, text); stack.append(node);
    while (stack.children.length > 4) stack.removeChild(stack.firstElementChild);
    window.setTimeout(() => { node.style.opacity = '0'; node.style.transform = 'translateY(5px)'; window.setTimeout(() => node.remove(), 250); }, 4600);
  }

  saveGame(automatic = false) {
    try {
      localStorage.setItem('kontur-republic-save-v2', JSON.stringify(this.sim.snapshot()));
      this._lastSaveAt = new Date();
      const label = document.getElementById('last-save-label');
      label.textContent = `СОХРАНЕНО ${this._lastSaveAt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
      if (!automatic) this.toast('Игра сохранена', 'Состояние экономики, политики, компаний и оперативных событий записано в браузере.', 'success');
      return true;
    } catch (err) {
      if (!automatic) this.toast('Не удалось сохранить', 'Браузер запретил доступ к localStorage. Попробуйте открыть проект через локальный веб-сервер.', 'error');
      return false;
    }
  }

  loadGame() {
    try {
      const raw = localStorage.getItem('kontur-republic-save-v2');
      if (!raw) { this.toast('Сохранение не найдено', 'Сначала сохраните игру кнопкой со стрелкой вниз.', 'warning'); return false; }
      this.sim.loadSnapshot(JSON.parse(raw));
      this.draft = { ...this.sim.state.policies };
      this._syncPolicyInputs();
      this.renderAll(true);
      document.getElementById('last-save-label').textContent = 'ЗАГРУЖЕНО ИЗ БРАУЗЕРА';
      this.toast('Сохранение загружено', 'Предыдущее состояние восстановлено.', 'success');
      return true;
    } catch (err) {
      this.toast('Ошибка загрузки', `Сохранение не удалось прочитать: ${err.message}`, 'error');
      return false;
    }
  }
}

window.RepublicDashboardUI = RepublicDashboardUI;
