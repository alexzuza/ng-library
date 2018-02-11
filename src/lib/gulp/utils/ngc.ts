import * as path from 'path';
import * as fs from 'fs-extra';
import { join } from 'path';
import * as ts from 'typescript';
import * as ngc from '@angular/compiler-cli';
import * as ngcMain from '@angular/compiler-cli/src/main';

import { log } from './log';
import { NgPackageOptions } from '../../types';
import { PackageModel } from './package.model';

export async function compileEntryPoint(buildPackage: PackageModel, secondaryEntryPoint = '', es5OutputPath?) {
  const entryPointPath = join(buildPackage.config.src, secondaryEntryPoint);

  const config = generateConfig(buildPackage.config, es5OutputPath);

  return new Promise((resolve, reject) => {
    ngcMain.main([], (err) => {
      log.error(err);
      reject(err);
    }, config);
    resolve();
  })
}


const tsConfig = `{
  "compilerOptions": {
    "declaration": true,
    "stripInternal": false,
    "experimentalDecorators": true,
    "noUnusedParameters": true,
    "strictNullChecks": true,
    "importHelpers": true,
    "newLine": "lf",
    "module": "es2015",
    "moduleResolution": "node",
    "outDir": "__PLACEHOLDER__",
    "rootDir": "__PLACEHOLDER__",
    "sourceMap": true,
    "inlineSources": true,
    "target": "es2015",
    "lib": ["es2015", "dom"],
    "skipLibCheck": true,
    "types": [],
    "baseUrl": "__PLACEHOLDER__",
    "paths": {
     "@zuz/lib/*": ["../../dist/packages/lib/*"]
    }
  },
  "files": [
    "public_api.ts"
  ],
  "angularCompilerOptions": {
    "annotateForClosureCompiler": true,
    "strictMetadataEmit": true,
    "flatModuleOutFile": "index.js",
    "flatModuleId": "__PLACEHOLDER__",
    "skipTemplateCodegen": true,
    "fullTemplateTypeCheck": true
  }
}`;

function generateConfig(libConfig: NgPackageOptions, es5OutputPath?) {
  let { config } = ts.readConfigFile('', () => tsConfig);
  const fullName = `${libConfig.namespace}/${libConfig.name}`;

  config.angularCompilerOptions.flatModuleId = fullName;
  config.compilerOptions.outDir = es5OutputPath || libConfig.packagesTemp;
  config.compilerOptions.rootDir = libConfig.src;
  config.compilerOptions.baseUrl = libConfig.src;
  config.files = [libConfig.entry];

  if (es5OutputPath) {
    config.compilerOptions.target = 'es5';
  }

  const parseConfigHost = {
    useCaseSensitiveFileNames: true,
    fileExists: fs.existsSync,
    readDirectory: ts.sys.readDirectory,
    readFile: ts.sys.readFile
  };
  const parsed =
    ts.parseJsonConfigFileContent(config, parseConfigHost, libConfig.src, {});

  const options = createNgCompilerOptions(libConfig.src, config, parsed.options);
  const rootNames = parsed.fileNames.map(f => path.normalize(f));

  //  config.compilerOptions.paths[`${fullName}/*`] = ["../../dist/packages/lib/*"]
  // "@zuz/lib/*": ["../../dist/packages/lib/*"]

  return {
    project: '',
    emitFlags: ngc.EmitFlags.Default,
    rootNames,
    options,
    errors: []
  };
}

function createNgCompilerOptions(
  basePath: string, config: any, tsOptions: ts.CompilerOptions): ngc.CompilerOptions {
  return {...tsOptions, ...config.angularCompilerOptions, genDir: basePath, basePath};
}
