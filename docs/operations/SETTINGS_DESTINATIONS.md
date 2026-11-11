# Settings destinations and Studio setup access

The Settings rows below open existing native screens or authenticated Studio pages. A row is not proof of server permission; current membership, role, resource ownership and stronger-authentication rules remain enforced by the API.

## Native destinations

| Settings action | Destination | Availability |
|---|---|---|
| Your bio | Native me-edit, with from=/settings | Signed-in account |
| Phone & email | Native account-security, focus=email | Signed-in account |
| Password & security / Two-factor authentication | Native account-security | Signed-in account |
| Privacy controls | Native privacy | Signed-in account |
| Push notifications / Email notifications | Native notifications / email-preferences | Signed-in account |
| Sizing settings / Size charts | Native sizing / charts | Shopper |
| Market preferences / Currency / Payment settings | Native market-preferences / currency / payment | Shopper |
| Upload preferences / Theme | Native upload-preferences / theme | Signed-in account |
| Help center / Report a problem | Native support, containing support actions | Signed-in account |
| Terms / Privacy policy / Legal center | Native legal screens | Existing legal routes |
| Customer settings | Native customers | Completed brand store; paid entitlement controls editing |
| Store profile | Studio settings?tab=store-general | Completed brand store |
| Private design access | Studio settings/collections | Completed brand store |
| Verification | Studio verification | Completed brand store |
| Payouts | Studio settings?tab=billing, resolved to brand bank/settlement settings | Completed brand store; existing role/MFA rules apply |
| Billing & subscriptions | Native subscriptions | Brand workspace; available before store publication |
| Finish store setup | Studio essentials, or brand profile editing when no workspace exists | Incomplete brand |
| Retry setup check | Refetch current actor/workspace status | Failed initial check |
| Sign out / Delete account | Existing native sign-out / deletion flow | Existing account restrictions |

Store profile and content settings formerly pointed directly to Catalogue. Verification and Payouts formerly opened generic Studio instead of the named destination. They now use explicit route keys and bridge classification. Cold opening exchanges the session through an allowlisted Studio entry, then navigates within the authenticated page to the requested Settings surface. Subscription callbacks retain their native destination.

## State and recovery rules

- Unknown or malformed setup status never unlocks ordinary Studio. Initial failure shows retry; known cached completeness can remain during a failed background refresh. Pausing a completed store does not restart setup.
- Status and successful-publication cache updates use the exact actor and active brand. Another account or workspace cannot inherit completeness.
- Browser Studio follows the existing backend brand-account-only handoff contract. Its setup gate does not wrap native Finance/Staff: those retain their existing owner-membership and API permission checks. The four browser-bound Settings links are hidden for accounts that cannot receive a handoff; this does not enable staff browser access or change backend permissions.
- A hidden Studio must not redirect the current tab. Profile-required messages are retained only within the current document/session scope and handled when Studio is focused; scope changes discard them.
- Store bank details and hours are setup prerequisites. Essentials and the wizard stay available to repair an incomplete published store. Being live alone cannot redirect it back into a blocked Studio; only authoritative setup completion exits setup.
- Embedded profile requirements are posted after render and deduplicated for the same requirement. Section containers use existing bare primitives; system bars and safe-area calculations are untouched.

## Verification

Native test:studio-access executes actual Settings handlers, route/bridge functions and the setup gate with explicit auth, loading, error, incomplete, completed and hidden states. test:studio-navigation-feedback exercises the actual WebView admission/startup and profile-message/focus callbacks. Web test:studio-access renders the actual route guard, shared setup hook and setup-remediation screens. These are local tests, not a claim of physical Expo navigation or live endpoint acceptance.

SIT backend acceptance is held while its infrastructure is unavailable. After restoration, use the signed release to verify cold and warm Settings destinations, incomplete setup, bank/hours repair, paused store access, active staff permissions, account switch and background Studio behaviour. No phone connection or live EC2 access is required for the source/fixture checks above.
