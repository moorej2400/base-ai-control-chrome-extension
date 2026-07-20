import type { Nav } from '../App';
import type { SkillsApi } from '../state/useSkills';
import Icon from '../ui/Icon';
import { Button } from '../ui/Button';
import ScreenHeader from '../components/ScreenHeader';

/** Pick a skill to steer the next reply (or run it). */
export default function SkillsPickerScreen({
  nav,
  skills,
  activeSkillId,
  onRun,
}: {
  nav: Nav;
  skills: SkillsApi;
  activeSkillId: string | null;
  onRun: (id: string) => void;
}) {
  return (
    <div className="screen">
      <ScreenHeader
        title="Skills"
        onBack={() => nav.go('chat')}
        right={
          <button className="btn btn-sm" onClick={() => nav.go('skillsManage')}>
            <Icon name="gear" size={13} />
            Manage
          </button>
        }
      />
      <div style={{ flex: 'none', padding: '0 14px 6px' }}>
        <div className="screen-subtext">
          Run a skill to steer the next reply, or type{' '}
          <span className="mono" style={{ color: 'var(--mid)', background: 'var(--chip)', padding: '1px 5px', borderRadius: 5, fontSize: 10.5 }}>/</span>{' '}
          in the composer.
        </div>
      </div>
      <div className="screen-scroll jc-scroll" style={{ padding: '8px 14px 14px' }}>
        {skills.enriched.map((sk) => (
          <div key={sk.id} className="skill-pick-card" data-active={sk.id === activeSkillId}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: 3, background: sk.color, flex: 'none' }} />
              <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{sk.title}</span>
              <span className="badge">{sk.slashLabel}</span>
            </div>
            <div style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--mid)', marginBottom: 9 }}>{sk.desc}</div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <Button small variant="primary" icon="play" onClick={() => onRun(sk.id)}>
                Run
              </Button>
              <Button small onClick={() => nav.openSkillEditor(sk.id)}>
                Edit
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
