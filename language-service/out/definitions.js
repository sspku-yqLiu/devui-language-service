"use strict";
/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
Object.defineProperty(exports, "__esModule", { value: true });
const path = require("path");
const ts = require("typescript"); // used as value and is provided at runtime
const locate_symbol_1 = require("./locate_symbol");
const template_1 = require("./template");
const utils_1 = require("./utils");
/**
 * Convert Angular Span to TypeScript TextSpan. Angular Span has 'start' and
 * 'end' whereas TS TextSpan has 'start' and 'length'.
 * @param span Angular Span
 */
function ngSpanToTsTextSpan(span) {
    return {
        start: span.start,
        length: span.end - span.start,
    };
}
/**
 * Traverse the template AST and look for the symbol located at `position`, then
 * return its definition and span of bound text.
 * @param info
 * @param position
 */
function getDefinitionAndBoundSpan(info, position) {
    const symbols = locate_symbol_1.locateSymbols(info, position);
    if (!symbols.length) {
        return;
    }
    const seen = new Set();
    const definitions = [];
    for (const symbolInfo of symbols) {
        const { symbol } = symbolInfo;
        // symbol.definition is really the locations of the symbol. There could be
        // more than one. No meaningful info could be provided without any location.
        const { kind, name, container, definition: locations } = symbol;
        if (!locations || !locations.length) {
            continue;
        }
        const containerKind = container ? container.kind : ts.ScriptElementKind.unknown;
        const containerName = container ? container.name : '';
        for (const { fileName, span } of locations) {
            const textSpan = ngSpanToTsTextSpan(span);
            // In cases like two-way bindings, a request for the definitions of an expression may return
            // two of the same definition:
            //    [(ngModel)]="prop"
            //                 ^^^^  -- one definition for the property binding, one for the event binding
            // To prune duplicate definitions, tag definitions with unique location signatures and ignore
            // definitions whose locations have already been seen.
            const signature = `${textSpan.start}:${textSpan.length}@${fileName}`;
            if (seen.has(signature))
                continue;
            definitions.push({
                kind: kind,
                name,
                containerKind,
                containerName,
                textSpan: ngSpanToTsTextSpan(span),
                fileName: fileName,
            });
            seen.add(signature);
        }
    }
    return {
        definitions,
        textSpan: symbols[0].span,
    };
}
exports.getDefinitionAndBoundSpan = getDefinitionAndBoundSpan;
/**
 * Gets an Angular-specific definition in a TypeScript source file.
 */
function getTsDefinitionAndBoundSpan(sf, position, tsLsHost) {
    const node = utils_1.findTightestNode(sf, position);
    if (!node)
        return;
    switch (node.kind) {
        case ts.SyntaxKind.StringLiteral:
        case ts.SyntaxKind.NoSubstitutionTemplateLiteral:
            // Attempt to extract definition of a URL in a property assignment.
            return getUrlFromProperty(node, tsLsHost);
        default:
            return undefined;
    }
}
exports.getTsDefinitionAndBoundSpan = getTsDefinitionAndBoundSpan;
/**
 * Attempts to get the definition of a file whose URL is specified in a property assignment in a
 * directive decorator.
 * Currently applies to `templateUrl` and `styleUrls` properties.
 */
function getUrlFromProperty(urlNode, tsLsHost) {
    // Get the property assignment node corresponding to the `templateUrl` or `styleUrls` assignment.
    // These assignments are specified differently; `templateUrl` is a string, and `styleUrls` is
    // an array of strings:
    //   {
    //        templateUrl: './template.ng.html',
    //        styleUrls: ['./style.css', './other-style.css']
    //   }
    // `templateUrl`'s property assignment can be found from the string literal node;
    // `styleUrls`'s property assignment can be found from the array (parent) node.
    //
    // First search for `templateUrl`.
    let asgn = template_1.getPropertyAssignmentFromValue(urlNode);
    if (!asgn || asgn.name.getText() !== 'templateUrl') {
        // `templateUrl` assignment not found; search for `styleUrls` array assignment.
        asgn = template_1.getPropertyAssignmentFromValue(urlNode.parent);
        if (!asgn || asgn.name.getText() !== 'styleUrls') {
            // Nothing found, bail.
            return;
        }
    }
    // If the property assignment is not a property of a class decorator, don't generate definitions
    // for it.
    if (!template_1.isClassDecoratorProperty(asgn))
        return;
    const sf = urlNode.getSourceFile();
    // Extract url path specified by the url node, which is relative to the TypeScript source file
    // the url node is defined in.
    const url = path.join(path.dirname(sf.fileName), urlNode.text);
    // If the file does not exist, bail. It is possible that the TypeScript language service host
    // does not have a `fileExists` method, in which case optimistically assume the file exists.
    if (tsLsHost.fileExists && !tsLsHost.fileExists(url))
        return;
    const templateDefinitions = [{
            kind: ts.ScriptElementKind.externalModuleName,
            name: url,
            containerKind: ts.ScriptElementKind.unknown,
            containerName: '',
            // Reading the template is expensive, so don't provide a preview.
            textSpan: { start: 0, length: 0 },
            fileName: url,
        }];
    return {
        definitions: templateDefinitions,
        textSpan: {
            // Exclude opening and closing quotes in the url span.
            start: urlNode.getStart() + 1,
            length: urlNode.getWidth() - 2,
        },
    };
}
//# sourceMappingURL=definitions.js.map