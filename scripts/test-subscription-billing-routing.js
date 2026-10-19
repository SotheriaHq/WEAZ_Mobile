const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const moduleStub = { exports: {} };
const compiled = ts.transpileModule(fs.readFileSync(path.join(root, 'src/features/studio/studioNavigationBridge.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
vm.runInNewContext(compiled, {
  module: moduleStub, exports: moduleStub.exports, URL, URLSearchParams,
  require(name) {
    if (name.endsWith('/env')) return { env: { webAppUrl: 'https://wiez.test' } };
    if (name.endsWith('/studioRoutes')) return { getTrustedStudioOrigins: () => new Set(['https://wiez.test']) };
    if (name.endsWith('/nativeIslandConfig')) return { STUDIO_SURFACE_PARAM: 'surface', STUDIO_SURFACE_PARAM_VALUE: 'studio' };
    if (name.endsWith('/mobileRouting')) return { getMessageNotificationTarget: () => null };
    throw new Error(`Unexpected dependency: ${name}`);
  },
});
const { classifyStudioWebUrl } = moduleStub.exports;
const plain = value => JSON.parse(JSON.stringify(value));
for (const base of ['/settings?tab=subscription-billing', '/studio?tab=subscription']) {
  for (const referenceKey of ['reference', 'trxref', 'subscriptionReference']) {
    assert.deepEqual(plain(classifyStudioWebUrl(`${base}&brandId=brand-a&${referenceKey}=paid-reference`).nativeRoute), { pathname: '/settings/subscriptions', params: { reference: 'paid-reference', brandId: 'brand-a' } });
  }
}
assert.equal(classifyStudioWebUrl('/settings?tab=subscription-billing').nativeRoute, '/settings/subscriptions');
assert.equal(classifyStudioWebUrl('/studio?tab=finance').nativeRoute, '/studio/finance');
assert.equal(classifyStudioWebUrl('/studio?tab=store').type, 'studio');
assert.equal(classifyStudioWebUrl('https://foreign.test/settings?tab=subscription-billing').type, 'external');
console.log('Subscription billing routing: 10 checks passed.');
