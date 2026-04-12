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
 * RothAccount.js
 * US Roth IRA — after-tax contributions; qualified withdrawals are fully tax-free.
 * Country and currency are fixed: US / USD.
 *
 * Key rules modelled:
 *  - US qualified withdrawal (age ≥ 59.5): entirely tax-free.
 *  - US early withdrawal: contributions can always be withdrawn penalty-free;
 *    only the gains portion faces the 10% early-withdrawal penalty.
 *  - AU: no Roth equivalent — treated as taxable foreign income in full
 *    (simplified; no corpus distinction applied at AU level).
 */
export class RothAccount extends RetirementAccount {
  constructor(data) {
    super({
      withdrawalStartAge: 59.5,
      ...data,
      type:     'roth',  // enforced
      country:  'US',
      currency: 'USD',
    });
  }

  // ── US tax treatment ───────────────────────────────────────────────────────

  getUSAccountTreatment(eventType, amount, context = {}) {
    if (eventType === 'contribution') return { taxableAmount: amount, note: 'After-tax contribution' };
    if (eventType === 'growth')       return { taxableAmount: 0,      note: 'Tax-free growth' };

    if (eventType === 'withdrawal') {
      const age = context.age || 60;
      if (age >= 59.5) return { taxableAmount: 0, note: 'Qualified tax-free withdrawal' };

      // Early withdrawal: contributions always penalty-free; only gains are penalised.
      const balance       = context.balance       || amount;
      const contributions = context.contributions || 0;
      const gains         = Math.max(0, balance - contributions);
      const gainsFraction = balance > 0 ? gains / balance : 0;
      const gainsWithdrawn = amount * gainsFraction;
      return {
        taxableAmount: gainsWithdrawn * 0.10,
        note: `10% early withdrawal penalty on gains only ($${Math.round(gainsWithdrawn).toLocaleString()} of $${Math.round(amount).toLocaleString()} withdrawn)`,
      };
    }

    return { taxableAmount: 0, note: '' };
  }

  // ── AU tax treatment ───────────────────────────────────────────────────────

  getAUAccountTreatment(eventType, amount, context = {}) {
    if (eventType === 'contribution') return { taxableAmount: 0,      note: 'After-tax (no AU event at contribution)' };
    if (eventType === 'growth')       return { taxableAmount: 0,      note: 'Tax-free growth (no AU event)' };
    if (eventType === 'withdrawal')   return { taxableAmount: amount, note: 'Taxable as foreign income in AU (Roth has no AU equivalent)' };
    return { taxableAmount: amount, note: '' };
  }
}
