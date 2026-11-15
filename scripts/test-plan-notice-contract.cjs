/**
 * Plan ending, lapsed or shrinking (owner, Nov 2026: "ensure the user is
 * notified as much as possible, giving the user the option to subscribe or
 * make plans … at least be aware on all fronts").
 *
 *  - The billing screen shows a banner on every tab while the plan is ending,
 *    past due, lapsed or about to drop to a smaller tier, saying when (Lagos
 *    time), what the free plan means, and offering the plans.
 *  - A cancelled renewal can't be undone while the plan runs, so the banner
 *    never says "renew to keep"; it says subscribe again when it ends, or
 *    move to a bigger plan now.
 *  - Subscription consent names and sends the Payment Policy version the
 *    server enforces, so an app built before a policy update can still pay.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

function loadPlanNotice() {
  const output = ts.transpileModule(read('src/features/subscriptions/planNotice.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(output, { module, exports: module.exports });
  return module.exports;
}

const { planNotice, lagosDay, daysLeft } = loadPlanNotice();
const tiers = [
  { tierKey: 'THREAD', maxActive: 2 },
  { tierKey: 'ASO_OKE', maxActive: 3 },
  { tierKey: 'ARU', maxActive: 4 },
  { tierKey: 'IGWE', maxActive: 6 },
];
const names = { THREAD: 'Thread', ASO_OKE: 'Aso-oke', ARU: 'Aru', IGWE: 'Igwe' };
const tierName = (key) => names[key] || key || 'No plan';
const now = Date.parse('2026-11-10T09:00:00Z');
const inDays = (days) => new Date(now + days * 86_400_000).toISOString();
const plan = (overrides) => ({
  tierKey: 'THREAD',
  status: 'ACTIVE',
  currentPeriodEnd: inDays(20),
  cancelAtPeriodEnd: false,
  pendingTierKey: null,
  recoveryUntil: null,
  ...overrides,
});
const FREE = 'the free plan: 1 active custom order at a time';

// Dates in Lagos time; under a day counts as one.
assert.equal(lagosDay('2026-11-30T23:30:00Z'), '1 Dec 2026');
assert.equal(daysLeft(inDays(0.2), now), 1);
assert.equal(daysLeft(inDays(2.5), now), 3);

// Nothing to say about a plan that simply renews, or no plan.
assert.equal(planNotice(plan({}), tiers, tierName, now), null);
assert.equal(planNotice(null, tiers, tierName, now), null);

// Renewal cancelled: always shown, a warning inside seven days.
const far = planNotice(plan({ cancelAtPeriodEnd: true }), tiers, tierName, now);
assert.equal(far.tone, 'info');
assert.equal(far.title, `Your Thread plan ends on ${lagosDay(inDays(20))}`);
const near = planNotice(plan({ cancelAtPeriodEnd: true, currentPeriodEnd: inDays(3) }), tiers, tierName, now);
assert.equal(near.tone, 'warning');
assert.equal(near.title, 'Your Thread plan ends in 3 days');
assert.ok(near.body.includes(FREE));
assert.ok(near.body.includes('To get 2 active custom orders at a time back, subscribe again when it ends, or move to a bigger plan now.'));
assert.doesNotMatch(near.body, /to keep|renew /i, 'a cancelled renewal cannot be undone; never promise it');
assert.equal(near.actionLabel, 'See plans');
const top = planNotice(plan({ tierKey: 'IGWE', cancelAtPeriodEnd: true, currentPeriodEnd: inDays(0.3) }), tiers, tierName, now);
assert.equal(top.title, 'Your Igwe plan ends within a day');
assert.ok(!top.body.includes('bigger plan'), 'nothing bigger than the top tier');

// Renewal failed: free plan now, and how to recover.
const failed = planNotice(plan({ status: 'PAST_DUE', currentPeriodEnd: inDays(-1), recoveryUntil: inDays(6) }), tiers, tierName, now);
assert.equal(failed.tone, 'warning');
assert.equal(failed.title, 'Your Thread renewal didn’t go through');
assert.ok(failed.body.includes(FREE));
assert.ok(failed.body.includes(`Recover it by ${lagosDay(inDays(6))} (Lagos time) at your current price`));

// Lapsed after a cancelled renewal (shown until the billing pass expires it).
const lapsed = planNotice(plan({ status: 'CANCELLED', cancelAtPeriodEnd: true, currentPeriodEnd: inDays(-0.1) }), tiers, tierName, now);
assert.equal(lapsed.title, 'Your brand is now on the free plan');
assert.ok(lapsed.body.includes('Subscribe again below to get 2 active custom orders at a time back.'));

// A smaller tier scheduled for the next renewal.
const down = planNotice(plan({ tierKey: 'ARU', pendingTierKey: 'THREAD', currentPeriodEnd: inDays(2) }), tiers, tierName, now);
assert.equal(down.tone, 'warning');
assert.equal(down.title, 'Your plan changes to Thread in 2 days');
assert.ok(down.body.includes('from Aru to Thread: 2 active custom orders at a time'));
assert.equal(planNotice(plan({ tierKey: 'ARU', pendingTierKey: 'THREAD', currentPeriodEnd: inDays(10) }), tiers, tierName, now).tone, 'info');

// The screen shows it on every tab and lands "See plans" on the tier list.
const screen = read('app/settings/subscriptions.tsx');
assert.match(screen, /const notice = planNotice\(\s*subscription,\s*billing\.data\?\.tiers \?\? \[\],\s*tierName,/);
assert.match(screen, /billing\.data\?\.serverNow \? Date\.parse\(billing\.data\.serverNow\) : undefined/, 'days count on the server clock');
assert.match(screen, /\{notice \? \(\s*<PlanNoticeBanner notice=\{notice\} onAction=\{showPlans\} \/>/);
assert.match(screen, /scrollToTiersOnLayout/);
assert.match(screen, /moves to the free plan: 1 active custom order at a time/, 'Stop renewal says what comes after');

// Consent names and sends the server's Payment Policy version.
assert.match(screen, /document\.key === 'PAYMENT_POLICY'/);
assert.equal((screen.match(/\(\{paymentLegalVersion\}\)/g) || []).length, 2, 'both consent lines show the version sent');
assert.doesNotMatch(screen, /\(\{LEGAL_PAGE_VERSION\}\)/);
assert.match(screen, /cardId \|\| undefined,\s*paymentLegalVersion,/);
assert.match(screen, /changeCard\(\s*brandId!,\s*cardId,\s*paymentLegalVersion,/);

console.log('Plan notice contract checks passed.');
