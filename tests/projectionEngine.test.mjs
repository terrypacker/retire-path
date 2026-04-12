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

test('SS income: FICA is not charged on Social Security distributions', () => {
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
