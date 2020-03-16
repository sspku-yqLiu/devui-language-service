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
const core_1 = require("@angular/core");
const tss = require("typescript/lib/tsserverlibrary");
const language_service_1 = require("./language_service");
const reflector_host_1 = require("./reflector_host");
const template_1 = require("./template");
const utils_1 = require("./utils");
/**
 * Create a `LanguageServiceHost`
 */
function createLanguageServiceFromTypescript(host, service) {
    const ngHost = new TypeScriptServiceHost(host, service);
    const ngServer = language_service_1.createLanguageService(ngHost);
    return ngServer;
}
exports.createLanguageServiceFromTypescript = createLanguageServiceFromTypescript;
/**
 * The language service never needs the normalized versions of the metadata. To avoid parsing
 * the content and resolving references, return an empty file. This also allows normalizing
 * template that are syntatically incorrect which is required to provide completions in
 * syntactically incorrect templates.
 */
class DummyHtmlParser extends compiler_1.HtmlParser {
    parse() { return new compiler_1.ParseTreeResult([], []); }
}
exports.DummyHtmlParser = DummyHtmlParser;
/**
 * Avoid loading resources in the language servcie by using a dummy loader.
 */
class DummyResourceLoader extends compiler_1.ResourceLoader {
    get(url) { return Promise.resolve(''); }
}
exports.DummyResourceLoader = DummyResourceLoader;
/**
 * An implementation of a `LanguageServiceHost` for a TypeScript project.
 *
 * The `TypeScriptServiceHost` implements the Angular `LanguageServiceHost` using
 * the TypeScript language services.
 *
 * @publicApi
 */
class TypeScriptServiceHost {
    constructor(tsLsHost, tsLS) {
        this.tsLsHost = tsLsHost;
        this.tsLS = tsLS;
        this.staticSymbolCache = new compiler_1.StaticSymbolCache();
        this.fileToComponent = new Map();
        this.collectedErrors = new Map();
        this.fileVersions = new Map();
        this.lastProgram = undefined;
        this.analyzedModules = {
            files: [],
            ngModuleByPipeOrDirective: new Map(),
            ngModules: [],
        };
        this.summaryResolver = new compiler_1.AotSummaryResolver({
            loadSummary(filePath) { return null; },
            isSourceFile(sourceFilePath) { return true; },
            toSummaryFileName(sourceFilePath) { return sourceFilePath; },
            fromSummaryFileName(filePath) { return filePath; },
        }, this.staticSymbolCache);
        this.reflectorHost = new reflector_host_1.ReflectorHost(() => this.program, tsLsHost);
        this.staticSymbolResolver = new compiler_1.StaticSymbolResolver(this.reflectorHost, this.staticSymbolCache, this.summaryResolver, (e, filePath) => this.collectError(e, filePath));
    }
    /**
     * Return the singleton instance of the MetadataResolver.
     */
    get resolver() {
        if (this._resolver) {
            return this._resolver;
        }
        // StaticReflector keeps its own private caches that are not clearable.
        // We have no choice but to create a new instance to invalidate the caches.
        // TODO: Revisit this when language service gets rewritten for Ivy.
        const staticReflector = new compiler_1.StaticReflector(this.summaryResolver, this.staticSymbolResolver, [], // knownMetadataClasses
        [], // knownMetadataFunctions
        (e, filePath) => this.collectError(e, filePath));
        // Because static reflector above is changed, we need to create a new
        // resolver.
        const moduleResolver = new compiler_1.NgModuleResolver(staticReflector);
        const directiveResolver = new compiler_1.DirectiveResolver(staticReflector);
        const pipeResolver = new compiler_1.PipeResolver(staticReflector);
        const elementSchemaRegistry = new compiler_1.DomElementSchemaRegistry();
        const resourceLoader = new DummyResourceLoader();
        const urlResolver = compiler_1.createOfflineCompileUrlResolver();
        const htmlParser = new DummyHtmlParser();
        // This tracks the CompileConfig in codegen.ts. Currently these options
        // are hard-coded.
        const config = new compiler_1.CompilerConfig({
            defaultEncapsulation: core_1.ViewEncapsulation.Emulated,
            useJit: false,
        });
        const directiveNormalizer = new compiler_1.DirectiveNormalizer(resourceLoader, urlResolver, htmlParser, config);
        this._resolver = new compiler_1.CompileMetadataResolver(config, htmlParser, moduleResolver, directiveResolver, pipeResolver, new compiler_1.JitSummaryResolver(), elementSchemaRegistry, directiveNormalizer, new core_1.ɵConsole(), this.staticSymbolCache, staticReflector, (error, type) => this.collectError(error, type && type.filePath));
        return this._resolver;
    }
    /**
     * Return the singleton instance of the StaticReflector hosted in the
     * MetadataResolver.
     */
    get reflector() {
        return this.resolver.getReflector();
    }
    /**
     * Checks whether the program has changed and returns all analyzed modules.
     * If program has changed, invalidate all caches and update fileToComponent
     * and templateReferences.
     * In addition to returning information about NgModules, this method plays the
     * same role as 'synchronizeHostData' in tsserver.
     */
    getAnalyzedModules() {
        if (this.upToDate()) {
            return this.analyzedModules;
        }
        // Invalidate caches
        this.fileToComponent.clear();
        this.collectedErrors.clear();
        this.resolver.clearCache();
        const analyzeHost = { isSourceFile(filePath) { return true; } };
        const programFiles = this.program.getSourceFiles().map(sf => sf.fileName);
        this.analyzedModules =
            compiler_1.analyzeNgModules(programFiles, analyzeHost, this.staticSymbolResolver, this.resolver);
        // update template references and fileToComponent
        const urlResolver = compiler_1.createOfflineCompileUrlResolver();
        for (const ngModule of this.analyzedModules.ngModules) {
            for (const directive of ngModule.declaredDirectives) {
                const { metadata } = this.resolver.getNonNormalizedDirectiveMetadata(directive.reference);
                if (metadata.isComponent && metadata.template && metadata.template.templateUrl) {
                    const templateName = urlResolver.resolve(this.reflector.componentModuleUrl(directive.reference), metadata.template.templateUrl);
                    this.fileToComponent.set(templateName, directive.reference);
                }
            }
        }
        return this.analyzedModules;
    }
    /**
     * Checks whether the program has changed, and invalidate static symbols in
     * the source files that have changed.
     * Returns true if modules are up-to-date, false otherwise.
     * This should only be called by getAnalyzedModules().
     */
    upToDate() {
        const { lastProgram, program } = this;
        if (lastProgram === program) {
            return true;
        }
        this.lastProgram = program;
        // Even though the program has changed, it could be the case that none of
        // the source files have changed. If all source files remain the same, then
        // program is still up-to-date, and we should not invalidate caches.
        let filesAdded = 0;
        const filesChangedOrRemoved = [];
        // Check if any source files have been added / changed since last computation.
        const seen = new Set();
        for (const { fileName } of program.getSourceFiles()) {
            seen.add(fileName);
            const version = this.tsLsHost.getScriptVersion(fileName);
            const lastVersion = this.fileVersions.get(fileName);
            if (lastVersion === undefined) {
                filesAdded++;
                this.fileVersions.set(fileName, version);
            }
            else if (version !== lastVersion) {
                filesChangedOrRemoved.push(fileName); // changed
                this.fileVersions.set(fileName, version);
            }
        }
        // Check if any source files have been removed since last computation.
        for (const [fileName] of this.fileVersions) {
            if (!seen.has(fileName)) {
                filesChangedOrRemoved.push(fileName); // removed
                // Because Maps are iterated in insertion order, it is safe to delete
                // entries from the same map while iterating.
                // See https://stackoverflow.com/questions/35940216 and
                // https://www.ecma-international.org/ecma-262/10.0/index.html#sec-map.prototype.foreach
                this.fileVersions.delete(fileName);
            }
        }
        for (const fileName of filesChangedOrRemoved) {
            const symbols = this.staticSymbolResolver.invalidateFile(fileName);
            this.reflector.invalidateSymbols(symbols);
        }
        // Program is up-to-date iff no files are added, changed, or removed.
        return filesAdded === 0 && filesChangedOrRemoved.length === 0;
    }
    /**
     * Find all templates in the specified `file`.
     * @param fileName TS or HTML file
     */
    getTemplates(fileName) {
        const results = [];
        if (fileName.endsWith('.ts')) {
            // Find every template string in the file
            const visit = (child) => {
                const template = this.getInternalTemplate(child);
                if (template) {
                    results.push(template);
                }
                else {
                    tss.forEachChild(child, visit);
                }
            };
            const sourceFile = this.getSourceFile(fileName);
            if (sourceFile) {
                tss.forEachChild(sourceFile, visit);
            }
        }
        else {
            const template = this.getExternalTemplate(fileName);
            if (template) {
                results.push(template);
            }
        }
        return results;
    }
    /**
     * Return metadata about all class declarations in the file that are Angular
     * directives. Potential matches are `@NgModule`, `@Component`, `@Directive`,
     * `@Pipes`, etc. class declarations.
     *
     * @param fileName TS file
     */
    getDeclarations(fileName) {
        if (!fileName.endsWith('.ts')) {
            return [];
        }
        const sourceFile = this.getSourceFile(fileName);
        if (!sourceFile) {
            return [];
        }
        const results = [];
        const visit = (child) => {
            const candidate = utils_1.getDirectiveClassLike(child);
            if (candidate) {
                const { classId } = candidate;
                const declarationSpan = spanOf(classId);
                const className = classId.getText();
                const classSymbol = this.reflector.getStaticSymbol(sourceFile.fileName, className);
                // Ask the resolver to check if candidate is actually Angular directive
                if (!this.resolver.isDirective(classSymbol)) {
                    return;
                }
                const data = this.resolver.getNonNormalizedDirectiveMetadata(classSymbol);
                if (!data) {
                    return;
                }
                results.push({
                    type: classSymbol,
                    declarationSpan,
                    metadata: data.metadata,
                    errors: this.getCollectedErrors(declarationSpan, sourceFile),
                });
            }
            else {
                child.forEachChild(visit);
            }
        };
        tss.forEachChild(sourceFile, visit);
        return results;
    }
    getSourceFile(fileName) {
        if (!fileName.endsWith('.ts')) {
            throw new Error(`Non-TS source file requested: ${fileName}`);
        }
        return this.program.getSourceFile(fileName);
    }
    get program() {
        const program = this.tsLS.getProgram();
        if (!program) {
            // Program is very very unlikely to be undefined.
            throw new Error('No program in language service!');
        }
        return program;
    }
    /**
     * Return the TemplateSource if `node` is a template node.
     *
     * For example,
     *
     * @Component({
     *   template: '<div></div>' <-- template node
     * })
     * class AppComponent {}
     *           ^---- class declaration node
     *
     * @param node Potential template node
     */
    getInternalTemplate(node) {
        if (!tss.isStringLiteralLike(node)) {
            return;
        }
        const tmplAsgn = template_1.getPropertyAssignmentFromValue(node);
        if (!tmplAsgn || tmplAsgn.name.getText() !== 'template') {
            return;
        }
        const classDecl = template_1.getClassDeclFromDecoratorProp(tmplAsgn);
        if (!classDecl || !classDecl.name) { // Does not handle anonymous class
            return;
        }
        const fileName = node.getSourceFile().fileName;
        const classSymbol = this.reflector.getStaticSymbol(fileName, classDecl.name.text);
        return new template_1.InlineTemplate(node, classDecl, classSymbol, this);
    }
    /**
     * Return the external template for `fileName`.
     * @param fileName HTML file
     */
    getExternalTemplate(fileName) {
        // First get the text for the template
        const snapshot = this.tsLsHost.getScriptSnapshot(fileName);
        if (!snapshot) {
            return;
        }
        const source = snapshot.getText(0, snapshot.getLength());
        // Next find the component class symbol
        const classSymbol = this.fileToComponent.get(fileName);
        if (!classSymbol) {
            return;
        }
        // Then use the class symbol to find the actual ts.ClassDeclaration node
        const sourceFile = this.getSourceFile(classSymbol.filePath);
        if (!sourceFile) {
            return;
        }
        // TODO: This only considers top-level class declarations in a source file.
        // This would not find a class declaration in a namespace, for example.
        const classDecl = sourceFile.forEachChild((child) => {
            if (tss.isClassDeclaration(child) && child.name && child.name.text === classSymbol.name) {
                return child;
            }
        });
        if (!classDecl) {
            return;
        }
        return new template_1.ExternalTemplate(source, fileName, classDecl, classSymbol, this);
    }
    collectError(error, filePath) {
        if (filePath) {
            let errors = this.collectedErrors.get(filePath);
            if (!errors) {
                errors = [];
                this.collectedErrors.set(filePath, errors);
            }
            errors.push(error);
        }
    }
    getCollectedErrors(defaultSpan, sourceFile) {
        const errors = this.collectedErrors.get(sourceFile.fileName);
        if (!errors) {
            return [];
        }
        // TODO: Add better typings for the errors
        return errors.map((e) => {
            const line = e.line || (e.position && e.position.line);
            const column = e.column || (e.position && e.position.column);
            const span = spanAt(sourceFile, line, column) || defaultSpan;
            if (compiler_1.isFormattedError(e)) {
                return errorToDiagnosticWithChain(e, span);
            }
            return { message: e.message, span };
        });
    }
    /**
     * Return the parsed template for the template at the specified `position`.
     * @param fileName TS or HTML file
     * @param position Position of the template in the TS file, otherwise ignored.
     */
    getTemplateAstAtPosition(fileName, position) {
        let template;
        if (fileName.endsWith('.ts')) {
            const sourceFile = this.getSourceFile(fileName);
            if (!sourceFile) {
                return;
            }
            // Find the node that most closely matches the position
            const node = utils_1.findTightestNode(sourceFile, position);
            if (!node) {
                return;
            }
            template = this.getInternalTemplate(node);
        }
        else {
            template = this.getExternalTemplate(fileName);
        }
        if (!template) {
            return;
        }
        return this.getTemplateAst(template);
    }
    /**
     * Find the NgModule which the directive associated with the `classSymbol`
     * belongs to, then return its schema and transitive directives and pipes.
     * @param classSymbol Angular Symbol that defines a directive
     */
    getModuleMetadataForDirective(classSymbol) {
        const result = {
            directives: [],
            pipes: [],
            schemas: [],
        };
        // First find which NgModule the directive belongs to.
        const ngModule = this.analyzedModules.ngModuleByPipeOrDirective.get(classSymbol) ||
            findSuitableDefaultModule(this.analyzedModules);
        if (!ngModule) {
            return result;
        }
        // Then gather all transitive directives and pipes.
        const { directives, pipes } = ngModule.transitiveModule;
        for (const directive of directives) {
            const data = this.resolver.getNonNormalizedDirectiveMetadata(directive.reference);
            if (data) {
                result.directives.push(data.metadata.toSummary());
            }
        }
        for (const pipe of pipes) {
            const metadata = this.resolver.getOrLoadPipeMetadata(pipe.reference);
            result.pipes.push(metadata.toSummary());
        }
        result.schemas.push(...ngModule.schemas);
        return result;
    }
    /**
     * Parse the `template` and return its AST, if any.
     * @param template template to be parsed
     */
    getTemplateAst(template) {
        const { type: classSymbol, fileName } = template;
        const data = this.resolver.getNonNormalizedDirectiveMetadata(classSymbol);
        if (!data) {
            return;
        }
        const htmlParser = new compiler_1.HtmlParser();
        const expressionParser = new compiler_1.Parser(new compiler_1.Lexer());
        const parser = new compiler_1.TemplateParser(new compiler_1.CompilerConfig(), this.reflector, expressionParser, new compiler_1.DomElementSchemaRegistry(), htmlParser, null, // console
        [] // tranforms
        );
        const htmlResult = htmlParser.parse(template.source, fileName, {
            tokenizeExpansionForms: true,
            preserveLineEndings: true,
        });
        const { directives, pipes, schemas } = this.getModuleMetadataForDirective(classSymbol);
        const parseResult = parser.tryParseHtml(htmlResult, data.metadata, directives, pipes, schemas);
        if (!parseResult.templateAst) {
            return;
        }
        return {
            htmlAst: htmlResult.rootNodes,
            templateAst: parseResult.templateAst,
            directive: data.metadata, directives, pipes,
            parseErrors: parseResult.errors, expressionParser, template,
        };
    }
    /**
     * Log the specified `msg` to file at INFO level. If logging is not enabled
     * this method is a no-op.
     * @param msg Log message
     */
    log(msg) {
        if (this.tsLsHost.log) {
            this.tsLsHost.log(msg);
        }
    }
    /**
     * Log the specified `msg` to file at ERROR level. If logging is not enabled
     * this method is a no-op.
     * @param msg error message
     */
    error(msg) {
        if (this.tsLsHost.error) {
            this.tsLsHost.error(msg);
        }
    }
    /**
     * Log debugging info to file at INFO level, only if verbose setting is turned
     * on. Otherwise, this method is a no-op.
     * @param msg debugging message
     */
    debug(msg) {
        const project = this.tsLsHost;
        if (!project.projectService) {
            // tsLsHost is not a Project
            return;
        }
        const { logger } = project.projectService;
        if (logger.hasLevel(tss.server.LogLevel.verbose)) {
            logger.info(msg);
        }
    }
}
exports.TypeScriptServiceHost = TypeScriptServiceHost;
function findSuitableDefaultModule(modules) {
    let result = undefined;
    let resultSize = 0;
    for (const module of modules.ngModules) {
        const moduleSize = module.transitiveModule.directives.length;
        if (moduleSize > resultSize) {
            result = module;
            resultSize = moduleSize;
        }
    }
    return result;
}
function spanOf(node) {
    return { start: node.getStart(), end: node.getEnd() };
}
function spanAt(sourceFile, line, column) {
    if (line != null && column != null) {
        const position = tss.getPositionOfLineAndCharacter(sourceFile, line, column);
        const findChild = function findChild(node) {
            if (node.kind > tss.SyntaxKind.LastToken && node.pos <= position && node.end > position) {
                const betterNode = tss.forEachChild(node, findChild);
                return betterNode || node;
            }
        };
        const node = tss.forEachChild(sourceFile, findChild);
        if (node) {
            return { start: node.getStart(), end: node.getEnd() };
        }
    }
}
function convertChain(chain) {
    return { message: chain.message, next: chain.next ? chain.next.map(convertChain) : undefined };
}
function errorToDiagnosticWithChain(error, span) {
    return { message: error.chain ? convertChain(error.chain) : error.message, span };
}
//# sourceMappingURL=typescript_host.js.map