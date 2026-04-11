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
 * USTaxModule2024.js
 * US federal tax — tax year 2024 (IRS Rev. Proc. 2023-34).
 * MFJ brackets, LTCG brackets, and standard deduction.
 */

import { USTaxModuleBase } from './USTaxModuleBase.js';

export class USTaxModule2024 extends USTaxModuleBase {
  constructor() {
    super(2024);

    this._brackets_mfj = [
      { min: 0,       max: 23200,     rate: 0.10 },
      { min: 23200,   max: 94300,     rate: 0.12 },
      { min: 94300,   max: 201050,    rate: 0.22 },
      { min: 201050,  max: 383900,    rate: 0.24 },
      { min: 383900,  max: 487450,    rate: 0.32 },
      { min: 487450,  max: 731200,    rate: 0.35 },
      { min: 731200,  max: Infinity,  rate: 0.37 },
    ];

    this._ltcg_mfj = [
      { min: 0,       max: 94050,     rate: 0.00 },
      { min: 94050,   max: 583750,    rate: 0.15 },
      { min: 583750,  max: Infinity,  rate: 0.20 },
    ];

    this._stdDeduction_mfj = 29200;
    this._ficaWageBase     = 168600; // IRS SS wage base 2024
  }
}
