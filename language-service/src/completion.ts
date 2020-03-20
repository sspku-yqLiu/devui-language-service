/*
 * @Author: your name
 * @Date: 2020-03-18 21:10:59
 * @LastEditTime: 2020-03-18 21:53:19
 * @LastEditors: Please set LastEditors
 * @Description: In User Settings Edit
 * @FilePath: \devui-language-service\language-service\src\completion.ts
 */
import { AstResult } from './common';
import { getPathToNodeAtPosition, spanOf, getSelectors, hasTemplateReference, inSpan, findTemplateAstAt, diagnosticInfoFromTemplateInfo } from './utils';
import * as ng from './types';
import { elementNames, attributeNames } from './html_info';
import { InlineTemplate } from './template';
import { AstPath } from './parser-related/ast_path';
import { Attribute } from './parser-related/ast';


const ANGULAR_ELEMENTS: ReadonlyArray<ng.CompletionEntry> = [
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
const HTML_ELEMENTS: ReadonlyArray<ng.CompletionEntry> =
  elementNames().filter(name => !HIDDEN_HTML_ELEMENTS.has(name)).map(name => {
    return {
      name,
      kind: ng.CompletionKind.HTML_ELEMENT,
      sortText: name,
    };
  });

export function getTemplateCompletions(
  // templateInfo: AstResult, 
  position: number): ng.CompletionEntry[] {
  let result: ng.CompletionEntry[] = [];
  // const { htmlAst, template } = templateInfo;
  // The templateNode starts at the delimiter character so we add 1 to skip it.
  const templatePosition = position - template.span.start;
  /**
   * Find the tightest node at the specified `position` from the AST `nodes`, and
   * return the path to the node.
   * @param nodes HTML AST nodes
   * @param position
   */
  const path = getPathToNodeAtPosition(htmlAst, templatePosition);
  const mostSpecific = path.tail;
  if (path.empty || !mostSpecific) {
    result = elementCompletions(templateInfo);
  } else {
    const astPosition = templatePosition - mostSpecific.sourceSpan.start.offset;
    mostSpecific.visit(
      {
        visitElement(ast) {
          const startTagSpan = spanOf(ast.sourceSpan);
          const tagLen = ast.name.length;
          // + 1 for the opening angle bracket
          if (templatePosition <= startTagSpan.start + tagLen + 1) {
            // If we are in the tag then return the element completions.
            result = elementCompletions(templateInfo);
          } else if (templatePosition < startTagSpan.end) {
            // We are in the attribute section of the element (but not in an attribute).
            // Return the attribute completions.
            result = attributeCompletionsForElement(templateInfo, ast.name);
          }
        },
        visitAttribute(ast: Attribute) {
          // An attribute consists of two parts, LHS="RHS".
          // Determine if completions are requested for LHS or RHS
          if (ast.valueSpan && inSpan(templatePosition, spanOf(ast.valueSpan))) {
            // RHS completion
            result = attributeValueCompletions(templateInfo, path);
          } else {
            // LHS completion
            result = attributeCompletions(templateInfo, path);
          }
        },
        visitText(ast) {
          // Check if we are in a entity.
          result = entityCompletions(getSourceText(template, spanOf(ast)), astPosition);
          if (result.length) return result;
          result = interpolationCompletions(templateInfo, templatePosition);
          if (result.length) return result;
          const element = path.first(Element);
          if (element) {
            const definition = getHtmlTagDefinition(element.name);
            if (definition.contentType === TagContentType.PARSABLE_DATA) {
              result = voidElementAttributeCompletions(templateInfo, path);
              if (!result.length) {
                // If the element can hold content, show element completions.
                result = elementCompletions(templateInfo);
              }
            }
          } else {
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
      },
      null);
  }

  const replacementSpan = getBoundedWordSpan(templateInfo, position);
  return result.map(entry => {
    return {
      ...entry, replacementSpan,
    };
  });
}

function attributeCompletions(info: AstResult, path: AstPath<HtmlAst>): ng.CompletionEntry[] {
  const attr = path.tail;
  const elem = path.parentOf(attr);
  if (!(attr instanceof Attribute) || !(elem instanceof Element)) {
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

  const results: string[] = [];
  const ngAttrs = angularAttributes(info, elem.name);
  if (!bindParts) {
    // If bindParts is null then this must be a TemplateRef.
    results.push(...ngAttrs.templateRefs);
  } else if (
    bindParts[ATTR.KW_BIND_IDX] !== undefined ||
    bindParts[ATTR.IDENT_PROPERTY_IDX] !== undefined) {
    // property binding via bind- or []
    results.push(...propertyNames(elem.name), ...ngAttrs.inputs);
  } else if (
    bindParts[ATTR.KW_ON_IDX] !== undefined || bindParts[ATTR.IDENT_EVENT_IDX] !== undefined) {
    // event binding via on- or ()
    results.push(...eventNames(elem.name), ...ngAttrs.outputs);
  } else if (
    bindParts[ATTR.KW_BINDON_IDX] !== undefined ||
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
/**
 * 
 * -------------------------element-------------------- 
 */
function elementCompletions(info: AstResult): ng.CompletionEntry[] {
  const results: ng.CompletionEntry[] = [...ANGULAR_ELEMENTS];

  if (info.template instanceof InlineTemplate) {
    // Provide HTML elements completion only for inline templates
    results.push(...HTML_ELEMENTS);
  }

  // Collect the elements referenced by the selectors
  const components = new Set<string>();
  for (const selector of getSelectors(info).selectors) {
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

function attributeCompletionsForElement(
  info: AstResult, elementName: string): ng.CompletionEntry[] {
  const results: ng.CompletionEntry[] = [];

  if (info.template instanceof InlineTemplate) {
    // Provide HTML attributes completion only for inline templates
    for (const name of attributeNames(elementName)) {
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
function angularAttributes(info: AstResult, elementName: string): AngularAttributes {
  const { selectors, map: selectorMap } = getSelectors(info);
  const templateRefs = new Set<string>();
  const inputs = new Set<string>();
  const outputs = new Set<string>();
  const bananas = new Set<string>();
  const others = new Set<string>();
  for (const selector of selectors) {
    if (selector.element && selector.element !== elementName) {
      continue;
    }
    const summary = selectorMap.get(selector)!;
    const isTemplateRef = hasTemplateReference(summary.type);
    // attributes are listed in (attribute, value) pairs
    for (let i = 0; i < selector.attrs.length; i += 2) {
      const attr = selector.attrs[i];
      if (isTemplateRef) {
        templateRefs.add(attr);
      } else {
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
interface AngularAttributes {
  /**
   * Attributes that support the * syntax. See https://angular.io/api/core/TemplateRef
   */
  templateRefs: Set<string>;
  /**
   * Attributes with the @Input annotation.
   */
  inputs: Set<string>;
  /**
   * Attributes with the @Output annotation.
   */
  outputs: Set<string>;
  /**
   * Attributes that support the [()] or bindon- syntax.
   */
  bananas: Set<string>;
  /**
   * General attributes that match the specified element.
   */
  others: Set<string>;
}
/**
 * 
 * -----------------------attritube----------------------
 * 
 */
function attributeValueCompletions(info: AstResult, htmlPath: HtmlAstPath): ng.CompletionEntry[] {
  // Find the corresponding Template AST path.
  const templatePath = findTemplateAstAt(info.templateAst, htmlPath.position);
  const visitor = new ExpressionVisitor(info, htmlPath.position, () => {
    const dinfo = diagnosticInfoFromTemplateInfo(info);
    return getExpressionScope(dinfo, templatePath);
  });
  if (templatePath.tail instanceof AttrAst ||
    templatePath.tail instanceof BoundElementPropertyAst ||
    templatePath.tail instanceof BoundEventAst) {
    templatePath.tail.visit(visitor, null);
    return visitor.results;
  }
  // In order to provide accurate attribute value completion, we need to know
  // what the LHS is, and construct the proper AST if it is missing.
  const htmlAttr = htmlPath.tail as Attribute;
  const bindParts = htmlAttr.name.match(BIND_NAME_REGEXP);
  if (bindParts && bindParts[ATTR.KW_REF_IDX] !== undefined) {
    let refAst: ReferenceAst | undefined;
    let elemAst: ElementAst | undefined;
    if (templatePath.tail instanceof ReferenceAst) {
      refAst = templatePath.tail;
      const parent = templatePath.parentOf(refAst);
      if (parent instanceof ElementAst) {
        elemAst = parent;
      }
    } else if (templatePath.tail instanceof ElementAst) {
      refAst = new ReferenceAst(htmlAttr.name, null!, htmlAttr.value, htmlAttr.valueSpan!);
      elemAst = templatePath.tail;
    }
    if (refAst && elemAst) {
      refAst.visit(visitor, elemAst);
    }
  } else {
    // HtmlAst contains the `Attribute` node, however the corresponding `AttrAst`
    // node is missing from the TemplateAst.
    const attrAst = new AttrAst(htmlAttr.name, htmlAttr.value, htmlAttr.valueSpan!);
    attrAst.visit(visitor, null);
  }
  return visitor.results;
}

/**
 * Expression Visitor
 * 
 */
class ExpressionVisitor extends NullTemplateVisitor {
  private readonly completions = new Map<string, ng.CompletionEntry>();

  constructor(
    private readonly info: AstResult, private readonly position: number,
    private readonly getExpressionScope: () => ng.SymbolTable) {
    super();
  }

  get results(): ng.CompletionEntry[] { return Array.from(this.completions.values()); }

  visitDirectiveProperty(ast: BoundDirectivePropertyAst): void {
    this.processExpressionCompletions(ast.value);
  }

  visitElementProperty(ast: BoundElementPropertyAst): void {
    this.processExpressionCompletions(ast.value);
  }

  visitEvent(ast: BoundEventAst): void { this.processExpressionCompletions(ast.handler); }

  visitElement(): void {
    // no-op for now
  }

  visitAttr(ast: AttrAst) {
    if (ast.name.startsWith('*')) {
      // This a template binding given by micro syntax expression.
      // First, verify the attribute consists of some binding we can give completions for.
      const { templateBindings } = this.info.expressionParser.parseTemplateBindings(
        ast.name, ast.value, ast.sourceSpan.toString(), ast.sourceSpan.start.offset);
      // Find where the cursor is relative to the start of the attribute value.
      const valueRelativePosition = this.position - ast.sourceSpan.start.offset;
      // Find the template binding that contains the position.
      const binding = templateBindings.find(b => inSpan(valueRelativePosition, b.span));

      if (!binding) {
        return;
      }

      this.microSyntaxInAttributeValue(ast, binding);
    } else {
      const expressionAst = this.info.expressionParser.parseBinding(
        ast.value, ast.sourceSpan.toString(), ast.sourceSpan.start.offset);
      this.processExpressionCompletions(expressionAst);
    }
  }

  visitReference(_ast: ReferenceAst, context: ElementAst) {
    context.directives.forEach(dir => {
      const { exportAs } = dir.directive;
      if (exportAs) {
        this.completions.set(
          exportAs, { name: exportAs, kind: ng.CompletionKind.REFERENCE, sortText: exportAs });
      }
    });
  }

  visitBoundText(ast: BoundTextAst) {
    if (inSpan(this.position, ast.value.sourceSpan)) {
      const completions = getExpressionCompletions(
        this.getExpressionScope(), ast.value, this.position, this.info.template.query);
      if (completions) {
        this.addSymbolsToCompletions(completions);
      }
    }
  }

  private processExpressionCompletions(value: AST) {
    const symbols = getExpressionCompletions(
      this.getExpressionScope(), value, this.position, this.info.template.query);
    if (symbols) {
      this.addSymbolsToCompletions(symbols);
    }
  }

  private addSymbolsToCompletions(symbols: ng.Symbol[]) {
    for (const s of symbols) {
      if (s.name.startsWith('__') || !s.public || this.completions.has(s.name)) {
        continue;
      }

      // The pipe method should not include parentheses.
      // e.g. {{ value_expression | slice : start [ : end ] }}
      const shouldInsertParentheses = s.callable && s.kind !== ng.CompletionKind.PIPE;
      this.completions.set(s.name, {
        name: s.name,
        kind: s.kind as ng.CompletionKind,
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
  private microSyntaxInAttributeValue(attr: AttrAst, binding: TemplateBinding) {
    const key = attr.name.substring(1);  // remove leading asterisk

    // Find the selector - eg ngFor, ngIf, etc
    const selectorInfo = getSelectors(this.info);
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
          const contextTable =
            this.info.template.query.getTemplateContext(directiveMetadata.type.reference);
          if (contextTable) {
            // This adds symbols like $implicit, index, count, etc.
            this.addSymbolsToCompletions(contextTable.values());
            return;
          }
        }
      }
    }

    if (binding.value && inSpan(valueRelativePosition, binding.value.ast.span)) {
      this.processExpressionCompletions(binding.value.ast);
      return;
    }

    // If the expression is incomplete, for example *ngFor="let x of |"
    // binding.expression is null. We could still try to provide suggestions
    // by looking for symbols that are in scope.
    const KW_OF = ' of ';
    const ofLocation = attr.value.indexOf(KW_OF);
    if (ofLocation > 0 && valueRelativePosition >= ofLocation + KW_OF.length) {
      const expressionAst = this.info.expressionParser.parseBinding(
        attr.value, attr.sourceSpan.toString(), attr.sourceSpan.start.offset);
      this.processExpressionCompletions(expressionAst);
    }
  }
}