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
const symbols_1 = require("./symbols");
// In TypeScript 2.1 these flags moved
// These helpers work for both 2.0 and 2.1.
const isPrivate = ts.ModifierFlags ?
    ((node) => !!(ts.getCombinedModifierFlags(node) & ts.ModifierFlags.Private)) :
    ((node) => !!(node.flags & ts.NodeFlags.Private));
const isReferenceType = ts.ObjectFlags ?
    ((type) => !!(type.flags & ts.TypeFlags.Object &&
        type.objectFlags & ts.ObjectFlags.Reference)) :
    ((type) => !!(type.flags & ts.TypeFlags.Reference));
function getSymbolQuery(program, checker, source, fetchPipes) {
    return new TypeScriptSymbolQuery(program, checker, source, fetchPipes);
}
exports.getSymbolQuery = getSymbolQuery;
function getClassMembers(program, checker, staticSymbol) {
    const declaration = getClassFromStaticSymbol(program, staticSymbol);
    if (declaration) {
        const type = checker.getTypeAtLocation(declaration);
        const node = program.getSourceFile(staticSymbol.filePath);
        if (node) {
            return new TypeWrapper(type, { node, program, checker }).members();
        }
    }
}
exports.getClassMembers = getClassMembers;
function getClassMembersFromDeclaration(program, checker, source, declaration) {
    const type = checker.getTypeAtLocation(declaration);
    return new TypeWrapper(type, { node: source, program, checker }).members();
}
exports.getClassMembersFromDeclaration = getClassMembersFromDeclaration;
function getClassFromStaticSymbol(program, type) {
    const source = program.getSourceFile(type.filePath);
    if (source) {
        return ts.forEachChild(source, child => {
            if (child.kind === ts.SyntaxKind.ClassDeclaration) {
                const classDeclaration = child;
                if (classDeclaration.name != null && classDeclaration.name.text === type.name) {
                    return classDeclaration;
                }
            }
        });
    }
    return undefined;
}
exports.getClassFromStaticSymbol = getClassFromStaticSymbol;
function getPipesTable(source, program, checker, pipes) {
    return new PipesTable(pipes, { program, checker, node: source });
}
exports.getPipesTable = getPipesTable;
class TypeScriptSymbolQuery {
    constructor(program, checker, source, fetchPipes) {
        this.program = program;
        this.checker = checker;
        this.source = source;
        this.fetchPipes = fetchPipes;
        this.typeCache = new Map();
    }
    getTypeKind(symbol) {
        const type = symbol instanceof TypeWrapper ? symbol.tsType : undefined;
        return typeKindOf(type);
    }
    getBuiltinType(kind) {
        let result = this.typeCache.get(kind);
        if (!result) {
            const type = getTsTypeFromBuiltinType(kind, {
                checker: this.checker,
                node: this.source,
                program: this.program,
            });
            result =
                new TypeWrapper(type, { program: this.program, checker: this.checker, node: this.source });
            this.typeCache.set(kind, result);
        }
        return result;
    }
    getTypeUnion(...types) {
        // No API exists so return any if the types are not all the same type.
        let result = undefined;
        if (types.length) {
            result = types[0];
            for (let i = 1; i < types.length; i++) {
                if (types[i] != result) {
                    result = undefined;
                    break;
                }
            }
        }
        return result || this.getBuiltinType(symbols_1.BuiltinType.Any);
    }
    getArrayType(type) { return this.getBuiltinType(symbols_1.BuiltinType.Any); }
    getElementType(type) {
        if (type instanceof TypeWrapper) {
            const tSymbol = type.tsType.symbol;
            const tArgs = type.typeArguments();
            if (!tSymbol || tSymbol.name !== 'Array' || !tArgs || tArgs.length != 1)
                return;
            return tArgs[0];
        }
    }
    getNonNullableType(symbol) {
        if (symbol instanceof TypeWrapper && (typeof this.checker.getNonNullableType == 'function')) {
            const tsType = symbol.tsType;
            const nonNullableType = this.checker.getNonNullableType(tsType);
            if (nonNullableType != tsType) {
                return new TypeWrapper(nonNullableType, symbol.context);
            }
            else if (nonNullableType == tsType) {
                return symbol;
            }
        }
        return this.getBuiltinType(symbols_1.BuiltinType.Any);
    }
    getPipes() {
        let result = this.pipesCache;
        if (!result) {
            result = this.pipesCache = this.fetchPipes();
        }
        return result;
    }
    getTemplateContext(type) {
        const context = { node: this.source, program: this.program, checker: this.checker };
        const typeSymbol = findClassSymbolInContext(type, context);
        if (typeSymbol) {
            const contextType = this.getTemplateRefContextType(typeSymbol, context);
            if (contextType)
                return contextType.members();
        }
    }
    getTypeSymbol(type) {
        const context = { node: this.source, program: this.program, checker: this.checker };
        const typeSymbol = findClassSymbolInContext(type, context);
        return typeSymbol && new SymbolWrapper(typeSymbol, context);
    }
    createSymbolTable(symbols) {
        const result = new MapSymbolTable();
        result.addAll(symbols.map(s => new DeclaredSymbol(s)));
        return result;
    }
    mergeSymbolTable(symbolTables) {
        const result = new MapSymbolTable();
        for (const symbolTable of symbolTables) {
            result.addAll(symbolTable.values());
        }
        return result;
    }
    getSpanAt(line, column) {
        return spanAt(this.source, line, column);
    }
    getTemplateRefContextType(typeSymbol, context) {
        const type = this.checker.getTypeOfSymbolAtLocation(typeSymbol, this.source);
        const constructor = type.symbol && type.symbol.members &&
            getFromSymbolTable(type.symbol.members, '__constructor');
        if (constructor) {
            const constructorDeclaration = constructor.declarations[0];
            for (const parameter of constructorDeclaration.parameters) {
                const type = this.checker.getTypeAtLocation(parameter.type);
                if (type.symbol.name == 'TemplateRef' && isReferenceType(type)) {
                    const typeWrapper = new TypeWrapper(type, context);
                    const typeArguments = typeWrapper.typeArguments();
                    if (typeArguments && typeArguments.length === 1) {
                        return typeArguments[0];
                    }
                }
            }
        }
    }
}
function typeCallable(type) {
    const signatures = type.getCallSignatures();
    return signatures && signatures.length != 0;
}
function signaturesOf(type, context) {
    return type.getCallSignatures().map(s => new SignatureWrapper(s, context));
}
function selectSignature(type, context, types) {
    // TODO: Do a better job of selecting the right signature.
    const signatures = type.getCallSignatures();
    return signatures.length ? new SignatureWrapper(signatures[0], context) : undefined;
}
class TypeWrapper {
    constructor(tsType, context) {
        this.tsType = tsType;
        this.context = context;
        this.kind = 'type';
        this.language = 'typescript';
        this.type = undefined;
        this.container = undefined;
        this.public = true;
        if (!tsType) {
            throw Error('Internal: null type');
        }
    }
    get name() { return this.context.checker.typeToString(this.tsType); }
    get callable() { return typeCallable(this.tsType); }
    get nullable() {
        return this.context.checker.getNonNullableType(this.tsType) != this.tsType;
    }
    get documentation() {
        const symbol = this.tsType.getSymbol();
        if (!symbol) {
            return [];
        }
        return symbol.getDocumentationComment(this.context.checker);
    }
    get definition() {
        const symbol = this.tsType.getSymbol();
        return symbol ? definitionFromTsSymbol(symbol) : undefined;
    }
    members() {
        // Should call getApparentProperties() instead of getProperties() because
        // the former includes properties on the base class whereas the latter does
        // not. This provides properties like .bind(), .call(), .apply(), etc for
        // functions.
        return new SymbolTableWrapper(this.tsType.getApparentProperties(), this.context, this.tsType);
    }
    signatures() { return signaturesOf(this.tsType, this.context); }
    selectSignature(types) {
        return selectSignature(this.tsType, this.context, types);
    }
    indexed(type, value) {
        if (!(type instanceof TypeWrapper))
            return;
        const typeKind = typeKindOf(type.tsType);
        switch (typeKind) {
            case symbols_1.BuiltinType.Number:
                const nType = this.tsType.getNumberIndexType();
                if (nType) {
                    // get the right tuple type by value, like 'var t: [number, string];'
                    if (nType.isUnion()) {
                        // return undefined if array index out of bound.
                        return nType.types[value] && new TypeWrapper(nType.types[value], this.context);
                    }
                    return new TypeWrapper(nType, this.context);
                }
                return undefined;
            case symbols_1.BuiltinType.String:
                const sType = this.tsType.getStringIndexType();
                return sType && new TypeWrapper(sType, this.context);
        }
    }
    typeArguments() {
        if (!isReferenceType(this.tsType))
            return;
        const typeReference = this.tsType;
        let typeArguments;
        typeArguments = this.context.checker.getTypeArguments(typeReference);
        if (!typeArguments)
            return undefined;
        return typeArguments.map(ta => new TypeWrapper(ta, this.context));
    }
}
// If stringIndexType a primitive type(e.g. 'string'), the Symbol is undefined;
// and in AstType.resolvePropertyRead method, the Symbol.type should get the right type.
class StringIndexTypeWrapper extends TypeWrapper {
    constructor() {
        super(...arguments);
        this.type = new TypeWrapper(this.tsType, this.context);
    }
}
class SymbolWrapper {
    constructor(symbol, 
    /** TypeScript type context of the symbol. */
    context, 
    /** Type of the TypeScript symbol, if known. If not provided, the type of the symbol
    * will be determined dynamically; see `SymbolWrapper#tsType`. */
    _tsType) {
        this.context = context;
        this._tsType = _tsType;
        this.nullable = false;
        this.language = 'typescript';
        this.symbol = symbol && context && (symbol.flags & ts.SymbolFlags.Alias) ?
            context.checker.getAliasedSymbol(symbol) :
            symbol;
    }
    get name() { return this.symbol.name; }
    get kind() { return this.callable ? 'method' : 'property'; }
    get type() { return new TypeWrapper(this.tsType, this.context); }
    get container() { return getContainerOf(this.symbol, this.context); }
    get public() {
        // Symbols that are not explicitly made private are public.
        return !isSymbolPrivate(this.symbol);
    }
    get callable() { return typeCallable(this.tsType); }
    get definition() { return definitionFromTsSymbol(this.symbol); }
    get documentation() {
        return this.symbol.getDocumentationComment(this.context.checker);
    }
    members() {
        if (!this._members) {
            if ((this.symbol.flags & (ts.SymbolFlags.Class | ts.SymbolFlags.Interface)) != 0) {
                const declaredType = this.context.checker.getDeclaredTypeOfSymbol(this.symbol);
                const typeWrapper = new TypeWrapper(declaredType, this.context);
                this._members = typeWrapper.members();
            }
            else {
                this._members = new SymbolTableWrapper(this.symbol.members, this.context, this.tsType);
            }
        }
        return this._members;
    }
    signatures() { return signaturesOf(this.tsType, this.context); }
    selectSignature(types) {
        return selectSignature(this.tsType, this.context, types);
    }
    indexed(argument) { return undefined; }
    typeArguments() { return this.type.typeArguments(); }
    get tsType() {
        let type = this._tsType;
        if (!type) {
            type = this._tsType =
                this.context.checker.getTypeOfSymbolAtLocation(this.symbol, this.context.node);
        }
        return type;
    }
}
class DeclaredSymbol {
    constructor(declaration) {
        this.declaration = declaration;
        this.language = 'ng-template';
        this.nullable = false;
        this.public = true;
    }
    get name() { return this.declaration.name; }
    get kind() { return this.declaration.kind; }
    get container() { return undefined; }
    get type() { return this.declaration.type; }
    get callable() { return this.type.callable; }
    get definition() { return this.declaration.definition; }
    get documentation() { return this.declaration.type.documentation; }
    members() { return this.type.members(); }
    signatures() { return this.type.signatures(); }
    selectSignature(types) { return this.type.selectSignature(types); }
    typeArguments() { return this.type.typeArguments(); }
    indexed(argument) { return undefined; }
}
class SignatureWrapper {
    constructor(signature, context) {
        this.signature = signature;
        this.context = context;
    }
    get arguments() {
        return new SymbolTableWrapper(this.signature.getParameters(), this.context);
    }
    get result() { return new TypeWrapper(this.signature.getReturnType(), this.context); }
}
class SignatureResultOverride {
    constructor(signature, resultType) {
        this.signature = signature;
        this.resultType = resultType;
    }
    get arguments() { return this.signature.arguments; }
    get result() { return this.resultType; }
}
function toSymbolTableFactory(symbols) {
    // ∀ Typescript version >= 2.2, `SymbolTable` is implemented as an ES6 `Map`
    const result = new Map();
    for (const symbol of symbols) {
        result.set(symbol.name, symbol);
    }
    return result;
}
exports.toSymbolTableFactory = toSymbolTableFactory;
function toSymbols(symbolTable) {
    if (!symbolTable)
        return [];
    const table = symbolTable;
    if (typeof table.values === 'function') {
        return Array.from(table.values());
    }
    const result = [];
    const own = typeof table.hasOwnProperty === 'function' ?
        (name) => table.hasOwnProperty(name) :
        (name) => !!table[name];
    for (const name in table) {
        if (own(name)) {
            result.push(table[name]);
        }
    }
    return result;
}
class SymbolTableWrapper {
    /**
     * Creates a queryable table of symbols belonging to a TypeScript entity.
     * @param symbols symbols to query belonging to the entity
     * @param context program context
     * @param type original TypeScript type of entity owning the symbols, if known
     */
    constructor(symbols, context, type) {
        this.context = context;
        this.type = type;
        symbols = symbols || [];
        if (Array.isArray(symbols)) {
            this.symbols = symbols;
            this.symbolTable = toSymbolTableFactory(symbols);
        }
        else {
            this.symbols = toSymbols(symbols);
            this.symbolTable = symbols;
        }
        if (type) {
            this.stringIndexType = type.getStringIndexType();
        }
    }
    get size() { return this.symbols.length; }
    get(key) {
        const symbol = getFromSymbolTable(this.symbolTable, key);
        if (symbol) {
            return new SymbolWrapper(symbol, this.context);
        }
        if (this.stringIndexType) {
            // If the key does not exist as an explicit symbol on the type, it may be accessing a string
            // index signature using dot notation:
            //
            //   const obj<T>: { [key: string]: T };
            //   obj.stringIndex // equivalent to obj['stringIndex'];
            //
            // In this case, return the type indexed by an arbitrary string key.
            return new StringIndexTypeWrapper(this.stringIndexType, this.context);
        }
        return undefined;
    }
    has(key) {
        const table = this.symbolTable;
        return ((typeof table.has === 'function') ? table.has(key) : table[key] != null) ||
            this.stringIndexType !== undefined;
    }
    values() { return this.symbols.map(s => new SymbolWrapper(s, this.context)); }
}
class MapSymbolTable {
    constructor() {
        this.map = new Map();
        this._values = [];
    }
    get size() { return this.map.size; }
    get(key) { return this.map.get(key); }
    add(symbol) {
        if (this.map.has(symbol.name)) {
            const previous = this.map.get(symbol.name);
            this._values[this._values.indexOf(previous)] = symbol;
        }
        this.map.set(symbol.name, symbol);
        this._values.push(symbol);
    }
    addAll(symbols) {
        for (const symbol of symbols) {
            this.add(symbol);
        }
    }
    has(key) { return this.map.has(key); }
    values() {
        // Switch to this.map.values once iterables are supported by the target language.
        return this._values;
    }
}
class PipesTable {
    constructor(pipes, context) {
        this.pipes = pipes;
        this.context = context;
    }
    get size() { return this.pipes.length; }
    get(key) {
        const pipe = this.pipes.find(pipe => pipe.name == key);
        if (pipe) {
            return new PipeSymbol(pipe, this.context);
        }
    }
    has(key) { return this.pipes.find(pipe => pipe.name == key) != null; }
    values() { return this.pipes.map(pipe => new PipeSymbol(pipe, this.context)); }
}
// This matches .d.ts files that look like ".../<package-name>/<package-name>.d.ts",
const INDEX_PATTERN = /[\\/]([^\\/]+)[\\/]\1\.d\.ts$/;
class PipeSymbol {
    constructor(pipe, context) {
        this.pipe = pipe;
        this.context = context;
        this.kind = 'pipe';
        this.language = 'typescript';
        this.container = undefined;
        this.callable = true;
        this.nullable = false;
        this.public = true;
    }
    get name() { return this.pipe.name; }
    get type() { return new TypeWrapper(this.tsType, this.context); }
    get definition() {
        const symbol = this.tsType.getSymbol();
        return symbol ? definitionFromTsSymbol(symbol) : undefined;
    }
    get documentation() {
        const symbol = this.tsType.getSymbol();
        if (!symbol) {
            return [];
        }
        return symbol.getDocumentationComment(this.context.checker);
    }
    members() { return EmptyTable.instance; }
    signatures() { return signaturesOf(this.tsType, this.context); }
    selectSignature(types) {
        let signature = selectSignature(this.tsType, this.context, types);
        if (types.length > 0) {
            const parameterType = types[0];
            let resultType = undefined;
            switch (this.name) {
                case 'async':
                    // Get type argument of 'Observable', 'Promise', or 'EventEmitter'.
                    const tArgs = parameterType.typeArguments();
                    if (tArgs && tArgs.length === 1) {
                        resultType = tArgs[0];
                    }
                    break;
                case 'slice':
                    resultType = parameterType;
                    break;
            }
            if (resultType) {
                signature = new SignatureResultOverride(signature, resultType);
            }
        }
        return signature;
    }
    indexed(argument) { return undefined; }
    typeArguments() { return this.type.typeArguments(); }
    get tsType() {
        let type = this._tsType;
        if (!type) {
            const classSymbol = this.findClassSymbol(this.pipe.type.reference);
            if (classSymbol) {
                type = this._tsType = this.findTransformMethodType(classSymbol);
            }
            if (!type) {
                type = this._tsType = getTsTypeFromBuiltinType(symbols_1.BuiltinType.Any, this.context);
            }
        }
        return type;
    }
    findClassSymbol(type) {
        return findClassSymbolInContext(type, this.context);
    }
    findTransformMethodType(classSymbol) {
        const classType = this.context.checker.getDeclaredTypeOfSymbol(classSymbol);
        if (classType) {
            const transform = classType.getProperty('transform');
            if (transform) {
                return this.context.checker.getTypeOfSymbolAtLocation(transform, this.context.node);
            }
        }
    }
}
function findClassSymbolInContext(type, context) {
    let sourceFile = context.program.getSourceFile(type.filePath);
    if (!sourceFile) {
        // This handles a case where an <packageName>/index.d.ts and a <packageName>/<packageName>.d.ts
        // are in the same directory. If we are looking for <packageName>/<packageName> and didn't
        // find it, look for <packageName>/index.d.ts as the program might have found that instead.
        const p = type.filePath;
        const m = p.match(INDEX_PATTERN);
        if (m) {
            const indexVersion = path.join(path.dirname(p), 'index.d.ts');
            sourceFile = context.program.getSourceFile(indexVersion);
        }
    }
    if (sourceFile) {
        const moduleSymbol = sourceFile.module || sourceFile.symbol;
        const exports = context.checker.getExportsOfModule(moduleSymbol);
        return (exports || []).find(symbol => symbol.name == type.name);
    }
}
class EmptyTable {
    constructor() {
        this.size = 0;
    }
    get(key) { return undefined; }
    has(key) { return false; }
    values() { return []; }
}
EmptyTable.instance = new EmptyTable();
function isSymbolPrivate(s) {
    return !!s.valueDeclaration && isPrivate(s.valueDeclaration);
}
function getTsTypeFromBuiltinType(builtinType, ctx) {
    let syntaxKind;
    switch (builtinType) {
        case symbols_1.BuiltinType.Any:
            syntaxKind = ts.SyntaxKind.AnyKeyword;
            break;
        case symbols_1.BuiltinType.Boolean:
            syntaxKind = ts.SyntaxKind.BooleanKeyword;
            break;
        case symbols_1.BuiltinType.Null:
            syntaxKind = ts.SyntaxKind.NullKeyword;
            break;
        case symbols_1.BuiltinType.Number:
            syntaxKind = ts.SyntaxKind.NumberKeyword;
            break;
        case symbols_1.BuiltinType.String:
            syntaxKind = ts.SyntaxKind.StringKeyword;
            break;
        case symbols_1.BuiltinType.Undefined:
            syntaxKind = ts.SyntaxKind.UndefinedKeyword;
            break;
        default:
            throw new Error(`Internal error, unhandled literal kind ${builtinType}:${symbols_1.BuiltinType[builtinType]}`);
    }
    const node = ts.createNode(syntaxKind);
    node.parent = ctx.node;
    return ctx.checker.getTypeAtLocation(node);
}
function spanAt(sourceFile, line, column) {
    if (line != null && column != null) {
        const position = ts.getPositionOfLineAndCharacter(sourceFile, line, column);
        const findChild = function findChild(node) {
            if (node.kind > ts.SyntaxKind.LastToken && node.pos <= position && node.end > position) {
                const betterNode = ts.forEachChild(node, findChild);
                return betterNode || node;
            }
        };
        const node = ts.forEachChild(sourceFile, findChild);
        if (node) {
            return { start: node.getStart(), end: node.getEnd() };
        }
    }
}
function definitionFromTsSymbol(symbol) {
    const declarations = symbol.declarations;
    if (declarations) {
        return declarations.map(declaration => {
            const sourceFile = declaration.getSourceFile();
            return {
                fileName: sourceFile.fileName,
                span: { start: declaration.getStart(), end: declaration.getEnd() }
            };
        });
    }
}
function parentDeclarationOf(node) {
    while (node) {
        switch (node.kind) {
            case ts.SyntaxKind.ClassDeclaration:
            case ts.SyntaxKind.InterfaceDeclaration:
                return node;
            case ts.SyntaxKind.SourceFile:
                return undefined;
        }
        node = node.parent;
    }
}
function getContainerOf(symbol, context) {
    if (symbol.getFlags() & ts.SymbolFlags.ClassMember && symbol.declarations) {
        for (const declaration of symbol.declarations) {
            const parent = parentDeclarationOf(declaration);
            if (parent) {
                const type = context.checker.getTypeAtLocation(parent);
                if (type) {
                    return new TypeWrapper(type, context);
                }
            }
        }
    }
}
function typeKindOf(type) {
    if (type) {
        if (type.flags & ts.TypeFlags.Any) {
            return symbols_1.BuiltinType.Any;
        }
        else if (type.flags & (ts.TypeFlags.String | ts.TypeFlags.StringLike | ts.TypeFlags.StringLiteral)) {
            return symbols_1.BuiltinType.String;
        }
        else if (type.flags & (ts.TypeFlags.Number | ts.TypeFlags.NumberLike)) {
            return symbols_1.BuiltinType.Number;
        }
        else if (type.flags & (ts.TypeFlags.Undefined)) {
            return symbols_1.BuiltinType.Undefined;
        }
        else if (type.flags & (ts.TypeFlags.Null)) {
            return symbols_1.BuiltinType.Null;
        }
        else if (type.flags & ts.TypeFlags.Union) {
            // If all the constituent types of a union are the same kind, it is also that kind.
            let candidate = null;
            const unionType = type;
            if (unionType.types.length > 0) {
                candidate = typeKindOf(unionType.types[0]);
                for (const subType of unionType.types) {
                    if (candidate != typeKindOf(subType)) {
                        return symbols_1.BuiltinType.Other;
                    }
                }
            }
            if (candidate != null) {
                return candidate;
            }
        }
        else if (type.flags & ts.TypeFlags.TypeParameter) {
            return symbols_1.BuiltinType.Unbound;
        }
    }
    return symbols_1.BuiltinType.Other;
}
function getFromSymbolTable(symbolTable, key) {
    const table = symbolTable;
    let symbol;
    if (typeof table.get === 'function') {
        // TS 2.2 uses a Map
        symbol = table.get(key);
    }
    else {
        // TS pre-2.2 uses an object
        symbol = table[key];
    }
    return symbol;
}
//# sourceMappingURL=typescript_symbols.js.map