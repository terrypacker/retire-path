# RetirePath — Claude Code Guide

## Project Overview

**RetirePath** is a vanilla JavaScript SPA for US-Australia cross-border retirement planning. No build step, no package manager, no framework — just static files served directly to the browser.

- **Live deployment**: GitHub Pages
- **Local dev**: `python3 -m http.server 8000` or `npx http-server`
- **External deps**: Chart.js 4.4.1 (CDN), Google Fonts (CDN)

---

## Architecture

Five modules wired together in `app.js`:

| File | Role |
|------|------|
| `assets/js/appState.js` | Singleton state store with pub/sub and localStorage persistence |
| `assets/js/projectionEngine.js` | Deterministic year-by-year retirement simulation |
| `assets/js/taxEngine.js` | Pluggable tax modules (US + Australia) |
| `assets/js/uiManager.js` | Input binding, rendering, modals, KPI display |
| `assets/js/chartManager.js` | Chart.js wrapper for all charts |
| `assets/js/app.js` | Bootstrap: wires modules, schedules projections on state change |

**Data flow:**
```
User Input → UIManager → AppState.set → Observer notifies App
                                                ↓
                                    ProjectionEngine.run()
                                                ↓
                              ChartManager.updateAll() + UIManager.updateKPIs()
```

State changes are debounced 300ms before triggering a projection run.

---

## Code Conventions

**JavaScript (ES6+):**
- ES6 classes with singleton pattern for `AppState` and `TaxEngine`
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

**Adding a new tax jurisdiction:**
Extend `BaseTaxModule` in `taxEngine.js` and implement `calcIncomeTax`, `calcCapitalGainsTax`, `getBrackets`, and `accountTreatment`.

**Adding a new account type:**
1. Add to `AppState` default state and helper CRUD methods
2. Handle in `ProjectionEngine` simulation loop
3. Add rendering in `UIManager`
4. Add tax treatment in the relevant `TaxModule.accountTreatment()`

**State mutations:**
Always go through `AppState` methods — never mutate `_state` directly from outside the class.

**No async:**
The entire calculation pipeline is synchronous. No Promises, no async/await in the core engine.

---

## Important Constraints

- **No build tooling** — do not introduce webpack, Vite, Rollup, or similar. Keep it deployable as static files.
- **No frameworks** — do not introduce React, Vue, etc.
- **No npm/package.json** — all dependencies remain CDN-loaded.
- **No automated tests exist** — manual browser testing is the current practice.
- **Deterministic only** — the projection engine is intentionally deterministic (no Monte Carlo). Do not add stochastic modeling without discussion.
- **Tax figures are year-specific** — US brackets are 2024 MFJ; Australian brackets are FY2024-25. Note the tax year when updating rates.

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
- `tax-guide.htm` — tax treatment reference

Update these when changing calculation behavior.
