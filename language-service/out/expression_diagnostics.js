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
const diagnostic_messages_1 = require("./diagnostic_messages");
const expression_type_1 = require("./expression_type");
const symbols_1 = require("./symbols");
const utils_1 = require("./utils");
function getTemplateExpressionDiagnostics(info) {
    const visitor = new ExpressionDiagnosticsVisitor(info, (path) => getExpressionScope(info, path));
    compiler_1.templateVisitAll(visitor, info.templateAst);
    return visitor.diagnostics;
}
exports.getTemplateExpressionDiagnostics = getTemplateExpressionDiagnostics;
function getReferences(info) {
    const result = [];
    function processReferences(references) {
        for (const reference of references) {
            let type = undefined;
            if (reference.value) {
                type = info.query.getTypeSymbol(compiler_1.tokenReference(reference.value));
            }
            result.push({
                name: reference.name,
                kind: 'reference',
                type: type || info.query.getBuiltinType(symbols_1.BuiltinType.Any),
                get definition() { return getDefinitionOf(info, reference); }
            });
        }
    }
    const visitor = new class extends compiler_1.RecursiveTemplateAstVisitor {
        visitEmbeddedTemplate(ast, context) {
            super.visitEmbeddedTemplate(ast, context);
            processReferences(ast.references);
        }
        visitElement(ast, context) {
            super.visitElement(ast, context);
            processReferences(ast.references);
        }
    };
    compiler_1.templateVisitAll(visitor, info.templateAst);
    return result;
}
function getDefinitionOf(info, ast) {
    if (info.fileName) {
        const templateOffset = info.offset;
        return [{
                fileName: info.fileName,
                span: {
                    start: ast.sourceSpan.start.offset + templateOffset,
                    end: ast.sourceSpan.end.offset + templateOffset
                }
            }];
    }
}
/**
 * Resolve all variable declarations in a template by traversing the specified
 * `path`.
 * @param info
 * @param path template AST path
 */
function getVarDeclarations(info, path) {
    const results = [];
    for (let current = path.head; current; current = path.childOf(current)) {
        if (!(current instanceof compiler_1.EmbeddedTemplateAst)) {
            continue;
        }
        for (const variable of current.variables) {
            let symbol = getVariableTypeFromDirectiveContext(variable.value, info.query, current);
            const kind = info.query.getTypeKind(symbol);
            if (kind === symbols_1.BuiltinType.Any || kind === symbols_1.BuiltinType.Unbound) {
                // For special cases such as ngFor and ngIf, the any type is not very useful.
                // We can do better by resolving the binding value.
                const symbolsInScope = info.query.mergeSymbolTable([
                    info.members,
                    // Since we are traversing the AST path from head to tail, any variables
                    // that have been declared so far are also in scope.
                    info.query.createSymbolTable(results),
                ]);
                symbol = refinedVariableType(variable.value, symbolsInScope, info.query, current);
            }
            results.push({
                name: variable.name,
                kind: 'variable',
                type: symbol, get definition() { return getDefinitionOf(info, variable); },
            });
        }
    }
    return results;
}
/**
 * Resolve the type for the variable in `templateElement` by finding the structural
 * directive which has the context member. Returns any when not found.
 * @param value variable value name
 * @param query type symbol query
 * @param templateElement
 */
function getVariableTypeFromDirectiveContext(value, query, templateElement) {
    for (const { directive } of templateElement.directives) {
        const context = query.getTemplateContext(directive.type.reference);
        if (context) {
            const member = context.get(value);
            if (member && member.type) {
                return member.type;
            }
        }
    }
    return query.getBuiltinType(symbols_1.BuiltinType.Any);
}
/**
 * Resolve a more specific type for the variable in `templateElement` by inspecting
 * all variables that are in scope in the `mergedTable`. This function is a special
 * case for `ngFor` and `ngIf`. If resolution fails, return the `any` type.
 * @param value variable value name
 * @param mergedTable symbol table for all variables in scope
 * @param query
 * @param templateElement
 */
function refinedVariableType(value, mergedTable, query, templateElement) {
    if (value === '$implicit') {
        // Special case the ngFor directive
        const ngForDirective = templateElement.directives.find(d => {
            const name = compiler_1.identifierName(d.directive.type);
            return name == 'NgFor' || name == 'NgForOf';
        });
        if (ngForDirective) {
            const ngForOfBinding = ngForDirective.inputs.find(i => i.directiveName == 'ngForOf');
            if (ngForOfBinding) {
                // Check if there is a known type for the ngFor binding.
                const bindingType = new expression_type_1.AstType(mergedTable, query, {}).getType(ngForOfBinding.value);
                if (bindingType) {
                    const result = query.getElementType(bindingType);
                    if (result) {
                        return result;
                    }
                }
            }
        }
    }
    // Special case the ngIf directive ( *ngIf="data$ | async as variable" )
    if (value === 'ngIf') {
        const ngIfDirective = templateElement.directives.find(d => compiler_1.identifierName(d.directive.type) === 'NgIf');
        if (ngIfDirective) {
            const ngIfBinding = ngIfDirective.inputs.find(i => i.directiveName === 'ngIf');
            if (ngIfBinding) {
                const bindingType = new expression_type_1.AstType(mergedTable, query, {}).getType(ngIfBinding.value);
                if (bindingType) {
                    return bindingType;
                }
            }
        }
    }
    // We can't do better, return any
    return query.getBuiltinType(symbols_1.BuiltinType.Any);
}
function getEventDeclaration(info, path) {
    const event = path.tail;
    if (!(event instanceof compiler_1.BoundEventAst)) {
        // No event available in this context.
        return;
    }
    const genericEvent = {
        name: '$event',
        kind: 'variable',
        type: info.query.getBuiltinType(symbols_1.BuiltinType.Any),
    };
    const outputSymbol = utils_1.findOutputBinding(event, path, info.query);
    if (!outputSymbol) {
        // The `$event` variable doesn't belong to an output, so its type can't be refined.
        // TODO: type `$event` variables in bindings to DOM events.
        return genericEvent;
    }
    // The raw event type is wrapped in a generic, like EventEmitter<T> or Observable<T>.
    const ta = outputSymbol.typeArguments();
    if (!ta || ta.length !== 1)
        return genericEvent;
    const eventType = ta[0];
    return Object.assign(Object.assign({}, genericEvent), { type: eventType });
}
/**
 * Returns the symbols available in a particular scope of a template.
 * @param info parsed template information
 * @param path path of template nodes narrowing to the context the expression scope should be
 * derived for.
 */
function getExpressionScope(info, path) {
    let result = info.members;
    const references = getReferences(info);
    const variables = getVarDeclarations(info, path);
    const event = getEventDeclaration(info, path);
    if (references.length || variables.length || event) {
        const referenceTable = info.query.createSymbolTable(references);
        const variableTable = info.query.createSymbolTable(variables);
        const eventsTable = info.query.createSymbolTable(event ? [event] : []);
        result = info.query.mergeSymbolTable([result, referenceTable, variableTable, eventsTable]);
    }
    return result;
}
exports.getExpressionScope = getExpressionScope;
class ExpressionDiagnosticsVisitor extends compiler_1.RecursiveTemplateAstVisitor {
    constructor(info, getExpressionScope) {
        super();
        this.info = info;
        this.getExpressionScope = getExpressionScope;
        this.diagnostics = [];
        this.path = new compiler_1.AstPath([]);
    }
    visitDirective(ast, context) {
        // Override the default child visitor to ignore the host properties of a directive.
        if (ast.inputs && ast.inputs.length) {
            compiler_1.templateVisitAll(this, ast.inputs, context);
        }
    }
    visitBoundText(ast) {
        this.push(ast);
        this.diagnoseExpression(ast.value, ast.sourceSpan.start.offset, false);
        this.pop();
    }
    visitDirectiveProperty(ast) {
        this.push(ast);
        this.diagnoseExpression(ast.value, this.attributeValueLocation(ast), false);
        this.pop();
    }
    visitElementProperty(ast) {
        this.push(ast);
        this.diagnoseExpression(ast.value, this.attributeValueLocation(ast), false);
        this.pop();
    }
    visitEvent(ast) {
        this.push(ast);
        this.diagnoseExpression(ast.handler, this.attributeValueLocation(ast), true);
        this.pop();
    }
    visitVariable(ast) {
        const directive = this.directiveSummary;
        if (directive && ast.value) {
            const context = this.info.query.getTemplateContext(directive.type.reference);
            if (context && !context.has(ast.value)) {
                const missingMember = ast.value === '$implicit' ? 'an implicit value' : `a member called '${ast.value}'`;
                const span = this.absSpan(spanOf(ast.sourceSpan));
                this.diagnostics.push(diagnostic_messages_1.createDiagnostic(span, diagnostic_messages_1.Diagnostic.template_context_missing_member, directive.type.reference.name, missingMember));
            }
        }
    }
    visitElement(ast, context) {
        this.push(ast);
        super.visitElement(ast, context);
        this.pop();
    }
    visitEmbeddedTemplate(ast, context) {
        const previousDirectiveSummary = this.directiveSummary;
        this.push(ast);
        // Find directive that references this template
        this.directiveSummary =
            ast.directives.map(d => d.directive).find(d => hasTemplateReference(d.type));
        // Process children
        super.visitEmbeddedTemplate(ast, context);
        this.pop();
        this.directiveSummary = previousDirectiveSummary;
    }
    attributeValueLocation(ast) {
        const path = utils_1.getPathToNodeAtPosition(this.info.htmlAst, ast.sourceSpan.start.offset);
        const last = path.tail;
        if (last instanceof compiler_1.Attribute && last.valueSpan) {
            return last.valueSpan.start.offset;
        }
        return ast.sourceSpan.start.offset;
    }
    diagnoseExpression(ast, offset, event) {
        const scope = this.getExpressionScope(this.path, event);
        const analyzer = new expression_type_1.AstType(scope, this.info.query, { event });
        for (const diagnostic of analyzer.getDiagnostics(ast)) {
            diagnostic.span = this.absSpan(diagnostic.span, offset);
            this.diagnostics.push(diagnostic);
        }
    }
    push(ast) { this.path.push(ast); }
    pop() { this.path.pop(); }
    absSpan(span, additionalOffset = 0) {
        return {
            start: span.start + this.info.offset + additionalOffset,
            end: span.end + this.info.offset + additionalOffset,
        };
    }
}
function hasTemplateReference(type) {
    if (type.diDeps) {
        for (let diDep of type.diDeps) {
            if (diDep.token && diDep.token.identifier &&
                compiler_1.identifierName(diDep.token.identifier) == 'TemplateRef')
                return true;
        }
    }
    return false;
}
function spanOf(sourceSpan) {
    return { start: sourceSpan.start.offset, end: sourceSpan.end.offset };
}
//# sourceMappingURL=expression_diagnostics.js.map