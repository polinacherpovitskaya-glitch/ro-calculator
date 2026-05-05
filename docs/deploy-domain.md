# Deploying the calculator domain

The reliable deployment path is:

1. push to `main`;
2. GitHub Actions runs `Deploy GitHub Pages`;
3. GitHub Pages serves the current commit;
4. `Live site smoke` checks the deployed site version from `js/version.json`.

Current canonical Pages URL:

```text
https://polinacherpovitskaya-glitch.github.io/ro-calculator/
```

## Move `calc.recycleobject.ru` to GitHub Pages

At the DNS provider, replace the current Vercel record for `calc.recycleobject.ru`.

Use one CNAME record:

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

If that passes, update the workflow default from the GitHub Pages URL to `https://calc.recycleobject.ru/`.

## Why this is necessary

`calc.recycleobject.ru` currently points to Vercel, so a GitHub Pages deploy does not update it. That is why the repository could be on `v331` while `calc.recycleobject.ru` was still serving `v329`.
