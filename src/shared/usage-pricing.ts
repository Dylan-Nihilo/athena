import type { UsageAmount, UsageRecord } from './usage';

export const API_PRICING_VERSION = 'openai-standard-2026-11-01';
export const API_PRICING_SOURCE = 'https://developers.openai.com/api/docs/pricing';
export const costParts = ['input', 'output', 'cachedInput', 'cacheWriteInput'] as const;
export type CostPart = (typeof costParts)[number];

export interface ApiPricing {
  version: string;
  model: string;
  currency: 'USD';
  tokensPerUnit: 1_000_000;
  verifiedAt: string;
  sourceUrl: string;
  tier: 'standard';
  context: 'short';
  cacheWriteRetention: '30m';
  rates: Record<CostPart, number>;
}

// Official Standard, <=272K input/request, 30m cache-write rates, checked 2026-11-01.
// This is a comparison basis, not an inference of a Codex subscription bill or speed tier.
const rates: Record<string, ApiPricing['rates']> = {
  'gpt-6-astra': { input: 10, output: 50, cachedInput: 1, cacheWriteInput: 12.5 },
  'gpt-6.1-sol': { input: 2, output: 10, cachedInput: 0.1, cacheWriteInput: 2.5 },
  'gpt-6.1-terra': { input: 1, output: 5, cachedInput: 0.05, cacheWriteInput: 1.25 },
  'gpt-6-sol': { input: 2, output: 10, cachedInput: 0.2, cacheWriteInput: 2.5 },
  'gpt-6-luna': { input: 0.1, output: 0.5, cachedInput: 0.01, cacheWriteInput: 0.125 },
};

export function apiPricingFor(model?: string): ApiPricing | undefined {
  if (!model || !Object.hasOwn(rates, model)) return;
  return {
    version: API_PRICING_VERSION,
    model,
    currency: 'USD',
    tokensPerUnit: 1_000_000,
    verifiedAt: '2026-11-01',
    sourceUrl: API_PRICING_SOURCE,
    tier: 'standard',
    context: 'short',
    cacheWriteRetention: '30m',
    rates: { ...rates[model] },
  };
}

export function isApiPricing(value: unknown, model?: string): value is ApiPricing {
  if (!value || typeof value !== 'object') return false;
  const price = value as ApiPricing;
  return Boolean(
    typeof price.version === 'string' &&
    price.version.length > 0 &&
    typeof price.model === 'string' &&
    price.model.length > 0 &&
    price.model === model &&
    price.currency === 'USD' &&
    price.tokensPerUnit === 1_000_000 &&
    typeof price.verifiedAt === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(price.verifiedAt) &&
    price.sourceUrl === API_PRICING_SOURCE &&
    price.tier === 'standard' &&
    price.context === 'short' &&
    price.cacheWriteRetention === '30m' &&
    price.rates &&
    costParts.every(
      (key) =>
        typeof price.rates[key] === 'number' &&
        Number.isFinite(price.rates[key]) &&
        price.rates[key] >= 0,
    ),
  );
}

export interface UsageCost {
  value: number | null;
  parts: Record<CostPart, number | null>;
  tokens: Record<CostPart, number | null>;
  partial: boolean;
  pricing?: ApiPricing;
}

export function estimateUsageUsd(record: UsageRecord): UsageCost {
  const tokens = { input: null, output: null, cachedInput: null, cacheWriteInput: null } as Record<
    CostPart,
    number | null
  >;
  const parts = { ...tokens };
  const candidate = record.apiPricing ?? apiPricingFor(record.model);
  const count = (value: number | null) =>
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
  const input = count(record.tokens.inputTokens);
  const cached = count(record.tokens.cachedInputTokens);
  const written = count(record.tokens.cacheWriteInputTokens);
  tokens.output = count(record.tokens.outputTokens);
  const invalidInput =
    input !== null &&
    ((cached !== null && cached > input) ||
      (written !== null && written > input) ||
      (cached !== null && written !== null && cached + written > input));
  if (!invalidInput) {
    tokens.cachedInput = cached;
    tokens.cacheWriteInput = written;
    if (input !== null && cached !== null && written !== null)
      tokens.input = input - cached - written;
  }
  if (record.models?.length || !isApiPricing(candidate, record.model))
    return { value: null, parts, tokens, partial: true };
  for (const key of costParts) {
    if (tokens[key] === null) continue;
    const value = (tokens[key]! * candidate.rates[key]) / candidate.tokensPerUnit;
    if (Number.isFinite(value)) parts[key] = value;
  }
  const values = costParts.map((key) => parts[key]).filter((value) => value !== null);
  return {
    value: values.length ? values.reduce((sum, value) => sum + value, 0) : null,
    parts,
    tokens,
    partial:
      !record.observed ||
      record.partial ||
      record.status === 'running' ||
      values.length < costParts.length,
    pricing: candidate,
  };
}

export interface UsageCostSummary extends UsageAmount {
  partial: number;
  parts: Record<CostPart, UsageAmount>;
  tokens: Record<CostPart, UsageAmount>;
  pricing: ApiPricing[];
}

export function summarizeUsageCost(records: UsageRecord[]): UsageCostSummary {
  const estimates = records.map(estimateUsageUsd);
  const sum = (values: Array<number | null>): UsageAmount => {
    const known = values.filter((value) => value !== null);
    return {
      value: known.length ? known.reduce((total, value) => total + value, 0) : null,
      known: known.length,
      missing: values.length - known.length,
    };
  };
  return {
    ...sum(estimates.map((estimate) => estimate.value)),
    partial: estimates.filter((estimate) => estimate.value !== null && estimate.partial).length,
    parts: Object.fromEntries(
      costParts.map((key) => [key, sum(estimates.map((e) => e.parts[key]))]),
    ) as UsageCostSummary['parts'],
    tokens: Object.fromEntries(
      costParts.map((key) => [key, sum(estimates.map((e) => e.tokens[key]))]),
    ) as UsageCostSummary['tokens'],
    pricing: [
      ...new Map(
        estimates.flatMap((e) =>
          e.pricing ? [[`${e.pricing.version}/${e.pricing.model}`, e.pricing] as const] : [],
        ),
      ).values(),
    ],
  };
}
