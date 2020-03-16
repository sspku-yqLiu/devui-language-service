/*
 * @Author: your name
 * @Date: 2020-03-14 14:45:36
 * @LastEditTime: 2020-03-16 20:46:11
 * @LastEditors: Please set LastEditors
 * @Description: In User Settings Edit
 * @FilePath: \DevUI-Language-Support\rollup.config.js
 */
import * as fs from 'fs';
import commonjs from 'rollup-plugin-commonjs';
module.exports = [
  {
    input: 'language-service/out/ts_plugin.js',
    output: {
      file: 'language-service/bundles/index.js',
      format: 'cjs',
      exports: 'named',
    },
    external: [
      'path',
      'vscode',
      'vscode-languageclient',
    ],
    plugins: [
      commonjs(),
    ],
  },
];
