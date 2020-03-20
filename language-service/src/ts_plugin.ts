/*
 * @Author: your name
 * @Date: 2020-03-17 09:17:50
 * @LastEditTime: 2020-03-17 09:17:51
 * @LastEditors: Please set LastEditors
 * @Description: In User Settings Edit
 * @FilePath: \devui-language-service\language-service\src\ts_plugin.ts
 */
import * as tss from 'typescript/lib/tsserverlibrary';
import { TypeScriptServiceHost } from './typescript_host';
import { createLanguageService } from './language-service';
export function create(info: tss.server.PluginCreateInfo){
 const {languageService:tsLS,languageServiceHost:tsLSHost,config}= info;
/**
 * 建立主机并开启服务
 */ 
 const devuiHost = new TypeScriptServiceHost(tsLSHost,tsLS);
 const devuiLS = createLanguageService(devuiHost);
 /**
  * 与angular不同的是，我们这个插件只有一种形式
  * 现在我们需要完成建立host与createLanguageService 两个任务
  */
 function getCompletionAtPosition(fileName:string,position:number,
    options:tss.GetCompletionsAtPositionOptions|undefined ){
        const results = tsLS.getCompletionsAtPosition(fileName,position,options);
        if(results && results.entries.length)
            return results;
        return devuiLS.getCompletionAtPosition(fileName,position,options);
 }

 const proxy : tss.LanguageService = Object.assign(
     {},tsLS,{
         getCompletionAtPosition,
     });
     return proxy;
}