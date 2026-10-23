const assert = require("assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const ts = require("typescript");
const root = path.resolve(__dirname, "..");
function read(file) {
  const exports = {};
  vm.runInNewContext(
    ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS },
    }).outputText,
    { exports },
  );
  return JSON.parse(JSON.stringify(exports.RUNWAY_CATEGORIES));
}
const native = read(path.join(root, "src/constants/runwayCategories.ts"));
assert.deepEqual(native, [
  { key: "discover", label: "Discover", requiresAuth: false },
  { key: "explore", label: "Explore", requiresAuth: false },
  { key: "for-you", label: "For You", requiresAuth: true },
  { key: "african-casual", label: "African Casual", requiresAuth: false },
  { key: "casual-style", label: "Casual Style", requiresAuth: false },
]);
let checked = 0;
for (const sibling of [
  "../fthreadly/src/constants/runwayCategories.ts",
  "../bthreadly/src/collections/runway-categories.ts",
]) {
  const file = path.resolve(root, sibling);
  if (!fs.existsSync(file)) {
    console.log(`Skipping absent sibling: ${sibling}`);
    continue;
  }
  assert.deepEqual(read(file), native, `Runway category drift: ${sibling}`);
  checked++;
}
console.log(
  `Runway native contract passed; ${checked} sibling checkouts verified.`,
);
