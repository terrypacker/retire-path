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
 * Abstract base class for country-specific tax modules.
 */

export class BaseTaxModule {
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
