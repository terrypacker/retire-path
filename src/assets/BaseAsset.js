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
 * BaseAsset.js
 * Root of the asset/account class hierarchy.
 * Holds the identity and locale fields shared by every asset — tangible
 * (RealEstate, Land) and financial (BaseAccount → RetirementAccount,
 * BrokerageAccount).
 *
 * Instances wrap plain POJOs from AppState; evolving values are kept in
 * ProjectionEngine's carry-forward maps so instances stay stateless.
 */
export class BaseAsset {
  /**
   * @param {Object} data - Plain POJO from AppState
   */
  constructor(data) {
    this.id       = data.id;
    this.name     = data.name;
    this.country  = data.country  || 'US';
    this.currency = data.currency || 'USD';
  }

  // ── Display ───────────────────────────────────────────────────────────────

  /**
   * Human-readable label for reports and drill-down modals.
   * Subclasses may override to append a type tag.
   * @returns {string}
   */
  getDisplayLabel() {
    return this.name;
  }
}
