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
 * Account401k.js
 * US 401(k) pre-tax employer-sponsored plan.
 * Country and currency are fixed: US / USD.
 * All contributions and growth are tax-deferred; withdrawals taxed as ordinary income.
 */
export class Account401k extends RetirementAccount {
  constructor(data) {
    super({
      withdrawalStartAge: 59.5,
      ...data,
      type:     '401k',  // enforced
      country:  'US',
      currency: 'USD',
    });
  }

  // ── US tax treatment ───────────────────────────────────────────────────────

  getUSAccountTreatment(eventType, amount, context = {}) {
    if (eventType === 'contribution') return { taxableAmount: 0,      note: 'Pre-tax contribution' };
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
