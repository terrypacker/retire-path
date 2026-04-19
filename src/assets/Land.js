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
 * Land.js
 * Undeveloped land asset. Appreciates but carries no mortgage, rental income,
 * or depreciation. Not yet used in the application — placeholder for future
 * land asset support.
 */
export class Land extends BaseAsset {
  /**
   * @param {Object} data - Plain POJO
   */
  constructor(data) {
    super(data);
    this.type              = 'land';
    this.currentValue      = data.currentValue      || 0;
    this.appreciationRate  = data.appreciationRate  != null ? data.appreciationRate : 3.0;
    this.costBasis         = data.costBasis         || 0;
    this.plannedSaleYear   = data.plannedSaleYear   ?? null;
    this.saleDestinationId = data.saleDestinationId ?? null;
    this.owners            = data.owners || [{ personId: 'person1', ownershipPct: 100 }];
  }

  // ── Ownership ──────────────────────────────────────────────────────────────

  /**
   * Return ownership shares for AU tax attribution.
   * @returns {Array<{personId: string, pct: number}>}
   */
  getOwnershipShares() {
    return this.owners.map(o => ({ personId: o.personId, pct: o.ownershipPct / 100 }));
  }

  // ── Initialization ────────────────────────────────────────────────────────

  /**
   * Initial carry-forward state for the projection loop.
   * @returns {{ value: number }}
   */
  getInitialState() {
    return { value: this.currentValue };
  }

  // ── Appreciation & sale ───────────────────────────────────────────────────

  /**
   * Apply one year of appreciation.
   * @param {number} value
   * @returns {number}
   */
  applyAppreciation(value) {
    return value * (1 + this.appreciationRate / 100);
  }

  /**
   * True if this land parcel is scheduled to be sold in the given year.
   * @param {number} year
   * @returns {boolean}
   */
  isSoldThisYear(year) {
    return this.plannedSaleYear != null && year === this.plannedSaleYear;
  }
}
