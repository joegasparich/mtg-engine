# MTG Engine

A Magic: The Gathering engine with a PixiJS browser frontend.

For an overview of the engine and frontend systems, see [Architecture](ARCHITECTURE.md).

## Development

Use Node 24 (`nvm use`); the minimum supported version is Node 22.17.

Install dependencies with `npm ci`, then run `npm start` and open the local URL it prints.

- `npm run check`: type checking, lint, and all tests.
- `npm test`: tests in watch mode.
- `npm run build`: create a production build in `dist/`.
- `npm run preview`: serve the production build locally.

Deploy the contents of `dist/` to any static web host. Card artwork loads from Scryfall and requires an internet connection.

To set breakpoints in VS Code, start the dev server and select **Debug browser app**. **Debug tests** runs Vitest under the debugger.

See [AUDIT.md](AUDIT.md) for historical findings and remaining cleanup priorities.
