import { useEffect, useMemo, useState } from 'react';
import type { Nav } from '../App';
import { storageGet, storageSet } from '@/lib/storage/chrome-storage';
import { useModelCatalog } from '../state/useModelCatalog';
import {
  buildModelItems,
  DEFAULT_FAMILY_KEY,
  DEFAULT_FAMILY_LABEL_KEY,
  DEFAULT_PROVIDER_KEY,
  type ModelMenuItem,
} from '../state/model-menu';
import Icon from '../ui/Icon';
import { SectionLabel, Group } from '../ui/SettingsGroup';
import ScreenHeader from '../components/ScreenHeader';

/**
 * Default model picker. New chats start on this (provider, model); switching a
 * model in the composer updates it too, so this screen and the composer stay in
 * sync. Real catalog across every connected provider.
 */
export default function DefaultModelScreen({ nav }: { nav: Nav }) {
  const { providerGroups, choices, loading } = useModelCatalog();
  const [current, setCurrent] = useState<{ provider: string; family: string }>({
    provider: '',
    family: '',
  });

  useEffect(() => {
    void Promise.all([
      storageGet<string>(DEFAULT_PROVIDER_KEY),
      storageGet<string>(DEFAULT_FAMILY_KEY),
    ]).then(([p, f]) => setCurrent({ provider: p ?? '', family: f ?? '' }));
  }, []);

  const items = useMemo(
    () => buildModelItems(providerGroups, choices),
    [providerGroups, choices],
  );

  // Group the (already ordered) items into per-section blocks.
  const sections = useMemo(() => {
    const out: { section: string; items: ModelMenuItem[] }[] = [];
    for (const it of items) {
      if (it.firstInVendor || out.length === 0) out.push({ section: it.section, items: [it] });
      else out[out.length - 1].items.push(it);
    }
    return out;
  }, [items]);

  const choose = (it: ModelMenuItem) => {
    setCurrent({ provider: it.providerId, family: it.family });
    void storageSet(DEFAULT_PROVIDER_KEY, it.providerId);
    void storageSet(DEFAULT_FAMILY_KEY, it.family);
    void storageSet(DEFAULT_FAMILY_LABEL_KEY, it.label);
  };

  return (
    <div className="screen">
      <ScreenHeader title="Default model" onBack={nav.backToSettings} />
      <div className="screen-scroll jc-scroll" style={{ padding: '4px 14px 18px' }}>
        <div className="screen-subtext" style={{ padding: '0 2px' }}>
          New chats start on this model. You can still switch per-chat from the composer.
        </div>

        {!loading && items.length === 0 && (
          <div className="empty-state" style={{ padding: '28px 8px' }}>
            <Icon name="github" size={28} color="var(--mid)" />
            <p style={{ fontSize: 12.5, color: 'var(--mid)', lineHeight: 1.5 }}>
              Connect a provider (Copilot, Ollama, …) to choose a model.
            </p>
          </div>
        )}
        {loading && <div className="row-sub" style={{ padding: 8 }}>Loading models…</div>}

        {sections.map((section) => (
          <div key={section.section}>
            <SectionLabel>{section.section.toUpperCase()}</SectionLabel>
            <Group>
              {section.items.map((it) => (
                <div
                  key={`${it.providerId}:${it.family}`}
                  className="row clickable"
                  role="button"
                  onClick={() => choose(it)}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 3,
                      background: `oklch(0.70 0.13 ${it.hue})`,
                      flex: 'none',
                    }}
                  />
                  <div className="row-grow">
                    <div className="row-title">{it.label}</div>
                    {it.sub && <div className="row-sub mono">{it.sub}</div>}
                  </div>
                  {it.providerId === current.provider && it.family === current.family && (
                    <Icon name="check" size={15} color="var(--accent-text)" strokeWidth={2.6} />
                  )}
                </div>
              ))}
            </Group>
          </div>
        ))}
      </div>
    </div>
  );
}
