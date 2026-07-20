import { useEffect, useState } from 'react';
import type { Nav } from '../App';
import type { FlagsApi } from '../state/useFlags';
import { usePageAccess } from '../state/usePageAccess';
import { storageGet, storageSet } from '@/lib/storage/chrome-storage';
import { clearAllChats } from '@/lib/storage/data-admin';
import Icon from '../ui/Icon';
import Toggle from '../ui/Toggle';
import { SectionLabel, Group, Row } from '../ui/SettingsGroup';
import { Slider, Badge } from '../ui/controls';
import ScreenHeader from '../components/ScreenHeader';

const TOPK_KEY = 'settings.ragTopK';
const HISTORY_KEY = 'settings.historyDays';

/**
 * Context & retrieval. "Read any site" and the chat-history retention (auto-
 * delete + clear-now) are wired. The default-source toggles and the RAG section
 * are surfaced but not yet consumed by the engine.
 * TODO(deferred): default-source gating and the RAG pipeline — see docs/FEATURES.md.
 */
export default function ContextScreen({ nav, flags }: { nav: Nav; flags: FlagsApi }) {
  const [topK, setTopK] = useState(6);
  const [historyDays, setHistoryDays] = useState(365);
  const pageAccess = usePageAccess();

  useEffect(() => {
    void storageGet<number>(TOPK_KEY).then((v) => typeof v === 'number' && setTopK(v));
    void storageGet<number>(HISTORY_KEY).then((v) => typeof v === 'number' && setHistoryDays(v));
  }, []);

  const ragOn = flags.get('ragMemory', false);
  const tog = (key: string, def: boolean) => (
    <Toggle on={flags.get(key, def)} onChange={() => flags.toggle(key, def)} title="Toggle" />
  );

  const clearHistory = async () => {
    if (!window.confirm('Delete every chat now? This cannot be undone.')) return;
    await clearAllChats();
    location.reload();
  };

  return (
    <div className="screen">
      <ScreenHeader title="Context & retrieval" onBack={nav.backToSettings} />
      <div className="screen-scroll jc-scroll" style={{ padding: '4px 14px 18px' }}>
        <div className="screen-subtext" style={{ padding: '0 2px' }}>
          Control what J Chat can read by default and how it pulls in extra knowledge.
        </div>

        <SectionLabel>ATTACHED BY DEFAULT</SectionLabel>
        <Group>
          <Row icon="file" iconTint="var(--accent-tint)" iconColor="var(--accent-text)" title="Current page" sub="Full text of the page you're on" right={tog('src_page', true)} />
          <Row icon="maximize" iconTint="var(--blue-tint)" title="Active selection" sub="Highlighted text, when present" right={tog('src_selection', true)} />
          {/* Wired to the real all-sites host permission (existing feature):
              lets the agent read whichever tab is active, not just the one the
              icon was clicked on. */}
          <Row
            icon="rows"
            iconTint="var(--warm-tint)"
            title="Read any site"
            sub="Let the agent read the active tab as you switch"
            right={
              <Toggle
                on={pageAccess.granted ?? false}
                onChange={() => void pageAccess.toggle()}
                title="Allow reading any site"
              />
            }
          />
          <Row icon="link2" iconTint="var(--ok-tint)" title="Linked pages" sub="Pages referenced from this one" right={tog('src_linked', false)} />
        </Group>

        <SectionLabel>
          RAG MEMORY <Badge variant="accent">BETA</Badge>
        </SectionLabel>
        <div
          className="card"
          style={{
            borderColor: ragOn ? 'var(--accent-tint-bd)' : 'var(--border)',
            background: ragOn ? 'var(--accent-tint)' : 'var(--surface)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 11 }}>
            <span
              style={{
                width: 32,
                height: 32,
                borderRadius: 9,
                background: 'var(--accent-tint)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flex: 'none',
                color: 'var(--accent-text)',
              }}
            >
              <Icon name="database" size={16} />
            </span>
            <div style={{ flex: 1, minWidth: 0, paddingTop: 1 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)', marginBottom: 3 }}>
                Retrieval-augmented memory
              </div>
              <div style={{ fontSize: 11.5, lineHeight: 1.5, color: 'var(--mid)' }}>
                Index your pages into an on-device vector store so the assistant can recall relevant passages
                automatically — even from chats and pages you've closed.
                <br />
                <span style={{ color: 'var(--faint)' }}>
                  Experimental feature flag — the indexing pipeline isn't built yet, so enabling this only
                  saves the preference.
                </span>
              </div>
            </div>
            {/* Feature flag gate for the (not-yet-implemented) RAG pipeline.
                TODO(deferred): indexing/embeddings/vector store — see docs/FEATURES.md. */}
            <span style={{ marginTop: 2 }}>{tog('ragMemory', false)}</span>
          </div>
        </div>

        {ragOn && (
          <>
            <div className="group" style={{ marginTop: 9, padding: '9px 11px', display: 'flex', alignItems: 'center', gap: 11 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--ok)', flex: 'none', boxShadow: '0 0 0 3px var(--ok-tint)' }} />
              <div className="row-grow">
                {/* TODO: real index stats. */}
                <div className="row-title">1,284 chunks · 18 pages indexed</div>
                <div className="mono" style={{ fontSize: 10, color: 'var(--faint)' }}>Updated 4 min ago</div>
              </div>
              <button className="btn btn-sm">Reindex</button>
            </div>

            <Group>
              {/* TODO: embeddings model picker. */}
              <Row title="Embeddings model" value="text-embed-3-sm" valueMono chevron onClick={() => {}} />
              <div className="row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: 9 }}>
                  <span className="row-title" style={{ flex: 1 }}>Passages retrieved</span>
                  <span className="mono" style={{ fontSize: 12, color: 'var(--accent-text)', background: 'var(--accent-tint)', padding: '1px 8px', borderRadius: 5 }}>
                    top {topK}
                  </span>
                </div>
                <Slider min={1} max={12} value={topK} onChange={(v) => { setTopK(v); void storageSet(TOPK_KEY, v); }} leftLabel="focused" rightLabel="broad" />
              </div>
              <Row title="Re-rank results" sub="Second pass to sharpen relevance" right={tog('rag_rerank', true)} />
              <Row title="Auto-index on edit" sub="Keep the store fresh as pages change" right={tog('rag_autoindex', true)} />
            </Group>
            {/* TODO: clear the (nonexistent) memory store. */}
            <button className="btn btn-danger-ghost btn-block" style={{ height: 36, marginTop: 9 }}>
              <Icon name="trash" size={13} />
              Clear memory store
            </button>
          </>
        )}

        <SectionLabel>CHAT HISTORY</SectionLabel>
        <Group>
          <div className="row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9 }}>
              <span className="row-title" style={{ flex: 1 }}>Auto-delete chats</span>
              <span className="mono" style={{ fontSize: 12, color: 'var(--accent-text)', background: 'var(--accent-tint)', padding: '1px 8px', borderRadius: 5 }}>
                {historyDays >= 365 ? 'Never' : `${historyDays} days`}
              </span>
              <button className="icon-btn sm" title="Clear all history now" onClick={() => void clearHistory()} style={{ width: 28, height: 24, border: '1px solid var(--err-btn-bd)', background: 'var(--err-bg)', color: 'var(--err-btn)' }}>
                <Icon name="trash" size={13} />
              </button>
            </div>
            <Slider min={7} max={365} value={historyDays} onChange={(v) => { setHistoryDays(v); void storageSet(HISTORY_KEY, v); }} leftLabel="7 days" rightLabel="never" />
          </div>
        </Group>
      </div>
    </div>
  );
}
