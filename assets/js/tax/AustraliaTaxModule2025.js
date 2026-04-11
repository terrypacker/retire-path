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
 * AustraliaTaxModule2025.js
 * Australian income tax — FY2025-26.
 * Key change: lower 30% bracket extended to $135k (2025 Federal Budget).
 */

import { AustraliaTaxModuleBase } from './AustraliaTaxModuleBase.js';

export class AustraliaTaxModule2025 extends AustraliaTaxModuleBase {
  constructor() {
    super(2025);

    this._brackets = [
      { min: 0,       max: 18200,     rate: 0.00 },
      { min: 18200,   max: 45000,     rate: 0.19 },
      { min: 45000,   max: 135000,    rate: 0.30 },
      { min: 135000,  max: 190000,    rate: 0.37 },
      { min: 190000,  max: Infinity,  rate: 0.45 },
    ];

    // Medicare Levy thresholds unchanged from FY2024-25
    this._medicareLevy = { rate: 0.02, lowerThreshold: 26000, phaseInRate: 0.10 };

    // MLS thresholds unchanged from FY2024-25
    this._medicareLevySurcharge = [
      { min: 93000,  rate: 0.010 },
      { min: 108000, rate: 0.0125 },
      { min: 144000, rate: 0.015 },
    ];
  }
}
