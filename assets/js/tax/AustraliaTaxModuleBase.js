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
 * AustraliaTaxModuleBase.js
 * Shared Australian tax logic used across all tax years.
 * Year-specific subclasses set bracket data and override methods as needed.
 *
 * Subclasses must set in their constructor:
 *   this._brackets              {Array}  - Individual income tax brackets (ATO)
 *   this._medicareLevy          {object} - { rate, lowerThreshold, phaseInRate }
 *   this._medicareLevySurcharge {Array}  - [{ min, rate }, ...] for those without private cover
 */

import { BaseTaxModule } from './BaseTaxModule.js';

export class AustraliaTaxModuleBase extends BaseTaxModule {
  constructor(year) {
    super('AUS', year);
    this._inflationRate = 0.03;  // CPI rate used to project brackets beyond this.year
  }

  // ── Income tax ───────────────────────────────────────────────────────────

  calcIncomeTax(grossIncome, context = {}) {
    const { year = this.year, isResident = true, hasPrivateHospitalCover = false } = context;

    const brackets = this._inflateBrackets(this._brackets, this.year, year, this._inflationRate);
    const { tax, marginalRate, breakdown } = this._applyBrackets(grossIncome, brackets);

    // Medicare Levy — 2% with phase-in for low incomes (ATO indexes thresholds to CPI)
    const inflFactor  = Math.pow(1 + this._inflationRate, year - this.year);
    const mlThreshold = Math.round(this._medicareLevy.lowerThreshold * inflFactor);
    // Phase-in ceiling: income where full-rate levy equals the phase-in levy
    const mlCeiling   = Math.round(
      this._medicareLevy.lowerThreshold
      * this._medicareLevy.phaseInRate
      / (this._medicareLevy.phaseInRate - this._medicareLevy.rate)
      * inflFactor
    );
    let medicareLevy;
    if (grossIncome <= mlThreshold) {
      medicareLevy = 0;
    } else if (grossIncome < mlCeiling) {
      medicareLevy = this._medicareLevy.phaseInRate * (grossIncome - mlThreshold);
    } else {
      medicareLevy = grossIncome * this._medicareLevy.rate;
    }

    // Medicare Levy Surcharge — additional 1–1.5% without private hospital cover
    // MLS thresholds are NOT regularly indexed by CPI
    let medicareLevySurcharge = 0;
    if (!hasPrivateHospitalCover && this._medicareLevySurcharge) {
      const mlsRate = this._medicareLevySurcharge
        .filter(t => grossIncome > t.min)
        .reduce((_acc, t) => t.rate, 0);
      medicareLevySurcharge = mlsRate > 0 ? grossIncome * mlsRate : 0;
    }

    // LITO (Low Income Tax Offset) — thresholds unchanged since FY2022-23
    let lito = 0;
    if (grossIncome <= 37500)       lito = 700;
    else if (grossIncome <= 45000)  lito = 700 - ((grossIncome - 37500) * 0.05);
    else if (grossIncome <= 66667)  lito = 325 - ((grossIncome - 45000) * 0.015);
    lito = Math.max(0, lito);

    const total = Math.max(0, tax - lito) + medicareLevy + medicareLevySurcharge;
    return {
      tax: total,
      incomeTax: Math.max(0, tax - lito),
      medicareLevy,
      medicareLevySurcharge,
      lito,
      effectiveRate: grossIncome > 0 ? total / grossIncome : 0,
      marginalRate,
      breakdown,
    };
  }

  // ── Capital gains tax ─────────────────────────────────────────────────────

  calcCapitalGainsTax(gain, income, context = {}) {
    // Australia: 50% CGT discount for assets held >12 months by residents
    const { year = this.year, holdingPeriodDays = 400, isResident = true } = context;
    const discount     = isResident && holdingPeriodDays >= 365 ? 0.5 : 1.0;
    const taxableGain  = gain * discount;
    const brackets     = this._inflateBrackets(this._brackets, this.year, year, this._inflationRate);
    const baseResult   = this._applyBrackets(income, brackets);
    const totalResult  = this._applyBrackets(income + taxableGain, brackets);
    const tax          = totalResult.tax - baseResult.tax;
    return {
      tax,
      effectiveRate: gain > 0 ? tax / gain : 0,
      discountApplied: discount < 1,
      taxableGain,
    };
  }

  // ── Brackets display ──────────────────────────────────────────────────────

  getBrackets(targetYear = this.year) {
    return this._inflateBrackets(this._brackets, this.year, targetYear, this._inflationRate)
      .map(b => ({ ...b, label: `${(b.rate * 100).toFixed(0)}%` }));
  }

  // ── AU-specific brokerage CGT ─────────────────────────────────────────────

  /**
   * Calculate the Australian-taxable capital gain on a brokerage withdrawal,
   * applying deemed-acquisition rules (s855-45 ITAA 1997 equivalent).
   *
   * When a person becomes an Australian tax resident, Australia resets the CGT
   * cost basis to the FMV on that date (moveValueBasis). Only gains accrued
   * AFTER becoming resident are subject to Australian CGT.
   *
   * @param {number} withdrawal           - Amount being withdrawn
   * @param {number} preWithdrawalBalance - Account balance just before this withdrawal
   * @param {number|null} moveValueBasis  - FMV on AU residency date (null = use costBasis)
   * @param {number} costBasis            - Original US purchase cost basis (fallback)
   * @returns {{ auTaxableGain: number, auBasis: number, note: string }}
   */
  calcBrokerageAUGain(withdrawal, preWithdrawalBalance, moveValueBasis, costBasis) {
    const auBasis       = (moveValueBasis != null && moveValueBasis > 0) ? moveValueBasis : (costBasis || 0);
    const totalAUGain   = Math.max(0, preWithdrawalBalance - auBasis);
    const fraction      = preWithdrawalBalance > 0 ? withdrawal / preWithdrawalBalance : 0;
    const auTaxableGain = totalAUGain * fraction;
    const note = moveValueBasis != null
      ? `AU gain above move-date FMV (${auBasis.toFixed(0)})`
      : `AU gain above original cost basis (no move-date value recorded)`;
    return { auTaxableGain: Math.max(0, auTaxableGain), auBasis, note };
  }
}
