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
 * appState.js
 * Central state store for the retirement planner.
 * All modules read/write through this singleton.
 */
import { createInstanceOf, setMask, formatToNumber, formatToCurrency} from './ui/simple-mask-money/simple-mask-money.esm.js';

export class AppState {
  constructor() {
    this._state = this._defaultState();
    this._listeners = [];
    const optionsUSD = {
      allowNegative: false,
      negativeSignAfter: false,
      prefix: '$',
      suffix: '',
      fixed: true,
      fractionDigits: 0,
      decimalSeparator: '.',
      thousandsSeparator: ',',
      cursor: 'end'
    };
    this._setUSDMask = createInstanceOf(setMask, optionsUSD);
    this._formatUSDToNumber = createInstanceOf(formatToNumber, optionsUSD);
    this._formatUSDToCurrency = createInstanceOf(formatToCurrency, optionsUSD);

    const optionsAUD = {
      allowNegative: false,
      negativeSignAfter: false,
      prefix: 'A$',
      suffix: '',
      fixed: true,
      fractionDigits: 0,
      decimalSeparator: '.',
      thousandsSeparator: ',',
      cursor: 'end'
    };
    this._setAUDMask = createInstanceOf(setMask, optionsAUD);
    this._formatAUDToNumber = createInstanceOf(formatToNumber, optionsAUD);
    this._formatAUDToCurrency = createInstanceOf(formatToCurrency, optionsAUD);
  }

  _defaultState() {
    const currentYear = new Date().getFullYear();
    return {
      // ── Display ──────────────────────────────────────────
      currency: 'USD',          // 'USD' | 'AUD'
      fxRate: 1.58,             // 1 USD = X AUD
      taxBaseYear: 2025,        // Which year's published tax rates to use as base

      // ── People ───────────────────────────────────────────
      people: [
        {
          id: 'person1',
          name: 'Person 1',
          birthYear: 1975,
          retirementAge: 65,
          lifeExpectancy: 90,
          socialSecurityAge: 67,
          socialSecurityMonthly: 2800,   // USD/month at full retirement age
          isCitizen: 'us',              // 'us' | 'aus' | 'both'
          annualIncome: 120000,         // USD gross, pre-retirement
        },
        {
          id: 'person2',
          name: 'Person 2',
          birthYear: 1977,
          retirementAge: 65,
          lifeExpectancy: 92,
          socialSecurityAge: 67,
          socialSecurityMonthly: 1800,
          isCitizen: 'us',
          annualIncome: 100000,         // USD gross, pre-retirement
        }
      ],

      // ── Move event ────────────────────────────────────────
      moveToAustraliaYear: currentYear + 5,
      moveEnabled: true,

      // ── Inflation ─────────────────────────────────────────
      inflationUS:  2.5,   // %
      inflationAUS: 3.0,   // %

      // ── Accounts ──────────────────────────────────────────
      accounts: [
        {
          id: 'acc1',
          name: '401(k) — Person 1',
          type: '401k',
          country: 'US',
          balance: 350000,
          currency: 'USD',
          annualContribution: 23000,
          employerMatch: 6000,
          growthRate: 7.0,
          ownerId: 'person1',
          withdrawalStartAge: 59.5,
        },
        {
          id: 'acc2',
          name: 'Roth IRA — Person 1',
          type: 'roth',
          country: 'US',
          balance: 85000,
          currency: 'USD',
          annualContribution: 7000,
          employerMatch: 0,
          growthRate: 7.0,
          ownerId: 'person1',
          withdrawalStartAge: 59.5,
          contributions: 60000,  // after-tax contributions made to date (corpus)
        },
        {
          id: 'acc3',
          name: '401(k) — Person 2',
          type: '401k',
          country: 'US',
          balance: 220000,
          currency: 'USD',
          annualContribution: 23000,
          employerMatch: 4000,
          growthRate: 7.0,
          ownerId: 'person2',
          withdrawalStartAge: 59.5,
        },
        {
          id: 'acc4',
          name: 'Australian Super — Person 1',
          type: 'super',
          country: 'AUS',
          balance: 0,
          currency: 'AUD',
          annualContribution: 0,
          employerMatch: 0,
          growthRate: 7.0,
          ownerId: 'person1',
          withdrawalStartAge: 60,
        },
      ],

      // ── Properties ────────────────────────────────────────
      properties: [
        {
          id: 'prop1',
          name: 'Primary Residence',
          country: 'US',
          currentValue: 650000,
          currency: 'USD',
          mortgageBalance: 280000,
          monthlyMortgage: 2100,
          appreciationRate: 3.5,
          isPrimaryResidence: true,
          plannedSaleYear: null,
          costBasis: 420000,
          saleDestinationId: null,
          owners: [{ personId: 'person1', ownershipPct: 100 }],
        }
      ],

      // ── Brokerage / Investments ────────────────────────────
      brokerageAccounts: [
        {
          id: 'brok1',
          name: 'US Brokerage',
          country: 'US',
          balance: 45000,
          currency: 'USD',
          annualContribution: 12000,
          growthRate: 7.0,
          costBasis: 38000,
          isJointAccount: false,
          ownerId: 'person1',
          priority: 1,
        }
      ],

      // ── Savings / Cash ────────────────────────────────────
      savingsAccounts: [
        {
          id: 'sav1',
          name: 'Emergency Fund',
          country: 'US',
          currency: 'USD',
          ownerId: null,
          balance: 30000,
          growthRate: 4.5,
          minimumBalance: 10000,
          priority: 1,
        }
      ],

      // ── Expenses ──────────────────────────────────────────
      currentAnnualExpenses: 90000,   // USD
      retirementExpenseRatio: 0.80,   // 80% of pre-retirement
      australiaExpenseRatio: 1.0,     // AU living costs as fraction of US baseline
      targetEndBalance: 50000,        // buffer to die with

// ── Projection cache ──────────────────────────────────
      projectionYears: [],            // populated by ProjectionEngine
    };
  }

  // ── Subscribe / notify ────────────────────────────────────
  subscribe(fn) {
    this._listeners.push(fn);
    return () => { this._listeners = this._listeners.filter(l => l !== fn); };
  }

  notify(changedKeys = []) {
    this._listeners.forEach(fn => fn(changedKeys, this._state));
  }

  // ── Getters ───────────────────────────────────────────────
  get(key) {
    return this._state[key];
  }

  getAll() {
    return this._state;
  }

  // ── Setters ───────────────────────────────────────────────
  set(key, value) {
    this._state[key] = value;
    this.notify([key]);
  }

  patch(updates) {
    Object.assign(this._state, updates);
    this.notify(Object.keys(updates));
  }

  // ── Account helpers ───────────────────────────────────────
  addAccount(account) {
    account.id = 'acc_' + Date.now();
    this._state.accounts.push(account);
    this.notify(['accounts']);
  }

  updateAccount(id, updates) {
    const idx = this._state.accounts.findIndex(a => a.id === id);
    if (idx > -1) {
      this._state.accounts[idx] = { ...this._state.accounts[idx], ...updates };
      this.notify(['accounts']);
    }
  }

  removeAccount(id) {
    this._state.accounts = this._state.accounts.filter(a => a.id !== id);
    this.notify(['accounts']);
  }

  // ── Property helpers ──────────────────────────────────────
  addProperty(prop) {
    prop.id = 'prop_' + Date.now();
    this._state.properties.push(prop);
    this.notify(['properties']);
  }

  updateProperty(id, updates) {
    const idx = this._state.properties.findIndex(p => p.id === id);
    if (idx > -1) {
      this._state.properties[idx] = { ...this._state.properties[idx], ...updates };
      this.notify(['properties']);
    }
  }

  removeProperty(id) {
    this._state.properties = this._state.properties.filter(p => p.id !== id);
    this.notify(['properties']);
  }

  // ── Brokerage helpers ─────────────────────────────────────
  addBrokerage(acct) {
    acct.id = 'brok_' + Date.now();
    this._state.brokerageAccounts.push(acct);
    this.notify(['brokerageAccounts']);
  }

  updateBrokerage(id, updates) {
    const idx = this._state.brokerageAccounts.findIndex(b => b.id === id);
    if (idx > -1) {
      this._state.brokerageAccounts[idx] = { ...this._state.brokerageAccounts[idx], ...updates };
      this.notify(['brokerageAccounts']);
    }
  }

  removeBrokerage(id) {
    this._state.brokerageAccounts = this._state.brokerageAccounts.filter(b => b.id !== id);
    this.notify(['brokerageAccounts']);
  }

  // ── Savings helpers ───────────────────────────────────────
  addSavings(acct) {
    acct.id = 'sav_' + Date.now();
    this._state.savingsAccounts.push(acct);
    this.notify(['savingsAccounts']);
  }

  updateSavings(id, updates) {
    const idx = this._state.savingsAccounts.findIndex(s => s.id === id);
    if (idx > -1) {
      this._state.savingsAccounts[idx] = { ...this._state.savingsAccounts[idx], ...updates };
      this.notify(['savingsAccounts']);
    }
  }

  removeSavings(id) {
    this._state.savingsAccounts = this._state.savingsAccounts.filter(s => s.id !== id);
    this.notify(['savingsAccounts']);
  }

  // ── Persistence ───────────────────────────────────────────
  save() {
    try {
      localStorage.setItem('retirementPlannerState', JSON.stringify(this._state));
      return true;
    } catch(e) {
      console.warn('Save failed', e);
      return false;
    }
  }

  load() {
    try {
      const saved = localStorage.getItem('retirementPlannerState');
      if (saved) {
        const parsed = JSON.parse(saved);
        // Merge with defaults to handle new fields added after save
        this._state = Object.assign(this._defaultState(), parsed);
        // Migration: if old state had combinedAnnualIncome but people lack annualIncome,
        // split it evenly across people
        const combined = parsed.combinedAnnualIncome;
        if (combined && this._state.people) {
          const perPerson = Math.round(combined / this._state.people.length);
          this._state.people.forEach(p => { if (!p.annualIncome) p.annualIncome = perPerson; });
        }
        this.notify([]);
        return true;
      }
    } catch(e) {
      console.warn('Load failed', e);
    }
    return false;
  }

  exportJSON() {
    return JSON.stringify(this._state, null, 2);
  }

  loadFromJSON(jsonString) {
    try {
      const parsed = JSON.parse(jsonString);
      this._state = Object.assign(this._defaultState(), parsed);
      const combined = parsed.combinedAnnualIncome;
      if (combined && this._state.people) {
        const perPerson = Math.round(combined / this._state.people.length);
        this._state.people.forEach(p => { if (!p.annualIncome) p.annualIncome = perPerson; });
      }
      this.notify([]);
      return true;
    } catch(e) {
      console.warn('Load from JSON failed', e);
      return false;
    }
  }

  reset() {
    this._state = this._defaultState();
    this.notify([]);
  }

  // ── Computed helpers ──────────────────────────────────────
  getEarliestRetirementYear() {
    const people = this._state.people;
    return Math.min(...people.map(p => p.birthYear + p.retirementAge));
  }

  getLatestLifeExpectancyYear() {
    const people = this._state.people;
    return Math.max(...people.map(p => p.birthYear + p.lifeExpectancy));
  }

  /** TODO We can remove these and use simple-mask-money formatToCurrency **/
  toDisplayCurrency(valueUSD) {
    if (this._state.currency === 'AUD') {
      return valueUSD * this._state.fxRate;
    }
    return valueUSD;
  }

  fromDisplayCurrency(value) {
    if (this._state.currency === 'AUD') {
      return value / this._state.fxRate;
    }
    return value;
  }

  getCurrencySymbol() {
    return this._state.currency === 'AUD' ? 'A$' : '$';
  }
  /* Currency Helper functions */

  /**
   * Get a method that will mask a currency input based on the supplied currency,
   * or default currency if non is supplied and the currency format settings
   * @returns {*}
   */
  getCurrencySetMask(currency = this._state.currency) {
    if(currency === 'USD') {
      return this._setUSDMask;
    }else {
      return this._setAUDMask;
    }
  }

  /**
   * Get the method that will format a currency string to a number value
   * based on the currency and format settings
   * @param currency
   * @returns {*}
   */
  getFormatCurrencyToNumber(currency = this._state.currency) {
    if(currency === 'USD') {
      return this._formatUSDToNumber;
    }else {
      return this._formatAUDToNumber;
    }
  }

  getFormatNumberToCurrency(currency = this._state.currency) {
    if(currency === 'USD') {
      return this._formatUSDToCurrency;
    }else {
      return this._formatAUDToCurrency;
    }
  }

}

// Singleton — imported by app.js, chartManager.js, and anywhere else that needs state
export const appState = new AppState();
