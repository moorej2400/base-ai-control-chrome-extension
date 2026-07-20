import { useEffect, useMemo, useState } from 'react';
import type { Nav } from '../App';
import type { ModelInfo } from '@/lib/providers/types';
import { CustomProvider } from '@/lib/providers/custom/provider';
import { syncCustomProviders } from '@/lib/providers/registry';
import {
  PROVIDER_TEMPLATES,
  getCustomProvider,
  newCustomProviderId,
  originPattern,
  removeCustomProvider,
  saveCustomProvider,
  type CustomProviderConfig,
} from '@/lib/providers/custom/config';
import Icon from '../ui/Icon';
import { SectionLabel, Group, Row } from '../ui/SettingsGroup';
import ScreenHeader from '../components/ScreenHeader';

/**
 * Configure a custom, OpenAI-compatible provider (Ollama / OpenAI / any
 * endpoint). Real: persists to storage, requests the host permission the
 * endpoint needs, tests the connection against the live `/models` list, and
 * registers the provider so it appears in the model picker. Copilot uses its
 * own device-auth screen and never lands here.
 */
export default function ProviderConfigScreen({
  nav,
  providerId,
}: {
  nav: Nav;
  providerId: string | null;
}) {
  const isNew = !providerId;
  const [draft, setDraft] = useState<CustomProviderConfig | null>(null);
  const [templateKey, setTemplateKey] = useState('custom');
  const [showKey, setShowKey] = useState(false);
  const [granted, setGranted] = useState<boolean | null>(null);
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<{ ok: boolean; detail: string } | null>(null);
  const [models, setModels] = useState<ModelInfo[] | null>(null);
  const [saving, setSaving] = useState(false);

  // Load an existing provider, or start a fresh draft.
  useEffect(() => {
    if (providerId) {
      void getCustomProvider(providerId).then((cfg) => cfg && setDraft(cfg));
    } else {
      setDraft({
        id: newCustomProviderId(),
        label: '',
        baseUrl: '',
        apiKey: '',
        createdAt: Date.now(),
      });
    }
  }, [providerId]);

  const origin = useMemo(
    () => (draft ? originPattern(draft.baseUrl) : null),
    [draft],
  );

  // Reflect whether the endpoint's host permission is already granted.
  useEffect(() => {
    if (!origin) {
      setGranted(null);
      return;
    }
    void chrome.permissions.contains({ origins: [origin] }).then(setGranted);
  }, [origin]);

  if (!draft) {
    return (
      <div className="screen">
        <ScreenHeader title="Provider" onBack={nav.backToSettings} />
        <div className="empty-state">
          <p>Provider not found.</p>
        </div>
      </div>
    );
  }

  const patch = (p: Partial<CustomProviderConfig>) =>
    setDraft((d) => (d ? { ...d, ...p } : d));

  const applyTemplate = (key: string) => {
    setTemplateKey(key);
    const t = PROVIDER_TEMPLATES.find((x) => x.key === key);
    if (t) patch({ label: draft.label || t.label, baseUrl: t.baseUrl });
    setTest(null);
    setModels(null);
  };

  const grantAccess = async () => {
    if (!origin) return;
    await chrome.permissions.request({ origins: [origin] });
    setGranted(await chrome.permissions.contains({ origins: [origin] }));
  };

  const runTest = async () => {
    setTesting(true);
    setTest(null);
    // Ensure we have host access before hitting the endpoint, otherwise the
    // fetch fails with an opaque network error.
    if (origin && !(await chrome.permissions.contains({ origins: [origin] }))) {
      await grantAccess();
    }
    const probe = new CustomProvider(draft);
    const result = await probe.testConnection();
    setTest(result);
    if (result.ok) {
      setModels(await probe.listModels().catch(() => []));
    }
    setTesting(false);
  };

  const canSave = draft.label.trim().length > 0 && draft.baseUrl.trim().length > 0;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    if (origin && !(await chrome.permissions.contains({ origins: [origin] }))) {
      await grantAccess();
    }
    await saveCustomProvider({
      ...draft,
      label: draft.label.trim(),
      baseUrl: draft.baseUrl.trim(),
      apiKey: draft.apiKey?.trim() || undefined,
    });
    await syncCustomProviders();
    setSaving(false);
    nav.backToSettings();
  };

  const remove = async () => {
    if (providerId) {
      await removeCustomProvider(providerId);
      await syncCustomProviders();
    }
    nav.backToSettings();
  };

  const template = PROVIDER_TEMPLATES.find((t) => t.key === templateKey);

  return (
    <div className="screen">
      <ScreenHeader
        title={isNew ? 'Add provider' : draft.label || 'Provider'}
        onBack={nav.backToSettings}
        right={
          <button
            className="btn btn-primary btn-sm"
            disabled={!canSave || saving}
            onClick={() => void save()}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        }
      />
      <div className="screen-scroll jc-scroll" style={{ padding: '4px 14px 18px' }}>
        {isNew && (
          <>
            <SectionLabel flush>PROVIDER TYPE</SectionLabel>
            <div className="chips" style={{ marginBottom: 4 }}>
              {PROVIDER_TEMPLATES.map((t) => (
                <button
                  key={t.key}
                  className="chip-add"
                  data-on={templateKey === t.key}
                  style={
                    templateKey === t.key
                      ? { borderColor: 'var(--accent)', color: 'var(--accent-text)', background: 'var(--accent-tint)' }
                      : undefined
                  }
                  onClick={() => applyTemplate(t.key)}
                >
                  {t.label}
                </button>
              ))}
            </div>
            {template && (
              <div className="screen-subtext" style={{ padding: '2px 2px 0' }}>
                {template.hint}
              </div>
            )}
          </>
        )}

        <SectionLabel>DETAILS</SectionLabel>
        <label className="field-label">Name</label>
        <input
          className="input"
          placeholder="e.g. Local Ollama"
          value={draft.label}
          onChange={(e) => patch({ label: e.target.value })}
          style={{ marginBottom: 11 }}
        />
        <label className="field-label">Base URL</label>
        <input
          className="input mono"
          placeholder="http://localhost:11434/v1"
          value={draft.baseUrl}
          onChange={(e) => {
            patch({ baseUrl: e.target.value });
            setTest(null);
            setModels(null);
          }}
          style={{ marginBottom: 11 }}
        />
        <label className="field-label">
          API key <span style={{ color: 'var(--dim)' }}>· optional</span>
        </label>
        <div style={{ display: 'flex', gap: 7 }}>
          <input
            className="input mono"
            type={showKey ? 'text' : 'password'}
            placeholder="Leave blank for local servers"
            value={draft.apiKey ?? ''}
            onChange={(e) => patch({ apiKey: e.target.value })}
          />
          <button
            className="icon-btn"
            title="Show / hide"
            style={{ width: 38, height: 38, border: '1px solid var(--border2)', borderRadius: 10, background: 'var(--surface)' }}
            onClick={() => setShowKey((v) => !v)}
          >
            <Icon name="eye" size={16} />
          </button>
        </div>

        <SectionLabel>NETWORK ACCESS</SectionLabel>
        <Group>
          <Row
            title="Host permission"
            sub={origin ? origin : 'Enter a valid base URL first'}
            right={
              granted ? (
                <span className="status-pill" style={{ background: 'var(--ok-tint)', color: 'var(--ok)' }}>
                  <span className="dot" style={{ background: 'var(--ok)' }} />
                  Granted
                </span>
              ) : (
                <button className="btn btn-sm" disabled={!origin} onClick={() => void grantAccess()}>
                  Grant
                </button>
              )
            }
          />
        </Group>

        <button
          className="btn btn-accent-soft btn-block"
          style={{ height: 40, marginTop: 16 }}
          disabled={!draft.baseUrl.trim() || testing}
          onClick={() => void runTest()}
        >
          <Icon name="check-circle" size={15} />
          {testing ? 'Testing…' : 'Test connection'}
        </button>

        {test && (
          <div
            className="card"
            style={{
              marginTop: 9,
              padding: 11,
              borderColor: test.ok ? 'var(--ok)' : 'var(--err-bd)',
              background: test.ok ? 'var(--ok-tint)' : 'var(--err-bg)',
            }}
          >
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <Icon name={test.ok ? 'check-circle' : 'alert'} size={15} color={test.ok ? 'var(--ok)' : 'var(--err-btn)'} style={{ flex: 'none', marginTop: 1 }} />
              <div style={{ fontSize: 12, color: test.ok ? 'var(--ok)' : 'var(--err-btn)', lineHeight: 1.45 }}>
                {test.detail}
              </div>
            </div>
          </div>
        )}

        {models && models.length > 0 && (
          <>
            <SectionLabel>AVAILABLE MODELS</SectionLabel>
            <Group>
              {models.slice(0, 40).map((m) => (
                <Row key={m.id} title={m.label} sub={m.id} />
              ))}
            </Group>
          </>
        )}

        {!isNew && (
          <button
            className="btn btn-danger-ghost btn-block"
            style={{ height: 38, marginTop: 14 }}
            onClick={() => void remove()}
          >
            <Icon name="trash" size={14} />
            Remove provider
          </button>
        )}
      </div>
    </div>
  );
}
