"use strict";
/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
Object.defineProperty(exports, "__esModule", { value: true });
const compiler_1 = require("@angular/compiler");
exports.StaticSymbol = compiler_1.StaticSymbol;
const symbols_1 = require("./symbols");
exports.BuiltinType = symbols_1.BuiltinType;
/**
 * The type of Angular directive. Used for QuickInfo in template.
 */
var DirectiveKind;
(function (DirectiveKind) {
    DirectiveKind["COMPONENT"] = "component";
    DirectiveKind["DIRECTIVE"] = "directive";
    DirectiveKind["EVENT"] = "event";
})(DirectiveKind = exports.DirectiveKind || (exports.DirectiveKind = {}));
/**
 * ScriptElementKind for completion.
 */
var CompletionKind;
(function (CompletionKind) {
    CompletionKind["ANGULAR_ELEMENT"] = "angular element";
    CompletionKind["ATTRIBUTE"] = "attribute";
    CompletionKind["COMPONENT"] = "component";
    CompletionKind["ELEMENT"] = "element";
    CompletionKind["ENTITY"] = "entity";
    CompletionKind["HTML_ATTRIBUTE"] = "html attribute";
    CompletionKind["HTML_ELEMENT"] = "html element";
    CompletionKind["KEY"] = "key";
    CompletionKind["METHOD"] = "method";
    CompletionKind["PIPE"] = "pipe";
    CompletionKind["PROPERTY"] = "property";
    CompletionKind["REFERENCE"] = "reference";
    CompletionKind["TYPE"] = "type";
    CompletionKind["VARIABLE"] = "variable";
})(CompletionKind = exports.CompletionKind || (exports.CompletionKind = {}));
//# sourceMappingURL=types.js.map