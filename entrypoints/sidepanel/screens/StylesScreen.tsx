import type { Nav } from '../App';
import type { StylesApi, Style } from '../state/useStyles';
import Icon from '../ui/Icon';
import ScreenHeader from '../components/ScreenHeader';

/** List of response styles (tone/format guidance appended to the prompt). */
export default function StylesScreen({
  nav,
  styles,
  onEdit,
}: {
  nav: Nav;
  styles: StylesApi;
  onEdit: (style: Style) => void;
}) {
  const newStyle = () =>
    onEdit({ id: 's' + Date.now(), name: 'New style', desc: '', prompt: '' });

  return (
    <div className="screen">
      <ScreenHeader
        title="Styles"
        onBack={nav.backToSettings}
        right={
          <button className="btn btn-primary btn-sm" onClick={newStyle}>
            <Icon name="plus" size={12} strokeWidth={2.4} />
            New
          </button>
        }
      />
      <div style={{ flex: 'none', padding: '0 14px 6px' }}>
        <div className="screen-subtext">
          A style shapes tone and format. Pick one from the composer to append its
          guidance to the system prompt.
        </div>
      </div>
      <div className="screen-scroll jc-scroll" style={{ padding: '8px 14px 14px' }}>
        {styles.styles.map((s) => (
          <div key={s.id} className="mode-row" onClick={() => onEdit(s)}>
            <span className="mode-ico" style={{ background: 'var(--warm-tint)', color: 'var(--text2)' }}>✎</span>
            <div className="row-grow">
              <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>{s.name}</div>
              <div style={{ fontSize: 11.5, color: 'var(--faint)', lineHeight: 1.4 }}>{s.desc || s.prompt.slice(0, 60)}</div>
            </div>
            <Icon name="chevron-right" size={15} color="var(--dim)" strokeWidth={2.2} style={{ alignSelf: 'center' }} />
          </div>
        ))}
      </div>
    </div>
  );
}
