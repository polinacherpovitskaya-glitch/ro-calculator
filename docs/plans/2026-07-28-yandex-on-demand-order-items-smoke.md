# Plan — Yandex on-demand order items smoke

Spec: `docs/specs/2026-07-28-yandex-on-demand-order-items-smoke.md`

- [ ] Measure the local order-items cache before opening an order.
- [ ] Re-read the cache after `loadOrder()` proves on-demand item loading.
- [ ] Keep the mirror snapshot and platform API assertions unchanged.
- [ ] Bump all four application version anchors and changed script cache busts.
- [ ] Run focused smoke tests and the version invariant.
- [ ] Open, merge, and verify the fix-forward release through Yandex mirror CI.
