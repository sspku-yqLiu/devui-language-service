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
const tss = require("typescript/lib/tsserverlibrary");
const expression_diagnostics_1 = require("./expression_diagnostics");
const expressions_1 = require("./expressions");
const types_1 = require("./types");
const utils_1 = require("./utils");
/**
 * Traverses a template AST and locates symbol(s) at a specified position.
 * @param info template AST information set
 * @param position location to locate symbols at
 */
function locateSymbols(info, position) {
    const templatePosition = position - info.template.span.start;
    // TODO: update `findTemplateAstAt` to use absolute positions.
    const path = utils_1.findTemplateAstAt(info.templateAst, templatePosition);
    const attribute = findAttribute(info, position);
    if (!path.tail)
        return [];
    const narrowest = utils_1.spanOf(path.tail);
    const toVisit = [];
    for (let node = path.tail; node && utils_1.isNarrower(utils_1.spanOf(node.sourceSpan), narrowest); node = path.parentOf(node)) {
        toVisit.push(node);
    }
    // For the structural directive, only care about the last template AST.
    if (attribute === null || attribute === void 0 ? void 0 : attribute.name.startsWith('*')) {
        toVisit.splice(0, toVisit.length - 1);
    }
    return toVisit.map(ast => locateSymbol(ast, path, info))
        .filter((sym) => sym !== undefined);
}
exports.locateSymbols = locateSymbols;
/**
 * Visits a template node and locates the symbol in that node at a path position.
 * @param ast template AST node to visit
 * @param path non-empty set of narrowing AST nodes at a position
 * @param info template AST information set
 */
function locateSymbol(ast, path, info) {
    const templatePosition = path.position;
    const position = templatePosition + info.template.span.start;
    let symbol;
    let span;
    let staticSymbol;
    const attributeValueSymbol = (ast) => {
        const attribute = findAttribute(info, position);
        if (attribute) {
            if (utils_1.inSpan(templatePosition, utils_1.spanOf(attribute.valueSpan))) {
                let result;
                if (attribute.name.startsWith('*')) {
                    result = getSymbolInMicrosyntax(info, path, attribute);
                }
                else {
                    const dinfo = utils_1.diagnosticInfoFromTemplateInfo(info);
                    const scope = expression_diagnostics_1.getExpressionScope(dinfo, path);
                    result = expressions_1.getExpressionSymbol(scope, ast, templatePosition, info.template.query);
                }
                if (result) {
                    symbol = result.symbol;
                    span = utils_1.offsetSpan(result.span, attribute.valueSpan.start.offset);
                }
                return true;
            }
        }
        return false;
    };
    ast.visit({
        visitNgContent(ast) { },
        visitEmbeddedTemplate(ast) { },
        visitElement(ast) {
            const component = ast.directives.find(d => d.directive.isComponent);
            if (component) {
                // Need to cast because 'reference' is typed as any
                staticSymbol = component.directive.type.reference;
                symbol = info.template.query.getTypeSymbol(staticSymbol);
                symbol = symbol && new OverrideKindSymbol(symbol, types_1.DirectiveKind.COMPONENT);
                span = utils_1.spanOf(ast);
            }
            else {
                // Find a directive that matches the element name
                const directive = ast.directives.find(d => d.directive.selector != null && d.directive.selector.indexOf(ast.name) >= 0);
                if (directive) {
                    // Need to cast because 'reference' is typed as any
                    staticSymbol = directive.directive.type.reference;
                    symbol = info.template.query.getTypeSymbol(staticSymbol);
                    symbol = symbol && new OverrideKindSymbol(symbol, types_1.DirectiveKind.DIRECTIVE);
                    span = utils_1.spanOf(ast);
                }
            }
        },
        visitReference(ast) {
            symbol = ast.value && info.template.query.getTypeSymbol(compiler_1.tokenReference(ast.value));
            span = utils_1.spanOf(ast);
        },
        visitVariable(ast) { },
        visitEvent(ast) {
            if (!attributeValueSymbol(ast.handler)) {
                symbol = utils_1.findOutputBinding(ast, path, info.template.query);
                symbol = symbol && new OverrideKindSymbol(symbol, types_1.DirectiveKind.EVENT);
                span = utils_1.spanOf(ast);
            }
        },
        visitElementProperty(ast) { attributeValueSymbol(ast.value); },
        visitAttr(ast) {
            const element = path.first(compiler_1.ElementAst);
            if (!element)
                return;
            // Create a mapping of all directives applied to the element from their selectors.
            const matcher = new compiler_1.SelectorMatcher();
            for (const dir of element.directives) {
                if (!dir.directive.selector)
                    continue;
                matcher.addSelectables(compiler_1.CssSelector.parse(dir.directive.selector), dir);
            }
            // See if this attribute matches the selector of any directive on the element.
            const attributeSelector = `[${ast.name}=${ast.value}]`;
            const parsedAttribute = compiler_1.CssSelector.parse(attributeSelector);
            if (!parsedAttribute.length)
                return;
            matcher.match(parsedAttribute[0], (_, { directive }) => {
                // Need to cast because 'reference' is typed as any
                staticSymbol = directive.type.reference;
                symbol = info.template.query.getTypeSymbol(staticSymbol);
                symbol = symbol && new OverrideKindSymbol(symbol, types_1.DirectiveKind.DIRECTIVE);
                span = utils_1.spanOf(ast);
            });
        },
        visitBoundText(ast) {
            const expressionPosition = templatePosition - ast.sourceSpan.start.offset;
            if (utils_1.inSpan(expressionPosition, ast.value.span)) {
                const dinfo = utils_1.diagnosticInfoFromTemplateInfo(info);
                const scope = expression_diagnostics_1.getExpressionScope(dinfo, path);
                const result = expressions_1.getExpressionSymbol(scope, ast.value, templatePosition, info.template.query);
                if (result) {
                    symbol = result.symbol;
                    span = utils_1.offsetSpan(result.span, ast.sourceSpan.start.offset);
                }
            }
        },
        visitText(ast) { },
        visitDirective(ast) {
            // Need to cast because 'reference' is typed as any
            staticSymbol = ast.directive.type.reference;
            symbol = info.template.query.getTypeSymbol(staticSymbol);
            span = utils_1.spanOf(ast);
        },
        visitDirectiveProperty(ast) {
            if (!attributeValueSymbol(ast.value)) {
                const directive = findParentOfBinding(info.templateAst, ast, templatePosition);
                const attribute = findAttribute(info, position);
                if (directive && attribute) {
                    if (attribute.name.startsWith('*')) {
                        const compileTypeSummary = directive.directive;
                        symbol = info.template.query.getTypeSymbol(compileTypeSummary.type.reference);
                        symbol = symbol && new OverrideKindSymbol(symbol, types_1.DirectiveKind.DIRECTIVE);
                        // Use 'attribute.sourceSpan' instead of the directive's,
                        // because the span of the directive is the whole opening tag of an element.
                        span = utils_1.spanOf(attribute.sourceSpan);
                    }
                    else {
                        symbol = findInputBinding(info, ast.templateName, directive);
                        span = utils_1.spanOf(ast);
                    }
                }
            }
        }
    }, null);
    if (symbol && span) {
        const { start, end } = utils_1.offsetSpan(span, info.template.span.start);
        return {
            symbol,
            span: tss.createTextSpanFromBounds(start, end), staticSymbol,
        };
    }
}
// Get the symbol in microsyntax at template position.
function getSymbolInMicrosyntax(info, path, attribute) {
    if (!attribute.valueSpan) {
        return;
    }
    let result;
    const { templateBindings } = info.expressionParser.parseTemplateBindings(attribute.name, attribute.value, attribute.sourceSpan.toString(), attribute.valueSpan.start.offset);
    // Find where the cursor is relative to the start of the attribute value.
    const valueRelativePosition = path.position - attribute.valueSpan.start.offset;
    // Find the symbol that contains the position.
    templateBindings.filter(tb => !tb.keyIsVar).forEach(tb => {
        var _a;
        if (utils_1.inSpan(valueRelativePosition, (_a = tb.value) === null || _a === void 0 ? void 0 : _a.ast.span)) {
            const dinfo = utils_1.diagnosticInfoFromTemplateInfo(info);
            const scope = expression_diagnostics_1.getExpressionScope(dinfo, path);
            result = expressions_1.getExpressionSymbol(scope, tb.value, path.position, info.template.query);
        }
        else if (utils_1.inSpan(valueRelativePosition, tb.span)) {
            const template = path.first(compiler_1.EmbeddedTemplateAst);
            if (template) {
                // One element can only have one template binding.
                const directiveAst = template.directives[0];
                if (directiveAst) {
                    const symbol = findInputBinding(info, tb.key.substring(1), directiveAst);
                    if (symbol) {
                        result = { symbol, span: tb.span };
                    }
                }
            }
        }
    });
    return result;
}
function findAttribute(info, position) {
    const templatePosition = position - info.template.span.start;
    const path = utils_1.getPathToNodeAtPosition(info.htmlAst, templatePosition);
    return path.first(compiler_1.Attribute);
}
// TODO: remove this function after the path includes 'DirectiveAst'.
// Find the directive that corresponds to the specified 'binding'
// at the specified 'position' in the 'ast'.
function findParentOfBinding(ast, binding, position) {
    let res;
    const visitor = new class extends compiler_1.RecursiveTemplateAstVisitor {
        visit(ast) {
            const span = utils_1.spanOf(ast);
            if (!utils_1.inSpan(position, span)) {
                // Returning a value here will result in the children being skipped.
                return true;
            }
        }
        visitEmbeddedTemplate(ast, context) {
            return this.visitChildren(context, visit => {
                visit(ast.directives);
                visit(ast.children);
            });
        }
        visitElement(ast, context) {
            return this.visitChildren(context, visit => {
                visit(ast.directives);
                visit(ast.children);
            });
        }
        visitDirective(ast) {
            const result = this.visitChildren(ast, visit => { visit(ast.inputs); });
            return result;
        }
        visitDirectiveProperty(ast, context) {
            if (ast === binding) {
                res = context;
            }
        }
    };
    compiler_1.templateVisitAll(visitor, ast);
    return res;
}
// Find the symbol of input binding in 'directiveAst' by 'name'.
function findInputBinding(info, name, directiveAst) {
    const invertedInput = utils_1.invertMap(directiveAst.directive.inputs);
    const fieldName = invertedInput[name];
    if (fieldName) {
        const classSymbol = info.template.query.getTypeSymbol(directiveAst.directive.type.reference);
        if (classSymbol) {
            return classSymbol.members().get(fieldName);
        }
    }
}
/**
 * Wrap a symbol and change its kind to component.
 */
class OverrideKindSymbol {
    constructor(sym, kindOverride) {
        this.sym = sym;
        this.kind = kindOverride;
    }
    get name() { return this.sym.name; }
    get language() { return this.sym.language; }
    get type() { return this.sym.type; }
    get container() { return this.sym.container; }
    get public() { return this.sym.public; }
    get callable() { return this.sym.callable; }
    get nullable() { return this.sym.nullable; }
    get definition() { return this.sym.definition; }
    get documentation() { return this.sym.documentation; }
    members() { return this.sym.members(); }
    signatures() { return this.sym.signatures(); }
    selectSignature(types) { return this.sym.selectSignature(types); }
    indexed(argument) { return this.sym.indexed(argument); }
    typeArguments() { return this.sym.typeArguments(); }
}
//# sourceMappingURL=locate_symbol.js.map