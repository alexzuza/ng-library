const path = require('path');
const fs = require('fs');
import * as glob from 'glob';


export function inlineResourcesForDirectory(folderPath) {
  glob.sync(path.join(folderPath, '**/*.js')).forEach(filePath => inlineResources(filePath));
}

/** Inlines the external resources of Angular components of a file. */
function inlineResources(filePath) {
  let fileContent = fs.readFileSync(filePath, 'utf-8');

  fileContent = inlineTemplate(fileContent, filePath);
  fileContent = inlineStyles(fileContent, filePath);

  fs.writeFileSync(filePath, fileContent, 'utf-8');
}

/** Inlines the templates of Angular components for a specified source file. */
function inlineTemplate(fileContent, filePath) {
  return fileContent.replace(/templateUrl:\s*'([^']+?\.html)'/g, (match, templateUrl) => {
    const templatePath = path.join(path.dirname(filePath), templateUrl);
    const templateContent = loadResourceFile(templatePath);
    return `template: "${templateContent}"`;
  });
}

/** Inlines the external styles of Angular components for a specified source file. */
function inlineStyles(fileContent, filePath) {
  return fileContent.replace(/styleUrls:\s*(\[[\s\S]*?])/gm, (match, styleUrlsValue) => {
    // The RegExp matches the array of external style files. This is a string right now and
    // can to be parsed using the `eval` method. The value looks like "['AAA.css', 'BBB.css']"
    const styleUrls = eval(styleUrlsValue);

    const styleContents = styleUrls
      .map(url => path.join(path.dirname(filePath), url))
      .map(path => loadResourceFile(path));

    return `styles: ["${styleContents.join(' ')}"]`;
  });
}


/** Loads the specified resource file and drops line-breaks of the content. */
function loadResourceFile(filePath) {
  return fs.readFileSync(filePath, 'utf-8')
    .replace(/([\n\r]\s*)+/gm, ' ')
    .replace(/"/g, '\\"');
}
