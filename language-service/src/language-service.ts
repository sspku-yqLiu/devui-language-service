import * as tss from 'typescript/lib/tsserverlibrary';
import { TypeScriptServiceHost } from './typescript_host';
import { getTemplateCompletions } from './completion';

export function createLanguageService(host: TypeScriptServiceHost) {
    return new LanguageServiceImpl(host);
}
class LanguageServiceImpl {

    constructor(private readonly host: TypeScriptServiceHost) {
    }
    getCompletionAtPosition(
        filename: string, position: number,
        options?: tss.GetCompletionsAtPositionOptions) {
            const IsTSEanble = false;

        /***
         * 更新文档树 (主要用于检测是否添加了新的组件与变量，由于我们暂时只实现html的补全，我们先暂时禁用它)
         */ 
        if(IsTSEanble)
            this.host.getAnalyzedModules();
        /**
         *  获得Ast(获得html分析结果)
         */
        const ast = this.host.getTemplateAstAtPosition(filename,position);
        if(!ast){
            return;
        }
        /**
         * 获得补全结果
         */
        const results = getTemplateCompletions(position);
        return results;
        
    }
}