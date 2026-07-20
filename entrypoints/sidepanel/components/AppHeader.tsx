import { IconButton } from '../ui/Button';

/**
 * The persistent top bar shown above every screen: J logo (home), the active
 * session title + meta, and the sessions / new-chat / settings nav.
 */
export default function AppHeader({
  title,
  meta,
  onHome,
  onSessions,
  onNewChat,
  onSettings,
}: {
  title: string;
  meta: string;
  onHome: () => void;
  onSessions: () => void;
  onNewChat: () => void;
  onSettings: () => void;
}) {
  return (
    <header className="app-header">
      <button className="app-logo" title="Home" onClick={onHome}>
        <span>J</span>
      </button>
      <div className="app-title">
        <div className="t">{title}</div>
        <div className="m">{meta}</div>
      </div>
      <IconButton name="menu" size={17} title="Sessions" onClick={onSessions} />
      <IconButton name="plus" size={18} title="New chat" onClick={onNewChat} />
      <IconButton name="gear" size={17} title="Settings" onClick={onSettings} />
    </header>
  );
}
