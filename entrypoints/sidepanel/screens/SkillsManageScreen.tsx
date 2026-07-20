import type { Nav } from '../App';
import type { SkillsApi } from '../state/useSkills';
import Icon from '../ui/Icon';
import ScreenHeader from '../components/ScreenHeader';

/** Manage the skill library: open one to edit, or add a new one. */
export default function SkillsManageScreen({ nav, skills }: { nav: Nav; skills: SkillsApi }) {
  return (
    <div className="screen">
      <ScreenHeader
        title="Skills"
        onBack={nav.backToSettings}
        right={
          <button className="btn btn-primary btn-sm" onClick={() => nav.go('skillNew')}>
            <Icon name="plus" size={12} strokeWidth={2.4} />
            Add skill
          </button>
        }
      />
      <div className="screen-scroll jc-scroll" style={{ padding: '8px 14px 16px' }}>
        {skills.enriched.map((sk) => (
          <div key={sk.id} className="skill-manage-row" onClick={() => nav.openSkillEditor(sk.id)}>
            <span className="skill-ico" style={{ background: sk.color }}>
              <Icon name="zap" size={15} color="#fff" strokeWidth={2.2} />
            </span>
            <div className="row-grow">
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{sk.title}</span>
                <span className="badge" style={{ fontSize: 9.5 }}>{sk.slashLabel}</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--faint)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {sk.desc}
              </div>
            </div>
            <Icon name="chevron-right" size={14} color="var(--dim)" strokeWidth={2.2} />
          </div>
        ))}
      </div>
    </div>
  );
}
