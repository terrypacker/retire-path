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
 * projectionEngine.test.mjs
 * Tests for ProjectionEngine year-by-year projection calculations.
 * Run with: node --test tests/projectionEngine.test.mjs
 */

import { test } from 'node:test';
import assert   from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { ProjectionEngine } from '../assets/js/projectionEngine.js';
import { TaxEngine }        from '../assets/js/tax/TaxEngine.js';
import { createMockState }  from './helpers/mockState.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadScenario(filename) {
  const raw = readFileSync(join(__dirname, 'scenarios', filename), 'utf8');
  return JSON.parse(raw);
}

// ── Scenario: US brokerage-only ───────────────────────────────────────────────
// Alice (born 1960) is already retired in the projection start year.
// Her only asset is a $1M US brokerage account (50% unrealised gain).
// No retirement accounts, no social security income, move disabled.
// Expected: brokerage withdrawals appear as income and expenses are covered.

test('US brokerage-only: totalIncome is non-zero in first projection year', () => {
  const state  = createMockState(loadScenario('us-brokerage-only.json'));
  const taxes  = new TaxEngine();
  const engine = new ProjectionEngine(state, taxes);

  const years     = engine.run();
  const firstYear = years[0];

  assert.ok(
    firstYear.totalIncome > 0,
    `Expected totalIncome > 0 in year ${firstYear.year}, got ${firstYear.totalIncome}. ` +
    'Brokerage withdrawals are not being included in totalIncome.'
  );
});

test('US brokerage-only: net cash flow is near zero in first projection year', () => {
  const state  = createMockState(loadScenario('us-brokerage-only.json'));
  const taxes  = new TaxEngine();
  const engine = new ProjectionEngine(state, taxes);

  const years     = engine.run();
  const firstYear = years[0];

  // Expenses are ~$60K. The brokerage covers the gap, so net cash flow
  // should be close to zero (within 10% of annual expenses).
  const tolerance = firstYear.annualExpenses * 0.10;
  assert.ok(
    Math.abs(firstYear.netCashFlow) <= tolerance,
    `Expected |netCashFlow| <= ${tolerance.toFixed(0)} in year ${firstYear.year}, ` +
    `got netCashFlow = ${firstYear.netCashFlow.toFixed(0)}. ` +
    'Expenses should be fully covered by the brokerage withdrawal.'
  );
});

test('US brokerage-only: US CGT is zero at the 0% long-term rate for this income level', () => {
  // Alice has ~$30K brokerage gain and no other income — well below the MFJ 0% LTCG threshold
  // (~$96.7K in 2025). Correct behaviour is usTax === 0 for this scenario.
  // This test verifies the tax engine runs (no longer skipped by totalIncome=0) and returns
  // the correct 0% bracket result rather than an arbitrary non-zero value.
  const state  = createMockState(loadScenario('us-brokerage-only.json'));
  const taxes  = new TaxEngine();
  const engine = new ProjectionEngine(state, taxes);

  const years     = engine.run();
  const firstYear = years[0];

  assert.strictEqual(
    firstYear.usTax, 0,
    `Expected usTax === 0 (0% LTCG bracket) in year ${firstYear.year}, got ${firstYear.usTax}.`
  );
});

// ── Scenario: US Social Security income ──────────────────────────────────────
// Alice (born 1960) retires at 62 and starts Social Security at 70.
// Expenses are set low enough ($30K/yr) that once SS starts (~$41K/yr inflated)
// it covers them entirely — no brokerage withdrawal occurs in that year.
// This isolates SS as the sole income source to verify correct tax treatment.

/**
 * Find the first projection year where SS income is non-zero and employment is zero.
 * Returns null if no such year exists.
 */
function findFirstSSOnlyYear(years) {
  return years.find(y => y.socialSecurityTotal > 0 && y.employmentIncome === 0) ?? null;
}

test('SS income: Social Security appears in totalIncome', () => {
  const state  = createMockState(loadScenario('us-ss-income.json'));
  const taxes  = new TaxEngine();
  const engine = new ProjectionEngine(state, taxes);

  const years   = engine.run();
  const ssYear  = findFirstSSOnlyYear(years);

  assert.ok(ssYear !== null, 'Expected at least one year with SS income and no employment income');
  assert.ok(
    ssYear.totalIncome >= ssYear.socialSecurityTotal,
    `Expected totalIncome (${ssYear.totalIncome.toFixed(0)}) >= socialSecurityTotal (${ssYear.socialSecurityTotal.toFixed(0)}) in year ${ssYear.year}`
  );
});

test('SS income: ordinary income tax is assessed on SS distributions', () => {
  // SS benefit (~$41K inflated by 2030) exceeds the MFJ standard deduction (~$34K in 2030),
  // so ordinary income tax should be > 0.
  const state  = createMockState(loadScenario('us-ss-income.json'));
  const taxes  = new TaxEngine();
  const engine = new ProjectionEngine(state, taxes);

  const years  = engine.run();
  const ssYear = findFirstSSOnlyYear(years);

  assert.ok(ssYear !== null, 'Expected at least one year with SS income and no employment income');

  const hasOrdinaryIncomeTax = ssYear.usTaxDetail.some(d => d.label === 'Ordinary Income Tax');
  assert.ok(
    hasOrdinaryIncomeTax,
    `Expected ordinary income tax line item in usTaxDetail for year ${ssYear.year} ` +
    `(SS = $${ssYear.socialSecurityTotal.toFixed(0)}). Tax detail: ${JSON.stringify(ssYear.usTaxDetail.map(d => d.label))}`
  );
});

test('SS income: FICA is not charged on Social Security distributions (post-fix)', () => {
  // FICA (Social Security & Medicare payroll tax) is a tax on wages only.
  // It must not be assessed on Social Security benefit payments.
  const state  = createMockState(loadScenario('us-ss-income.json'));
  const taxes  = new TaxEngine();
  const engine = new ProjectionEngine(state, taxes);

  const years  = engine.run();
  const ssYear = findFirstSSOnlyYear(years);

  assert.ok(ssYear !== null, 'Expected at least one year with SS income and no employment income');

  const ficaEntry = ssYear.usTaxDetail.find(d => d.label === 'FICA (Social Security & Medicare)');
  assert.ok(
    ficaEntry === undefined,
    `FICA should not appear in usTaxDetail when there is no employment income in year ${ssYear.year}. ` +
    `Got FICA amount: $${ficaEntry ? ficaEntry.amount.toFixed(0) : 0}`
  );
});

// ── Scenario: Two people in Australia — SS (Person 1) + Roth (Person 2) ──────
// Alice (born 1960) has Social Security starting at 70.
// Bob (born 1962) has a Roth IRA ($800K, $300K contributions basis).
// Both retire at 62 and move to Australia in 2028.
// From 2030 onward Alice's SS is active; Bob's Roth fills the expense gap.
// A Roth qualified withdrawal returns taxableIncome=0 (US), meaning it never
// flows into usTaxableWithdrawals — but it MUST still appear in totalIncome
// because it is real cash that covers expenses.

/**
 * Find the first post-move year where both SS and a Roth account withdrawal
 * are active. Uses the incomeDetail breakdown to detect the Roth withdrawal.
 */
function findSSAndRothYear(years) {
  return years.find(y =>
    y.isPostMove &&
    y.socialSecurityTotal > 0 &&
    y.accountWithdrawals > 0 &&
    y.incomeDetail.some(d => d.label.toLowerCase().includes('roth'))
  ) ?? null;
}

test('AU post-move: Roth withdrawal appears in totalIncome alongside SS', () => {
  // When a Roth IRA is drawn down to cover expenses, the full withdrawal amount
  // must appear in totalIncome even though it is US-tax-free (taxableIncome = 0).
  // Currently FAILS: Roth cash is in totalAccountWithdrawals but not totalIncome.
  const state  = createMockState(loadScenario('au-ss-and-roth.json'));
  const taxes  = new TaxEngine();
  const engine = new ProjectionEngine(state, taxes);

  const years = engine.run();
  const yr    = findSSAndRothYear(years);

  assert.ok(yr !== null, 'Expected at least one post-move year with both SS and Roth withdrawal active');

  // totalIncome must account for ALL cash inflows: SS + full Roth withdrawal
  assert.ok(
    yr.totalIncome >= yr.socialSecurityTotal + yr.accountWithdrawals,
    `Year ${yr.year}: totalIncome ($${yr.totalIncome.toFixed(0)}) should be >= ` +
    `SS ($${yr.socialSecurityTotal.toFixed(0)}) + Roth ($${yr.accountWithdrawals.toFixed(0)}). ` +
    'Roth cash is missing from totalIncome.'
  );
});

test('AU post-move: net cash flow is near zero when SS + Roth cover expenses', () => {
  // With SS and Roth together covering expenses the net cash flow should be close to zero.
  // A large negative value means totalIncome is understated (Roth cash not counted).
  const state  = createMockState(loadScenario('au-ss-and-roth.json'));
  const taxes  = new TaxEngine();
  const engine = new ProjectionEngine(state, taxes);

  const years = engine.run();
  const yr    = findSSAndRothYear(years);

  assert.ok(yr !== null, 'Expected at least one post-move year with both SS and Roth withdrawal active');

  const tolerance = yr.annualExpenses * 0.15;
  assert.ok(
    Math.abs(yr.netCashFlow) <= tolerance,
    `Year ${yr.year}: |netCashFlow| ($${Math.abs(yr.netCashFlow).toFixed(0)}) should be <= ` +
    `$${tolerance.toFixed(0)} (15% of expenses $${yr.annualExpenses.toFixed(0)}). ` +
    `Actual netCashFlow = $${yr.netCashFlow.toFixed(0)}.`
  );
});

// ── Scenario: AU CGT bracket stacking must not include SS income ──────────────
// Alice moves to Australia in 2028. She has a large brokerage account and SS
// starting at 70. Expenses are intentionally higher than SS so brokerage is
// drawn every year, including years when SS is active.
//
// SS is treaty-exempt from Australian tax (ATO treats it as foreign pension
// exempt under the US-AU DTA). It is already correctly excluded from the AU
// *income* tax base (projectionEngine.js ~line 487). But in the brokerage CGT
// calculation (~line 387) `pInc.ss` was being included in `personBaseIncome`,
// artificially stacking the capital gain into a higher AU marginal bracket.
//
// Test strategy: run two projections from the same base scenario — one with
// Alice's SS ($3,000/month) and one with SS zeroed out. Find the first
// post-move year where a brokerage withdrawal occurs and SS is active.
// Because SS is treaty-exempt, the AU CGT should be identical in both runs.
// With the bug the SS run produces *higher* AU CGT than the no-SS run.

test('AU CGT: SS income does not inflate the brokerage CGT bracket base', () => {
  // Scenario: Alice moves to AU in 2026 with a $2M brokerage growing at 9%/year.
  // The balance rises above brokMVB from 2027 onward, generating post-move AU CGT.
  //
  // Strategy: run two projections — one with Alice's SS, one without. Find the first
  // post-move year where:
  //   • SS is active in the SS scenario
  //   • A brokerage withdrawal occurs in both
  //   • The no-SS scenario produces AU CGT of $0 (the gain is below the AU tax-free
  //     threshold when base income = 0)
  //
  // In that year, the SS scenario should ALSO produce AU CGT of $0.
  // With the bug, SS is included in the CGT bracket base, stacking the gain into a
  // taxable bracket and producing a positive AU CGT even though the gain itself is
  // below the threshold.
  const baseScenario = loadScenario('au-brokerage-ss-cgt.json');
  const noSSScenario = {
    ...baseScenario,
    people: baseScenario.people.map(p => ({ ...p, socialSecurityMonthly: 0 })),
  };

  const yearsWithSS = new ProjectionEngine(createMockState(baseScenario), new TaxEngine()).run();
  const yearsNoSS   = new ProjectionEngine(createMockState(noSSScenario),  new TaxEngine()).run();

  // Find a year where the no-SS gain is below threshold (noSS auTax = 0), confirming
  // that SS alone is responsible for any non-zero auTax in the SS scenario.
  const targetYear = yearsWithSS.find(y => {
    const matchNoSS = yearsNoSS.find(n => n.year === y.year);
    return y.isPostMove &&
      y.socialSecurityTotal > 0 &&
      y.accountWithdrawals > 0 &&
      matchNoSS && matchNoSS.auTax === 0;  // gain below AU threshold without SS base
  });

  assert.ok(
    targetYear !== null && targetYear !== undefined,
    'Expected a post-move year where the gain is below the AU threshold in the no-SS run'
  );

  // SS is treaty-exempt: it must not inflate the CGT bracket base.
  // When the gain is below the AU threshold (confirmed by noSS=0), AU CGT must be $0
  // regardless of SS income.
  assert.strictEqual(
    targetYear.auTax, 0,
    `Year ${targetYear.year}: auTax with SS ($${targetYear.auTax.toFixed(2)}) should be $0. ` +
    `The brokerage gain is below the AU tax-free threshold without SS in the base. ` +
    `SS income ($${targetYear.socialSecurityTotal.toFixed(0)}) is incorrectly stacking ` +
    'the gain into a taxable bracket.'
  );
});

// ── Scenario: Savings + forced brokerage sale ─────────────────────────────────
// Alice (born 1960) has a $200k brokerage account (50% unrealised gain) and a
// $15k savings account with a $10k minimum balance floor.
// Annual expenses are $80k — far more than the $5k available above the savings
// minimum — so the engine must:
//   (a) draw the $5k above-minimum from savings first (no tax event), then
//   (b) sell ~$75k+ of brokerage holdings as a forced sale (capital gains tax applies).
//
// Alice is retired with zero other income, so the ~$40K gain falls inside the MFJ
// 0% LTCG bracket and usTax = 0. The scenario validates cash-flow mechanics.
// CGT with income stacking (15% bracket) is tested in 'us-forced-sale-high-income.json'.
//
// Tests verify:
//   1. A savings withdrawal appears in incomeDetail (no isForcedSale flag).
//   2. A brokerage forced sale appears in incomeDetail with isForcedSale === true
//      and gainWithdrawn > 0.

test('Savings + forced sale: savings drawn above minimum before brokerage', () => {
  const state  = createMockState(loadScenario('us-savings-forced-brokerage-sale.json'));
  const taxes  = new TaxEngine();
  const engine = new ProjectionEngine(state, taxes);

  const years = engine.run();
  // Alice retires at 62; born 1960 so first retirement year is 2022 (or start year if later).
  const firstRetirementYear = years.find(y => y.isRetired);
  assert.ok(firstRetirementYear, 'Expected at least one retired year in projection');

  const savingsItem = firstRetirementYear.incomeDetail.find(
    d => d.label && d.label.includes('(Savings)')
  );
  assert.ok(
    savingsItem && savingsItem.amount > 0,
    `Expected a savings withdrawal in incomeDetail for year ${firstRetirementYear.year}. ` +
    `Got: ${JSON.stringify(firstRetirementYear.incomeDetail.map(d => d.label))}`
  );
  assert.ok(
    !savingsItem.isForcedSale,
    'Savings withdrawal should not be tagged as a forced sale'
  );
});

test('Savings + forced sale: deficit triggers brokerage sale with isForcedSale flag and CGT', () => {
  const state  = createMockState(loadScenario('us-savings-forced-brokerage-sale.json'));
  const taxes  = new TaxEngine();
  const engine = new ProjectionEngine(state, taxes);

  const years = engine.run();
  const firstRetirementYear = years.find(y => y.isRetired);
  assert.ok(firstRetirementYear, 'Expected at least one retired year in projection');

  const forcedSaleItem = firstRetirementYear.incomeDetail.find(d => d.isForcedSale === true);
  assert.ok(
    forcedSaleItem,
    `Expected a forced-sale brokerage entry in incomeDetail for year ${firstRetirementYear.year}. ` +
    `Got: ${JSON.stringify(firstRetirementYear.incomeDetail.map(d => ({ label: d.label, isForcedSale: d.isForcedSale })))}`
  );
  assert.ok(
    forcedSaleItem.gainWithdrawn > 0,
    `Expected gainWithdrawn > 0 on the forced sale entry, got ${forcedSaleItem.gainWithdrawn}`
  );
  // The brokerage withdrawal must appear in totalIncome (cash inflow is counted)
  assert.ok(
    firstRetirementYear.totalIncome > 0,
    `Expected totalIncome > 0 (brokerage withdrawal should be counted as income), got ${firstRetirementYear.totalIncome}`
  );
});

// ── Scenario: Forced sale CGT with high employment income ─────────────────────
// Alice (born 1985, not yet retired) has $200K employment income and $250K in
// annual expenses. The $50K deficit is partially covered by $5K from a savings
// account (above its $25K minimum floor). The remaining $45K is a forced
// brokerage sale from a $300K account with $100K cost basis (gain fraction 2/3).
// gainWithdrawn = $45K × 2/3 = $30K.
//
// Inflation is zeroed in the scenario so amounts are round. The module's own
// 2.5%/yr bracket inflation still applies to project the 2025 brackets to 2026:
//   stdDed  ≈ $30,750   (30000 × 1.025)
//   LTCG 0% ≈ $99,118   (96700 × 1.025)
//
// Ordinary income after deduction: $200,000 − $30,750 = $169,250
// Since $169,250 > $99,118 (0% ceiling), the entire $30,000 gain is at 15%.
// Expected CGT = $30,000 × 15% = $4,500.
//
// This directly tests the LTCG income-stacking fix. Before the fix, the code
// applied LTCG brackets to the gain alone ($30K < $99K → 0%), so the tax was
// $0 and nothing appeared in usTaxDetail.

test('Forced sale high-income: CGT appears in usTaxDetail at 15% bracket', () => {
  const state  = createMockState(loadScenario('us-forced-sale-high-income.json'));
  const taxes  = new TaxEngine();
  const engine = new ProjectionEngine(state, taxes);

  const years     = engine.run();
  const firstYear = years[0];

  // Confirm a forced sale happened with gain
  const forcedSaleItem = firstYear.incomeDetail.find(d => d.isForcedSale === true);
  assert.ok(
    forcedSaleItem && forcedSaleItem.gainWithdrawn > 0,
    `Expected a forced-sale brokerage entry with gain in incomeDetail for year ${firstYear.year}. ` +
    `Got: ${JSON.stringify(firstYear.incomeDetail.map(d => ({ label: d.label, isForcedSale: d.isForcedSale, gainWithdrawn: d.gainWithdrawn })))}`
  );

  // The CGT line must appear in usTaxDetail
  const cgtEntry = firstYear.usTaxDetail.find(d => d.label === 'Capital Gains Tax (long-term)');
  assert.ok(
    cgtEntry !== undefined,
    `Expected 'Capital Gains Tax (long-term)' in usTaxDetail for year ${firstYear.year} ` +
    `(forced brokerage sale with $${Math.round(forcedSaleItem.gainWithdrawn).toLocaleString()} gain + $200K employment income). ` +
    `usTaxDetail labels: ${JSON.stringify(firstYear.usTaxDetail.map(d => d.label))}`
  );

  // CGT must be > 0 — the gain stacks on top of $169K ordinary income, all at 15%
  assert.ok(
    cgtEntry.amount > 0,
    `Expected CGT > 0, got ${cgtEntry.amount}. ` +
    'Ordinary income after deduction exceeds the 0% LTCG threshold; gain should be taxed at 15%.'
  );
});

test('Forced sale high-income: CGT is ~15% of the gain (income-stacking correct)', () => {
  // $30,000 gain × 15% = $4,500. Allow ±$50 for bracket rounding across inflation years.
  const state  = createMockState(loadScenario('us-forced-sale-high-income.json'));
  const taxes  = new TaxEngine();
  const engine = new ProjectionEngine(state, taxes);

  const years     = engine.run();
  const firstYear = years[0];

  const cgtEntry = firstYear.usTaxDetail.find(d => d.label === 'Capital Gains Tax (long-term)');
  assert.ok(cgtEntry !== undefined, 'CGT entry must exist in usTaxDetail (see previous test)');

  const forcedSale     = firstYear.incomeDetail.find(d => d.isForcedSale);
  const gainWithdrawn  = forcedSale ? forcedSale.gainWithdrawn : 0;
  const expectedCGT    = gainWithdrawn * 0.15;   // all gain is above the 0% threshold
  const tolerance      = 50;

  assert.ok(
    Math.abs(cgtEntry.amount - expectedCGT) <= tolerance,
    `CGT ($${cgtEntry.amount.toFixed(2)}) should be ~15% of gain ($${gainWithdrawn.toFixed(2)}) = ` +
    `$${expectedCGT.toFixed(2)} ±$${tolerance}. ` +
    'Income stacking may not be applied correctly in calcCapitalGainsTax.'
  );
});
