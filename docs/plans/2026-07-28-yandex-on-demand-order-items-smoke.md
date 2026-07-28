# Plan — Yandex on-demand order items smoke

Spec: `docs/specs/2026-07-28-yandex-on-demand-order-items-smoke.md`

- [x] Measure the local order-items cache before opening an order.
- [x] Re-read the cache after `loadOrder()` proves on-demand item loading.
- [x] Keep the mirror snapshot and platform API assertions unchanged.
- [x] Bump all four application version anchors and changed script cache busts.
- [x] Run focused smoke tests and the version invariant.
- [ ] Open, merge, and verify the fix-forward release through Yandex mirror CI.
