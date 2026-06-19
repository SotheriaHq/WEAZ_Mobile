const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { compile, createScriptRequire } = require('./helpers/mobile-script-require');

const repoRoot = path.resolve(__dirname, '..');
const designApiPath = path.join(repoRoot, 'src', 'api', 'DesignApi.ts');
const brandApiPath = path.join(repoRoot, 'src', 'api', 'BrandApi.ts');
const providerPath = path.join(repoRoot, 'src', 'features', 'design-editor', 'DesignEditorProvider.tsx');
const composerPath = path.join(repoRoot, 'app', '(tabs)', 'catalog', 'create-design', 'composer.tsx');
const catalogPath = path.join(repoRoot, 'app', '(tabs)', 'catalog', 'index.tsx');
const productRoutePath = path.join(repoRoot, 'app', 'products', '[productId].tsx');
const marketCommerceViewerPath = path.join(repoRoot, 'src', 'features', 'market', 'components', 'MarketCommerceViewer.tsx');
const collectionCommerceViewerPath = path.join(repoRoot, 'src', 'features', 'market', 'components', 'CollectionCommerceViewer.tsx');
const messageThreadPath = path.join(repoRoot, 'app', 'messages', '[threadId].tsx');

function loadDesignApi() {
  const module = { exports: {} };
  const scriptRequire = createScriptRequire({
    repoRoot,
    mocks: {
      '@/src/api/httpClient': {
        apiClient: { get: async () => ({}), post: async () => ({}), patch: async () => ({}) },
      },
      '@/src/features/design-editor/designCreationRules': {
        DESIGN_EDITOR_MAX_MEDIA: 6,
        normalizeMediaViewSlot: (value) => value ?? null,
        toBackendMediaViewSlot: (value) => (value === 'INSPIRATION' ? 'OTHER' : value ?? 'OTHER'),
      },
    },
  });
  const sandbox = {
    module,
    exports: module.exports,
    require: (request) => scriptRequire(request, designApiPath),
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
  // The backend DesignMetadataDto does not include isAvailableInStore and runs a
  // whitelist ValidationPipe, so the field must never be sent on initialize.
  assert.doesNotMatch(
    designApiSource,
    /isAvailableInStore:\s*(false|true)/,
    'Design initialize payload must not send isAvailableInStore (backend rejects unknown fields).',
  );
  assert.ok(designApiSource.includes('`/designs/${designId}/finalize`'));
  assert.match(designApiSource, /designMetadata:\s*buildMetadata\(payload\)/);
  assert.match(designApiSource, /viewSlot:\s*toBackendMediaViewSlot\(asset\.viewSlot\)/);
  assert.match(designApiSource, /viewSlot:\s*toBackendMediaViewSlot\(upload\.viewSlot \?\? asset\.viewSlot\)/);
  // The acknowledge call passes a request body, so allow args after the path
  // (the previous regex required `acknowledge')` with no arguments and drifted).
  assert.match(designApiSource, /apiClient\.post\('\/store\/content-policy\/acknowledge'/);
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
  const creationRulesSource = fs.readFileSync(
    path.join(repoRoot, 'src', 'features', 'design-editor', 'designCreationRules.ts'),
    'utf8',
  );
  const backgroundTasksSource = fs.readFileSync(
    path.join(repoRoot, 'src', 'features', 'design-editor', 'designEditorBackgroundTasks.ts'),
    'utf8',
  );
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
  // Go Live must route by the design's resolved publication status so newly
  // submitted (IN_REVIEW) designs land on the In Review tab, not Public.
  assert.match(
    providerSource,
    /case 'IN_REVIEW':\s*\n\s*return 'In Review';/,
    'Go Live must route IN_REVIEW designs to the In Review tab.',
  );
  assert.match(
    providerSource,
    /resolvePublishVisibility\(result\.detail\.status\)/,
    'Publish routing must be derived from the saved design publication status.',
  );
  assert.match(
    providerSource,
    /invalidateQueries\(\{\s*queryKey:\s*\['brand',\s*'collections'\]/,
    'Go Live must invalidate the owner brand collections cache.',
  );
  const optimisticInReviewRouteIndex = providerSource.indexOf("visibility: 'In Review'");
  const backendSaveIndex = providerSource.indexOf('const result = await saveDesignEditor');
  assert.ok(
    optimisticInReviewRouteIndex >= 0 &&
      backendSaveIndex >= 0 &&
      optimisticInReviewRouteIndex < backendSaveIndex,
    'Mobile design editor must route publish saves to Catalog In Review before upload completion.',
  );
  assert.match(providerSource, /getMissingRequiredMediaSlots/);
  assert.match(
    providerSource,
    /getMissingRequiredImageMediaSlots/,
    'Publish validation must require front/back/left/right slots to be image assets, not just present slots.',
  );
  assert.match(
    creationRulesSource,
    /String\(asset\.mediaKind \?\? ''\)\.toLowerCase\(\)/,
    'Required image validation must inspect media kind.',
  );
  assert.match(
    creationRulesSource,
    /mimeType\.startsWith\('image\/'\)/,
    'Required image validation must fall back to MIME type for local assets.',
  );
  assert.match(
    backgroundTasksSource,
    /DESIGN_EDITOR_FAILED_TASK_TTL_MS = 24 \* 60 \* 60 \* 1000/,
    'Failed publish cards must keep a 24-hour cleanup clock.',
  );
  assert.match(
    backgroundTasksSource,
    /touchDesignEditorBackgroundTask/,
    'Failed publish card interactions must reset the 24-hour cleanup clock.',
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
  assert.match(composerSource, /categoryStep === 'category' \? 'Next' : 'Done'/);
  assert.match(composerSource, /doneLabel="Save tags"/);
  assert.match(composerSource, /loading=\{tagsLoading\}/);
  // Tags must render/select from a cached query and feed the multi-select sheet.
  assert.match(
    composerSource,
    /queryKeys\.tags\.popular\(50\)/,
    'Hashtags must load through the cached tags query key.',
  );
  assert.match(
    composerSource,
    /options=\{tagOptions\}/,
    'Hashtag sheet must be fed the resolved tag options so suggestions render.',
  );
  // Required indicators must be inline asterisks, not spelled-out "Required" values.
  assert.doesNotMatch(
    composerSource,
    /:\s*'Required'/,
    'Composer must not display the literal "Required" text as a field value.',
  );

  const requiredLabelSource = fs.readFileSync(
    path.join(repoRoot, 'components', 'ui', 'RequiredFieldLabel.tsx'),
    'utf8',
  );
  assert.match(
    requiredLabelSource,
    /tone="danger">\s*\*/,
    'RequiredFieldLabel must render an inline red asterisk, not the word "Required".',
  );
  assert.doesNotMatch(
    requiredLabelSource,
    />\s*Required\s*</,
    'RequiredFieldLabel must not spell out "Required".',
  );

  // Image compression must degrade gracefully when the native module is missing.
  const compressionSource = fs.readFileSync(
    path.join(repoRoot, 'src', 'utils', 'imageCompression.ts'),
    'utf8',
  );
  assert.match(
    compressionSource,
    /function getManipulator\(\)/,
    'Image compression must guard native module availability.',
  );
  assert.match(
    compressionSource,
    /if \(!manipulator\) \{\s*\n\s*return originalImage\(/,
    'Image compression must fall back to the original image when the native module is unavailable.',
  );
  assert.match(
    compressionSource,
    /catch \{\s*\n\s*return originalImage\(/,
    'Image compression must never throw — it returns the original image on failure.',
  );

  const brandApiSource = fs.readFileSync(brandApiPath, 'utf8');
  const catalogSource = fs.readFileSync(catalogPath, 'utf8');
  assert.match(
    brandApiSource,
    /apiClient\.post\('\/store-collections\/initialize'/,
    'Mobile collection creation should use store collection initialization.',
  );
  assert.match(
    brandApiSource,
    /clientFailureReason\?: string \| null/,
    'Catalog cards must receive an additive failure reason for client-side publish failures.',
  );
  assert.match(
    catalogSource,
    /task\.status === 'failed' \? 'publish-failed' : 'publishing'/,
    'Failed publish tasks must render as failed cards instead of disappearing.',
  );
  assert.match(
    catalogSource,
    /visibilityFilter === 'In Review'[\s\S]*task\.status === 'failed'/,
    'In Review must keep failed publish cards visible for retry/edit.',
  );

  const catalogQueriesSource = fs.readFileSync(path.join(repoRoot, 'src', 'query', 'catalogQueries.ts'), 'utf8');
  assert.doesNotMatch(
    catalogQueriesSource,
    /refetchInterval:\s*options\?\.isFocused/,
    'Catalog review tabs must not poll on focus because it causes visible card flicker.',
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
  assert.match(productRouteSource, /useLocalSearchParams<\{ productId\?: string \| string\[\] \}>/);
  assert.match(productRouteSource, /sourceType="PRODUCT"/);
  assert.match(productRouteSource, /sourceId=\{productId \?\? ''\}/);
  assert.match(productRouteSource, /fallbackHref="\/\(tabs\)\/discover"/);

  const marketCommerceViewerSource = fs.readFileSync(marketCommerceViewerPath, 'utf8');
  const collectionCommerceViewerSource = fs.readFileSync(collectionCommerceViewerPath, 'utf8');
  const messageThreadSource = fs.readFileSync(messageThreadPath, 'utf8');
  assert.match(
    marketCommerceViewerSource,
    /productId:\s*sourceType === 'PRODUCT' \? sourceId : undefined/,
    'Product media debug context should identify product ids only for product sources.',
  );
  assert.match(
    marketCommerceViewerSource,
    /designId:\s*sourceType === 'DESIGN' \? sourceId : undefined/,
    'Design media debug context should identify design ids only for design sources.',
  );
  assert.match(marketCommerceViewerSource, /mediaIndex:\s*index/);
  assert.doesNotMatch(
    `${catalogSource}\n${marketCommerceViewerSource}\n${collectionCommerceViewerSource}`,
    /threadId:\s*'brand'/,
    'Direct brand messaging routes must use resolver context, not a fake brand thread id.',
  );
  assert.match(
    `${catalogSource}\n${marketCommerceViewerSource}\n${collectionCommerceViewerSource}`,
    /threadId:\s*'resolve'/,
    'Direct brand messaging routes must route through the thread resolver sentinel.',
  );
  assert.match(
    messageThreadSource,
    /normalizePathThreadId/,
    'Message route must strip resolver sentinel path params before calling the backend.',
  );
  assert.match(
    messageThreadSource,
    /MessagingApi\.startConversation/,
    'Brand entry messages must start a conversation on first send when no thread exists yet.',
  );
  assert.doesNotMatch(
    marketCommerceViewerSource,
    /designId:\s*sourceType === 'PRODUCT'/,
    'Product media debug context must not be reported as a design id.',
  );

  console.log('Design editor contract tests passed.');
}

main();
