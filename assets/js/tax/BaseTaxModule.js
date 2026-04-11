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
 * BaseTaxModule.js
 * Abstract base class for country+year-specific tax modules.
 * Provides shared bracket utilities used by all implementations.
 */

export class BaseTaxModule {
  /**
   * @param {string} countryCode  - e.g. 'US', 'AUS'
   * @param {number} year         - The tax year this module represents (bracket base year)
   */
  constructor(countryCode, year) {
    this.countryCode = countryCode;
    this.year = year;
  }

  /**
   * Calculate income tax for a given year and income.
   * @param {number} grossIncome  - Annual gross income in local currency
   * @param {object} context      - { year, isRetired, filingStatus, age }
   * @returns {{ tax: number, effectiveRate: number, marginalRate: number, breakdown: [] }}
   */
  calcIncomeTax(grossIncome, context) {
    throw new Error(`calcIncomeTax not implemented for ${this.countryCode} ${this.year}`);
  }

  /**
   * Calculate capital gains tax.
   * @param {number} gain      - Realized capital gain
   * @param {number} income    - Other income in same year
   * @param {object} context   - { year, holdingPeriodDays, isResident, age }
   * @returns {{ tax: number, effectiveRate: number }}
   */
  calcCapitalGainsTax(gain, income, context) {
    throw new Error(`calcCapitalGainsTax not implemented for ${this.countryCode} ${this.year}`);
  }

  /**
   * Returns tax brackets for display purposes.
   * @param {number} targetYear - Year to project brackets to (defaults to this.year)
   * @returns {Array<{ min, max, rate, label }>}
   */
  getBrackets(targetYear = this.year) {
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

  // ── Shared bracket utilities ──────────────────────────────────────────────

  /**
   * Inflate bracket thresholds from baseYear to targetYear.
   * @param {Array}  brackets
   * @param {number} baseYear
   * @param {number} targetYear
   * @param {number} inflationRate  - Annual rate (e.g. 0.025)
   */
  _inflateBrackets(brackets, baseYear, targetYear, inflationRate) {
    const years = targetYear - baseYear;
    const factor = Math.pow(1 + inflationRate, years);
    return brackets.map(b => ({
      min: b.min === 0 ? 0 : Math.round(b.min * factor),
      max: b.max === Infinity ? Infinity : Math.round(b.max * factor),
      rate: b.rate,
    }));
  }

  /**
   * Apply progressive tax brackets to an income amount.
   * @param {number} income
   * @param {Array}  brackets
   * @returns {{ tax: number, marginalRate: number, breakdown: Array }}
   */
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
}
