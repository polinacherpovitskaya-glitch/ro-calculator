import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getIndirectAllocation, type QueryClient } from '../../src/calc/indirect.js';

class FakeClient implements QueryClient {
  constructor(private readonly total: number, private readonly hours: number) {}

  async query(sql: string): Promise<{ rows: Array<Record<string, unknown>> }> {
    if (sql.includes('SUM(amount)')) return { rows: [{ total: this.total }] };
    return { rows: [{ hours: this.hours }] };
  }
}

test('getIndirectAllocation divides monthly indirect costs by calendar hours', async () => {
  const allocation = await getIndirectAllocation(new FakeClient(120000, 160), 2026, 5);
  assert.deepEqual(allocation, { total: 120000, hours: 160, perHour: 750 });
});

test('getIndirectAllocation can use explicit hoursTotal', async () => {
  const allocation = await getIndirectAllocation(new FakeClient(1000, 0), 2026, 5, 25);
  assert.deepEqual(allocation, { total: 1000, hours: 25, perHour: 40 });
});

test('getIndirectAllocation returns zero per hour when no workload exists', async () => {
  const allocation = await getIndirectAllocation(new FakeClient(1000, 0), 2026, 5);
  assert.deepEqual(allocation, { total: 1000, hours: 0, perHour: 0 });
});
