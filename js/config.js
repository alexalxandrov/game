'use strict';
window.GAME_CONFIG = {
  title: 'КОНТУР — Республика Вереск',
  version: '3.0.0',
  electionInterval: 20,
  minutesPerTick: 15,
  maxCrowd: 5000,
  cityPopulation: 5000,
  maxVisibleAgents: 200,
  maxIncidents: 14,
  maxNews: 80,
  currency: 'кр.',
  parties: [
    { id: 'civic', name: 'Гражданский союз', short: 'ГС', color: '#78aaa2', support: 31, ideology: 'Центризм' },
    { id: 'labor', name: 'Союз труда', short: 'СТ', color: '#c47d70', support: 26, ideology: 'Социальная политика' },
    { id: 'reform', name: 'Блок реформ', short: 'БР', color: '#d0b06c', support: 19, ideology: 'Рыночные реформы' },
    { id: 'green', name: 'Зелёная коалиция', short: 'ЗК', color: '#82a879', support: 14, ideology: 'Экология и регионы' },
    { id: 'regional', name: 'Региональное движение', short: 'РД', color: '#8b93bf', support: 10, ideology: 'Децентрализация' }
  ],
  companies: [
    { id: 'north-energy', name: 'СеверЭнерго', sector: 'Энергетика', employees: 4300, production: 82, price: 1.08, wage: 1.24, capital: 940, pollution: 68, demand: 86, sensitivity: 0.75 },
    { id: 'veresk-food', name: 'Вереск Агро', sector: 'Продовольствие', employees: 5800, production: 91, price: 0.96, wage: 0.91, capital: 690, pollution: 27, demand: 88, sensitivity: 0.48 },
    { id: 'ironworks', name: 'СтальКонтур', sector: 'Промышленность', employees: 6100, production: 77, price: 1.14, wage: 1.15, capital: 810, pollution: 78, demand: 70, sensitivity: 0.86 },
    { id: 'city-logistics', name: 'Городская логистика', sector: 'Транспорт', employees: 3900, production: 85, price: 1.02, wage: 1.03, capital: 520, pollution: 42, demand: 80, sensitivity: 0.61 },
    { id: 'bright-retail', name: 'Ярмарка', sector: 'Торговля', employees: 7200, production: 89, price: 1.03, wage: 0.82, capital: 470, pollution: 19, demand: 91, sensitivity: 0.56 },
    { id: 'build-union', name: 'Горстрой', sector: 'Строительство', employees: 3400, production: 74, price: 1.12, wage: 1.06, capital: 610, pollution: 51, demand: 68, sensitivity: 0.93 }
  ]
};
