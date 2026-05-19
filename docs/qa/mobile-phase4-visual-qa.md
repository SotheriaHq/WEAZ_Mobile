# Mobile Phase 4 Visual QA

## Current acceptance mode

Phase 4 is accepted for continued development using Expo Web in mobile responsive viewport.

This acceptance is a temporary development gate. It confirms that the Phase 4 mobile UI can render through Expo Web at phone and tablet breakpoints without the known Babel cache, local dependency alias, or FlatList viewability runtime blockers.

## Deferred native QA

Native Android/iOS hardware QA is deferred. This means picker behavior, platform-specific safe areas, native scrolling, native image behavior, and real low-end device performance still require later validation.

## Viewports checked

- 390 x 844
- 360 x 740
- 768 x 1024
- 1024 x 768

## Web-responsive observations

- Runway/feed mounted without the FlatList viewability runtime crash.
- The offline feed state remained stable in phone viewports.
- Search rendered immediately with the input visible and usable.
- Login rendered with in-field email copy and the branded Google button.
- Catalog/profile placeholder rendered in phone and tablet viewports without right-edge cutoff.
- Messages rendered with a right-aligned search icon and no bordered search wrapper.

## Required before production release

At least one real Android Expo Go pass and one tablet/iPad-class pass should be completed before production confidence.

## Known deferred checks

- Native image picker behavior
- Permission denied flow on device
- Real scroll performance
- Safe-area behavior on physical devices
- Auth/session behavior on native device
- Authenticated Runway media and detail-sheet behavior with live feed data
- Authenticated Market card data with live imagery
- Profile catalog owner/viewer actions with real content
- ThreadlySheet interaction paths that require authenticated chooser flows
