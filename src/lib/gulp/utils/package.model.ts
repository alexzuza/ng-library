import { join } from 'path';

import { getSecondaryEntryPointsForPackage } from './secondary-entry-points';
import { PackageBundler } from './bundle.model';
import { compileEntryPoint } from './ngc';
import { NgPackageOptions } from '../../types';


export class PackageModel {
  esm5OutputDir: string;
  bundler: PackageBundler;

  exportsSecondaryEntryPointsAtRoot: boolean;
  entryFilePath: string;
  namespace: string;
  name: string;

  _secondaryEntryPointsByDepth: any;
  _secondaryEntryPoints: any;

  constructor(public config: NgPackageOptions, exportsSecondaryEntryPointsAtRoot) {

    this.namespace = config.namespace;
    this.name = config.name;

    this.esm5OutputDir = join(config.packagesTemp, 'esm5');

    this.bundler = new PackageBundler(this);

    this.exportsSecondaryEntryPointsAtRoot = !!exportsSecondaryEntryPointsAtRoot;
    this.entryFilePath = join(config.packagesTemp, 'index.js');
  }

  get secondaryEntryPointsByDepth() {
    this.cacheSecondaryEntryPoints();
    return this._secondaryEntryPointsByDepth;
  }

  /** Secondary entry points for the package. */
  get secondaryEntryPoints() {
    this.cacheSecondaryEntryPoints();
    return this._secondaryEntryPoints;
  }

  /** Compiles the package sources with all secondary entry points. */
  async compile() {
    // Compile all secondary entry-points with the same depth in parallel, and each separate depth
    // group in sequence. This will look something like:
    // Depth 0: coercion, platform, keycodes, bidi
    // Depth 1: a11y, scrolling
    // Depth 2: overlay
    for (const entryPointGroup of this.secondaryEntryPointsByDepth) {
      await Promise.all(entryPointGroup.map(p => this._compileBothTargets(p)));
    }

    // Compile the primary entry-point.
    await this._compileBothTargets();
  }

  async _compileBothTargets(p = '') {
    return compileEntryPoint(this, p)
      .then(() => compileEntryPoint(this, p, this.esm5OutputDir))
  }

  async createBundles() {
    await this.bundler.createBundles();
  }

  /** Stores the secondary entry-points for this package if they haven't been computed already. */
  cacheSecondaryEntryPoints() {
    if (!this._secondaryEntryPoints) {
      this._secondaryEntryPointsByDepth = getSecondaryEntryPointsForPackage(this);
      this._secondaryEntryPoints =
        this._secondaryEntryPointsByDepth.reduce((list, p) => list.concat(p), []);
    }
  }
}


