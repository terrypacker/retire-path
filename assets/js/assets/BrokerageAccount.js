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
 * BrokerageAccount.js
 * Taxable brokerage / investment account.
 * Tracks cost basis separately from balance to support capital-gains tax
 * calculations (including AU post-move CGT treatment).
 */
export class BrokerageAccount extends BaseAccount {
  /**
   * @param {Object} data - Plain POJO from AppState brokerageAccounts[] array
   */
  constructor(data) {
    super(data);  // id, name, country, currency, type, balance, growthRate, ownerId
    this.type               = 'brokerage';
    this.annualContribution = data.annualContribution || 0;
    this.costBasis          = data.costBasis          || 0;
    this.moveValueBasis     = data.moveValueBasis     ?? null;
    this.isJointAccount     = data.isJointAccount     || false;
    this.ownerId            = data.ownerId            || 'person1';
    this.priority           = data.priority           != null ? data.priority : 1;
  }

  // ── Ownership ──────────────────────────────────────────────────────────────

  /**
   * Return ownership shares for AU tax attribution.
   * Joint accounts split 50/50 across all people; otherwise 100% to ownerId.
   * @param {Array<{id: string}>} people - people array from AppState
   * @returns {Array<{personId: string, pct: number}>}
   */
  getOwnershipShares(people) {
    if (this.isJointAccount) {
      const share = 1 / people.length;
      return people.map(p => ({ personId: p.id, pct: share }));
    }
    return [{ personId: this.ownerId || people[0].id, pct: 1.0 }];
  }

  // ── Contributions ─────────────────────────────────────────────────────────

  /**
   * Annual new-money contribution (no employer match for brokerage).
   * @returns {number}
   */
  getContribution() {
    return this.annualContribution;
  }

  /**
   * Apply annual contributions to balance and cost basis.
   * New cash increases cost basis by the same amount as balance.
   * @param {number} balance
   * @param {number} costBasis
   * @returns {{ balance: number, costBasis: number }}
   */
  applyContributions(balance, costBasis) {
    const contrib = this.getContribution();
    return { balance: balance + contrib, costBasis: costBasis + contrib };
  }

  // ── Withdrawal ────────────────────────────────────────────────────────────

  /**
   * Calculate a withdrawal to cover an expense gap, preserving the
   * gain fraction needed for CGT calculations.
   *
   * @param {number} balance      - Current balance before this withdrawal
   * @param {number} costBasis    - Current cost basis before this withdrawal
   * @param {number} gapRemaining - Expense gap still to be covered
   * @returns {{
   *   withdrawal:    number,  // amount withdrawn
   *   gainWithdrawn: number,  // embedded gain portion of the withdrawal
   *   newBalance:    number,  // balance after withdrawal
   *   newCostBasis:  number   // cost basis after withdrawal
   * }}
   */
  calculateWithdrawal(balance, costBasis, gapRemaining) {
    const withdrawal    = Math.min(balance, gapRemaining);
    const gainFraction  = balance > 0 ? Math.max(0, (balance - costBasis) / balance) : 0;
    const gainWithdrawn = withdrawal * gainFraction;
    const newCostBasis  = Math.max(0, costBasis - withdrawal * (1 - gainFraction));
    const newBalance    = Math.max(0, balance - withdrawal);
    return { withdrawal, gainWithdrawn, newBalance, newCostBasis };
  }

  // ── Display ───────────────────────────────────────────────────────────────

  /**
   * @override Uses 'Brokerage' as the type tag.
   * @returns {string}
   */
  getDisplayLabel() {
    return `${this.name} (Brokerage)`;
  }
}
