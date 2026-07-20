import { useEffect, useState } from 'react';
import type { Nav } from '../App';
import { storageGet, storageSet } from '@/lib/storage/chrome-storage';
import ScreenHeader from '../components/ScreenHeader';

export const SYSTEM_PROMPT_KEY = 'settings.systemPrompt';

/**
 * Global system prompt. Prepended to every request (across all providers and
 * modes) via the transport's personalization. Empty = base behavior only.
 */
export default function SystemPromptScreen({ nav }: { nav: Nav }) {
  const [value, setValue] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void storageGet<string>(SYSTEM_PROMPT_KEY).then((v) => {
      setValue(v ?? '');
      setLoaded(true);
    });
  }, []);

  const save = async () => {
    await storageSet(SYSTEM_PROMPT_KEY, value.trim());
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
    nav.backToSettings();
  };

  return (
    <div className="screen">
      <ScreenHeader
        title="System prompt"
        onBack={nav.backToSettings}
        right={
          <button className="btn btn-primary btn-sm" disabled={!loaded} onClick={() => void save()}>
            {saved ? 'Saved' : 'Save'}
          </button>
        }
      />
      <div className="screen-scroll jc-scroll" style={{ padding: '4px 14px 18px' }}>
        <div className="screen-subtext" style={{ padding: '0 2px 6px' }}>
          Added to every request, on top of the built-in page-assistant behavior.
          Use it for standing instructions (tone, formatting, domain rules).
        </div>
        <textarea
          className="textarea"
          style={{ minHeight: 220, resize: 'vertical' }}
          placeholder={'e.g. Always answer in British English. Prefer tables for comparisons. Never use emoji.'}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        {value.trim() && (
          <button
            className="btn btn-danger-ghost btn-block"
            style={{ height: 36, marginTop: 10 }}
            onClick={() => setValue('')}
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
