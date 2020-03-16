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
const ts = require("typescript");
function isParseSourceSpan(value) {
    return value && !!value.start;
}
exports.isParseSourceSpan = isParseSourceSpan;
function spanOf(span) {
    if (!span)
        return undefined;
    if (isParseSourceSpan(span)) {
        return { start: span.start.offset, end: span.end.offset };
    }
    else {
        if (span.endSourceSpan) {
            return { start: span.sourceSpan.start.offset, end: span.endSourceSpan.end.offset };
        }
        else if (span.children && span.children.length) {
            return {
                start: span.sourceSpan.start.offset,
                end: spanOf(span.children[span.children.length - 1]).end
            };
        }
        return { start: span.sourceSpan.start.offset, end: span.sourceSpan.end.offset };
    }
}
exports.spanOf = spanOf;
function inSpan(position, span, exclusive) {
    return span != null && (exclusive ? position >= span.start && position < span.end :
        position >= span.start && position <= span.end);
}
exports.inSpan = inSpan;
function offsetSpan(span, amount) {
    return { start: span.start + amount, end: span.end + amount };
}
exports.offsetSpan = offsetSpan;
function isNarrower(spanA, spanB) {
    return spanA.start >= spanB.start && spanA.end <= spanB.end;
}
exports.isNarrower = isNarrower;
function hasTemplateReference(type) {
    for (const diDep of type.diDeps) {
        if (diDep.token && compiler_1.identifierName(diDep.token.identifier) === compiler_1.Identifiers.TemplateRef.name) {
            return true;
        }
    }
    return false;
}
exports.hasTemplateReference = hasTemplateReference;
function getSelectors(info) {
    const map = new Map();
    const results = [];
    for (const directive of info.directives) {
        const selectors = compiler_1.CssSelector.parse(directive.selector);
        for (const selector of selectors) {
            results.push(selector);
            map.set(selector, directive);
        }
    }
    return { selectors: results, map };
}
exports.getSelectors = getSelectors;
function isTypescriptVersion(low, high) {
    const version = ts.version;
    if (version.substring(0, low.length) < low)
        return false;
    if (high && (version.substring(0, high.length) > high))
        return false;
    return true;
}
exports.isTypescriptVersion = isTypescriptVersion;
function diagnosticInfoFromTemplateInfo(info) {
    return {
        fileName: info.template.fileName,
        offset: info.template.span.start,
        query: info.template.query,
        members: info.template.members,
        htmlAst: info.htmlAst,
        templateAst: info.templateAst
    };
}
exports.diagnosticInfoFromTemplateInfo = diagnosticInfoFromTemplateInfo;
function findTemplateAstAt(ast, position) {
    const path = [];
    const visitor = new class extends compiler_1.RecursiveTemplateAstVisitor {
        visit(ast) {
            let span = spanOf(ast);
            if (inSpan(position, span)) {
                const len = path.length;
                if (!len || isNarrower(span, spanOf(path[len - 1]))) {
                    path.push(ast);
                }
            }
            else {
                // Returning a value here will result in the children being skipped.
                return true;
            }
        }
        visitEmbeddedTemplate(ast, context) {
            return this.visitChildren(context, visit => {
                // Ignore reference, variable and providers
                visit(ast.attrs);
                visit(ast.directives);
                visit(ast.children);
            });
        }
        visitElement(ast, context) {
            return this.visitChildren(context, visit => {
                // Ingnore providers
                visit(ast.attrs);
                visit(ast.inputs);
                visit(ast.outputs);
                visit(ast.references);
                visit(ast.directives);
                visit(ast.children);
            });
        }
        visitDirective(ast, context) {
            // Ignore the host properties of a directive
            const result = this.visitChildren(context, visit => { visit(ast.inputs); });
            // We never care about the diretive itself, just its inputs.
            if (path[path.length - 1] === ast) {
                path.pop();
            }
            return result;
        }
    };
    compiler_1.templateVisitAll(visitor, ast);
    return new compiler_1.AstPath(path, position);
}
exports.findTemplateAstAt = findTemplateAstAt;
/**
 * Return the node that most tightly encompass the specified `position`.
 * @param node
 * @param position
 */
function findTightestNode(node, position) {
    if (node.getStart() <= position && position < node.getEnd()) {
        return node.forEachChild(c => findTightestNode(c, position)) || node;
    }
}
exports.findTightestNode = findTightestNode;
/**
 * Return metadata about `node` if it looks like an Angular directive class.
 * In this case, potential matches are `@NgModule`, `@Component`, `@Directive`,
 * `@Pipe`, etc.
 * These class declarations all share some common attributes, namely their
 * decorator takes exactly one parameter and the parameter must be an object
 * literal.
 *
 * For example,
 *     v---------- `decoratorId`
 * @NgModule({           <
 *   declarations: [],   < classDecl
 * })                    <
 * class AppModule {}    <
 *          ^----- `classId`
 *
 * @param node Potential node that represents an Angular directive.
 */
function getDirectiveClassLike(node) {
    if (!ts.isClassDeclaration(node) || !node.name || !node.decorators) {
        return;
    }
    for (const d of node.decorators) {
        const expr = d.expression;
        if (!ts.isCallExpression(expr) || expr.arguments.length !== 1 ||
            !ts.isIdentifier(expr.expression)) {
            continue;
        }
        const arg = expr.arguments[0];
        if (ts.isObjectLiteralExpression(arg)) {
            return {
                decoratorId: expr.expression,
                classId: node.name,
            };
        }
    }
}
exports.getDirectiveClassLike = getDirectiveClassLike;
/**
 * Finds the value of a property assignment that is nested in a TypeScript node and is of a certain
 * type T.
 *
 * @param startNode node to start searching for nested property assignment from
 * @param propName property assignment name
 * @param predicate function to verify that a node is of type T.
 * @return node property assignment value of type T, or undefined if none is found
 */
function findPropertyValueOfType(startNode, propName, predicate) {
    if (ts.isPropertyAssignment(startNode) && startNode.name.getText() === propName) {
        const { initializer } = startNode;
        if (predicate(initializer))
            return initializer;
    }
    return startNode.forEachChild(c => findPropertyValueOfType(c, propName, predicate));
}
exports.findPropertyValueOfType = findPropertyValueOfType;
/**
 * Find the tightest node at the specified `position` from the AST `nodes`, and
 * return the path to the node.
 * @param nodes HTML AST nodes
 * @param position
 */
function getPathToNodeAtPosition(nodes, position) {
    const path = [];
    const visitor = new class extends compiler_1.RecursiveVisitor {
        visit(ast) {
            const span = spanOf(ast);
            if (inSpan(position, span)) {
                path.push(ast);
            }
            else {
                // Returning a truthy value here will skip all children and terminate
                // the visit.
                return true;
            }
        }
    };
    compiler_1.visitAll(visitor, nodes);
    return new compiler_1.AstPath(path, position);
}
exports.getPathToNodeAtPosition = getPathToNodeAtPosition;
/**
 * Inverts an object's key-value pairs.
 */
function invertMap(obj) {
    const result = {};
    for (const name of Object.keys(obj)) {
        const v = obj[name];
        result[v] = name;
    }
    return result;
}
exports.invertMap = invertMap;
/**
 * Finds the directive member providing a template output binding, if one exists.
 * @param info aggregate template AST information
 * @param path narrowing
 */
function findOutputBinding(binding, path, query) {
    const element = path.first(compiler_1.ElementAst);
    if (element) {
        for (const directive of element.directives) {
            const invertedOutputs = invertMap(directive.directive.outputs);
            const fieldName = invertedOutputs[binding.name];
            if (fieldName) {
                const classSymbol = query.getTypeSymbol(directive.directive.type.reference);
                if (classSymbol) {
                    return classSymbol.members().get(fieldName);
                }
            }
        }
    }
}
exports.findOutputBinding = findOutputBinding;
//# sourceMappingURL=utils.js.map