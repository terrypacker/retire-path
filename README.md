# RetirePath — Claude Code Guide

## Project Overview

**RetirePath** is a vanilla JavaScript SPA for US-Australia cross-border retirement planning. No build step, no package manager, no framework — just static files served directly to the browser.

- **Live deployment**: GitHub Pages
- **Local dev**: `python3 -m http.server 8000` or `npx serve .` — **ES6 modules require an HTTP server; opening `index.html` directly via `file://` will not work.**
- **External deps**: Chart.js 4.4.1 (CDN), chartjs-plugin-annotation (CDN), Google Fonts (CDN)

---

## Architecture

The codebase uses **native ES6 modules** (`import`/`export`) with no build tooling. `app.js` is the single entry point loaded by `index.html` as `<script type="module">`. CDN libraries (Chart.js, annotation plugin) are loaded as plain `<script>` tags before the module so they are available on `window`.

### Module map

```
assets/js/
  app.js                  ← Entry point. Wires all modules, runs projection loop.
  appState.js             ← Singleton state store (pub/sub, localStorage)
  projectionEngine.js     ← Deterministic year-by-year retirement simulation
  chartManager.js         ← Chart.js wrapper for all charts
  uiManager.js            ← Input binding, KPI display, table rendering, modals
  debugLogger.js          ← Development logging utility
  assets/
    BaseAsset.js          ← Root of hierarchy; id, name, country, currency, getDisplayLabel()
    RealEstate.js         ← extends BaseAsset; applyAppreciation(), applyMortgageReduction(), getEquity(), isSoldThisYear(), hasActiveMortgage()
    Land.js               ← extends BaseAsset; undeveloped land stub (not yet in state)
    BaseAccount.js        ← extends BaseAsset; adds balance, growthRate, ownerId, type; applyGrowth()
    RetirementAccount.js  ← extends BaseAccount; 401k/Roth/IRA/Super; getContribution(), applyContributions(), canWithdraw()
    BrokerageAccount.js   ← extends BaseAccount; applyContributions(bal,basis), calculateWithdrawal()
    AssetFactory.js       ← wrapRetirementAccount(), wrapBrokerageAccount(), wrapAsset() — creates class instances from POJOs
  tax/
    BaseTaxModule.js           ← Abstract base class; shared _inflateBrackets/_applyBrackets utilities
    USTaxModuleBase.js         ← Shared US logic: calcIncomeTax, calcCapitalGainsTax, accountTreatment, calcSocialSecurity
    USTaxModule2024.js         ← US 2024 bracket data (IRS Rev. Proc. 2023-34)
    USTaxModule2025.js         ← US 2025 bracket data (IRS Rev. Proc. 2024-40)
    AustraliaTaxModuleBase.js  ← Shared AU logic: calcIncomeTax, calcCapitalGainsTax, accountTreatment, calcBrokerageAUGain
    AustraliaTaxModule2024.js  ← AU FY2024-25 brackets (Stage 3 tax cuts)
    AustraliaTaxModule2025.js  ← AU FY2025-26 brackets (30% rate extended to $135k)
    TaxEngine.js               ← Registry keyed by 'COUNTRY_YEAR'; get(countryCode, year) with best-year fallback; singleton taxEngine
  ui/
    formatters.js         ← fmtShort(), makeFmt() — pure number formatting
    modalHelpers.js       ← setField(), getField(), closeModal() — pure DOM
    toastManager.js       ← showToast() — stateless notification helper
```

### Core modules

| File | Role |
|------|------|
| `appState.js` | Singleton `appState`. Pub/sub state store with localStorage persistence. All state mutations go through its methods. |
| `projectionEngine.js` | Deterministic year-by-year simulation. Receives `appState` and `taxEngine` via constructor. |
| `tax/TaxEngine.js` | Singleton `taxEngine`. Registry keyed by `'COUNTRY_YEAR'`. `get(countryCode, year)` resolves the highest registered module whose year is ≤ the requested year, enabling forward projection via bracket inflation. |
| `uiManager.js` | Receives `appState` via constructor. Binds inputs, renders projection table, manages modals. Imports helpers from `ui/`. |
| `chartManager.js` | Imports `appState` singleton. Owns all Chart.js instances. |
| `app.js` | Module entry point. Imports all modules, constructs `chartManager`, instantiates `UIManager`, subscribes to state changes. |

### Data flow

```
User Input → UIManager → appState.set() → observer notifies App
                                                  ↓ (300ms debounce)
                                      ProjectionEngine.run()
                                                  ↓
                                ChartManager.updateAll() + UIManager.updateKPIs()
                                        + UIManager.renderProjectionTable()
```

State changes are debounced 300ms before triggering a projection run.

---

## Code Conventions

**JavaScript (ES6 modules):**
- Native `import`/`export` — no CommonJS, no bundler
- ES6 classes; singleton pattern for `appState` (exported from `appState.js`) and `taxEngine` (exported from `tax/TaxEngine.js`)
- `camelCase` for methods and properties
- `UPPER_SNAKE_CASE` for constants (tax brackets, rates)
- `_underscore` prefix for private/internal methods and properties
- JSDoc comments on public methods
- Visual section separators: `// ──────────────────`

**HTML:**
- BEM-inspired classes: `app-header`, `sidebar-section`, `form-group`, `kpi-card`
- `data-panel`, `data-currency`, `data-close-modal` attributes for behavior hooks
- Semantic elements: `<header>`, `<nav>`, `<aside>`, `<main>`, `<section>`

**CSS:**
- CSS Custom Properties for all colors/spacing: `--bg-primary`, `--accent-blue`, `--text-secondary`
- Dark theme (financial/professional aesthetic)
- Flexbox + CSS Grid for layout

**FILE COPYRIGHT:**
- Use the Apache 2 license text below and add language specific copyright headers to all source code files (HTML, css, javascript)
```text
 Copyright (c) 2026 Terry Packer.
 
 This file is part of Terry Packer's Work.
 See www.terrypacker.com for further info.
 
 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at
 
     http://www.apache.org/licenses/LICENSE-2.0
 
 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
```
---

## Key Patterns

**Adding a new tax year:**
Create a new file in `assets/js/tax/` named `{Country}TaxModule{YEAR}.js` that extends the country's base module (e.g. `USTaxModuleBase`). In the constructor call `super(year)` and set the year-specific data properties (`_brackets_mfj`, `_ltcg_mfj`, `_stdDeduction_mfj`, `_ficaWageBase` for US; `_brackets`, `_medicareLevy`, `_medicareLevySurcharge` for AU). If the new year requires different calculation logic, override the relevant method. Import and register the new module in `tax/TaxEngine.js`.

**Adding a new tax jurisdiction:**
Create a `{Country}TaxModuleBase.js` extending `BaseTaxModule` with all shared country logic. Add year-specific subclasses following the same pattern as US/AU. Import all year modules in `tax/TaxEngine.js` and register them in the constructor.

**Adding a new account type:**
1. If it needs custom logic, create a subclass of `RetirementAccount` or `BrokerageAccount` in `assets/js/assets/` and register it in `AssetFactory.wrapRetirementAccount()`
2. Add to `AppState` default state and helper CRUD methods
3. Handle in `ProjectionEngine` simulation loop (usually just works via base-class methods)
4. Add rendering in `UIManager`
5. Add tax treatment in the relevant `TaxModule.accountTreatment()`

**State mutations:**
Always go through `AppState` methods — never mutate `_state` directly from outside the class.

**No async:**
The entire calculation pipeline is synchronous. No Promises, no async/await in the core engine.

---

## Important Constraints

- **No build tooling** — do not introduce webpack, Vite, Rollup, or similar. Keep it deployable as static files.
- **No frameworks** — do not introduce React, Vue, etc.
- **No npm/package.json** — all dependencies remain CDN-loaded.
- **HTTP server required for local dev** — ES6 modules are blocked by browsers on `file://` origins.
- **No automated tests exist** — manual browser testing is the current practice.
- **Deterministic only** — the projection engine is intentionally deterministic (no Monte Carlo). Do not add stochastic modeling without discussion.
- **Tax modules are country+year-specific** — each module represents one jurisdiction and one base year. The engine selects the best available module (highest year ≤ projection year) and inflates brackets forward from there. US modules carry 2024 and 2025 MFJ rates; AU modules carry FY2024-25 and FY2025-26 rates.

---

## Known Limitations (by design)

Per the embedded methodology docs:
- No RMDs (Required Minimum Distributions)
- No state income taxes
- Simplified Social Security taxation (85% inclusion rule)
- No FBAR/FATCA modeling
- No estate/inheritance planning
- Australian Super as US-citizen trust complexity is simplified

Do not attempt to fix these silently — they are acknowledged limitations, not bugs.

---

## Help Documentation

Embedded help pages live in `assets/help/`:
- `inputs.htm` — field-by-field input guide
- `methodology.htm` — projection algorithm explanation
- `tax-guide.htm` — US-AU tax treatment reference
- `projections.htm` — projections tab reference

Update these when changing calculation behavior or adding new fields.
