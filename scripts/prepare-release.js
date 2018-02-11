const fs = require('fs');

const packageJson = JSON.parse(fs.readFileSync('package.json'));

delete packageJson['devDependencies'];
delete packageJson['scripts'];
delete packageJson['private'];

fs.writeFileSync('dist/package.json', JSON.stringify(packageJson, undefined, 2));
