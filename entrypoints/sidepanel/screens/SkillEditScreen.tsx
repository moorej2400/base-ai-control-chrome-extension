import type { Nav } from '../App';
import { enrichSkill, type SkillsApi } from '../state/useSkills';
import Icon from '../ui/Icon';
import ScreenHeader from '../components/ScreenHeader';

/** Edit a skill's title + Markdown instructions (live-saved to the store). */
export default function SkillEditScreen({
  nav,
  skills,
  editSkillId,
}: {
  nav: Nav;
  skills: SkillsApi;
  editSkillId: string | null;
}) {
  const skill = skills.skills.find((s) => s.id === editSkillId);
  if (!skill) {
    return (
      <div className="screen">
        <ScreenHeader title="Edit skill" onBack={() => nav.go('skillsManage')} />
        <div className="empty-state">
          <p>Skill not found.</p>
        </div>
      </div>
    );
  }
  const enriched = enrichSkill(skill);

  return (
    <div className="screen">
      <ScreenHeader
        title="Edit skill"
        onBack={() => nav.go('skillsManage')}
        right={
          <button className="btn btn-primary btn-sm" onClick={() => nav.go('skillsManage')}>
            Done
          </button>
        }
      />
      <div className="screen-scroll jc-scroll" style={{ padding: '4px 14px 18px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <span style={{ width: 34, height: 34, borderRadius: 9, background: skill.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
            <Icon name="zap" size={17} color="#fff" strokeWidth={2.2} />
          </span>
          <span className="mono" style={{ fontSize: 11, color: 'var(--mid)', background: 'var(--chip)', padding: '4px 9px', borderRadius: 7 }}>
            {enriched.slashLabel}
          </span>
        </div>

        <label className="field-label">Title</label>
        <input
          className="input"
          style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 14 }}
          value={skill.title}
          onChange={(e) => skills.update(skill.id, { title: e.target.value })}
        />

        <label className="field-label">
          Instructions <span style={{ color: 'var(--dim)' }}>· Markdown</span>
        </label>
        <div style={{ fontSize: 10.5, color: 'var(--faint)', lineHeight: 1.5, margin: '0 2px 7px' }}>
          Front matter is required. The{' '}
          <span className="mono" style={{ color: 'var(--mid)', background: 'var(--chip)', padding: '1px 5px', borderRadius: 5 }}>name:</span>{' '}
          field becomes the <span className="mono" style={{ color: 'var(--mid)' }}>/command</span>.
        </div>
        <textarea
          className="textarea mono jc-scroll"
          style={{ flex: 1, minHeight: 260 }}
          value={skill.text}
          onChange={(e) => skills.update(skill.id, { text: e.target.value })}
        />

        <button
          className="btn btn-danger-ghost btn-block"
          style={{ height: 38, marginTop: 14 }}
          onClick={() => {
            skills.remove(skill.id);
            nav.go('skillsManage');
          }}
        >
          <Icon name="trash" size={14} />
          Delete skill
        </button>
      </div>
    </div>
  );
}
