/*
 * @Author: your name
 * @Date: 2020-03-18 17:19:56
 * @LastEditTime: 2020-03-18 17:19:56
 * @LastEditors: Please set LastEditors
 * @Description: In User Settings Edit
 * @FilePath: \devui-language-service\language-service\src\metadata_resolver.ts
 */

/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */


import {HtmlParser} from './parser-related/html_parser';

import {Console, SyncAsync, ValueTransformer, isPromise, noUndefined, resolveForwardRef, stringify, syntaxError, visitValue} from './util';

export type ErrorCollector = (error: any, type?: any) => void;

export const ERROR_COMPONENT_TYPE = 'ngComponentType';
import * as cpl from './parser-related/complier_metadata';

// Design notes:
// - don't lazily create metadata:
//   For some metadata, we need to do async work sometimes,
//   so the user has to kick off this loading.
//   But we want to report errors even when the async work is
//   not required to check that the user would have been able
//   to wait correctly.
export class CompileMetadataResolver {
  constructor(
      private _htmlParser: HtmlParser,
      ) {}


  getHostComponentMetadata(
      compMeta: cpl.CompileDirectiveMetadata,
      hostViewType?: StaticSymbol|cpl.ProxyClass): cpl.CompileDirectiveMetadata {
    const hostType = this.getHostComponentType(compMeta.type.reference);
    if (!hostViewType) {
      hostViewType = this.getHostComponentViewClass(hostType);
    }
    // Note: ! is ok here as this method should only be called with normalized directive
    // metadata, which always fills in the selector.
    const template = CssSelector.parse(compMeta.selector !)[0].getMatchingElementTemplate();
    const templateUrl = '';
    const htmlAst = this._htmlParser.parse(template, templateUrl);
    return cpl.CompileDirectiveMetadata.create({
      isHost: true,
      type: {reference: hostType, diDeps: [], lifecycleHooks: []},
      template: new cpl.CompileHTMLTemplateMetadata({
        htmlAst,
      }),
      exportAs: null,
      changeDetection: ChangeDetectionStrategy.Default,
      inputs: [],
      outputs: [],
      host: {},
      isComponent: true,
      selector: '*',
      providers: [],
      viewProviders: [],
      queries: [],
      guards: {},
      viewQueries: [],
      componentViewType: hostViewType,
      rendererType:
          {id: '__Host__', encapsulation: ViewEncapsulation.None, styles: [], data: {}} as object,
      entryComponents: [],
      componentFactory: null
    });
  }
}