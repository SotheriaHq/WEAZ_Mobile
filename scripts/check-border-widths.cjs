const fs = require("fs");
const path = require("path");
const ts = require("typescript");
const root = path.resolve(__dirname, "..");
const fix = process.argv.includes("--fix");
const findings = [];
const changed = [];
const protectedFiles = new Set([
  "src/system/AndroidSystemBars.ts",
  "src/system/ScreenChrome.tsx",
]);
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(file);
      continue;
    }
    if (!/\.(tsx?|jsx?)$/.test(file)) continue;
    const relative = path.relative(root, file).split(path.sep).join("/");
    if (protectedFiles.has(relative)) continue;
    let source = fs.readFileSync(file, "utf8");
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    const edits = [];
    function width(node) {
      if (
        (ts.isNumericLiteral(node) &&
          Number(node.text) > 0 &&
          Number(node.text) < 2) ||
        (ts.isPropertyAccessExpression(node) &&
          node.getText(ast) === "StyleSheet.hairlineWidth")
      ) {
        edits.push({ start: node.getStart(ast), end: node.end });
        findings.push(
          `${relative}:${ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1}`,
        );
      } else if (ts.isConditionalExpression(node)) {
        width(node.whenTrue);
        width(node.whenFalse);
      } else if (ts.isParenthesizedExpression(node)) width(node.expression);
    }
    function visit(node) {
      if (
        ts.isPropertyAssignment(node) &&
        /^border(?:Top|Bottom|Left|Right|Start|End)?Width$/.test(
          node.name.getText(ast).replace(/['"]/g, ""),
        )
      )
        width(node.initializer);
      ts.forEachChild(node, visit);
    }
    visit(ast);
    if (fix && edits.length) {
      for (const edit of edits.sort((a, b) => b.start - a.start))
        source = source.slice(0, edit.start) + "2" + source.slice(edit.end);
      fs.writeFileSync(file, source);
      changed.push(relative);
    }
  }
}
for (const name of ["app", "components", "src"]) walk(path.join(root, name));
if (fix)
  console.log(
    JSON.stringify({ changed, replacements: findings.length }, null, 2),
  );
else if (findings.length) {
  console.error(
    `Thin native borders are prohibited; use 0 or at least 2dp:\n${findings.join("\n")}`,
  );
  process.exitCode = 1;
} else
  console.log(
    "Native border check passed: no hairline or sub-2dp product borders.",
  );
