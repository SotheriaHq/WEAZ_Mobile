const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const modules = new Map();
function load(file, mocks = {}) {
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true }, fileName: file }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(source, { module, exports: module.exports, Date, Math, console, require(specifier) {
    if (specifier in mocks) return mocks[specifier];
    if (specifier.startsWith('.')) {
      const resolved = require.resolve(path.resolve(path.dirname(file), specifier));
      if (!modules.has(resolved)) modules.set(resolved, load(resolved));
      return modules.get(resolved);
    }
    return createRequire(file)(specifier);
  } }, { filename: file });
  return module.exports;
}

async function main() {
  const input = load(path.join(root, 'src/utils/navigationInput.ts'));
  for (const valid of ['/orders/order-1', 'wiez://orders/order-1?tab=receipt', 'https://wiez.com/reset-password?token=valid-token', '/search?q=%E2%82%A6%20fabric']) assert.equal(input.isSafeMobileNavigationPath(valid), true);
  const invalid = ['', '/bad%ZZ', '/bad%E0%A4%A', '/%FE%FF', '/%00', '/line\r\nnext', '/' + 'a'.repeat(16384), '/%' + 'FE%FF'.repeat(200)];
  for (const value of invalid) assert.equal(input.isSafeMobileNavigationPath(value), false);
  let routed = 0;
  const intent = load(path.join(root, 'app/+native-intent.tsx'), {
    '@/src/utils/navigationInput': input,
    '@/src/utils/authLinkRouting': { resolveMobileAuthRoute: () => { routed++; return null; } },
    '@/src/navigation/launchLinkLedger': { claimFreshLaunchUrl: async value => value },
    '@/src/auth/pendingEmailVerification': { rememberPendingEmailVerification: async () => undefined },
  });
  for (const value of invalid) {
    assert.equal(await intent.redirectSystemPath({ path: value, initial: true }), '/');
    assert.equal(await intent.redirectSystemPath({ path: value, initial: false }), '');
  }
  assert.equal(routed, 0, 'Malformed system input must not reach URI routing');
  assert.equal(await intent.redirectSystemPath({ path: '/orders/order-1', initial: true }), '/orders/order-1');

  const renderer = require.resolve('react-native-markdown-display/package.json');
  const rendererRequire = createRequire(renderer);
  const MarkdownIt = rendererRequire('markdown-it');
  const parser = load(path.join(path.dirname(renderer), 'src/lib/parser.js')).default;
  const markdown = new MarkdownIt({ html: false, linkify: true, typographer: true });
  const legal = load(path.join(root, 'src/legal/legalDocuments.ts'));
  assert.equal(legal.LEGAL_PAGES.length, 9);
  for (const document of legal.LEGAL_PAGES) {
    const ast = parser(document.content, nodes => nodes, markdown);
    assert.ok(Array.isArray(ast) && ast.length > 0, `${document.slug} must retain a usable native render tree`);
  }
  const tokens = markdown.parse('[unsafe](javascript:alert(1))\n\n<script>alert(1)</script>', {});
  assert.equal(tokens.some(token => token.type === 'html_block' || token.type === 'html_inline'), false);
  assert.equal(tokens.flatMap(token => token.children || []).some(token => token.type === 'link_open'), false);
  console.log('Security dependency compatibility passed: guarded native system links; all nine policies parsed through the installed native renderer; unsafe markup/links rejected.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
