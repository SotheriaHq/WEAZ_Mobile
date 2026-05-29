const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const uploadValidationPath = path.join(repoRoot, 'src', 'utils', 'uploadValidation.ts');
const designApiPath = path.join(repoRoot, 'src', 'api', 'DesignApi.ts');
const designMediaFlowPath = path.join(repoRoot, 'src', 'features', 'design-editor', 'designEditorMediaFlow.ts');
const brandApiPath = path.join(repoRoot, 'src', 'api', 'BrandApi.ts');
const messagingApiPath = path.join(repoRoot, 'src', 'api', 'MessagingApi.ts');
const meRoutePath = path.join(repoRoot, 'app', '(tabs)', 'me.tsx');
const meEditRoutePath = path.join(repoRoot, 'app', '(tabs)', 'me-edit.tsx');
const catalogEditProfilePath = path.join(repoRoot, 'app', 'catalog', 'edit-profile.tsx');
const ownerCatalogHeaderPath = path.join(repoRoot, 'components', 'catalog', 'OwnerCatalogMediaHeader.tsx');

const read = (filePath) => fs.readFileSync(filePath, 'utf8');

function main() {
  const utilitySource = read(uploadValidationPath);
  assert.match(utilitySource, /MOBILE_UPLOAD_POLICIES/);
  assert.match(utilitySource, /validatePickedUploadAsset/);
  assert.match(utilitySource, /validatePickedUploadAssets/);
  assert.match(utilitySource, /assertValidPickedUploadAsset/);
  assert.match(utilitySource, /assertValidPickedUploadAssets/);
  assert.match(utilitySource, /fileSize\?\? asset\.size|asset\.fileSize \?\? asset\.size/);
  assert.match(utilitySource, /allowedExtensions/);
  assert.match(utilitySource, /videoMaxSizeBytes/);

  const designApiSource = read(designApiPath);
  assert.match(designApiSource, /assertValidPickedUploadAssets\(localAssets, MOBILE_UPLOAD_POLICIES\.designMedia/);
  assert.ok(
    designApiSource.indexOf('assertValidPickedUploadAssets(localAssets') <
      designApiSource.indexOf('if (!payload.designId)'),
    'Design media must be validated before create/update upload branches.',
  );

  const designMediaFlowSource = read(designMediaFlowPath);
  assert.match(designMediaFlowSource, /validatePickedUploadAssets/);
  assert.match(designMediaFlowSource, /status:\s*'limit'/);

  const brandApiSource = read(brandApiPath);
  assert.match(brandApiSource, /assertValidPickedUploadAsset\([\s\S]*MOBILE_UPLOAD_POLICIES\.profileImage/);
  assert.match(brandApiSource, /assertValidPickedUploadAsset\([\s\S]*MOBILE_UPLOAD_POLICIES\.bannerImage/);

  const messagingApiSource = read(messagingApiPath);
  assert.match(messagingApiSource, /assertValidPickedUploadAsset/);
  assert.match(messagingApiSource, /MOBILE_UPLOAD_POLICIES\.messageDocument/);
  assert.match(messagingApiSource, /MOBILE_UPLOAD_POLICIES\.messageImage/);

  for (const routePath of [meRoutePath, meEditRoutePath, catalogEditProfilePath, ownerCatalogHeaderPath]) {
    const source = read(routePath);
    assert.match(source, /assertValidPickedUploadAsset/);
    assert.match(source, /getMobileUploadValidationMessage/);
  }

  console.log('Upload validation contract passed.');
}

main();
