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
 * projectionEngine.js
 * Year-by-year Monte-Carlo-free deterministic retirement projection.
 * Reads from appState, writes projection results back.
 */

import { AssetFactory } from './assets/AssetFactory.js';

export class ProjectionEngine {
  constructor(state, taxes) {
    this._state = state;
    this._taxes = taxes;
  }

  /**
   * Run the full projection from current year to max life expectancy.
   * Returns array of YearData objects.
   */
  run() {
    const s = this._state.getAll();
    const startYear = new Date().getFullYear();
    const endYear   = this._state.getLatestLifeExpectancyYear();

    // Wrap POJOs with class instances once; the engine's carry-forward maps
    // hold the evolving balances — the instances themselves are stateless.
    const retirementAccts = s.accounts.map(a          => AssetFactory.wrapRetirementAccount(a));
    const brokerageAccts  = s.brokerageAccounts.map(b => AssetFactory.wrapBrokerageAccount(b));
    const propertyAssets  = s.properties.map(p        => AssetFactory.wrapAsset(p));

    const years = [];
    let accountBalances = this._initAccountBalances(retirementAccts);
    let propertyValues  = this._initPropertyValues(propertyAssets);
    let brokerageValues = this._initBrokerageValues(brokerageAccts);

    let ftcCarryForward = 0;  // USD excess FTC from prior year
    for (let year = startYear; year <= endYear; year++) {
      const yd = this._projectYear(
        year, s,
        retirementAccts, brokerageAccts, propertyAssets,
        accountBalances, propertyValues, brokerageValues,
        ftcCarryForward
      );
      years.push(yd);

      // Carry forward
      accountBalances = yd._nextAccountBalances;
      propertyValues  = yd._nextPropertyValues;
      brokerageValues = yd._nextBrokerageValues;
      ftcCarryForward = yd._nextFtcCarryForward || 0;
    }

    return years;
  }

  // ── Initializers ─────────────────────────────────────────────────────────

  _initAccountBalances(retirementAccts) {
    const b = {};
    retirementAccts.forEach(a => {
      b[a.id] = {
        balance:        a.balance,
        contributions:  a.contributions || 0,  // after-tax contributions to date (corpus)
        moveValueBasis: null,                   // computed automatically on move year
      };
    });
    return b;
  }

  _initPropertyValues(propertyAssets) {
    const v = {};
    propertyAssets.forEach(p => { v[p.id] = p.getInitialState(); });
    return v;
  }

  _initBrokerageValues(brokerageAccts) {
    const v = {};
    brokerageAccts.forEach(b => {
      v[b.id] = {
        balance:        b.balance,
        costBasis:      b.costBasis || 0,
        moveValueBasis: null,  // computed automatically on move year
      };
    });
    return v;
  }

  // ── Per-year projection ───────────────────────────────────────────────────

  _projectYear(year, s, retirementAccts, brokerageAccts, propertyAssets, accBalances, propValues, brokValues, ftcCarryForward = 0) {
    const people      = s.people;
    const moveYear    = s.moveToAustraliaYear;
    const moveEnabled = s.moveEnabled;
    const isPreMoveUS = !moveEnabled || year < moveYear;
    const isPostMove  = moveEnabled && year >= moveYear;

    // Inflation rates
    const inflUS  = s.inflationUS  / 100;
    const inflAUS = s.inflationAUS / 100;
    const yearsSinceStart = year - new Date().getFullYear();

    // Are both people retired?
    const retiredFlags = people.map(p => year >= p.birthYear + p.retirementAge);
    const anyRetired   = retiredFlags.some(Boolean);
    const allRetired   = retiredFlags.every(Boolean);
    const anyAlive     = people.some(p => year <= p.birthYear + p.lifeExpectancy);

    if (!anyAlive) {
      return this._emptyYear(year, accBalances, propValues, brokValues);
    }

    // ── Expenses ─────────────────────────────────────────────────────────────
    const baseExpenses = s.currentAnnualExpenses;
    const expenseRatio = allRetired ? s.retirementExpenseRatio : 1.0;
    const currentYear  = new Date().getFullYear();

    let annualExpenses;
    if (!moveEnabled || year < moveYear) {
      annualExpenses = baseExpenses * expenseRatio
        * Math.pow(1 + inflUS, yearsSinceStart);
    } else {
      const yearsTilMove   = moveYear - currentYear;
      const yearsAfterMove = year - moveYear;
      const auRatio        = s.australiaExpenseRatio ?? 1.0;
      annualExpenses = baseExpenses * expenseRatio * auRatio
        * Math.pow(1 + inflUS,  yearsTilMove)
        * Math.pow(1 + inflAUS, yearsAfterMove);
    }

    // Mortgage payments (property)
    let mortgageTotal = 0;
    const mortgageDetails = [];
    propertyAssets.forEach(prop => {
      const pv = propValues[prop.id];
      if (pv && prop.hasActiveMortgage(year, pv.mortgage)) {
        const mAmt = prop.getAnnualMortgagePayment();
        mortgageTotal += mAmt;
        if (mAmt > 0) mortgageDetails.push({ label: `${prop.name} — Mortgage`, amount: mAmt });
      }
    });

    // ── Income ───────────────────────────────────────────────────────────────
    // Per-person income tracking (for AU individual tax assessment)
    const personIncome = {};
    people.forEach(p => { personIncome[p.id] = { employment: 0, ss: 0, withdrawals: 0, withdrawalSources: [] }; });

    // Employment income (pre-retirement) — sum each working person's individual income
    let employmentIncome = 0;
    if (!allRetired) {
      const inflFactor = Math.pow(1 + inflUS, yearsSinceStart);
      people.forEach((p, i) => {
        if (!retiredFlags[i] && year <= p.birthYear + p.lifeExpectancy) {
          const personEmployment = (p.annualIncome || 0) * inflFactor;
          employmentIncome += personEmployment;
          personIncome[p.id].employment = personEmployment;
        }
      });
    }

    // Social Security
    let socialSecurityTotal = 0;
    people.forEach(p => {
      if (year <= p.birthYear + p.lifeExpectancy) {
        const ssAmount = this._taxes.get('US', year).calcSocialSecurity(p, year);
        socialSecurityTotal += ssAmount;
        personIncome[p.id].ss = ssAmount;
      }
    });

    // Account withdrawals (needed to cover expenses gap)
    const incomeBeforeWithdrawals = employmentIncome + socialSecurityTotal;
    const expenseGap = Math.max(0, annualExpenses + mortgageTotal - incomeBeforeWithdrawals);

    // ── Retirement account growth & contributions ─────────────────────────────
    const nextAccBalances = {};
    let totalAccountContributions  = 0;
    let totalAccountWithdrawals    = 0;
    let usTaxableWithdrawals       = 0;   // US ordinary-income portion of withdrawals
    let usTotalPenalty             = 0;   // 10% early-withdrawal penalty (IRS, separate from income tax)
    let withdrawalGapRemaining     = expenseGap;
    let brokerageAUCGTTotalAUD     = 0;  // AU CGT in AUD (AU brackets applied to AUD amounts)
    let brokerageGainWithdrawn     = 0;
    let totalBrokerageWithdrawals  = 0;  // full brokerage cash out (basis + gain) for cash-flow tracking
    const accountWithdrawalDetails   = [];
    const brokerageWithdrawalDetails = [];
    const usPenaltyDetails           = [];  // line items for US tax detail
    const rothPostMoveDetails        = [];  // AU tax notes for Roth corpus/gains breakdown
    const usTaxableWithdrawalSources = [];  // per-account US taxable withdrawal amounts (for tax detail drilldown)
    let auNonResWithdrawalsUSD       = 0;   // AU-source account withdrawals pre-move (non-resident AU tax)
    let auNonResGainWithdrawnUSD     = 0;   // Gains from AU-country brokerages pre-move (non-resident AU CGT)
    const auNonResWithdrawalSources  = [];

    retirementAccts.forEach(acc => {
      const accData = accBalances[acc.id] || { balance: 0, contributions: 0, moveValueBasis: null };
      let bal           = accData.balance;
      let contributions = accData.contributions;
      let moveValueBasis = accData.moveValueBasis;

      const ownerIdx  = people.findIndex(p => p.id === acc.ownerId);
      const owner     = people[ownerIdx];
      const ownerAge  = owner ? year - owner.birthYear : 65;
      const isRetired = ownerIdx >= 0 ? retiredFlags[ownerIdx] : allRetired;
      const isAlive   = owner ? year <= owner.birthYear + owner.lifeExpectancy : anyAlive;

      if (!isAlive) {
        nextAccBalances[acc.id] = { balance: bal, contributions, moveValueBasis };
        return;
      }

      // Growth
      bal = acc.applyGrowth(bal);

      // Auto-compute move-date value: capture balance (after growth) in the first move year
      if (moveEnabled && year === moveYear && moveValueBasis === null) {
        moveValueBasis = bal;
      }

      // Contributions (working only) — also increases the contributions basis
      if (!isRetired) {
        const contrib = acc.getContribution();
        bal = acc.applyContributions(bal);
        contributions += contrib;
        totalAccountContributions += contrib;
      }

      // Withdrawals to cover gap
      if (isRetired && acc.canWithdraw(ownerAge) && withdrawalGapRemaining > 0 && bal > 0) {
        const preWithdrawalBal = bal;
        const withdrawal = Math.min(bal, withdrawalGapRemaining);
        const treatCtx = { age: ownerAge, year, moveValueBasis, contributions, balance: preWithdrawalBal };

        // Always compute US treatment — US citizens are taxed on worldwide income.
        const usTreatment = acc.getUSAccountTreatment('withdrawal', withdrawal, treatCtx);
        usTaxableWithdrawals += usTreatment.taxableIncome;
        if (usTreatment.taxableIncome > 0) {
          usTaxableWithdrawalSources.push({ label: acc.getDisplayLabel(), amount: usTreatment.taxableIncome });
        }
        if (usTreatment.penaltyAmount > 0) {
          usTotalPenalty += usTreatment.penaltyAmount;
          usPenaltyDetails.push({
            label: `${acc.getDisplayLabel()} — Early Withdrawal Penalty (10%)`,
            amount: usTreatment.penaltyAmount,
            note: usTreatment.note,
          });
        }

        // Post-move: also compute AU treatment (AU taxes residents on worldwide income).
        if (isPostMove && acc.ownerId && personIncome[acc.ownerId] !== undefined) {
          const auTreatment = acc.getAUAccountTreatment('withdrawal', withdrawal, treatCtx);
          personIncome[acc.ownerId].withdrawals += auTreatment.taxableIncome;
          if (auTreatment.taxableIncome > 0) {
            personIncome[acc.ownerId].withdrawalSources.push({ label: acc.getDisplayLabel(), amount: auTreatment.taxableIncome });
          }
          if (auTreatment.note) {
            rothPostMoveDetails.push({ label: `${acc.getDisplayLabel()} withdrawal`, amount: withdrawal, note: auTreatment.note });
          }
        }

        // Pre-move: AU-country accounts are taxable by Australia as non-resident source income.
        if (!isPostMove && acc.country === 'AUS') {
          const auTreatment = acc.getAUAccountTreatment('withdrawal', withdrawal, treatCtx);
          if (auTreatment.taxableIncome > 0) {
            auNonResWithdrawalsUSD += auTreatment.taxableIncome;
            auNonResWithdrawalSources.push({ label: acc.getDisplayLabel(), amount: auTreatment.taxableIncome });
          }
        }

        bal -= withdrawal;

        // Pro-rata reduce the contributions basis as funds are withdrawn
        contributions = preWithdrawalBal > 0 ? contributions * (bal / preWithdrawalBal) : 0;

        withdrawalGapRemaining -= withdrawal;
        totalAccountWithdrawals += withdrawal;
        accountWithdrawalDetails.push({ label: acc.getDisplayLabel(), amount: withdrawal, depositedTo: 'Expense Pool' });
      }

      nextAccBalances[acc.id] = { balance: Math.max(0, bal), contributions: Math.max(0, contributions), moveValueBasis };
    });

    // ── Property appreciation & equity ────────────────────────────────────────
    const nextPropValues = {};
    const pendingDeposits = {}; // property sale proceeds keyed by destination account/brokerage ID
    let totalPropertyEquity = 0;
    let totalPropertyValue  = 0;
    let propertySaleIncome  = 0;
    const propertySaleDetails = [];

    propertyAssets.forEach(prop => {
      let { value, mortgage } = propValues[prop.id] || prop.getInitialState();

      // Check if sold this year
      if (prop.isSoldThisYear(year)) {
        const gain = Math.max(0, value - (prop.costBasis || value * 0.6));
        const cgt  = this._taxes.get('US', year).calcCapitalGainsTax(gain, employmentIncome, { year, holdingPeriodDays: 1000 });
        const netProceeds = value - mortgage - cgt.tax;
        propertySaleIncome += netProceeds;
        nextPropValues[prop.id] = { value: 0, mortgage: 0 };
        // Route net proceeds into the chosen destination account (brokerage or retirement)
        const destId = prop.saleDestinationId ||
          (brokerageAccts.length > 0   ? brokerageAccts[0].id   : null) ||
          (retirementAccts.length > 0  ? retirementAccts[0].id  : null);
        if (destId) {
          pendingDeposits[destId] = (pendingDeposits[destId] || 0) + netProceeds;
        }
        const destAcct    = [...brokerageAccts, ...retirementAccts].find(a => a.id === destId);
        const depositedTo = destAcct ? destAcct.name : (destId ? 'Account' : '—');
        propertySaleDetails.push({ label: `${prop.name} (Sale)`, amount: netProceeds, grossValue: value, mortgagePaid: mortgage, cgt: cgt.tax, depositedTo });
        return;
      }

      value    = prop.applyAppreciation(value);
      mortgage = prop.applyMortgageReduction(mortgage);
      const equity = prop.getEquity(value, mortgage);
      totalPropertyEquity += equity;
      totalPropertyValue  += value;
      nextPropValues[prop.id] = { value, mortgage };
    });

    // ── Brokerage growth & contributions ──────────────────────────────────────
    const nextBrokValues = {};
    let totalBrokerageValue = 0;

    brokerageAccts.forEach(brok => {
      let { balance, costBasis, moveValueBasis: brokMVB } =
        brokValues[brok.id] || { balance: brok.balance, costBasis: brok.costBasis || 0, moveValueBasis: null };

      // Growth
      balance = brok.applyGrowth(balance);

      // Auto-compute move-date value for brokerage (after growth in the first move year)
      if (moveEnabled && year === moveYear && brokMVB === null) {
        brokMVB = balance;
      }

      if (!allRetired) {
        const contrib = brok.getContribution();
        ({ balance, costBasis } = brok.applyContributions(balance, costBasis));
        totalAccountContributions += contrib;
      }

      // Drawdown from brokerage if still a gap
      if (allRetired && withdrawalGapRemaining > 0 && balance > 0) {
        const preWithdrawalBalance   = balance;
        const preWithdrawalCostBasis = costBasis;
        const { withdrawal, gainWithdrawn, newBalance, newCostBasis } =
          brok.calculateWithdrawal(balance, costBasis, withdrawalGapRemaining);
        balance   = newBalance;
        costBasis = newCostBasis;
        brokerageGainWithdrawn    += gainWithdrawn;
        totalBrokerageWithdrawals += withdrawal;
        withdrawalGapRemaining -= withdrawal;
        totalAccountWithdrawals += withdrawal;
        brokerageWithdrawalDetails.push({ label: brok.getDisplayLabel(), amount: withdrawal, gainWithdrawn, depositedTo: 'Expense Pool' });

        // Post-move: AU CGT on gains accrued after becoming Australian resident.
        // Split gain by ownership and compute each owner's CGT at their own marginal rate.
        // Gains are converted to AUD before applying AU brackets; result accumulates in AUD.
        if (isPostMove) {
          const fxRate = s.fxRate || 1.58;
          const auMod = this._taxes.get('AUS', year);
          const { auTaxableGain } = auMod.calcBrokerageAUGain(
            withdrawal, preWithdrawalBalance, brokMVB, preWithdrawalCostBasis
          );
          if (auTaxableGain > 0) {
            const ownerShares = brok.getOwnershipShares(people);
            ownerShares.forEach(({ personId, pct }) => {
              const personGain = auTaxableGain * pct;
              if (personGain <= 0) return;
              const pInc = personIncome[personId] || { employment: 0, ss: 0, withdrawals: 0 };
              const personBaseIncome = pInc.employment + pInc.ss + pInc.withdrawals;
              // Convert USD amounts to AUD so AU brackets are applied correctly
              brokerageAUCGTTotalAUD += auMod.calcCapitalGainsTax(
                personGain * fxRate,
                personBaseIncome * fxRate,
                { year, holdingPeriodDays: 400, isResident: true }
              ).tax;
            });
          }
        }

        // Pre-move: AU-country brokerage gains are AU-source income taxable by Australia as non-resident.
        if (!isPostMove && brok.country === 'AUS' && gainWithdrawn > 0) {
          auNonResGainWithdrawnUSD += gainWithdrawn;
        }
      }

      totalBrokerageValue += balance;
      nextBrokValues[brok.id] = { balance: Math.max(0, balance), costBasis: Math.max(0, costBasis), moveValueBasis: brokMVB };
    });

    // ── Deposit property sale proceeds into destination accounts ──────────────
    // Proceeds are deposited after all withdrawal logic so they carry forward as assets.
    Object.entries(pendingDeposits).forEach(([destId, amount]) => {
      if (nextBrokValues[destId] !== undefined) {
        // Brokerage destination: add to balance and cost basis (no embedded gain on fresh cash)
        nextBrokValues[destId].balance   += amount;
        nextBrokValues[destId].costBasis += amount;
        totalBrokerageValue += amount;
      } else if (nextAccBalances[destId] !== undefined) {
        // Retirement account destination: add to balance only (sale proceeds are not contributions basis)
        nextAccBalances[destId].balance += amount;
      }
    });

    // ── Tax estimate ──────────────────────────────────────────────────────────
    // ordinaryTaxableIncome: income subject to ordinary US brackets (excludes brokerage — gains are CGT, basis return is not taxed)
    const ordinaryTaxableIncome = employmentIncome + socialSecurityTotal + usTaxableWithdrawals + propertySaleIncome;
    // totalIncome: full cash inflows including brokerage basis returns (used for cash-flow / net-worth calculations)
    const totalIncome = ordinaryTaxableIncome + totalBrokerageWithdrawals;
    let usTax = 0;
    let auTax = 0;
    const fxRate = s.fxRate || 1.58;  // 1 USD = fxRate AUD
    const usTaxDetail = [];
    const auTaxDetail = [];

    // US tax always applies — US citizens are taxed on worldwide income.
    // Brokerage long-term gains are taxed at preferential rates (0/15/20%), not ordinary rates.
    // For post-move years this is the GROSS US liability; Foreign Tax Credit is applied below.
    let usCGTResult = { tax: 0 };
    let grossUSTax = 0;
    if (ordinaryTaxableIncome > 0 || brokerageGainWithdrawn > 0) {
      const usResult = this._taxes.get('US', year).calcIncomeTax(ordinaryTaxableIncome, {
        year, filingStatus: 'mfj', isRetired: allRetired, wageIncome: employmentIncome,
      });
      grossUSTax = usResult.tax;
      if (brokerageGainWithdrawn > 0) {
        usCGTResult = this._taxes.get('US', year).calcCapitalGainsTax(
          brokerageGainWithdrawn, ordinaryTaxableIncome,
          { year, holdingPeriodDays: 400, isResident: true }
        );
        grossUSTax += usCGTResult.tax;
      }
      if (usTotalPenalty > 0) grossUSTax += usTotalPenalty;
      // Build US tax detail (gross amounts before FTC)
      if (usResult.incomeTax > 0) {
        const usSources = [];
        people.forEach(p => {
          if (personIncome[p.id].employment > 0) usSources.push({ label: `${p.name} — Employment Income`, amount: personIncome[p.id].employment });
          if (personIncome[p.id].ss > 0)         usSources.push({ label: `${p.name} — Social Security`, amount: personIncome[p.id].ss });
        });
        usTaxableWithdrawalSources.forEach(src => usSources.push(src));
        if (propertySaleIncome > 0) usSources.push({ label: 'Property Sale Proceeds', amount: propertySaleIncome });
        if (usSources.length > 0) {
          usSources.push({ label: 'Total Ordinary Income', amount: ordinaryTaxableIncome, isSummary: true });
          usSources.push({ label: 'Standard Deduction', amount: -usResult.stdDeduction, isSummary: true });
        }
        usTaxDetail.push({
          label: 'Ordinary Income Tax',
          amount: usResult.incomeTax,
          note: `std. deduction $${Math.round(usResult.stdDeduction / 1000)}K applied`,
          sources: usSources,
        });
      }
      if (usResult.ficaTax > 0) usTaxDetail.push({ label: 'FICA (Social Security & Medicare)', amount: usResult.ficaTax });
      if (usCGTResult.tax > 0) usTaxDetail.push({ label: 'Capital Gains Tax (long-term)', amount: usCGTResult.tax });
      usPenaltyDetails.forEach(d => usTaxDetail.push(d));
    }

    // Post-move: Australia taxes as country of residence on worldwide income.
    // Income is converted to AUD (× fxRate) before applying AU brackets; results are in AUD.
    // US then provides a Foreign Tax Credit (FTC) for the AU tax paid (converted back to USD).
    // Excess FTC (AU tax > US liability) carries forward to offset future US tax.
    // (US Social Security: treaty-exempt from AU; kept out of AU taxable base for simplicity.)
    let newFtcCarryForward = 0;
    if (isPostMove) {
      const auMod = this._taxes.get('AUS', year);
      let auIncomeTaxTotalAUD = 0;
      people.forEach(p => {
        if (year > p.birthYear + p.lifeExpectancy) return;
        const pIncome = personIncome[p.id];
        // Convert USD income to AUD for AU bracket calculation
        const personAUIncomeAUD = (pIncome.employment + pIncome.withdrawals) * fxRate;
        if (personAUIncomeAUD > 0) {
          const auResult = auMod.calcIncomeTax(personAUIncomeAUD, { year, isResident: true });
          auIncomeTaxTotalAUD += auResult.tax;
          // Per-person AU tax detail — amounts displayed as USD equivalent, AUD shown in notes
          const grossIncomeTaxAUD = auResult.incomeTax + auResult.lito;
          if (grossIncomeTaxAUD > 0) {
            const auPersonSources = [];
            if (pIncome.employment > 0) auPersonSources.push({ label: 'Employment Income', amount: pIncome.employment });
            pIncome.withdrawalSources.forEach(src => auPersonSources.push(src));
            if (auPersonSources.length > 0) auPersonSources.push({ label: 'Total AU Taxable Income', amount: pIncome.employment + pIncome.withdrawals, isSummary: true });
            auTaxDetail.push({
              label: `${p.name} — Income Tax`,
              amount: grossIncomeTaxAUD / fxRate,
              note: `A$${Math.round(grossIncomeTaxAUD).toLocaleString()} AUD`,
              sources: auPersonSources,
            });
          }
          if (auResult.lito > 0)         auTaxDetail.push({ label: `${p.name} — LITO Offset`, amount: auResult.lito / fxRate, isCredit: true, note: `A$${Math.round(auResult.lito).toLocaleString()} AUD` });
          if (auResult.medicareLevy > 0) auTaxDetail.push({ label: `${p.name} — Medicare Levy (2%)`, amount: auResult.medicareLevy / fxRate, note: `A$${Math.round(auResult.medicareLevy).toLocaleString()} AUD` });
          if (auResult.medicareLevySurcharge > 0) {
            const mlsRatePct = personAUIncomeAUD > 0 ? (auResult.medicareLevySurcharge / personAUIncomeAUD * 100).toFixed(2) : '';
            auTaxDetail.push({
              label: `${p.name} — Medicare Levy Surcharge (${mlsRatePct}%)`,
              amount: auResult.medicareLevySurcharge / fxRate,
              note: `no private hospital cover; A$${Math.round(auResult.medicareLevySurcharge).toLocaleString()} AUD`,
            });
          }
        }
      });
      if (brokerageAUCGTTotalAUD > 0) auTaxDetail.push({
        label: 'Brokerage CGT (post-move gains, 50% discount)',
        amount: brokerageAUCGTTotalAUD / fxRate,
        note: `A$${Math.round(brokerageAUCGTTotalAUD).toLocaleString()} AUD`,
      });
      rothPostMoveDetails.forEach(d => auTaxDetail.push(d));

      // Total AU tax paid (AUD) → USD equivalent is the full AU liability
      const auTotalTaxAUD = auIncomeTaxTotalAUD + brokerageAUCGTTotalAUD;
      auTax = auTotalTaxAUD / fxRate;

      // Foreign Tax Credit: AU taxes paid (USD equiv.) + prior-year carry-forward offset US liability.
      const ftcAvailable = auTax + ftcCarryForward;
      const ftcApplied   = Math.min(ftcAvailable, grossUSTax);
      usTax = Math.max(0, grossUSTax - ftcApplied);
      newFtcCarryForward = Math.max(0, ftcAvailable - grossUSTax);

      // Show FTC credit in US tax detail
      if (ftcApplied > 0) {
        const ftcNote = `A$${Math.round(auTotalTaxAUD).toLocaleString()} AUD tax paid to Australia`
          + (ftcCarryForward > 0 ? ` + $${Math.round(ftcCarryForward).toLocaleString()} prior-year carry-forward` : '');
        usTaxDetail.push({
          label: 'Foreign Tax Credit (AU taxes paid)',
          amount: ftcApplied,
          isCredit: true,
          note: ftcNote,
        });
      }
      if (newFtcCarryForward > 0) {
        usTaxDetail.push({
          label: 'FTC Carry-Forward to Next Year',
          amount: newFtcCarryForward,
          note: 'AU tax exceeds US liability; credited against future US tax',
        });
      }
    } else if (auNonResGainWithdrawnUSD > 0 || auNonResWithdrawalsUSD > 0) {
      // Pre-move: Australia taxes non-residents on AU-source income (no tax-free threshold, no LITO,
      // no Medicare Levy, no 50% CGT discount). US provides FTC for the AU non-resident tax paid.
      const auMod = this._taxes.get('AUS', year);
      let auNonResTaxAUD = 0;

      // Non-resident income tax on AU-source account withdrawals
      if (auNonResWithdrawalsUSD > 0) {
        const incomeAUD  = auNonResWithdrawalsUSD * fxRate;
        const incResult  = auMod.calcIncomeTax(incomeAUD, { year, isResident: false });
        auNonResTaxAUD  += incResult.tax;
        if (incResult.tax > 0) {
          auTaxDetail.push({
            label:   'AU Income Tax (non-resident)',
            amount:  incResult.tax / fxRate,
            note:    `A$${Math.round(incResult.tax).toLocaleString()} AUD; 32.5% from $1, no tax-free threshold`,
            sources: auNonResWithdrawalSources.map(src => ({ ...src })),
          });
        }
      }

      // Non-resident CGT on AU-country brokerage gains (no 50% discount)
      if (auNonResGainWithdrawnUSD > 0) {
        const gainAUD    = auNonResGainWithdrawnUSD * fxRate;
        const baseIncAUD = auNonResWithdrawalsUSD * fxRate;
        const cgtResult  = auMod.calcCapitalGainsTax(gainAUD, baseIncAUD, {
          year, holdingPeriodDays: 400, isResident: false,
        });
        auNonResTaxAUD += cgtResult.tax;
        if (cgtResult.tax > 0) {
          auTaxDetail.push({
            label: 'AU Brokerage CGT (non-resident, no 50% discount)',
            amount: cgtResult.tax / fxRate,
            note:   `A$${Math.round(cgtResult.tax).toLocaleString()} AUD`,
          });
        }
      }

      auTax = auNonResTaxAUD / fxRate;

      // FTC: AU non-resident tax offsets US liability; excess carries forward
      const ftcAvailable = auTax + ftcCarryForward;
      const ftcApplied   = Math.min(ftcAvailable, grossUSTax);
      usTax = Math.max(0, grossUSTax - ftcApplied);
      newFtcCarryForward = Math.max(0, ftcAvailable - grossUSTax);

      if (ftcApplied > 0) {
        const ftcNote = `A$${Math.round(auNonResTaxAUD).toLocaleString()} AUD non-resident tax paid to Australia`
          + (ftcCarryForward > 0 ? ` + $${Math.round(ftcCarryForward).toLocaleString()} prior-year carry-forward` : '');
        usTaxDetail.push({
          label:    'Foreign Tax Credit (AU non-resident tax)',
          amount:   ftcApplied,
          isCredit: true,
          note:     ftcNote,
        });
      }
      if (newFtcCarryForward > 0) {
        usTaxDetail.push({
          label: 'FTC Carry-Forward to Next Year',
          amount: newFtcCarryForward,
          note:   'AU non-resident tax exceeds US liability; credited against future US tax',
        });
      }
    } else {
      usTax = grossUSTax;
    }

    const estimatedTax = usTax + auTax;

    // ── Net worth ─────────────────────────────────────────────────────────────
    const totalAccountValue = Object.values(nextAccBalances).reduce((a, obj) => a + (obj.balance || 0), 0);
    const netWorth = totalAccountValue + totalPropertyEquity + totalBrokerageValue;

    // ── Per-asset balance snapshot (for account balance chart) ────────────────
    const assetBalances = {};
    retirementAccts.forEach(acc => { assetBalances[acc.id] = (nextAccBalances[acc.id] || {}).balance || 0; });
    brokerageAccts.forEach(b => { assetBalances[b.id] = (nextBrokValues[b.id] || {}).balance || 0; });
    propertyAssets.forEach(prop => {
      const pv = nextPropValues[prop.id] || { value: 0, mortgage: 0 };
      assetBalances[prop.id] = prop.getEquity(pv.value, pv.mortgage);
    });

    // ── Cash flow detail (for drill-down modal) ───────────────────────────────
    const incomeDetail = [];
    people.forEach(p => {
      const pi = personIncome[p.id];
      if (pi.employment > 0) incomeDetail.push({ label: `${p.name} — Employment`, amount: pi.employment, depositedTo: 'Expense Pool' });
      if (pi.ss > 0)         incomeDetail.push({ label: `${p.name} — Social Security`, amount: pi.ss, depositedTo: 'Expense Pool' });
    });
    accountWithdrawalDetails.forEach(d  => incomeDetail.push(d));
    brokerageWithdrawalDetails.forEach(d => incomeDetail.push(d));
    propertySaleDetails.forEach(d       => incomeDetail.push(d));

    const outflowDetail = [];
    outflowDetail.push({ label: 'Living Expenses', amount: annualExpenses });
    mortgageDetails.forEach(d => outflowDetail.push(d));
    if (usTax > 0) outflowDetail.push({ label: '🇺🇸 US Tax', amount: usTax });
    if (auTax > 0) outflowDetail.push({ label: '🇦🇺 AU Tax', amount: auTax });

    // Funding sources for the outflow drill-down — shows which income/assets paid for outflows
    const outflowFundingSources = [];
    people.forEach(p => {
      const pi = personIncome[p.id];
      if (pi.employment > 0) outflowFundingSources.push({ label: `${p.name} — Employment`, amount: pi.employment });
      if (pi.ss > 0)         outflowFundingSources.push({ label: `${p.name} — Social Security`, amount: pi.ss });
    });
    accountWithdrawalDetails.forEach(d   => outflowFundingSources.push({ label: d.label, amount: d.amount }));
    brokerageWithdrawalDetails.forEach(d => outflowFundingSources.push({ label: d.label, amount: d.amount }));
    if (propertySaleIncome > 0) outflowFundingSources.push({ label: 'Property Sale Proceeds', amount: propertySaleIncome });

    // ── Net worth detail (for drill-down modal) ───────────────────────────────
    const netWorthDetail = [];
    retirementAccts.forEach(acc => {
      const bal     = (nextAccBalances[acc.id] || {}).balance || 0;
      const prevBal = (accBalances[acc.id]     || {}).balance || 0;
      if (bal > 0) netWorthDetail.push({
        label:   acc.name,
        amount:  bal,
        tag:     acc.type.toUpperCase(),
        country: acc.country,
        gain:    bal - prevBal,
      });
    });
    brokerageAccts.forEach(b => {
      const bv      = nextBrokValues[b.id] || { balance: 0, costBasis: 0 };
      const prevBal = (brokValues[b.id]    || { balance: 0 }).balance;
      if (bv.balance > 0) netWorthDetail.push({
        label:     b.name,
        amount:    bv.balance,
        tag:       'Brokerage',
        costBasis: bv.costBasis || 0,
        gain:      bv.balance - prevBal,
      });
    });
    propertyAssets.forEach(prop => {
      const pv         = nextPropValues[prop.id] || { value: 0, mortgage: 0 };
      const prevPv     = propValues[prop.id]     || { value: 0, mortgage: 0 };
      const equity     = prop.getEquity(pv.value, pv.mortgage);
      const prevEquity = prop.getEquity(prevPv.value, prevPv.mortgage);
      if (pv.value > 0) netWorthDetail.push({
        label:        prop.name,
        amount:       equity,
        tag:          'Property',
        propValue:    pv.value,
        propMortgage: pv.mortgage,
        gain:         equity - prevEquity,
      });
    });

    // ── Assemble year data ────────────────────────────────────────────────────
    return {
      year,
      isRetired:          allRetired,
      anyRetired,
      isPostMove:         isPostMove,
      country:            isPostMove ? 'AUS' : 'US',

      // Income
      employmentIncome,
      socialSecurityTotal,
      accountWithdrawals: totalAccountWithdrawals,
      propertySaleIncome,
      totalIncome,

      // Expenses
      annualExpenses,
      mortgageTotal,
      usTax,
      auTax,
      estimatedTax,
      totalOutflows:      annualExpenses + mortgageTotal + estimatedTax,

      // Net cash flow
      netCashFlow:        totalIncome - annualExpenses - mortgageTotal - estimatedTax,

      // Assets
      totalAccountValue,
      totalPropertyEquity,
      totalPropertyValue,
      totalBrokerageValue,
      netWorth,

      // Milestones
      milestones: this._getMilestones(year, s, people, retiredFlags, propertyAssets),

      // Cash flow detail (for drill-down modal)
      incomeDetail,
      outflowDetail,
      outflowFundingSources,
      usTaxDetail,
      auTaxDetail,
      netWorthDetail,

      // Per-asset balance snapshot (for account balance chart)
      assetBalances,

      // Carry-forward (internal)
      _nextAccountBalances: nextAccBalances,
      _nextPropertyValues:  nextPropValues,
      _nextBrokerageValues: nextBrokValues,
      _nextFtcCarryForward: newFtcCarryForward,
    };
  }

  _getMilestones(year, s, people, retiredFlags, propertyAssets) {
    const m = [];
    people.forEach((p, i) => {
      const age = year - p.birthYear;
      if (retiredFlags[i] && year === p.birthYear + p.retirementAge) m.push(`${p.name} retires (age ${age})`);
      if (year === p.birthYear + p.socialSecurityAge) m.push(`${p.name} Social Security starts`);
      if (year === p.birthYear + p.lifeExpectancy) m.push(`✝ ${p.name} passes (age ${p.lifeExpectancy})`);
    });
    if (s.moveEnabled && year === s.moveToAustraliaYear) m.push('🇦🇺 Move to Australia');
    propertyAssets.forEach(prop => {
      if (prop.isSoldThisYear(year)) m.push(`🏠 ${prop.name} sold`);
    });
    return m;
  }

  _emptyYear(year, accBalances, propValues, brokValues) {
    return {
      year, isRetired: true, anyRetired: true, isPostMove: false, country: 'US',
      employmentIncome: 0, socialSecurityTotal: 0, accountWithdrawals: 0, propertySaleIncome: 0, totalIncome: 0,
      annualExpenses: 0, mortgageTotal: 0, usTax: 0, auTax: 0, estimatedTax: 0, totalOutflows: 0, netCashFlow: 0,
      totalAccountValue: 0, totalPropertyEquity: 0, totalPropertyValue: 0, totalBrokerageValue: 0, netWorth: 0,
      milestones: [],
      incomeDetail: [],
      outflowDetail: [],
      outflowFundingSources: [],
      usTaxDetail: [],
      auTaxDetail: [],
      netWorthDetail: [],
      assetBalances: {},
      _nextAccountBalances: accBalances,
      _nextPropertyValues:  propValues,
      _nextBrokerageValues: brokValues,
      _nextFtcCarryForward: 0,
    };
  }
}
