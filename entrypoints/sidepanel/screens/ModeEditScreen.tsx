import { useState } from 'react';
import type { Nav } from '../App';
import { MODE_TOOL_META, type ModesApi, type Mode } from '../state/useModes';
import Icon from '../ui/Icon';
import Toggle from '../ui/Toggle';
import { SectionLabel, Group, Row } from '../ui/SettingsGroup';
import { Slider } from '../ui/controls';
import ScreenHeader from '../components/ScreenHeader';

/**
 * Mode editor. An active mode applies its system prompt, temperature, and the
 * "read the page" tool toggle to requests. The apply/search/fetch tool toggles
 * are saved for when those tools land (see docs/FEATURES.md).
 */
export default function ModeEditScreen({
  nav,
  modes,
  editMode,
}: {
  nav: Nav;
  modes: ModesApi;
  editMode: Mode | null;
}) {
  const [mode, setMode] = useState<Mode | null>(editMode);
  if (!mode) {
    return (
      <div className="screen">
        <ScreenHeader title="Edit mode" onBack={() => nav.go('modes')} />
        <div className="empty-state">
          <p>Mode not found.</p>
        </div>
      </div>
    );
  }

  const patch = (p: Partial<Mode>) => setMode((m) => (m ? { ...m, ...p } : m));

  return (
    <div className="screen">
      <ScreenHeader
        title={mode.name || 'Edit mode'}
        onBack={() => nav.go('modes')}
        right={
          <button
            className="btn btn-primary btn-sm"
            onClick={() => {
              modes.save(mode);
              nav.go('modes');
            }}
          >
            Save
          </button>
        }
      />
      <div className="screen-scroll jc-scroll" style={{ padding: '6px 14px 18px' }}>
        <div style={{ display: 'flex', gap: 11, alignItems: 'center', marginBottom: 14 }}>
          <span style={{ width: 44, height: 44, borderRadius: 11, background: mode.tint, color: mode.iconColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 19, flex: 'none' }}>
            {mode.icon}
          </span>
          <input
            className="input"
            style={{ height: 38, fontSize: 14, fontWeight: 600, color: 'var(--text)' }}
            placeholder="Mode name"
            value={mode.name}
            onChange={(e) => patch({ name: e.target.value })}
          />
        </div>

        <label className="field-label">Description</label>
        <input
          className="input"
          style={{ fontSize: 13 }}
          placeholder="What this mode is good for"
          value={mode.desc}
          onChange={(e) => patch({ desc: e.target.value })}
        />

        <SectionLabel>SYSTEM PROMPT</SectionLabel>
        <textarea
          className="textarea"
          style={{ minHeight: 124, resize: 'vertical' }}
          rows={6}
          value={mode.prompt}
          onChange={(e) => patch({ prompt: e.target.value })}
        />

        <SectionLabel>SAMPLING</SectionLabel>
        <Group>
          <div className="row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 9 }}>
              <span className="row-title" style={{ flex: 1 }}>Temperature</span>
              <span className="mono" style={{ fontSize: 12, color: 'var(--accent-text)', background: 'var(--accent-tint)', padding: '1px 8px', borderRadius: 5 }}>
                {mode.temp.toFixed(1)}
              </span>
            </div>
            <Slider min={0} max={1} step={0.1} value={mode.temp} onChange={(v) => patch({ temp: v })} leftLabel="precise" rightLabel="creative" />
          </div>
        </Group>

        <SectionLabel>TOOLS</SectionLabel>
        <div className="screen-subtext" style={{ padding: '0 2px 6px' }}>
          “Read the page” is applied to requests today. Apply/search/fetch are saved
          for when those tools land.
        </div>
        <Group>
          {MODE_TOOL_META.map((tm) => (
            <Row
              key={tm.key}
              title={tm.label}
              sub={tm.sub}
              right={
                <Toggle
                  on={!!mode.tools[tm.key]}
                  onChange={() => patch({ tools: { ...mode.tools, [tm.key]: !mode.tools[tm.key] } })}
                  title={`Toggle ${tm.label}`}
                />
              }
            />
          ))}
        </Group>

        <button
          className="btn btn-danger-ghost btn-block"
          style={{ height: 38, marginTop: 16 }}
          onClick={() => {
            modes.remove(mode.id);
            nav.go('modes');
          }}
        >
          <Icon name="trash" size={14} />
          Delete mode
        </button>
      </div>
    </div>
  );
}
