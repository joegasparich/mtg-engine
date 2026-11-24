# Revival audit

The Electron packaging and IPC work below describe the previous desktop version. The app now runs in the browser, serves a static Vite build, and loads card art directly from Scryfall.

## Completed

- Upgraded Electron to 45, Forge to 8, Vite to 8, Vitest to 4, ESLint to 10, UUID to 14, and Electron fuses to 2.
- Upgraded TypeScript to 6, the newest major supported by the current typescript-eslint peer requirements. TypeScript 7 remains deferred until that tooling supports it. Kept existing non-strict checking behavior explicit; noImplicitAny remains enabled.
- Removed unused bundler, import-linting, native-unpack, and ts-node dependencies. Migrated ESLint to flat configuration, centralized aliases, and organized imports.
- Migrated Forge entry and preload paths to `.cjs` and configuration files to `.mts`. Converted the mutable combat namespace to a static class for Vite 8 compatibility without changing its rules.
- Restricted image IPC to the main frame of an application window and downloads to HTTPS cards.scryfall.io URLs. Rejected redirects, credentials and unsupported content types; added a 15-second timeout, 10 MiB response limit, 32 MiB cache budget and eight concurrent-download limit. Failed requests are retryable.
- Prevented renderer navigation and new windows; made isolation and renderer sandbox settings explicit.
- Added Scryfall HTTP error handling, encoded identifiers and request timeouts.
- Fixed failed texture loads assigning undefined and prevented applying downloaded textures to destroyed sprites.
- Fixed button handler replacement retaining the old listener and context menus installing stale delayed listeners after removal.
- Added CI checks and packaging, Node 24 selection, VS Code launch configurations, and regression tests for network handling.

## Verification

- npm audit: zero vulnerabilities after upgrades.
- TypeScript passes; all 45 tests in 12 files pass.
- ESLint: zero errors, 57 warnings, primarily unused prototype parameters and broad any types.
- macOS arm64 application packaging passes with Electron 45 and Vite 8.
- Interactive gameplay and Windows/Linux installers are not verified.

## Remaining gameplay work (outside this cleanup)

- Combat damage overwrites previous damage per blocker and omits unblocked player damage. Define multi-blocker ordering and add coverage.
- Stack resolution does not handle artifact, enchantment and planeswalker permanents.
- Timing rules currently restrict instants to main phases. Add priority, summoning sickness and broader state-based action coverage.

## Further cleanup

Replace broad any types in ability data and event plumbing with explicit types; then enable strict null checking incrementally. Remove obsolete commented prototype code when gameplay behavior is formalized.
