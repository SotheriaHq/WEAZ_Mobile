const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const repoRoot = path.resolve(__dirname, '..');
const designApiPath = path.join(repoRoot, 'src', 'api', 'DesignApi.ts');
const brandApiPath = path.join(repoRoot, 'src', 'api', 'BrandApi.ts');
const providerPath = path.join(repoRoot, 'src', 'features', 'design-editor', 'DesignEditorProvider.tsx');
const composerPath = path.join(repoRoot, 'app', 'catalog', 'create-design', 'composer.tsx');
const productRoutePath = path.join(repoRoot, 'app', 'products', '[productId].tsx');

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
  const {
    resolveDesignIdFromInitializeResponse,
    resolvePresignedUploadMethod,
  } = loadDesignApi();

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
  assert.match(designApiSource, /designMetadata:\s*buildMetadata\(payload\)/);
  assert.doesNotMatch(designApiSource, /collectionMetadata:\s*buildMetadata\(payload\)/);
  assert.match(designApiSource, /const method = resolvePresignedUploadMethod\(upload\)/);
  assert.doesNotMatch(designApiSource, /if\s*\(upload\.method === 'POST'\)/);
  assert.equal(
    resolveDesignIdFromInitializeResponse({
      designId: 'design-primary',
      id: 'id-secondary',
      legacyCollectionId: 'legacy-third',
      collectionId: 'collection-last',
    }),
    'design-primary',
    'Mobile design upload should prefer designId over legacy collection identifiers.',
  );
  assert.equal(resolveDesignIdFromInitializeResponse({ legacyCollectionId: 'legacy-1' }), 'legacy-1');
  assert.equal(resolveDesignIdFromInitializeResponse({ collectionId: 'collection-1' }), 'collection-1');

  const providerSource = fs.readFileSync(providerPath, 'utf8');
  assert.doesNotMatch(
    providerSource,
    /subCategoryId:\s*selectedCategory\.subCategories\[0\]\?\.id/,
    'Provider must not auto-select the first subcategory.',
  );
  assert.doesNotMatch(
    providerSource,
    /deleteCollection\(activeDesignId\)/,
    'Draft deletion should use design API language, not collection deletion.',
  );
  assert.match(
    providerSource,
    /createDesignEditorBackgroundTask/,
    'Design saves should create a background task before leaving the editor.',
  );
  assert.match(
    providerSource,
    /pathname:\s*'\/catalog'/,
    'Design saves should route creators back to the catalog after validation.',
  );
  assert.match(
    providerSource,
    /visibility:\s*targetVisibility/,
    'Design saves should route to the matching public, private, or draft catalog filter.',
  );
  assert.doesNotMatch(
    providerSource,
    /routeForDesignTarget\(result\.id/,
    'Publishing should not trap mobile creators on the editor before routing to the design detail.',
  );

  const composerSource = fs.readFileSync(composerPath, 'utf8');
  assert.doesNotMatch(composerSource, />Left<\/AppText>/);
  assert.doesNotMatch(composerSource, />Right<\/AppText>/);
  assert.match(composerSource, /draftCategoryId/);
  assert.match(composerSource, /Use selection/);
  assert.match(composerSource, /loading=\{tagsLoading\}/);

  const brandApiSource = fs.readFileSync(brandApiPath, 'utf8');
  assert.match(
    brandApiSource,
    /apiClient\.post\('\/store-collections\/initialize'/,
    'Mobile collection creation should use store collection initialization.',
  );
  assert.match(
    brandApiSource,
    /`\/store-collections\/\$\{collectionId\}\/finalize`/,
    'Mobile collection creation should finalize through store collection endpoints.',
  );
  assert.doesNotMatch(
    brandApiSource,
    /apiClient\.post\('\/collections', payload\)/,
    'Mobile collection creation must not call the missing legacy root /collections POST route.',
  );

  const productRouteSource = fs.readFileSync(productRoutePath, 'utf8');
  assert.doesNotMatch(
    productRouteSource,
    /designId:\s*productId/,
    'Product image resolution debug context must not label product ids as design ids.',
  );
  assert.match(productRouteSource, /productId,\s*\n\s*mediaIndex/);

  console.log('Design editor contract tests passed.');
}

main();
