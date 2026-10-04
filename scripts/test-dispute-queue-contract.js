/**
 * The dispute queue: ownership, mediation, and the bug that hid every dispute.
 *
 * The failure this pins down was structural, not cosmetic. Disputes live in two
 * unrelated tables. `CustomOrderDispute` is where everything the PLATFORM
 * raises lands — a rejected extension, a reported delay, a complaint about what
 * arrived — and the generic `Dispute` table is what an admin creates by hand.
 * The admin Disputes page read only the second one. So a shopper rejecting a
 * request for more time opened a dispute, flipped the order to DISPUTED and
 * raised an admin intervention, and the console showed an empty queue.
 *
 * The rules that replaced it are easy to erode one convenience at a time:
 *   - every dispute enters the queue with a claim deadline;
 *   - ownership can be handed on but never simply dropped;
 *   - the departing admin cannot approve their own release;
 *   - a remedy that gives away someone's rights is PROPOSED, not imposed;
 *   - a mediated extension still spends the order's extension budget, and
 *     still cannot touch a rush order.
 *
 * Each of those is one "just let them..." away from being gone.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const BACKEND = path.join(ROOT, 'bthreadly');
const WEB = path.join(ROOT, 'fthreadly');

let passed = 0;
let failed = 0;

function read(...parts) {
  return fs.readFileSync(path.join(...parts), 'utf8');
}

function check(label, condition, why) {
  if (condition) {
    passed += 1;
    console.log('ok    ' + label);
  } else {
    failed += 1;
    console.log('FAIL  ' + label + (why ? '\n      ' + why : ''));
  }
}

const policy = read(BACKEND, 'src/custom-orders/custom-order-dispute-resolution.policy.ts');
const service = read(BACKEND, 'src/custom-orders/custom-order-dispute.service.ts');
const orders = read(BACKEND, 'src/custom-orders/custom-orders.service.ts');
const cron = read(BACKEND, 'src/custom-order-ops/custom-order-ops.cron.service.ts');
const permissions = read(BACKEND, 'src/admin/constants/permissions.ts');
const controller = read(BACKEND, 'src/custom-order-admin/custom-order-admin.controller.ts');
const schema = read(BACKEND, 'prisma/schema.prisma');

// ── 1. Disputes are reachable at all ────────────────────────────────────────
check(
  'the admin console has a queue endpoint for custom-order disputes',
  /@Get\('dispute-queue'\)/.test(controller),
  'The only prior endpoint had no caller; the Disputes page read the other table.',
);
check(
  'the web queue actually calls it',
  /getDisputeQueue/.test(read(WEB, 'src/pages/admin/disputes/useUnifiedDisputeQueue.ts')),
  'An endpoint with no caller is why these disputes were invisible.',
);
check(
  'the disputes page merges both sources',
  /mapOrderDispute/.test(read(WEB, 'src/pages/admin/disputes/useUnifiedDisputeQueue.ts')) &&
    /mapGenericDispute/.test(
      read(WEB, 'src/pages/admin/disputes/useUnifiedDisputeQueue.ts'),
    ),
  'An admin should not need to know which table a dispute lives in.',
);
check(
  'one failing source cannot empty the whole queue',
  /Promise\.allSettled/.test(read(WEB, 'src/pages/admin/disputes/useUnifiedDisputeQueue.ts')),
  'Promise.all would let a new bug in one half hide the half that works.',
);

// ── 2. Every dispute enters owing someone an owner ──────────────────────────
check(
  'all three dispute creation sites set a claim deadline',
  (orders.match(/claimDueAt: resolveClaimDueAt\(/g) || []).length === 3,
  'A dispute with no deadline never enters the escalation sweep.',
);
check(
  'the unclaimed sweep escalates to SuperAdmins',
  /escalateUnclaimedDisputes/.test(cron) && /Role\.SuperAdmin/.test(cron),
);
check(
  'escalation repeats while a dispute stays unowned',
  /escalationRepeatHours/.test(cron) && /escalationCount/.test(cron),
  'One unread alert is indistinguishable from no alert.',
);
check(
  'the sweep does not auto-assign',
  !/claimedByAdminId:\s*[a-zA-Z]+Id/.test(
    cron.slice(cron.indexOf('escalateUnclaimedDisputes')),
  ),
  'An owner who does not know they own it is worse than an obvious gap.',
);
check(
  'the escalation routes admins to the console, not the shopper view',
  /adminCustomOrderTarget\(dispute\.customOrderId\)/.test(cron),
  'Sending an admin somewhere they cannot act turns an alert into noise.',
);

// ── 3. Ownership is handed on, never dropped ────────────────────────────────
check(
  'claiming is atomic against a concurrent claim',
  /updateMany\(\{[\s\S]{0,200}?claimedByAdminId: null/.test(service),
  'Two admins pressing Claim must not silently overwrite each other.',
);
check(
  'there is no bare release endpoint',
  !/@Post\('dispute-queue\/:id\/release'\)/.test(controller),
  'A free release turns a hard case into a hot potato.',
);
check(
  'a handover names a successor and needs approval',
  /handover\/decide/.test(controller) &&
    /assertHandoverRequestAllowed/.test(policy),
);
check(
  'the departing admin cannot approve their own handover',
  /CUSTOM_ORDER_DISPUTE_HANDOVER_SELF_APPROVAL/.test(policy),
);
check(
  'approving a handover is SuperAdmin-only',
  /SUPERADMIN_ONLY_PERMISSIONS[\s\S]{0,1200}?DISPUTES_HANDOVER_APPROVE/.test(permissions),
);
check(
  'only the holder can act on the substance',
  /assertOwnedBy/.test(service),
);

// ── 4. Mediation, not override ──────────────────────────────────────────────
check(
  'more time is put to the shopper rather than imposed',
  /MEDIATED_EXTENSION\]: DisputeConsentParty\.BUYER/.test(policy),
  'They already refused once; overriding that makes the refusal meaningless.',
);
check(
  'a refund is imposed rather than proposed',
  !/FULL_REFUND\]: DisputeConsentParty/.test(policy),
  'A refund costs the brand money they have not earned, which the platform may impose.',
);
check(
  'a mediated extension still spends the order budget',
  /remainingExtensionDays/.test(policy) &&
    /EXTENSION_POLICY\.maxTotalDays/.test(policy),
  'Otherwise the dispute path is an unlimited-time back door.',
);
check(
  'a rush order is never extended, even by agreement',
  /isRushOrder[\s\S]{0,400}?rush fee/i.test(policy),
);
check(
  'blocked options are returned WITH a reason, not filtered away',
  /blockedReason/.test(policy),
  'An admin who cannot see why a remedy is missing will assume it is a bug.',
);
check(
  'a declined proposal returns the dispute to an admin rather than closing it',
  /DECLINED[\s\S]{0,400}?ADMIN_REVIEW/.test(service),
  'A refused proposal means the disagreement is still live.',
);
check(
  'one decline ends the round without waiting for the other party',
  /buyerDeclinedAt\) return 'DECLINED'/.test(policy),
);

// ── 5. Dispute-only admin accounts are possible ─────────────────────────────
check(
  'claiming, resolving and refunding are separate grants',
  /DISPUTES_CLAIM: 'disputes\.claim'/.test(permissions) &&
    /DISPUTES_REFUND: 'disputes\.refund'/.test(permissions),
  'One code behind every route meant granting all three together.',
);
check(
  'the refund permission gates money-moving outcomes',
  /MISSING_PERMISSION_DISPUTES_REFUND/.test(service),
);
check(
  'the web knows the new permission codes',
  /DISPUTES_CLAIM/.test(read(WEB, 'src/types/admin.ts')) &&
    /disputes\.claim/.test(read(WEB, 'src/constants/adminPermissions.ts')),
);

// ── 6. A disputed order is findable in the orders table ─────────────────────
check(
  'the order list carries its open disputes',
  /openDisputes/.test(read(BACKEND, 'src/custom-order-admin/custom-order-admin.service.ts')),
  'A delay dispute leaves the order IN_PRODUCTION, so status alone hides it.',
);
check(
  'there is a dispute filter distinct from the DISPUTED status',
  /disputed\?: boolean/.test(
    read(BACKEND, 'src/custom-order-admin/dto/custom-order-admin.dto.ts'),
  ) && /HAS_DISPUTE/.test(read(WEB, 'src/pages/admin/AdminCustomOrdersPage.tsx')),
);
check(
  'the orders table tags a disputed row',
  /openDisputes\?\.length/.test(read(WEB, 'src/pages/admin/AdminCustomOrdersPage.tsx')),
);

// ── 7. The parties can answer ───────────────────────────────────────────────
check(
  'a shopper can accept or decline a proposed resolution',
  /proposal\/respond/.test(
    read(BACKEND, 'src/custom-orders/custom-orders-buyer.controller.ts'),
  ),
  'Mediation with no way for the party to answer is just a slower override.',
);
check(
  'the schema records who signed the outcome, not only who held it',
  /resolvedByAdminId/.test(schema),
);
check(
  'the proposal state is distinct from admin review',
  /AWAITING_PARTY_CONSENT/.test(schema),
  'A queue that cannot tell "waiting on us" from "waiting on them" cannot triage.',
);

console.log(
  '\nDispute queue contract: ' + passed + '/' + (passed + failed) + ' checks passed',
);
if (failed > 0) process.exit(1);
