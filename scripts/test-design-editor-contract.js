const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const repoRoot = path.resolve(__dirname, '..');
const designApiPath = path.join(repoRoot, 'src', 'api', 'DesignApi.ts');
const providerPath = path.join(repoRoot, 'src', 'features', 'design-editor', 'DesignEditorProvider.tsx');
const composerPath = path.join(repoRoot, 'app', 'catalog', 'create-design', 'composer.tsx');

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

function loadDesignApi() {
  const module = { exports: {} };
  const sandbox = {
    module,
    exports: module.exports,
    require: (request) => {
      if (request === '@/src/api/httpClient') {
        return { apiClient: { get: async () => ({}), post: async () => ({}), patch: async () => ({}) } };
      }
      if (request === '@/src/features/design-editor/designCreationRules') {
        return { DESIGN_EDITOR_MAX_MEDIA: 6 };
      }
      return require(request);
    },
    FormData: global.FormData ?? function FormData() {},
    fetch: global.fetch ?? (async () => ({ ok: true })),
    console,
  };

  vm.runInNewContext(compile(designApiPath), sandbox, { filename: designApiPath });
  return module.exports;
}

function main() {
  const { resolvePresignedUploadMethod } = loadDesignApi();

  assert.equal(
    resolvePresignedUploadMethod({ uploadFields: { key: 'uploads/design.jpg' } }),
    'POST',
    'Backend presigned POST responses without an explicit method must upload with POST.',
  );
  assert.equal(resolvePresignedUploadMethod({ method: 'PUT', uploadFields: { key: 'ignored' } }), 'PUT');
  assert.equal(resolvePresignedUploadMethod({}), 'PUT');

  const designApiSource = fs.readFileSync(designApiPath, 'utf8');
  assert.match(designApiSource, /apiClient\.post\('\/designs\/initialize'/);
  assert.match(designApiSource, /draftOnly:\s*payload\.action === 'draft'/);
  assert.ok(designApiSource.includes('`/designs/${designId}/finalize`'));
  assert.match(designApiSource, /const method = resolvePresignedUploadMethod\(upload\)/);
  assert.doesNotMatch(designApiSource, /if\s*\(upload\.method === 'POST'\)/);

  const providerSource = fs.readFileSync(providerPath, 'utf8');
  assert.doesNotMatch(
    providerSource,
    /subCategoryId:\s*selectedCategory\.subCategories\[0\]\?\.id/,
    'Provider must not auto-select the first subcategory.',
  );

  const composerSource = fs.readFileSync(composerPath, 'utf8');
  assert.doesNotMatch(composerSource, />Left<\/AppText>/);
  assert.doesNotMatch(composerSource, />Right<\/AppText>/);
  assert.match(composerSource, /draftCategoryId/);
  assert.match(composerSource, /Use selection/);
  assert.match(composerSource, /loading=\{tagsLoading\}/);

  console.log('Design editor contract tests passed.');
}

main();
