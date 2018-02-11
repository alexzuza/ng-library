import { pathExistsSync, readJsonSync, lstatSync } from 'fs-extra';
import * as path from 'path';

import { CliOptions, NgPackageOptions } from './types';
import { runGulp } from './gulp/tasks';


export function performBuild(options: CliOptions) {
  const packageOptions = readOptions(options.project);

  return runGulp(packageOptions);
}

function readOptions(filePath: string): NgPackageOptions {
  if (!isFileExists(filePath)) {
    throw new Error(`Cannot find package.json at ${filePath}`);
  }
debugger
  const fullPath = path.isAbsolute(filePath) ? filePath : path.resolve(filePath);
  const basePath = path.dirname(fullPath);
  const json = readJsonSync(fullPath);

  let outDir = path.join(basePath, 'dist');

  const options = json.lib;
  if (!options) {
    throw new Error(`Cannot find lib options in ${filePath}`);
  }

  if (options.outDir) {
    outDir = path.join(basePath, options.outDir)
  }

  if (!options.entry) {
    throw new Error(`Please provide entry`);
  }

  const src = basePath;

  const [namespace, packageName] = json.name.split('/');

  if (!namespace) {
    throw new Error(`Please provide namespace option`);
  }

  if (!packageName) {
    throw new Error(`Please provide packageName option`);
  }

  const temp = path.join(outDir, 'temp');

  const packagesTemp = path.join(temp, 'packages');
  const bundlesTemp = path.join(temp, 'bundles');

  return {
    name: packageName,
    namespace: namespace,
    src,
    entry: options.entry,
    outDir,
    temp,
    packagesTemp,
    bundlesTemp
  };
}

function isFileExists(path: string) {
  return pathExistsSync(path) && lstatSync(path).isFile();
}

