"use strict";
/*
 * @Author: your name
 * @Date: 2020-03-16 19:50:56
 * @LastEditTime: 2020-03-16 20:48:00
 * @LastEditors: your name
 * @Description: In User Settings Edit
 * @FilePath: \devui-language-service\language-service\src\global_symbols.ts
 */
/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
Object.defineProperty(exports, "__esModule", { value: true });
const ng = require("./types");
exports.EMPTY_SYMBOL_TABLE = {
    size: 0,
    get: () => undefined,
    has: () => false,
    values: () => [],
};
/**
 * A factory function that returns a symbol table that contains all global symbols
 * available in an interpolation scope in a template.
 * This function creates the table the first time it is called, and return a cached
 * value for all subsequent calls.
 */
exports.createGlobalSymbolTable = (function () {
    let GLOBAL_SYMBOL_TABLE;
    return function (query) {
        if (GLOBAL_SYMBOL_TABLE) {
            return GLOBAL_SYMBOL_TABLE;
        }
        GLOBAL_SYMBOL_TABLE = query.createSymbolTable([
            // The `$any()` method casts the type of an expression to `any`.
            // https://angular.io/guide/template-syntax#the-any-type-cast-function
            {
                name: '$any',
                kind: 'method',
                type: {
                    name: '$any',
                    kind: 'method',
                    type: undefined,
                    language: 'typescript',
                    container: undefined,
                    public: true,
                    callable: true,
                    definition: undefined,
                    nullable: false,
                    documentation: [{
                            kind: 'text',
                            text: 'function to cast an expression to the `any` type',
                        }],
                    members: () => exports.EMPTY_SYMBOL_TABLE,
                    signatures: () => [],
                    selectSignature(args) {
                        if (args.length !== 1) {
                            return;
                        }
                        return {
                            arguments: exports.EMPTY_SYMBOL_TABLE,
                            result: query.getBuiltinType(ng.BuiltinType.Any),
                        };
                    },
                    indexed: () => undefined,
                    typeArguments: () => undefined,
                },
            },
        ]);
        return GLOBAL_SYMBOL_TABLE;
    };
})();
//# sourceMappingURL=global_symbols.js.map