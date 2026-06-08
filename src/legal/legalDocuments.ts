import type { LegalDocumentKey } from '@/src/api/LegalApi';

export type LegalPageDefinition = {
  key: LegalDocumentKey;
  slug: string;
  title: string;
  effectiveDate: string;
  version: string;
  sourceDocument: string;
  summary: string;
  sections: Array<{ heading: string; body: string }>;
};

const VERSION = '2026.06.08-weaz-draft.1';
const EFFECTIVE_DATE =
  '[LAWYER REVIEW] effective date pending counsel approval';
const DRAFT_NOTICE =
  'Lawyer-review-ready draft. This is not final legal advice and must not be treated as public-launch-ready until counsel approves it.';

export const LEGAL_PAGES: LegalPageDefinition[] = [
  {
    key: 'TERMS_OF_SERVICE',
    slug: 'terms',
    title: 'Terms and Conditions',
    effectiveDate: EFFECTIVE_DATE,
    version: VERSION,
    sourceDocument: 'docs/legal/user-facing/01_TERMS_AND_CONDITIONS.md',
    summary:
      'Operating terms for WEAZ visitors, buyers, creators, brand owners, brand staff, marketplace content, checkout, and protected account actions.',
    sections: [
      { heading: 'Draft status', body: DRAFT_NOTICE },
      {
        heading: 'Who these terms cover',
        body:
          'These terms apply when a person uses WEAZ as a visitor, buyer, brand owner, brand staff member, creator, or account holder. WEAZ is a fashion-focused social commerce platform for African fashion discovery, product sales, brand stores, custom-order requests, messaging, reviews, and marketplace services. [PRODUCT CONFIRMATION NEEDED] Confirm the legal entity, registered address, notice address, and any trading name.',
      },
      {
        heading: 'Eligibility and accounts',
        body:
          'Users must provide accurate account information, keep credentials secure, and use WEAZ only for lawful purposes. Brand owners and staff must have authority to act for the brand account they create, manage, or publish through. [PRODUCT CONFIRMATION NEEDED] Confirm minimum age and whether minors may browse, buy, sell, upload content, submit measurements, or create brand accounts.',
      },
      {
        heading: 'Marketplace role',
        body:
          'WEAZ provides technology for brands to publish stores, products, designs, collections, custom-order flows, messages, and related content. Brands remain responsible for listings, product accuracy, lawful goods, fulfillment, customer communication, store policies, and payout details. [LAWYER REVIEW] Confirm whether WEAZ is marketplace facilitator, payment collection agent, escrow or hold administrator, seller of record, or another role.',
      },
      {
        heading: 'Payments and orders',
        body:
          'Buyers must provide accurate delivery, contact, and payment information. Sellers must keep pricing, inventory, variants, images, policies, and fulfillment details accurate. Payments may remain pending until provider verification, webhook confirmation, backend reconciliation, or fraud checks complete. The Payment, Billing, and Subscription Policy controls payment-specific details.',
      },
      {
        heading: 'Content and conduct',
        body:
          'Users keep ownership of content they own, while granting WEAZ permission to host, process, resize, display, recommend, moderate, and distribute content within the service. Users must not upload counterfeit goods, stolen designs, unauthorized media, misleading brand claims, fake reviews, harassment, scams, or unlawful content.',
      },
      {
        heading: 'Legal updates',
        body:
          'WEAZ records the version of required legal documents accepted during signup, checkout, store publish, and content publish flows. Existing users may need to accept this draft version or a later counsel-approved version before protected actions continue.',
      },
      {
        heading: 'Open legal items',
        body:
          '[LAWYER REVIEW] Counsel must finalize disclaimers, liability limits, indemnity, dispute resolution, governing law, venue, arbitration, notices, and consumer-rights carve-outs. [PRODUCT CONFIRMATION NEEDED] Add legal notice email, privacy contact, support channel, and physical notice address.',
      },
    ],
  },
  {
    key: 'PRIVACY_POLICY',
    slug: 'privacy',
    title: 'Privacy Policy',
    effectiveDate: EFFECTIVE_DATE,
    version: VERSION,
    sourceDocument: 'docs/legal/user-facing/02_PRIVACY_POLICY.md',
    summary:
      'How WEAZ collects, uses, discloses, protects, retains, and deletes account, marketplace, commerce, content, safety, and device data.',
    sections: [
      { heading: 'Draft status', body: DRAFT_NOTICE },
      {
        heading: 'Scope and controller',
        body:
          'This policy covers visitors, buyers, brand owners, brand staff, creators, and account holders. [PRODUCT CONFIRMATION NEEDED] Confirm the controller/operator legal entity, registered address, privacy contact, data protection officer if required, and launch jurisdictions.',
      },
      {
        heading: 'Data WEAZ collects',
        body:
          'WEAZ collects account identity, profile, authentication, session, device, security, buyer order, shipping, payment reference, saved-card summary, brand verification, payout, store, product, media, review, message, social action, notification, push-token, marketplace-signal, support, body measurement, size-fit, custom-order, and KYC data.',
      },
      {
        heading: 'How data is used',
        body:
          'WEAZ uses data to create and secure accounts, operate stores, process checkout, verify payments, support shipping and fulfillment, manage custom orders, provide messaging, moderate safety issues, detect fraud, manage payouts, support users, improve reliability, and personalize marketplace discovery.',
      },
      {
        heading: 'Legal acceptance evidence',
        body:
          'WEAZ records versioned legal acceptance evidence for required documents, including document key, version, source, surface, account type, timestamp, locale, app version, user agent, request evidence, and related metadata where available.',
      },
      {
        heading: 'Storage and processors',
        body:
          'WEAZ uses cookies, local storage, session storage, mobile SecureStore, mobile AsyncStorage, query cache, signed URL cache, market signal queues, push-token storage, and WebView cookies. WEAZ may share data with hosting, database, storage, CDN, payment, fraud, email, push, monitoring, support, legal, and security providers. [PRODUCT CONFIRMATION NEEDED] Add the processor list.',
      },
      {
        heading: 'Retention and rights',
        body:
          'Some account, order, payment, dispute, fraud, KYC, audit, and legal acceptance records may be retained after account deletion. [LAWYER REVIEW] Counsel must approve retention periods, sensitive-data consent, user rights, regulator complaint rights, and cross-border transfer language.',
      },
    ],
  },
  {
    key: 'COOKIE_POLICY',
    slug: 'cookies',
    title: 'Cookie and Tracking Policy',
    effectiveDate: EFFECTIVE_DATE,
    version: VERSION,
    sourceDocument: 'docs/legal/user-facing/03_COOKIE_AND_TRACKING_POLICY.md',
    summary:
      'How WEAZ uses cookies, browser storage, mobile storage, WebView cookies, anonymous sessions, and similar technologies.',
    sections: [
      { heading: 'Draft status', body: DRAFT_NOTICE },
      {
        heading: 'Essential storage',
        body:
          'WEAZ uses essential cookies and storage for authentication, refresh sessions, fraud prevention, account security, checkout continuity, active brand context, legal acceptance flow support, and reliable app operation. Blocking essential storage can break login, checkout, store publishing, payment verification, or deletion flows.',
      },
      {
        heading: 'Browser and mobile storage',
        body:
          'WEAZ web uses local storage or session storage for user/session metadata, query cache, theme preferences, signed URL cache, pending bag or checkout state, active brand state, embedded surfaces, and market signals. WEAZ mobile uses SecureStore for tokens and active brand data, and AsyncStorage for query cache and marketplace signal queues.',
      },
      {
        heading: 'WebView cookies',
        body:
          'WEAZ mobile may use WebView sessions for embedded studio or web surfaces. WebView cookie sharing can be required for authenticated users to access connected web workspaces from mobile. [LAWYER REVIEW] Confirm final WebView cookie disclosure.',
      },
      {
        heading: 'Marketplace signals',
        body:
          'WEAZ collects views, saves, reactions, searches, bag interactions, suppressions, screen context, position context, and anonymous session identifiers to support recommendations, ranking, anti-abuse checks, analytics, and product reliability.',
      },
      {
        heading: 'Non-essential tracking',
        body:
          'The legal audit did not identify active third-party analytics SDK usage in inspected app code. [PRODUCT CONFIRMATION NEEDED] Confirm whether hosted production injects analytics, monitoring scripts, advertising pixels, or consent tooling outside source code. [LAWYER REVIEW] Confirm whether a banner or granular preference center is required at launch.',
      },
    ],
  },
  {
    key: 'COMMUNITY_GUIDELINES',
    slug: 'community-guidelines',
    title: 'Community Guidelines',
    effectiveDate: EFFECTIVE_DATE,
    version: VERSION,
    sourceDocument: 'docs/legal/user-facing/04_COMMUNITY_GUIDELINES.md',
    summary:
      'Trust and safety rules for WEAZ profiles, stores, designs, products, collections, posts, comments, reviews, messages, and reports.',
    sections: [
      { heading: 'Draft status', body: DRAFT_NOTICE },
      {
        heading: 'Respectful participation',
        body:
          'Users must not harass, threaten, abuse, impersonate, exploit, intimidate, stalk, scam, or target other users. Hate content, discriminatory abuse, sexual exploitation, violent threats, fraud, phishing, and harmful behavior are not allowed.',
      },
      {
        heading: 'Content policy',
        body:
          'Users and brands must upload accurate, rights-cleared, fashion-relevant content. Product images must represent the product being sold. Design and collection media must represent the creative work being shown. Reviews must reflect genuine buyer experience.',
      },
      {
        heading: 'Marketplace integrity',
        body:
          'Users must not manipulate search, ranking, reviews, saves, follows, reactions, recommendations, order flows, payment flows, or dispute systems. Automated scraping, fake engagement, undisclosed review incentives, chargeback abuse, and payment fraud are not allowed.',
      },
      {
        heading: 'Messages and private content',
        body:
          'Messages, private collection access, order communication, custom-order discussions, and support interactions must be used for legitimate WEAZ activity. [LAWYER REVIEW] Confirm final disclosure for admin/support access during safety, support, dispute, fraud, or legal reviews.',
      },
      {
        heading: 'Enforcement',
        body:
          'WEAZ may review, remove, hide, restrict, suspend, close, redact, or escalate content, stores, messages, reviews, and accounts where needed. [PRODUCT CONFIRMATION NEEDED] Define appeal channels, response targets, suspension notice rules, and repeat-violation thresholds.',
      },
    ],
  },
  {
    key: 'SELLER_TERMS',
    slug: 'seller-terms',
    title: 'Seller and Brand Terms',
    effectiveDate: EFFECTIVE_DATE,
    version: VERSION,
    sourceDocument: 'docs/legal/user-facing/05_SELLER_BRAND_TERMS.md',
    summary:
      'Additional terms for brands, sellers, designers, store owners, and staff operating WEAZ seller workflows.',
    sections: [
      { heading: 'Draft status', body: DRAFT_NOTICE },
      {
        heading: 'Authority and brand account control',
        body:
          'The person creating or managing a brand account must have authority to act for that brand. Brand owners are responsible for staff permissions, staff conduct, workspace access, store changes, order handling, buyer communication, product accuracy, and payout details.',
      },
      {
        heading: 'Store guidelines',
        body:
          'Brands must keep store profile information, descriptions, categories, tags, product details, inventory, variants, prices, processing times, shipping regions, return windows, response expectations, and payout details accurate. Stores must not publish counterfeit goods, misleading listings, stolen designs, or unavailable inventory.',
      },
      {
        heading: 'Listings and content',
        body:
          'Designs are creative/media showcases, products are purchasable inventory, and store collections are curated product groups. Sellers must use the correct flow and must own or have permission to use all media, design references, product photos, names, marks, and listing copy.',
      },
      {
        heading: 'Orders and support',
        body:
          'Sellers are responsible for fulfillment, professional communication, store policies, size and custom-order expectations, measurement requirements, agreed price windows, production timelines, and update obligations. [PRODUCT CONFIRMATION NEEDED] Confirm seller response and production service targets.',
      },
      {
        heading: 'Payments and disputes',
        body:
          'WEAZ may record payments, commissions, settlement holds, refunds, chargebacks, reversals, payout eligibility, bank account data, and dispute outcomes. [PRODUCT CONFIRMATION NEEDED] Add commission, payout, reserve, tax, and fee-change terms. [LAWYER REVIEW] Confirm liability split for refunds, defective goods, delivery failures, custom fit disputes, and chargebacks.',
      },
    ],
  },
  {
    key: 'BUYER_POLICY',
    slug: 'buyer-policy',
    title: 'Buyer Marketplace Policy',
    effectiveDate: EFFECTIVE_DATE,
    version: VERSION,
    sourceDocument: 'docs/legal/user-facing/06_BUYER_MARKETPLACE_POLICY.md',
    summary:
      'Buyer expectations for checkout, product orders, custom requests, measurements, delivery confirmation, support, and reviews.',
    sections: [
      { heading: 'Draft status', body: DRAFT_NOTICE },
      {
        heading: 'Checkout information',
        body:
          'Buyers must provide accurate contact, delivery, order, and payment information. WEAZ may require authentication, current legal acceptance, payment policy acceptance, provider verification, idempotency checks, or fraud review before checkout continues.',
      },
      {
        heading: 'Product orders',
        body:
          'Product orders are based on seller listings, inventory, media, variants, pricing, shipping regions, and store policies. Buyers must review product details, sizing, shipping rules, return windows, and seller policies before checkout.',
      },
      {
        heading: 'Custom orders and measurements',
        body:
          'Custom orders may depend on active seller configuration, required measurements, buyer instructions, price previews, seller requirements, production timelines, and payment verification. [LAWYER REVIEW] Confirm fit tolerance, buyer measurement errors, alterations, production delays, and dispute windows.',
      },
      {
        heading: 'Delivery and disputes',
        body:
          'Delivery confirmation, missed issue windows, return eligibility, seller policy terms, custom-order facts, payment-provider rules, and dispute records can affect refund or release decisions. [PRODUCT CONFIRMATION NEEDED] Confirm buyer issue window, return process, refund method, and delivery confirmation consequences.',
      },
      {
        heading: 'Reviews',
        body:
          'Buyer reviews must be honest, relevant, and based on real experiences. Buyers must not post fake reviews, use reviews for harassment, disclose private data, demand unrelated concessions, or accept undisclosed incentives.',
      },
    ],
  },
  {
    key: 'PAYMENT_POLICY',
    slug: 'payment-policy',
    title: 'Payment, Billing, and Subscription Policy',
    effectiveDate: EFFECTIVE_DATE,
    version: VERSION,
    sourceDocument: 'docs/legal/user-facing/07_PAYMENT_BILLING_SUBSCRIPTION_POLICY.md',
    summary:
      'Payment initialization, provider verification, saved payment methods, refunds, chargebacks, settlement holds, payouts, and subscription readiness.',
    sections: [
      { heading: 'Draft status', body: DRAFT_NOTICE },
      {
        heading: 'Payment providers',
        body:
          'WEAZ may use third-party payment providers to collect, authorize, verify, refund, reverse, reconcile, or dispute payments through redirects, hosted pages, WebBrowser flows, tokenized card authorization, webhooks, or backend verification. [PRODUCT CONFIRMATION NEEDED] Confirm launch providers, currencies, saved-card availability, and provider terms links.',
      },
      {
        heading: 'Verification',
        body:
          'A buyer payment is not final merely because checkout opened or payment was attempted. WEAZ may wait for provider verification, backend status checks, webhook confirmation, fraud review, reconciliation, or delayed provider events before treating an order as paid.',
      },
      {
        heading: 'Amounts and fees',
        body:
          'WEAZ may store order totals, item totals, currency, exchange-rate snapshots, payment references, provider status, commission, settlement values, escrow or hold records, and payout eligibility records. [PRODUCT CONFIRMATION NEEDED] Add final consumer fee, seller commission, FX, refund fee, chargeback fee, and tax terms.',
      },
      {
        heading: 'Refunds and payouts',
        body:
          'Refunds, reversals, chargebacks, or dispute outcomes may affect order state, buyer support, seller balances, payout eligibility, settlement holds, ledger records, and account review. Payouts may be delayed, frozen, reduced, reversed, or reviewed for risk, verification, legal, or dispute reasons.',
      },
      {
        heading: 'Subscriptions',
        body:
          '[PRODUCT CONFIRMATION NEEDED] No active paid subscription product was identified in the current legal audit. If WEAZ adds subscriptions, premium seller plans, recurring billing, trials, or auto-renewals, this policy must be expanded before launch.',
      },
    ],
  },
  {
    key: 'COPYRIGHT_POLICY',
    slug: 'copyright',
    title: 'Content, IP, and Copyright Policy',
    effectiveDate: EFFECTIVE_DATE,
    version: VERSION,
    sourceDocument: 'docs/legal/user-facing/08_CONTENT_IP_COPYRIGHT_POLICY.md',
    summary:
      'WEAZ rules for user content, original work, image rights, designs, trademarks, counterfeits, takedowns, and repeat infringement.',
    sections: [
      { heading: 'Draft status', body: DRAFT_NOTICE },
      {
        heading: 'Content scope',
        body:
          'This policy applies to designs, products, store collections, photos, videos, profile images, banners, reviews, comments, messages, documents, brand names, product names, marks, and listing copy.',
      },
      {
        heading: 'Ownership and license',
        body:
          'Users keep ownership of content they own. By uploading content, users grant WEAZ a license to host, store, process, resize, transcode, reproduce, display, distribute, recommend, promote within the service, moderate, and preserve that content as needed to operate WEAZ.',
      },
      {
        heading: 'Rights-cleared content',
        body:
          'Users must only upload content they own or have permission to use. Counterfeit goods, stolen designs, unauthorized images, misleading brand claims, protected marks without permission, private data without authorization, and unlawful content are not allowed.',
      },
      {
        heading: 'Reports and takedowns',
        body:
          'Rights holders may report content that appears to infringe copyright, trademark, design rights, publicity rights, or other protected rights. [PRODUCT CONFIRMATION NEEDED] Define report intake, notice contents, counter-notice process, repeat-infringer threshold, review owner, and response timeline.',
      },
      {
        heading: 'Deletion and retention',
        body:
          'Deleting, archiving, restoring, or permanently deleting content may affect public visibility, but some records may remain in backups, logs, legal acceptance records, audit trails, payment/order records, dispute evidence, moderation history, signed URL records, or provider systems where required or permitted.',
      },
    ],
  },
  {
    key: 'ACCOUNT_DELETION_POLICY',
    slug: 'account-deletion',
    title: 'Account and Data Deletion Policy',
    effectiveDate: EFFECTIVE_DATE,
    version: VERSION,
    sourceDocument: 'docs/legal/user-facing/09_ACCOUNT_DATA_DELETION_POLICY.md',
    summary:
      'How WEAZ account deletion works, what current deletion changes, and what records may be retained after deletion.',
    sections: [
      { heading: 'Draft status', body: DRAFT_NOTICE },
      {
        heading: 'Requesting deletion',
        body:
          'Authenticated users can request account deletion from account settings where implemented. WEAZ may require password confirmation, a confirmation word, active authentication, and other safety checks before deletion starts.',
      },
      {
        heading: 'What deletion does',
        body:
          'WEAZ current backend deletion revokes refresh tokens, disables account credential state, deactivates the user account, and pseudonymizes identifiers such as email and username. It is not a blanket immediate erasure of every related record. [LAWYER REVIEW] Counsel must approve final wording.',
      },
      {
        heading: 'Retained records',
        body:
          'WEAZ may retain order records, payment records, payout records, refunds, chargebacks, fraud signals, security logs, legal acceptance records, moderation records, dispute records, tax/accounting records, support records, KYC or verification records, and audit logs where required or permitted.',
      },
      {
        heading: 'Brand and store accounts',
        body:
          'Deleting a brand owner account can affect store access, staff roles, active orders, payouts, buyer support, and legal obligations. [PRODUCT CONFIRMATION NEEDED] Confirm last-owner deletion rules, brand transfer process, seller offboarding process, and active-order handling.',
      },
      {
        heading: 'Data rights',
        body:
          'Users may be able to request access, correction, deletion, portability, restriction, objection, or withdrawal of consent depending on jurisdiction. [PRODUCT CONFIRMATION NEEDED] Add the official data rights channel, verification steps, response timeline, and escalation path.',
      },
    ],
  },
];

export const LEGAL_PAGE_BY_SLUG = new Map(
  LEGAL_PAGES.map((document) => [document.slug, document]),
);
