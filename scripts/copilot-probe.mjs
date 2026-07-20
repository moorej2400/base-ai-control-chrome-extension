/**
 * Offline GitHub Copilot debug harness.
 *
 * Authenticates the same way the extension does (device flow) and calls the
 * real Copilot API from Node so model/grouping/chat behavior can be inspected
 * and iterated on without the browser.
 *
 * Usage:
 *   node scripts/copilot-probe.mjs login            # authorize once (saves token)
 *   node scripts/copilot-probe.mjs models           # dump /models (raw + grouped)
 *   node scripts/copilot-probe.mjs models --grep opus
 *   node scripts/copilot-probe.mjs chat "hello" [modelId]
 *   node scripts/copilot-probe.mjs cache [modelId]  # compare cached token reporting
 *
 * The gho token is cached in scripts/.copilot-token.json (gitignored). You can
 * also paste an existing token there as {"gho":"gho_..."} to skip device flow.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const CLIENT_ID = 'Iv1.b507a08c87ecfe98';
const EDITOR_HEADERS = {
  'Editor-Version': 'vscode/1.99.0',
  'Editor-Plugin-Version': 'copilot-chat/0.26.7',
  'Copilot-Integration-Id': 'vscode-chat',
  'X-GitHub-Api-Version': '2026-06-01',
};

const here = dirname(fileURLToPath(import.meta.url));
const TOKEN_FILE = join(here, '.copilot-token.json');
const MODELS_DUMP = join(here, '.copilot-models.json');

// ---- auth -----------------------------------------------------------------

function readToken() {
  if (process.env.COPILOT_GHO) return process.env.COPILOT_GHO;
  if (existsSync(TOKEN_FILE)) {
    try {
      return JSON.parse(readFileSync(TOKEN_FILE, 'utf8')).gho;
    } catch {
      return null;
    }
  }
  return null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function deviceLogin() {
  const codeRes = await fetch('https://github.com/login/device/code', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: CLIENT_ID, scope: 'read:user' }),
  });
  const code = await codeRes.json();
  console.log('\n=== GitHub authorization required ===');
  console.log(`1. Open: ${code.verification_uri}`);
  console.log(`2. Enter code: ${code.user_code}`);
  console.log('Waiting for you to authorize…\n');

  const deadline = Date.now() + (code.expires_in ?? 900) * 1000;
  let interval = (code.interval ?? 5) * 1000;
  while (Date.now() < deadline) {
    await sleep(interval);
    const tokRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        device_code: code.device_code,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }),
    });
    const tok = await tokRes.json();
    if (tok.access_token) {
      writeFileSync(TOKEN_FILE, JSON.stringify({ gho: tok.access_token }, null, 2));
      console.log('✓ Authorized. Token saved to scripts/.copilot-token.json\n');
      return tok.access_token;
    }
    if (tok.error === 'slow_down') interval += 5000;
    else if (tok.error && tok.error !== 'authorization_pending') {
      throw new Error(`Device flow failed: ${tok.error_description ?? tok.error}`);
    }
  }
  throw new Error('Device code expired before authorization.');
}

async function getSession(gho) {
  const res = await fetch('https://api.github.com/copilot_internal/v2/token', {
    headers: { Authorization: `token ${gho}`, Accept: 'application/json', ...EDITOR_HEADERS },
  });
  if (!res.ok) throw new Error(`Token exchange failed (${res.status})`);
  const data = await res.json();
  return { token: data.token, apiBase: data.endpoints?.api ?? 'https://api.githubcopilot.com' };
}

async function ensureSession() {
  let gho = readToken();
  if (!gho) gho = await deviceLogin();
  try {
    return await getSession(gho);
  } catch (e) {
    console.log(`(stored token rejected: ${e.message}) — re-authorizing…`);
    gho = await deviceLogin();
    return getSession(gho);
  }
}

// ---- grouping (mirrors lib/providers/copilot/models.ts + model-groups.ts) ---

function parseModelEntries(entries) {
  const familyAliases = buildContextFamilyAliases(entries);
  const seen = new Set();
  const out = [];
  for (const e of entries) {
    if (!isPickerChatEntry(e)) continue;
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    out.push(...toModelInfos(e, familyAliases));
  }
  return out;
}

function toModelInfos(e, familyAliases) {
  const caps = e.capabilities;
  const base = {
    id: e.id,
    label: e.name ?? e.id,
    family: familyAliases.get(rawFamily(e)) ?? rawFamily(e),
    maxOutputTokens: caps?.limits?.max_output_tokens,
    supportedEndpoints: e.supported_endpoints,
    supportsToolCalls: caps?.supports?.tool_calls ?? false,
  };
  const tiered = contextTierVariants(e);
  if (tiered.length === 0) {
    return [
      {
        ...base,
        contextWindow: caps?.limits?.max_context_window_tokens,
        price: modelPrice(e),
      },
    ];
  }
  return tiered.map((variant) => ({
    ...base,
    variantId: `${e.id}#${variant.contextTier}`,
    contextTier: variant.contextTier,
    contextWindow: variant.contextWindow,
    price: modelPrice(e, variant.contextTier),
  }));
}

function contextTierVariants(e) {
  const prices = e.billing?.token_prices;
  if (!prices || !('default' in prices)) return [];
  const maxOutputTokens = e.capabilities?.limits?.max_output_tokens ?? 0;
  return ['default', 'long_context']
    .map((contextTier) => {
      const promptBudget = prices[contextTier]?.context_max;
      return promptBudget
        ? { contextTier, contextWindow: promptBudget + maxOutputTokens }
        : null;
    })
    .filter(Boolean);
}

function isPickerChatEntry(entry) {
  const caps = entry.capabilities;
  if (caps?.type && caps.type !== 'chat') return false;
  return entry.model_picker_enabled !== false;
}

function rawFamily(entry) {
  return entry.capabilities?.family ?? entry.id.replace(/-1m(-internal)?$/i, '');
}

function buildContextFamilyAliases(entries) {
  const pickerModels = entries.filter(isPickerChatEntry).map(toPickerChatModel);
  const alias = new Map();
  for (const model of pickerModels) {
    // Keep this heuristic in sync with lib/providers/copilot/models.ts.
    const base = findContextVariantBase(model, pickerModels);
    if (base) alias.set(model.rawFamily, base.rawFamily);
  }
  return alias;
}

function toPickerChatModel(entry) {
  const caps = entry.capabilities;
  const family = rawFamily(entry);
  return {
    rawFamily: family,
    vendor: entry.vendor,
    contextWindow: caps?.limits?.max_context_window_tokens,
    maxOutputTokens: caps?.limits?.max_output_tokens,
    supportsToolCalls: caps?.supports?.tool_calls ?? false,
    supportsVision: caps?.supports?.vision ?? false,
    hasContextVariantMarker: hasContextVariantMarker(family, entry.id, entry.name),
  };
}

function findContextVariantBase(model, pickerModels) {
  if (!model.hasContextVariantMarker) return undefined;
  const family = model.rawFamily.toLowerCase();
  return pickerModels
    .filter((candidate) => candidate.rawFamily !== model.rawFamily)
    .filter((candidate) => hasFamilyVariantSuffix(family, candidate.rawFamily.toLowerCase()))
    .filter((candidate) => hasMatchingContextVariantShape(model, candidate))
    .sort((a, b) => b.rawFamily.length - a.rawFamily.length)[0];
}

function hasFamilyVariantSuffix(family, baseFamily) {
  if (!family.startsWith(baseFamily)) return false;
  return /^[-_.\s(]/.test(family.slice(baseFamily.length));
}

function hasContextVariantMarker(...parts) {
  return parts.some((part) => {
    if (!part) return false;
    return /(^|[-_.\s(])(?:1m|long|context)(?:$|[-_.\s)])/i.test(part);
  });
}

function hasMatchingContextVariantShape(model, candidate) {
  if (model.vendor && candidate.vendor && model.vendor !== candidate.vendor) return false;
  if (!model.contextWindow || !candidate.contextWindow) return false;
  if (model.contextWindow === candidate.contextWindow) return false;
  if (
    model.maxOutputTokens &&
    candidate.maxOutputTokens &&
    model.maxOutputTokens !== candidate.maxOutputTokens
  ) {
    return false;
  }
  if (model.supportsToolCalls !== candidate.supportsToolCalls) return false;
  if (model.supportsVision !== candidate.supportsVision) return false;
  return true;
}

function modelPrice(e, tier) {
  const prices = e.billing?.token_prices;
  if (!prices) return undefined;
  const price = 'default' in prices ? prices[tier ?? 'default'] : prices;
  if (!price) return undefined;
  return {
    batchSize: prices.batch_size,
    inputPrice: price.input_price,
    outputPrice: price.output_price,
    cacheReadPrice: price.cache_price,
    cacheWritePrice: price.cache_write_price,
  };
}

function groupModels(models) {
  const byFamily = new Map();
  for (const m of models) {
    const arr = byFamily.get(m.family) ?? [];
    arr.push(m);
    byFamily.set(m.family, arr);
  }
  const groups = [];
  for (const [family, variants] of byFamily) {
    variants.sort((a, b) => (a.contextWindow ?? 0) - (b.contextWindow ?? 0));
    const labelVariant = variants.find((variant) => variant.id === family) ?? variants[0];
    groups.push({ family, label: labelVariant.label, variants });
  }
  return groups.sort((a, b) => a.label.localeCompare(b.label));
}

const fmt = (t) =>
  !t ? '—' : t >= 1e6 ? `${Number.isInteger(t / 1e6) ? t / 1e6 : (t / 1e6).toFixed(1)}M` : t >= 1e3 ? `${Math.round(t / 1e3)}K` : `${t}`;

const fmtRate = (price) => {
  if (price?.inputPrice === undefined && price?.outputPrice === undefined) return 'rates unavailable';
  const unit = (v) =>
    v === undefined ? '—' : `$${Math.round(v / 100).toLocaleString('en-US')}`;
  return `${unit(price.inputPrice)} / ${unit(price.outputPrice)}`;
};

const cacheControl = { type: 'ephemeral' };

// ---- commands -------------------------------------------------------------

async function cmdModels(grep) {
  const { token, apiBase } = await ensureSession();
  const res = await fetch(`${apiBase}/models`, {
    headers: { Authorization: `Bearer ${token}`, ...EDITOR_HEADERS },
  });
  if (!res.ok) throw new Error(`/models failed (${res.status})`);
  const data = await res.json();
  const entries = data.data ?? [];
  writeFileSync(MODELS_DUMP, JSON.stringify(data, null, 2));

  let rows = entries.map((e) => ({
    id: e.id,
    family: e.capabilities?.family,
    ctx: fmt(e.capabilities?.limits?.max_context_window_tokens),
    endpoints: (e.supported_endpoints ?? []).join(', '),
    picker: e.model_picker_enabled,
    type: e.capabilities?.type,
    tools: e.capabilities?.supports?.tool_calls,
  }));
  if (grep) rows = rows.filter((r) => `${r.id} ${r.family}`.toLowerCase().includes(grep));

  console.log(`\nRAW ENTRIES (${rows.length}/${entries.length})  full dump → scripts/.copilot-models.json`);
  console.table(rows);

  let groups = groupModels(parseModelEntries(entries));
  if (grep) groups = groups.filter((g) => `${g.family} ${g.label}`.toLowerCase().includes(grep));
  console.log('\nGROUPED (what the settings page shows):');
  for (const g of groups) {
    const opts = g.variants
      .map((v) => `${fmt(v.contextWindow)} (${fmtRate(v.price)})`)
      .join(', ');
    console.log(`  ${g.label}  [${g.variants.length > 1 ? 'dropdown' : 'fixed'}]  → ${opts}`);
  }
  console.log('');
}

async function cmdChat(prompt, model) {
  const { token, apiBase } = await ensureSession();
  const modelsRes = await fetch(`${apiBase}/models`, {
    headers: { Authorization: `Bearer ${token}`, ...EDITOR_HEADERS },
  });
  if (!modelsRes.ok) throw new Error(`/models failed (${modelsRes.status})`);
  const modelsData = await modelsRes.json();
  const modelInfo = (modelsData.data ?? []).find((e) => e.id === model);
  const endpoints = modelInfo?.supported_endpoints ?? [];
  if (endpoints.includes('/responses') && !endpoints.includes('/chat/completions')) {
    const res = await fetch(`${apiBase}/responses`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...EDITOR_HEADERS },
      body: JSON.stringify({
        model: model ?? 'gpt-4o',
        input: prompt,
      }),
    });
    if (!res.ok) throw new Error(`/responses failed (${res.status}): ${await res.text()}`);
    const data = await res.json();
    const text = (data.output ?? [])
      .filter((item) => item.type === 'message')
      .flatMap((item) => item.content ?? [])
      .filter((part) => part.type === 'output_text')
      .map((part) => part.text ?? '')
      .join('');
    console.log(text || JSON.stringify(data, null, 2));
    return;
  }

  const res = await fetch(`${apiBase}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...EDITOR_HEADERS },
    body: JSON.stringify({
      model: model ?? 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`/chat failed (${res.status}): ${await res.text()}`);
  const data = await res.json();
  console.log(data.choices?.[0]?.message?.content ?? JSON.stringify(data, null, 2));
}

async function cmdCache(model = 'gpt-4o') {
  const { token, apiBase } = await ensureSession();
  const stable = [
    'Stable cache probe context.',
    'Project: jira-ai-chrome-extension.',
    'The next request repeats this exact prefix to test Copilot cached token reporting.',
    'Cache probe marker: 2026-06-18-copilot-cache-v1.',
    ...Array.from(
      { length: 90 },
      (_, i) =>
        `Stable line ${String(i + 1).padStart(2, '0')}: preserve this repeated context exactly so provider prompt caching has enough prefix tokens to consider.`,
    ),
  ].join('\n');

  async function once(label, withControl) {
    const messages = [
      {
        role: 'system',
        content: 'You are a terse probe responder.',
        ...(withControl ? { copilot_cache_control: cacheControl } : {}),
      },
      {
        role: 'user',
        content: stable,
        ...(withControl ? { copilot_cache_control: cacheControl } : {}),
      },
      { role: 'user', content: `Reply with exactly: ${label}` },
    ];
    const res = await fetch(`${apiBase}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...EDITOR_HEADERS },
      body: JSON.stringify({ model, messages }),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`/chat ${label} failed (${res.status}): ${text}`);
    const data = JSON.parse(text);
    const usage = data.usage ?? {};
    return {
      label,
      status: res.status,
      promptTokens: usage.prompt_tokens,
      cachedTokens: usage.prompt_tokens_details?.cached_tokens,
      output: data.choices?.[0]?.message?.content,
    };
  }

  console.log(`\nCache probe model: ${model}`);
  const rows = [];
  rows.push(await once('baseline-1', false));
  rows.push(await once('baseline-2', false));
  rows.push(await once('control-1', true));
  rows.push(await once('control-2', true));
  console.table(rows);
  console.log('If control-2 reports cachedTokens > 0, Copilot accepted the cache marker.');
}

// ---- main -----------------------------------------------------------------

const [cmd, ...rest] = process.argv.slice(2);
const grepIdx = rest.indexOf('--grep');
const grep = grepIdx >= 0 ? rest[grepIdx + 1]?.toLowerCase() : undefined;

try {
  if (cmd === 'login') await ensureSession().then(() => console.log('✓ Session OK'));
  else if (cmd === 'chat') await cmdChat(rest[0], rest[1]);
  else if (cmd === 'cache') await cmdCache(rest[0]);
  else await cmdModels(grep); // default + 'models'
} catch (e) {
  console.error('ERROR:', e.message);
  process.exit(1);
}
