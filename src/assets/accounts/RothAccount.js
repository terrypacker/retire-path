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
 * US withdrawal rules:
 *  - Qualified (age ≥ 59½):  entirely tax-free, no penalty.
 *  - Early — contributions:  always tax-free and penalty-free (basis recovery).
 *  - Early — gains only:     10% early-withdrawal penalty; NOT added to ordinary income
 *                             (gains remain "in the Roth wrapper" and are not taxed as income
 *                              even on early withdrawal — only the penalty applies).
 *
 * AU withdrawal rules (no Roth equivalent in Australian tax law):
 *  - Contributions (corpus): tax-free — already after-tax money, no new AU income event.
 *  - Gains:                  taxable as foreign income at ordinary income rates.
 *  - The gains fraction is computed from context.contributions and context.balance.
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
    if (eventType === 'contribution') return { taxableIncome: amount, penaltyAmount: 0, note: 'After-tax contribution' };
    if (eventType === 'growth')       return { taxableIncome: 0,      penaltyAmount: 0, note: 'Tax-free growth' };

    if (eventType === 'withdrawal') {
      const age = context.age || 60;

      if (age >= 59.5) {
        return { taxableIncome: 0, penaltyAmount: 0, note: 'Qualified tax-free withdrawal' };
      }

      // Early withdrawal — split on contributions vs gains.
      // Contributions are always penalty-free and not taxable (basis recovery).
      // Gains face a 10% penalty but are NOT added to ordinary income.
      const balance       = context.balance       || amount;
      const contributions = context.contributions || 0;
      const gains         = Math.max(0, balance - contributions);
      const gainsFraction = balance > 0 ? gains / balance : 0;
      const gainsWithdrawn = amount * gainsFraction;

      return {
        taxableIncome: 0,                   // Roth gains are not ordinary income even on early withdrawal
        penaltyAmount: gainsWithdrawn * 0.10,
        note: `Early withdrawal: contributions tax/penalty-free; 10% penalty on $${Math.round(gainsWithdrawn).toLocaleString()} gains`,
      };
    }

    return { taxableIncome: 0, penaltyAmount: 0, note: '' };
  }

  // ── AU tax treatment ───────────────────────────────────────────────────────

  getAUAccountTreatment(eventType, amount, context = {}) {
    if (eventType === 'contribution') return { taxableIncome: 0,      penaltyAmount: 0, note: 'After-tax (no AU event at contribution)' };
    if (eventType === 'growth')       return { taxableIncome: 0,      penaltyAmount: 0, note: 'Tax-free growth (no AU event)' };

    if (eventType === 'withdrawal') {
      // AU has no Roth equivalent. Treat using corpus (contributions) vs gains split:
      //   Corpus = after-tax contributions already subject to US/AU tax → not taxed again.
      //   Gains  = investment returns → taxable as foreign income at ordinary AU rates.
      const balance       = context.balance       || amount;
      const contributions = context.contributions || 0;
      const gains         = Math.max(0, balance - contributions);
      const gainsFraction = balance > 0 ? gains / balance : 0;
      const gainsWithdrawn  = amount * gainsFraction;
      const corpusWithdrawn = amount - gainsWithdrawn;

      const corpusPct = Math.round((1 - gainsFraction) * 100);
      const gainsPct  = Math.round(gainsFraction * 100);

      return {
        taxableIncome: gainsWithdrawn,
        penaltyAmount: 0,
        note: `Corpus ${corpusPct}% ($${Math.round(corpusWithdrawn).toLocaleString()}) tax-free; gains ${gainsPct}% ($${Math.round(gainsWithdrawn).toLocaleString()}) taxable as foreign income`,
      };
    }

    return { taxableIncome: amount, penaltyAmount: 0, note: '' };
  }
}
