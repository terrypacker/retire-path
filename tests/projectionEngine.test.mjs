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
