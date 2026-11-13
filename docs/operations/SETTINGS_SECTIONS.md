# Settings section layout

All Settings sections use one shared semantic heading: label, at least 12 logical pixels of space, then a flexible 2-pixel decorative divider. Long labels wrap fully. The divider is hidden from assistive technology. Standalone Settings pages and embedded Studio use the same scoped rules.

Section containers are bare: no enclosing rounded outline, decorative background/shadow, or extra rule above/below the label. Web containers opt in with data-settings-section inside wiez-settings-screen; native SettingsSection and SettingsPanel enforce bare styles after caller styles. Buttons, inputs, switches, selectable plans and validation boundaries retain their affordances. The payout-account arrival highlight is purposeful and retained.

Shared policy and payment panels apply the section presentation only in Settings mode. The setup wizard retains its existing presentation. Settings policy content is displayed at full scale so the divider gap and controls keep their logical size. System bars and app-shell safe areas are unchanged.

Verification: web npm run test:settings-sections; native npm run test:settings-sections, npm run check:borders and npm run audit:design-system. The native contract renders the actual shared heading/panel functions and checks the web counterpart when checked out (WIEZ_WEB_SECURITY_ROOT can target a release worktree). It accepts equivalent standard gap-3/h-0.5 utilities or explicit inline dimensions. A standalone native checkout prints a reason when no sibling web source exists.

Before acceptance, check long labels and keyboard/touch controls on desktop, tablet, mobile browser and native. Confirm the last Settings action remains reachable above the home indicator. Local computed-layout checks cover web and embedded-browser rendering; they do not substitute for physical Android/iOS acceptance.
