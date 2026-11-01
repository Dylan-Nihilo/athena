import assert from 'node:assert/strict';
import test from 'node:test';
import { apiPricingFor, estimateUsageUsd } from '../src/shared/usage-pricing';
import { groupUsage, summarizeUsage, zeroTokens, type UsageRecord } from '../src/shared/usage';

function record(patch: Partial<UsageRecord> = {}): UsageRecord {
  return {
    id: 'a',
    agent: 'codex',
    startedAt: 1,
    status: 'completed',
    source: 'live',
    model: 'gpt-6.1-sol',
    tokens: {
      ...zeroTokens(),
      inputTokens: 1_000_000,
      outputTokens: 100_000,
      cachedInputTokens: 600_000,
      cacheWriteInputTokens: 100_000,
      reasoningOutputTokens: 40_000,
      totalTokens: 1_100_000,
    },
    observed: true,
    partial: false,
    issues: [],
    ...patch,
  };
}

test('USD basis splits input categories and never adds reasoning or total tokens twice', () => {
  const estimate = estimateUsageUsd(record());
  assert.deepEqual(estimate.tokens, {
    input: 300_000,
    output: 100_000,
    cachedInput: 600_000,
    cacheWriteInput: 100_000,
  });
  assert.deepEqual(estimate.parts, {
    input: 0.6,
    output: 1,
    cachedInput: 0.06,
    cacheWriteInput: 0.25,
  });
  assert(Math.abs(estimate.value! - 1.91) < 1e-12);
  assert.equal(estimate.partial, false);
  assert.equal(
    estimate.pricing?.context,
    'short',
    'A task cumulative total is not a request context length',
  );
});

test('unreported cache writes stay unknown; only priced, observed components contribute', () => {
  const item = record();
  item.tokens.cacheWriteInputTokens = null;
  const estimate = estimateUsageUsd(item);
  assert.equal(
    estimate.parts.input,
    null,
    'Cannot derive ordinary input without cache-write count',
  );
  assert.equal(estimate.parts.cacheWriteInput, null);
  assert.equal(estimate.value, 1.06);
  assert.equal(estimate.partial, true);
  const summary = summarizeUsage([item]);
  assert.equal(summary.cost.partial, 1);
  assert.equal(summary.cost.parts.input.missing, 1);
});

test('unknown/mixed models and missing usage are not a zero-dollar estimate', () => {
  const unknown = estimateUsageUsd(record({ model: 'unknown-model' }));
  assert.equal(unknown.value, null);
  assert.equal(unknown.tokens.input, 300_000, 'Missing pricing must not erase known token counts');
  assert.equal(estimateUsageUsd(record({ models: ['gpt-6.1-sol', 'gpt-6-astra'] })).value, null);
  assert.equal(summarizeUsage([]).cost.value, null);
  const empty = record();
  for (const key of Object.keys(empty.tokens))
    empty.tokens[key as keyof typeof empty.tokens] = null;
  assert.equal(estimateUsageUsd(empty).value, null);
  assert.equal(estimateUsageUsd(record({ tokens: zeroTokens() })).value, 0);
});

test('contradictory cache subtotals cannot produce negative costs or double charges', () => {
  const item = record();
  item.tokens.cachedInputTokens = 950_000;
  const estimate = estimateUsageUsd(item);
  assert.equal(estimate.value, 1, 'Retain independently known output only');
  assert.equal(estimate.parts.input, null);
  assert.equal(estimate.parts.cachedInput, null);
  assert.equal(estimate.parts.cacheWriteInput, null);
  assert.equal(estimate.partial, true);
});

test('saved rate snapshots remain the valuation basis and unsupported price data stays unknown', () => {
  const pricing = apiPricingFor('gpt-6.1-sol')!;
  pricing.version = 'previous-verified-price';
  pricing.verifiedAt = '2026-10-01';
  pricing.rates.input = 3;
  const estimate = estimateUsageUsd(record({ apiPricing: pricing }));
  assert(Math.abs(estimate.value! - 2.21) < 1e-12);
  assert.equal(estimate.pricing?.verifiedAt, '2026-10-01');
  assert.equal(
    estimateUsageUsd(record({ apiPricing: { ...pricing, currency: 'CNY' as 'USD' } })).value,
    null,
  );
  assert.equal(apiPricingFor('__proto__'), undefined);
  assert.equal(apiPricingFor('gpt-6.1-sol-unverified-suffix'), undefined);
});

test('cost totals disclose missing tasks, preserve partial values, and sort groups by USD', () => {
  const sol = record();
  const astra = record({ id: 'b', model: 'gpt-6-astra', partial: true });
  const unknown = record({ id: 'c', model: undefined });
  const summary = summarizeUsage([sol, astra, unknown]);
  assert.equal(summary.cost.known, 2);
  assert.equal(summary.cost.missing, 1);
  assert.equal(summary.cost.partial, 1);
  assert(Math.abs(summary.cost.value! - 11.76) < 1e-12);
  assert.deepEqual(
    groupUsage([sol, unknown, astra], 'model').map((g) => g.key),
    ['gpt-6-astra', 'gpt-6.1-sol', '模型未知'],
  );
});
