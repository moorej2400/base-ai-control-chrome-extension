import type { Nav } from '../App';
import type { ModesApi, Mode } from '../state/useModes';
import Icon from '../ui/Icon';
import ScreenHeader from '../components/ScreenHeader';

function toolCountBadge(mode: Mode): string {
  const n = Object.values(mode.tools).filter(Boolean).length;
  return n === 0 ? 'no tools' : `${n} ${n === 1 ? 'tool' : 'tools'}`;
}

/** List of modes (system-prompt + model + tools bundles). */
export default function ModesScreen({ nav, modes }: { nav: Nav; modes: ModesApi }) {
  const newMode = () => {
    const mode: Mode = {
      id: 'm' + Date.now(),
      name: 'New mode',
      icon: '✦',
      tint: 'var(--accent-tint)',
      iconColor: 'var(--accent-text)',
      desc: '',
      model: 'Sonnet 4.5',
      temp: 0.5,
      prompt: '',
      tools: { read: true, apply: false, search: false, fetch: false },
    };
    nav.openModeEditor(mode);
  };

  return (
    <div className="screen">
      <ScreenHeader
        title="Modes"
        onBack={nav.backToSettings}
        right={
          <button className="btn btn-primary btn-sm" onClick={newMode}>
            <Icon name="plus" size={12} strokeWidth={2.4} />
            New
          </button>
        }
      />
      <div style={{ flex: 'none', padding: '0 14px 6px' }}>
        <div className="screen-subtext">
          Each mode bundles a system prompt, model, tools, and temperature. Switch between them from the composer.
        </div>
      </div>
      <div className="screen-scroll jc-scroll" style={{ padding: '8px 14px 14px' }}>
        {modes.modes.map((m) => (
          <div key={m.id} className="mode-row" onClick={() => nav.openModeEditor(m)}>
            <span className="mode-ico" style={{ background: m.tint, color: m.iconColor }}>{m.icon}</span>
            <div className="row-grow">
              <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>{m.name}</div>
              <div style={{ fontSize: 11.5, color: 'var(--faint)', lineHeight: 1.4 }}>{m.desc}</div>
              <div style={{ display: 'flex', gap: 6, marginTop: 7 }}>
                <span className="badge" style={{ fontSize: 9.5 }}>temp {m.temp.toFixed(1)}</span>
                <span className="badge" style={{ fontSize: 9.5 }}>{toolCountBadge(m)}</span>
              </div>
            </div>
            <Icon name="chevron-right" size={15} color="var(--dim)" strokeWidth={2.2} style={{ alignSelf: 'center' }} />
          </div>
        ))}
      </div>
    </div>
  );
}
