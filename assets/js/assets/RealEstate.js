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

import { BaseAsset } from './BaseAsset.js';

/**
 * RealEstate.js
 * Residential or commercial property with mortgage and appreciation.
 * Supports an optional planned sale whose net proceeds are routed to a
 * destination account or brokerage.
 */
export class RealEstate extends BaseAsset {
  /**
   * @param {Object} data - Plain POJO from AppState properties[] array
   */
  constructor(data) {
    super(data);
    this.type               = 'real_estate';
    this.currentValue       = data.currentValue       || 0;
    this.mortgageBalance    = data.mortgageBalance    || 0;
    this.monthlyMortgage    = data.monthlyMortgage    || 0;
    this.appreciationRate   = data.appreciationRate   != null ? data.appreciationRate : 3.5;
    this.isPrimaryResidence = data.isPrimaryResidence || false;
    this.plannedSaleYear    = data.plannedSaleYear    ?? null;
    this.costBasis          = data.costBasis          || 0;
    this.saleDestinationId  = data.saleDestinationId  ?? null;
  }

  // ── Initialization ────────────────────────────────────────────────────────

  /**
   * Initial carry-forward state for the projection loop.
   * @returns {{ value: number, mortgage: number }}
   */
  getInitialState() {
    return { value: this.currentValue, mortgage: this.mortgageBalance };
  }

  // ── Appreciation & mortgage ───────────────────────────────────────────────

  /**
   * Apply one year of appreciation to a property value.
   * @param {number} value - Current value from carry-forward state
   * @returns {number} Appreciated value
   */
  applyAppreciation(value) {
    return value * (1 + this.appreciationRate / 100);
  }

  /**
   * Reduce outstanding mortgage balance by one year of principal payments.
   * Uses a simplified 50% of annual payment as principal reduction
   * (the other 50% is interest, which is already counted in expenses).
   * @param {number} mortgage - Current mortgage balance from carry-forward state
   * @returns {number} Reduced mortgage balance (floor 0)
   */
  applyMortgageReduction(mortgage) {
    return Math.max(0, mortgage - this.monthlyMortgage * 12 * 0.5);
  }

  /**
   * Gross annual mortgage payment (principal + interest).
   * @returns {number}
   */
  getAnnualMortgagePayment() {
    return this.monthlyMortgage * 12;
  }

  // ── Equity & sale ─────────────────────────────────────────────────────────

  /**
   * Net equity = value − mortgage, floored at zero.
   * @param {number} value
   * @param {number} mortgage
   * @returns {number}
   */
  getEquity(value, mortgage) {
    return Math.max(0, value - mortgage);
  }

  /**
   * True if this property is scheduled to be sold in the given year.
   * @param {number} year
   * @returns {boolean}
   */
  isSoldThisYear(year) {
    return this.plannedSaleYear != null && year === this.plannedSaleYear;
  }

  /**
   * True if there is still an active mortgage to pay in the given year.
   * @param {number} year            - Projection year
   * @param {number} currentMortgage - Current mortgage balance from carry-forward state
   * @returns {boolean}
   */
  hasActiveMortgage(year, currentMortgage) {
    return currentMortgage > 0 && (!this.plannedSaleYear || year < this.plannedSaleYear);
  }
}
