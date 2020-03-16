"use strict";
/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
Object.defineProperty(exports, "__esModule", { value: true });
const ts = require("typescript");
const locate_symbol_1 = require("./locate_symbol");
const utils_1 = require("./utils");
// Reverse mappings of enum would generate strings
const SYMBOL_SPACE = ts.SymbolDisplayPartKind[ts.SymbolDisplayPartKind.space];
const SYMBOL_PUNC = ts.SymbolDisplayPartKind[ts.SymbolDisplayPartKind.punctuation];
const SYMBOL_TEXT = ts.SymbolDisplayPartKind[ts.SymbolDisplayPartKind.text];
const SYMBOL_INTERFACE = ts.SymbolDisplayPartKind[ts.SymbolDisplayPartKind.interfaceName];
/**
 * Traverse the template AST and look for the symbol located at `position`, then
 * return the corresponding quick info.
 * @param info template AST
 * @param position location of the symbol
 * @param analyzedModules all NgModules in the program.
 */
function getTemplateHover(info, position, analyzedModules) {
    var _a, _b;
    const symbolInfo = locate_symbol_1.locateSymbols(info, position)[0];
    if (!symbolInfo) {
        return;
    }
    const { symbol, span, staticSymbol } = symbolInfo;
    // The container is either the symbol's container (for example, 'AppComponent'
    // is the container of the symbol 'title' in its template) or the NgModule
    // that the directive belongs to (the container of AppComponent is AppModule).
    let containerName = (_a = symbol.container) === null || _a === void 0 ? void 0 : _a.name;
    if (!containerName && staticSymbol) {
        // If there is a static symbol then the target is a directive.
        const ngModule = analyzedModules.ngModuleByPipeOrDirective.get(staticSymbol);
        containerName = ngModule === null || ngModule === void 0 ? void 0 : ngModule.type.reference.name;
    }
    return createQuickInfo(symbol.name, symbol.kind, span, containerName, (_b = symbol.type) === null || _b === void 0 ? void 0 : _b.name, symbol.documentation);
}
exports.getTemplateHover = getTemplateHover;
/**
 * Get quick info for Angular semantic entities in TypeScript files, like Directives.
 * @param position location of the symbol in the source file
 * @param declarations All Directive-like declarations in the source file.
 * @param analyzedModules all NgModules in the program.
 */
function getTsHover(position, declarations, analyzedModules) {
    for (const { declarationSpan, metadata } of declarations) {
        if (utils_1.inSpan(position, declarationSpan)) {
            const staticSymbol = metadata.type.reference;
            const directiveName = staticSymbol.name;
            const kind = metadata.isComponent ? 'component' : 'directive';
            const textSpan = ts.createTextSpanFromBounds(declarationSpan.start, declarationSpan.end);
            const ngModule = analyzedModules.ngModuleByPipeOrDirective.get(staticSymbol);
            const moduleName = ngModule === null || ngModule === void 0 ? void 0 : ngModule.type.reference.name;
            return createQuickInfo(directiveName, kind, textSpan, moduleName, ts.ScriptElementKind.classElement);
        }
    }
}
exports.getTsHover = getTsHover;
/**
 * Construct a QuickInfo object taking into account its container and type.
 * @param name Name of the QuickInfo target
 * @param kind component, directive, pipe, etc.
 * @param textSpan span of the target
 * @param containerName either the Symbol's container or the NgModule that contains the directive
 * @param type user-friendly name of the type
 * @param documentation docstring or comment
 */
function createQuickInfo(name, kind, textSpan, containerName, type, documentation) {
    const containerDisplayParts = containerName ?
        [
            { text: containerName, kind: SYMBOL_INTERFACE },
            { text: '.', kind: SYMBOL_PUNC },
        ] :
        [];
    const typeDisplayParts = type ?
        [
            { text: ':', kind: SYMBOL_PUNC },
            { text: ' ', kind: SYMBOL_SPACE },
            { text: type, kind: SYMBOL_INTERFACE },
        ] :
        [];
    return {
        kind: kind,
        kindModifiers: ts.ScriptElementKindModifier.none,
        textSpan: textSpan,
        displayParts: [
            { text: '(', kind: SYMBOL_PUNC },
            { text: kind, kind: SYMBOL_TEXT },
            { text: ')', kind: SYMBOL_PUNC },
            { text: ' ', kind: SYMBOL_SPACE },
            ...containerDisplayParts,
            { text: name, kind: SYMBOL_INTERFACE },
            ...typeDisplayParts,
        ],
        documentation,
    };
}
//# sourceMappingURL=hover.js.map