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

import { RetirementAccount } from '../RetirementAccount.js';

/**
 * TraditionalIRAAccount.js
 * US Traditional IRA — pre-tax (deductible) contributions assumed.
 * Country and currency are fixed: US / USD.
 *
 * The `contributions` field (inherited) tracks total contributions to date,
 * which is useful for non-deductible IRA basis tracking and informational
 * AU tax breakdowns — though AU treatment remains fully taxable as foreign income.
 */
export class TraditionalIRAAccount extends RetirementAccount {
  constructor(data) {
    super({
      withdrawalStartAge: 59.5,
      ...data,
      type:     'ira',  // enforced
      country:  'US',
      currency: 'USD',
    });
  }

  // ── US tax treatment ───────────────────────────────────────────────────────

  getUSAccountTreatment(eventType, amount, context = {}) {
    if (eventType === 'contribution') return { taxableAmount: 0,      note: 'Pre-tax contribution (deductible IRA assumed)' };
    if (eventType === 'growth')       return { taxableAmount: 0,      note: 'Tax-deferred growth' };
    if (eventType === 'withdrawal')   return { taxableAmount: amount, note: 'Taxable as ordinary income' };
    return { taxableAmount: amount, note: '' };
  }

  // ── AU tax treatment ───────────────────────────────────────────────────────

  getAUAccountTreatment(eventType, amount, context = {}) {
    if (eventType === 'contribution') return { taxableAmount: 0, note: 'Pre-tax (no AU event at contribution)' };
    if (eventType === 'growth')       return { taxableAmount: 0, note: 'Tax-deferred growth (no AU event)' };
    if (eventType === 'withdrawal') {
      const note = context.moveValueBasis != null
        ? '100% taxable as foreign income (Article 18 treaty exemption not yet modelled)'
        : '100% taxable as foreign income';
      return { taxableAmount: amount, note };
    }
    return { taxableAmount: amount, note: '' };
  }
}
