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
 * USTaxModule.js
 * US federal income tax, capital gains, and account treatment.
 */

import { BaseTaxModule } from './BaseTaxModule.js';

export class USTaxModule extends BaseTaxModule {
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
