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

class UIManager {
  constructor(state) {
    this._state = state;
    this._toastTimeout = null;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Bootstrap — wire all sidebar inputs to state
  // ══════════════════════════════════════════════════════════════════════════
  init() {
    this._bindPeopleInputs();
    this._bindFinanceInputs();
    this._bindMoveSlider();
    this._bindCurrencyToggle();
    this._bindTaxYearSelect();
    this._bindFxRate();
    this._bindSaveLoad();
    this._renderAccountList();
    this._renderPropertyList();
    this._renderBrokerageList();
    this._bindNavTabs();
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
    this._bindInput('annual-expenses',       v => s.set('currentAnnualExpenses', +v),  s.get('currentAnnualExpenses'));
    this._bindInput('retirement-ratio',      v => s.set('retirementExpenseRatio', +v / 100), s.get('retirementExpenseRatio') * 100);
    this._bindInput('target-end-balance',    v => s.set('targetEndBalance', +v),       s.get('targetEndBalance'));
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
    const saveBtn = document.getElementById('btn-save');
    const loadBtn = document.getElementById('btn-load');
    if (saveBtn) saveBtn.addEventListener('click', () => {
      this._state.save();
      this.toast('Plan saved to browser storage', 'success');
    });
    if (loadBtn) loadBtn.addEventListener('click', () => {
      if (confirm('Load saved plan? This will overwrite current inputs.')) {
        const ok = this._state.load();
        if (ok) { this.toast('Plan loaded', 'success'); this.init(); }
        else    { this.toast('No saved plan found', 'warning'); }
      }
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
    const s       = this._state;
    const symbol  = s.getCurrencySymbol();
    const fmt     = (v) => {
      const d = s.toDisplayCurrency(v);
      if (Math.abs(d) >= 1_000_000) return symbol + (d / 1_000_000).toFixed(2) + 'M';
      if (Math.abs(d) >= 1_000)     return symbol + (d / 1_000).toFixed(0) + 'K';
      return symbol + d.toFixed(0);
    };

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
    const s = this._state;
    const symbol = s.getCurrencySymbol();

    const fmt = (v, colored = false) => {
      const d = s.toDisplayCurrency(v);
      const abs = Math.abs(d);
      let str;
      if (abs >= 1_000_000) str = symbol + (d / 1_000_000).toFixed(2) + 'M';
      else if (abs >= 1_000) str = symbol + (d / 1_000).toFixed(0) + 'K';
      else str = symbol + d.toFixed(0);
      if (colored) {
        const cls = d >= 0 ? 'pos' : 'neg';
        return `<span class="${cls}">${str}</span>`;
      }
      return str;
    };

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
        <td>${fmt(yd.totalIncome)}</td>
        <td>${fmt(yd.totalOutflows)}</td>
        <td>${fmt(yd.netCashFlow, true)}</td>
        <td>${fmt(yd.usTax)}</td>
        <td>${fmt(yd.auTax)}</td>
        <td>${fmt(yd.netWorth)}</td>
      `;
      tbody.appendChild(tr);
    });
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
          <button class="btn-sm" onclick="uiManager.openAccountModal('${acc.id}')">Edit</button>
          <button class="btn-sm danger" onclick="uiManager.removeAccount('${acc.id}')">×</button>
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
          <button class="btn-sm" onclick="uiManager.openPropertyModal('${prop.id}')">Edit</button>
          <button class="btn-sm danger" onclick="uiManager.removeProperty('${prop.id}')">×</button>
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
          <button class="btn-sm" onclick="uiManager.openBrokerageModal('${b.id}')">Edit</button>
          <button class="btn-sm danger" onclick="uiManager.removeBrokerage('${b.id}')">×</button>
        </div>
      `;
      container.appendChild(item);
    });
  }

  _fmtShort(n) {
    if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
    if (Math.abs(n) >= 1_000)     return (n / 1_000).toFixed(0) + 'K';
    return n.toFixed(0);
  }

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
    this._fillAccountForm({ name: '', type: '401k', country: 'US', balance: 0, currency: 'USD', annualContribution: 0, employerMatch: 0, growthRate: 7, withdrawalStartAge: 59.5, ownerId: 'person1', moveValueBasis: null });
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
    this._setField('acc-move-basis', acc.moveValueBasis != null ? acc.moveValueBasis : '');
  }

  saveAccountModal() {
    const id = document.getElementById('modal-account-id').value;
    const data = {
      name: this._getField('acc-name'),
      type: this._getField('acc-type'),
      country: this._getField('acc-country'),
      balance: +this._getField('acc-balance'),
      currency: this._getField('acc-currency'),
      annualContribution: +this._getField('acc-contribution'),
      employerMatch: +this._getField('acc-match'),
      growthRate: +this._getField('acc-growth'),
      withdrawalStartAge: +this._getField('acc-withdraw-age'),
      ownerId: this._getField('acc-owner'),
      moveValueBasis: this._getField('acc-move-basis') !== '' ? +this._getField('acc-move-basis') : null,
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
      this._setField('brok-move-basis', b.moveValueBasis != null ? b.moveValueBasis : '');
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
    this._setField('brok-move-basis', '');
    modal.classList.add('open');
  }

  saveBrokerageModal() {
    const id = document.getElementById('brok-id').value;
    const data = {
      name: this._getField('brok-name'),
      country: this._getField('brok-country'),
      balance: +this._getField('brok-balance'),
      annualContribution: +this._getField('brok-contribution'),
      growthRate: +this._getField('brok-growth'),
      costBasis: +this._getField('brok-cost-basis'),
      currency: this._getField('brok-country') === 'AUS' ? 'AUD' : 'USD',
      moveValueBasis: this._getField('brok-move-basis') !== '' ? +this._getField('brok-move-basis') : null,
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
  closeModal(overlayId) {
    const el = document.getElementById(overlayId);
    if (el) el.classList.remove('open');
  }

  _setField(id, value) {
    const el = document.getElementById(id);
    if (el) el.value = value;
  }

  _getField(id) {
    const el = document.getElementById(id);
    return el ? el.value : '';
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Toast
  // ══════════════════════════════════════════════════════════════════════════
  toast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = message;
    container.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transition = 'opacity 0.3s';
      setTimeout(() => el.remove(), 300);
    }, 3000);
  }

  // ── Tax Bracket display ───────────────────────────────────────────────────
  renderTaxBrackets() {
    const usContainer  = document.getElementById('us-tax-brackets');
    const ausContainer = document.getElementById('aus-tax-brackets');
    const taxBaseYear  = this._state.get('taxBaseYear');

    if (usContainer) {
      // Show exact brackets for the selected base year (no forward inflation)
      const brackets = taxEngine.get('US').getBrackets(taxBaseYear, taxBaseYear);
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
      const brackets = taxEngine.get('AUS').getBrackets(taxBaseYear, taxBaseYear);
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
