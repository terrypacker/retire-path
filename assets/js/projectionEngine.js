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

class ProjectionEngine {
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

    const years = [];
    let accountBalances  = this._initAccountBalances(s);
    let propertyValues   = this._initPropertyValues(s);
    let brokerageValues  = this._initBrokerageValues(s);

    for (let year = startYear; year <= endYear; year++) {
      const yd = this._projectYear(year, s, accountBalances, propertyValues, brokerageValues);
      years.push(yd);

      // Carry forward
      accountBalances  = yd._nextAccountBalances;
      propertyValues   = yd._nextPropertyValues;
      brokerageValues  = yd._nextBrokerageValues;
    }

    //this._state.set('projectionYears', years);
    return years;
  }

  // ── Initializers ─────────────────────────────────────────────────────────
  _initAccountBalances(s) {
    const b = {};
    s.accounts.forEach(a => { b[a.id] = a.balance; });
    return b;
  }
  _initPropertyValues(s) {
    const v = {};
    s.properties.forEach(p => { v[p.id] = { value: p.currentValue, mortgage: p.mortgageBalance }; });
    return v;
  }
  _initBrokerageValues(s) {
    const v = {};
    s.brokerageAccounts.forEach(b => { v[b.id] = { balance: b.balance, costBasis: b.costBasis || 0 }; });
    return v;
  }

  // ── Per-year projection ───────────────────────────────────────────────────
  _projectYear(year, s, accBalances, propValues, brokValues) {
    const people      = s.people;
    const moveYear    = s.moveToAustraliaYear;
    const moveEnabled = s.moveEnabled;
    const taxBaseYear = s.taxBaseYear || 2024;
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
    const inflFactor   = isPostMove
      ? Math.pow(1 + inflAUS, yearsSinceStart)
      : Math.pow(1 + inflUS,  yearsSinceStart);
    const annualExpenses = baseExpenses * expenseRatio * inflFactor;

    // Mortgage payments (property)
    let mortgageTotal = 0;
    s.properties.forEach(p => {
      if (propValues[p.id] && propValues[p.id].mortgage > 0 && (!p.plannedSaleYear || year < p.plannedSaleYear)) {
        mortgageTotal += (p.monthlyMortgage || 0) * 12;
      }
    });

    // ── Income ───────────────────────────────────────────────────────────────
    // Per-person income tracking (for AU individual tax assessment)
    const personIncome = {};
    people.forEach(p => { personIncome[p.id] = { employment: 0, ss: 0, withdrawals: 0 }; });

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
        const ssAmount = this._taxes.get('US').calcSocialSecurity(p, year);
        socialSecurityTotal += ssAmount;
        personIncome[p.id].ss = ssAmount;
      }
    });

    // Account withdrawals (needed to cover expenses gap)
    const incomeBeforeWithdrawals = employmentIncome + socialSecurityTotal;
    const expenseGap = Math.max(0, annualExpenses + mortgageTotal - incomeBeforeWithdrawals);

    // ── Account growth & contributions ────────────────────────────────────────
    const nextAccBalances = { ...accBalances };
    let totalAccountContributions = 0;
    let totalAccountWithdrawals   = 0;
    let withdrawalGapRemaining    = expenseGap;
    let brokerageAUCGTTotal       = 0;

    s.accounts.forEach(acc => {
      let bal = accBalances[acc.id] || 0;
      const ownerIdx  = people.findIndex(p => p.id === acc.ownerId);
      const owner     = people[ownerIdx];
      const ownerAge  = owner ? year - owner.birthYear : 65;
      const isRetired = ownerIdx >= 0 ? retiredFlags[ownerIdx] : allRetired;
      const isAlive   = owner ? year <= owner.birthYear + owner.lifeExpectancy : anyAlive;

      if (!isAlive) {
        nextAccBalances[acc.id] = bal;
        return;
      }

      // Growth
      const growthRate = (acc.growthRate || 7.0) / 100;
      bal = bal * (1 + growthRate);

      // Contributions (working only)
      if (!isRetired) {
        const contrib = (acc.annualContribution || 0) + (acc.employerMatch || 0);
        bal += contrib;
        totalAccountContributions += contrib;
      }

      // Withdrawals to cover gap
      const canWithdraw = ownerAge >= (acc.withdrawalStartAge || 59.5);
      if (isRetired && canWithdraw && withdrawalGapRemaining > 0 && bal > 0) {
        // Tax treatment
        const treatCtx  = { age: ownerAge, year, taxBaseYear, moveValueBasis: acc.moveValueBasis || null };
        const treatment = isPostMove
          ? this._taxes.get('AUS').accountTreatment(acc.type, 'withdrawal', withdrawalGapRemaining, treatCtx)
          : this._taxes.get('US').accountTreatment(acc.type, 'withdrawal', withdrawalGapRemaining, treatCtx);
        const withdrawal = Math.min(bal, withdrawalGapRemaining);
        bal -= withdrawal;
        withdrawalGapRemaining -= withdrawal;
        totalAccountWithdrawals += withdrawal;
        if (acc.ownerId && personIncome[acc.ownerId] !== undefined) {
          personIncome[acc.ownerId].withdrawals += withdrawal;
        }
      }

      nextAccBalances[acc.id] = Math.max(0, bal);
    });

    // ── Property appreciation & equity ────────────────────────────────────────
    const nextPropValues = {};
    let totalPropertyEquity = 0;
    let totalPropertyValue  = 0;
    let propertySaleIncome  = 0;

    s.properties.forEach(prop => {
      let { value, mortgage } = propValues[prop.id] || { value: prop.currentValue, mortgage: prop.mortgageBalance };
      const appRate = (prop.appreciationRate || 3.5) / 100;

      // Check if sold this year
      if (prop.plannedSaleYear && year === prop.plannedSaleYear) {
        const gain = Math.max(0, value - (prop.costBasis || value * 0.6));
        const cgt  = this._taxes.get('US').calcCapitalGainsTax(gain, employmentIncome, { year, holdingPeriodDays: 1000, taxBaseYear });
        const netProceeds = value - mortgage - cgt.tax;
        propertySaleIncome += netProceeds;
        nextPropValues[prop.id] = { value: 0, mortgage: 0 };
        return;
      }

      value    = value * (1 + appRate);
      mortgage = Math.max(0, mortgage - (prop.monthlyMortgage || 0) * 12 * 0.5); // rough principal reduction
      const equity = Math.max(0, value - mortgage);
      totalPropertyEquity += equity;
      totalPropertyValue  += value;
      nextPropValues[prop.id] = { value, mortgage };
    });

    // ── Brokerage growth & contributions ──────────────────────────────────────
    const nextBrokValues = {};
    let totalBrokerageValue = 0;

    s.brokerageAccounts.forEach(brok => {
      let { balance, costBasis } = brokValues[brok.id] || { balance: brok.balance, costBasis: brok.costBasis || 0 };
      const growthRate = (brok.growthRate || 7.0) / 100;
      const gain = balance * growthRate;
      balance += gain;
      costBasis += 0; // cost basis doesn't grow

      if (!allRetired) {
        const contrib = brok.annualContribution || 0;
        balance   += contrib;
        costBasis += contrib;
        totalAccountContributions += contrib;
      }

      // Drawdown from brokerage if still a gap
      if (allRetired && withdrawalGapRemaining > 0 && balance > 0) {
        const preWithdrawalBalance   = balance;
        const preWithdrawalCostBasis = costBasis;
        const withdrawal    = Math.min(balance, withdrawalGapRemaining);
        const gainFraction  = preWithdrawalBalance > 0 ? (preWithdrawalBalance - preWithdrawalCostBasis) / preWithdrawalBalance : 0;
        const gainWithdrawn = withdrawal * Math.max(0, gainFraction);  // eslint-disable-line no-unused-vars
        costBasis -= withdrawal * (1 - Math.max(0, gainFraction));
        balance   -= withdrawal;
        withdrawalGapRemaining -= withdrawal;
        totalAccountWithdrawals += withdrawal;

        // Post-move: AU CGT on gains accrued after becoming Australian resident
        if (isPostMove) {
          const auMod = this._taxes.get('AUS');
          const { auTaxableGain } = auMod.calcBrokerageAUGain(
            withdrawal, preWithdrawalBalance, brok.moveValueBasis || null, preWithdrawalCostBasis
          );
          if (auTaxableGain > 0) {
            brokerageAUCGTTotal += auMod.calcCapitalGainsTax(
              auTaxableGain,
              employmentIncome + socialSecurityTotal,
              { year, holdingPeriodDays: 400, isResident: true, taxBaseYear }
            ).tax;
          }
        }
      }

      totalBrokerageValue += balance;
      nextBrokValues[brok.id] = { balance: Math.max(0, balance), costBasis: Math.max(0, costBasis) };
    });

    // ── Tax estimate ──────────────────────────────────────────────────────────
    const totalIncome = employmentIncome + socialSecurityTotal + totalAccountWithdrawals + propertySaleIncome;
    let estimatedTax  = 0;

    // US tax always applies — US citizens are taxed on worldwide income
    if (totalIncome > 0) {
      const usResult = this._taxes.get('US').calcIncomeTax(totalIncome, {
        year, filingStatus: 'mfj', isRetired: allRetired, taxBaseYear,
      });
      estimatedTax += usResult.tax;
    }

    // Post-move: AU income tax assessed per person (Australia taxes individuals separately).
    // Each person's AU taxable income = their employment income + their account withdrawals.
    // (US Social Security has treaty/FITO treatment; kept out of AU base for simplicity.)
    // FITO (Foreign Income Tax Offset): AU liability reduced by US tax already paid, simplified 1:1.
    // Note: AU module expects AUD; amounts here are USD. The FITO offset partially corrects for this.
    if (isPostMove) {
      const auMod = this._taxes.get('AUS');
      let auIncomeTaxTotal = 0;
      people.forEach(p => {
        if (year > p.birthYear + p.lifeExpectancy) return;
        const pIncome = personIncome[p.id];
        const personAUIncome = pIncome.employment + pIncome.withdrawals;
        if (personAUIncome > 0) {
          auIncomeTaxTotal += auMod.calcIncomeTax(personAUIncome, { year, isResident: true, taxBaseYear }).tax;
        }
      });
      // Apportion the US tax already estimated against the AU-taxable income fraction
      const auTaxableTotal = employmentIncome + totalAccountWithdrawals;
      const usTaxOnAUIncome = totalIncome > 0
        ? estimatedTax * (auTaxableTotal / totalIncome)
        : 0;
      const auNetIncomeTax = Math.max(0, auIncomeTaxTotal - usTaxOnAUIncome);
      estimatedTax += auNetIncomeTax + brokerageAUCGTTotal;
    }

    // ── Net worth ─────────────────────────────────────────────────────────────
    const totalAccountValue = Object.values(nextAccBalances).reduce((a, b) => a + b, 0);
    const netWorth = totalAccountValue + totalPropertyEquity + totalBrokerageValue;

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
      milestones: this._getMilestones(year, s, people, retiredFlags),

      // Carry-forward (internal)
      _nextAccountBalances: nextAccBalances,
      _nextPropertyValues:  nextPropValues,
      _nextBrokerageValues: nextBrokValues,
    };
  }

  _getMilestones(year, s, people, retiredFlags) {
    const m = [];
    people.forEach((p, i) => {
      const age = year - p.birthYear;
      if (retiredFlags[i] && year === p.birthYear + p.retirementAge) m.push(`${p.name} retires (age ${age})`);
      if (year === p.birthYear + p.socialSecurityAge) m.push(`${p.name} Social Security starts`);
      if (s.moveEnabled && year === s.moveToAustraliaYear) m.push('🇦🇺 Move to Australia');
    });
    return m;
  }

  _emptyYear(year, accBalances, propValues, brokValues) {
    return {
      year, isRetired: true, anyRetired: true, isPostMove: false, country: 'US',
      employmentIncome: 0, socialSecurityTotal: 0, accountWithdrawals: 0, propertySaleIncome: 0, totalIncome: 0,
      annualExpenses: 0, mortgageTotal: 0, estimatedTax: 0, totalOutflows: 0, netCashFlow: 0,
      totalAccountValue: 0, totalPropertyEquity: 0, totalPropertyValue: 0, totalBrokerageValue: 0, netWorth: 0,
      milestones: [],
      _nextAccountBalances: accBalances,
      _nextPropertyValues:  propValues,
      _nextBrokerageValues: brokValues,
    };
  }
}
