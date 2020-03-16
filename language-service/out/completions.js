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
const chars_1 = require("@angular/compiler/src/chars");
const expression_diagnostics_1 = require("./expression_diagnostics");
const expressions_1 = require("./expressions");
const html_info_1 = require("./html_info");
const template_1 = require("./template");
const ng = require("./types");
const utils_1 = require("./utils");
const HIDDEN_HTML_ELEMENTS = new Set(['html', 'script', 'noscript', 'base', 'body', 'title', 'head', 'link']);
const HTML_ELEMENTS = html_info_1.elementNames().filter(name => !HIDDEN_HTML_ELEMENTS.has(name)).map(name => {
    return {
        name,
        kind: ng.CompletionKind.HTML_ELEMENT,
        sortText: name,
    };
});
const ANGULAR_ELEMENTS = [
    {
        name: 'ng-container',
        kind: ng.CompletionKind.ANGULAR_ELEMENT,
        sortText: 'ng-container',
    },
    {
        name: 'ng-content',
        kind: ng.CompletionKind.ANGULAR_ELEMENT,
        sortText: 'ng-content',
    },
    {
        name: 'ng-template',
        kind: ng.CompletionKind.ANGULAR_ELEMENT,
        sortText: 'ng-template',
    },
];
// This is adapted from packages/compiler/src/render3/r3_template_transform.ts
// to allow empty binding names.
const BIND_NAME_REGEXP = /^(?:(?:(?:(bind-)|(let-)|(ref-|#)|(on-)|(bindon-)|(@))(.*))|\[\(([^\)]*)\)\]|\[([^\]]*)\]|\(([^\)]*)\))$/;
var ATTR;
(function (ATTR) {
    // Group 1 = "bind-"
    ATTR[ATTR["KW_BIND_IDX"] = 1] = "KW_BIND_IDX";
    // Group 2 = "let-"
    ATTR[ATTR["KW_LET_IDX"] = 2] = "KW_LET_IDX";
    // Group 3 = "ref-/#"
    ATTR[ATTR["KW_REF_IDX"] = 3] = "KW_REF_IDX";
    // Group 4 = "on-"
    ATTR[ATTR["KW_ON_IDX"] = 4] = "KW_ON_IDX";
    // Group 5 = "bindon-"
    ATTR[ATTR["KW_BINDON_IDX"] = 5] = "KW_BINDON_IDX";
    // Group 6 = "@"
    ATTR[ATTR["KW_AT_IDX"] = 6] = "KW_AT_IDX";
    // Group 7 = the identifier after "bind-", "let-", "ref-/#", "on-", "bindon-" or "@"
    ATTR[ATTR["IDENT_KW_IDX"] = 7] = "IDENT_KW_IDX";
    // Group 8 = identifier inside [()]
    ATTR[ATTR["IDENT_BANANA_BOX_IDX"] = 8] = "IDENT_BANANA_BOX_IDX";
    // Group 9 = identifier inside []
    ATTR[ATTR["IDENT_PROPERTY_IDX"] = 9] = "IDENT_PROPERTY_IDX";
    // Group 10 = identifier inside ()
    ATTR[ATTR["IDENT_EVENT_IDX"] = 10] = "IDENT_EVENT_IDX";
})(ATTR || (ATTR = {}));
function isIdentifierPart(code) {
    // Identifiers consist of alphanumeric characters, '_', or '$'.
    return chars_1.isAsciiLetter(code) || chars_1.isDigit(code) || code == chars_1.$$ || code == chars_1.$_;
}
/**
 * Gets the span of word in a template that surrounds `position`. If there is no word around
 * `position`, nothing is returned.
 */
function getBoundedWordSpan(templateInfo, position) {
    const { template } = templateInfo;
    const templateSrc = template.source;
    if (!templateSrc)
        return;
    // TODO(ayazhafiz): A solution based on word expansion will always be expensive compared to one
    // based on ASTs. Whatever penalty we incur is probably manageable for small-length (i.e. the
    // majority of) identifiers, but the current solution involes a number of branchings and we can't
    // control potentially very long identifiers. Consider moving to an AST-based solution once
    // existing difficulties with AST spans are more clearly resolved (see #31898 for discussion of
    // known problems, and #33091 for how they affect text replacement).
    //
    // `templatePosition` represents the right-bound location of a cursor in the template.
    //    key.ent|ry
    //           ^---- cursor, at position `r` is at.
    // A cursor is not itself a character in the template; it has a left (lower) and right (upper)
    // index bound that hugs the cursor itself.
    let templatePosition = position - template.span.start;
    // To perform word expansion, we want to determine the left and right indices that hug the cursor.
    // There are three cases here.
    let left, right;
    if (templatePosition === 0) {
        // 1. Case like
        //      |rest of template
        //    the cursor is at the start of the template, hugged only by the right side (0-index).
        left = right = 0;
    }
    else if (templatePosition === templateSrc.length) {
        // 2. Case like
        //      rest of template|
        //    the cursor is at the end of the template, hugged only by the left side (last-index).
        left = right = templateSrc.length - 1;
    }
    else {
        // 3. Case like
        //      wo|rd
        //    there is a clear left and right index.
        left = templatePosition - 1;
        right = templatePosition;
    }
    if (!isIdentifierPart(templateSrc.charCodeAt(left)) &&
        !isIdentifierPart(templateSrc.charCodeAt(right))) {
        // Case like
        //         .|.
        // left ---^ ^--- right
        // There is no word here.
        return;
    }
    // Expand on the left and right side until a word boundary is hit. Back up one expansion on both
    // side to stay inside the word.
    while (left >= 0 && isIdentifierPart(templateSrc.charCodeAt(left)))
        --left;
    ++left;
    while (right < templateSrc.length && isIdentifierPart(templateSrc.charCodeAt(right)))
        ++right;
    --right;
    const absoluteStartPosition = position - (templatePosition - left);
    const length = right - left + 1;
    return { start: absoluteStartPosition, length };
}
function getTemplateCompletions(templateInfo, position) {
    let result = [];
    const { htmlAst, template } = templateInfo;
    // The templateNode starts at the delimiter character so we add 1 to skip it.
    const templatePosition = position - template.span.start;
    const path = utils_1.getPathToNodeAtPosition(htmlAst, templatePosition);
    const mostSpecific = path.tail;
    if (path.empty || !mostSpecific) {
        result = elementCompletions(templateInfo);
    }
    else {
        const astPosition = templatePosition - mostSpecific.sourceSpan.start.offset;
        mostSpecific.visit({
            visitElement(ast) {
                const startTagSpan = utils_1.spanOf(ast.sourceSpan);
                const tagLen = ast.name.length;
                // + 1 for the opening angle bracket
                if (templatePosition <= startTagSpan.start + tagLen + 1) {
                    // If we are in the tag then return the element completions.
                    result = elementCompletions(templateInfo);
                }
                else if (templatePosition < startTagSpan.end) {
                    // We are in the attribute section of the element (but not in an attribute).
                    // Return the attribute completions.
                    result = attributeCompletionsForElement(templateInfo, ast.name);
                }
            },
            visitAttribute(ast) {
                // An attribute consists of two parts, LHS="RHS".
                // Determine if completions are requested for LHS or RHS
                if (ast.valueSpan && utils_1.inSpan(templatePosition, utils_1.spanOf(ast.valueSpan))) {
                    // RHS completion
                    result = attributeValueCompletions(templateInfo, path);
                }
                else {
                    // LHS completion
                    result = attributeCompletions(templateInfo, path);
                }
            },
            visitText(ast) {
                // Check if we are in a entity.
                result = entityCompletions(getSourceText(template, utils_1.spanOf(ast)), astPosition);
                if (result.length)
                    return result;
                result = interpolationCompletions(templateInfo, templatePosition);
                if (result.length)
                    return result;
                const element = path.first(compiler_1.Element);
                if (element) {
                    const definition = compiler_1.getHtmlTagDefinition(element.name);
                    if (definition.contentType === compiler_1.TagContentType.PARSABLE_DATA) {
                        result = voidElementAttributeCompletions(templateInfo, path);
                        if (!result.length) {
                            // If the element can hold content, show element completions.
                            result = elementCompletions(templateInfo);
                        }
                    }
                }
                else {
                    // If no element container, implies parsable data so show elements.
                    result = voidElementAttributeCompletions(templateInfo, path);
                    if (!result.length) {
                        result = elementCompletions(templateInfo);
                    }
                }
            },
            visitComment() { },
            visitExpansion() { },
            visitExpansionCase() { }
        }, null);
    }
    const replacementSpan = getBoundedWordSpan(templateInfo, position);
    return result.map(entry => {
        return Object.assign(Object.assign({}, entry), { replacementSpan });
    });
}
exports.getTemplateCompletions = getTemplateCompletions;
function attributeCompletions(info, path) {
    const attr = path.tail;
    const elem = path.parentOf(attr);
    if (!(attr instanceof compiler_1.Attribute) || !(elem instanceof compiler_1.Element)) {
        return [];
    }
    // TODO: Consider parsing the attrinute name to a proper AST instead of
    // matching using regex. This is because the regexp would incorrectly identify
    // bind parts for cases like [()|]
    //                              ^ cursor is here
    const bindParts = attr.name.match(BIND_NAME_REGEXP);
    // TemplateRef starts with '*'. See https://angular.io/api/core/TemplateRef
    const isTemplateRef = attr.name.startsWith('*');
    const isBinding = bindParts !== null || isTemplateRef;
    if (!isBinding) {
        return attributeCompletionsForElement(info, elem.name);
    }
    const results = [];
    const ngAttrs = angularAttributes(info, elem.name);
    if (!bindParts) {
        // If bindParts is null then this must be a TemplateRef.
        results.push(...ngAttrs.templateRefs);
    }
    else if (bindParts[ATTR.KW_BIND_IDX] !== undefined ||
        bindParts[ATTR.IDENT_PROPERTY_IDX] !== undefined) {
        // property binding via bind- or []
        results.push(...html_info_1.propertyNames(elem.name), ...ngAttrs.inputs);
    }
    else if (bindParts[ATTR.KW_ON_IDX] !== undefined || bindParts[ATTR.IDENT_EVENT_IDX] !== undefined) {
        // event binding via on- or ()
        results.push(...html_info_1.eventNames(elem.name), ...ngAttrs.outputs);
    }
    else if (bindParts[ATTR.KW_BINDON_IDX] !== undefined ||
        bindParts[ATTR.IDENT_BANANA_BOX_IDX] !== undefined) {
        // banana-in-a-box binding via bindon- or [()]
        results.push(...ngAttrs.bananas);
    }
    return results.map(name => {
        return {
            name,
            kind: ng.CompletionKind.ATTRIBUTE,
            sortText: name,
        };
    });
}
function attributeCompletionsForElement(info, elementName) {
    const results = [];
    if (info.template instanceof template_1.InlineTemplate) {
        // Provide HTML attributes completion only for inline templates
        for (const name of html_info_1.attributeNames(elementName)) {
            results.push({
                name,
                kind: ng.CompletionKind.HTML_ATTRIBUTE,
                sortText: name,
            });
        }
    }
    // Add Angular attributes
    const ngAttrs = angularAttributes(info, elementName);
    for (const name of ngAttrs.others) {
        results.push({
            name,
            kind: ng.CompletionKind.ATTRIBUTE,
            sortText: name,
        });
    }
    return results;
}
/**
 * Provide completions to the RHS of an attribute, which is of the form
 * LHS="RHS". The template path is computed from the specified `info` whereas
 * the context is determined from the specified `htmlPath`.
 * @param info Object that contains the template AST
 * @param htmlPath Path to the HTML node
 */
function attributeValueCompletions(info, htmlPath) {
    // Find the corresponding Template AST path.
    const templatePath = utils_1.findTemplateAstAt(info.templateAst, htmlPath.position);
    const visitor = new ExpressionVisitor(info, htmlPath.position, () => {
        const dinfo = utils_1.diagnosticInfoFromTemplateInfo(info);
        return expression_diagnostics_1.getExpressionScope(dinfo, templatePath);
    });
    if (templatePath.tail instanceof compiler_1.AttrAst ||
        templatePath.tail instanceof compiler_1.BoundElementPropertyAst ||
        templatePath.tail instanceof compiler_1.BoundEventAst) {
        templatePath.tail.visit(visitor, null);
        return visitor.results;
    }
    // In order to provide accurate attribute value completion, we need to know
    // what the LHS is, and construct the proper AST if it is missing.
    const htmlAttr = htmlPath.tail;
    const bindParts = htmlAttr.name.match(BIND_NAME_REGEXP);
    if (bindParts && bindParts[ATTR.KW_REF_IDX] !== undefined) {
        let refAst;
        let elemAst;
        if (templatePath.tail instanceof compiler_1.ReferenceAst) {
            refAst = templatePath.tail;
            const parent = templatePath.parentOf(refAst);
            if (parent instanceof compiler_1.ElementAst) {
                elemAst = parent;
            }
        }
        else if (templatePath.tail instanceof compiler_1.ElementAst) {
            refAst = new compiler_1.ReferenceAst(htmlAttr.name, null, htmlAttr.value, htmlAttr.valueSpan);
            elemAst = templatePath.tail;
        }
        if (refAst && elemAst) {
            refAst.visit(visitor, elemAst);
        }
    }
    else {
        // HtmlAst contains the `Attribute` node, however the corresponding `AttrAst`
        // node is missing from the TemplateAst.
        const attrAst = new compiler_1.AttrAst(htmlAttr.name, htmlAttr.value, htmlAttr.valueSpan);
        attrAst.visit(visitor, null);
    }
    return visitor.results;
}
function elementCompletions(info) {
    const results = [...ANGULAR_ELEMENTS];
    if (info.template instanceof template_1.InlineTemplate) {
        // Provide HTML elements completion only for inline templates
        results.push(...HTML_ELEMENTS);
    }
    // Collect the elements referenced by the selectors
    const components = new Set();
    for (const selector of utils_1.getSelectors(info).selectors) {
        const name = selector.element;
        if (name && !components.has(name)) {
            components.add(name);
            results.push({
                name,
                kind: ng.CompletionKind.COMPONENT,
                sortText: name,
            });
        }
    }
    return results;
}
function entityCompletions(value, position) {
    // Look for entity completions
    const re = /&[A-Za-z]*;?(?!\d)/g;
    let found;
    let result = [];
    while (found = re.exec(value)) {
        let len = found[0].length;
        if (position >= found.index && position < (found.index + len)) {
            result = Object.keys(compiler_1.NAMED_ENTITIES).map(name => {
                return {
                    name: `&${name};`,
                    kind: ng.CompletionKind.ENTITY,
                    sortText: name,
                };
            });
            break;
        }
    }
    return result;
}
function interpolationCompletions(info, position) {
    // Look for an interpolation in at the position.
    const templatePath = utils_1.findTemplateAstAt(info.templateAst, position);
    if (!templatePath.tail) {
        return [];
    }
    const visitor = new ExpressionVisitor(info, position, () => expression_diagnostics_1.getExpressionScope(utils_1.diagnosticInfoFromTemplateInfo(info), templatePath));
    templatePath.tail.visit(visitor, null);
    return visitor.results;
}
// There is a special case of HTML where text that contains a unclosed tag is treated as
// text. For exaple '<h1> Some <a text </h1>' produces a text nodes inside of the H1
// element "Some <a text". We, however, want to treat this as if the user was requesting
// the attributes of an "a" element, not requesting completion in the a text element. This
// code checks for this case and returns element completions if it is detected or undefined
// if it is not.
function voidElementAttributeCompletions(info, path) {
    const tail = path.tail;
    if (tail instanceof compiler_1.Text) {
        const match = tail.value.match(/<(\w(\w|\d|-)*:)?(\w(\w|\d|-)*)\s/);
        // The position must be after the match, otherwise we are still in a place where elements
        // are expected (such as `<|a` or `<a|`; we only want attributes for `<a |` or after).
        if (match &&
            path.position >= (match.index || 0) + match[0].length + tail.sourceSpan.start.offset) {
            return attributeCompletionsForElement(info, match[3]);
        }
    }
    return [];
}
class ExpressionVisitor extends compiler_1.NullTemplateVisitor {
    constructor(info, position, getExpressionScope) {
        super();
        this.info = info;
        this.position = position;
        this.getExpressionScope = getExpressionScope;
        this.completions = new Map();
    }
    get results() { return Array.from(this.completions.values()); }
    visitDirectiveProperty(ast) {
        this.processExpressionCompletions(ast.value);
    }
    visitElementProperty(ast) {
        this.processExpressionCompletions(ast.value);
    }
    visitEvent(ast) { this.processExpressionCompletions(ast.handler); }
    visitElement() {
        // no-op for now
    }
    visitAttr(ast) {
        if (ast.name.startsWith('*')) {
            // This a template binding given by micro syntax expression.
            // First, verify the attribute consists of some binding we can give completions for.
            const { templateBindings } = this.info.expressionParser.parseTemplateBindings(ast.name, ast.value, ast.sourceSpan.toString(), ast.sourceSpan.start.offset);
            // Find where the cursor is relative to the start of the attribute value.
            const valueRelativePosition = this.position - ast.sourceSpan.start.offset;
            // Find the template binding that contains the position.
            const binding = templateBindings.find(b => utils_1.inSpan(valueRelativePosition, b.span));
            if (!binding) {
                return;
            }
            this.microSyntaxInAttributeValue(ast, binding);
        }
        else {
            const expressionAst = this.info.expressionParser.parseBinding(ast.value, ast.sourceSpan.toString(), ast.sourceSpan.start.offset);
            this.processExpressionCompletions(expressionAst);
        }
    }
    visitReference(_ast, context) {
        context.directives.forEach(dir => {
            const { exportAs } = dir.directive;
            if (exportAs) {
                this.completions.set(exportAs, { name: exportAs, kind: ng.CompletionKind.REFERENCE, sortText: exportAs });
            }
        });
    }
    visitBoundText(ast) {
        if (utils_1.inSpan(this.position, ast.value.sourceSpan)) {
            const completions = expressions_1.getExpressionCompletions(this.getExpressionScope(), ast.value, this.position, this.info.template.query);
            if (completions) {
                this.addSymbolsToCompletions(completions);
            }
        }
    }
    processExpressionCompletions(value) {
        const symbols = expressions_1.getExpressionCompletions(this.getExpressionScope(), value, this.position, this.info.template.query);
        if (symbols) {
            this.addSymbolsToCompletions(symbols);
        }
    }
    addSymbolsToCompletions(symbols) {
        for (const s of symbols) {
            if (s.name.startsWith('__') || !s.public || this.completions.has(s.name)) {
                continue;
            }
            // The pipe method should not include parentheses.
            // e.g. {{ value_expression | slice : start [ : end ] }}
            const shouldInsertParentheses = s.callable && s.kind !== ng.CompletionKind.PIPE;
            this.completions.set(s.name, {
                name: s.name,
                kind: s.kind,
                sortText: s.name,
                insertText: shouldInsertParentheses ? `${s.name}()` : s.name,
            });
        }
    }
    /**
     * This method handles the completions of attribute values for directives that
     * support the microsyntax format. Examples are *ngFor and *ngIf.
     * These directives allows declaration of "let" variables, adds context-specific
     * symbols like $implicit, index, count, among other behaviors.
     * For a complete description of such format, see
     * https://angular.io/guide/structural-directives#the-asterisk--prefix
     *
     * @param attr descriptor for attribute name and value pair
     * @param binding template binding for the expression in the attribute
     */
    microSyntaxInAttributeValue(attr, binding) {
        const key = attr.name.substring(1); // remove leading asterisk
        // Find the selector - eg ngFor, ngIf, etc
        const selectorInfo = utils_1.getSelectors(this.info);
        const selector = selectorInfo.selectors.find(s => {
            // attributes are listed in (attribute, value) pairs
            for (let i = 0; i < s.attrs.length; i += 2) {
                if (s.attrs[i] === key) {
                    return true;
                }
            }
        });
        if (!selector) {
            return;
        }
        const valueRelativePosition = this.position - attr.sourceSpan.start.offset;
        if (binding.keyIsVar) {
            const equalLocation = attr.value.indexOf('=');
            if (equalLocation > 0 && valueRelativePosition > equalLocation) {
                // We are after the '=' in a let clause. The valid values here are the members of the
                // template reference's type parameter.
                const directiveMetadata = selectorInfo.map.get(selector);
                if (directiveMetadata) {
                    const contextTable = this.info.template.query.getTemplateContext(directiveMetadata.type.reference);
                    if (contextTable) {
                        // This adds symbols like $implicit, index, count, etc.
                        this.addSymbolsToCompletions(contextTable.values());
                        return;
                    }
                }
            }
        }
        if (binding.value && utils_1.inSpan(valueRelativePosition, binding.value.ast.span)) {
            this.processExpressionCompletions(binding.value.ast);
            return;
        }
        // If the expression is incomplete, for example *ngFor="let x of |"
        // binding.expression is null. We could still try to provide suggestions
        // by looking for symbols that are in scope.
        const KW_OF = ' of ';
        const ofLocation = attr.value.indexOf(KW_OF);
        if (ofLocation > 0 && valueRelativePosition >= ofLocation + KW_OF.length) {
            const expressionAst = this.info.expressionParser.parseBinding(attr.value, attr.sourceSpan.toString(), attr.sourceSpan.start.offset);
            this.processExpressionCompletions(expressionAst);
        }
    }
}
function getSourceText(template, span) {
    return template.source.substring(span.start, span.end);
}
/**
 * Return all Angular-specific attributes for the element with `elementName`.
 * @param info
 * @param elementName
 */
function angularAttributes(info, elementName) {
    const { selectors, map: selectorMap } = utils_1.getSelectors(info);
    const templateRefs = new Set();
    const inputs = new Set();
    const outputs = new Set();
    const bananas = new Set();
    const others = new Set();
    for (const selector of selectors) {
        if (selector.element && selector.element !== elementName) {
            continue;
        }
        const summary = selectorMap.get(selector);
        const isTemplateRef = utils_1.hasTemplateReference(summary.type);
        // attributes are listed in (attribute, value) pairs
        for (let i = 0; i < selector.attrs.length; i += 2) {
            const attr = selector.attrs[i];
            if (isTemplateRef) {
                templateRefs.add(attr);
            }
            else {
                others.add(attr);
            }
        }
        for (const input of Object.values(summary.inputs)) {
            inputs.add(input);
        }
        for (const output of Object.values(summary.outputs)) {
            outputs.add(output);
        }
    }
    for (const name of inputs) {
        // Add banana-in-a-box syntax
        // https://angular.io/guide/template-syntax#two-way-binding-
        if (outputs.has(`${name}Change`)) {
            bananas.add(name);
        }
    }
    return { templateRefs, inputs, outputs, bananas, others };
}
//# sourceMappingURL=completions.js.map