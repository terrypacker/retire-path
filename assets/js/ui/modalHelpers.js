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
 * modalHelpers.js
 * Pure DOM utilities for modal form field access and overlay control.
 */

/** Set the value of a form element by id. */
export function setField(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value;
}

/** Get the string value of a form element by id (returns '' if not found). */
export function getField(id) {
  const el = document.getElementById(id);
  return el ? el.value : '';
}

/** Remove the 'open' class from a modal overlay element. */
export function closeModal(overlayId) {
  const el = document.getElementById(overlayId);
  if (el) el.classList.remove('open');
}
