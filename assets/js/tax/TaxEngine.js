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
 * Registry and dispatcher for pluggable country+year tax modules.
 * Modules are keyed by 'COUNTRYCODE_YEAR' (e.g. 'US_2024').
 * get(countryCode, year) resolves the best available module for a given year.
 */

import { BaseTaxModule }            from './BaseTaxModule.js';
import { USTaxModule2024 }          from './USTaxModule2024.js';
import { USTaxModule2025 }          from './USTaxModule2025.js';
import { AustraliaTaxModule2024 }   from './AustraliaTaxModule2024.js';
import { AustraliaTaxModule2025 }   from './AustraliaTaxModule2025.js';

export class TaxEngine {
  constructor() {
    this._modules = {};
    this.register(new USTaxModule2024());
    this.register(new USTaxModule2025());
    this.register(new AustraliaTaxModule2024());
    this.register(new AustraliaTaxModule2025());
  }

  register(module) {
    if (!(module instanceof BaseTaxModule)) {
      throw new Error('Tax module must extend BaseTaxModule');
    }
    const key = `${module.countryCode}_${module.year}`;
    this._modules[key] = module;
    console.log(`[TaxEngine] Registered module: ${key}`);
  }

  /**
   * Returns the module for countryCode whose year is the highest available <= year.
   * Falls back to the earliest registered module for that country if year is before all known years.
   * @param {string} countryCode
   * @param {number} year
   * @returns {BaseTaxModule}
   */
  get(countryCode, year) {
    const available = Object.keys(this._modules)
      .filter(k => k.startsWith(countryCode + '_'))
      .map(k => parseInt(k.split('_')[1]))
      .sort((a, b) => a - b);

    if (available.length === 0) {
      throw new Error(`No tax module for country: ${countryCode}`);
    }

    // Highest registered year that is <= the requested year, or the earliest if none qualify
    const best = available.filter(y => y <= year).pop() ?? available[0];
    return this._modules[`${countryCode}_${best}`];
  }

  getAll() {
    return Object.values(this._modules);
  }

  /**
   * Returns the sorted union of all registered years across all countries.
   * Used to populate the tax base year selector in the UI.
   * @returns {number[]}
   */
  getAvailableYears() {
    const years = new Set(
      Object.keys(this._modules).map(k => parseInt(k.split('_')[1]))
    );
    return Array.from(years).sort((a, b) => a - b);
  }

  hasModule(countryCode) {
    return Object.keys(this._modules).some(k => k.startsWith(countryCode + '_'));
  }

  /**
   * Returns the list of modules applicable to the given year based on move settings.
   * US citizens always file US taxes; AU taxes also apply after the move date.
   */
  resolveApplicableModules(year, moveYear, moveEnabled) {
    const modules = [this.get('US', year)];
    if (moveEnabled && year >= moveYear) {
      modules.push(this.get('AUS', year));
    }
    return modules;
  }
}

// Singleton
export const taxEngine = new TaxEngine();
