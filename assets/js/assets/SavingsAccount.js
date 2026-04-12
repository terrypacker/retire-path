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

import { BaseAccount } from './BaseAccount.js';

/**
 * SavingsAccount.js
 * Cash / HYSA savings account. Grows at growthRate each year.
 * NOTE: The `growthRate` field (inherited from BaseAccount) is used as the
 * **annual interest rate** for this account. Interest is taxable income each year
 * (US: ordinary income / 1099-INT; AU savings pre-move: 15% AU withholding + FTC).
 * Withdrawals above minimumBalance require no tax event (cash account).
 * A minimumBalance floor protects a portion of the balance from deficit-driven sales.
 * The priority field controls the order in which savings accounts are drawn when
 * covering an expense gap (lower number = drawn first).
 */
export class SavingsAccount extends BaseAccount {
  /**
   * @param {Object} data - Plain POJO from AppState savingsAccounts[] array
   */
  constructor(data) {
    super(data);  // id, name, country, currency, balance, growthRate (annual interest rate), ownerId
    this.type           = 'savings';
    this.minimumBalance = data.minimumBalance ?? 0;
    this.priority       = data.priority       ?? 1;
  }

  // ── Withdrawal ────────────────────────────────────────────────────────────

  /**
   * Calculate a withdrawal above the minimum balance floor to cover an expense gap.
   * No capital gains tax applies — this is a cash account.
   *
   * @param {number} balance      - Current balance before this withdrawal
   * @param {number} gapRemaining - Expense gap still to be covered
   * @returns {{ withdrawal: number, newBalance: number }}
   */
  calculateWithdrawal(balance, gapRemaining) {
    const available  = Math.max(0, balance - this.minimumBalance);
    const withdrawal = Math.min(available, gapRemaining);
    return { withdrawal, newBalance: balance - withdrawal };
  }

  // ── Display ───────────────────────────────────────────────────────────────

  /**
   * @override
   * @returns {string}
   */
  getDisplayLabel() {
    return `${this.name} (Savings)`;
  }
}
