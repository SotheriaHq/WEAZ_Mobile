# Native session response ownership

Status: locally implemented, not released or device verified.

The API transport rejects late responses/retries when the account, bound session or authority revision changes. Routine JWT rotation within that session keeps valid in-flight responses. Cleared read caches cannot be refilled by older requests. Refresh writes use the existing auth-epoch and secure-store guard; an old refresh cannot remove a newer refresh's shared promise.

Sign-out captures its outgoing account token before local cleanup and sends server revocation as that account. The matching backend accepts correctly signed expired access tokens only for revoking that same session; ordinary API access still rejects expiry. The explicitly account-bound push-token cleanup flow retains its original credential and never renews as the next account.

Realtime expiry recovery owns one retry timer with capped backoff. Foreground recovery retries a transient failure; disposal or an account change cancels it. Definitive refresh rejection signs out only the still-current session. A delayed rejection cannot sign out a later account. Routine token renewal retains socket listeners.

A Studio phone-verification bridge accepts requests only from trusted Studio origins with valid correlation identifiers and a parent session matching the current native root. It forces a current profile request, allowing the native MFA screen to verify that phone session. It never completes Studio's own challenge or transfers tokens/action proofs. Cancellation/unmount aborts the request and discards late completion/account-switch results. The host returns only a retry hint; the backend checks the phone and child again and requires any separate critical approval.

Run `npm run test:session-response-isolation`; set `WIEZ_WEB_SECURITY_ROOT` to the sibling checkout for paired web/native behavior checks. The tests use real Axios interceptors/adapters with controlled responses, not a phone or real network. Web-specific cookie coordination uses its own local queue and supported same-origin Web Locks. Release/backend integration, actual phone account-switch/logout/push checks and the remaining adaptive-security acceptance gates are still required.
