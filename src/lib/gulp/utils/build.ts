import { join, dirname } from 'path';
import { writeFileSync, appendFileSync, readFileSync } from 'fs';

import { mkdirpSync, copySync, readJsonSync } from 'fs-extra';
import { sync } from 'glob';
import { platform } from 'os';
import { spawnSync } from 'child_process';

import { PackageModel } from './package.model';
import { inlinePackageMetadataFiles } from './metadata-inlining';
import { NgPackageOptions } from '../../types';


const angularVersion = '^5.0.0';

function copyFiles(fromPath, fileGlob, outDir) {
  sync(fileGlob, {cwd: fromPath}).forEach(filePath => {
    const fileDestPath = join(outDir, filePath);
    mkdirpSync(dirname(fileDestPath));
    copySync(join(fromPath, filePath), fileDestPath);
  });
}

export function composeRelease(pkg: PackageModel) {
  const { name, namespace, src, outDir,  packagesTemp, bundlesTemp} = pkg.config;

  const importAsName = `${namespace}/${name}`;

  inlinePackageMetadataFiles(packagesTemp);

  // Copy all d.ts and metadata files to the `typings/` directory
  copyFiles(packagesTemp, '**/*.+(d.ts|metadata.json)', join(outDir, 'typings'));

  // Copy UMD bundles.
  copyFiles(bundlesTemp, `${name}.umd?(.min).js?(.map)`, join(outDir, 'bundles'));

  // Copy ES5 bundles.
  copyFiles(bundlesTemp, `${name}.es5.js?(.map)`, join(outDir, 'esm5'));
  copyFiles(join(bundlesTemp, name), `*.es5.js?(.map)`, join(outDir, 'esm5'));

  // Copy ES2015 bundles
  copyFiles(bundlesTemp, `${name}.js?(.map)`, join(outDir, 'esm2015'));
  copyFiles(join(bundlesTemp, name), `!(*.es5|*.umd).js?(.map)`, join(outDir, 'esm2015'));

  copyFiles(src, 'README.md', outDir);
  copyFiles(src, 'package.json', outDir);

  fillPackageJsonEntries(pkg.config);

  replaceVersionPlaceholders(outDir);
  createTypingsReexportFile(outDir, './typings/index', name);
  createMetadataReexportFile(outDir, './typings/index', name, importAsName);

  if (pkg.secondaryEntryPoints.length) {
    createFilesForSecondaryEntryPoint(pkg, outDir);
  }

  if (pkg.exportsSecondaryEntryPointsAtRoot) {
    const es2015Exports = pkg.secondaryEntryPoints
      .map(p => `export * from './${p}';`).join('\n');
    appendFileSync(join(outDir, `${name}.d.ts`), es2015Exports, 'utf-8');

    // When re-exporting secondary entry-points, we need to manually create a metadata file that
    // re-exports everything.
    createMetadataReexportFile(
      outDir,
      pkg.secondaryEntryPoints.concat(['typings/index']).map(p => `./${p}`),
      name,
      importAsName);
  }
}

function createTypingsReexportFile(outDir, from, fileName) {
  writeFileSync(join(outDir, `${fileName}.d.ts`),
    `\nexport * from '${from}';\n`,
    'utf-8');
}

function createMetadataReexportFile(destDir, from, entryPointName, importAsName) {
  from = Array.isArray(from) ? from : [from];

  const metadataJsonContent = JSON.stringify({
    __symbolic: 'module',
    version: 4,
    metadata: {},
    exports: from.map(f => ({from: f})),
    flatModuleIndexRedirect: true,
    importAs: importAsName
  }, null, 2);

  writeFileSync(join(destDir, `${entryPointName}.metadata.json`), metadataJsonContent, 'utf-8');
}


/** Creates files necessary for a secondary entry-point. */
function createFilesForSecondaryEntryPoint(buildPackage, releasePath) {
  const { namespace, name } = buildPackage;
  const packageOut = buildPackage.outputDir;

  buildPackage.secondaryEntryPoints.forEach(entryPointName => {
    // Create a directory in the root of the package for this entry point that contains
    // * A package.json that lists the different bundle locations
    // * An index.d.ts file that re-exports the index.d.ts from the typings/ directory
    // * A metadata.json re-export for this entry-point's metadata.
    const entryPointDir = join(releasePath, entryPointName);
    const importAsName = `${namespace}/${name}/${entryPointName}`;

    mkdirpSync(entryPointDir);
    createEntryPointPackageJson(entryPointDir, namespace, name, entryPointName);

    // Copy typings and metadata from tsc output location into the entry-point.
    copyFiles(
      join(packageOut, entryPointName),
      '**/*.+(d.ts|metadata.json)',
      join(entryPointDir, 'typings'));

    // Create a typings and a metadata re-export within the entry-point to point to the
    // typings we just copied.
    createTypingsReexportFile(entryPointDir, `./typings/index`, 'index');
    createMetadataReexportFile(entryPointDir, `./typings/index`, 'index', importAsName);

    // Finally, create both a d.ts and metadata file for this entry-point in the root of
    // the package that re-exports from the entry-point's directory.
    createTypingsReexportFile(releasePath, `./${entryPointName}/index`, entryPointName);
    createMetadataReexportFile(releasePath, `./${entryPointName}/index`, entryPointName,
      importAsName);
  });
}

/** Variable that is set to the string for version placeholders. */
const versionPlaceholderText = '0.0.0-PLACEHOLDER';

/** Placeholder that will be replaced with the required Angular version. */
const ngVersionPlaceholderText = '0.0.0-NG';

/** RegExp that matches version placeholders inside of a file. */
const ngVersionPlaceholderRegex = new RegExp(ngVersionPlaceholderText, 'g');

/** Expression that matches Angular version placeholders within a file. */
const versionPlaceholderRegex = new RegExp(versionPlaceholderText, 'g');

function replaceVersionPlaceholders(packageDir) {
  // Resolve files that contain version placeholders using Grep or Findstr since those are
  // extremely fast and also have a very simple usage.
  const files = findFilesWithPlaceholders(packageDir);

  // Walk through every file that contains version placeholders and replace those with the current
  // version of the root package.json file.
  files.forEach(filePath => {
    const fileContent = readFileSync(filePath, 'utf-8')
      .replace(ngVersionPlaceholderRegex, angularVersion)
      .replace(versionPlaceholderRegex, '1.0.0'/*projectVersion*/);

    writeFileSync(filePath, fileContent);
  });
}

/** Finds all files in the specified package dir where version placeholders are included. */
function findFilesWithPlaceholders(packageDir) {
  const findCommand = buildPlaceholderFindCommand(packageDir);
  return spawnSync(findCommand.binary, findCommand.args).stdout
    .toString()
    .split(/[\n\r]/)
    .filter(String);
}

/** Builds the command that will be executed to find all files containing version placeholders. */
function buildPlaceholderFindCommand(packageDir) {
  if (platform() === 'win32') {
    return {
      binary: 'findstr',
      args: ['/msi', `${ngVersionPlaceholderText} ${versionPlaceholderText}`, `${packageDir}\\*`]
    };
  } else {
    return {
      binary: 'grep',
      args: ['-ril', `${ngVersionPlaceholderText}\\|${versionPlaceholderText}`, packageDir]
    };
  }
}

function createEntryPointPackageJson(destDir, namespace, packageName, entryPointName) {
  const content = {
    name: `${namespace}/${packageName}/${entryPointName}`,
    typings: `../${entryPointName}.d.ts`,
    main: `../bundles/${packageName}-${entryPointName}.umd.js`,
    module: `../esm5/${entryPointName}.es5.js`,
    es2015: `../esm2015/${entryPointName}.js`,
  };

  writeFileSync(join(destDir, 'package.json'), JSON.stringify(content, null, 2), 'utf-8');
}


function fillPackageJsonEntries(options: NgPackageOptions) {
  const content = {
    name: `${options.namespace}/${options.name}`,
    typings: `./${options.name}.d.ts`,
    main: `./bundles/${options.name}.umd.js`,
    module: `./esm5/${options.name}.es5.js`,
    es2015: `./esm2015/${options.name}.js`,
  };

  const packageJsonPath = join(options.outDir, 'package.json');
  const json = readJsonSync(packageJsonPath);

  delete json.lib;

  Object.assign(content, json);

  writeFileSync(packageJsonPath, JSON.stringify(content, null, 2), 'utf-8');
}
