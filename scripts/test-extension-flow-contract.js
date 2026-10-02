#!/usr/bin/env node
/**
 * The extension flow, as a contract across three repos.
 *
 * This flow was broken in a way no single-repo test would have caught: the
 * backend had the whole state machine, the web console had a control nobody could
 * find, and mobile had nothing at all — the notification routed to an order screen
 * that did not so much as mention the request. These checks pin the parts that
 * have to agree.
 *
 * Plain node, no test runner, same as the other mobile contract scripts.
 */
const fs = require('fs');
const path = require('path');

const MOBILE = path.resolve(__dirname, '..');
const WORKSPACE = path.resolve(MOBILE, '..');
const BACKEND = path.join(WORKSPACE, 'bthreadly');
const WEB = path.join(WORKSPACE, 'fthreadly');

let failures = 0;
let checks = 0;

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function check(label, condition, detail) {
  checks += 1;
  if (!condition) {
    failures += 1;
    console.error(`FAIL  ${label}${detail ? `\n      ${detail}` : ''}`);
  } else {
    console.log(`ok    ${label}`);
  }
}

// ── 1. The policy is in ONE place, with the agreed numbers ────────────────────
const policy = read(
  path.join(BACKEND, 'src/custom-orders/custom-order-extension.policy.ts'),
);
check(
  'policy caps are 2 extensions / 3 days each / 6 days total',
  /maxApprovedExtensions:\s*2/.test(policy) &&
    /maxDaysPerRequest:\s*3/.test(policy) &&
    /maxTotalDays:\s*6/.test(policy),
  'The agreed budget must be literal in the policy module, not re-derived.',
);
check(
  'a rush fee blocks extensions outright',
  /export function isRushOrder/.test(policy) &&
    /CUSTOM_ORDER_EXTENSION_BLOCKED_BY_RUSH_FEE/.test(policy) &&
    /rushFeeSnapshot/.test(policy),
  'Rush orders can never be extended — checked on the flag AND the stored fee.',
);
check(
  'only one request may be outstanding at a time',
  /OUTSTANDING_EXTENSION_STATUSES/.test(policy) &&
    /CUSTOM_ORDER_EXTENSION_ALREADY_OUTSTANDING/.test(policy),
);
check(
  'the response deadline is the window OR the due date, whichever is first',
  /export function resolveRespondByAt/.test(policy) &&
    /dueAt\.getTime\(\) < window\.getTime\(\)/.test(policy),
);

// ── 2. The service enforces it, counts it, and keeps the original promise ─────
const policyDispute = read(
  path.join(BACKEND, 'src/custom-orders/custom-order-dispute.policy.ts'),
);
const service = read(
  path.join(BACKEND, 'src/custom-orders/custom-orders.service.ts'),
);
check(
  'the lifetime "one extension per order" rule is gone',
  !/Only one extension request is allowed per order/.test(service),
  'That rule counted declined and expired requests too, locking brands out.',
);
check(
  'the request path asserts the policy',
  /assertExtensionRequestAllowed\(/.test(service),
);
check(
  'the grant path re-asserts it (the request may have sat open)',
  /assertExtensionGrantAllowed\(/.test(service),
);
check(
  'granting snapshots the original promise exactly once',
  /originalPromisedDeliveryAt == null/.test(service) &&
    /originalPromisedProductionAt: order\.promisedProductionAt/.test(service),
  'Without this, "was the brand late?" is unanswerable after one extension.',
);
check(
  'granting moves the acceptance window and retention clock too',
  /buyerAcceptanceWindowEndsAt: shift\(/.test(service) &&
    /measurementRetentionUntil: shift\(/.test(service),
  'Otherwise payout can release while the garment is still in production.',
);
check(
  'granting increments both budget counters',
  /totalExtensionDaysGranted:\s*\n?\s*\{ increment: grantedExtraDays \}/.test(service) &&
    /approvedExtensionCount: \{ increment: 1 \}/.test(service),
);
check(
  'the buyer note is optional and stored',
  /buyerNote/.test(service) && /dto\.note\?\.trim\(\)/.test(service),
);
check(
  'rejection raises the dispute AND the intervention',
  /status: CustomOrderStatus\.DISPUTED/.test(service) &&
    /adminInterventionReason: 'EXTENSION_REJECTED'/.test(service),
  'A dispute is a fact; an intervention is a job somebody owns. Both, per spec.',
);
check(
  'every party is notified of a rejection',
  /CUSTOM_ORDER_BUYER_REJECTED_EXTENSION/.test(service) &&
    /not cancelled/.test(service) &&
    /flagOrderForAdminAttention\(customOrderId, 'DISPUTE_OPENED'/.test(service),
  'Brand, shopper and admin. The brand used to be told nothing at all.',
);
check(
  'a buyer counter now notifies the brand',
  /CUSTOM_ORDER_BUYER_COUNTERED/.test(service),
  'That notification type was registered and never once sent.',
);
check(
  'the shopper has a notice-acknowledge path',
  /ackBuyerAdminNotices/.test(service) &&
    /hasUnreadBuyerAdminNotice/.test(service),
);

// ── 3. Silence escalates. It never auto-accepts ───────────────────────────────
const cron = read(
  path.join(BACKEND, 'src/custom-order-ops/custom-order-ops.cron.service.ts'),
);
check(
  'an unanswered request expires and escalates',
  /expireOpenExtensionRequests/.test(cron) &&
    /buyerResponseStatus: 'EXPIRED'/.test(cron) &&
    /adminInterventionReason: 'EXTENSION_UNANSWERED'/.test(cron),
);
check(
  'expiry never applies the extension',
  !/expireOpenExtensionRequests[\s\S]{0,4000}applyExtensionDays/.test(cron),
  'Auto-accepting on silence is consent that was never given.',
);
check(
  'the brand is nudged before the production deadline',
  /remindBrandBeforeProductionDeadline/.test(cron) &&
    /EXTENSION_DEADLINE_WARNED/.test(cron) &&
    /rushSelected: false/.test(cron),
  'Nothing watched the deadline before, so the flow only ran if a brand recalled it.',
);
check(
  'a superseded request is voided, not escalated',
  /voidSupersededExtensionRequests/.test(cron) &&
    /buyerResponseStatus: 'VOIDED'/.test(cron),
);
check(
  'the expiry sweep claims the row before acting on it',
  /updateMany\(\{[\s\S]{0,200}buyerResponseStatus: 'OPEN'[\s\S]{0,200}\}\)/.test(cron) &&
    /claimed\.count === 0/.test(cron),
  'A shopper answering in the same minute must win the race.',
);

// ── 4. Notification payloads survive validation and carry the request ─────────
const registry = read(
  path.join(BACKEND, 'src/notifications/notifications.registry.ts'),
);
check(
  'the extension payload declares requestId (stripUnknown would drop it)',
  /NT_CUSTOM_ORDER_EXTENSION_REQUESTED[\s\S]{0,600}requestId: Joi\.string\(\)/.test(
    registry,
  ),
);
check(
  'the admin-review payload declares reason',
  /NT_CUSTOM_ORDER_ADMIN_REVIEW_TRIGGERED[\s\S]{0,600}reason: Joi\.string\(\)/.test(
    registry,
  ),
  'The formatter always read it; the schema always removed it.',
);

// ── 5. Web: the decision is a banner, not a buried select ─────────────────────
const panel = read(
  path.join(WEB, 'src/components/custom-orders/ExtensionDecisionPanel.tsx'),
);
check(
  'the web panel states that declining is not a cancellation',
  /does not cancel/.test(panel),
);
check(
  'the web panel takes an optional note on both answers',
  /Add a note \(optional\)/.test(panel),
);
const ordersPanel = read(path.join(WEB, 'src/pages/profile/tabs/OrdersPanel.tsx'));
check(
  'the old buried dropdown is gone from the shopper order screen',
  !/Send response/.test(ordersPanel) && !/setExtensionResponse/.test(ordersPanel),
);
check(
  'the decision renders above the order, keyed to the deep link',
  /ExtensionDecisionPanel/.test(ordersPanel) &&
    /focusExtensionRequestId/.test(ordersPanel),
);
check(
  'the shopper notice channel is mounted on web',
  /AdminNoticePanel/.test(ordersPanel) && /ackAdminNotices/.test(ordersPanel),
);

// ── 6. Mobile: the data exists, the screen exists, the link lands on it ───────
const mobileApi = read(path.join(MOBILE, 'src/api/BuyerOrdersApi.ts'));
check(
  'mobile maps extension requests at all',
  /extensionRequests/.test(mobileApi) && /respondToExtension/.test(mobileApi),
  'It mapped none of this, which is why the screen had nothing to show.',
);
check(
  'mobile maps the budget and the shopper notice state',
  /extensionPolicy/.test(mobileApi) &&
    /hasUnreadBuyerAdminNotice/.test(mobileApi) &&
    /ackAdminNotices/.test(mobileApi),
);
check(
  'mobile keeps timeline payloads (the notice text lives there)',
  /payload: asRecord\(sourceEntry\.payloadJson\)/.test(mobileApi),
);

const mobileScreen = read(
  path.join(MOBILE, 'app/orders/extension/[requestId].tsx'),
);
check(
  'the mobile decision screen exists and offers exactly two answers',
  /Grant \$\{dayLabel/.test(mobileScreen) && /title="Decline"/.test(mobileScreen),
);
check(
  'the mobile screen says declining is not a cancellation',
  /does not cancel or refund/.test(mobileScreen),
);
check(
  'the mobile screen explains an already-settled request',
  /Already settled/.test(mobileScreen) && /VOIDED/.test(mobileScreen),
);

const mobileDetail = read(path.join(MOBILE, 'app/orders/[orderId].tsx'));
check(
  'the mobile order screen surfaces an open request and the notices',
  /MORE TIME REQUESTED/.test(mobileDetail) && /NOTES FROM WIEZ/.test(mobileDetail),
);

const routing = read(path.join(MOBILE, 'src/utils/mobileRouting.ts'));
check(
  'the mobile deep link carries the request id to the decision screen',
  /orders\/extension\/\[requestId\]/.test(routing) &&
    /CUSTOM_ORDER_EXTENSION_REQUESTED/.test(routing),
  'This branch used to drop requestId and land on the order list.',
);

// ── 6b. Disputing a LATE order, which was impossible on both clients ─────────
check(
  'the API decides delay eligibility, so neither client re-derives the policy',
  /delayDispute: resolveDelayEligibility\(/.test(service),
  'The grace period and the which-promise precedence are policy, not client logic.',
);
check(
  'a delay complaint needs no photograph',
  /isDelayClassIssue\(params\.issueType\)\) return;/.test(policyDispute),
  'There is nothing to photograph on an order that has not arrived.',
);
check(
  'the shopper can close their own delay dispute, and there is a route for it',
  /async closeDelayDispute\(/.test(service) &&
    /disputes\/:disputeId\/close/.test(
      read(path.join(BACKEND, 'src/custom-orders/custom-orders-buyer.controller.ts')),
    ),
  'A service method with no route is a feature nobody can reach.',
);
check(
  'a delay dispute does not stop the maker',
  /Status is deliberately untouched/.test(service),
  'The remedy a late shopper wants is the garment.',
);
check(
  'the web offers the report and says it is not a cancellation',
  /does <strong>not<\/strong> cancel/.test(
    read(path.join(WEB, 'src/components/custom-orders/DelayDisputePanel.tsx')),
  ),
);
check(
  'the mobile order screen carries the report, the open state and the grace',
  /DELAY REPORTED/.test(mobileDetail) &&
    /PRODUCTION OVERDUE/.test(mobileDetail) &&
    /RUNNING A LITTLE LATE/.test(mobileDetail),
);
check(
  'mobile can call both dispute endpoints',
  /reportDelay/.test(mobileApi) && /closeDelayDispute/.test(mobileApi),
);

// ── 6c. The brand debt is a record, and is recovered from later earnings ─────
const brandBalance = read(path.join(BACKEND, 'src/finance/brand-balance.service.ts'));
check(
  'debt is recovered oldest-first from subsequent earnings',
  /applyEarningsToDebt/.test(brandBalance) &&
    /orderBy: \{ createdAt: 'asc' \}/.test(brandBalance),
);
check(
  'a brand in debt must acknowledge it before accepting custom work',
  /CUSTOM_ORDER_BRAND_DEBT_ACK_REQUIRED/.test(service) &&
    /brandDebtAckAmount/.test(service),
);
check(
  'both refund paths raise the debt',
  /BrandBalanceAdjustmentType\.REFUND_CLAWBACK/.test(
    read(path.join(BACKEND, 'src/custom-orders/custom-order-refund.service.ts')),
  ) &&
    /BrandBalanceAdjustmentType\.REFUND_CLAWBACK/.test(
      read(path.join(BACKEND, 'src/finance/standard-order-escrow.service.ts')),
    ),
  'Custom orders and standard orders both release before a refund can land.',
);
check(
  'the brand is told, in both directions',
  /direction: 'DEBIT'/.test(brandBalance) && /direction: 'RECOVERY'/.test(brandBalance),
);
check(
  'the seller terms state the negative-balance rule',
  (() => {
    const terms = read(
      path.join(WORKSPACE, 'docs/legal/user-facing/05_SELLER_BRAND_TERMS.md'),
    );
    return (
      /Refund Recovery, Negative Balances/.test(terms) &&
      /Payouts are suspended while a debt is outstanding/.test(terms)
    );
  })(),
);

// ── 7. The legal documents say the same numbers as the code ──────────────────
const buyerPolicy = read(
  path.join(WORKSPACE, 'docs/legal/user-facing/06_BUYER_MARKETPLACE_POLICY.md'),
);
const sellerTerms = read(
  path.join(WORKSPACE, 'docs/legal/user-facing/05_SELLER_BRAND_TERMS.md'),
);
check(
  'the buyer policy states the budget and the rush bar',
  /three \(3\) calendar days/.test(buyerPolicy) &&
    /two \(2\) approved extensions/.test(buyerPolicy) &&
    /six \(6\) calendar days/.test(buyerPolicy) &&
    /Rush orders are never extended/.test(buyerPolicy),
);
check(
  'the buyer policy states that silence is not consent',
  /Silence is not consent/.test(buyerPolicy),
);
check(
  'the seller terms state the same caps',
  /three \(3\) calendar days/.test(sellerTerms) &&
    /two \(2\) per order/.test(sellerTerms) &&
    /Rush orders may never be extended/.test(sellerTerms),
);
check(
  'the generated legal bundles carry the new clauses',
  /Production Deadlines and Time Extensions/.test(
    read(path.join(WEB, 'src/pages/legal/legalDocuments.ts')),
  ) &&
    /Production Deadlines and Time Extensions/.test(
      read(path.join(MOBILE, 'src/legal/legalDocuments.ts')),
    ),
  'Both clients render from the generated bundle, not from the markdown.',
);

console.log(
  `\nExtension flow contract: ${checks - failures}/${checks} checks passed`,
);
process.exit(failures > 0 ? 1 : 0);
