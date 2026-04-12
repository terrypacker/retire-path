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
 * BaseAccount.js
 * Abstract base class for all financial accounts (retirement and brokerage).
 * Extends BaseAsset, adding the balance/growth fields that distinguish
 * a liquid financial account from a tangible asset.
 *
 * State (evolving balances) is kept in ProjectionEngine's carry-forward maps
 * so instances remain stateless.
 */
export class BaseAccount extends BaseAsset {
  /**
   * @param {Object} data - Plain account POJO from AppState
   */
  constructor(data) {
    super(data);  // id, name, country, currency
    this.type       = data.type;
    this.balance    = data.balance    || 0;
    this.growthRate = data.growthRate != null ? data.growthRate : 7.0;
    this.ownerId    = data.ownerId    || null;
  }

  // ── Growth ────────────────────────────────────────────────────────────────

  /**
   * Apply one year of investment growth to a running balance.
   * @param {number} balance - Current balance from the engine's carry-forward map
   * @returns {number} New balance after growth
   */
  applyGrowth(balance) {
    return balance * (1 + this.growthRate / 100);
  }

  // ── Display ───────────────────────────────────────────────────────────────

  /**
   * @override Appends the account type tag to the name.
   * @returns {string}
   */
  getDisplayLabel() {
    return `${this.name} (${this.type.toUpperCase()})`;
  }
}
