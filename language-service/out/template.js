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
const global_symbols_1 = require("./global_symbols");
const typescript_symbols_1 = require("./typescript_symbols");
/**
 * A base class to represent a template and which component class it is
 * associated with. A template source could answer basic questions about
 * top-level declarations of its class through the members() and query()
 * methods.
 */
class BaseTemplate {
    constructor(host, classDeclNode, classSymbol) {
        this.host = host;
        this.classDeclNode = classDeclNode;
        this.classSymbol = classSymbol;
        this.program = host.program;
    }
    /**
     * Return the Angular StaticSymbol for the class that contains this template.
     */
    get type() { return this.classSymbol; }
    /**
     * Return a Map-like data structure that allows users to retrieve some or all
     * top-level declarations in the associated component class.
     */
    get members() {
        if (!this.membersTable) {
            const typeChecker = this.program.getTypeChecker();
            const sourceFile = this.classDeclNode.getSourceFile();
            this.membersTable = this.query.mergeSymbolTable([
                global_symbols_1.createGlobalSymbolTable(this.query),
                typescript_symbols_1.getClassMembersFromDeclaration(this.program, typeChecker, sourceFile, this.classDeclNode),
            ]);
        }
        return this.membersTable;
    }
    /**
     * Return an engine that provides more information about symbols in the
     * template.
     */
    get query() {
        if (!this.queryCache) {
            const program = this.program;
            const typeChecker = program.getTypeChecker();
            const sourceFile = this.classDeclNode.getSourceFile();
            this.queryCache = typescript_symbols_1.getSymbolQuery(program, typeChecker, sourceFile, () => {
                // Computing the ast is relatively expensive. Do it only when absolutely
                // necessary.
                // TODO: There is circular dependency here between TemplateSource and
                // TypeScriptHost. Consider refactoring the code to break this cycle.
                const ast = this.host.getTemplateAst(this);
                const pipes = (ast && ast.pipes) || [];
                return typescript_symbols_1.getPipesTable(sourceFile, program, typeChecker, pipes);
            });
        }
        return this.queryCache;
    }
}
/**
 * An InlineTemplate represents template defined in a TS file through the
 * `template` attribute in the decorator.
 */
class InlineTemplate extends BaseTemplate {
    constructor(templateNode, classDeclNode, classSymbol, host) {
        super(host, classDeclNode, classSymbol);
        const sourceFile = templateNode.getSourceFile();
        if (sourceFile !== classDeclNode.getSourceFile()) {
            throw new Error(`Inline template and component class should belong to the same source file`);
        }
        this.fileName = sourceFile.fileName;
        // node.text returns the TS internal representation of the normalized text,
        // and all CR characters are stripped. node.getText() returns the raw text.
        this.source = templateNode.getText().slice(1, -1); // strip leading and trailing quotes
        this.span = {
            // TS string literal includes surrounding quotes in the start/end offsets.
            start: templateNode.getStart() + 1,
            end: templateNode.getEnd() - 1,
        };
    }
}
exports.InlineTemplate = InlineTemplate;
/**
 * An ExternalTemplate represents template defined in an external (most likely
 * HTML, but not necessarily) file through the `templateUrl` attribute in the
 * decorator.
 * Note that there is no ts.Node associated with the template because it's not
 * a TS file.
 */
class ExternalTemplate extends BaseTemplate {
    constructor(source, fileName, classDeclNode, classSymbol, host) {
        super(host, classDeclNode, classSymbol);
        this.source = source;
        this.fileName = fileName;
        this.span = {
            start: 0,
            end: source.length,
        };
    }
}
exports.ExternalTemplate = ExternalTemplate;
/**
 * Returns a property assignment from the assignment value, or `undefined` if there is no
 * assignment.
 */
function getPropertyAssignmentFromValue(value) {
    if (!value.parent || !ts.isPropertyAssignment(value.parent)) {
        return;
    }
    return value.parent;
}
exports.getPropertyAssignmentFromValue = getPropertyAssignmentFromValue;
/**
 * Given a decorator property assignment, return the ClassDeclaration node that corresponds to the
 * directive class the property applies to.
 * If the property assignment is not on a class decorator, no declaration is returned.
 *
 * For example,
 *
 * @Component({
 *   template: '<div></div>'
 *   ^^^^^^^^^^^^^^^^^^^^^^^---- property assignment
 * })
 * class AppComponent {}
 *           ^---- class declaration node
 *
 * @param propAsgn property assignment
 */
function getClassDeclFromDecoratorProp(propAsgnNode) {
    if (!propAsgnNode.parent || !ts.isObjectLiteralExpression(propAsgnNode.parent)) {
        return;
    }
    const objLitExprNode = propAsgnNode.parent;
    if (!objLitExprNode.parent || !ts.isCallExpression(objLitExprNode.parent)) {
        return;
    }
    const callExprNode = objLitExprNode.parent;
    if (!callExprNode.parent || !ts.isDecorator(callExprNode.parent)) {
        return;
    }
    const decorator = callExprNode.parent;
    if (!decorator.parent || !ts.isClassDeclaration(decorator.parent)) {
        return;
    }
    const classDeclNode = decorator.parent;
    return classDeclNode;
}
exports.getClassDeclFromDecoratorProp = getClassDeclFromDecoratorProp;
/**
 * Determines if a property assignment is on a class decorator.
 * See `getClassDeclFromDecoratorProperty`, which gets the class the decorator is applied to, for
 * more details.
 *
 * @param prop property assignment
 */
function isClassDecoratorProperty(propAsgn) {
    return !!getClassDeclFromDecoratorProp(propAsgn);
}
exports.isClassDecoratorProperty = isClassDecoratorProperty;
//# sourceMappingURL=template.js.map