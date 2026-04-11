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
 * taxEngine.js
 * Pluggable tax calculation system.
 * Add new country modules by extending BaseTaxModule and registering.
 */

// ── Base class ────────────────────────────────────────────────────────────────
class BaseTaxModule {
  constructor(countryCode) {
    this.countryCode = countryCode;
  }

  /**
   * Calculate income tax for a given year and income.
   * @param {number} grossIncome  - Annual gross income in local currency
   * @param {object} context      - { year, isRetired, filingStatus, age }
   * @returns {{ tax: number, effectiveRate: number, marginalRate: number, breakdown: [] }}
   */
  calcIncomeTax(grossIncome, context) {
    throw new Error(`calcIncomeTax not implemented for ${this.countryCode}`);
  }

  /**
   * Calculate capital gains tax.
   * @param {number} gain      - Realized capital gain
   * @param {number} income    - Other income in same year
   * @param {object} context   - { year, holdingPeriodDays, isResident, age }
   * @returns {{ tax: number, effectiveRate: number }}
   */
  calcCapitalGainsTax(gain, income, context) {
    throw new Error(`calcCapitalGainsTax not implemented for ${this.countryCode}`);
  }

  /**
   * Returns tax brackets for display purposes.
   * @param {number} year
   * @returns {Array<{ min, max, rate, label }>}
   */
  getBrackets(year) {
    return [];
  }

  /**
   * Account-type-specific tax treatment.
   * @param {string} accountType  - '401k' | 'roth' | 'ira' | 'super' | 'brokerage'
   * @param {string} eventType    - 'contribution' | 'growth' | 'withdrawal'
   * @param {number} amount
   * @param {object} context
   * @returns {{ taxableAmount: number, note: string }}
   */
  accountTreatment(accountType, eventType, amount, context) {
    return { taxableAmount: amount, note: '' };
  }
}

// ── US Tax Module ─────────────────────────────────────────────────────────────
class USTaxModule extends BaseTaxModule {
  constructor() {
    super('US');
    // 2024 brackets (MFJ) – inflate annually at ~2%
    this._brackets2024_mfj = [
      { min: 0,       max: 23200,  rate: 0.10 },
      { min: 23200,   max: 94300,  rate: 0.12 },
      { min: 94300,   max: 201050, rate: 0.22 },
      { min: 201050,  max: 383900, rate: 0.24 },
      { min: 383900,  max: 487450, rate: 0.32 },
      { min: 487450,  max: 731200, rate: 0.35 },
      { min: 731200,  max: Infinity, rate: 0.37 },
    ];
    // 2024 LTCG brackets (MFJ)
    this._ltcgBrackets2024_mfj = [
      { min: 0,       max: 94050,  rate: 0.00 },
      { min: 94050,   max: 583750, rate: 0.15 },
      { min: 583750,  max: Infinity, rate: 0.20 },
    ];
    this._standardDeduction2024_mfj = 29200;
    this._niit = 0.038; // Net Investment Income Tax above $250k MFJ
  }

  _inflateBrackets(brackets, baseYear, targetYear, inflationRate = 0.025) {
    const years = targetYear - baseYear;
    const factor = Math.pow(1 + inflationRate, years);
    return brackets.map(b => ({
      min: b.min === 0 ? 0 : Math.round(b.min * factor),
      max: b.max === Infinity ? Infinity : Math.round(b.max * factor),
      rate: b.rate,
    }));
  }

  _applyBrackets(income, brackets) {
    let tax = 0;
    let marginalRate = 0;
    const breakdown = [];
    for (const b of brackets) {
      if (income <= b.min) break;
      const taxable = Math.min(income, b.max) - b.min;
      const t = taxable * b.rate;
      tax += t;
      marginalRate = b.rate;
      if (t > 0) breakdown.push({ range: `${b.min}–${b.max === Infinity ? '∞' : b.max}`, rate: b.rate, tax: t });
    }
    return { tax, marginalRate, breakdown };
  }

  calcIncomeTax(grossIncome, context = {}) {
    const { year = 2024, filingStatus = 'mfj' } = context;
    const brackets = this._inflateBrackets(this._brackets2024_mfj, 2024, year);
    const stdDed   = Math.round(this._standardDeduction2024_mfj * Math.pow(1.025, year - 2024));
    const taxable  = Math.max(0, grossIncome - stdDed);
    const { tax, marginalRate, breakdown } = this._applyBrackets(taxable, brackets);
    // FICA (simplified, capped for high earners — only on wages)
    const ficaTax = Math.min(grossIncome, 168600) * 0.0765;
    const total = tax + ficaTax;
    return {
      tax: total,
      incomeTax: tax,
      ficaTax,
      effectiveRate: grossIncome > 0 ? total / grossIncome : 0,
      marginalRate,
      breakdown,
      stdDeduction: stdDed,
    };
  }

  calcCapitalGainsTax(gain, income, context = {}) {
    const { year = 2024, holdingPeriodDays = 400, isResident = true } = context;
    const isLongTerm = holdingPeriodDays >= 365;
    let tax = 0;
    if (!isLongTerm) {
      // Short-term: ordinary income rates
      const totalIncome = income + gain;
      const brackets = this._inflateBrackets(this._brackets2024_mfj, 2024, year);
      const stdDed = Math.round(this._standardDeduction2024_mfj * Math.pow(1.025, year - 2024));
      const baseResult = this._applyBrackets(Math.max(0, income - stdDed), brackets);
      const totalResult = this._applyBrackets(Math.max(0, totalIncome - stdDed), brackets);
      tax = totalResult.tax - baseResult.tax;
    } else {
      const ltcgBrackets = this._inflateBrackets(this._ltcgBrackets2024_mfj, 2024, year);
      const { tax: t } = this._applyBrackets(gain, ltcgBrackets);
      tax = t;
      // NIIT
      const niitThreshold = Math.round(250000 * Math.pow(1.025, year - 2024));
      if (income + gain > niitThreshold) {
        tax += Math.min(gain, (income + gain) - niitThreshold) * this._niit;
      }
    }
    return {
      tax,
      effectiveRate: gain > 0 ? tax / gain : 0,
      isLongTerm,
    };
  }

  accountTreatment(accountType, eventType, amount, context = {}) {
    switch (accountType) {
      case '401k':
      case 'ira':
        if (eventType === 'contribution') return { taxableAmount: 0, note: 'Pre-tax contribution' };
        if (eventType === 'growth')       return { taxableAmount: 0, note: 'Tax-deferred growth' };
        if (eventType === 'withdrawal')   return { taxableAmount: amount, note: 'Taxable as ordinary income' };
        break;
      case 'roth':
        if (eventType === 'contribution') return { taxableAmount: amount, note: 'After-tax contribution' };
        if (eventType === 'growth')       return { taxableAmount: 0, note: 'Tax-free growth' };
        if (eventType === 'withdrawal')   {
          const age = context.age || 60;
          return age >= 59.5
            ? { taxableAmount: 0, note: 'Qualified tax-free withdrawal' }
            : { taxableAmount: amount * 0.10, note: '10% early withdrawal penalty' };
        }
        break;
      case 'brokerage':
        if (eventType === 'growth') return { taxableAmount: 0, note: 'Tax deferred until sale' };
        if (eventType === 'withdrawal') return { taxableAmount: amount, note: 'Capital gains apply' };
        break;
    }
    return { taxableAmount: amount, note: '' };
  }

  getBrackets(year = 2024) {
    return this._inflateBrackets(this._brackets2024_mfj, 2024, year).map(b => ({
      ...b,
      label: `${(b.rate * 100).toFixed(0)}%`,
    }));
  }

  // Social Security benefit calculation
  calcSocialSecurity(person, year) {
    const claimAge = person.socialSecurityAge || 67;
    const claimYear = person.birthYear + claimAge;
    if (year < claimYear) return 0;
    // Base monthly benefit inflated
    const inflated = person.socialSecurityMonthly * Math.pow(1.023, year - 2024);
    // 85% of SS taxable if combined income > $44k MFJ (simplified)
    return inflated * 12;
  }
}

// ── Australia Tax Module ──────────────────────────────────────────────────────
class AustraliaTaxModule extends BaseTaxModule {
  constructor() {
    super('AUS');
    // FY2024-25 brackets (AUD)
    this._brackets2024 = [
      { min: 0,       max: 18200,   rate: 0.00 },
      { min: 18200,   max: 45000,   rate: 0.19 },
      { min: 45000,   max: 120000,  rate: 0.325 },
      { min: 120000,  max: 180000,  rate: 0.37 },
      { min: 180000,  max: Infinity, rate: 0.45 },
    ];
    this._medicareLevy = 0.02;
    this._superTaxRate = 0.15; // within-fund contributions tax
    this._superWithdrawalTaxUnder60 = 0.20; // simplified
  }

  _inflateBrackets(brackets, baseYear, targetYear, inflationRate = 0.03) {
    const years = targetYear - baseYear;
    const factor = Math.pow(1 + inflationRate, years);
    return brackets.map(b => ({
      min: b.min === 0 ? 0 : Math.round(b.min * factor),
      max: b.max === Infinity ? Infinity : Math.round(b.max * factor),
      rate: b.rate,
    }));
  }

  _applyBrackets(income, brackets) {
    let tax = 0;
    let marginalRate = 0;
    const breakdown = [];
    for (const b of brackets) {
      if (income <= b.min) break;
      const taxable = Math.min(income, b.max) - b.min;
      const t = taxable * b.rate;
      tax += t;
      marginalRate = b.rate;
      if (t > 0) breakdown.push({ range: `${b.min}–${b.max === Infinity ? '∞' : b.max}`, rate: b.rate, tax: t });
    }
    return { tax, marginalRate, breakdown };
  }

  calcIncomeTax(grossIncome, context = {}) {
    const { year = 2024, isResident = true } = context;
    const brackets = this._inflateBrackets(this._brackets2024, 2024, year);
    const { tax, marginalRate, breakdown } = this._applyBrackets(grossIncome, brackets);
    const medicare = grossIncome > 26000 ? grossIncome * this._medicareLevy : 0;
    // LITO (Low Income Tax Offset) — simplified
    let lito = 0;
    if (grossIncome <= 37500) lito = 700;
    else if (grossIncome <= 45000) lito = 700 - ((grossIncome - 37500) * 0.05);
    else if (grossIncome <= 66667) lito = 325 - ((grossIncome - 45000) * 0.015);
    lito = Math.max(0, lito);
    const total = Math.max(0, tax - lito) + medicare;
    return {
      tax: total,
      incomeTax: Math.max(0, tax - lito),
      medicareLevy: medicare,
      lito,
      effectiveRate: grossIncome > 0 ? total / grossIncome : 0,
      marginalRate,
      breakdown,
    };
  }

  calcCapitalGainsTax(gain, income, context = {}) {
    // Australia: 50% CGT discount for assets held >12 months (residents)
    const { holdingPeriodDays = 400, isResident = true, year = 2024 } = context;
    const discount = isResident && holdingPeriodDays >= 365 ? 0.5 : 1.0;
    const taxableGain = gain * discount;
    const brackets = this._inflateBrackets(this._brackets2024, 2024, year);
    // Marginal rate on gain stacked on top of income
    const baseResult = this._applyBrackets(income, brackets);
    const totalResult = this._applyBrackets(income + taxableGain, brackets);
    const tax = totalResult.tax - baseResult.tax;
    return {
      tax,
      effectiveRate: gain > 0 ? tax / gain : 0,
      discountApplied: discount < 1,
      taxableGain,
    };
  }

  accountTreatment(accountType, eventType, amount, context = {}) {
    const age = context.age || 60;
    if (accountType === 'super') {
      if (eventType === 'contribution') {
        return { taxableAmount: amount * this._superTaxRate, note: '15% contributions tax in fund' };
      }
      if (eventType === 'growth') {
        return { taxableAmount: amount * 0.15, note: '15% earnings tax in accumulation phase' };
      }
      if (eventType === 'withdrawal') {
        if (age >= 60) return { taxableAmount: 0, note: 'Tax-free super withdrawal (age 60+)' };
        return { taxableAmount: amount * this._superWithdrawalTaxUnder60, note: '20% tax + Medicare (under 60)' };
      }
    }
    // Franking credits on AU dividends — simplified: 30% credit on dividends
    if (accountType === 'brokerage' && eventType === 'withdrawal') {
      return { taxableAmount: amount, note: 'CGT 50% discount may apply', frankingCredit: amount * 0.043 };
    }
    return { taxableAmount: amount, note: '' };
  }

  getBrackets(year = 2024) {
    return this._inflateBrackets(this._brackets2024, 2024, year).map(b => ({
      ...b,
      label: `${(b.rate * 100).toFixed(0)}%`,
    }));
  }
}

// ── Tax Engine registry ───────────────────────────────────────────────────────
class TaxEngine {
  constructor() {
    this._modules = {};
    // Register built-in modules
    this.register(new USTaxModule());
    this.register(new AustraliaTaxModule());
  }

  register(module) {
    if (!(module instanceof BaseTaxModule)) {
      throw new Error('Tax module must extend BaseTaxModule');
    }
    this._modules[module.countryCode] = module;
    console.log(`[TaxEngine] Registered module: ${module.countryCode}`);
  }

  get(countryCode) {
    const m = this._modules[countryCode];
    if (!m) throw new Error(`No tax module for country: ${countryCode}`);
    return m;
  }

  getAll() {
    return Object.values(this._modules);
  }

  hasModule(countryCode) {
    return !!this._modules[countryCode];
  }

  /**
   * Determine which country's tax applies based on move date.
   * US citizens pay US taxes on worldwide income always.
   * After moving to AU, AU taxes also apply (FITO credit assumed 1:1 simplified).
   */
  resolveApplicableModules(year, moveYear, moveEnabled) {
    const modules = ['US']; // US citizens always file US taxes
    if (moveEnabled && year >= moveYear) {
      modules.push('AUS');
    }
    return modules.map(c => this._modules[c]).filter(Boolean);
  }
}

// Singleton
const taxEngine = new TaxEngine();
