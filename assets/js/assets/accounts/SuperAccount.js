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
 * SuperAccount.js
 * Australian Superannuation fund.
 * Country and currency are fixed: AUS / AUD.
 *
 * AU tax rates modelled (accumulation phase):
 *  - Contributions: 15% tax within the fund (concessional contributions).
 *  - Earnings:      15% tax within the fund.
 *  - Withdrawal:    Tax-free at age 60+; 20% (simplified) if under 60.
 *
 * US tax treatment is not modelled (known limitation — Super is complex
 * for US citizens; consult a cross-border tax specialist).
 */
export class SuperAccount extends RetirementAccount {
  static CONTRIBUTIONS_TAX_RATE  = 0.15;
  static EARNINGS_TAX_RATE       = 0.15;
  static WITHDRAWAL_TAX_UNDER_60 = 0.20;

  constructor(data) {
    super({
      withdrawalStartAge: 60,
      ...data,
      type:     'super',  // enforced
      country:  'AUS',
      currency: 'AUD',
    });
  }

  // ── US tax treatment ───────────────────────────────────────────────────────

  getUSAccountTreatment(eventType, amount, context = {}) {
    // Australian Super is treated as a foreign grantor trust for US citizens but detailed
    // modelling is out of scope (known limitation). Return zero to avoid double-counting.
    return { taxableIncome: 0, penaltyAmount: 0, note: 'Australian Super — US tax treatment not modelled (known limitation)' };
  }

  // ── AU tax treatment ───────────────────────────────────────────────────────

  getAUAccountTreatment(eventType, amount, context = {}) {
    const age = context.age || 60;

    if (eventType === 'contribution')
      return { taxableIncome: amount * SuperAccount.CONTRIBUTIONS_TAX_RATE, penaltyAmount: 0, note: '15% contributions tax in fund' };

    if (eventType === 'growth')
      return { taxableIncome: amount * SuperAccount.EARNINGS_TAX_RATE, penaltyAmount: 0, note: '15% earnings tax in accumulation phase' };

    if (eventType === 'withdrawal') {
      if (age >= 60)
        return { taxableIncome: 0,                                        penaltyAmount: 0, note: 'Tax-free super withdrawal (age 60+)' };
      return   { taxableIncome: amount * SuperAccount.WITHDRAWAL_TAX_UNDER_60, penaltyAmount: 0, note: '20% tax + Medicare (under 60) — simplified' };
    }

    return { taxableIncome: amount, penaltyAmount: 0, note: '' };
  }
}
