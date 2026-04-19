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
 * USTaxModule2025.js
 * US federal tax — tax year 2025 (IRS Rev. Proc. 2024-40).
 * MFJ brackets, LTCG brackets, and standard deduction.
 */

import { USTaxModuleBase } from './USTaxModuleBase.js';

export class USTaxModule2025 extends USTaxModuleBase {
  constructor() {
    super(2025);

    this._brackets_mfj = [
      { min: 0,       max: 23850,     rate: 0.10 },
      { min: 23850,   max: 96950,     rate: 0.12 },
      { min: 96950,   max: 206700,    rate: 0.22 },
      { min: 206700,  max: 394600,    rate: 0.24 },
      { min: 394600,  max: 501050,    rate: 0.32 },
      { min: 501050,  max: 751600,    rate: 0.35 },
      { min: 751600,  max: Infinity,  rate: 0.37 },
    ];

    this._ltcg_mfj = [
      { min: 0,       max: 96700,     rate: 0.00 },
      { min: 96700,   max: 600050,    rate: 0.15 },
      { min: 600050,  max: Infinity,  rate: 0.20 },
    ];

    this._stdDeduction_mfj = 30000;
    this._ficaWageBase     = 176100; // IRS SS wage base 2025
  }
}
