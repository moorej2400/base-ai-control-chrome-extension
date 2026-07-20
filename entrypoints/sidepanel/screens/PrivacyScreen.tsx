import { useState } from 'react';
import type { Nav } from '../App';
import { exportAllData, wipeAllData } from '@/lib/storage/data-admin';
import Icon from '../ui/Icon';
import { SectionLabel } from '../ui/SettingsGroup';
import ScreenHeader from '../components/ScreenHeader';

function downloadJson(name: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Data & privacy. Export and full-wipe are real. Everything here runs locally —
 * there is no telemetry, and the extension only talks to the providers the user
 * configures, so there are no sharing/enforcement toggles to surface.
 */
export default function PrivacyScreen({ nav }: { nav: Nav }) {
  const [busy, setBusy] = useState<'export' | 'wipe' | null>(null);

  const doExport = async () => {
    setBusy('export');
    try {
      const data = await exportAllData();
      const stamp = new Date().toISOString().slice(0, 10);
      downloadJson(`jchat-export-${stamp}.json`, data);
    } finally {
      setBusy(null);
    }
  };

  const doWipe = async () => {
    if (!window.confirm('Delete all chats and reset all settings? This cannot be undone. (Your Copilot sign-in is kept.)')) {
      return;
    }
    setBusy('wipe');
    await wipeAllData();
    // Reload the panel so all in-memory state resets cleanly.
    location.reload();
  };

  return (
    <div className="screen">
      <ScreenHeader title="Data & privacy" onBack={nav.backToSettings} />
      <div className="screen-scroll jc-scroll" style={{ padding: '4px 14px 18px' }}>
        <div
          style={{
            display: 'flex',
            gap: 10,
            padding: 12,
            border: '1px solid var(--accent-tint-bd)',
            borderRadius: 12,
            background: 'var(--accent-tint)',
          }}
        >
          <Icon name="shield" size={17} color="var(--accent-text)" style={{ flex: 'none', marginTop: 1 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--accent-text)', marginBottom: 2 }}>
              Everything stays on this device
            </div>
            <div style={{ fontSize: 11, lineHeight: 1.5, color: 'var(--mid)' }}>
              Your keys, chats, and settings are stored locally. Nothing is collected or
              sent anywhere except directly to the AI providers you configure.
            </div>
          </div>
        </div>

        <SectionLabel>DANGER ZONE</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            className="btn btn-block"
            style={{ height: 42, justifyContent: 'flex-start', gap: 9 }}
            disabled={busy !== null}
            onClick={() => void doExport()}
          >
            <Icon name="download" size={15} />
            {busy === 'export' ? 'Exporting…' : 'Export all data'}
            <span style={{ flex: 1 }} />
            <span className="mono" style={{ fontSize: 10, color: 'var(--faint)' }}>.json</span>
          </button>
          <button
            className="btn btn-block"
            style={{
              height: 42,
              justifyContent: 'flex-start',
              gap: 9,
              border: '1px solid var(--err-bd)',
              background: 'var(--err-bg)',
              color: 'var(--err-btn)',
              fontWeight: 600,
            }}
            disabled={busy !== null}
            onClick={() => void doWipe()}
          >
            <Icon name="trash" size={15} />
            {busy === 'wipe' ? 'Deleting…' : 'Delete all chats & data'}
          </button>
        </div>
      </div>
    </div>
  );
}
