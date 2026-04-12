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
 * USTaxModuleBase.js
 * Shared US federal tax logic used across all tax years.
 * Year-specific subclasses set bracket data and override methods as needed.
 *
 * Subclasses must set in their constructor:
 *   this._brackets_mfj      {Array}  - Ordinary income brackets (MFJ)
 *   this._ltcg_mfj          {Array}  - Long-term capital gains brackets (MFJ)
 *   this._stdDeduction_mfj  {number} - Standard deduction (MFJ)
 *   this._ficaWageBase      {number} - FICA SS wage base for this year
 */

import { BaseTaxModule } from './BaseTaxModule.js';

export class USTaxModuleBase extends BaseTaxModule {
  constructor(year) {
    super('US', year);
    this._niit           = 0.038;  // Net Investment Income Tax rate
    this._ficaRate       = 0.0765; // Combined employee FICA rate (SS 6.2% + Medicare 1.45%)
    this._inflationRate  = 0.025;  // Rate used to project brackets beyond this.year
  }

  // ── Income tax ───────────────────────────────────────────────────────────

  calcIncomeTax(grossIncome, context = {}) {
    const { year = this.year } = context;
    const brackets = this._inflateBrackets(this._brackets_mfj, this.year, year, this._inflationRate);
    const stdDed   = Math.round(this._stdDeduction_mfj * Math.pow(1 + this._inflationRate, year - this.year));
    const taxable  = Math.max(0, grossIncome - stdDed);
    const { tax, marginalRate, breakdown } = this._applyBrackets(taxable, brackets);
    const ficaTax  = Math.min(grossIncome, this._ficaWageBase) * this._ficaRate;
    const total    = tax + ficaTax;
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

  // ── Capital gains tax ─────────────────────────────────────────────────────

  calcCapitalGainsTax(gain, income, context = {}) {
    const { year = this.year, holdingPeriodDays = 400 } = context;
    const isLongTerm = holdingPeriodDays >= 365;
    let tax = 0;

    if (!isLongTerm) {
      // Short-term: taxed as ordinary income (marginal rate on gain stacked on income)
      const brackets = this._inflateBrackets(this._brackets_mfj, this.year, year, this._inflationRate);
      const stdDed   = Math.round(this._stdDeduction_mfj * Math.pow(1 + this._inflationRate, year - this.year));
      const baseResult  = this._applyBrackets(Math.max(0, income - stdDed), brackets);
      const totalResult = this._applyBrackets(Math.max(0, income + gain - stdDed), brackets);
      tax = totalResult.tax - baseResult.tax;
    } else {
      const ltcgBrackets   = this._inflateBrackets(this._ltcg_mfj, this.year, year, this._inflationRate);
      const { tax: t }     = this._applyBrackets(gain, ltcgBrackets);
      tax = t;
      // NIIT on investment income above threshold for high earners
      const niitThreshold  = Math.round(250000 * Math.pow(1 + this._inflationRate, year - this.year));
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

  // ── Brackets display ──────────────────────────────────────────────────────

  getBrackets(targetYear = this.year) {
    return this._inflateBrackets(this._brackets_mfj, this.year, targetYear, this._inflationRate)
      .map(b => ({ ...b, label: `${(b.rate * 100).toFixed(0)}%` }));
  }

  // ── Social Security ───────────────────────────────────────────────────────

  /**
   * Estimate annual Social Security benefit for a person in a given year.
   * Inflates the configured monthly benefit (assumed to be in 2024 dollars) at 2.3% COLA.
   */
  calcSocialSecurity(person, year) {
    const claimAge  = person.socialSecurityAge || 67;
    const claimYear = person.birthYear + claimAge;
    if (year < claimYear) return 0;
    const inflated = person.socialSecurityMonthly * Math.pow(1.023, year - 2024);
    return inflated * 12;
  }
}
