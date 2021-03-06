/*
 * @Author: your name
 * @Date: 2020-03-20 10:52:31
 * @LastEditTime: 2020-03-20 11:45:28
 * @LastEditors: Please set LastEditors
 * @Description: In User Settings Edit
 * @FilePath: \devui-language-service\language-service\src\parser-related\asserttions.ts
 */
/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

export function assertArrayOfStrings(identifier: string, value: any) {
    if (value == null) {
      return;
    }
    if (!Array.isArray(value)) {
      throw new Error(`Expected '${identifier}' to be an array of strings.`);
    }
    for (let i = 0; i < value.length; i += 1) {
      if (typeof value[i] !== 'string') {
        throw new Error(`Expected '${identifier}' to be an array of strings.`);
      }
    }
  }
  
  const UNUSABLE_INTERPOLATION_REGEXPS = [
    /^\s*$/,        // empty
    /[<>]/,         // html tag
    /^[{}]$/,       // i18n expansion
    /&(#|[a-z])/i,  // character reference,
    /^\/\//,        // comment
  ];
  
  export function assertInterpolationSymbols(identifier: string, value: any): void {
    if (value != null && !(Array.isArray(value) && value.length == 2)) {
      throw new Error(`Expected '${identifier}' to be an array, [start, end].`);
    } else if (value != null) {
      const start = value[0] as string;
      const end = value[1] as string;
      // Check for unusable interpolation symbols
      UNUSABLE_INTERPOLATION_REGEXPS.forEach(regexp => {
        if (regexp.test(start) || regexp.test(end)) {
          throw new Error(`['${start}', '${end}'] contains unusable interpolation symbol.`);
        }
      });
    }
  }
  