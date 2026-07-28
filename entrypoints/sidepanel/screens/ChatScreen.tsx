import { useEffect, useMemo, useRef, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import type { AppUIMessage } from '@/lib/chat/app-message';
import { LocalChatTransport } from '@/lib/chat/transport';
import { resolveVariant } from '@/lib/providers/model-groups';
import { saveSessionMeta } from '@/lib/sessions/store';
import { pageToolModule } from '@/lib/tools/page-tools';
import { BROWSER_CONTROL_MODULE_ID } from '@/lib/agent-tools/browser-control';
import { generateSessionTitle } from '@/lib/sessions/auto-title';
import { NEW_CHAT_TITLE, type SessionMeta } from '@/lib/sessions/types';
import { saveMessages } from '@/lib/storage/message-db';
import { storageGet, storageSet } from '@/lib/storage/chrome-storage';
import { installDevBridge } from '../dev-bridge';
import { estimateUsage, usageFromReal, fmtTokens, fmtContext } from '../state/usage';
import { useSessionUsage } from '../state/useSessionUsage';
import { parseFrontMatter, type EnrichedSkill } from '../state/useSkills';
import { useModes } from '../state/useModes';
import { useStyles } from '../state/useStyles';
import { usePresets } from '../state/usePresets';
import { usePageAccess } from '../state/usePageAccess';
import { useModelCatalog } from '../state/useModelCatalog';
import Icon from '../ui/Icon';
import { Segmented } from '../ui/controls';
import MessageList from '../components/MessageList';
import QuickMenu, { anchoredMenuStyle, type QuickMenuItem } from '../components/QuickMenu';
import { SYSTEM_PROMPT_KEY } from './SystemPromptScreen';
import {
  buildModelItems,
  DEFAULT_FAMILY_KEY,
  DEFAULT_FAMILY_LABEL_KEY,
  DEFAULT_PROVIDER_KEY,
} from '../state/model-menu';

type QuickKind = 'mode' | 'style' | 'preset';

export default function ChatScreen({
  session,
  initialMessages,
  skills,
  activeSkillId,
  setActiveSkillId,
  onOpenSkills,
  onOpenSettings,
  onChatMeta,
  onNewChat,
  onSessionMetaChange,
}: {
  session: SessionMeta;
  initialMessages: AppUIMessage[];
  skills: EnrichedSkill[];
  activeSkillId: string | null;
  setActiveSkillId: (id: string | null) => void;
  onOpenSkills: () => void;
  onOpenSettings: () => void;
  onChatMeta: (meta: { modelLabel: string; count: number }) => void;
  onNewChat?: () => void;
  onSessionMetaChange: (meta: SessionMeta) => void;
}) {
  const { providerGroups, choices, loading } = useModelCatalog();
  const sessionUsage = useSessionUsage(session.id);
  const modes = useModes();
  const styles = useStyles();
  const presets = usePresets();
  const pageAccess = usePageAccess();

  const [providerId, setProviderId] = useState(session.providerId);
  const [family, setFamily] = useState(session.modelId);

  // Personalization selections (session-local).
  const [activeModeId, setActiveModeId] = useState<string | null>(null);
  const [activeStyleId, setActiveStyleId] = useState<string | null>(null);
  const [systemPrompt, setSystemPrompt] = useState('');
  const [pageContext, setPageContext] = useState(true);

  // Composer + chrome UI state.
  const [composer, setComposer] = useState('');
  const [focused, setFocused] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [usageHover, setUsageHover] = useState(false);
  const [pageTitle, setPageTitle] = useState('this page');

  // Model picker popup (animated).
  const [modelMenu, setModelMenu] = useState(false);
  const [modelPhase, setModelPhase] = useState<'start' | 'open' | 'out' | null>(null);
  const [modelActive, setModelActive] = useState(0);
  const [modelAnchor, setModelAnchor] = useState<DOMRect | null>(null);
  const modelTileRef = useRef<HTMLButtonElement>(null);
  const modelMenuRef = useRef<HTMLDivElement>(null);
  const modelCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // MODE / STYLE / PRESET dropdowns (simple anchored popovers).
  const [quickKind, setQuickKind] = useState<QuickKind | null>(null);
  const [quickAnchor, setQuickAnchor] = useState<DOMRect | null>(null);

  const providerGroup = providerGroups.find((pg) => pg.providerId === providerId);
  const group = providerGroup?.groups.find((g) => g.family === family);
  const resolvedModel = useMemo(
    () => (group ? resolveVariant(group, choices) : undefined),
    [group, choices],
  );
  const resolvedModelId = resolvedModel?.id ?? family;
  const modelLabel = group?.label ?? family ?? 'Model';

  const modelItems = useMemo(
    () => buildModelItems(providerGroups, choices),
    [providerGroups, choices],
  );

  const activeMode = modes.modes.find((m) => m.id === activeModeId) ?? null;
  const activeStyle = styles.styles.find((s) => s.id === activeStyleId) ?? null;
  const activeSkill = skills.find((s) => s.id === activeSkillId) ?? null;

  const metaRef = useRef<SessionMeta>(session);
  const resolvedRef = useRef(resolvedModelId);
  resolvedRef.current = resolvedModelId;
  const familyRef = useRef(family);
  familyRef.current = family;

  // Fresh per-request config for the transport (read at send time).
  const personalizationRef = useRef({});
  personalizationRef.current = {
    global: systemPrompt || undefined,
    mode: activeMode?.prompt,
    style: activeStyle?.prompt,
    skill: activeSkill ? parseFrontMatter(activeSkill.text).body : undefined,
  };
  const temperatureRef = useRef<number | undefined>(undefined);
  temperatureRef.current = activeMode?.temp;
  // Page-reading tools are available when the page chip is attached AND the
  // active mode (if any) permits reading the page.
  const pageToolsAllowed = pageContext && (activeMode ? activeMode.tools.read : true);
  const pageToolsAllowedRef = useRef(pageToolsAllowed);
  pageToolsAllowedRef.current = pageToolsAllowed;

  // Dev-only extra tool modules injected via the dev bridge (setToolModules)
  // without persisting them. Empty in production.
  const devToolModulesRef = useRef<string[]>([]);
  const effectiveToolModules = () => {
    const base = [
      ...new Set([
        ...metaRef.current.enabledToolModules,
        ...devToolModulesRef.current,
      ]),
    ];
    return pageToolsAllowedRef.current
      ? base
      : base.filter((id) => id !== pageToolModule.id);
  };

  const [transport] = useState(
    () =>
      new LocalChatTransport(() => {
        return {
          sessionId: session.id,
          providerId: metaRef.current.providerId,
          modelId: resolvedRef.current,
          toolModules: effectiveToolModules(),
          personalization: personalizationRef.current,
          temperature: temperatureRef.current,
        };
      }),
  );

  const { messages, sendMessage, status, stop, error, regenerate } =
    useChat<AppUIMessage>({
      id: session.id,
      messages: initialMessages,
      transport,
    });

  useEffect(() => () => {
    void transport.dispose();
  }, [transport]);

  // Auto-scroll the feed to the latest content as it streams.
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, status]);

  // Dev-only bridge (CDP harness).
  const sendRef = useRef(sendMessage);
  sendRef.current = sendMessage;
  const stopRef = useRef(stop);
  stopRef.current = stop;
  const statusRef = useRef(status);
  statusRef.current = status;
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const errorRef = useRef(error);
  errorRef.current = error;
  const newChatRef = useRef(onNewChat);
  newChatRef.current = onNewChat;
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    installDevBridge({
      send: (text) => void sendRef.current({ text }),
      stop: () => void stopRef.current(),
      getStatus: () => statusRef.current,
      getMessages: () => messagesRef.current,
      getModel: () => resolvedRef.current,
      getDiagnostics: () => ({
        status: statusRef.current,
        ...(errorRef.current ? { error: errorRef.current.message } : {}),
        toolModules: effectiveToolModules(),
      }),
      setToolModules: (ids) => {
        devToolModulesRef.current = ids;
      },
      newChat: async () => {
        await transport.dispose();
        newChatRef.current?.();
      },
    });
  }, []);

  // Report header meta (model · message count) up to the shell.
  useEffect(() => {
    onChatMeta({ modelLabel, count: messages.length });
  }, [modelLabel, messages.length, onChatMeta]);

  // Load the global system prompt and keep it fresh across edits.
  useEffect(() => {
    void storageGet<string>(SYSTEM_PROMPT_KEY).then((v) => setSystemPrompt(v ?? ''));
    const handler = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ) => {
      if (area === 'local' && changes[SYSTEM_PROMPT_KEY]) {
        setSystemPrompt((changes[SYSTEM_PROMPT_KEY].newValue as string) ?? '');
      }
    };
    chrome.storage.onChanged.addListener(handler);
    return () => chrome.storage.onChanged.removeListener(handler);
  }, []);

  // Keep the context chip aligned with the active tab while the persistent
  // side panel remains open across tab switches.
  useEffect(() => {
    const refreshPageTitle = () => {
      chrome.tabs?.query({ active: true, lastFocusedWindow: true }, (tabs) => {
        const title = tabs?.[0]?.title;
        if (title) setPageTitle(title);
      });
    };
    refreshPageTitle();
    chrome.tabs?.onActivated.addListener(refreshPageTitle);
    return () => chrome.tabs?.onActivated.removeListener(refreshPageTitle);
  }, []);

  // Once the catalog is loaded, make sure the selected (provider, family) is
  // valid; otherwise fall back to the stored default or the first available.
  useEffect(() => {
    if (loading) return;
    // Only consider providers that actually have model families.
    const usable = providerGroups.filter((pg) => pg.groups.length > 0);
    if (usable.length === 0) return;
    const has = (pid: string, fam: string) =>
      usable.some(
        (pg) => pg.providerId === pid && pg.groups.some((g) => g.family === fam),
      );
    if (has(providerId, family)) return;
    void (async () => {
      const [defP, defF] = await Promise.all([
        storageGet<string>(DEFAULT_PROVIDER_KEY),
        storageGet<string>(DEFAULT_FAMILY_KEY),
      ]);
      const pick = (): [string, string] => {
        if (defP && defF && has(defP, defF)) return [defP, defF];
        // Legacy: session.modelId may be a variant id — map it back to a family.
        for (const pg of usable) {
          const g = pg.groups.find((x) => x.variants.some((v) => v.id === family));
          if (g) return [pg.providerId, g.family];
        }
        if (defF) {
          for (const pg of usable) {
            const g = pg.groups.find((x) => x.family === defF);
            if (g) return [pg.providerId, g.family];
          }
        }
        const first = usable[0];
        return [first.providerId, first.groups[0].family];
      };
      const [np, nf] = pick();
      setProviderId(np);
      setFamily(nf);
      metaRef.current = { ...metaRef.current, providerId: np, modelId: nf };
    })();
  }, [loading, providerGroups]); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist messages + session meta whenever the conversation settles.
  useEffect(() => {
    if (status === 'streaming' || messages.length === 0) return;
    void (async () => {
      await saveMessages(session.id, messages);
      let meta: SessionMeta = {
        ...metaRef.current,
        modelId: familyRef.current || metaRef.current.modelId,
        updatedAt: Date.now(),
      };
      if (meta.title === NEW_CHAT_TITLE) {
        const firstUserText = textOf(messages.find((m) => m.role === 'user'));
        if (firstUserText) meta = { ...meta, title: firstUserText.slice(0, 60) };
      }
      metaRef.current = meta;
      await saveSessionMeta(meta);
      onSessionMetaChange(meta);
    })();
  }, [messages, status, session.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-title after the first exchange (best-effort).
  const autoTitledRef = useRef(session.title !== NEW_CHAT_TITLE);
  useEffect(() => {
    if (autoTitledRef.current || status !== 'ready') return;
    const userText = textOf(messages.find((m) => m.role === 'user'));
    const assistantText = textOf(messages.find((m) => m.role === 'assistant'));
    if (!userText || !assistantText) return;
    autoTitledRef.current = true;
    void (async () => {
      const title = await generateSessionTitle(
        metaRef.current.providerId,
        resolvedRef.current,
        userText,
        assistantText,
      );
      if (title) {
        const meta = { ...metaRef.current, title };
        metaRef.current = meta;
        await saveSessionMeta(meta);
        onSessionMetaChange(meta);
      }
    })();
  }, [status, messages]); // eslint-disable-line react-hooks/exhaustive-deps

  const changeModel = (pid: string, fam: string) => {
    setProviderId(pid);
    setFamily(fam);
    void storageSet(DEFAULT_PROVIDER_KEY, pid);
    void storageSet(DEFAULT_FAMILY_KEY, fam);
    const label =
      providerGroups
        .find((pg) => pg.providerId === pid)
        ?.groups.find((g) => g.family === fam)?.label ?? fam;
    void storageSet(DEFAULT_FAMILY_LABEL_KEY, label);
    metaRef.current = { ...metaRef.current, providerId: pid, modelId: fam };
    if (messages.length > 0) void saveSessionMeta(metaRef.current);
  };

  // Animate the popup out (phase 'out'), then unmount once the transition ends.
  const closeModelMenu = () => {
    setModelPhase((p) => (p === null || p === 'out' ? p : 'out'));
    if (modelCloseTimer.current) clearTimeout(modelCloseTimer.current);
    modelCloseTimer.current = setTimeout(() => {
      modelCloseTimer.current = null;
      setModelMenu(false);
      setModelPhase(null);
    }, 200);
  };
  const openModelMenu = () => {
    if (modelMenu) {
      closeModelMenu();
      return;
    }
    if (modelCloseTimer.current) {
      clearTimeout(modelCloseTimer.current);
      modelCloseTimer.current = null;
    }
    setQuickKind(null);
    setModelAnchor(modelTileRef.current?.getBoundingClientRect() ?? null);
    setModelActive(
      Math.max(
        0,
        modelItems.findIndex((m) => m.providerId === providerId && m.family === family),
      ),
    );
    setModelMenu(true);
    setModelPhase('start');
    requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        setModelPhase((p) => (p === 'start' ? 'open' : p)),
      ),
    );
  };
  const pickModel = (pid: string, fam: string) => {
    changeModel(pid, fam);
    closeModelMenu();
  };

  const modelKbdRef = useRef({ close: closeModelMenu, pick: pickModel, items: modelItems, active: modelActive });
  modelKbdRef.current = { close: closeModelMenu, pick: pickModel, items: modelItems, active: modelActive };

  // Collapsing the quick panel dismisses the popups immediately.
  useEffect(() => {
    if (!quickOpen) {
      if (modelCloseTimer.current) {
        clearTimeout(modelCloseTimer.current);
        modelCloseTimer.current = null;
      }
      setModelMenu(false);
      setModelPhase(null);
      setQuickKind(null);
    }
  }, [quickOpen]);

  // Keyboard navigation for the open model popup.
  useEffect(() => {
    if (!modelMenu) return;
    const onKey = (e: KeyboardEvent) => {
      const api = modelKbdRef.current;
      if (e.key === 'Escape') {
        e.preventDefault();
        api.close();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setModelActive((i) => Math.min(i + 1, api.items.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setModelActive((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const it = api.items[api.active];
        if (it) api.pick(it.providerId, it.family);
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [modelMenu]);

  // Keep the keyboard-highlighted model row in view.
  useEffect(() => {
    if (!modelMenu) return;
    const el = modelMenuRef.current?.querySelector('[data-active="true"]');
    (el as HTMLElement | null)?.scrollIntoView({ block: 'nearest' });
  }, [modelActive, modelMenu]);

  useEffect(
    () => () => {
      if (modelCloseTimer.current) clearTimeout(modelCloseTimer.current);
    },
    [],
  );

  const openQuick = (kind: QuickKind, e: React.MouseEvent<HTMLButtonElement>) => {
    setModelMenu(false);
    setQuickAnchor(e.currentTarget.getBoundingClientRect());
    setQuickKind((k) => (k === kind ? null : kind));
  };

  // ---- no providers connected ----
  if (!loading && providerGroups.length === 0) {
    return (
      <div className="empty-state">
        <Icon name="github" size={34} color="var(--mid)" />
        <p style={{ fontSize: 13.5, color: 'var(--mid)', lineHeight: 1.5 }}>
          Connect GitHub Copilot or add a provider (Ollama, OpenAI, …) to start chatting.
        </p>
        <button className="btn btn-primary" onClick={onOpenSettings}>
          Open Settings
        </button>
      </div>
    );
  }

  const streaming = status === 'submitted' || status === 'streaming';
  // Prefer measured usage once a turn has completed; estimate until then.
  const usage =
    sessionUsage && sessionUsage.cumIn + sessionUsage.cumOut > 0
      ? usageFromReal(sessionUsage, resolvedModel)
      : estimateUsage(messages, resolvedModel);

  // Slash autosuggest.
  const slashActive = composer.charAt(0) === '/';
  const slashQuery = slashActive ? composer.slice(1).toLowerCase().trim() : '';
  const slashSkills = slashActive
    ? skills.filter((k) => (k.name + ' ' + k.title).toLowerCase().includes(slashQuery))
    : [];

  const doSend = () => {
    const text = composer.trim();
    if (!text || !resolvedModelId || streaming) return;
    void sendMessage({ text });
    setComposer('');
  };

  const scope: 'page' | 'all' = pageAccess.granted ? 'all' : 'page';
  const scopeOptions = [
    { value: 'page' as const, label: 'This page' },
    { value: 'all' as const, label: 'All pages' },
  ];
  const changeScope = (v: 'page' | 'all') => {
    if ((v === 'all') !== Boolean(pageAccess.granted)) void pageAccess.toggle();
  };

  // BROWSER CONTROL — enables the opt-in browser-control tool module (click,
  // type, navigate) for this chat. Persisted per session in enabledToolModules;
  // the transport reads it from metaRef at send time.
  const [browserControl, setBrowserControl] = useState(
    session.enabledToolModules.includes(BROWSER_CONTROL_MODULE_ID),
  );
  const bcOptions = [
    { value: 'off' as const, label: 'Off' },
    { value: 'on' as const, label: 'On' },
  ];
  const toggleBrowserControl = (v: 'off' | 'on') => {
    const on = v === 'on';
    const modules = new Set(metaRef.current.enabledToolModules);
    if (on) modules.add(BROWSER_CONTROL_MODULE_ID);
    else modules.delete(BROWSER_CONTROL_MODULE_ID);
    const meta = {
      ...metaRef.current,
      enabledToolModules: [...modules],
      browserControlConfigured: true,
    };
    metaRef.current = meta;
    setBrowserControl(on);
    // Persist only once the session is real (has messages); a fresh chat gets
    // saved on its first send, which already includes enabledToolModules.
    if (messages.length > 0) {
      void saveSessionMeta(meta);
      onSessionMetaChange(meta);
    }
  };

  // Items for the MODE/STYLE/PRESET popover.
  const quickItems: QuickMenuItem[] =
    quickKind === 'mode'
      ? [
          { key: '', label: 'None', selected: !activeModeId },
          ...modes.modes.map((m) => ({ key: m.id, label: m.name, sub: m.desc, selected: m.id === activeModeId })),
        ]
      : quickKind === 'style'
        ? [
            { key: '', label: 'None', selected: !activeStyleId },
            ...styles.styles.map((s) => ({ key: s.id, label: s.name, sub: s.desc, selected: s.id === activeStyleId })),
          ]
        : quickKind === 'preset'
          ? presets.presets.map((p) => ({
              key: p.id,
              label: p.name,
              sub: presetSub(p, modes, styles),
              selected: p.modeId === activeModeId && p.styleId === activeStyleId,
            }))
          : [];

  const pickQuick = (key: string) => {
    if (quickKind === 'mode') setActiveModeId(key || null);
    else if (quickKind === 'style') setActiveStyleId(key || null);
    else if (quickKind === 'preset') {
      const p = presets.presets.find((x) => x.id === key);
      if (p) {
        setActiveModeId(p.modeId ?? null);
        setActiveStyleId(p.styleId ?? null);
      }
    }
    setQuickKind(null);
  };

  const activePreset = presets.presets.find(
    (p) => p.modeId === activeModeId && p.styleId === activeStyleId,
  );
  const presetLabel = activePreset ? activePreset.name : activeModeId || activeStyleId ? 'Custom' : 'None';
  const metaSummary = [activeMode?.name, activeStyle?.name].filter(Boolean).join(' · ') || 'Default';

  return (
    <>
      <div className="chat-scroll jc-scroll" ref={scrollRef}>
        {/* Context banner */}
        <div className="ctx-banner">
          <Icon name="file" size={13} color="var(--faint)" />
          <span className="label">
            {pageContext ? (
              <>
                Reading <b style={{ color: 'var(--text2)', fontWeight: 600 }}>{pageTitle}</b> ·{' '}
                {scope === 'page' ? 'this page' : 'all pages'}
              </>
            ) : (
              <>Page context off</>
            )}
          </span>
          <span className="count">{fmtTokens(usage.usedTokens)} ctx</span>
        </div>

        <MessageList
          messages={messages}
          status={status}
          onRegenerate={() => void regenerate()}
        />

        {error && (
          <div className="assistant" style={{ marginTop: 16 }}>
            <div className="err-card">
              <Icon name="alert" size={16} color="var(--err-btn)" style={{ flex: 'none', marginTop: 1 }} />
              <div style={{ flex: 1 }}>
                <div className="title">Request failed</div>
                <div className="text">{error.message}</div>
                <div style={{ display: 'flex', gap: 7, marginTop: 8 }}>
                  <button className="err-btn" onClick={() => void regenerate()}>
                    Retry
                  </button>
                  {/auth|token|sign|401|forbidden/i.test(error.message) && (
                    <button className="err-btn ghost" onClick={onOpenSettings}>
                      Open Settings
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="composer-wrap">
        {/* Quick settings rollout — 2-column tile grid. */}
        <div
          className="quick-roll"
          style={{ maxHeight: quickOpen ? 400 : 0, opacity: quickOpen ? 1 : 0 }}
        >
          <div className="quick-grid" data-open={quickOpen}>
            {/* MODEL — real catalog across every connected provider. */}
            <button
              ref={modelTileRef}
              className="quick-tile"
              data-open={modelMenu && modelPhase !== 'out'}
              onClick={openModelMenu}
            >
              <span className="top">
                <span className="dot" style={{ background: 'oklch(0.70 0.13 300)' }} />
                <span className="k">MODEL</span>
              </span>
              <span className="bottom">
                <span className="v">{modelLabel}</span>
                <Icon name="chevron-down" size={11} strokeWidth={2.2} className="chev" />
              </span>
            </button>

            <QuickTile label="MODE" value={activeMode?.name ?? 'None'} hue={150} open={quickKind === 'mode'} onClick={(e) => openQuick('mode', e)} />
            <QuickTile label="STYLE" value={activeStyle?.name ?? 'None'} hue={65} open={quickKind === 'style'} onClick={(e) => openQuick('style', e)} />
            <QuickTile label="PRESET" value={presetLabel} hue={240} open={quickKind === 'preset'} onClick={(e) => openQuick('preset', e)} />

            {/* SCOPE — mapped to the real all-sites host permission. */}
            <div className="quick-toggle">
              <span className="top">
                <span className="dot" style={{ background: 'oklch(0.70 0.13 190)' }} />
                <span className="k">SCOPE</span>
              </span>
              <div className="seg">
                <Segmented options={scopeOptions} value={scope} onChange={changeScope} bare />
              </div>
            </div>

            {/* BROWSER CONTROL — toggles the opt-in browser-control tool module. */}
            <div className="quick-toggle">
              <span className="top">
                <span className="dot" style={{ background: 'oklch(0.72 0.16 40)' }} />
                <span className="k">CONTROL</span>
              </span>
              <div className="seg">
                <Segmented
                  options={bcOptions}
                  value={browserControl ? 'on' : 'off'}
                  onChange={toggleBrowserControl}
                  bare
                />
              </div>
            </div>

            {/* Model popup (fixed-position; sits outside the grid flow). */}
            {modelMenu && (
              <>
                <div className="model-menu-backdrop" onClick={closeModelMenu} />
                <div
                  ref={modelMenuRef}
                  className="model-menu jc-scroll"
                  data-phase={modelPhase ?? 'start'}
                  style={anchoredMenuStyle(modelAnchor)}
                >
                  {modelItems.length === 0 ? (
                    <div style={{ padding: '10px 8px', fontSize: 11.5, color: 'var(--faint)' }}>
                      No models available.
                    </div>
                  ) : (
                    modelItems.map((m, i) => (
                      <div key={`${m.providerId}:${m.family}`}>
                        {m.firstInVendor && (
                          <div className="model-menu-sec">{m.section}</div>
                        )}
                        <button
                          className="model-menu-item"
                          data-selected={m.providerId === providerId && m.family === family}
                          data-active={i === modelActive}
                          style={{ transitionDelay: modelPhase === 'open' ? `${45 + i * 20}ms` : '0ms' }}
                          onMouseEnter={() => setModelActive(i)}
                          onClick={() => pickModel(m.providerId, m.family)}
                        >
                          <span className="dot" style={{ background: `oklch(0.70 0.13 ${m.hue})` }} />
                          <span className="grow">
                            <span className="label">{m.label}</span>
                            {m.sub && <span className="sub">{m.sub}</span>}
                          </span>
                          {m.providerId === providerId && m.family === family && (
                            <Icon name="check" size={13} color="var(--accent-text)" strokeWidth={2.6} />
                          )}
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}

            {/* MODE / STYLE / PRESET popover */}
            {quickKind && (
              <QuickMenu
                anchor={quickAnchor}
                items={quickItems}
                onPick={pickQuick}
                onClose={() => setQuickKind(null)}
                empty={quickKind === 'preset' ? 'No presets saved.' : 'None available.'}
              />
            )}
          </div>
        </div>

        {/* Context chips */}
        <div className="chips">
          {pageContext ? (
            <span className="chip">
              <Icon name="file-plain" size={11} />
              @{pageTitle.length > 18 ? pageTitle.slice(0, 18) + '…' : pageTitle}
              <span
                className="x"
                role="button"
                title="Detach page context"
                onClick={() => setPageContext(false)}
              >
                <Icon name="x" size={10} />
              </span>
            </span>
          ) : (
            <button className="chip-add" onClick={() => setPageContext(true)}>
              <Icon name="plus" size={11} />
              Add page
            </button>
          )}
          {/* Skill affordance: an active-skill chip, or a dashed "Use skill" launcher. */}
          {activeSkill ? (
            <span className="chip">
              <Icon name="zap" size={11} />
              {activeSkill.title}
              <span
                className="x"
                role="button"
                title="Deactivate skill"
                onClick={() => setActiveSkillId(null)}
              >
                <Icon name="x" size={10} />
              </span>
            </span>
          ) : (
            <button className="chip-add" onClick={onOpenSkills}>
              <Icon name="zap" size={11} />
              Use skill
            </button>
          )}
        </div>

        {/* Slash autosuggest */}
        {slashActive && slashSkills.length > 0 && (
          <div className="slash-pop">
            <div className="head">SKILLS</div>
            {slashSkills.map((sk) => (
              <button
                key={sk.id}
                className="slash-item"
                onMouseDown={() => {
                  setActiveSkillId(sk.id);
                  setComposer('');
                }}
              >
                <span className="slash-dot" style={{ background: sk.color }} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>
                    {sk.title}
                  </span>
                  <span
                    style={{
                      display: 'block',
                      fontSize: 11,
                      color: 'var(--faint)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {sk.desc}
                  </span>
                </span>
                <span className="badge">{sk.slashLabel}</span>
              </button>
            ))}
          </div>
        )}

        {/* Input box */}
        <div className={`input-box${focused ? ' focused' : ''}`}>
          <textarea
            value={composer}
            placeholder="Ask anything, or / for a skill…"
            rows={1}
            onChange={(e) => {
              setComposer(e.target.value);
              const el = e.currentTarget;
              el.style.height = 'auto';
              el.style.height = Math.min(el.scrollHeight, 120) + 'px';
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                doSend();
              }
            }}
          />
          <div className="input-row">
            {/* TODO(deferred): file/image attachments (see docs/FEATURES.md).
                When built: gate image files by the selected model's vision
                capability (disable + explain on hover); always allow text-like
                files (.txt/.md/.csv/…). */}
            <button className="icon-btn sm" title="Attach (coming soon)" style={{ color: 'var(--faint)' }} disabled>
              <Icon name="paperclip" size={16} />
            </button>
            <button className="icon-btn sm" title="Skills" style={{ color: 'var(--faint)' }} onClick={onOpenSkills}>
              <Icon name="zap" size={15} />
            </button>
            <span className="spacer" />
            {streaming ? (
              <button className="send-btn stop" title="Stop" onClick={() => void stop()}>
                <Icon name="x" size={16} strokeWidth={2.2} />
              </button>
            ) : (
              <button
                className="send-btn"
                data-active={composer.trim().length > 0}
                title="Send"
                onClick={doSend}
              >
                <Icon name="send" size={16} />
              </button>
            )}
          </div>
        </div>

        {/* Meta row */}
        <div className="meta-row">
          <button
            className="model-chip"
            data-open={quickOpen}
            onClick={() => setQuickOpen((v) => !v)}
          >
            <span className="dot" />
            <span className="name">{modelLabel}</span>
            <Icon
              name="chevron-down"
              size={11}
              color="var(--faint)"
              strokeWidth={2.4}
              style={{ transform: quickOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}
            />
          </button>
          <span className="preset">{metaSummary}</span>
          <span className="spacer" />

          <div
            className="usage-trigger"
            onMouseEnter={() => setUsageHover(true)}
            onMouseLeave={() => setUsageHover(false)}
          >
            {usageHover && (
              <div className="usage-pop">
                <div className="pop-head">
                  <span className="cap">CONTEXT WINDOW</span>
                  <span className="pct">{usage.pct}%</span>
                </div>
                <div className="track">
                  <span style={{ width: `${usage.pct}%` }} />
                </div>
                <div className="scale">
                  <span>{fmtTokens(usage.usedTokens)} used</span>
                  <span>{fmtContext(usage.maxTokens)} limit</span>
                </div>
                <div className="divider" />
                <div className="lines">
                  <div className="line">
                    <span className="l">This message</span>
                    <span className="r">{usage.messageCost}</span>
                  </div>
                  <div className="line">
                    <span className="l">Session total</span>
                    <span className="r">{usage.sessionCost}</span>
                  </div>
                  <div className="line">
                    <span className="l">Tokens in · out</span>
                    <span className="r">
                      {fmtTokens(usage.tokensIn)} · {fmtTokens(usage.tokensOut)}
                    </span>
                  </div>
                </div>
                <div style={{ marginTop: 7, fontSize: 9.5, color: 'var(--faint)', textAlign: 'right' }}>
                  {usage.measured ? 'Measured from provider usage' : 'Estimated until first reply'}
                </div>
              </div>
            )}
            <span className="usage-cost">{usage.sessionCost}</span>
            <span className="usage-sep" />
            <span className="usage-bar">
              <span style={{ width: `${usage.pct}%` }} />
            </span>
          </div>
        </div>
      </div>
    </>
  );
}

/** A quick-settings tile that opens a dropdown (MODE / STYLE / PRESET). */
function QuickTile({
  label,
  value,
  hue,
  open,
  onClick,
}: {
  label: string;
  value: string;
  hue: number;
  open: boolean;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button className="quick-tile" data-open={open} onClick={onClick}>
      <span className="top">
        <span className="dot" style={{ background: `oklch(0.70 0.13 ${hue})` }} />
        <span className="k">{label}</span>
      </span>
      <span className="bottom">
        <span className="v">{value}</span>
        <Icon name="chevron-down" size={11} strokeWidth={2.2} className="chev" />
      </span>
    </button>
  );
}

function presetSub(
  preset: { modeId?: string; styleId?: string },
  modes: ReturnType<typeof useModes>,
  styles: ReturnType<typeof useStyles>,
): string {
  const mode = modes.modes.find((m) => m.id === preset.modeId)?.name;
  const style = styles.styles.find((s) => s.id === preset.styleId)?.name;
  return [mode, style].filter(Boolean).join(' · ');
}

function textOf(message: AppUIMessage | undefined): string {
  if (!message) return '';
  return message.parts
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join(' ')
    .trim();
}
