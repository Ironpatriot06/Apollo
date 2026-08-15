# Apollo Observability Console

Next.js App Router frontend for Apollo developer observability.

## Develop

```bash
npm install
npm run dev
```

Console: http://127.0.0.1:3000

Backend API calls under `/api/*` are rewritten to `http://127.0.0.1:8001`
(`APOLLO_BACKEND_URL` overrides the backend origin).

If `next dev` fails to discover routes due to `EMFILE: too many open files`,
raise the limit (`ulimit -n 10240`) or use the production server:

```bash
npm run build
npm run start
```

## Scripts

```bash
npm run test
npm run typecheck
npm run lint
npm run build
```
