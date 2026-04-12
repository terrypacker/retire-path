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
 * uiManager.js
 * Renders and manages all UI components:
 * sidebar inputs, KPI bar, projection table, account modals, toast.
 */

import { taxEngine }    from './tax/TaxEngine.js';
import { DebugLogger }  from './debugLogger.js';
import { fmtShort, makeFmt } from './ui/formatters.js';
import { setField, getField, closeModal as closeModalFn } from './ui/modalHelpers.js';
import { showToast }    from './ui/toastManager.js';

export class UIManager {
  constructor(state) {
    this._state = state;
    this._toastTimeout = null;
    this._projectionByYear = {};
    this._bound = false;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Bootstrap — wire all sidebar inputs to state
  // ══════════════════════════════════════════════════════════════════════════
  init() {
    if (!this._bound) {
      this._bindPeopleInputs();
      this._bindFinanceInputs();
      this._bindMoveSlider();
      this._bindCurrencyToggle();
      this._bindTaxYearSelect();
      this._bindFxRate();
      this._bindSaveLoad();
      this._bindFileBug();
      this._bindNavTabs();

      // Wire static action buttons (replaces inline onclick attributes)
      document.getElementById('btn-new-account')?.addEventListener('click', () => this.openNewAccountModal());
      document.getElementById('btn-new-property')?.addEventListener('click', () => this.openNewPropertyModal());
      document.getElementById('btn-new-brokerage')?.addEventListener('click', () => this.openNewBrokerageModal());
      document.getElementById('btn-save-account')?.addEventListener('click', () => this.saveAccountModal());
      document.getElementById('btn-save-property')?.addEventListener('click', () => this.savePropertyModal());
      document.getElementById('btn-save-brokerage')?.addEventListener('click', () => this.saveBrokerageModal());

      // Event delegation for dynamically rendered list buttons
      const accountList = document.getElementById('account-list');
      if (accountList) accountList.addEventListener('click', e => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const { action, id } = btn.dataset;
        if (action === 'edit')   this.openAccountModal(id);
        if (action === 'remove') this.removeAccount(id);
      });

      const propertyList = document.getElementById('property-list');
      if (propertyList) propertyList.addEventListener('click', e => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const { action, id } = btn.dataset;
        if (action === 'edit')   this.openPropertyModal(id);
        if (action === 'remove') this.removeProperty(id);
      });

      const brokerageList = document.getElementById('brokerage-list');
      if (brokerageList) brokerageList.addEventListener('click', e => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const { action, id } = btn.dataset;
        if (action === 'edit')   this.openBrokerageModal(id);
        if (action === 'remove') this.removeBrokerage(id);
      });

      this._bound = true;
    }
    this._renderAccountList();
    this._renderPropertyList();
    this._renderBrokerageList();
  }

  // ── Navigation tabs ───────────────────────────────────────────────────────
  _bindNavTabs() {
    document.querySelectorAll('.nav-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        const target = tab.dataset.panel;
        const panel = document.getElementById('panel-' + target);
        if (panel) panel.classList.add('active');
      });
    });
  }

  // ── People inputs ─────────────────────────────────────────────────────────
  _bindPeopleInputs() {
    const s = this._state;
    const people = s.get('people');

    people.forEach((person, idx) => {
      this._bindInput(`p${idx+1}-name`,           v => { people[idx].name = v;              s.set('people', [...people]); }, person.name, false);
      this._bindInput(`p${idx+1}-birth-year`,      v => { people[idx].birthYear = +v;        s.set('people', [...people]); }, person.birthYear);
      this._bindInput(`p${idx+1}-retire-age`,      v => { people[idx].retirementAge = +v;    s.set('people', [...people]); }, person.retirementAge);
      this._bindInput(`p${idx+1}-life-exp`,        v => { people[idx].lifeExpectancy = +v;   s.set('people', [...people]); }, person.lifeExpectancy);
      this._bindInput(`p${idx+1}-ss-age`,          v => { people[idx].socialSecurityAge = +v; s.set('people', [...people]); }, person.socialSecurityAge);
      this._bindInput(`p${idx+1}-ss-monthly`,      v => { people[idx].socialSecurityMonthly = +v; s.set('people', [...people]); }, person.socialSecurityMonthly);
      this._bindInput(`p${idx+1}-annual-income`,   v => { people[idx].annualIncome = +v;     s.set('people', [...people]); }, person.annualIncome);
    });
  }

  // ── Finance inputs ────────────────────────────────────────────────────────
  _bindFinanceInputs() {
    const s = this._state;
    this._bindInput('inflation-us',          v => s.set('inflationUS', +v),            s.get('inflationUS'));
    this._bindInput('inflation-aus',         v => s.set('inflationAUS', +v),           s.get('inflationAUS'));
    this._bindInput('annual-expenses',       v => { s.set('currentAnnualExpenses', +v); this._updateRetirementExpenseHint(); }, s.get('currentAnnualExpenses'));
    this._bindInput('retirement-ratio',      v => { s.set('retirementExpenseRatio', +v / 100); this._updateRetirementExpenseHint(); }, s.get('retirementExpenseRatio') * 100);
    this._bindInput('au-expense-ratio',      v => s.set('australiaExpenseRatio',  +v / 100), s.get('australiaExpenseRatio')  * 100);
    this._bindInput('target-end-balance',    v => s.set('targetEndBalance', +v),       s.get('targetEndBalance'));
    this._updateRetirementExpenseHint();
  }

  // ── Retirement expense hint ───────────────────────────────────────────────
  _updateRetirementExpenseHint() {
    const el = document.getElementById('retirement-ratio-expense');
    if (!el) return;
    const s = this._state;
    const annualExpenses = s.get('currentAnnualExpenses');
    const ratio = s.get('retirementExpenseRatio');
    const retirementExpense = annualExpenses * ratio;
    const display = s.toDisplayCurrency(retirementExpense);
    const symbol = s.getCurrencySymbol();
    let formatted;
    if (display >= 1_000_000)      formatted = symbol + (display / 1_000_000).toFixed(2) + 'M';
    else if (display >= 1_000)     formatted = symbol + (display / 1_000).toFixed(1) + 'K';
    else                           formatted = symbol + display.toFixed(0);
    el.textContent = formatted;
  }

  // ── Move slider ───────────────────────────────────────────────────────────
  _bindMoveSlider() {
    const slider  = document.getElementById('move-year-slider');
    const display = document.getElementById('move-year-display');
    const toggle  = document.getElementById('move-enabled-toggle');
    if (!slider) return;

    const s = this._state;
    const currentYear = new Date().getFullYear();
    slider.min   = currentYear;
    slider.max   = currentYear + 30;
    slider.value = s.get('moveToAustraliaYear');

    const updateTrack = () => {
      const min = +slider.min, max = +slider.max, val = +slider.value;
      const pct = ((val - min) / (max - min)) * 100;
      slider.style.setProperty('--progress', pct + '%');
      if (display) display.textContent = val;
    };
    updateTrack();

    slider.addEventListener('input', () => {
      s.set('moveToAustraliaYear', +slider.value);
      updateTrack();
    });

    if (toggle) {
      toggle.checked = s.get('moveEnabled');
      toggle.addEventListener('change', () => {
        s.set('moveEnabled', toggle.checked);
        slider.disabled = !toggle.checked;
      });
    }
  }

  // ── Currency toggle ───────────────────────────────────────────────────────
  _bindCurrencyToggle() {
    document.querySelectorAll('.currency-toggle button').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.currency-toggle button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this._state.set('currency', btn.dataset.currency);
        this._updateRetirementExpenseHint();
      });
    });
    // Set initial active
    const cur = this._state.get('currency');
    document.querySelectorAll('.currency-toggle button').forEach(btn => {
      if (btn.dataset.currency === cur) btn.classList.add('active');
    });
  }

  // ── Tax Year Select ───────────────────────────────────────────────────────
  _bindTaxYearSelect() {
    const select = document.getElementById('tax-year-select');
    if (!select) return;
    const years = taxEngine.getAvailableYears();
    select.innerHTML = years.map(y => `<option value="${y}">${y} Rates</option>`).join('');
    select.value = this._state.get('taxBaseYear');
    select.addEventListener('change', () => {
      this._state.set('taxBaseYear', +select.value);
    });
  }

  // ── FX Rate ───────────────────────────────────────────────────────────────
  _bindFxRate() {
    const el = document.getElementById('fx-rate-display');
    if (!el) return;
    const s = this._state;
    const render = () => { el.textContent = `1 USD = ${s.get('fxRate').toFixed(4)} AUD`; };
    render();
    el.addEventListener('click', () => {
      const val = prompt('Enter FX rate (1 USD = X AUD):', s.get('fxRate'));
      if (val && !isNaN(+val) && +val > 0) {
        s.set('fxRate', +val);
        render();
      }
    });
  }

  // ── Save / Load ───────────────────────────────────────────────────────────
  _bindSaveLoad() {
    const saveBtn        = document.getElementById('btn-save');
    const saveDropdown   = document.getElementById('save-dropdown');
    const loadBtn        = document.getElementById('btn-load');
    const loadDropdown   = document.getElementById('load-dropdown');
    const jsonFileInput  = document.getElementById('json-file-input');

    const _toggleDropdown = (dropdown, other) => {
      other?.classList.remove('open');
      dropdown?.classList.toggle('open');
    };

    document.addEventListener('click', (e) => {
      if (!e.target.closest('#btn-save') && !e.target.closest('#save-dropdown')) {
        saveDropdown?.classList.remove('open');
      }
      if (!e.target.closest('#btn-load') && !e.target.closest('#load-dropdown')) {
        loadDropdown?.classList.remove('open');
      }
    });

    if (saveBtn) saveBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      _toggleDropdown(saveDropdown, loadDropdown);
    });

    document.getElementById('btn-save-browser')?.addEventListener('click', () => {
      saveDropdown?.classList.remove('open');
      this._state.save();
      this.toast('Plan saved to browser storage', 'success');
    });

    document.getElementById('btn-save-json')?.addEventListener('click', () => {
      saveDropdown?.classList.remove('open');
      const json = this._state.exportJSON();
      const blob = new Blob([json], { type: 'application/json' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = 'retire-path-plan.json';
      a.click();
      URL.revokeObjectURL(url);
      this.toast('Plan saved as JSON file', 'success');
    });

    if (loadBtn) loadBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      _toggleDropdown(loadDropdown, saveDropdown);
    });

    document.getElementById('btn-load-browser')?.addEventListener('click', () => {
      loadDropdown?.classList.remove('open');
      if (confirm('Load saved plan from browser storage? This will overwrite current inputs.')) {
        const ok = this._state.load();
        if (ok) { this.toast('Plan loaded from browser storage', 'success'); this.init(); }
        else    { this.toast('No saved plan found in browser storage', 'warning'); }
      }
    });

    document.getElementById('btn-load-json')?.addEventListener('click', () => {
      loadDropdown?.classList.remove('open');
      jsonFileInput?.click();
    });

    if (jsonFileInput) jsonFileInput.addEventListener('change', () => {
      const file = jsonFileInput.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        if (confirm('Load plan from JSON file? This will overwrite current inputs.')) {
          const ok = this._state.loadFromJSON(e.target.result);
          if (ok) { this.toast('Plan loaded from JSON file', 'success'); this.init(); }
          else    { this.toast('Failed to load JSON file', 'error'); }
        }
      };
      reader.readAsText(file);
      jsonFileInput.value = '';
    });
  }

  // ── Save / Load ───────────────────────────────────────────────────────────
  _bindFileBug() {
    const bugBtn = document.getElementById('btn-bug');

    if (bugBtn) bugBtn.addEventListener('click', () => {
      DebugLogger.panel.style.display = 'block';
      //Compile the bug content
      //const urlBase = 'https://github.com/terrypacker/retire-path/issues/new';
      //window.open(urlBase, '_blank');
    });
  }

  // ── Generic input binder ──────────────────────────────────────────────────
  _bindInput(id, handler, initialValue, numeric = true) {
    const el = document.getElementById(id);
    if (!el) return;
    if (initialValue !== undefined) el.value = initialValue;
    el.addEventListener('change', () => handler(numeric ? +el.value : el.value));
    el.addEventListener('input',  () => handler(numeric ? +el.value : el.value));
  }

  // ══════════════════════════════════════════════════════════════════════════
  // KPI Bar
  // ══════════════════════════════════════════════════════════════════════════
  updateKPIs(years) {
    if (!years || years.length === 0) return;
    const s   = this._state;
    const fmt = makeFmt(s);

    const retirementYear = s.getEarliestRetirementYear();
    const retYear = years.find(y => y.year === retirementYear) || years[0];
    const lastYear = years[years.length - 1];
    const peakNetWorth = Math.max(...years.map(y => y.netWorth));
    const retirementDuration = s.getLatestLifeExpectancyYear() - retirementYear;

    this._setKPI('kpi-retirement-nw',   fmt(retYear.netWorth),    `At retirement (${retirementYear})`);
    this._setKPI('kpi-peak-nw',         fmt(peakNetWorth),         'Peak net worth');
    this._setKPI('kpi-final-nw',        fmt(lastYear.netWorth),    `End of plan (${lastYear.year})`);
    this._setKPI('kpi-retirement-years', retirementDuration + ' yrs', 'Retirement duration');
  }

  _setKPI(id, value, sub) {
    const card = document.getElementById(id);
    if (!card) return;
    const valEl = card.querySelector('.kpi-value');
    const subEl = card.querySelector('.kpi-sub');
    if (valEl) valEl.textContent = value;
    if (subEl) subEl.textContent = sub;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Projection Table
  // ══════════════════════════════════════════════════════════════════════════
  renderProjectionTable(years) {
    const tbody = document.getElementById('projection-tbody');
    if (!tbody) return;
    const s   = this._state;
    const fmt = makeFmt(s);

    // Store for drill-down
    this._projectionByYear = {};
    years.forEach(yd => { this._projectionByYear[yd.year] = yd; });

    tbody.innerHTML = '';
    years.forEach(yd => {
      const tr = document.createElement('tr');
      const isMilestone = yd.milestones && yd.milestones.length > 0;
      if (isMilestone) tr.classList.add('milestone');

      const countryPill = yd.isPostMove
        ? `<span class="country-pill pill-aus">🇦🇺 AUS</span>`
        : `<span class="country-pill pill-us">🇺🇸 US</span>`;

      const milestone = isMilestone
        ? `<div style="font-size:0.65rem;color:var(--accent-gold);margin-top:2px;">${yd.milestones.join(' · ')}</div>`
        : '';

      tr.innerHTML = `
        <td>${yd.year} ${countryPill}${milestone}</td>
        <td class="cell-drilldown" data-year="${yd.year}" data-type="income" title="Click for breakdown">${fmt(yd.totalIncome)}</td>
        <td class="cell-drilldown" data-year="${yd.year}" data-type="outflow" title="Click for breakdown">${fmt(yd.totalOutflows)}</td>
        <td>${fmt(yd.netCashFlow, true)}</td>
        <td class="cell-drilldown" data-year="${yd.year}" data-type="tax-us" title="Click for US tax breakdown">${fmt(yd.usTax)}</td>
        <td class="cell-drilldown" data-year="${yd.year}" data-type="tax-au" title="Click for AU tax breakdown">${fmt(yd.auTax)}</td>
        <td class="cell-drilldown" data-year="${yd.year}" data-type="networth" title="Click for net worth breakdown">${fmt(yd.netWorth)}</td>
      `;
      tbody.appendChild(tr);
    });

    // Attach click handlers
    tbody.querySelectorAll('.cell-drilldown').forEach(cell => {
      cell.addEventListener('click', () => {
        const yd = this._projectionByYear[+cell.dataset.year];
        if (!yd) return;
        const type = cell.dataset.type;
        if (type === 'tax-us' || type === 'tax-au') {
          this.openTaxModal(yd, type);
        } else if (type === 'networth') {
          this.openNetWorthModal(yd);
        } else {
          this.openCashFlowModal(yd, type);
        }
      });
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Cash Flow Drill-Down Modal
  // ══════════════════════════════════════════════════════════════════════════
  openCashFlowModal(yd, type) {
    const modal = document.getElementById('modal-overlay-cashflow');
    if (!modal) return;
    const s   = this._state;
    const fmt = makeFmt(s, { kDecimals: 1 });

    const isIncome = type === 'income';
    const items    = isIncome ? (yd.incomeDetail || []) : (yd.outflowDetail || []);
    const total    = isIncome ? yd.totalIncome : yd.totalOutflows;
    const title    = isIncome
      ? `${yd.year} Income Breakdown`
      : `${yd.year} Outflow Breakdown`;

    document.getElementById('cashflow-modal-title').textContent = title;

    const rows = items.map(item => {
      const pct = total > 0 ? ((item.amount / total) * 100).toFixed(1) : '0.0';
      const note = item.gainWithdrawn > 0
        ? `<span class="cf-note">${fmt(item.gainWithdrawn)} capital gain</span>`
        : item.cgt > 0
          ? `<span class="cf-note">CGT ${fmt(item.cgt)} on ${fmt(item.grossValue)} sale</span>`
          : '';
      return `<tr>
        <td>${item.label}</td>
        <td class="cf-amount">${fmt(item.amount)}</td>
        <td class="cf-pct">${pct}%</td>
        <td>${note}</td>
      </tr>`;
    }).join('');

    const totalRow = `<tr class="cf-total-row">
      <td>Total</td>
      <td class="cf-amount">${fmt(total)}</td>
      <td class="cf-pct">100%</td>
      <td></td>
    </tr>`;

    document.getElementById('cashflow-modal-body').innerHTML = `
      <table class="proj-table cf-table">
        <thead><tr><th>Source</th><th>Amount</th><th>%</th><th>Notes</th></tr></thead>
        <tbody>${rows}${totalRow}</tbody>
      </table>
    `;

    modal.classList.add('open');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Tax Drill-Down Modal
  // ══════════════════════════════════════════════════════════════════════════
  openTaxModal(yd, type) {
    const modal = document.getElementById('modal-overlay-cashflow');
    if (!modal) return;
    const s   = this._state;
    const fmt = makeFmt(s, { kDecimals: 1, absInput: true });

    const isUS  = type === 'tax-us';
    const flag  = isUS ? '🇺🇸' : '🇦🇺';
    const label = isUS ? 'US' : 'Australian';
    const detail = isUS ? (yd.usTaxDetail || []) : (yd.auTaxDetail || []);
    const total  = isUS ? yd.usTax : yd.auTax;

    document.getElementById('cashflow-modal-title').textContent =
      `${flag} ${yd.year} ${label} Tax Breakdown`;

    const charges = detail.filter(d => !d.isCredit);
    const credits = detail.filter(d =>  d.isCredit);

    const chargeRows = charges.map(item => {
      const note = item.note ? `<span class="cf-note">${item.note}</span>` : '';
      return `<tr>
        <td>${item.label}</td>
        <td class="cf-amount">${fmt(item.amount)}</td>
        <td class="tax-notes">${note}</td>
      </tr>`;
    }).join('');

    let creditSection = '';
    if (credits.length > 0) {
      const creditRows = credits.map(item => {
        const note = item.note ? `<span class="cf-note">${item.note}</span>` : '';
        return `<tr>
          <td>${item.label}</td>
          <td class="cf-amount neg">−${fmt(item.amount)}</td>
          <td class="tax-notes">${note}</td>
        </tr>`;
      }).join('');
      creditSection = `
        <tr class="cf-section-row"><td colspan="3">Credits &amp; Offsets Applied</td></tr>
        ${creditRows}
      `;
    }

    const emptyRow = detail.length === 0
      ? `<tr><td colspan="3" style="text-align:center;color:#8a94b0;padding:16px;">
           ${!isUS && !yd.isPostMove ? 'No Australian tax — pre-move year' : 'No tax data for this year'}
         </td></tr>`
      : '';

    const totalRow = `<tr class="cf-total-row">
      <td>Net ${label} Tax</td>
      <td class="cf-amount">${fmt(total)}</td>
      <td></td>
    </tr>`;

    document.getElementById('cashflow-modal-body').innerHTML = `
      <table class="proj-table cf-table cf-table-tax">
        <thead><tr><th>Component</th><th>Amount</th><th>Notes</th></tr></thead>
        <tbody>${emptyRow}${chargeRows}${creditSection}${totalRow}</tbody>
      </table>
    `;

    modal.classList.add('open');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Net Worth Drill-Down Modal
  // ══════════════════════════════════════════════════════════════════════════
  openNetWorthModal(yd) {
    const modal = document.getElementById('modal-overlay-cashflow');
    if (!modal) return;
    const s   = this._state;
    const fmt = makeFmt(s, { kDecimals: 1 });

    document.getElementById('cashflow-modal-title').textContent = `Net Worth — ${yd.year}`;

    const detail = yd.netWorthDetail || [];
    const total  = yd.netWorth;

    const rows = detail.map(item => {
      const pct  = total > 0 ? ((item.amount / total) * 100).toFixed(1) : '0.0';
      const flag = item.country === 'AUS' ? '🇦🇺 ' : item.tag === 'Property' || item.tag === 'Brokerage' ? '' : '🇺🇸 ';
      const badge = `<span class="nw-tag nw-tag-${item.tag.toLowerCase().replace(/\s+/g, '-')}">${flag}${item.tag}</span>`;

      let note = '';
      if (item.propValue != null) {
        const unrealised = item.amount < item.propValue
          ? `value ${fmt(item.propValue)}, mortgage ${fmt(item.propMortgage)}`
          : `value ${fmt(item.propValue)}, no mortgage`;
        note = `<span class="cf-note">${unrealised}</span>`;
      } else if (item.costBasis != null) {
        const gain = item.amount - item.costBasis;
        const gainStr = gain >= 0
          ? `<span class="pos">+${fmt(gain)}</span>`
          : `<span class="neg">${fmt(gain)}</span>`;
        note = `<span class="cf-note">cost basis ${fmt(item.costBasis)}, unrealised gain ${gainStr}</span>`;
      }

      return `<tr>
        <td>${item.label} ${badge}</td>
        <td class="cf-amount">${fmt(item.amount)}</td>
        <td class="cf-pct">${pct}%</td>
        <td>${note}</td>
      </tr>`;
    }).join('');

    const emptyRow = detail.length === 0
      ? `<tr><td colspan="4" style="text-align:center;color:#8a94b0;padding:16px;">No assets this year</td></tr>`
      : '';

    const totalRow = `<tr class="cf-total-row">
      <td>Total Net Worth</td>
      <td class="cf-amount">${fmt(total)}</td>
      <td class="cf-pct">100%</td>
      <td></td>
    </tr>`;

    document.getElementById('cashflow-modal-body').innerHTML = `
      <table class="proj-table cf-table">
        <thead><tr><th>Asset</th><th>Value</th><th>%</th><th>Notes</th></tr></thead>
        <tbody>${emptyRow}${rows}${totalRow}</tbody>
      </table>
    `;

    modal.classList.add('open');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Account List
  // ══════════════════════════════════════════════════════════════════════════
  _renderAccountList() {
    const container = document.getElementById('account-list');
    if (!container) return;
    const accounts = this._state.get('accounts');
    const symbol   = this._state.getCurrencySymbol();

    container.innerHTML = '';
    accounts.forEach(acc => {
      const item = document.createElement('div');
      item.className = 'account-item';
      const flag = acc.country === 'AUS' ? '🇦🇺' : '🇺🇸';
      const badgeClass = `badge-${acc.type}`;
      const displayBal = acc.currency === 'AUD' ? acc.balance : acc.balance;
      const sym = acc.currency === 'AUD' ? 'A$' : '$';

      item.innerHTML = `
        <span class="account-flag">${flag}</span>
        <div style="flex:1;min-width:0;">
          <div class="account-name">${acc.name}</div>
          <span class="account-type-badge ${badgeClass}">${acc.type.toUpperCase()}</span>
        </div>
        <span class="account-value">${sym}${this._fmtShort(acc.balance)}</span>
        <div class="account-actions">
          <button class="btn-sm" data-action="edit" data-id="${acc.id}">Edit</button>
          <button class="btn-sm danger" data-action="remove" data-id="${acc.id}">×</button>
        </div>
      `;
      container.appendChild(item);
    });
  }

  _renderPropertyList() {
    const container = document.getElementById('property-list');
    if (!container) return;
    const props = this._state.get('properties');
    container.innerHTML = '';
    props.forEach(prop => {
      const item = document.createElement('div');
      item.className = 'account-item';
      const flag = prop.country === 'AUS' ? '🇦🇺' : '🇺🇸';
      const equity = prop.currentValue - prop.mortgageBalance;
      const sym = prop.currency === 'AUD' ? 'A$' : '$';
      item.innerHTML = `
        <span class="account-flag">${flag}</span>
        <div style="flex:1;min-width:0;">
          <div class="account-name">${prop.name}</div>
          <span class="account-type-badge badge-property">PROPERTY</span>
        </div>
        <span class="account-value">${sym}${this._fmtShort(equity)} equity</span>
        <div class="account-actions">
          <button class="btn-sm" data-action="edit" data-id="${prop.id}">Edit</button>
          <button class="btn-sm danger" data-action="remove" data-id="${prop.id}">×</button>
        </div>
      `;
      container.appendChild(item);
    });
  }

  _renderBrokerageList() {
    const container = document.getElementById('brokerage-list');
    if (!container) return;
    const broks = this._state.get('brokerageAccounts');
    container.innerHTML = '';
    broks.forEach(b => {
      const item = document.createElement('div');
      item.className = 'account-item';
      const flag = b.country === 'AUS' ? '🇦🇺' : '🇺🇸';
      const sym = b.currency === 'AUD' ? 'A$' : '$';
      item.innerHTML = `
        <span class="account-flag">${flag}</span>
        <div style="flex:1;min-width:0;">
          <div class="account-name">${b.name}</div>
          <span class="account-type-badge badge-brokerage">BROKERAGE</span>
        </div>
        <span class="account-value">${sym}${this._fmtShort(b.balance)}</span>
        <div class="account-actions">
          <button class="btn-sm" data-action="edit" data-id="${b.id}">Edit</button>
          <button class="btn-sm danger" data-action="remove" data-id="${b.id}">×</button>
        </div>
      `;
      container.appendChild(item);
    });
  }

  _fmtShort(n) { return fmtShort(n); }

  // ══════════════════════════════════════════════════════════════════════════
  // Account Modal
  // ══════════════════════════════════════════════════════════════════════════
  openAccountModal(id) {
    const account = this._state.get('accounts').find(a => a.id === id);
    if (!account) return this.openNewAccountModal();

    const modal = document.getElementById('modal-overlay-account');
    if (!modal) return;

    document.getElementById('modal-account-title').textContent = 'Edit Account';
    this._fillAccountForm(account);
    document.getElementById('modal-account-id').value = id;
    modal.classList.add('open');
  }

  openNewAccountModal() {
    const modal = document.getElementById('modal-overlay-account');
    if (!modal) return;
    document.getElementById('modal-account-title').textContent = 'Add Account';
    document.getElementById('modal-account-id').value = '';
    this._fillAccountForm({ name: '', type: '401k', country: 'US', balance: 0, currency: 'USD', annualContribution: 0, employerMatch: 0, growthRate: 7, withdrawalStartAge: 59.5, ownerId: 'person1', contributions: 0 });
    modal.classList.add('open');
  }

  _fillAccountForm(acc) {
    this._setField('acc-name', acc.name);
    this._setField('acc-type', acc.type);
    this._setField('acc-country', acc.country);
    this._setField('acc-balance', acc.balance);
    this._setField('acc-currency', acc.currency || 'USD');
    this._setField('acc-contribution', acc.annualContribution || 0);
    this._setField('acc-match', acc.employerMatch || 0);
    this._setField('acc-growth', acc.growthRate || 7);
    this._setField('acc-withdraw-age', acc.withdrawalStartAge || 59.5);
    this._setField('acc-owner', acc.ownerId || 'person1');
    this._setField('acc-contributions', acc.contributions || 0);
    this._updateAccountTypeConstraints(acc.type);
    // Re-wire type selector each time the modal opens to keep show/hide in sync
    const typeSelect = document.getElementById('acc-type');
    if (typeSelect) typeSelect.onchange = () => this._updateAccountTypeConstraints(typeSelect.value);
  }

  _updateAccountTypeConstraints(accountType) {
    // Show Contributions field only for account types where it is meaningful
    const contribGroup = document.getElementById('acc-contributions-group');
    if (contribGroup) contribGroup.style.display = (accountType === 'ira' || accountType === 'roth') ? '' : 'none';

    // Enforce country/currency for type-locked accounts
    const countryEl  = document.getElementById('acc-country');
    const currencyEl = document.getElementById('acc-currency');

    const constraints = {
      '401k':  { country: 'US',  currency: 'USD', locked: true  },
      'roth':  { country: 'US',  currency: 'USD', locked: true  },
      'ira':   { country: 'US',  currency: 'USD', locked: true  },
      'super': { country: 'AUS', currency: 'AUD', locked: true  },
    };
    const rule = constraints[accountType];

    if (countryEl && currencyEl) {
      if (rule) {
        countryEl.value    = rule.country;
        currencyEl.value   = rule.currency;
        countryEl.disabled = rule.locked;
        currencyEl.disabled = rule.locked;
      } else {
        countryEl.disabled  = false;
        currencyEl.disabled = false;
      }
    }
  }

  saveAccountModal() {
    const id   = document.getElementById('modal-account-id').value;
    const type = this._getField('acc-type');
    const data = {
      name:               this._getField('acc-name'),
      type,
      country:            this._getField('acc-country'),
      balance:            +this._getField('acc-balance'),
      currency:           this._getField('acc-currency'),
      annualContribution: +this._getField('acc-contribution'),
      employerMatch:      +this._getField('acc-match'),
      growthRate:         +this._getField('acc-growth'),
      withdrawalStartAge: +this._getField('acc-withdraw-age'),
      ownerId:            this._getField('acc-owner'),
      contributions:      (type === 'ira' || type === 'roth') ? +this._getField('acc-contributions') : 0,
    };
    if (id) this._state.updateAccount(id, data);
    else    this._state.addAccount(data);
    this.closeModal('modal-overlay-account');
    this._renderAccountList();
    this.toast('Account saved', 'success');
  }

  removeAccount(id) {
    if (confirm('Remove this account?')) {
      this._state.removeAccount(id);
      this._renderAccountList();
    }
  }

  // ── Property Modal ────────────────────────────────────────────────────────
  _populateSaleDestination(selectedId) {
    const select = document.getElementById('prop-sale-destination');
    if (!select) return;
    const broks = this._state.get('brokerageAccounts');
    const accts = this._state.get('accounts');
    const firstBrokName = broks.length > 0 ? broks[0].name : 'first brokerage';
    select.innerHTML =
      `<option value="">— auto (${firstBrokName}) —</option>` +
      broks.map(b => `<option value="${b.id}">${b.name} (Brokerage)</option>`).join('') +
      accts.map(a => `<option value="${a.id}">${a.name} (${a.type.toUpperCase()})</option>`).join('');
    select.value = selectedId || '';
  }

  openPropertyModal(id) {
    const prop = this._state.get('properties').find(p => p.id === id);
    const modal = document.getElementById('modal-overlay-property');
    if (!modal) return;
    if (prop) {
      document.getElementById('prop-id').value = id;
      this._setField('prop-name', prop.name);
      this._setField('prop-country', prop.country);
      this._setField('prop-value', prop.currentValue);
      this._setField('prop-mortgage', prop.mortgageBalance);
      this._setField('prop-monthly-mortgage', prop.monthlyMortgage || 0);
      this._setField('prop-appreciation', prop.appreciationRate || 3.5);
      this._setField('prop-cost-basis', prop.costBasis || 0);
      this._setField('prop-sale-year', prop.plannedSaleYear || '');
      this._populateSaleDestination(prop.saleDestinationId);
    }
    modal.classList.add('open');
  }

  openNewPropertyModal() {
    const modal = document.getElementById('modal-overlay-property');
    if (!modal) return;
    document.getElementById('prop-id').value = '';
    this._setField('prop-name', '');
    this._setField('prop-value', 0);
    this._setField('prop-mortgage', 0);
    this._setField('prop-monthly-mortgage', 0);
    this._setField('prop-appreciation', 3.5);
    this._setField('prop-cost-basis', 0);
    this._setField('prop-sale-year', '');
    this._populateSaleDestination(null);
    modal.classList.add('open');
  }

  savePropertyModal() {
    const id = document.getElementById('prop-id').value;
    const data = {
      name: this._getField('prop-name'),
      country: this._getField('prop-country'),
      currentValue: +this._getField('prop-value'),
      mortgageBalance: +this._getField('prop-mortgage'),
      monthlyMortgage: +this._getField('prop-monthly-mortgage'),
      appreciationRate: +this._getField('prop-appreciation'),
      costBasis: +this._getField('prop-cost-basis'),
      plannedSaleYear: this._getField('prop-sale-year') ? +this._getField('prop-sale-year') : null,
      currency: this._getField('prop-country') === 'AUS' ? 'AUD' : 'USD',
      saleDestinationId: this._getField('prop-sale-destination') || null,
    };
    if (id) this._state.updateProperty(id, data);
    else    this._state.addProperty(data);
    this.closeModal('modal-overlay-property');
    this._renderPropertyList();
    this.toast('Property saved', 'success');
  }

  removeProperty(id) {
    if (confirm('Remove this property?')) {
      this._state.removeProperty(id);
      this._renderPropertyList();
    }
  }

  // ── Brokerage Modal ───────────────────────────────────────────────────────
  openBrokerageModal(id) {
    const b = this._state.get('brokerageAccounts').find(b => b.id === id);
    const modal = document.getElementById('modal-overlay-brokerage');
    if (!modal) return;
    if (b) {
      document.getElementById('brok-id').value = id;
      this._setField('brok-name', b.name);
      this._setField('brok-country', b.country);
      this._setField('brok-balance', b.balance);
      this._setField('brok-contribution', b.annualContribution || 0);
      this._setField('brok-growth', b.growthRate || 7);
      this._setField('brok-cost-basis', b.costBasis || 0);
    }
    modal.classList.add('open');
  }

  openNewBrokerageModal() {
    const modal = document.getElementById('modal-overlay-brokerage');
    if (!modal) return;
    document.getElementById('brok-id').value = '';
    this._setField('brok-name', '');
    this._setField('brok-balance', 0);
    this._setField('brok-contribution', 0);
    this._setField('brok-growth', 7);
    this._setField('brok-cost-basis', 0);
    modal.classList.add('open');
  }

  saveBrokerageModal() {
    const id = document.getElementById('brok-id').value;
    const data = {
      name:               this._getField('brok-name'),
      country:            this._getField('brok-country'),
      balance:            +this._getField('brok-balance'),
      annualContribution: +this._getField('brok-contribution'),
      growthRate:         +this._getField('brok-growth'),
      costBasis:          +this._getField('brok-cost-basis'),
      currency:           this._getField('brok-country') === 'AUS' ? 'AUD' : 'USD',
    };
    if (id) this._state.updateBrokerage(id, data);
    else    this._state.addBrokerage(data);
    this.closeModal('modal-overlay-brokerage');
    this._renderBrokerageList();
    this.toast('Account saved', 'success');
  }

  removeBrokerage(id) {
    if (confirm('Remove this account?')) {
      this._state.removeBrokerage(id);
      this._renderBrokerageList();
    }
  }

  // ── Modal helpers ─────────────────────────────────────────────────────────
  closeModal(overlayId) { closeModalFn(overlayId); }

  _setField(id, value) { setField(id, value); }

  _getField(id) { return getField(id); }

  // ══════════════════════════════════════════════════════════════════════════
  // Toast
  // ══════════════════════════════════════════════════════════════════════════
  toast(message, type = 'info') { showToast(message, type); }

  // ── Tax Bracket display ───────────────────────────────────────────────────
  renderTaxBrackets() {
    const usContainer  = document.getElementById('us-tax-brackets');
    const ausContainer = document.getElementById('aus-tax-brackets');
    const taxBaseYear  = this._state.get('taxBaseYear');

    if (usContainer) {
      // Show exact brackets for the selected base year (no forward inflation)
      const brackets = taxEngine.get('US', taxBaseYear).getBrackets(taxBaseYear);
      const colors = ['#2563eb','#4a6fa5','#6b91cc','#3a8fa0','#c9a84c','#c0455a','#e05570'];
      const subEl = usContainer.closest('.card')?.querySelector('.card-subtitle');
      if (subEl) subEl.textContent = `MFJ — ${taxBaseYear} published rates`;
      usContainer.innerHTML = brackets.map((b, i) => `
        <div class="tax-band">
          <div class="tax-swatch" style="background:${colors[i % colors.length]}"></div>
          <span class="tax-band-name">${(b.rate * 100).toFixed(0)}% bracket</span>
          <span class="tax-band-rate">${(b.rate * 100).toFixed(0)}%</span>
          <span class="tax-band-range">$${this._fmtShort(b.min)}–${b.max === Infinity ? '∞' : '$' + this._fmtShort(b.max)}</span>
        </div>
      `).join('');
    }

    if (ausContainer) {
      const brackets = taxEngine.get('AUS', taxBaseYear).getBrackets(taxBaseYear);
      const colors = ['#374151','#c9a84c','#e4c76b','#3d9e72','#c0455a'];
      const subEl = ausContainer.closest('.card')?.querySelector('.card-subtitle');
      if (subEl) subEl.textContent = `Individual rates — FY${taxBaseYear}-${String(taxBaseYear + 1).slice(-2)}`;
      ausContainer.innerHTML = brackets.map((b, i) => `
        <div class="tax-band">
          <div class="tax-swatch" style="background:${colors[i % colors.length]}"></div>
          <span class="tax-band-name">${(b.rate * 100).toFixed(0)}% bracket</span>
          <span class="tax-band-rate">${(b.rate * 100).toFixed(0)}%</span>
          <span class="tax-band-range">A$${this._fmtShort(b.min)}–${b.max === Infinity ? '∞' : 'A$' + this._fmtShort(b.max)}</span>
        </div>
      `).join('');
    }
  }
}
