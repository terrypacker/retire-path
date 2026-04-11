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
    // Published bracket data keyed by tax year
    this._rateData = {
      2024: {
        brackets_mfj: [
          { min: 0,       max: 23200,  rate: 0.10 },
          { min: 23200,   max: 94300,  rate: 0.12 },
          { min: 94300,   max: 201050, rate: 0.22 },
          { min: 201050,  max: 383900, rate: 0.24 },
          { min: 383900,  max: 487450, rate: 0.32 },
          { min: 487450,  max: 731200, rate: 0.35 },
          { min: 731200,  max: Infinity, rate: 0.37 },
        ],
        ltcg_mfj: [
          { min: 0,       max: 94050,  rate: 0.00 },
          { min: 94050,   max: 583750, rate: 0.15 },
          { min: 583750,  max: Infinity, rate: 0.20 },
        ],
        stdDeduction_mfj: 29200,
      },
      2025: {
        // IRS Rev. Proc. 2024-40 — tax year 2025 MFJ
        brackets_mfj: [
          { min: 0,       max: 23850,  rate: 0.10 },
          { min: 23850,   max: 96950,  rate: 0.12 },
          { min: 96950,   max: 206700, rate: 0.22 },
          { min: 206700,  max: 394600, rate: 0.24 },
          { min: 394600,  max: 501050, rate: 0.32 },
          { min: 501050,  max: 751600, rate: 0.35 },
          { min: 751600,  max: Infinity, rate: 0.37 },
        ],
        ltcg_mfj: [
          { min: 0,       max: 96700,  rate: 0.00 },
          { min: 96700,   max: 600050, rate: 0.15 },
          { min: 600050,  max: Infinity, rate: 0.20 },
        ],
        stdDeduction_mfj: 30000,
      },
    };
    this._niit = 0.038; // Net Investment Income Tax above $250k MFJ
  }

  /**
   * Returns the rate data for the closest available year <= taxBaseYear.
   * @param {number} taxBaseYear
   * @returns {{ data: object, year: number }}
   */
  _getRateData(taxBaseYear) {
    const years = Object.keys(this._rateData).map(Number).sort((a, b) => b - a);
    const bestYear = years.find(y => y <= taxBaseYear) || years[years.length - 1];
    return { data: this._rateData[bestYear], year: bestYear };
  }

  /** @returns {number[]} Sorted list of years with published bracket data */
  getAvailableYears() {
    return Object.keys(this._rateData).map(Number).sort((a, b) => a - b);
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
    const { year = 2024, filingStatus = 'mfj', taxBaseYear = 2024 } = context;
    const { data, year: baseYear } = this._getRateData(taxBaseYear);
    const brackets = this._inflateBrackets(data.brackets_mfj, baseYear, year);
    const stdDed   = Math.round(data.stdDeduction_mfj * Math.pow(1.025, year - baseYear));
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
    const { year = 2024, holdingPeriodDays = 400, isResident = true, taxBaseYear = 2024 } = context;
    const { data, year: baseYear } = this._getRateData(taxBaseYear);
    const isLongTerm = holdingPeriodDays >= 365;
    let tax = 0;
    if (!isLongTerm) {
      // Short-term: ordinary income rates
      const totalIncome = income + gain;
      const brackets = this._inflateBrackets(data.brackets_mfj, baseYear, year);
      const stdDed = Math.round(data.stdDeduction_mfj * Math.pow(1.025, year - baseYear));
      const baseResult = this._applyBrackets(Math.max(0, income - stdDed), brackets);
      const totalResult = this._applyBrackets(Math.max(0, totalIncome - stdDed), brackets);
      tax = totalResult.tax - baseResult.tax;
    } else {
      const ltcgBrackets = this._inflateBrackets(data.ltcg_mfj, baseYear, year);
      const { tax: t } = this._applyBrackets(gain, ltcgBrackets);
      tax = t;
      // NIIT
      const niitThreshold = Math.round(250000 * Math.pow(1.025, year - baseYear));
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

  getBrackets(year = 2024, taxBaseYear = null) {
    const { data, year: baseYear } = this._getRateData(taxBaseYear !== null ? taxBaseYear : year);
    return this._inflateBrackets(data.brackets_mfj, baseYear, year).map(b => ({
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
    // Published bracket data keyed by tax year (calendar year = FY starting Jul of that year)
    this._rateData = {
      2024: {
        // FY2024-25 — Stage 3 tax cut rates (ATO)
        brackets: [
          { min: 0,       max: 18200,   rate: 0.00 },
          { min: 18200,   max: 45000,   rate: 0.19 },
          { min: 45000,   max: 120000,  rate: 0.325 },
          { min: 120000,  max: 180000,  rate: 0.37 },
          { min: 180000,  max: Infinity, rate: 0.45 },
        ],
        // Medicare Levy: 2% with phase-in for low incomes (ATO FY2024-25)
        // Below lowerThreshold: no levy; phase-in zone (10% of excess) up to ceiling (~$32,500)
        medicareLevy: { rate: 0.02, lowerThreshold: 26000, phaseInRate: 0.10 },
        // Medicare Levy Surcharge: applies to those WITHOUT private hospital cover
        // Rate is applied to entire taxable income once threshold is crossed
        medicareLevySurcharge: [
          { min: 93000,  rate: 0.010 },
          { min: 108000, rate: 0.0125 },
          { min: 144000, rate: 0.015 },
        ],
      },
      2025: {
        // FY2025-26 — lower 30% bracket extended to $135k (2025 Federal Budget)
        brackets: [
          { min: 0,       max: 18200,   rate: 0.00 },
          { min: 18200,   max: 45000,   rate: 0.19 },
          { min: 45000,   max: 135000,  rate: 0.30 },
          { min: 135000,  max: 190000,  rate: 0.37 },
          { min: 190000,  max: Infinity, rate: 0.45 },
        ],
        // Medicare Levy threshold unchanged from FY2024-25
        medicareLevy: { rate: 0.02, lowerThreshold: 26000, phaseInRate: 0.10 },
        // MLS thresholds unchanged from FY2024-25
        medicareLevySurcharge: [
          { min: 93000,  rate: 0.010 },
          { min: 108000, rate: 0.0125 },
          { min: 144000, rate: 0.015 },
        ],
      },
    };
    this._superTaxRate = 0.15; // within-fund contributions tax
    this._superWithdrawalTaxUnder60 = 0.20; // simplified
  }

  /**
   * Returns the rate data for the closest available year <= taxBaseYear.
   * @param {number} taxBaseYear
   * @returns {{ data: object, year: number }}
   */
  _getRateData(taxBaseYear) {
    const years = Object.keys(this._rateData).map(Number).sort((a, b) => b - a);
    const bestYear = years.find(y => y <= taxBaseYear) || years[years.length - 1];
    return { data: this._rateData[bestYear], year: bestYear };
  }

  /** @returns {number[]} Sorted list of years with published bracket data */
  getAvailableYears() {
    return Object.keys(this._rateData).map(Number).sort((a, b) => a - b);
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
    const { year = 2024, isResident = true, taxBaseYear = 2024, hasPrivateHospitalCover = false } = context;
    const { data, year: baseYear } = this._getRateData(taxBaseYear);
    const brackets = this._inflateBrackets(data.brackets, baseYear, year);
    const { tax, marginalRate, breakdown } = this._applyBrackets(grossIncome, brackets);

    // Medicare Levy — 2% with phase-in for low incomes
    // Thresholds are inflated at 3% p.a. beyond the base year (ATO indexes these to CPI)
    const mlData = data.medicareLevy || { rate: 0.02, lowerThreshold: 26000, phaseInRate: 0.10 };
    const inflFactor = Math.pow(1.03, year - baseYear);
    const mlThreshold = Math.round(mlData.lowerThreshold * inflFactor);
    // Phase-in ceiling: income at which full levy equals phase-in levy
    // ceiling = lowerThreshold * phaseInRate / (phaseInRate - rate)
    const mlCeiling = Math.round(mlData.lowerThreshold * mlData.phaseInRate / (mlData.phaseInRate - mlData.rate) * inflFactor);
    let medicareLevy;
    if (grossIncome <= mlThreshold) {
      medicareLevy = 0;
    } else if (grossIncome < mlCeiling) {
      medicareLevy = mlData.phaseInRate * (grossIncome - mlThreshold);
    } else {
      medicareLevy = grossIncome * mlData.rate;
    }

    // Medicare Levy Surcharge — additional 1–1.5% for those WITHOUT private hospital cover
    // MLS thresholds are NOT regularly indexed; applied to total income at the highest bracket rate
    let medicareLevySurcharge = 0;
    if (!hasPrivateHospitalCover && data.medicareLevySurcharge) {
      const mlsRate = data.medicareLevySurcharge
        .filter(t => grossIncome > t.min)
        .reduce((_acc, t) => t.rate, 0);
      medicareLevySurcharge = mlsRate > 0 ? grossIncome * mlsRate : 0;
    }

    // LITO (Low Income Tax Offset) — simplified, thresholds unchanged since FY2022-23
    let lito = 0;
    if (grossIncome <= 37500) lito = 700;
    else if (grossIncome <= 45000) lito = 700 - ((grossIncome - 37500) * 0.05);
    else if (grossIncome <= 66667) lito = 325 - ((grossIncome - 45000) * 0.015);
    lito = Math.max(0, lito);

    const total = Math.max(0, tax - lito) + medicareLevy + medicareLevySurcharge;
    return {
      tax: total,
      incomeTax: Math.max(0, tax - lito),
      medicareLevy,
      medicareLevySurcharge,
      lito,
      effectiveRate: grossIncome > 0 ? total / grossIncome : 0,
      marginalRate,
      breakdown,
    };
  }

  calcCapitalGainsTax(gain, income, context = {}) {
    // Australia: 50% CGT discount for assets held >12 months (residents)
    const { holdingPeriodDays = 400, isResident = true, year = 2024, taxBaseYear = 2024 } = context;
    const { data, year: baseYear } = this._getRateData(taxBaseYear);
    const discount = isResident && holdingPeriodDays >= 365 ? 0.5 : 1.0;
    const taxableGain = gain * discount;
    const brackets = this._inflateBrackets(data.brackets, baseYear, year);
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
    // US retirement accounts held post-move — treated as foreign pension income in AU.
    // Stub: 100% of withdrawal is AU-taxable as foreign income.
    // Future: apply proportional Article 18 (US-AU Tax Treaty) exemption using context.moveValueBasis
    // to distinguish pre-move growth (potentially exempt) from post-move growth (taxable).
    if (accountType === '401k' || accountType === 'ira') {
      if (eventType === 'contribution') return { taxableAmount: 0, note: 'Pre-tax (no AU event at contribution)' };
      if (eventType === 'growth')       return { taxableAmount: 0, note: 'Tax-deferred growth (no AU event)' };
      if (eventType === 'withdrawal') {
        const note = context.moveValueBasis != null
          ? '100% taxable as foreign income (Article 18 treaty exemption not yet modelled)'
          : '100% taxable as foreign income (no move-date basis set)';
        return { taxableAmount: amount, note };
      }
    }
    if (accountType === 'roth') {
      if (eventType === 'contribution') return { taxableAmount: 0, note: 'After-tax (no AU event at contribution)' };
      if (eventType === 'growth')       return { taxableAmount: 0, note: 'Tax-free growth (no AU event)' };
      if (eventType === 'withdrawal')
        return { taxableAmount: amount, note: 'Taxable as foreign income in AU (Roth has no AU equivalent)' };
    }
    // Franking credits on AU dividends — simplified: 30% credit on dividends
    if (accountType === 'brokerage' && eventType === 'withdrawal') {
      return { taxableAmount: amount, note: 'CGT 50% discount may apply', frankingCredit: amount * 0.043 };
    }
    return { taxableAmount: amount, note: '' };
  }

  /**
   * Calculate the Australian-taxable capital gain on a brokerage withdrawal,
   * applying deemed-acquisition rules (s855-45 ITAA 1997 equivalent).
   *
   * When a person becomes an Australian tax resident, Australia resets the CGT
   * cost basis to the FMV on that date (moveValueBasis). Only gains accrued
   * AFTER becoming resident are subject to Australian CGT.
   *
   * @param {number} withdrawal           - Amount being withdrawn
   * @param {number} preWithdrawalBalance - Account balance just before this withdrawal
   * @param {number|null} moveValueBasis  - FMV on AU residency date (null = use costBasis)
   * @param {number} costBasis            - Original US purchase cost basis (fallback)
   * @returns {{ auTaxableGain: number, auBasis: number, note: string }}
   */
  calcBrokerageAUGain(withdrawal, preWithdrawalBalance, moveValueBasis, costBasis) {
    const auBasis     = (moveValueBasis != null && moveValueBasis > 0) ? moveValueBasis : (costBasis || 0);
    const totalAUGain = Math.max(0, preWithdrawalBalance - auBasis);
    const fraction    = preWithdrawalBalance > 0 ? withdrawal / preWithdrawalBalance : 0;
    const auTaxableGain = totalAUGain * fraction;
    const note = moveValueBasis != null
      ? `AU gain above move-date FMV (${auBasis.toFixed(0)})`
      : `AU gain above original cost basis (no move-date value recorded)`;
    return { auTaxableGain: Math.max(0, auTaxableGain), auBasis, note };
  }

  getBrackets(year = 2024, taxBaseYear = null) {
    const { data, year: baseYear } = this._getRateData(taxBaseYear !== null ? taxBaseYear : year);
    return this._inflateBrackets(data.brackets, baseYear, year).map(b => ({
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

  /**
   * Returns the sorted list of tax years supported by all registered modules.
   * @returns {number[]}
   */
  getAvailableYears() {
    const moduleSets = this.getAll()
      .filter(m => typeof m.getAvailableYears === 'function')
      .map(m => m.getAvailableYears());
    if (moduleSets.length === 0) return [];
    return moduleSets.reduce((a, b) => a.filter(y => b.includes(y))).sort((a, b) => a - b);
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
