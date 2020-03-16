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
const symbols_1 = require("./symbols");
// AstType calculatetype of the ast given AST element.
class AstType {
    constructor(scope, query, context) {
        this.scope = scope;
        this.query = query;
        this.context = context;
        this.diagnostics = [];
    }
    getType(ast) { return ast.visit(this); }
    getDiagnostics(ast) {
        const type = ast.visit(this);
        if (this.context.event && type.callable) {
            this.diagnostics.push(diagnostic_messages_1.createDiagnostic(ast.span, diagnostic_messages_1.Diagnostic.callable_expression_expected_method_call));
        }
        return this.diagnostics;
    }
    visitBinary(ast) {
        // Treat undefined and null as other.
        function normalize(kind, other) {
            switch (kind) {
                case symbols_1.BuiltinType.Undefined:
                case symbols_1.BuiltinType.Null:
                    return normalize(other, symbols_1.BuiltinType.Other);
            }
            return kind;
        }
        const getType = (ast, operation) => {
            const type = this.getType(ast);
            if (type.nullable) {
                switch (operation) {
                    case '&&':
                    case '||':
                    case '==':
                    case '!=':
                    case '===':
                    case '!==':
                        // Nullable allowed.
                        break;
                    default:
                        this.diagnostics.push(diagnostic_messages_1.createDiagnostic(ast.span, diagnostic_messages_1.Diagnostic.expression_might_be_null));
                        break;
                }
                return this.query.getNonNullableType(type);
            }
            return type;
        };
        const leftType = getType(ast.left, ast.operation);
        const rightType = getType(ast.right, ast.operation);
        const leftRawKind = this.query.getTypeKind(leftType);
        const rightRawKind = this.query.getTypeKind(rightType);
        const leftKind = normalize(leftRawKind, rightRawKind);
        const rightKind = normalize(rightRawKind, leftRawKind);
        // The following swtich implements operator typing similar to the
        // type production tables in the TypeScript specification.
        // https://github.com/Microsoft/TypeScript/blob/v1.8.10/doc/spec.md#4.19
        const operKind = leftKind << 8 | rightKind;
        switch (ast.operation) {
            case '*':
            case '/':
            case '%':
            case '-':
            case '<<':
            case '>>':
            case '>>>':
            case '&':
            case '^':
            case '|':
                switch (operKind) {
                    case symbols_1.BuiltinType.Any << 8 | symbols_1.BuiltinType.Any:
                    case symbols_1.BuiltinType.Number << 8 | symbols_1.BuiltinType.Any:
                    case symbols_1.BuiltinType.Any << 8 | symbols_1.BuiltinType.Number:
                    case symbols_1.BuiltinType.Number << 8 | symbols_1.BuiltinType.Number:
                        return this.query.getBuiltinType(symbols_1.BuiltinType.Number);
                    default:
                        let errorAst = ast.left;
                        switch (leftKind) {
                            case symbols_1.BuiltinType.Any:
                            case symbols_1.BuiltinType.Number:
                                errorAst = ast.right;
                                break;
                        }
                        this.diagnostics.push(diagnostic_messages_1.createDiagnostic(errorAst.span, diagnostic_messages_1.Diagnostic.expected_a_number_type));
                        return this.anyType;
                }
            case '+':
                switch (operKind) {
                    case symbols_1.BuiltinType.Any << 8 | symbols_1.BuiltinType.Any:
                    case symbols_1.BuiltinType.Any << 8 | symbols_1.BuiltinType.Boolean:
                    case symbols_1.BuiltinType.Any << 8 | symbols_1.BuiltinType.Number:
                    case symbols_1.BuiltinType.Any << 8 | symbols_1.BuiltinType.Other:
                    case symbols_1.BuiltinType.Boolean << 8 | symbols_1.BuiltinType.Any:
                    case symbols_1.BuiltinType.Number << 8 | symbols_1.BuiltinType.Any:
                    case symbols_1.BuiltinType.Other << 8 | symbols_1.BuiltinType.Any:
                        return this.anyType;
                    case symbols_1.BuiltinType.Any << 8 | symbols_1.BuiltinType.String:
                    case symbols_1.BuiltinType.Boolean << 8 | symbols_1.BuiltinType.String:
                    case symbols_1.BuiltinType.Number << 8 | symbols_1.BuiltinType.String:
                    case symbols_1.BuiltinType.String << 8 | symbols_1.BuiltinType.Any:
                    case symbols_1.BuiltinType.String << 8 | symbols_1.BuiltinType.Boolean:
                    case symbols_1.BuiltinType.String << 8 | symbols_1.BuiltinType.Number:
                    case symbols_1.BuiltinType.String << 8 | symbols_1.BuiltinType.String:
                    case symbols_1.BuiltinType.String << 8 | symbols_1.BuiltinType.Other:
                    case symbols_1.BuiltinType.Other << 8 | symbols_1.BuiltinType.String:
                        return this.query.getBuiltinType(symbols_1.BuiltinType.String);
                    case symbols_1.BuiltinType.Number << 8 | symbols_1.BuiltinType.Number:
                        return this.query.getBuiltinType(symbols_1.BuiltinType.Number);
                    case symbols_1.BuiltinType.Boolean << 8 | symbols_1.BuiltinType.Number:
                    case symbols_1.BuiltinType.Other << 8 | symbols_1.BuiltinType.Number:
                        this.diagnostics.push(diagnostic_messages_1.createDiagnostic(ast.left.span, diagnostic_messages_1.Diagnostic.expected_a_number_type));
                        return this.anyType;
                    case symbols_1.BuiltinType.Number << 8 | symbols_1.BuiltinType.Boolean:
                    case symbols_1.BuiltinType.Number << 8 | symbols_1.BuiltinType.Other:
                        this.diagnostics.push(diagnostic_messages_1.createDiagnostic(ast.right.span, diagnostic_messages_1.Diagnostic.expected_a_number_type));
                        return this.anyType;
                    default:
                        this.diagnostics.push(diagnostic_messages_1.createDiagnostic(ast.span, diagnostic_messages_1.Diagnostic.expected_a_string_or_number_type));
                        return this.anyType;
                }
            case '>':
            case '<':
            case '<=':
            case '>=':
            case '==':
            case '!=':
            case '===':
            case '!==':
                switch (operKind) {
                    case symbols_1.BuiltinType.Any << 8 | symbols_1.BuiltinType.Any:
                    case symbols_1.BuiltinType.Any << 8 | symbols_1.BuiltinType.Boolean:
                    case symbols_1.BuiltinType.Any << 8 | symbols_1.BuiltinType.Number:
                    case symbols_1.BuiltinType.Any << 8 | symbols_1.BuiltinType.String:
                    case symbols_1.BuiltinType.Any << 8 | symbols_1.BuiltinType.Other:
                    case symbols_1.BuiltinType.Boolean << 8 | symbols_1.BuiltinType.Any:
                    case symbols_1.BuiltinType.Boolean << 8 | symbols_1.BuiltinType.Boolean:
                    case symbols_1.BuiltinType.Number << 8 | symbols_1.BuiltinType.Any:
                    case symbols_1.BuiltinType.Number << 8 | symbols_1.BuiltinType.Number:
                    case symbols_1.BuiltinType.String << 8 | symbols_1.BuiltinType.Any:
                    case symbols_1.BuiltinType.String << 8 | symbols_1.BuiltinType.String:
                    case symbols_1.BuiltinType.Other << 8 | symbols_1.BuiltinType.Any:
                    case symbols_1.BuiltinType.Other << 8 | symbols_1.BuiltinType.Other:
                        return this.query.getBuiltinType(symbols_1.BuiltinType.Boolean);
                    default:
                        this.diagnostics.push(diagnostic_messages_1.createDiagnostic(ast.span, diagnostic_messages_1.Diagnostic.expected_operands_of_similar_type_or_any));
                        return this.anyType;
                }
            case '&&':
                return rightType;
            case '||':
                return this.query.getTypeUnion(leftType, rightType);
        }
        this.diagnostics.push(diagnostic_messages_1.createDiagnostic(ast.span, diagnostic_messages_1.Diagnostic.unrecognized_operator, ast.operation));
        return this.anyType;
    }
    visitChain(ast) {
        // If we are producing diagnostics, visit the children
        for (const expr of ast.expressions) {
            expr.visit(this);
        }
        // The type of a chain is always undefined.
        return this.query.getBuiltinType(symbols_1.BuiltinType.Undefined);
    }
    visitConditional(ast) {
        // The type of a conditional is the union of the true and false conditions.
        ast.condition.visit(this);
        ast.trueExp.visit(this);
        ast.falseExp.visit(this);
        return this.query.getTypeUnion(this.getType(ast.trueExp), this.getType(ast.falseExp));
    }
    visitFunctionCall(ast) {
        // The type of a function call is the return type of the selected signature.
        // The signature is selected based on the types of the arguments. Angular doesn't
        // support contextual typing of arguments so this is simpler than TypeScript's
        // version.
        const args = ast.args.map(arg => this.getType(arg));
        const target = this.getType(ast.target);
        if (!target || !target.callable) {
            this.diagnostics.push(diagnostic_messages_1.createDiagnostic(ast.span, diagnostic_messages_1.Diagnostic.call_target_not_callable));
            return this.anyType;
        }
        const signature = target.selectSignature(args);
        if (signature) {
            return signature.result;
        }
        // TODO: Consider a better error message here.
        this.diagnostics.push(diagnostic_messages_1.createDiagnostic(ast.span, diagnostic_messages_1.Diagnostic.unable_to_resolve_compatible_call_signature));
        return this.anyType;
    }
    visitImplicitReceiver(ast) {
        const _this = this;
        // Return a pseudo-symbol for the implicit receiver.
        // The members of the implicit receiver are what is defined by the
        // scope passed into this class.
        return {
            name: '$implicit',
            kind: 'component',
            language: 'ng-template',
            type: undefined,
            container: undefined,
            callable: false,
            nullable: false,
            public: true,
            definition: undefined,
            documentation: [],
            members() { return _this.scope; },
            signatures() { return []; },
            selectSignature(types) { return undefined; },
            indexed(argument) { return undefined; },
            typeArguments() { return undefined; },
        };
    }
    visitInterpolation(ast) {
        // If we are producing diagnostics, visit the children.
        for (const expr of ast.expressions) {
            expr.visit(this);
        }
        return this.undefinedType;
    }
    visitKeyedRead(ast) {
        const targetType = this.getType(ast.obj);
        const keyType = this.getType(ast.key);
        const result = targetType.indexed(keyType, ast.key instanceof compiler_1.LiteralPrimitive ? ast.key.value : undefined);
        return result || this.anyType;
    }
    visitKeyedWrite(ast) {
        // The write of a type is the type of the value being written.
        return this.getType(ast.value);
    }
    visitLiteralArray(ast) {
        // A type literal is an array type of the union of the elements
        return this.query.getArrayType(this.query.getTypeUnion(...ast.expressions.map(element => this.getType(element))));
    }
    visitLiteralMap(ast) {
        // If we are producing diagnostics, visit the children
        for (const value of ast.values) {
            value.visit(this);
        }
        // TODO: Return a composite type.
        return this.anyType;
    }
    visitLiteralPrimitive(ast) {
        // The type of a literal primitive depends on the value of the literal.
        switch (ast.value) {
            case true:
            case false:
                return this.query.getBuiltinType(symbols_1.BuiltinType.Boolean);
            case null:
                return this.query.getBuiltinType(symbols_1.BuiltinType.Null);
            case undefined:
                return this.query.getBuiltinType(symbols_1.BuiltinType.Undefined);
            default:
                switch (typeof ast.value) {
                    case 'string':
                        return this.query.getBuiltinType(symbols_1.BuiltinType.String);
                    case 'number':
                        return this.query.getBuiltinType(symbols_1.BuiltinType.Number);
                    default:
                        this.diagnostics.push(diagnostic_messages_1.createDiagnostic(ast.span, diagnostic_messages_1.Diagnostic.unrecognized_primitive, typeof ast.value));
                        return this.anyType;
                }
        }
    }
    visitMethodCall(ast) {
        return this.resolveMethodCall(this.getType(ast.receiver), ast);
    }
    visitPipe(ast) {
        // The type of a pipe node is the return type of the pipe's transform method. The table returned
        // by getPipes() is expected to contain symbols with the corresponding transform method type.
        const pipe = this.query.getPipes().get(ast.name);
        if (!pipe) {
            this.diagnostics.push(diagnostic_messages_1.createDiagnostic(ast.span, diagnostic_messages_1.Diagnostic.no_pipe_found, ast.name));
            return this.anyType;
        }
        const expType = this.getType(ast.exp);
        const signature = pipe.selectSignature([expType].concat(ast.args.map(arg => this.getType(arg))));
        if (!signature) {
            this.diagnostics.push(diagnostic_messages_1.createDiagnostic(ast.span, diagnostic_messages_1.Diagnostic.unable_to_resolve_signature, ast.name));
            return this.anyType;
        }
        return signature.result;
    }
    visitPrefixNot(ast) {
        // If we are producing diagnostics, visit the children
        ast.expression.visit(this);
        // The type of a prefix ! is always boolean.
        return this.query.getBuiltinType(symbols_1.BuiltinType.Boolean);
    }
    visitNonNullAssert(ast) {
        const expressionType = this.getType(ast.expression);
        return this.query.getNonNullableType(expressionType);
    }
    visitPropertyRead(ast) {
        return this.resolvePropertyRead(this.getType(ast.receiver), ast);
    }
    visitPropertyWrite(ast) {
        // The type of a write is the type of the value being written.
        return this.getType(ast.value);
    }
    visitQuote(ast) {
        // The type of a quoted expression is any.
        return this.query.getBuiltinType(symbols_1.BuiltinType.Any);
    }
    visitSafeMethodCall(ast) {
        return this.resolveMethodCall(this.query.getNonNullableType(this.getType(ast.receiver)), ast);
    }
    visitSafePropertyRead(ast) {
        return this.resolvePropertyRead(this.query.getNonNullableType(this.getType(ast.receiver)), ast);
    }
    get anyType() {
        let result = this._anyType;
        if (!result) {
            result = this._anyType = this.query.getBuiltinType(symbols_1.BuiltinType.Any);
        }
        return result;
    }
    get undefinedType() {
        let result = this._undefinedType;
        if (!result) {
            result = this._undefinedType = this.query.getBuiltinType(symbols_1.BuiltinType.Undefined);
        }
        return result;
    }
    resolveMethodCall(receiverType, ast) {
        if (this.isAny(receiverType)) {
            return this.anyType;
        }
        const methodType = this.resolvePropertyRead(receiverType, ast);
        if (!methodType) {
            this.diagnostics.push(diagnostic_messages_1.createDiagnostic(ast.span, diagnostic_messages_1.Diagnostic.could_not_resolve_type, ast.name));
            return this.anyType;
        }
        if (this.isAny(methodType)) {
            return this.anyType;
        }
        if (!methodType.callable) {
            this.diagnostics.push(diagnostic_messages_1.createDiagnostic(ast.span, diagnostic_messages_1.Diagnostic.identifier_not_callable, ast.name));
            return this.anyType;
        }
        const signature = methodType.selectSignature(ast.args.map(arg => this.getType(arg)));
        if (!signature) {
            this.diagnostics.push(diagnostic_messages_1.createDiagnostic(ast.span, diagnostic_messages_1.Diagnostic.unable_to_resolve_signature, ast.name));
            return this.anyType;
        }
        return signature.result;
    }
    resolvePropertyRead(receiverType, ast) {
        if (this.isAny(receiverType)) {
            return this.anyType;
        }
        // The type of a property read is the seelcted member's type.
        const member = receiverType.members().get(ast.name);
        if (!member) {
            if (receiverType.name === '$implicit') {
                this.diagnostics.push(diagnostic_messages_1.createDiagnostic(ast.span, diagnostic_messages_1.Diagnostic.identifier_not_defined_in_app_context, ast.name));
            }
            else if (receiverType.nullable && ast.receiver instanceof compiler_1.PropertyRead) {
                const receiver = ast.receiver.name;
                this.diagnostics.push(diagnostic_messages_1.createDiagnostic(ast.span, diagnostic_messages_1.Diagnostic.identifier_possibly_undefined, receiver, `${receiver}?.${ast.name}`, `${receiver}!.${ast.name}`));
            }
            else {
                this.diagnostics.push(diagnostic_messages_1.createDiagnostic(ast.span, diagnostic_messages_1.Diagnostic.identifier_not_defined_on_receiver, ast.name, receiverType.name));
            }
            return this.anyType;
        }
        if (!member.public) {
            const container = receiverType.name === '$implicit' ? 'the component' : `'${receiverType.name}'`;
            this.diagnostics.push(diagnostic_messages_1.createDiagnostic(ast.span, diagnostic_messages_1.Diagnostic.identifier_is_private, ast.name, container));
        }
        return member.type;
    }
    isAny(symbol) {
        return !symbol || this.query.getTypeKind(symbol) === symbols_1.BuiltinType.Any ||
            (!!symbol.type && this.isAny(symbol.type));
    }
}
exports.AstType = AstType;
//# sourceMappingURL=expression_type.js.map