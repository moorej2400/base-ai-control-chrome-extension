import { useEffect, useState } from 'react';
import type { Nav } from '../App';
import Icon from '../ui/Icon';
import { SectionLabel, Group } from '../ui/SettingsGroup';
import ScreenHeader from '../components/ScreenHeader';

interface Command {
  name: string;
  description: string;
  shortcut: string;
}

/**
 * Keyboard shortcuts. Chrome owns shortcut binding — extensions can declare
 * commands and read their current binding, but only the user can (re)assign keys
 * at chrome://extensions/shortcuts. This screen shows the live bindings and
 * opens that page.
 */
export default function KeyboardShortcutsScreen({ nav }: { nav: Nav }) {
  const [commands, setCommands] = useState<Command[] | null>(null);

  const load = () => {
    try {
      chrome.commands.getAll((cmds) => {
        setCommands(
          cmds.map((c) => ({
            name: c.name ?? '',
            description: c.description || (c.name === '_execute_action' ? 'Open the extension' : c.name || ''),
            shortcut: c.shortcut ?? '',
          })),
        );
      });
    } catch {
      setCommands([]);
    }
  };

  useEffect(load, []);

  return (
    <div className="screen">
      <ScreenHeader title="Keyboard shortcuts" onBack={nav.backToSettings} />
      <div className="screen-scroll jc-scroll" style={{ padding: '4px 14px 18px' }}>
        <div className="screen-subtext" style={{ padding: '0 2px' }}>
          Chrome manages shortcut keys. Set or change them on Chrome's shortcuts page —
          the bindings below refresh when you come back.
        </div>

        <SectionLabel>SHORTCUTS</SectionLabel>
        <Group>
          {commands && commands.length > 0 ? (
            commands.map((c) => (
              <div key={c.name} className="row">
                <div className="row-grow">
                  <div className="row-title">{c.description}</div>
                  <div className="row-sub mono">{c.name}</div>
                </div>
                {c.shortcut ? (
                  <span className="mono" style={{ fontSize: 12, color: 'var(--accent-text)', background: 'var(--accent-tint)', padding: '2px 9px', borderRadius: 6 }}>
                    {c.shortcut}
                  </span>
                ) : (
                  <span className="mono" style={{ fontSize: 11, color: 'var(--faint)' }}>Not set</span>
                )}
              </div>
            ))
          ) : (
            <div className="row-sub" style={{ padding: 8 }}>
              {commands === null ? 'Loading…' : 'No commands registered.'}
            </div>
          )}
        </Group>

        <button
          className="btn btn-accent-soft btn-block"
          style={{ height: 40, marginTop: 14 }}
          onClick={() => {
            void chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
          }}
        >
          <Icon name="external" size={15} />
          Edit shortcuts in Chrome
        </button>
      </div>
    </div>
  );
}
