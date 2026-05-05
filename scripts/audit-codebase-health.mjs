import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.join(root, 'output', 'codebase-audit');

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function walk(dir, predicate, acc = []) {
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'vendor') continue;
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(rel, predicate, acc);
    else if (!predicate || predicate(rel)) acc.push(rel);
  }
  return acc;
}

function countMap(values) {
  const map = new Map();
  values.forEach(value => map.set(value, (map.get(value) || 0) + 1));
  return [...map.entries()].filter(([, count]) => count > 1);
}

function lineCount(text) {
  if (!text) return 0;
  return text.split(/\r?\n/).length;
}

function detectObjectMethods(objectName, text) {
  const methods = new Set();
  const objectStart = text.indexOf(`const ${objectName} = {`);
  if (objectStart < 0) return methods;
  const body = text.slice(objectStart);
  for (const match of body.matchAll(/^\s*(?:async\s+)?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/gm)) {
    methods.add(match[1]);
  }
  for (const match of body.matchAll(/^\s*([A-Za-z_$][\w$]*)\s*:\s*(?:async\s*)?function\s*\(/gm)) {
    methods.add(match[1]);
  }
  return methods;
}

function summarizeHandlers(html, jsTexts) {
  const handlerMatches = [...html.matchAll(/\son(?:click|change|blur|keydown|submit|input)="([^"]+)"/g)]
    .map(match => match[1]);
  const refs = [];
  handlerMatches.forEach(handler => {
    for (const match of handler.matchAll(/\b([A-Z][A-Za-z0-9_$]*)\.([A-Za-z_$][\w$]*)\s*\(/g)) {
      refs.push({ object: match[1], method: match[2], handler });
    }
  });

  const objectNames = [...new Set(refs.map(ref => ref.object))];
  const objectMethods = new Map();
  objectNames.forEach(objectName => {
    const methods = new Set();
    jsTexts.forEach(text => {
      detectObjectMethods(objectName, text).forEach(method => methods.add(method));
    });
    objectMethods.set(objectName, methods);
  });

  const missing = refs.filter(ref => !(objectMethods.get(ref.object) || new Set()).has(ref.method));
  return {
    inlineHandlerCount: handlerMatches.length,
    objectMethodRefCount: refs.length,
    missingObjectMethodRefs: missing,
  };
}

function main() {
  fs.mkdirSync(outputDir, { recursive: true });

  const html = read('index.html');
  const jsFiles = walk('js', file => file.endsWith('.js')).sort();
  const testFiles = walk('tests', file => /\.(js|mjs)$/.test(file)).sort();
  const workflowFiles = walk('.github/workflows', file => file.endsWith('.yml')).sort();
  const jsTexts = jsFiles.map(file => read(file));
  const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map(match => match[1]);
  const scriptPaths = scripts
    .map(src => src.split('?')[0])
    .filter(src => !/^https?:\/\//.test(src));
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);

  const appVersion = (read('js/app.js').match(/const APP_VERSION = ['"]([^'"]+)['"]/) || [])[1] || '';
  const htmlVersion = (html.match(/CURRENT_HTML_VERSION = ['"]([^'"]+)['"]/) || [])[1] || '';
  const sidebarVersion = (html.match(/id="app-version">([^<]+)/) || [])[1] || '';
  const versionJson = JSON.parse(read('js/version.json')).version || '';

  const files = [...jsFiles, ...testFiles, 'index.html'];
  const locByFile = files.map(file => ({ file, lines: lineCount(read(file)) }))
    .sort((a, b) => b.lines - a.lines);

  const duplicateFunctionNamesByFile = [];
  jsFiles.forEach(file => {
    const text = read(file);
    const names = [
      ...text.matchAll(/^\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/gm),
      ...text.matchAll(/^\s*(?:async\s+)?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/gm),
      ...text.matchAll(/^\s*([A-Za-z_$][\w$]*)\s*:\s*(?:async\s*)?function\s*\(/gm),
    ].map(match => match[1]).filter(Boolean);
    const duplicates = countMap(names);
    if (duplicates.length) duplicateFunctionNamesByFile.push({ file, duplicates });
  });

  const riskyPatterns = [
    { key: 'prompt', pattern: /\bprompt\s*\(/g },
    { key: 'confirm', pattern: /\bconfirm\s*\(/g },
    { key: 'alert', pattern: /\balert\s*\(/g },
    { key: 'consoleError', pattern: /console\.error\s*\(/g },
    { key: 'setInterval', pattern: /setInterval\s*\(/g },
    { key: 'addEventListener', pattern: /addEventListener\s*\(/g },
    { key: 'localStorageDirect', pattern: /localStorage\./g },
  ].map(entry => ({
    key: entry.key,
    count: jsTexts.reduce((sum, text) => sum + [...text.matchAll(entry.pattern)].length, 0),
  }));

  const report = {
    generatedAt: new Date().toISOString(),
    totals: {
      jsFiles: jsFiles.length,
      testFiles: testFiles.length,
      workflowFiles: workflowFiles.length,
      jsAndHtmlLines: locByFile
        .filter(row => row.file === 'index.html' || row.file.startsWith('js/'))
        .reduce((sum, row) => sum + row.lines, 0),
      testLines: locByFile
        .filter(row => row.file.startsWith('tests/'))
        .reduce((sum, row) => sum + row.lines, 0),
    },
    versions: { appVersion, htmlVersion, sidebarVersion, versionJson },
    indexHtml: {
      scriptCount: scripts.length,
      duplicateScripts: countMap(scripts),
      missingScripts: scriptPaths.filter(src => !fs.existsSync(path.join(root, src))),
      duplicateIds: countMap(ids),
    },
    inlineHandlers: summarizeHandlers(html, jsTexts),
    topFilesByLines: locByFile.slice(0, 25),
    duplicateFunctionNamesByFile,
    riskyPatterns,
  };

  const jsonPath = path.join(outputDir, 'health-report.json');
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));

  const md = [
    '# Codebase Health Audit',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    '## Totals',
    `- JS files: ${report.totals.jsFiles}`,
    `- Test files: ${report.totals.testFiles}`,
    `- Workflow files: ${report.totals.workflowFiles}`,
    `- JS + HTML lines: ${report.totals.jsAndHtmlLines}`,
    `- Test lines: ${report.totals.testLines}`,
    '',
    '## Version State',
    `- APP_VERSION: ${appVersion}`,
    `- CURRENT_HTML_VERSION: ${htmlVersion}`,
    `- Sidebar version: ${sidebarVersion}`,
    `- js/version.json: ${versionJson}`,
    '',
    '## Static HTML Checks',
    `- Script tags: ${report.indexHtml.scriptCount}`,
    `- Duplicate scripts: ${report.indexHtml.duplicateScripts.length}`,
    `- Missing scripts: ${report.indexHtml.missingScripts.length}`,
    `- Duplicate ids: ${report.indexHtml.duplicateIds.length}`,
    '',
    '## Inline Handler Checks',
    `- Inline handlers: ${report.inlineHandlers.inlineHandlerCount}`,
    `- Object method references: ${report.inlineHandlers.objectMethodRefCount}`,
    `- Missing object methods: ${report.inlineHandlers.missingObjectMethodRefs.length}`,
    '',
    '## Top Files By Lines',
    ...report.topFilesByLines.map(row => `- ${row.lines}: ${row.file}`),
    '',
    '## Risky Pattern Counts',
    ...report.riskyPatterns.map(row => `- ${row.key}: ${row.count}`),
    '',
    'Full JSON report: `output/codebase-audit/health-report.json`',
    '',
  ].join('\n');
  fs.writeFileSync(path.join(outputDir, 'health-report.md'), md);

  console.log(md);

  const hardFailures = [
    report.indexHtml.duplicateScripts.length,
    report.indexHtml.missingScripts.length,
    report.indexHtml.duplicateIds.length,
    report.inlineHandlers.missingObjectMethodRefs.length,
    appVersion === htmlVersion && appVersion === sidebarVersion && appVersion === versionJson ? 0 : 1,
  ].reduce((sum, value) => sum + value, 0);

  if (hardFailures > 0) {
    console.error(`Codebase health audit found ${hardFailures} hard failure(s).`);
    process.exitCode = 1;
  }
}

main();
