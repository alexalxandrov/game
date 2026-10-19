'use strict';
window.GameUtils = {
  clamp(value, min, max) { return Math.max(min, Math.min(max, value)); },
  random(min, max) { return min + Math.random() * (max - min); },
  randomInt(min, max) { return Math.floor(this.random(min, max + 1)); },
  choose(items) { return items[Math.floor(Math.random() * items.length)]; },
  fmt(value, digits = 1) {
    return Number(value).toLocaleString('ru-RU', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  },
  fmtInt(value) { return Math.round(Number(value)).toLocaleString('ru-RU'); },
  signed(value, digits = 1, suffix = '') {
    const sign = value > 0 ? '+' : value < 0 ? '−' : '';
    return `${sign}${this.fmt(Math.abs(value), digits)}${suffix}`;
  },
  time(hour, minute) { return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`; },
  ago(day, hour) { return `Д${String(day).padStart(2, '0')} · ${String(hour).padStart(2, '0')}:00`; },
  safeClone(obj) { return JSON.parse(JSON.stringify(obj)); },
  weightedPick(items, weightKey = 'weight') {
    const total = items.reduce((sum, item) => sum + Math.max(0, item[weightKey] || 0), 0);
    let point = Math.random() * Math.max(1, total);
    for (const item of items) { point -= Math.max(0, item[weightKey] || 0); if (point <= 0) return item; }
    return items[items.length - 1];
  }
};
