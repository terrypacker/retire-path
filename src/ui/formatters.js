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
 * formatters.js
 * Pure number-formatting utilities for UI display.
 */

/**
 * Format a number as K/M shorthand with no currency symbol.
 * @param {number} n
 * @returns {string}
 */
export function fmtShort(n) {
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  if (Math.abs(n) >= 1_000)     return (n / 1_000).toFixed(0) + 'K';
  return n.toFixed(0);
}

/**
 * Create a currency formatter bound to the current AppState.
 *
 * @param {object} state              - AppState instance (getCurrencySymbol, toDisplayCurrency)
 * @param {object} [opts]
 * @param {number}  [opts.kDecimals=0]    Decimal places for K-range amounts
 * @param {boolean} [opts.absInput=false] Apply Math.abs to v before conversion (useful when
 *                                        values are already positive but may carry a sign)
 * @returns {function(v: number, colored?: boolean): string}
 *   The returned function accepts a value and an optional `colored` flag.
 *   When `colored` is true the output is wrapped in a <span class="pos|neg">.
 */
export function makeFmt(state, { kDecimals = 0, absInput = false } = {}) {
  const symbol = state.getCurrencySymbol();
  return (v, colored = false) => {
    const raw = absInput ? Math.abs(v) : v;
    const d   = state.toDisplayCurrency(raw);
    const abs = Math.abs(d);
    let str;
    if (abs >= 1_000_000) str = symbol + (d / 1_000_000).toFixed(2) + 'M';
    else if (abs >= 1_000) str = symbol + (d / 1_000).toFixed(kDecimals) + 'K';
    else str = symbol + d.toFixed(0);
    if (colored) {
      const cls = d >= 0 ? 'pos' : 'neg';
      return `<span class="${cls}">${str}</span>`;
    }
    return str;
  };
}
