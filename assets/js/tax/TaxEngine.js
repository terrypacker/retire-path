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
 * TaxEngine.js
 * Registry and dispatcher for pluggable country tax modules.
 */

import { BaseTaxModule }       from './BaseTaxModule.js';
import { USTaxModule }         from './USTaxModule.js';
import { AustraliaTaxModule }  from './AustraliaTaxModule.js';

export class TaxEngine {
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
export const taxEngine = new TaxEngine();
