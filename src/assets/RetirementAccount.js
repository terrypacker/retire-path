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
 * RetirementAccount.js
 * Tax-advantaged retirement accounts: 401k, Roth IRA, IRA, Australian Super.
 * Adds contribution (employee + employer match) and age-gated withdrawal logic.
 */
export class RetirementAccount extends BaseAccount {
  /**
   * @param {Object} data - Plain POJO from AppState accounts[] array
   */
  constructor(data) {
    super(data);  // id, name, country, currency, type, balance, growthRate, ownerId
    this.annualContribution = data.annualContribution || 0;
    this.employerMatch      = data.employerMatch      || 0;
    this.withdrawalStartAge = data.withdrawalStartAge != null ? data.withdrawalStartAge : 59.5;
    this.moveValueBasis     = data.moveValueBasis     ?? null;
    // Total after-tax contributions to date (corpus/basis). Used to determine gains portion
    // for Roth early-withdrawal penalty (US) and for informational AU tax breakdown.
    this.contributions      = data.contributions      ?? 0;
  }

  // ── Contributions ─────────────────────────────────────────────────────────

  /**
   * Total annual contribution: employee elective deferral + employer match.
   * @returns {number}
   */
  getContribution() {
    return this.annualContribution + this.employerMatch;
  }

  /**
   * Add annual contributions to a running balance.
   * Only called when the owner is still working (pre-retirement).
   * @param {number} balance
   * @returns {number} New balance after contributions
   */
  applyContributions(balance) {
    return balance + this.getContribution();
  }

  // ── Withdrawal ────────────────────────────────────────────────────────────

  /**
   * Whether the account owner is eligible for penalty-free withdrawals.
   * @param {number} ownerAge - Owner's age in the projection year
   * @returns {boolean}
   */
  canWithdraw(ownerAge) {
    return ownerAge >= this.withdrawalStartAge;
  }

  // ── Account treatment ─────────────────────────────────────────────────────

  /**
   * US federal tax treatment for a given account event.
   * Subclasses override to provide type-specific rules.
   *
   * @param {string} eventType - 'contribution' | 'growth' | 'withdrawal'
   * @param {number} amount    - Actual withdrawal/contribution amount
   * @param {Object} context   - { age, year, moveValueBasis, contributions, balance }
   * @returns {{ taxableIncome: number, penaltyAmount: number, note: string }}
   *   taxableIncome  — portion that feeds into the ordinary income tax calculation
   *   penaltyAmount  — flat early-withdrawal penalty (10% IRS; separate from income tax)
   */
  getUSAccountTreatment(eventType, amount, context = {}) {
    return { taxableIncome: amount, penaltyAmount: 0, note: '' };
  }

  /**
   * Australian tax treatment for a given account event.
   * Subclasses override to provide type-specific rules.
   *
   * @param {string} eventType - 'contribution' | 'growth' | 'withdrawal'
   * @param {number} amount    - Actual withdrawal/contribution amount
   * @param {Object} context   - { age, year, moveValueBasis, contributions, balance }
   * @returns {{ taxableIncome: number, penaltyAmount: number, note: string }}
   *   taxableIncome  — portion subject to AU income tax
   *   penaltyAmount  — always 0 for AU (no IRS-equivalent penalty in Australian tax law)
   */
  getAUAccountTreatment(eventType, amount, context = {}) {
    return { taxableIncome: amount, penaltyAmount: 0, note: '' };
  }
}
