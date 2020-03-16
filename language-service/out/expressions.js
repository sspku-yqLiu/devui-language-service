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
const expression_type_1 = require("./expression_type");
const types_1 = require("./types");
const utils_1 = require("./utils");
function findAstAt(ast, position, excludeEmpty = false) {
    const path = [];
    const visitor = new class extends compiler_1.RecursiveAstVisitor {
        visit(ast) {
            if ((!excludeEmpty || ast.sourceSpan.start < ast.sourceSpan.end) &&
                utils_1.inSpan(position, ast.sourceSpan)) {
                path.push(ast);
                ast.visit(this);
            }
        }
    };
    // We never care about the ASTWithSource node and its visit() method calls its ast's visit so
    // the visit() method above would never see it.
    if (ast instanceof compiler_1.ASTWithSource) {
        ast = ast.ast;
    }
    visitor.visit(ast);
    return new compiler_1.AstPath(path, position);
}
function getExpressionCompletions(scope, ast, position, query) {
    const path = findAstAt(ast, position);
    if (path.empty)
        return undefined;
    const tail = path.tail;
    let result = scope;
    function getType(ast) { return new expression_type_1.AstType(scope, query, {}).getType(ast); }
    // If the completion request is in a not in a pipe or property access then the global scope
    // (that is the scope of the implicit receiver) is the right scope as the user is typing the
    // beginning of an expression.
    tail.visit({
        visitBinary(ast) { },
        visitChain(ast) { },
        visitConditional(ast) { },
        visitFunctionCall(ast) { },
        visitImplicitReceiver(ast) { },
        visitInterpolation(ast) { result = undefined; },
        visitKeyedRead(ast) { },
        visitKeyedWrite(ast) { },
        visitLiteralArray(ast) { },
        visitLiteralMap(ast) { },
        visitLiteralPrimitive(ast) { },
        visitMethodCall(ast) { },
        visitPipe(ast) {
            if (position >= ast.exp.span.end &&
                (!ast.args || !ast.args.length || position < ast.args[0].span.start)) {
                // We are in a position a pipe name is expected.
                result = query.getPipes();
            }
        },
        visitPrefixNot(ast) { },
        visitNonNullAssert(ast) { },
        visitPropertyRead(ast) {
            const receiverType = getType(ast.receiver);
            result = receiverType ? receiverType.members() : scope;
        },
        visitPropertyWrite(ast) {
            const receiverType = getType(ast.receiver);
            result = receiverType ? receiverType.members() : scope;
        },
        visitQuote(ast) {
            // For a quote, return the members of any (if there are any).
            result = query.getBuiltinType(types_1.BuiltinType.Any).members();
        },
        visitSafeMethodCall(ast) {
            const receiverType = getType(ast.receiver);
            result = receiverType ? receiverType.members() : scope;
        },
        visitSafePropertyRead(ast) {
            const receiverType = getType(ast.receiver);
            result = receiverType ? receiverType.members() : scope;
        },
    });
    return result && result.values();
}
exports.getExpressionCompletions = getExpressionCompletions;
function getExpressionSymbol(scope, ast, position, query) {
    const path = findAstAt(ast, position, /* excludeEmpty */ true);
    if (path.empty)
        return undefined;
    const tail = path.tail;
    function getType(ast) { return new expression_type_1.AstType(scope, query, {}).getType(ast); }
    let symbol = undefined;
    let span = undefined;
    // If the completion request is in a not in a pipe or property access then the global scope
    // (that is the scope of the implicit receiver) is the right scope as the user is typing the
    // beginning of an expression.
    tail.visit({
        visitBinary(ast) { },
        visitChain(ast) { },
        visitConditional(ast) { },
        visitFunctionCall(ast) { },
        visitImplicitReceiver(ast) { },
        visitInterpolation(ast) { },
        visitKeyedRead(ast) { },
        visitKeyedWrite(ast) { },
        visitLiteralArray(ast) { },
        visitLiteralMap(ast) { },
        visitLiteralPrimitive(ast) { },
        visitMethodCall(ast) {
            const receiverType = getType(ast.receiver);
            symbol = receiverType && receiverType.members().get(ast.name);
            span = ast.span;
        },
        visitPipe(ast) {
            if (position >= ast.exp.span.end &&
                (!ast.args || !ast.args.length || position < ast.args[0].span.start)) {
                // We are in a position a pipe name is expected.
                const pipes = query.getPipes();
                if (pipes) {
                    symbol = pipes.get(ast.name);
                    span = ast.span;
                }
            }
        },
        visitPrefixNot(ast) { },
        visitNonNullAssert(ast) { },
        visitPropertyRead(ast) {
            const receiverType = getType(ast.receiver);
            symbol = receiverType && receiverType.members().get(ast.name);
            span = ast.span;
        },
        visitPropertyWrite(ast) {
            const receiverType = getType(ast.receiver);
            const { start } = ast.span;
            symbol = receiverType && receiverType.members().get(ast.name);
            // A PropertyWrite span includes both the LHS (name) and the RHS (value) of the write. In this
            // visit, only the name is relevant.
            //   prop=$event
            //   ^^^^        name
            //        ^^^^^^ value; visited separately as a nested AST
            span = { start, end: start + ast.name.length };
        },
        visitQuote(ast) { },
        visitSafeMethodCall(ast) {
            const receiverType = getType(ast.receiver);
            symbol = receiverType && receiverType.members().get(ast.name);
            span = ast.span;
        },
        visitSafePropertyRead(ast) {
            const receiverType = getType(ast.receiver);
            symbol = receiverType && receiverType.members().get(ast.name);
            span = ast.span;
        },
    });
    if (symbol && span) {
        return { symbol, span };
    }
}
exports.getExpressionSymbol = getExpressionSymbol;
//# sourceMappingURL=expressions.js.map