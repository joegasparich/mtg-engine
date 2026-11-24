import { fileURLToPath } from 'node:url';

export const aliases = Object.fromEntries(
    [['~', 'src'], ['@engine', 'src/engine'], ['@utility', 'src/utility'],
        ['@ui', 'src/ui']]
        .map(([name, directory]) => [name, fileURLToPath(new URL(`./${directory}`, import.meta.url))]),
);
