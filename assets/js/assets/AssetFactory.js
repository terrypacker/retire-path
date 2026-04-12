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

import { RetirementAccount } from './RetirementAccount.js';
import { BrokerageAccount  } from './BrokerageAccount.js';
import { RealEstate        } from './RealEstate.js';
import { Land              } from './Land.js';

/**
 * AssetFactory.js
 * Creates the correct asset/account class instance from a plain AppState POJO.
 * Keeps the rest of the codebase decoupled from specific class names.
 */
export class AssetFactory {
  /**
   * Wrap a retirement-account POJO (from AppState accounts[]).
   * All current retirement types (401k, roth, ira, super) map to
   * RetirementAccount; extend here when a new type needs custom logic.
   *
   * @param {Object} pojo - AppState accounts[] entry
   * @returns {RetirementAccount}
   */
  static wrapRetirementAccount(pojo) {
    return new RetirementAccount(pojo);
  }

  /**
   * Wrap a brokerage-account POJO (from AppState brokerageAccounts[]).
   *
   * @param {Object} pojo - AppState brokerageAccounts[] entry
   * @returns {BrokerageAccount}
   */
  static wrapBrokerageAccount(pojo) {
    return new BrokerageAccount(pojo);
  }

  /**
   * Wrap a property/asset POJO (from AppState properties[]).
   * Defaults to RealEstate; use pojo.type === 'land' for Land parcels.
   *
   * @param {Object} pojo - AppState properties[] entry
   * @returns {RealEstate|Land}
   */
  static wrapAsset(pojo) {
    if (pojo.type === 'land') return new Land(pojo);
    return new RealEstate(pojo);
  }
}
