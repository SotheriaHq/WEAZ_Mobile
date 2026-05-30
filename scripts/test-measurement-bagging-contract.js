const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), 'utf8');

const checks = [
  {
    file: 'components/bagging/BagFittingsSheet.tsx',
    mustContain: [
      'missingMeasurements.length > 0',
      'staleMeasurementKeys',
      'veryStaleMeasurementKeys',
      "status?.custom.freshnessState === 'VERY_STALE'",
    ],
  },
  {
    file: 'components/bagging/ProductBagSelectorSheet.tsx',
    mustContain: [
      'onRequireFittings',
      'onRequireStaleConfirmation',
      "status.custom.fittingState === 'MISSING'",
      "status.custom.freshnessState === 'VERY_STALE'",
    ],
  },
  {
    file: 'src/features/bagging/BagFlowProvider.tsx',
    mustContain: [
      'onRequireFittings',
      'onRequireStaleConfirmation',
      'void routeResolvedStatus(fittingsTarget.product, nextStatus);',
    ],
    mustNotContain: [
      "routeResolvedStatus(fittingsTarget.product, nextStatus, 'OPEN_CUSTOM_FLOW')",
    ],
  },
  {
    file: 'src/api/StoreApi.ts',
    mustContain: [
      "'VERY_STALE'",
      'staleMeasurementKeys',
      'veryStaleMeasurementKeys',
      'veryStaleAfterDays',
    ],
  },
];

for (const check of checks) {
  const content = read(check.file);
  for (const expected of check.mustContain ?? []) {
    if (!content.includes(expected)) {
      throw new Error(`${check.file} is missing expected contract text: ${expected}`);
    }
  }
  for (const forbidden of check.mustNotContain ?? []) {
    if (content.includes(forbidden)) {
      throw new Error(`${check.file} contains forbidden contract text: ${forbidden}`);
    }
  }
}

console.log('measurement bagging contract passed');
