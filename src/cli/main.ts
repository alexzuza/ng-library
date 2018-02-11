#!/usr/bin/env node

import * as program from 'commander';
import * as path from 'path';

import { performBuild } from '../public_api';


const DEFAULT_PROJECT_PATH = path.resolve(process.cwd(), 'ng-library.json');

function parseProjectPath(parsed: string): string {
  return parsed || DEFAULT_PROJECT_PATH;
}

program
  .name('zuz')
  .option(
    '-p, --project [path]',
    'Path to the \'zuz.json\'',
    parseProjectPath,
    DEFAULT_PROJECT_PATH);

program
  .parse(process.argv);

performBuild( { project: program.opts().project })
  .catch((err) => {
    console.log(err);
    process.exit(111)
  });

