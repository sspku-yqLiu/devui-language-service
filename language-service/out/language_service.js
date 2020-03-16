"use strict";
/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
Object.defineProperty(exports, "__esModule", { value: true });
const tss = require("typescript/lib/tsserverlibrary");
const completions_1 = require("./completions");
const definitions_1 = require("./definitions");
const diagnostics_1 = require("./diagnostics");
const hover_1 = require("./hover");
/**
 * Create an instance of an Angular `LanguageService`.
 *
 * @publicApi
 */
function createLanguageService(host) {
    return new LanguageServiceImpl(host);
}
exports.createLanguageService = createLanguageService;
class LanguageServiceImpl {
    constructor(host) {
        this.host = host;
    }
    getSemanticDiagnostics(fileName) {
        const analyzedModules = this.host.getAnalyzedModules(); // same role as 'synchronizeHostData'
        const ngDiagnostics = [];
        const templates = this.host.getTemplates(fileName);
        for (const template of templates) {
            const ast = this.host.getTemplateAst(template);
            if (ast) {
                ngDiagnostics.push(...diagnostics_1.getTemplateDiagnostics(ast));
            }
        }
        const declarations = this.host.getDeclarations(fileName);
        ngDiagnostics.push(...diagnostics_1.getDeclarationDiagnostics(declarations, analyzedModules, this.host));
        const sourceFile = fileName.endsWith('.ts') ? this.host.getSourceFile(fileName) : undefined;
        const tsDiagnostics = ngDiagnostics.map(d => diagnostics_1.ngDiagnosticToTsDiagnostic(d, sourceFile));
        return [...tss.sortAndDeduplicateDiagnostics(tsDiagnostics)];
    }
    getCompletionsAtPosition(fileName, position, options) {
        this.host.getAnalyzedModules(); // same role as 'synchronizeHostData'
        const ast = this.host.getTemplateAstAtPosition(fileName, position);
        if (!ast) {
            return;
        }
        const results = completions_1.getTemplateCompletions(ast, position);
        if (!results || !results.length) {
            return;
        }
        return {
            isGlobalCompletion: false,
            isMemberCompletion: false,
            isNewIdentifierLocation: false,
            // Cast CompletionEntry.kind from ng.CompletionKind to ts.ScriptElementKind
            entries: results,
        };
    }
    getDefinitionAndBoundSpan(fileName, position) {
        this.host.getAnalyzedModules(); // same role as 'synchronizeHostData'
        const templateInfo = this.host.getTemplateAstAtPosition(fileName, position);
        if (templateInfo) {
            return definitions_1.getDefinitionAndBoundSpan(templateInfo, position);
        }
        // Attempt to get Angular-specific definitions in a TypeScript file, like templates defined
        // in a `templateUrl` property.
        if (fileName.endsWith('.ts')) {
            const sf = this.host.getSourceFile(fileName);
            if (sf) {
                return definitions_1.getTsDefinitionAndBoundSpan(sf, position, this.host.tsLsHost);
            }
        }
    }
    getQuickInfoAtPosition(fileName, position) {
        const analyzedModules = this.host.getAnalyzedModules(); // same role as 'synchronizeHostData'
        const templateInfo = this.host.getTemplateAstAtPosition(fileName, position);
        if (templateInfo) {
            return hover_1.getTemplateHover(templateInfo, position, analyzedModules);
        }
        // Attempt to get Angular-specific hover information in a TypeScript file, the NgModule a
        // directive belongs to.
        const declarations = this.host.getDeclarations(fileName);
        return hover_1.getTsHover(position, declarations, analyzedModules);
    }
}
//# sourceMappingURL=language_service.js.map