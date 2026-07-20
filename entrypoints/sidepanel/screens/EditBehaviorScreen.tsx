import { useEffect, useState } from 'react';
import type { Nav } from '../App';
import type { FlagsApi } from '../state/useFlags';
import { storageGet, storageSet } from '@/lib/storage/chrome-storage';
import Toggle from '../ui/Toggle';
import { SectionLabel, Group, Row } from '../ui/SettingsGroup';
import { Badge } from '../ui/controls';
import ScreenHeader from '../components/ScreenHeader';

export const EDIT_SCOPE_KEY = 'settings.editScope';
export type EditScope = 'preview' | 'ask' | 'auto';

const OPTIONS: { id: EditScope; title: React.ReactNode; sub: string }[] = [
  { id: 'preview', title: 'Preview diffs', sub: 'Show a tracked diff card and wait for you to apply.' },
  { id: 'ask', title: 'Ask each time', sub: 'Prompt before touching the page, every time.' },
  {
    id: 'auto',
    title: (
      <>
        Auto-apply <Badge variant="risk">RISKY</Badge>
      </>
    ),
    sub: 'Write changes immediately — undo is still available.',
  },
];

/**
 * Edit behavior. Choice + safeguards persist locally but are not yet consumed —
 * there is no edit/apply tool. TODO(extension-side): honor these when one lands.
 */
export default function EditBehaviorScreen({ nav, flags }: { nav: Nav; flags: FlagsApi }) {
  const [scope, setScope] = useState<EditScope>('preview');

  useEffect(() => {
    void storageGet<EditScope>(EDIT_SCOPE_KEY).then((v) => v && setScope(v));
  }, []);

  const choose = (id: EditScope) => {
    setScope(id);
    void storageSet(EDIT_SCOPE_KEY, id);
  };

  const tog = (key: string, def: boolean) => (
    <Toggle on={flags.get(key, def)} onChange={() => flags.toggle(key, def)} title="Toggle" />
  );

  return (
    <div className="screen">
      <ScreenHeader title="Edit behavior" onBack={nav.backToSettings} />
      <div className="screen-scroll jc-scroll" style={{ padding: '4px 14px 18px' }}>
        <div className="screen-subtext" style={{ padding: '0 2px' }}>
          Decide how the assistant applies changes to your pages and notes.
        </div>

        <SectionLabel>WHEN AN EDIT IS PROPOSED</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {OPTIONS.map((o) => (
            <button key={o.id} className="radio-card" data-on={scope === o.id} onClick={() => choose(o.id)}>
              <span className="radio-dot">{scope === o.id && <span />}</span>
              <div style={{ flex: 1 }}>
                <div className="radio-title">{o.title}</div>
                <div className="radio-sub">{o.sub}</div>
              </div>
            </button>
          ))}
        </div>

        <SectionLabel>SAFEGUARDS</SectionLabel>
        <Group>
          <Row title="Tracked changes" sub="Record edits as reviewable suggestions" right={tog('eb_track', true)} />
          <Row title="Confirm multi-block edits" sub="Ask when more than 3 blocks change" right={tog('eb_confirm_multi', true)} />
        </Group>
      </div>
    </div>
  );
}
