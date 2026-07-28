# Yandex on-demand order items smoke

## Problem

The orders performance release stopped downloading every order item before the
orders list renders. This is intentional: the current Yandex snapshot contains
more than 1,000 order items and its uncompressed shard is about 16 MB.

`tests/yandex-mirror-smoke.mjs` still reads the local `orderItems` cache
immediately after `loadOrders()` and expects it to be populated. That assertion
describes the old eager-loading behavior and fails even though:

- the mirror snapshot contains order items;
- the Yandex platform API returns orders;
- opening an order loads its items on demand;
- no production data is missing.

## Goal

Make the Yandex mirror smoke validate the new on-demand contract:

1. `loadOrders()` can render the order list without the full order-items cache.
2. Loading an eligible order through `loadOrder()` returns its items.
3. The returned items are cached locally for the opened order.
4. Existing snapshot, API-host, warehouse-demand, shipment, and Supabase-block
   checks remain intact.

## Non-goals

- Do not restore the 16 MB eager order-items download.
- Do not remove or rewrite the Yandex bootstrap snapshot.
- Do not change production order or warehouse data.
- Do not weaken the requirement that the mirror can load real order-item data.

## Rollback

This release changes only the smoke timing/measurement and version anchors.
The previous test remains available in Git history, and all database and object
storage snapshots remain untouched.
