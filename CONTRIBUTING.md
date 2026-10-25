# Contributing to ai visibility

Thanks for helping. Bug reports, fixes and new AI agent or referrer entries are all welcome.

## Before you start

- **Bugs:** open an issue with steps to reproduce, what you expected and what happened.
- **Security issues:** don't open an issue. See [SECURITY.md](SECURITY.md).
- **Bigger changes:** open an issue first so the approach is agreed before you write the code.

## Running it

```bash
npm install
```

```bash
npm run dev
```

Without API keys every engine runs in simulated mode, which is enough for almost every change. Keep it that way while developing: start the server with blank `*_API_KEY` variables so nothing spends money. [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) has the code map, the API and the metric definitions.

## Pull requests

- `npm run typecheck` and `npm run build` pass.
- Every feature still works in simulated mode.
- Match the style of the code around your change: small modules, named exports, short comments only where the logic isn't obvious.
- User-facing text goes in `web/src/content/copy.ts`; [brand/COPY.md](brand/COPY.md) describes the voice.
- One change per pull request, with a short description of what it does and why.

## Contribution terms

ai visibility is licensed under AGPL-3.0-only, and Analitik İşler also offers it as a hosted service. By opening a pull request you agree that:

1. Your contribution is your own work, or you have the right to submit it.
2. It is licensed under AGPL-3.0-only, like the rest of the project.
3. You also grant Analitik İşler a perpetual, worldwide, non-exclusive, royalty-free, irrevocable license to use, modify, sublicense and distribute your contribution under other terms, including in the hosted service and in commercial licenses.

You keep the copyright to your contribution.
