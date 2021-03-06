import { PackageModel } from './package.model';
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname, basename } from 'path';
import * as sorcery from 'sorcery';
import * as uglify from 'uglify-js';
const rollup = require('rollup');
import * as rollupNodeResolutionPlugin from 'rollup-plugin-node-resolve';
import * as rollupAlias from 'rollup-plugin-alias';

import { getRollupGlobals, dashCaseToCamelCase } from './rollup-globals';
import { log } from './log';


export class PackageBundler {
  bundlesDir: string;

  rollupGlobals: any;

  constructor(private buildPackage: PackageModel) {
    this.bundlesDir = buildPackage.config.bundlesTemp;
    this.rollupGlobals = getRollupGlobals(this.buildPackage.config);
  }

  /** Creates all bundles for the package and all associated entry points (UMD, ES5, ES2015). */
  async createBundles() {
    for (const entryPoint of this.buildPackage.secondaryEntryPoints) {
      await this.bundleSecondaryEntryPoint(entryPoint);
    }

    await this.bundlePrimaryEntryPoint();
  }

  /** Bundles the primary entry-point w/ given entry file, e.g. @angular/cdk */
  async bundlePrimaryEntryPoint() {
    const packageName = this.buildPackage.name;

    return this.bundleEntryPoint({
      entryFile: this.buildPackage.entryFilePath,
      esm5EntryFile: join(this.buildPackage.esm5OutputDir, 'index.js'),
      moduleName: `ng.${this.buildPackage.name}`,
      esm2015Dest: join(this.bundlesDir, `${packageName}.js`),
      esm5Dest: join(this.bundlesDir, `${packageName}.es5.js`),
      umdDest: join(this.bundlesDir, `${packageName}.umd.js`),
      umdMinDest: join(this.bundlesDir, `${packageName}.umd.min.js`),
    });
  }

  /** Bundles a single secondary entry-point w/ given entry file, e.g. @angular/cdk/a11y */
  async bundleSecondaryEntryPoint(entryPoint) {
    const packageName = this.buildPackage.name;
    const entryFile = join(this.buildPackage.config.packagesTemp, entryPoint, 'index.js');
    const esm5EntryFile = join(this.buildPackage.esm5OutputDir, entryPoint, 'index.js');

    return this.bundleEntryPoint({
      entryFile,
      esm5EntryFile,
      moduleName: `ng.${packageName}.${dashCaseToCamelCase(entryPoint)}`,
      esm2015Dest: join(this.bundlesDir, `${packageName}`, `${entryPoint}.js`),
      esm5Dest: join(this.bundlesDir, `${packageName}`, `${entryPoint}.es5.js`),
      umdDest: join(this.bundlesDir, `${packageName}-${entryPoint}.umd.js`),
      umdMinDest: join(this.bundlesDir, `${packageName}-${entryPoint}.umd.min.js`),
    });
  }

  /**
   * Creates the ES5, ES2015, and UMD bundles for the specified entry-point.
   * @param config Configuration that specifies the entry-point, module name, and output
   *     bundle paths.
   */
  async bundleEntryPoint(config) {
    // Build FESM-2015 bundle file.
    await this.createRollupBundle({
      moduleName: config.moduleName,
      entry: config.entryFile,
      dest: config.esm2015Dest,
      format: 'es',
    });

    // Build FESM-5 bundle file.
    await this.createRollupBundle({
      moduleName: config.moduleName,
      entry: config.esm5EntryFile,
      dest: config.esm5Dest,
      format: 'es',
    });

    // Create UMD bundle of ES5 output.
    await this.createRollupBundle({
      moduleName: config.moduleName,
      entry: config.esm5Dest,
      dest: config.umdDest,
      format: 'umd'
    });

    // Create a minified UMD bundle using UglifyJS
    uglifyJsFile(config.umdDest, config.umdMinDest);

    // Remaps the sourcemaps to be based on top of the original TypeScript source files.
    await remapSourcemap(config.esm2015Dest);
    await remapSourcemap(config.esm5Dest);
    await remapSourcemap(config.umdDest);
    await remapSourcemap(config.umdMinDest);
  }

  /** Creates a rollup bundle of a specified JavaScript file. */
  async createRollupBundle(config) {
    const bundleOptions = {
      context: 'this',
      external: Object.keys(this.rollupGlobals),
      input: config.entry,
      onwarn: (message) => {
        // TODO(jelbourn): figure out *why* rollup warns about certain symbols not being found
        // when those symbols don't appear to be in the input file in the first place.
        if (/but never used/.test(message)) {
          return false;
        }

        console.warn(message);
      },
      plugins: []
    };

    const writeOptions = {
      name: config.moduleName,
      banner: '', // TODO license banner
      format: config.format,
      file: config.dest,
      globals: this.rollupGlobals,
      sourcemap: true
    };

    // For UMD bundles, we need to adjust the `external` bundle option in order to include
    // all necessary code in the bundle.
    if (config.format === 'umd') {
      bundleOptions.plugins.push(rollupNodeResolutionPlugin());

      // For all UMD bundles, we want to exclude tslib from the `external` bundle option so that
      // it is inlined into the bundle.
      let external = Object.keys(this.rollupGlobals);
      external.splice(external.indexOf('tslib'), 1);

      // If each secondary entry-point is re-exported at the root, we want to exclude those
      // secondary entry-points from the rollup globals because we want the UMD for the
      // primary entry-point to include *all* of the sources for those entry-points.
      if (this.buildPackage.exportsSecondaryEntryPointsAtRoot &&
        config.moduleName === `ng.${this.buildPackage.name}`) {

        const importRegex = new RegExp(`${this.buildPackage.namespace}/${this.buildPackage.name}/.+`);
        external = external.filter(e => !importRegex.test(e));

        // Use the rollup-alias plugin to map imports of the form `@angular/material/button`
        // to the actual file location so that rollup can resolve the imports (otherwise they
        // will be treated as external dependencies and not included in the bundle).
        bundleOptions.plugins.push(rollupAlias(this.getResolvedSecondaryEntryPointImportPaths(config.dest)));
      }

      bundleOptions.external = external;
    }

    return rollup.rollup(bundleOptions).then((bundle) => bundle.write(writeOptions));
  }

  /**
   * Gets mapping of import aliases (e.g. `@angular/material/button`) to the path of the es5
   * bundle output.
   * @param bundleOutputDir Path to the bundle output directory.
   * @returns Map of alias to resolved path.
   */
  getResolvedSecondaryEntryPointImportPaths(bundleOutputDir) {

    return this.buildPackage.secondaryEntryPoints.reduce((map, p) => {
      map[`${this.buildPackage.namespace}/${this.buildPackage.name}/${p}`] =
        join(dirname(bundleOutputDir), this.buildPackage.name, `${p}.es5.js`);
      return map;
    }, {})
      ;
  }
}

/**
 * Finds the original sourcemap of the file and maps it to the current file.
 * This is useful when multiple transformation happen (e.g `TSC -> Rollup -> Uglify`)
 */
async function remapSourcemap(sourceFile) {
  // Once sorcery loaded the chain of sourcemaps, the new sourcemap will be written asynchronously.
  return (await sorcery.load(sourceFile)).write();
}

function uglifyJsFile(inputPath: string, outputPath: string) {
  const outSourceMapPath = `${outputPath}.map`;

  const inputFileBuffer = readFileSync(inputPath);
  const inputSourceMapBuffer = readFileSync(`${inputPath}.map`);

  const result = uglify.minify(inputFileBuffer.toString(), {
    sourceMap: {
      content: inputSourceMapBuffer.toString(),
      url: basename(outSourceMapPath)
    },
    output: {
      comments: 'some'
    }
  });

  if (result.error) {
    log.error(result.error.message);
    throw result.error;
  }

  writeFileSync(outputPath, result.code);
  writeFileSync(outSourceMapPath, result.map);
}
