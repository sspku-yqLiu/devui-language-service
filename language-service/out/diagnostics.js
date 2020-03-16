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
const ts = require("typescript");
const diagnostic_messages_1 = require("./diagnostic_messages");
const expression_diagnostics_1 = require("./expression_diagnostics");
const utils_1 = require("./utils");
/**
 * Return diagnostic information for the parsed AST of the template.
 * @param ast contains HTML and template AST
 */
function getTemplateDiagnostics(ast) {
    const { parseErrors, templateAst, htmlAst, template } = ast;
    if (parseErrors && parseErrors.length) {
        return parseErrors.map(e => {
            return {
                kind: ts.DiagnosticCategory.Error,
                span: utils_1.offsetSpan(utils_1.spanOf(e.span), template.span.start),
                message: e.msg,
            };
        });
    }
    return expression_diagnostics_1.getTemplateExpressionDiagnostics({
        templateAst: templateAst,
        htmlAst: htmlAst,
        offset: template.span.start,
        query: template.query,
        members: template.members,
    });
}
exports.getTemplateDiagnostics = getTemplateDiagnostics;
/**
 * Performs a variety diagnostics on directive declarations.
 *
 * @param declarations Angular directive declarations
 * @param modules NgModules in the project
 * @param host TypeScript service host used to perform TypeScript queries
 * @return diagnosed errors, if any
 */
function getDeclarationDiagnostics(declarations, modules, host) {
    const directives = new Set();
    for (const ngModule of modules.ngModules) {
        for (const directive of ngModule.declaredDirectives) {
            directives.add(directive.reference);
        }
    }
    const results = [];
    for (const declaration of declarations) {
        const { errors, metadata, type, declarationSpan } = declaration;
        const sf = host.getSourceFile(type.filePath);
        if (!sf) {
            host.error(`directive ${type.name} exists but has no source file`);
            return [];
        }
        // TypeScript identifier of the directive declaration annotation (e.g. "Component" or
        // "Directive") on a directive class.
        const directiveIdentifier = utils_1.findTightestNode(sf, declarationSpan.start);
        if (!directiveIdentifier) {
            host.error(`directive ${type.name} exists but has no identifier`);
            return [];
        }
        for (const error of errors) {
            results.push({
                kind: ts.DiagnosticCategory.Error,
                message: error.message,
                span: error.span,
            });
        }
        if (!modules.ngModuleByPipeOrDirective.has(declaration.type)) {
            results.push(diagnostic_messages_1.createDiagnostic(declarationSpan, diagnostic_messages_1.Diagnostic.directive_not_in_module, metadata.isComponent ? 'Component' : 'Directive', type.name));
        }
        if (metadata.isComponent) {
            const { template, templateUrl, styleUrls } = metadata.template;
            if (template === null && !templateUrl) {
                results.push(diagnostic_messages_1.createDiagnostic(declarationSpan, diagnostic_messages_1.Diagnostic.missing_template_and_templateurl, type.name));
            }
            else if (templateUrl) {
                if (template) {
                    results.push(diagnostic_messages_1.createDiagnostic(declarationSpan, diagnostic_messages_1.Diagnostic.both_template_and_templateurl, type.name));
                }
                // Find templateUrl value from the directive call expression, which is the parent of the
                // directive identifier.
                //
                // TODO: We should create an enum of the various properties a directive can have to use
                // instead of string literals. We can then perform a mass migration of all literal usages.
                const templateUrlNode = utils_1.findPropertyValueOfType(directiveIdentifier.parent, 'templateUrl', ts.isLiteralExpression);
                if (!templateUrlNode) {
                    host.error(`templateUrl ${templateUrl} exists but its TypeScript node doesn't`);
                    return [];
                }
                results.push(...validateUrls([templateUrlNode], host.tsLsHost));
            }
            if (styleUrls.length > 0) {
                // Find styleUrls value from the directive call expression, which is the parent of the
                // directive identifier.
                const styleUrlsNode = utils_1.findPropertyValueOfType(directiveIdentifier.parent, 'styleUrls', ts.isArrayLiteralExpression);
                if (!styleUrlsNode) {
                    host.error(`styleUrls property exists but its TypeScript node doesn't'`);
                    return [];
                }
                results.push(...validateUrls(styleUrlsNode.elements, host.tsLsHost));
            }
        }
    }
    return results;
}
exports.getDeclarationDiagnostics = getDeclarationDiagnostics;
/**
 * Checks that URLs on a directive point to a valid file.
 * Note that this diagnostic check may require a filesystem hit, and thus may be slower than other
 * checks.
 *
 * @param urls urls to check for validity
 * @param tsLsHost TS LS host used for querying filesystem information
 * @return diagnosed url errors, if any
 */
function validateUrls(urls, tsLsHost) {
    if (!tsLsHost.fileExists) {
        return [];
    }
    const allErrors = [];
    // TODO(ayazhafiz): most of this logic can be unified with the logic in
    // definitions.ts#getUrlFromProperty. Create a utility function to be used by both.
    for (let i = 0; i < urls.length; ++i) {
        const urlNode = urls[i];
        if (!ts.isStringLiteralLike(urlNode)) {
            // If a non-string value is assigned to a URL node (like `templateUrl`), a type error will be
            // picked up by the TS Language Server.
            continue;
        }
        const curPath = urlNode.getSourceFile().fileName;
        const url = path.join(path.dirname(curPath), urlNode.text);
        if (tsLsHost.fileExists(url))
            continue;
        // Exclude opening and closing quotes in the url span.
        const urlSpan = { start: urlNode.getStart() + 1, end: urlNode.end - 1 };
        allErrors.push(diagnostic_messages_1.createDiagnostic(urlSpan, diagnostic_messages_1.Diagnostic.invalid_templateurl));
    }
    return allErrors;
}
/**
 * Return a recursive data structure that chains diagnostic messages.
 * @param chain
 */
function chainDiagnostics(chain) {
    return {
        messageText: chain.message,
        category: ts.DiagnosticCategory.Error,
        code: 0,
        next: chain.next ? chain.next.map(chainDiagnostics) : undefined
    };
}
/**
 * Convert ng.Diagnostic to ts.Diagnostic.
 * @param d diagnostic
 * @param file
 */
function ngDiagnosticToTsDiagnostic(d, file) {
    return {
        file,
        start: d.span.start,
        length: d.span.end - d.span.start,
        messageText: typeof d.message === 'string' ? d.message : chainDiagnostics(d.message),
        category: d.kind,
        code: 0,
        source: 'ng',
    };
}
exports.ngDiagnosticToTsDiagnostic = ngDiagnosticToTsDiagnostic;
//# sourceMappingURL=diagnostics.js.map