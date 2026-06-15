# Contributing

## Development Setup

Use Node.js 20 or newer and install dependencies from the committed lockfile:

```bash
npm ci
npm run dev
```

## Before Opening a Pull Request

Run the same checks used by CI:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Keep changes focused, avoid committing generated files from `out/` or
`release/`, and update documentation when behavior or commands change.

## Reporting Bugs

Include the operating system, MobaNexterm version, reproduction steps, expected
behavior, and relevant logs with credentials and host details removed.
