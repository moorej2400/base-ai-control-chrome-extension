import { useState } from 'react';
import type { Nav } from '../App';
import { parseFrontMatter, SKILL_COLORS, type SkillsApi } from '../state/useSkills';
import Icon from '../ui/Icon';
import { Segmented } from '../ui/controls';
import ScreenHeader from '../components/ScreenHeader';

/** Create a new skill by pasting Markdown or dropping a .md file. */
export default function NewSkillScreen({ nav, skills }: { nav: Nav; skills: SkillsApi }) {
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [method, setMethod] = useState<'paste' | 'upload'>('paste');
  const [dragOver, setDragOver] = useState(false);

  const titleFromName = (name: string) =>
    name ? name.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '';

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result || '');
      const fm = parseFrontMatter(content);
      const base = (file.name || 'skill').replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ');
      setTitle((t) => t || titleFromName(fm.name) || base);
      setText(content);
    };
    reader.readAsText(file);
  };

  const create = () => {
    const fm = parseFrontMatter(text);
    const finalTitle = title.trim() || titleFromName(fm.name) || 'New skill';
    const id = 's' + Date.now();
    skills.add({ id, title: finalTitle, color: SKILL_COLORS[skills.skills.length % SKILL_COLORS.length], text });
    nav.openSkillEditor(id);
  };

  return (
    <div className="screen">
      <ScreenHeader
        title="New skill"
        onBack={() => nav.go('skillsManage')}
        right={
          <button className="btn btn-primary btn-sm" onClick={create}>
            Create
          </button>
        }
      />
      <div className="screen-scroll jc-scroll" style={{ padding: '4px 14px 18px', display: 'flex', flexDirection: 'column' }}>
        <label className="field-label">Title</label>
        <input
          className="input"
          style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 16 }}
          placeholder="e.g. Translate to French"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />

        <div className="mono" style={{ fontSize: 9.5, color: 'var(--dim)', letterSpacing: '0.05em', marginBottom: 6 }}>
          HOW TO ADD THE INSTRUCTIONS
        </div>
        <div style={{ fontSize: 10.5, color: 'var(--faint)', lineHeight: 1.5, marginBottom: 9 }}>
          Front matter is required. The{' '}
          <span className="mono" style={{ color: 'var(--mid)', background: 'var(--chip)', padding: '1px 5px', borderRadius: 5 }}>name:</span>{' '}
          field becomes the <span className="mono" style={{ color: 'var(--mid)' }}>/command</span>.
        </div>

        <div style={{ marginBottom: 13 }}>
          <Segmented
            options={[
              { value: 'paste', label: <><Icon name="clipboard" size={13} />Paste text</> },
              { value: 'upload', label: <><Icon name="download" size={13} />Upload file</> },
            ]}
            value={method}
            onChange={setMethod}
          />
        </div>

        {method === 'paste' ? (
          <textarea
            className="textarea mono jc-scroll"
            style={{ flex: 1, minHeight: 240 }}
            placeholder={'---\nname: my-skill\ndescription: When to use this skill\n---\n\n# My Skill\n\nInstructions in Markdown…'}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        ) : (
          <div
            className={`dashed-drop${dragOver ? ' over' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              if (!dragOver) setDragOver(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              setDragOver(false);
            }}
            onDrop={onDrop}
          >
            <Icon name="download" size={26} color="var(--mid)" strokeWidth={1.7} />
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)' }}>Drop a Markdown file</div>
            <div className="mono" style={{ fontSize: 11, color: 'var(--faint)' }}>a .md file fills in the instructions below</div>
            {text && (
              <div style={{ marginTop: 6, fontSize: 11, color: 'var(--accent-text)', display: 'flex', alignItems: 'center', gap: 5 }}>
                <Icon name="check" size={13} color="var(--accent-text)" />
                Loaded — press Create
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
