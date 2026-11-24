# MTG Engine

An experimental Magic: The Gathering engine with an Electron/PixiJS interface.

## Development

Use Node 24 (`nvm use`); the minimum supported version is Node 22.17.

Install dependencies with `npm ci`, then run `npm start`.

- `npm run check`: type checking, lint, and all tests.
- `npm test`: tests in watch mode.
- `npm run package`: build a local application bundle.
- `npm run make`: build platform installers.

In VS Code, open Run and Debug and select **Start Electron (main process)**. While it runs, use **Attach Electron renderer** for renderer breakpoints. **Debug tests** runs Vitest under the debugger. The renderer attach configuration requires the debug session to be running.

`npm run start:debug` exposes local debugging ports 9229 and 9223. Normal startup does not enable remote debugging. To load a local Pixi DevTools extension, set `PIXI_DEVTOOLS_PATH` to its directory.

See [AUDIT.md](AUDIT.md) for findings, remaining dependency migrations, and cleanup priorities.
