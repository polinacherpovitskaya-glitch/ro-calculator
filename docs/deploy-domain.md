# Deploying the calculator domain

The reliable deployment path is:

1. push to `main`;
2. GitHub Actions runs `Deploy GitHub Pages`;
3. the workflow deploys the same commit to GitHub Pages and Vercel;
4. Vercel aliases the production deployment to `calc.recycleobject.ru`;
5. `Live site smoke` checks `https://calc.recycleobject.ru/` and verifies `js/version.json`.

Current production URL:

```text
https://calc.recycleobject.ru/
```

Backup Pages URL:

```text
https://polinacherpovitskaya-glitch.github.io/ro-calculator/
```

## Required GitHub Secrets

The production deploy job needs these repository secrets:

```text
VERCEL_TOKEN
VERCEL_ORG_ID
VERCEL_PROJECT_ID
```

The deploy fails early if any of these secrets are missing, so the domain cannot silently stay on an old version.

## Current DNS

`calc.recycleobject.ru` currently points to Vercel:

```text
calc.recycleobject.ru A 76.76.21.21
```

Keep this while the Vercel production deploy is used.

## Optional: move `calc.recycleobject.ru` to GitHub Pages

Only do this if we intentionally stop using Vercel. At the DNS provider, replace the current Vercel record for `calc.recycleobject.ru` with one CNAME record:

```text
calc.recycleobject.ru CNAME polinacherpovitskaya-glitch.github.io
```

Remove conflicting A records for the same host, especially:

```text
76.76.21.21
```

After DNS has propagated, enable the custom domain in GitHub Pages:

```text
calc.recycleobject.ru
```

Then add a root-level `CNAME` file with:

```text
calc.recycleobject.ru
```

Finally run the smoke manually against the domain:

```sh
gh workflow run "Live site smoke" -f live_url=https://calc.recycleobject.ru/
```

## Why this is necessary

`calc.recycleobject.ru` points to Vercel, so a GitHub Pages deploy alone does not update it. The production workflow now deploys to both hosts and the live smoke checks the real domain, preventing the repository from being on a new version while `calc.recycleobject.ru` still serves an old one.
