import {
  Component,
  useEffect,
  useState,
  type ErrorInfo,
  type ReactNode,
} from 'react';
import type { AppUIMessage } from '@/lib/chat/app-message';
import { createSession, listSessions } from '@/lib/sessions/store';
import { NEW_CHAT_TITLE, type SessionMeta } from '@/lib/sessions/types';
import { getMessages } from '@/lib/storage/message-db';
import { purgeOldSessions } from '@/lib/storage/data-admin';
import { syncCustomProviders } from '@/lib/providers/registry';
import { storageGet } from '@/lib/storage/chrome-storage';
import { ThemeProvider } from './theme/ThemeProvider';
import { useSkills } from './state/useSkills';
import { useModes, type Mode } from './state/useModes';
import { useStyles, type Style } from './state/useStyles';
import { useFlags } from './state/useFlags';
import AppHeader from './components/AppHeader';
import ChatScreen from './screens/ChatScreen';
import SessionsScreen from './screens/SessionsScreen';
import SettingsScreen from './screens/SettingsScreen';
import ContextScreen from './screens/ContextScreen';
import EditBehaviorScreen from './screens/EditBehaviorScreen';
import PrivacyScreen from './screens/PrivacyScreen';
import SkillsPickerScreen from './screens/SkillsPickerScreen';
import SkillsManageScreen from './screens/SkillsManageScreen';
import SkillEditScreen from './screens/SkillEditScreen';
import NewSkillScreen from './screens/NewSkillScreen';
import OnboardingScreen from './screens/OnboardingScreen';
import ProviderConfigScreen from './screens/ProviderConfigScreen';
import CopilotAuthScreen from './screens/CopilotAuthScreen';
import ModesScreen from './screens/ModesScreen';
import ModeEditScreen from './screens/ModeEditScreen';
import StylesScreen from './screens/StylesScreen';
import StyleEditScreen from './screens/StyleEditScreen';
import SystemPromptScreen from './screens/SystemPromptScreen';
import KeyboardShortcutsScreen from './screens/KeyboardShortcutsScreen';
import DefaultModelScreen from './screens/DefaultModelScreen';

export type Route =
  | 'chat'
  | 'sessions'
  | 'settings'
  | 'context'
  | 'editbeh'
  | 'privacy'
  | 'skills'
  | 'skillsManage'
  | 'skillEdit'
  | 'skillNew'
  | 'onboarding'
  | 'provider'
  | 'copilot'
  | 'modes'
  | 'modeEdit'
  | 'styles'
  | 'styleEdit'
  | 'systemPrompt'
  | 'shortcuts'
  | 'defaultModel';

export interface Nav {
  go: (route: Route) => void;
  backToSettings: () => void;
  openProvider: (id: string) => void;
  addProvider: () => void;
  openCopilot: () => void;
  openSkillEditor: (id: string) => void;
  openModeEditor: (mode: Mode) => void;
  openStyleEditor: (style: Style) => void;
}

export default function App() {
  return (
    <ThemeProvider>
      <Shell />
    </ThemeProvider>
  );
}

function Shell() {
  const [route, setRoute] = useState<Route>('chat');
  const [session, setSession] = useState<SessionMeta | null>(null);
  const [initialMessages, setInitialMessages] = useState<AppUIMessage[]>([]);
  const [chatMeta, setChatMeta] = useState({ modelLabel: '', count: 0 });
  const [startupError, setStartupError] = useState<string | null>(null);

  // Parameterized-screen state.
  const [activeProviderId, setActiveProviderId] = useState<string | null>(null);
  const [editSkillId, setEditSkillId] = useState<string | null>(null);
  const [editMode, setEditMode] = useState<Mode | null>(null);
  const [editStyle, setEditStyle] = useState<Style | null>(null);
  const [activeSkillId, setActiveSkillId] = useState<string | null>(null);

  const skills = useSkills();
  const modes = useModes();
  const styles = useStyles();
  const flags = useFlags();

  // Startup: resume the most recent chat, or start fresh.
  useEffect(() => {
    void (async () => {
      try {
        // Register custom providers up front so a send can't race the catalog
        // load and hit an "Unknown provider" for a persisted custom selection.
        await syncCustomProviders().catch(() => {});
        // Honor the "auto-delete chats" retention window before restoring.
        const days = await storageGet<number>('settings.historyDays');
        if (typeof days === 'number') await purgeOldSessions(days);
        const sessions = await listSessions();
        if (sessions[0]) {
          await openSession(sessions[0]);
        } else {
          startFreshChat('');
        }
      } catch (error) {
        console.error('[startup] Failed to restore chat session', error);
        setStartupError(
          error instanceof Error ? error.message : 'Failed to restore session',
        );
        startFreshChat('');
      }
    })();
  }, []);

  async function openSession(target: SessionMeta) {
    const messages = await getMessages(target.id);
    setInitialMessages(messages);
    setSession(target);
    setRoute('chat');
  }

  function newChat() {
    startFreshChat(session?.modelId ?? '');
    setActiveSkillId(null);
    setRoute('chat');
  }

  function startFreshChat(modelId: string) {
    setInitialMessages([]);
    setSession(createSession(modelId));
  }

  const nav: Nav = {
    go: setRoute,
    backToSettings: () => setRoute('settings'),
    openProvider: (id) => {
      setActiveProviderId(id);
      setRoute('provider');
    },
    addProvider: () => {
      setActiveProviderId(null);
      setRoute('provider');
    },
    openCopilot: () => setRoute('copilot'),
    openSkillEditor: (id) => {
      setEditSkillId(id);
      setRoute('skillEdit');
    },
    openModeEditor: (mode) => {
      setEditMode(mode);
      setRoute('modeEdit');
    },
    openStyleEditor: (style) => {
      setEditStyle(style);
      setRoute('styleEdit');
    },
  };

  const headerMeta =
    chatMeta.count > 0
      ? `${chatMeta.modelLabel} · ${chatMeta.count} message${chatMeta.count === 1 ? '' : 's'}`
      : chatMeta.modelLabel;

  return (
    <div className="panel">
      <AppHeader
        title={session?.title ?? NEW_CHAT_TITLE}
        meta={headerMeta}
        onHome={() => setRoute('chat')}
        onSessions={() => setRoute('sessions')}
        onNewChat={newChat}
        onSettings={() => setRoute('settings')}
      />

      {/* Chat stays mounted (hidden) on other routes so an in-flight stream
          isn't aborted by a visit to settings or the session list. */}
      <div
        className="screen"
        style={{ display: route === 'chat' ? 'flex' : 'none' }}
      >
        {startupError && (
          <div className="error-banner" style={{ margin: '8px 14px 0' }}>
            Previous chat could not be restored. Starting a new chat.
          </div>
        )}
        {session && (
          <PanelErrorBoundary key={session.id} onReset={newChat}>
            <ChatScreen
              session={session}
              initialMessages={initialMessages}
              skills={skills.enriched}
              activeSkillId={activeSkillId}
              setActiveSkillId={setActiveSkillId}
              onOpenSkills={() => setRoute('skills')}
              onOpenSettings={() => setRoute('settings')}
              onChatMeta={setChatMeta}
              onNewChat={newChat}
              onSessionMetaChange={(meta) =>
                setSession((current) => (current?.id === meta.id ? meta : current))
              }
            />
          </PanelErrorBoundary>
        )}
      </div>

      {route !== 'chat' && (
        <NonChatScreen
          route={route}
          nav={nav}
          session={session}
          onOpenSession={(s) => void openSession(s)}
          onNewChat={newChat}
          skills={skills}
          modes={modes}
          styles={styles}
          flags={flags}
          activeSkillId={activeSkillId}
          setActiveSkillId={setActiveSkillId}
          editSkillId={editSkillId}
          editMode={editMode}
          editStyle={editStyle}
          activeProviderId={activeProviderId}
        />
      )}
    </div>
  );
}

function NonChatScreen({
  route,
  nav,
  session,
  onOpenSession,
  onNewChat,
  skills,
  modes,
  styles,
  flags,
  activeSkillId,
  setActiveSkillId,
  editSkillId,
  editMode,
  editStyle,
  activeProviderId,
}: {
  route: Route;
  nav: Nav;
  session: SessionMeta | null;
  onOpenSession: (s: SessionMeta) => void;
  onNewChat: () => void;
  skills: ReturnType<typeof useSkills>;
  modes: ReturnType<typeof useModes>;
  styles: ReturnType<typeof useStyles>;
  flags: ReturnType<typeof useFlags>;
  activeSkillId: string | null;
  setActiveSkillId: (id: string | null) => void;
  editSkillId: string | null;
  editMode: Mode | null;
  editStyle: Style | null;
  activeProviderId: string | null;
}) {
  switch (route) {
    case 'sessions':
      return (
        <SessionsScreen
          currentId={session?.id}
          onOpen={onOpenSession}
          onNew={onNewChat}
        />
      );
    case 'settings':
      return <SettingsScreen nav={nav} />;
    case 'context':
      return <ContextScreen nav={nav} flags={flags} />;
    case 'editbeh':
      return <EditBehaviorScreen nav={nav} flags={flags} />;
    case 'privacy':
      return <PrivacyScreen nav={nav} />;
    case 'skills':
      return (
        <SkillsPickerScreen
          nav={nav}
          skills={skills}
          activeSkillId={activeSkillId}
          onRun={(id) => {
            setActiveSkillId(id);
            nav.go('chat');
          }}
        />
      );
    case 'skillsManage':
      return <SkillsManageScreen nav={nav} skills={skills} />;
    case 'skillEdit':
      return (
        <SkillEditScreen nav={nav} skills={skills} editSkillId={editSkillId} />
      );
    case 'skillNew':
      return <NewSkillScreen nav={nav} skills={skills} />;
    case 'onboarding':
      return <OnboardingScreen nav={nav} />;
    case 'provider':
      return <ProviderConfigScreen nav={nav} providerId={activeProviderId} />;
    case 'copilot':
      return <CopilotAuthScreen nav={nav} />;
    case 'modes':
      return <ModesScreen nav={nav} modes={modes} />;
    case 'styles':
      return <StylesScreen nav={nav} styles={styles} onEdit={nav.openStyleEditor} />;
    case 'styleEdit':
      return <StyleEditScreen nav={nav} styles={styles} editStyle={editStyle} />;
    case 'systemPrompt':
      return <SystemPromptScreen nav={nav} />;
    case 'shortcuts':
      return <KeyboardShortcutsScreen nav={nav} />;
    case 'modeEdit':
      return <ModeEditScreen nav={nav} modes={modes} editMode={editMode} />;
    case 'defaultModel':
      return <DefaultModelScreen nav={nav} />;
    default:
      return null;
  }
}

class PanelErrorBoundary extends Component<
  { children: ReactNode; onReset: () => void },
  { error: Error | null }
> {
  state = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[sidepanel] Chat view crashed', error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="empty-state">
        <p>Chat view could not be restored.</p>
        <button className="btn btn-primary" onClick={this.props.onReset}>
          Start New Chat
        </button>
      </div>
    );
  }
}
