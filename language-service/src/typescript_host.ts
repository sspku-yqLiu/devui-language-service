/*
 * @Author: your name
 * @Date: 2020-03-17 09:28:38
 * @LastEditTime: 2020-03-19 22:33:45
 * @LastEditors: Please set LastEditors
 * @Description: In User Settings Edit
 * @FilePath: \devui-language-service\language-service\src\typescript_host.ts
 */
import { Declaration, DeclarationError, DiagnosticMessageChain, LanguageService, LanguageServiceHost, Span, TemplateSource } from './types';
import * as tss from 'typescript/lib/tsserverlibrary';
import { createLanguageService } from './language-service'
// import { HtmlParser, ParseTreeResult, ResourceLoader,analyzeNgModules } from './compiler';
import {HtmlParser} from './parser-related/html_parser';
import {AstResult} from './common';
import {StaticSymbol }from '@angular/compiler';
import {ExternalTemplate} from './template';
import {CompileMetadataResolver} from './metadata_resolver';
import {DevAnalyzedModules} from './parser-related/compiler';
import {Lexer} from './lexer';
import {Parser} from './contentparser';
import{TemplateParser} from './template_parser';
import { findTightestNode } from './utils';
// /**
//  * Create a `LanguageServiceHost`
//  */
// export function createLanguageServiceFromTypescript(
//   host: tss.LanguageServiceHost, service: tss.LanguageService): LanguageService {
//   const devuiHost = new TypeScriptServiceHost(host, service);
//   const devuiServer = createLanguageService(devuiHost);
//   return devuiServer;
// }
// /**
//  * 对不正确的语法进行分析
//  */
// export class DummyHtmlParser extends HtmlParser {
//   parse(): ParseTreeResult { return new ParseTreeResult([], []); }
// }

// /**
//  * 避免使用dummyLoader 进行加载(傀儡机制? 哑头算法)
//  */
// export class DummyResouceLoader extends ResourceLoader {
//   get(url: string): Promise<string> { return Promise.resolve(''); }
// }

export class TypeScriptServiceHost implements LanguageServiceHost {
  private readonly fileToComponent = new Map<string, StaticSymbol>();
  // private readonly summaryResolver: AotSummaryResolver;
  // private readonly reflectorHost: ReflectorHost;
  // private readonly staticSymbolResolver: StaticSymbolResolver;

  // private readonly staticSymbolCache = new StaticSymbolCache();
  // private readonly fileToComponent = new Map<string, StaticSymbol>();
  private lastProgram: tss.Program|undefined = undefined;
  private readonly collectedErrors = new Map<string, any[]>();
  private readonly fileVersions = new Map<string, string>();
  private analyzedModules: DevAnalyzedModules = {
    files: [],
    ngModuleByPipeOrDirective: new Map(),
    ngModules: [],
  };
  
  //-------------resolver----------
  // The resolver is instantiated lazily and should not be accessed directly.
  // Instead, call the resolver getter. The instantiation of the resolver also
  // requires instantiation of the StaticReflector, and the latter requires
  // resolution of core Angular symbols. Module resolution should not be done
  // during instantiation to avoid cyclic dependency between the plugin and the
  // containing Project, so the Singleton pattern is used here.
  // private _resolver: CompileMetadataResolver|undefined;

  // /**
  //  * Return the singleton instance of the MetadataResolver.
  //  */
  // private get resolver(): CompileMetadataResolver {
  //   if (this._resolver) {
  //     return this._resolver;
  //   }
  //   // StaticReflector keeps its own private caches that are not clearable.
  //   // We have no choice but to create a new instance to invalidate the caches.
  //   // TODO: Revisit this when language service gets rewritten for Ivy.
  //   // const staticReflector = new StaticReflector(
  //   //     this.summaryResolver, this.staticSymbolResolver,
  //   //     [],  // knownMetadataClasses
  //   //     [],  // knownMetadataFunctions
  //   //     (e, filePath) => this.collectError(e, filePath));
  //   // Because static reflector above is changed, we need to create a new
  //   // resolver.
  //   // const moduleResolver = new NgModuleResolver(staticReflector);
  //   // const directiveResolver = new DirectiveResolver(staticReflector);
  //   // const pipeResolver = new PipeResolver(staticReflector);
  //   // const elementSchemaRegistry = new DomElementSchemaRegistry();
  //   // const resourceLoader = new DummyResourceLoader();
  //   // const urlResolver = createOfflineCompileUrlResolver();
  //   const htmlParser = new DummyHtmlParser();
  //   // This tracks the CompileConfig in codegen.ts. Currently these options
  //   // are hard-coded.
  //   this._resolver = new CompileMetadataResolver(
  //        htmlParser );
  //   return this._resolver;
  // }
  constructor(
    readonly tsLsHost: tss.LanguageServiceHost, private readonly tsLS: tss.LanguageService) {
  }

  /**
   * Checks whether the program has changed and returns all analyzed modules.
   * If program has changed, invalidate all caches and update fileToComponent
   * and templateReferences.
   * In addition to returning information about NgModules, this method plays the
   * same role as 'synchronizeHostData' in tsserver.
   */
  getAnalyzedModules(): DevAnalyzedModules {
    if (this.upToDate()) {
      return this.analyzedModules;
    }

    // Invalidate caches
    this.fileToComponent.clear();
    this.collectedErrors.clear();
    // this.resolver.clearCache();

    // const analyzeHost = {isSourceFile(filePath: string) { return true; }};
    // const programFiles = this.program.getSourceFiles().map(sf => sf.fileName);
    // this.analyzedModules =
    //     analyzeNgModules(programFiles, analyzeHost, this.staticSymbolResolver, this.resolver);

    // update template references and fileToComponent
    // const urlResolver = createOfflineCompileUrlResolver();
    // for (const ngModule of this.analyzedModules.ngModules) {
    //   for (const directive of ngModule.declaredDirectives) {
    //     const {metadata} = this.resolver.getNonNormalizedDirectiveMetadata(directive.reference) !;
    //     if (metadata.isComponent && metadata.template && metadata.template.templateUrl) {
    //       const templateName = urlResolver.resolve(
    //           this.reflector.componentModuleUrl(directive.reference),
    //           metadata.template.templateUrl);
    //       this.fileToComponent.set(templateName, directive.reference);
    //     }
    //   }
    // }

    return this.analyzedModules;
  }



  /**
   * Return the parsed template for the template at the specified `position`.
   * @param fileName TS or HTML file
   * @param position Position of the template in the TS file, otherwise ignored.
   */
  getTemplateAstAtPosition(fileName: string, position: number): AstResult | undefined {
    let template: TemplateSource | undefined;
    template = this.getExternalTemplate(fileName);
    if (!template) {
      return;
    }
    return this.getTemplateAst(template);
  }

  private getExternalTemplate(fileName: string): TemplateSource | undefined {
    // First get the text for the template
    /**
     * 单文件不需要快照机制
     */
    const snapshot = this.tsLsHost.getScriptSnapshot(fileName);
    if (!snapshot) {
      return;
    }
    const source = snapshot.getText(0, snapshot.getLength());
    // Next find the component class symbol
    // const classSymbol = this.fileToComponent.get(fileName);
    // if (!classSymbol) {
    //   return;
    // }
    //// Then use the class symbol to find the actual ts.ClassDeclaration node
    // const sourceFile = this.getSourceFile(classSymbol.filePath);
    // if (!sourceFile) {
    //   return;
    // }
    // TODO: This only considers top-level class declarations in a source file.
    // This would not find a class declaration in a namespace, for example.
    // const classDecl = sourceFile.forEachChild((child) => {
    //   if (tss.isClassDeclaration(child) && child.name && child.name.text === classSymbol.name) {
    //     return child;
    //   }
    // });
    // if (!classDecl) {
    //   return;
    // }
    return new ExternalTemplate(source, fileName,this);
  }
  


  getSourceFile(fileName: string): tss.SourceFile | undefined {
    if (!fileName.endsWith('.ts')) {
      throw new Error(`Non-TS source file requested: ${fileName}`);
    }
    return this.program.getSourceFile(fileName);
  }

  

  /**
     * Parse the `template` and return its AST, if any.
     * @param template template to be parsed
     */
  getTemplateAst(template: TemplateSource): AstResult | undefined {
    // const { type: classSymbol, fileName } = template;
    const { fileName } = template;
    // const data = this.resolver.getNonNormalizedDirectiveMetadata(classSymbol);
    // if (!data) {
    //   return;
    // }
    const htmlParser = new HtmlParser();
    const expressionParser = new Parser(new Lexer());
    const parser = new TemplateParser(
      new CompilerConfig(), this.reflector, expressionParser, new DomElementSchemaRegistry(),
      htmlParser,
      null!,  // console
      []       // tranforms
    );
    const htmlResult = htmlParser.parse(template.source, fileName, {
      tokenizeExpansionForms: true,
      preserveLineEndings: true,  // do not convert CRLF to LF
    });
    // const { directives, pipes, schemas } = this.getModuleMetadataForDirective(classSymbol);
    // const parseResult = parser.tryParseHtmlTags(htmlResult, data.metadata, directives, pipes, schemas);
    // if (!parseResult.templateAst) {
    //   return;
    // }
    return {
      htmlAst: htmlResult.rootNodes,
      // templateAst: parseResult.templateAst,
      // directive: data.metadata, directives, pipes,
      // parseErrors: parseResult.errors, expressionParser,
       template,
    };
  }

  get program(): tss.Program {
    const program = this.tsLS.getProgram();
    if (!program) {
      // Program is very very unlikely to be undefined.
      throw new Error('No program in language service!');
    }
    return program;
  }


  /**
   * -------------------功能函数---------------------
   */
  /**
 * Checks whether the program has changed, and invalidate static symbols in
 * the source files that have changed.
 * Returns true if modules are up-to-date, false otherwise.
 * This should only be called by getAnalyzedModules().
 */
  private upToDate(): boolean {
    const { lastProgram, program } = this;
    if (lastProgram === program) {
      return true;
    }
    this.lastProgram = program;

    // Even though the program has changed, it could be the case that none of
    // the source files have changed. If all source files remain the same, then
    // program is still up-to-date, and we should not invalidate caches.
    let filesAdded = 0;
    const filesChangedOrRemoved: string[] = [];

    // Check if any source files have been added / changed since last computation.
    const seen = new Set<string>();
    for (const { fileName } of program.getSourceFiles()) {
      seen.add(fileName);
      const version = this.tsLsHost.getScriptVersion(fileName);
      const lastVersion = this.fileVersions.get(fileName);
      if (lastVersion === undefined) {
        filesAdded++;
        this.fileVersions.set(fileName, version);
      } else if (version !== lastVersion) {
        filesChangedOrRemoved.push(fileName);  // changed
        this.fileVersions.set(fileName, version);
      }
    }
    
    // Check if any source files have been removed since last computation.
    for (const [fileName] of this.fileVersions) {
      if (!seen.has(fileName)) {
        filesChangedOrRemoved.push(fileName);  // removed
        // Because Maps are iterated in insertion order, it is safe to delete
        // entries from the same map while iterating.
        // See https://stackoverflow.com/questions/35940216 and
        // https://www.ecma-international.org/ecma-262/10.0/index.html#sec-map.prototype.foreach
        this.fileVersions.delete(fileName);
      }
    }
    /**
     * 从静态资源库里面禁用这些资源，由于我们做的是html补全，所以暂时用不到
     */
    // for (const fileName of filesChangedOrRemoved) {
    //   const symbols = this.staticSymbolResolver.invalidateFile(fileName);
    //   this.reflector.invalidateSymbols(symbols);
    // }

    // Program is up-to-date iff no files are added, changed, or removed.
    return filesAdded === 0 && filesChangedOrRemoved.length === 0;
  }
}
