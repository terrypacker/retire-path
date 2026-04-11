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
 * AustraliaTaxModule.js
 * Australian income tax, capital gains, Medicare Levy, and super treatment.
 */

import { BaseTaxModule } from './BaseTaxModule.js';

export class AustraliaTaxModule extends BaseTaxModule {
  constructor() {
    super('AUS');
    // Published bracket data keyed by tax year (calendar year = FY starting Jul of that year)
    this._rateData = {
      2024: {
        // FY2024-25 — Stage 3 tax cut rates (ATO)
        brackets: [
          { min: 0,       max: 18200,   rate: 0.00 },
          { min: 18200,   max: 45000,   rate: 0.19 },
          { min: 45000,   max: 120000,  rate: 0.325 },
          { min: 120000,  max: 180000,  rate: 0.37 },
          { min: 180000,  max: Infinity, rate: 0.45 },
        ],
        // Medicare Levy: 2% with phase-in for low incomes (ATO FY2024-25)
        // Below lowerThreshold: no levy; phase-in zone (10% of excess) up to ceiling (~$32,500)
        medicareLevy: { rate: 0.02, lowerThreshold: 26000, phaseInRate: 0.10 },
        // Medicare Levy Surcharge: applies to those WITHOUT private hospital cover
        // Rate is applied to entire taxable income once threshold is crossed
        medicareLevySurcharge: [
          { min: 93000,  rate: 0.010 },
          { min: 108000, rate: 0.0125 },
          { min: 144000, rate: 0.015 },
        ],
      },
      2025: {
        // FY2025-26 — lower 30% bracket extended to $135k (2025 Federal Budget)
        brackets: [
          { min: 0,       max: 18200,   rate: 0.00 },
          { min: 18200,   max: 45000,   rate: 0.19 },
          { min: 45000,   max: 135000,  rate: 0.30 },
          { min: 135000,  max: 190000,  rate: 0.37 },
          { min: 190000,  max: Infinity, rate: 0.45 },
        ],
        // Medicare Levy threshold unchanged from FY2024-25
        medicareLevy: { rate: 0.02, lowerThreshold: 26000, phaseInRate: 0.10 },
        // MLS thresholds unchanged from FY2024-25
        medicareLevySurcharge: [
          { min: 93000,  rate: 0.010 },
          { min: 108000, rate: 0.0125 },
          { min: 144000, rate: 0.015 },
        ],
      },
    };
    this._superTaxRate = 0.15; // within-fund contributions tax
    this._superWithdrawalTaxUnder60 = 0.20; // simplified
  }

  /**
   * Returns the rate data for the closest available year <= taxBaseYear.
   * @param {number} taxBaseYear
   * @returns {{ data: object, year: number }}
   */
  _getRateData(taxBaseYear) {
    const years = Object.keys(this._rateData).map(Number).sort((a, b) => b - a);
    const bestYear = years.find(y => y <= taxBaseYear) || years[years.length - 1];
    return { data: this._rateData[bestYear], year: bestYear };
  }

  /** @returns {number[]} Sorted list of years with published bracket data */
  getAvailableYears() {
    return Object.keys(this._rateData).map(Number).sort((a, b) => a - b);
  }

  _inflateBrackets(brackets, baseYear, targetYear, inflationRate = 0.03) {
    const years = targetYear - baseYear;
    const factor = Math.pow(1 + inflationRate, years);
    return brackets.map(b => ({
      min: b.min === 0 ? 0 : Math.round(b.min * factor),
      max: b.max === Infinity ? Infinity : Math.round(b.max * factor),
      rate: b.rate,
    }));
  }

  _applyBrackets(income, brackets) {
    let tax = 0;
    let marginalRate = 0;
    const breakdown = [];
    for (const b of brackets) {
      if (income <= b.min) break;
      const taxable = Math.min(income, b.max) - b.min;
      const t = taxable * b.rate;
      tax += t;
      marginalRate = b.rate;
      if (t > 0) breakdown.push({ range: `${b.min}–${b.max === Infinity ? '∞' : b.max}`, rate: b.rate, tax: t });
    }
    return { tax, marginalRate, breakdown };
  }

  calcIncomeTax(grossIncome, context = {}) {
    const { year = 2024, isResident = true, taxBaseYear = 2024, hasPrivateHospitalCover = false } = context;
    const { data, year: baseYear } = this._getRateData(taxBaseYear);
    const brackets = this._inflateBrackets(data.brackets, baseYear, year);
    const { tax, marginalRate, breakdown } = this._applyBrackets(grossIncome, brackets);

    // Medicare Levy — 2% with phase-in for low incomes
    // Thresholds are inflated at 3% p.a. beyond the base year (ATO indexes these to CPI)
    const mlData = data.medicareLevy || { rate: 0.02, lowerThreshold: 26000, phaseInRate: 0.10 };
    const inflFactor = Math.pow(1.03, year - baseYear);
    const mlThreshold = Math.round(mlData.lowerThreshold * inflFactor);
    // Phase-in ceiling: income at which full levy equals phase-in levy
    // ceiling = lowerThreshold * phaseInRate / (phaseInRate - rate)
    const mlCeiling = Math.round(mlData.lowerThreshold * mlData.phaseInRate / (mlData.phaseInRate - mlData.rate) * inflFactor);
    let medicareLevy;
    if (grossIncome <= mlThreshold) {
      medicareLevy = 0;
    } else if (grossIncome < mlCeiling) {
      medicareLevy = mlData.phaseInRate * (grossIncome - mlThreshold);
    } else {
      medicareLevy = grossIncome * mlData.rate;
    }

    // Medicare Levy Surcharge — additional 1–1.5% for those WITHOUT private hospital cover
    // MLS thresholds are NOT regularly indexed; applied to total income at the highest bracket rate
    let medicareLevySurcharge = 0;
    if (!hasPrivateHospitalCover && data.medicareLevySurcharge) {
      const mlsRate = data.medicareLevySurcharge
        .filter(t => grossIncome > t.min)
        .reduce((_acc, t) => t.rate, 0);
      medicareLevySurcharge = mlsRate > 0 ? grossIncome * mlsRate : 0;
    }

    // LITO (Low Income Tax Offset) — simplified, thresholds unchanged since FY2022-23
    let lito = 0;
    if (grossIncome <= 37500) lito = 700;
    else if (grossIncome <= 45000) lito = 700 - ((grossIncome - 37500) * 0.05);
    else if (grossIncome <= 66667) lito = 325 - ((grossIncome - 45000) * 0.015);
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

  calcCapitalGainsTax(gain, income, context = {}) {
    // Australia: 50% CGT discount for assets held >12 months (residents)
    const { holdingPeriodDays = 400, isResident = true, year = 2024, taxBaseYear = 2024 } = context;
    const { data, year: baseYear } = this._getRateData(taxBaseYear);
    const discount = isResident && holdingPeriodDays >= 365 ? 0.5 : 1.0;
    const taxableGain = gain * discount;
    const brackets = this._inflateBrackets(data.brackets, baseYear, year);
    // Marginal rate on gain stacked on top of income
    const baseResult = this._applyBrackets(income, brackets);
    const totalResult = this._applyBrackets(income + taxableGain, brackets);
    const tax = totalResult.tax - baseResult.tax;
    return {
      tax,
      effectiveRate: gain > 0 ? tax / gain : 0,
      discountApplied: discount < 1,
      taxableGain,
    };
  }

  accountTreatment(accountType, eventType, amount, context = {}) {
    const age = context.age || 60;
    if (accountType === 'super') {
      if (eventType === 'contribution') {
        return { taxableAmount: amount * this._superTaxRate, note: '15% contributions tax in fund' };
      }
      if (eventType === 'growth') {
        return { taxableAmount: amount * 0.15, note: '15% earnings tax in accumulation phase' };
      }
      if (eventType === 'withdrawal') {
        if (age >= 60) return { taxableAmount: 0, note: 'Tax-free super withdrawal (age 60+)' };
        return { taxableAmount: amount * this._superWithdrawalTaxUnder60, note: '20% tax + Medicare (under 60)' };
      }
    }
    // US retirement accounts held post-move — treated as foreign pension income in AU.
    // Stub: 100% of withdrawal is AU-taxable as foreign income.
    // Future: apply proportional Article 18 (US-AU Tax Treaty) exemption using context.moveValueBasis
    // to distinguish pre-move growth (potentially exempt) from post-move growth (taxable).
    if (accountType === '401k' || accountType === 'ira') {
      if (eventType === 'contribution') return { taxableAmount: 0, note: 'Pre-tax (no AU event at contribution)' };
      if (eventType === 'growth')       return { taxableAmount: 0, note: 'Tax-deferred growth (no AU event)' };
      if (eventType === 'withdrawal') {
        const note = context.moveValueBasis != null
          ? '100% taxable as foreign income (Article 18 treaty exemption not yet modelled)'
          : '100% taxable as foreign income (no move-date basis set)';
        return { taxableAmount: amount, note };
      }
    }
    if (accountType === 'roth') {
      if (eventType === 'contribution') return { taxableAmount: 0, note: 'After-tax (no AU event at contribution)' };
      if (eventType === 'growth')       return { taxableAmount: 0, note: 'Tax-free growth (no AU event)' };
      if (eventType === 'withdrawal')
        return { taxableAmount: amount, note: 'Taxable as foreign income in AU (Roth has no AU equivalent)' };
    }
    // Franking credits on AU dividends — simplified: 30% credit on dividends
    if (accountType === 'brokerage' && eventType === 'withdrawal') {
      return { taxableAmount: amount, note: 'CGT 50% discount may apply', frankingCredit: amount * 0.043 };
    }
    return { taxableAmount: amount, note: '' };
  }

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
    const auBasis     = (moveValueBasis != null && moveValueBasis > 0) ? moveValueBasis : (costBasis || 0);
    const totalAUGain = Math.max(0, preWithdrawalBalance - auBasis);
    const fraction    = preWithdrawalBalance > 0 ? withdrawal / preWithdrawalBalance : 0;
    const auTaxableGain = totalAUGain * fraction;
    const note = moveValueBasis != null
      ? `AU gain above move-date FMV (${auBasis.toFixed(0)})`
      : `AU gain above original cost basis (no move-date value recorded)`;
    return { auTaxableGain: Math.max(0, auTaxableGain), auBasis, note };
  }

  getBrackets(year = 2024, taxBaseYear = null) {
    const { data, year: baseYear } = this._getRateData(taxBaseYear !== null ? taxBaseYear : year);
    return this._inflateBrackets(data.brackets, baseYear, year).map(b => ({
      ...b,
      label: `${(b.rate * 100).toFixed(0)}%`,
    }));
  }
}
