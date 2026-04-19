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
 *    Deducted from the account balance at contribution time — NOT ordinary income.
 *  - Earnings:      15% tax within the fund, deducted from growth each year.
 *    NOT ordinary income; simply reduces the net return on investment.
 *  - Withdrawal:    Completely tax-free at age 60+.
 *    Under 60 (preservation age rules, simplified): treated as ordinary income.
 *
 * US tax treatment (simplified):
 *  - Contributions: not taxed in the US.
 *  - Growth:        not taxed until withdrawal.
 *  - Withdrawals:   taxed as ordinary income (simplified; grantor-trust rules not modelled).
 */
export class SuperAccount extends RetirementAccount {
  static CONTRIBUTIONS_TAX_RATE = 0.15;
  static EARNINGS_TAX_RATE      = 0.15;

  constructor(data) {
    super({
      withdrawalStartAge: 60,
      ...data,
      type:     'super',  // enforced
      country:  'AUS',
      currency: 'AUD',
    });
  }

  // ── Growth (overrides BaseAccount) ────────────────────────────────────────

  /**
   * Apply one year of investment growth, net of the 15% earnings tax paid within the fund.
   * The tax reduces the account balance directly — it is not ordinary income.
   * @param {number} balance
   * @returns {number}
   */
  applyGrowth(balance) {
    const grossGrowth = balance * (this.growthRate / 100);
    return balance + grossGrowth * (1 - SuperAccount.EARNINGS_TAX_RATE);
  }

  // ── Contributions (overrides RetirementAccount) ───────────────────────────

  /**
   * Add annual contributions net of the 15% contributions tax paid within the fund.
   * The tax reduces the amount credited to the account — it is not ordinary income.
   * @param {number} balance
   * @returns {number}
   */
  applyContributions(balance) {
    return balance + this.getContribution() * (1 - SuperAccount.CONTRIBUTIONS_TAX_RATE);
  }

  // ── US tax treatment ───────────────────────────────────────────────────────

  getUSAccountTreatment(eventType, amount, context = {}) {
    if (eventType === 'contribution') return { taxableIncome: 0,      penaltyAmount: 0, note: 'Super contributions not taxed in US' };
    if (eventType === 'growth')       return { taxableIncome: 0,      penaltyAmount: 0, note: 'Super growth deferred until withdrawal' };
    if (eventType === 'withdrawal')   return { taxableIncome: amount, penaltyAmount: 0, note: 'Super withdrawal taxed as ordinary income (US simplified treatment)' };
    return { taxableIncome: amount, penaltyAmount: 0, note: '' };
  }

  // ── AU tax treatment ───────────────────────────────────────────────────────

  getAUAccountTreatment(eventType, amount, context = {}) {
    const age = context.age || 60;

    // Contributions and growth taxes are already deducted from the balance via
    // applyContributions() / applyGrowth(). Nothing flows into ordinary income.
    if (eventType === 'contribution')
      return { taxableIncome: 0, penaltyAmount: 0, note: '15% contributions tax deducted within fund' };

    if (eventType === 'growth')
      return { taxableIncome: 0, penaltyAmount: 0, note: '15% earnings tax deducted within fund' };

    if (eventType === 'withdrawal') {
      if (age >= 60)
        return { taxableIncome: 0,      penaltyAmount: 0, note: 'Tax-free super withdrawal (age 60+)' };
      // Under preservation age: taxable as ordinary income (simplified; 15% offset not modelled)
      return   { taxableIncome: amount, penaltyAmount: 0, note: 'Taxable as ordinary income (under 60, preservation age rules — simplified)' };
    }

    return { taxableIncome: amount, penaltyAmount: 0, note: '' };
  }
}
