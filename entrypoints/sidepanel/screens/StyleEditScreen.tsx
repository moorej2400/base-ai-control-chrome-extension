import { useState } from 'react';
import type { Nav } from '../App';
import type { StylesApi, Style } from '../state/useStyles';
import Icon from '../ui/Icon';
import { SectionLabel } from '../ui/SettingsGroup';
import ScreenHeader from '../components/ScreenHeader';

/** Editor for a response Style. Saving persists it and applies from the composer. */
export default function StyleEditScreen({
  nav,
  styles,
  editStyle,
}: {
  nav: Nav;
  styles: StylesApi;
  editStyle: Style | null;
}) {
  const [style, setStyle] = useState<Style | null>(editStyle);
  if (!style) {
    return (
      <div className="screen">
        <ScreenHeader title="Edit style" onBack={() => nav.go('styles')} />
        <div className="empty-state">
          <p>Style not found.</p>
        </div>
      </div>
    );
  }

  const patch = (p: Partial<Style>) => setStyle((s) => (s ? { ...s, ...p } : s));
  const canSave = style.name.trim().length > 0 && style.prompt.trim().length > 0;

  return (
    <div className="screen">
      <ScreenHeader
        title={style.name || 'Edit style'}
        onBack={() => nav.go('styles')}
        right={
          <button
            className="btn btn-primary btn-sm"
            disabled={!canSave}
            onClick={() => {
              styles.save({ ...style, name: style.name.trim() });
              nav.go('styles');
            }}
          >
            Save
          </button>
        }
      />
      <div className="screen-scroll jc-scroll" style={{ padding: '6px 14px 18px' }}>
        <label className="field-label">Name</label>
        <input
          className="input"
          style={{ height: 38, fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 11 }}
          placeholder="Style name"
          value={style.name}
          onChange={(e) => patch({ name: e.target.value })}
        />

        <label className="field-label">Description</label>
        <input
          className="input"
          style={{ fontSize: 13 }}
          placeholder="What this style is good for"
          value={style.desc}
          onChange={(e) => patch({ desc: e.target.value })}
        />

        <SectionLabel>STYLE GUIDANCE</SectionLabel>
        <textarea
          className="textarea"
          style={{ minHeight: 140, resize: 'vertical' }}
          placeholder="Instructions appended to the system prompt, e.g. 'Be concise. Lead with the answer.'"
          value={style.prompt}
          onChange={(e) => patch({ prompt: e.target.value })}
        />

        <button
          className="btn btn-danger-ghost btn-block"
          style={{ height: 38, marginTop: 16 }}
          onClick={() => {
            styles.remove(style.id);
            nav.go('styles');
          }}
        >
          <Icon name="trash" size={14} />
          Delete style
        </button>
      </div>
    </div>
  );
}
