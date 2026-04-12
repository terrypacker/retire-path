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
 * chartManager.js
 * Owns all Chart.js instances. Call update() when projection data changes.
 */

import { appState } from './appState.js';

export class ChartManager {
  constructor() {
    this._charts = {};
    this._milestonesByYear = null;
    this._eventAnnotations = {};
    Chart.defaults.color = '#8a94b0';
    Chart.defaults.font.family = "'IBM Plex Sans', sans-serif";
    Chart.defaults.font.size   = 11;
  }

  // ── Destroy & recreate a chart ────────────────────────────────────────────
  _make(id, config) {
    if (this._charts[id]) {
      this._charts[id].destroy();
    }
    const canvas = document.getElementById(id);
    if (!canvas) return null;
    const chart = new Chart(canvas.getContext('2d'), config);
    this._charts[id] = chart;
    return chart;
  }

  // ── Shared gradient helper ────────────────────────────────────────────────
  _gradient(ctx, color, alpha1 = 0.4, alpha2 = 0.0) {
    const gradient = ctx.createLinearGradient(0, 0, 0, 300);
    gradient.addColorStop(0, color.replace(')', `, ${alpha1})`).replace('rgb', 'rgba'));
    gradient.addColorStop(1, color.replace(')', `, ${alpha2})`).replace('rgb', 'rgba'));
    return gradient;
  }

  _gradientHex(ctx, hex, alpha1 = 0.4, alpha2 = 0.02) {
    const gradient = ctx.createLinearGradient(0, 0, 0, 280);
    gradient.addColorStop(0, hex + Math.round(alpha1 * 255).toString(16).padStart(2, '0'));
    gradient.addColorStop(1, hex + Math.round(alpha2 * 255).toString(16).padStart(2, '0'));
    return gradient;
  }

  _baseOptions(title = '') {
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        title: { display: false },
        annotation: { annotations: this._eventAnnotations },
        tooltip: {
          backgroundColor: '#1c2333',
          borderColor: '#2a3148',
          borderWidth: 1,
          titleColor: '#e8ecf4',
          bodyColor: '#8a94b0',
          padding: 12,
          callbacks: {
            label: (ctx) => {
              const symbol = appState.getCurrencySymbol();
              const val = appState.toDisplayCurrency(ctx.raw);
              return ` ${ctx.dataset.label}: ${symbol}${this._fmt(val)}`;
            },
            afterBody: this._afterBodyMilestones(),
          }
        }
      },
      scales: {
        x: {
          grid: { color: '#1e2438' },
          ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 10 },
        },
        y: {
          grid: { color: '#1e2438' },
          ticks: {
            callback: (v) => {
              const symbol = appState.getCurrencySymbol();
              return symbol + this._fmt(appState.toDisplayCurrency(v));
            }
          }
        }
      }
    };
  }

  _fmt(n) {
    if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (Math.abs(n) >= 1_000)     return (n / 1_000).toFixed(0) + 'K';
    return n.toFixed(0);
  }

  // ── Event annotation helpers ──────────────────────────────────────────────

  /** Build Chart.js annotation objects for each milestone year. */
  _buildEventAnnotations(years) {
    const annotations = {};
    years.forEach(yd => {
      if (!yd.milestones || yd.milestones.length === 0) return;
      // Pick color by priority: death > property sale > move > retirement/other
      let color = 'rgba(138,148,176,0.55)';
      if (yd.milestones.some(m => m.includes('✝')))    color = 'rgba(192,69,90,0.75)';
      else if (yd.milestones.some(m => m.includes('🏠'))) color = 'rgba(201,168,76,0.75)';
      else if (yd.milestones.some(m => m.includes('🇦🇺'))) color = 'rgba(58,143,160,0.75)';
      else if (yd.milestones.some(m => m.includes('retires'))) color = 'rgba(61,158,114,0.75)';

      annotations[`evt_${yd.year}`] = {
        type: 'line',
        xMin: String(yd.year),
        xMax: String(yd.year),
        borderColor: color,
        borderWidth: 1.5,
        borderDash: [5, 4],
      };
    });
    return annotations;
  }

  /** Returns an afterBody tooltip callback that appends milestone events for a given year. */
  _afterBodyMilestones() {
    return (items) => {
      if (!this._milestonesByYear) return [];
      const year = String(items[0]?.label);
      const events = this._milestonesByYear.get(year);
      if (events && events.length) return ['', ...events];
      return [];
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Net Worth Chart (stacked area)
  // ══════════════════════════════════════════════════════════════════════════
  renderNetWorth(years) {
    const canvas = document.getElementById('chart-networth');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const labels = years.map(y => String(y.year));
    const acctData   = years.map(y => y.totalAccountValue);
    const propData   = years.map(y => y.totalPropertyEquity);
    const brokData   = years.map(y => y.totalBrokerageValue);

    this._make('chart-networth', {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Retirement Accounts',
            data: acctData,
            fill: 'origin',
            backgroundColor: this._gradientHex(ctx, '#4a6fa5', 0.5, 0.05),
            borderColor: '#4a6fa5',
            borderWidth: 2,
            pointRadius: 0,
            tension: 0.4,
          },
          {
            label: 'Brokerage',
            data: brokData,
            fill: '-1',
            backgroundColor: this._gradientHex(ctx, '#3a8fa0', 0.4, 0.03),
            borderColor: '#3a8fa0',
            borderWidth: 2,
            pointRadius: 0,
            tension: 0.4,
          },
          {
            label: 'Property Equity',
            data: propData,
            fill: '-1',
            backgroundColor: this._gradientHex(ctx, '#c9a84c', 0.35, 0.02),
            borderColor: '#c9a84c',
            borderWidth: 2,
            pointRadius: 0,
            tension: 0.4,
          },
        ]
      },
      options: {
        ...this._baseOptions('Net Worth Over Time'),
        plugins: {
          ...this._baseOptions().plugins,
          tooltip: {
            ...this._baseOptions().plugins.tooltip,
            callbacks: {
              title: (items) => `Year ${items[0].label}`,
              label: (ctx) => {
                const symbol = appState.getCurrencySymbol();
                const val = appState.toDisplayCurrency(ctx.raw);
                return ` ${ctx.dataset.label}: ${symbol}${this._fmt(val)}`;
              },
              footer: (items) => {
                const totalUSD = items.reduce((s, i) => s + i.raw, 0);
                const symbol = appState.getCurrencySymbol();
                return `Total: ${symbol}${this._fmt(appState.toDisplayCurrency(totalUSD))}`;
              },
              afterBody: this._afterBodyMilestones(),
            }
          }
        },
        scales: {
          ...this._baseOptions().scales,
          y: { ...this._baseOptions().scales.y, stacked: false },
        }
      }
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Income vs Expenses (bar + line combo)
  // ══════════════════════════════════════════════════════════════════════════
  renderIncomeExpenses(years) {
    const canvas = document.getElementById('chart-income-expenses');
    if (!canvas) return;

    const labels   = years.map(y => String(y.year));
    const income   = years.map(y => y.totalIncome);
    const expenses = years.map(y => y.totalOutflows);
    const netFlow  = years.map(y => y.netCashFlow);

    this._make('chart-income-expenses', {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Total Income',
            data: income,
            backgroundColor: 'rgba(61,158,114,0.7)',
            borderColor: '#3d9e72',
            borderWidth: 1,
            borderRadius: 3,
            order: 2,
          },
          {
            label: 'Total Outflows',
            data: expenses,
            backgroundColor: 'rgba(192,69,90,0.6)',
            borderColor: '#c0455a',
            borderWidth: 1,
            borderRadius: 3,
            order: 2,
          },
          {
            label: 'Net Cash Flow',
            data: netFlow,
            type: 'line',
            borderColor: '#e4c76b',
            backgroundColor: 'transparent',
            borderWidth: 2,
            pointRadius: 0,
            tension: 0.4,
            order: 1,
          }
        ]
      },
      options: this._baseOptions('Income vs Expenses'),
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Income Sources (stacked area)
  // ══════════════════════════════════════════════════════════════════════════
  renderIncomeSources(years) {
    const canvas = document.getElementById('chart-income-sources');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const labels     = years.map(y => String(y.year));
    const employment = years.map(y => y.employmentIncome);
    const ss         = years.map(y => y.socialSecurityTotal);
    const withdrawals= years.map(y => y.accountWithdrawals);
    const propSale   = years.map(y => y.propertySaleIncome);

    this._make('chart-income-sources', {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Employment',
            data: employment,
            fill: 'origin',
            backgroundColor: this._gradientHex(ctx, '#4a6fa5', 0.6, 0.05),
            borderColor: '#4a6fa5',
            borderWidth: 1.5,
            pointRadius: 0,
            tension: 0.3,
          },
          {
            label: 'Social Security',
            data: ss,
            fill: '-1',
            backgroundColor: this._gradientHex(ctx, '#3d9e72', 0.5, 0.03),
            borderColor: '#3d9e72',
            borderWidth: 1.5,
            pointRadius: 0,
            tension: 0.3,
          },
          {
            label: 'Account Withdrawals',
            data: withdrawals,
            fill: '-1',
            backgroundColor: this._gradientHex(ctx, '#c0455a', 0.4, 0.02),
            borderColor: '#c0455a',
            borderWidth: 1.5,
            pointRadius: 0,
            tension: 0.3,
          },
          {
            label: 'Property Sales',
            data: propSale,
            fill: '-1',
            backgroundColor: this._gradientHex(ctx, '#c9a84c', 0.4, 0.02),
            borderColor: '#c9a84c',
            borderWidth: 1.5,
            pointRadius: 0,
            tension: 0.3,
          },
        ]
      },
      options: {
        ...this._baseOptions(),
        scales: {
          ...this._baseOptions().scales,
          y: { ...this._baseOptions().scales.y, stacked: false }
        }
      }
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Tax burden over time
  // ══════════════════════════════════════════════════════════════════════════
  renderTaxBurden(years) {
    const canvas = document.getElementById('chart-tax');
    if (!canvas) return;

    const labels  = years.map(y => String(y.year));
    const usTaxes = years.map(y => y.usTax);
    const auTaxes = years.map(y => y.auTax);
    const rates   = years.map(y => y.totalIncome > 0 ? (y.estimatedTax / y.totalIncome) * 100 : 0);

    this._make('chart-tax', {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: '🇺🇸 US Tax',
            data: usTaxes,
            backgroundColor: 'rgba(100,149,237,0.6)',
            borderColor: '#6495ed',
            borderRadius: 3,
            stack: 'tax',
            order: 3,
          },
          {
            label: '🇦🇺 AU Tax',
            data: auTaxes,
            backgroundColor: 'rgba(192,69,90,0.6)',
            borderColor: '#c0455a',
            borderRadius: 3,
            stack: 'tax',
            order: 2,
          },
          {
            label: 'Effective Rate %',
            data: rates,
            type: 'line',
            borderColor: '#e4c76b',
            backgroundColor: 'transparent',
            borderWidth: 2,
            pointRadius: 0,
            tension: 0.4,
            yAxisID: 'yRate',
            order: 1,
          }
        ]
      },
      options: {
        ...this._baseOptions(),
        plugins: {
          ...this._baseOptions().plugins,
          tooltip: {
            ...this._baseOptions().plugins.tooltip,
            callbacks: {
              label: (ctx) => {
                if (ctx.dataset.yAxisID === 'yRate') {
                  return ` ${ctx.dataset.label}: ${ctx.raw.toFixed(1)}%`;
                }
                const symbol = appState.getCurrencySymbol();
                const val = appState.toDisplayCurrency(ctx.raw);
                return ` ${ctx.dataset.label}: ${symbol}${this._fmt(val)}`;
              },
              afterBody: this._afterBodyMilestones(),
            }
          }
        },
        scales: {
          ...this._baseOptions().scales,
          y: {
            ...this._baseOptions().scales?.y,
            stacked: true,
          },
          yRate: {
            position: 'right',
            grid: { drawOnChartArea: false },
            ticks: { callback: v => v.toFixed(1) + '%', color: '#8a94b0' }
          }
        }
      }
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Drawdown waterfall — shows account depletion order
  // ══════════════════════════════════════════════════════════════════════════
  renderDrawdown(years, accounts) {
    const canvas = document.getElementById('chart-drawdown');
    if (!canvas) return;

    const retirementYears = years.filter(y => y.isRetired);
    if (retirementYears.length === 0) return;

    const labels = retirementYears.map(y => String(y.year));
    // Only keep event annotations whose year label exists in this chart's label set
    const labelSet = new Set(labels);
    const filteredAnnotations = Object.fromEntries(
      Object.entries(this._eventAnnotations).filter(([, v]) => labelSet.has(v.xMin))
    );
    const total  = retirementYears.map(y => y.totalAccountValue + y.totalBrokerageValue);
    const netWorth = retirementYears.map(y => y.netWorth);

    const ctx = canvas.getContext('2d');
    this._make('chart-drawdown', {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Net Worth',
            data: netWorth,
            fill: 'origin',
            backgroundColor: this._gradientHex(ctx, '#4a6fa5', 0.3, 0.02),
            borderColor: '#4a6fa5',
            borderWidth: 2.5,
            pointRadius: 0,
            tension: 0.4,
          },
          {
            label: 'Liquid Assets',
            data: total,
            fill: false,
            borderColor: '#c9a84c',
            borderWidth: 1.5,
            borderDash: [5, 4],
            pointRadius: 0,
            tension: 0.4,
          }
        ]
      },
      options: {
        ...this._baseOptions(),
        plugins: {
          ...this._baseOptions().plugins,
          annotation: {
            annotations: {
              zeroLine: {
                type: 'line',
                yMin: 0, yMax: 0,
                borderColor: 'rgba(192,69,90,0.5)',
                borderWidth: 1,
                borderDash: [4, 4],
              },
              ...filteredAnnotations,
            }
          }
        }
      }
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Account Balances Over Time — one line per account/brokerage/property
  // ══════════════════════════════════════════════════════════════════════════
  renderAccountBalances(years, accounts, brokerageAccounts, savingsAccounts, properties) {
    const canvas = document.getElementById('chart-account-balances');
    if (!canvas) return;

    const labels  = years.map(y => String(y.year));
    const palette = [
      '#4a6fa5', '#3d9e72', '#c9a84c', '#c0455a',
      '#3a8fa0', '#e4845a', '#9b6bb5', '#5a9e6b',
      '#6b91cc', '#e4c76b',
    ];
    let ci = 0;
    const color = () => palette[ci++ % palette.length];

    const datasets = [];

    accounts.forEach(acc => {
      const c = color();
      const flag = acc.country === 'AUS' ? '🇦🇺 ' : '';
      datasets.push({
        label: `${flag}${acc.name}`,
        data: years.map(y => (y.assetBalances || {})[acc.id] || 0),
        borderColor: c,
        backgroundColor: 'transparent',
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.3,
      });
    });

    brokerageAccounts.forEach(b => {
      const c = color();
      const flag = b.country === 'AUS' ? '🇦🇺 ' : '';
      datasets.push({
        label: `${flag}${b.name} (Brokerage)`,
        data: years.map(y => (y.assetBalances || {})[b.id] || 0),
        borderColor: c,
        backgroundColor: 'transparent',
        borderWidth: 2,
        borderDash: [6, 3],
        pointRadius: 0,
        tension: 0.3,
      });
    });

    savingsAccounts.forEach(s => {
      const c = color();
      datasets.push({
        label: `${s.name} (Savings)`,
        data: years.map(y => (y.assetBalances || {})[s.id] || 0),
        borderColor: c,
        backgroundColor: 'transparent',
        borderWidth: 2,
        borderDash: [8, 3, 2, 3],
        pointRadius: 0,
        tension: 0.3,
      });
    });

    properties.forEach(p => {
      const c = color();
      const flag = p.country === 'AUS' ? '🇦🇺 ' : '';
      datasets.push({
        label: `${flag}${p.name} (Equity)`,
        data: years.map(y => (y.assetBalances || {})[p.id] || 0),
        borderColor: c,
        backgroundColor: 'transparent',
        borderWidth: 2,
        borderDash: [2, 3],
        pointRadius: 0,
        tension: 0.3,
      });
    });

    const baseOpts = this._baseOptions();
    this._make('chart-account-balances', {
      type: 'line',
      data: { labels, datasets },
      options: {
        ...baseOpts,
        plugins: {
          ...baseOpts.plugins,
          legend: {
            display: true,
            position: 'bottom',
            labels: { boxWidth: 12, padding: 14, color: '#8a94b0', font: { size: 11 } },
          },
          tooltip: {
            ...baseOpts.plugins.tooltip,
            callbacks: {
              title: items => `Year ${items[0].label}`,
              label: ctx => {
                const symbol = appState.getCurrencySymbol();
                const val = appState.toDisplayCurrency(ctx.raw);
                return ` ${ctx.dataset.label}: ${symbol}${this._fmt(val)}`;
              },
              footer: items => {
                const total = items.reduce((s, i) => s + i.raw, 0);
                const symbol = appState.getCurrencySymbol();
                return `Total: ${symbol}${this._fmt(appState.toDisplayCurrency(total))}`;
              },
              afterBody: this._afterBodyMilestones(),
            }
          }
        },
      }
    });
  }

  // ── Refresh all charts with new data ─────────────────────────────────────
  updateAll(years) {
    if (!years || years.length === 0) return;

    // Pre-compute life event data used by all chart renders
    this._milestonesByYear = new Map(
      years
        .filter(y => y.milestones && y.milestones.length > 0)
        .map(y => [String(y.year), y.milestones])
    );
    this._eventAnnotations = this._buildEventAnnotations(years);

    this.renderNetWorth(years);
    this.renderIncomeExpenses(years);
    this.renderIncomeSources(years);
    this.renderTaxBurden(years);
    this.renderDrawdown(years, appState.get('accounts'));
    this.renderAccountBalances(
      years,
      appState.get('accounts'),
      appState.get('brokerageAccounts'),
      appState.get('savingsAccounts') || [],
      appState.get('properties')
    );
  }

  destroyAll() {
    Object.values(this._charts).forEach(c => c.destroy());
    this._charts = {};
  }
}

