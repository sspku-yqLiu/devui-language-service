/*
 * @Author: your name
 * @Date: 2020-03-18 08:49:20
 * @LastEditTime: 2020-03-18 08:49:20
 * @LastEditors: Please set LastEditors
 * @Description: In User Settings Edit
 * @FilePath: \devui-language-service\language-service\src\compiler.ts
 */
export interface DevAnalyzedModules {
    ngModules: CompileNgModuleMetadata[];
    ngModuleByPipeOrDirective: Map<StaticSymbol, CompileNgModuleMetadata>;
    files: NgAnalyzedFile[];
    symbolsMissingModule?: StaticSymbol[];
  }
/**
 * A token representing the a reference to a static type.
 *
 * This token is unique for a filePath and name and can be used as a hash table key.
 */
export class StaticSymbol {
    constructor(public filePath: string, public name: string, public members: string[]) {}
  
    assertNoMembers() {
      if (this.members.length) {
        throw new Error(
            `Illegal state: symbol without members expected, but got ${JSON.stringify(this)}.`);
      }
    }
  }