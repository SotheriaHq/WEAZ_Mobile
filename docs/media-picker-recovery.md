# Media selection and recovery

Photo-only selection uses the operating system picker without requiring full
gallery access. Camera capture still checks camera permission. iOS original
video selection keeps its required library permission; limited library access
is accepted. See the [Expo SDK 56 picker documentation](https://docs.expo.dev/versions/v56.0.0/sdk/imagepicker/).

Permission requests and picker launches happen only after an explicit action.
Returning from Settings rechecks the existing permission without requesting it
again or opening the picker. The design permission sheet stays available with
a Choose again action, so an empty creation screen is not redirected merely
because access became available.

Cancelled selection keeps existing media. A single native launch can run at a
time. Account/session changes, navigation blur, unmounting, and a newer explicit
choice invalidate delayed results. Profile, banner and message callbacks also
check ownership after compression/upload before updating client state.

Android activity-loss recovery is attempted only on an explicit Choose action.
It requires a stored context for the exact account, flow, durable draft/profile/
thread and source within 15 minutes. A fresh unsaved design or unresolved new
message thread has no durable subject and must be chosen again. Mismatched,
expired and malformed recovery metadata is discarded. No photo payload or
picker URI is persisted by this mechanism.

Web cancellation keeps selected files. Zero available slots reject additional
files; the input resets to allow the same file to be selected again. Pending
timers are cleared on unmount and uploader controls use current callbacks and
disabled state. Browser refresh cannot reconstruct an unsaved File from an
input; only separately saved server drafts can recover uploaded content.

Verification: run `node scripts/test-scoped-media-picker.cjs` in the native app
and the web `filePicker.lifecycle.test.tsx` suite. Physical Android activity
destruction, iOS limited/original-video permissions and Settings-return behavior
still need device regression; automated stubs do not certify OS dialogs.
