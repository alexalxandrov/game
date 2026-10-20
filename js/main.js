'use strict';

(function bootKontur() {
  const SAVE_KEY = 'kontur-republic-save-v8';
  // Previous versions remain available through the explicit Load button; do not auto-restore a runaway v6 autosave.
  const LEGACY_SAVE_KEYS = ['kontur-republic-save-v7_2','kontur-republic-save-v7_1','kontur-republic-save-v7','kontur-republic-save-v6','kontur-republic-save-v5','kontur-republic-save-v4','kontur-republic-save-v3','kontur-republic-save-v2'];

  function showFatal(message) {
    const parent = document.getElementById('game-container');
    if (parent) {
      parent.innerHTML = '';
      const box = document.createElement('div');
      box.style.cssText = 'display:grid;place-items:center;height:100%;padding:24px;background:#151e22;color:#d7e1db;text-align:center;font:12px/1.6 ui-monospace,monospace;';
      box.textContent = message;
      parent.appendChild(box);
    }
  }

  function start() {
    // Initialise the government/economy panels even if the external graphics CDN is unreachable.
    window.gameSimulation = new RepublicSimulation();
    try {
      const saved = localStorage.getItem(SAVE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        const supported = parsed && parsed.state && Array.isArray(parsed.companies) && parsed.version === GAME_CONFIG.version;
        if (supported) {
          window.gameSimulation.loadSnapshot(parsed);
          document.getElementById('last-save-label').textContent = 'АВТОВОССТАНОВЛЕНО ИЗ v8';
        } else if (LEGACY_SAVE_KEYS.some(key => Boolean(localStorage.getItem(key))) || saved) {
          const label = document.getElementById('last-save-label');
          if (label) label.textContent = 'НОВАЯ СИМУЛЯЦИЯ · ПРЕДЫДУЩЕЕ СОХРАНЕНИЕ ДОСТУПНО ЧЕРЕЗ «ЗАГРУЗИТЬ»';
        }
      } else if (LEGACY_SAVE_KEYS.some(key => Boolean(localStorage.getItem(key)))) {
        const label = document.getElementById('last-save-label');
        if (label) label.textContent = 'НОВАЯ СИМУЛЯЦИЯ · СТАРОЕ СОХРАНЕНИЕ ДОСТУПНО ЧЕРЕЗ «ЗАГРУЗИТЬ»';
      }
    } catch (err) {
      console.warn('Автозагрузка пропущена:', err);
    }

    window.dashboardUI = new RepublicDashboardUI(window.gameSimulation);
    if (!window.Phaser) {
      showFatal('Не удалось загрузить Phaser 3. Проверьте подключение к интернету. Политическая и экономическая модель остаётся доступной, но живой экран площади требует графической библиотеки.');
    } else {
      const config = {
        type: Phaser.AUTO,
        parent: 'game-container',
        width: 1280,
        height: 640,
        backgroundColor: '#7f8e89',
        scene: [RepublicCityScene],
        scale: {
          mode: Phaser.Scale.FIT,
          autoCenter: Phaser.Scale.CENTER_BOTH,
          width: 1280,
          height: 640,
          expandParent: false
        },
        render: {
          antialias: true,
          pixelArt: false,
          roundPixels: true,
          transparent: false,
          powerPreference: 'high-performance'
        },
        fps: { target: 60, forceSetTimeOut: false },
        input: { activePointers: 2 },
        banner: false
      };
      window.konturGame = new Phaser.Game(config);
    }

    window.setInterval(() => {
      if (window.gameSimulation && !window.gameSimulation.state.paused) {
        window.gameSimulation.tick(window.dashboardUI ? window.dashboardUI.speed : 1);
      }
    }, 1000);

    // Best-effort browser-local autosave. Explicit save/load buttons remain available.
    window.setInterval(() => {
      if (window.gameSimulation && window.dashboardUI && !window.gameSimulation.state.paused) {
        window.dashboardUI.saveGame(true);
      }
    }, 30000);

    window.addEventListener('resize', () => {
      if (window.dashboardUI) window.dashboardUI.drawChart();
    });

    window.addEventListener('beforeunload', () => {
      if (window.dashboardUI && window.gameSimulation && !window.gameSimulation.state.paused) {
        window.dashboardUI.saveGame(true);
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
