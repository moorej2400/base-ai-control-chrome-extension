import { useEffect, useState } from 'react';
import type { Nav } from '../App';
import { useTheme } from '../theme/ThemeProvider';
import { ACCENT_HUES, ACCENT_NAMES, accentSwatchFill } from '../theme/tokens';
import { useSkills } from '../state/useSkills';
import { useModes } from '../state/useModes';
import { useStyles } from '../state/useStyles';
import { useProviders } from '../state/providers';
import { useFlags } from '../state/useFlags';
import { storageGet } from '@/lib/storage/chrome-storage';
import { DEFAULT_FAMILY_LABEL_KEY } from '../state/model-menu';
import { SYSTEM_PROMPT_KEY } from './SystemPromptScreen';
import { EDIT_SCOPE_KEY, type EditScope } from './EditBehaviorScreen';
import { getExternalBrowserControlEnabled, setExternalBrowserControlEnabled } from '@/lib/agent-tools/browser-control/settings';
import Icon from '../ui/Icon';
import Toggle from '../ui/Toggle';
import { SectionLabel, Group, Row } from '../ui/SettingsGroup';
import ScreenHeader from '../components/ScreenHeader';

const EDIT_SCOPE_LABEL: Record<EditScope, string> = {
  preview: 'Preview diffs',
  ask: 'Ask each time',
  auto: 'Auto-apply',
};

export default function SettingsScreen({ nav }: { nav: Nav }) {
  const { dark, accentHue, toggleDark, setAccentHue } = useTheme();
  const providers = useProviders();
  const skills = useSkills();
  const modes = useModes();
  const styles = useStyles();
  const flags = useFlags();
  const [editScope, setEditScope] = useState<EditScope>('preview');
  const [defaultModel, setDefaultModel] = useState('Auto');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [shortcut, setShortcut] = useState('');
  const [externalBrowserControl, setExternalBrowserControl] = useState(true);

  useEffect(() => {
    void storageGet<EditScope>(EDIT_SCOPE_KEY).then((v) => v && setEditScope(v));
    void storageGet<string>(DEFAULT_FAMILY_LABEL_KEY).then((v) => v && setDefaultModel(v));
    void storageGet<string>(SYSTEM_PROMPT_KEY).then((v) => setSystemPrompt(v ?? ''));
    void getExternalBrowserControlEnabled().then(setExternalBrowserControl);
    try {
      chrome.commands.getAll((cmds) => {
        setShortcut(cmds.find((c) => c.name === 'open-panel')?.shortcut ?? '');
      });
    } catch {
      /* commands API may be unavailable */
    }
  }, []);

  return (
    <div className="screen">
      <ScreenHeader title="Settings" tight />
      <div className="screen-scroll jc-scroll" style={{ padding: '0 14px 16px' }}>
        <SectionLabel flush>AI PROVIDERS</SectionLabel>
        {providers.map((p) => (
          <div
            key={p.id}
            className="provider-row"
            onClick={() => (p.isCopilot ? nav.openCopilot() : nav.openProvider(p.id))}
          >
            <span className="provider-avatar" style={{ background: p.tint }}>
              {p.initial}
            </span>
            <div className="row-grow">
              <div className="row-title" style={{ fontSize: 13, color: 'var(--text)', fontWeight: 600 }}>
                {p.name}
              </div>
              <div className="provider-detail">
                <span className="dot" style={{ background: p.dot }} />
                {p.detail}
              </div>
            </div>
            <Icon name="chevron-right" size={14} color="var(--dim)" strokeWidth={2.2} />
          </div>
        ))}
        <button className="dashed-btn" onClick={() => nav.addProvider()}>
          <Icon name="plus" size={14} strokeWidth={2.2} />
          Add provider
        </button>

        <SectionLabel>WORKSPACE</SectionLabel>
        <Group>
          <Row iconGlyph="◆" iconTint="var(--accent-tint)" iconColor="var(--accent-text)" title="Default model" value={defaultModel} chevron onClick={() => nav.go('defaultModel')} />
          <Row iconGlyph="◑" iconTint="var(--ok-tint)" title="Modes" value={`${modes.modes.length} custom`} chevron onClick={() => nav.go('modes')} />
          <Row iconGlyph="◈" iconTint="var(--blue-tint)" title="Skills" value={`${skills.skills.length} installed`} chevron onClick={() => nav.go('skillsManage')} />
          <Row iconGlyph="✎" iconTint="var(--warm-tint)" title="Styles" value={`${styles.styles.length} custom`} chevron onClick={() => nav.go('styles')} />
          <Row iconGlyph="⌘" iconTint="var(--accent-tint)" title="System prompt" value={systemPrompt.trim() ? 'Custom' : 'Default'} chevron onClick={() => nav.go('systemPrompt')} />
        </Group>

        <SectionLabel>CONTEXT &amp; DATA</SectionLabel>
        <Group>
          <Row iconGlyph="◎" iconTint="var(--blue-tint)" title="Context &amp; retrieval" value={flags.get('ragMemory', false) ? 'RAG memory on' : 'Page + selection'} chevron onClick={() => nav.go('context')} />
          <Row iconGlyph="✓" iconTint="var(--ok-tint)" title="Edit behavior" value={EDIT_SCOPE_LABEL[editScope]} chevron onClick={() => nav.go('editbeh')} />
          <Row iconGlyph="◴" iconTint="var(--warm-tint)" title="Data &amp; privacy" value="Local only" chevron onClick={() => nav.go('privacy')} />
        </Group>

        <SectionLabel>BROWSER CONTROL</SectionLabel>
        <Group>
          <Row
            iconGlyph="⌁"
            iconTint="var(--blue-tint)"
            title="External MCP control"
            sub="Allow a local Codex/MCP client to share this extension’s browser controller."
            right={
              <Toggle
                on={externalBrowserControl}
                title="Enable external MCP browser control"
                onChange={(enabled) => {
                  setExternalBrowserControl(enabled);
                  void setExternalBrowserControlEnabled(enabled).then(() => {
                    // A cold MV3 worker may miss the storage change that woke a prior
                    // instance, so explicitly reconcile the live native connection.
                    void chrome.runtime.sendMessage({
                      type: 'browser-control.external-control.changed',
                      enabled,
                    }).catch(() => {});
                  });
                }}
              />
            }
          />
        </Group>

        <SectionLabel>PREFERENCES</SectionLabel>
        <Group>
          <Row
            iconGlyph="☾"
            iconTint="var(--accent-tint)"
            title="Dark mode"
            right={<Toggle on={dark} onChange={toggleDark} title="Toggle theme" />}
          />
          <div className="row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
              <span className="row-icon" style={{ background: 'var(--accent-tint)', color: 'var(--accent-text)' }}>◐</span>
              <span className="row-title" style={{ flex: 1 }}>Accent color</span>
            </div>
            <div className="swatches">
              {ACCENT_HUES.map((hue) => (
                <button
                  key={hue}
                  className="swatch"
                  title={ACCENT_NAMES[hue]}
                  style={{
                    background: accentSwatchFill(hue),
                    boxShadow:
                      hue === accentHue
                        ? `0 0 0 2px var(--surface), 0 0 0 4px ${accentSwatchFill(hue)}`
                        : 'none',
                  }}
                  onClick={() => setAccentHue(hue)}
                />
              ))}
            </div>
          </div>
          <Row iconGlyph="⌘" iconTint="var(--warm-tint)" title="Keyboard shortcuts" value={shortcut || 'Not set'} valueMono chevron onClick={() => nav.go('shortcuts')} />
        </Group>
      </div>
    </div>
  );
}
