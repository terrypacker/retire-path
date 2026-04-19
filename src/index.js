/**
 * AUTO-GENERATED FILE - DO NOT EDIT
 * Run: npm run build:index
 */

import { uiManager, App, retirePathApp } from './app.js';
import { AppState, appState } from './appState.js';
import { AssetFactory } from './assets/AssetFactory.js';
import { BaseAccount } from './assets/BaseAccount.js';
import { BaseAsset } from './assets/BaseAsset.js';
import { BrokerageAccount } from './assets/BrokerageAccount.js';
import { Land } from './assets/Land.js';
import { RealEstate } from './assets/RealEstate.js';
import { RetirementAccount } from './assets/RetirementAccount.js';
import { SavingsAccount } from './assets/SavingsAccount.js';
import { Account401k } from './assets/accounts/Account401k.js';
import { RothAccount } from './assets/accounts/RothAccount.js';
import { SuperAccount } from './assets/accounts/SuperAccount.js';
import { TraditionalIRAAccount } from './assets/accounts/TraditionalIRAAccount.js';
import { ChartManager } from './chartManager.js';
import { DebugLogger } from './debugLogger.js';
import { ProjectionEngine } from './projectionEngine.js';
import { AustraliaTaxModule2024 } from './tax/AustraliaTaxModule2024.js';
import { AustraliaTaxModule2025 } from './tax/AustraliaTaxModule2025.js';
import { AustraliaTaxModuleBase } from './tax/AustraliaTaxModuleBase.js';
import { BaseTaxModule } from './tax/BaseTaxModule.js';
import { TaxEngine, taxEngine } from './tax/TaxEngine.js';
import { USTaxModule2024 } from './tax/USTaxModule2024.js';
import { USTaxModule2025 } from './tax/USTaxModule2025.js';
import { USTaxModuleBase } from './tax/USTaxModuleBase.js';
import { fmtShort, makeFmt } from './ui/formatters.js';
import { setField, getField, closeModal } from './ui/modalHelpers.js';
import { createInstanceOf, default, formatToCurrency, formatToNumber, removeMask, setMask } from './ui/simple-mask-money/simple-mask-money.esm.js';
import { showToast } from './ui/toastManager.js';
import { UIManager } from './uiManager.js';

// =========================================================
// TOP-LEVEL EXPORTS
// =========================================================

export {
  
};

// =========================================================
// NAMESPACES
// =========================================================

export const Misc = {
  uiManager,
  App,
  retirePathApp,
  AppState,
  appState,
  ChartManager,
  DebugLogger,
  ProjectionEngine,
};

export const Assets = {
  AssetFactory,
  BaseAccount,
  BaseAsset,
  BrokerageAccount,
  Land,
  RealEstate,
  RetirementAccount,
  SavingsAccount,
  Account401k,
  RothAccount,
  SuperAccount,
  TraditionalIRAAccount,
};

export const Tax = {
  AustraliaTaxModule2024,
  AustraliaTaxModule2025,
  AustraliaTaxModuleBase,
  BaseTaxModule,
  TaxEngine,
  taxEngine,
  USTaxModule2024,
  USTaxModule2025,
  USTaxModuleBase,
};

export const UI = {
  fmtShort,
  makeFmt,
  setField,
  getField,
  closeModal,
  createInstanceOf,
  default,
  formatToCurrency,
  formatToNumber,
  removeMask,
  setMask,
  showToast,
  UIManager,
};

// =========================================================
// DEFAULT EXPORT
// =========================================================

export default {
  Misc,
  Assets,
  Tax,
  UI,
};
