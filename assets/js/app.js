/*
 * Copyright (c) 2026 Terry Packer.
 *
 * This file is part of Terry Packer's Work.
 * See www.terrypacker.com for further info.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * app.js
 * Main application controller and ES module entry point.
 * Wires AppState → ProjectionEngine → ChartManager + UIManager.
 * Run once on DOMContentLoaded.
 */

import { appState }         from './appState.js';
import { taxEngine }        from './tax/TaxEngine.js';
import { ProjectionEngine } from './projectionEngine.js';
import { ChartManager }     from './chartManager.js';
import { UIManager }        from './uiManager.js';

// Module-scoped singletons
const chartManager = new ChartManager();

class App {
  constructor() {
    this._engine = new ProjectionEngine(appState, taxEngine);
    this._debounceTimer = null;
  }

  init() {
    // Try to load saved state
    appState.load();

    // Init UI (binds all inputs)
    uiManager.init();
    uiManager.renderTaxBrackets();

    // Subscribe to state changes → re-run projection
    appState.subscribe((changedKeys) => {
      this._scheduleProjection();
    });

    // Run initial projection
    this._runProjection();

    // Modal close buttons
    document.querySelectorAll('.modal-close, [data-close-modal]').forEach(btn => {
      btn.addEventListener('click', () => {
        btn.closest('.modal-overlay').classList.remove('open');
      });
    });

    // Close modal on overlay click
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.classList.remove('open');
      });
    });

    console.log('[App] Initialized');
  }

  _scheduleProjection() {
    clearTimeout(this._debounceTimer);
    this._debounceTimer = setTimeout(() => this._runProjection(), 300);
  }

  _runProjection() {
    try {
      const years = this._engine.run();
      chartManager.updateAll(years);
      uiManager.updateKPIs(years);
      uiManager.renderProjectionTable(years);
      uiManager.renderTaxBrackets();
    } catch (err) {
      console.error('[App] Projection error:', err);
      uiManager.toast('Projection error — check inputs', 'error');
    }
  }
}

// ── Bootstrap ────────────────────────────────────────────────────────────────
let uiManager;
let app;

document.addEventListener('DOMContentLoaded', () => {
  uiManager = new UIManager(appState);
  app = new App();
  app.init();
});
