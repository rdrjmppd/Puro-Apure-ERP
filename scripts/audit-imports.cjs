const fs = require('fs');
const path = require('path');

function getFiles(dir, exts = ['.ts', '.tsx']) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      if (file !== 'node_modules' && file !== 'dist' && file !== '.git') {
        results = results.concat(getFiles(fullPath, exts));
      }
    } else if (exts.includes(path.extname(file))) {
      results.push(fullPath);
    }
  });
  return results;
}

const files = getFiles('src');
console.log('Total source files scanned:', files.length);

let errors = 0;
files.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  const importRegex = /(?:import|from)\s+['"](\.[^'"]+)['"]/g;
  let match;
  while ((match = importRegex.exec(content)) !== null) {
    const importPath = match[1];
    const dir = path.dirname(file);
    const resolvedBase = path.resolve(dir, importPath);
    
    const candidates = [
      resolvedBase + '.ts',
      resolvedBase + '.tsx',
      resolvedBase + '.d.ts',
      path.join(resolvedBase, 'index.ts'),
      path.join(resolvedBase, 'index.tsx'),
      resolvedBase
    ];
    
    let found = false;
    for (const cand of candidates) {
      if (fs.existsSync(cand)) {
        const actualDir = path.dirname(cand);
        const actualFile = path.basename(cand);
        const dirEntries = fs.readdirSync(actualDir);
        if (dirEntries.includes(actualFile)) {
          found = true;
          break;
        }
      }
    }
    
    if (!found) {
      console.error('Import issue in', file, '->', importPath);
      errors++;
    }
  }
});

console.log('Case-sensitivity & import check finished with', errors, 'errors.');
process.exit(errors > 0 ? 1 : 0);
