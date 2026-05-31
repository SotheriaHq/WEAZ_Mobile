const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const EXTENSIONS = ['', '.ts', '.tsx', '.js', '.jsx'];

function resolveWithExtensions(basePath) {
  for (const extension of EXTENSIONS) {
    const candidate = `${basePath}${extension}`;
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }

  for (const extension of EXTENSIONS.slice(1)) {
    const candidate = path.join(basePath, `index${extension}`);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }

  return null;
}

function compile(filePath) {
  return ts.transpileModule(fs.readFileSync(filePath, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      jsx: ts.JsxEmit.React,
    },
    fileName: filePath,
  }).outputText;
}

function createScriptRequire({ repoRoot, mocks = {}, globals = {} }) {
  const moduleCache = new Map();
  const hasMock = (request) => Object.prototype.hasOwnProperty.call(mocks, request);

  function loadFile(filePath) {
    if (moduleCache.has(filePath)) {
      return moduleCache.get(filePath).exports;
    }

    const module = { exports: {} };
    moduleCache.set(filePath, module);

    const sandbox = {
      module,
      exports: module.exports,
      require: (request) => scriptRequire(request, filePath),
      __dirname: path.dirname(filePath),
      __filename: filePath,
      console,
      URL,
      Intl,
      FormData: global.FormData,
      fetch: global.fetch,
      process: {
        env: process.env,
      },
      ...globals,
    };

    vm.runInNewContext(compile(filePath), sandbox, { filename: filePath });
    return module.exports;
  }

  function scriptRequire(request, parentFilePath = path.join(repoRoot, 'scripts', '<contract>.js')) {
    if (hasMock(request)) {
      return mocks[request];
    }

    if (request.startsWith('@/')) {
      const resolved = resolveWithExtensions(path.join(repoRoot, request.slice(2)));
      if (!resolved) {
        throw new Error(`Unable to resolve mobile alias ${request}`);
      }
      return loadFile(resolved);
    }

    if (request.startsWith('.')) {
      const resolved = resolveWithExtensions(path.resolve(path.dirname(parentFilePath), request));
      if (resolved) {
        return loadFile(resolved);
      }
    }

    return require(request);
  }

  return scriptRequire;
}

module.exports = {
  compile,
  createScriptRequire,
};
