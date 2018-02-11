import * as path from 'path';
import * as gulp from 'gulp';
import * as runSequence from 'run-sequence';
import * as gulpClean from 'gulp-clean';
import * as htmlMin from 'gulp-htmlmin';
import * as cleanCss from 'gulp-clean-css';
import * as rimraf from 'rimraf';


import { composeRelease } from './utils/build';
import { inlineResourcesForDirectory } from './utils/inline-resources';
import { PackageModel } from './utils/package.model';
import { log } from './utils/log';
import { NgPackageOptions } from '../types';

const htmlMinifierOptions = {
  collapseWhitespace: true,
  removeComments: true,
  caseSensitive: true,
  removeAttributeQuotes: false
};

export function runGulp(options: NgPackageOptions): Promise<any> {
  const { src, outDir, temp, packagesTemp } = options;

  const packageEsm5Out = path.join(packagesTemp, 'esm5');
  const htmlGlob = path.join(src, '**/*.html');
  const stylesGlob = path.join(src, '**/*.css');

  const pkg = new PackageModel(options, true);

  gulp.task(`build-release:clean`, (done) => runSequence(
    'clean',
    'build-library',
    done));

  gulp.task('clean', () => {
    log.info(`clean ${outDir}`);
    return gulp.src(outDir, { read: false }).pipe(gulpClean(null))
  });

  gulp.task('build-library', ['prepare-build'], () => composeRelease(pkg));

  gulp.task('prepare-build', ['build']);

  gulp.task(`build`, (done) => runSequence(
    `assets`,
    'build:esm',
    `assets:inline`,
    `build:bundles`,
    done));

  gulp.task(`assets`, ['assets:html', 'assets:css']);

  gulp.task(`assets:html`, () => {
    log.info(`assets:html`);
    return gulp.src(htmlGlob)
      .pipe(htmlMin(htmlMinifierOptions))
      .pipe(gulp.dest(packagesTemp))
      .pipe(gulp.dest(packageEsm5Out))
  });

  gulp.task(`assets:css`, () => {
    log.info(`assets:css`);
    return gulp.src(stylesGlob).pipe(cleanCss())
      .pipe(gulp.dest(packagesTemp))
      .pipe(gulp.dest(packageEsm5Out))
  });


  gulp.task('build:esm', () => {
    log.info(`build:esm`);
    return pkg.compile()
  });

  gulp.task(`assets:inline`, () => {
    log.info(`assets:inline`);
    return inlineResourcesForDirectory(packagesTemp)
  });

  gulp.task(`build:bundles`, () => {
    log.info(`build:bundles`);
    return pkg.createBundles()
  });

  return new Promise((resolve) => {
    gulp.start('build-release:clean', (err) => {
      if (err) {
        log.error(err);
      }

      rimraf(temp, () => {
        resolve();
      });
    });
  })
 }
