import { useEffect, useMemo, useState } from 'react';
import { deleteSession, listSessions } from '@/lib/sessions/store';
import type { SessionMeta } from '@/lib/sessions/types';
import { storageGet, storageSet } from '@/lib/storage/chrome-storage';
import Icon from '../ui/Icon';
import { Button, IconButton } from '../ui/Button';

const BOOKMARKS_KEY = 'settings.bookmarks';

/** Sessions list: search, bookmarked, and date-grouped chats. Wired to the
 *  real session store; bookmarking is persisted locally. */
export default function SessionsScreen({
  currentId,
  onOpen,
  onNew,
}: {
  currentId: string | undefined;
  onOpen: (session: SessionMeta) => void;
  onNew: () => void;
}) {
  const [sessions, setSessions] = useState<SessionMeta[] | null>(null);
  const [query, setQuery] = useState('');
  const [bookmarks, setBookmarks] = useState<string[]>([]);

  useEffect(() => {
    void listSessions().then(setSessions);
    void storageGet<string[]>(BOOKMARKS_KEY).then((b) => b && setBookmarks(b));
  }, []);

  const toggleBookmark = (id: string) => {
    setBookmarks((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      void storageSet(BOOKMARKS_KEY, next);
      return next;
    });
  };

  const remove = async (id: string) => {
    if (!window.confirm('Delete this chat?')) return;
    await deleteSession(id);
    setSessions(await listSessions());
  };

  const filtered = useMemo(() => {
    const list = sessions ?? [];
    const q = query.trim().toLowerCase();
    return q ? list.filter((s) => s.title.toLowerCase().includes(q)) : list;
  }, [sessions, query]);

  const pinned = filtered.filter((s) => bookmarks.includes(s.id));
  const groups = groupByDate(filtered.filter((s) => !bookmarks.includes(s.id)));

  return (
    <div className="screen">
      <div className="screen-head tight">
        <span className="title" style={{ fontSize: 14 }}>Sessions</span>
        <Button small variant="primary" icon="plus" onClick={onNew}>
          New
        </Button>
      </div>

      <div style={{ flex: 'none', padding: '0 14px 10px' }}>
        <div className="search-box">
          <Icon name="search" size={15} color="var(--dim)" />
          <input
            placeholder="Search sessions"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="screen-scroll jc-scroll" style={{ padding: '2px 14px 14px' }}>
        {sessions == null && <div className="row-sub" style={{ padding: 8 }}>Loading…</div>}
        {sessions != null && filtered.length === 0 && (
          <div className="empty-state">
            <p>{query ? 'No chats match your search.' : 'No saved chats yet.'}</p>
          </div>
        )}

        {pinned.length > 0 && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 2px 7px' }}>
              <Icon name="star" size={12} color="var(--star)" />
              <span className="mono" style={{ fontSize: 9.5, color: 'var(--dim)', letterSpacing: '0.05em' }}>
                BOOKMARKED
              </span>
            </div>
            {pinned.map((s) => (
              <div key={s.id} className="session-pinned" onClick={() => onOpen(s)}>
                <div className="session-grow">
                  <div className="session-title">{s.title}</div>
                  <div className="session-snippet">{s.modelId || s.providerId}</div>
                </div>
                <RowActions
                  bookmarked
                  onBookmark={() => toggleBookmark(s.id)}
                  onDelete={() => void remove(s.id)}
                />
                <span className="session-time">{relTime(s.updatedAt)}</span>
              </div>
            ))}
          </>
        )}

        {groups.map((grp) => (
          <div key={grp.label}>
            <div
              className="mono"
              style={{ fontSize: 9.5, color: 'var(--dim)', letterSpacing: '0.05em', padding: '12px 2px 7px' }}
            >
              {grp.label}
            </div>
            {grp.items.map((s) => (
              <div
                key={s.id}
                className={`session-row${s.id === currentId ? ' current' : ''}`}
                onClick={() => onOpen(s)}
              >
                <span className="dot" />
                <div className="session-grow">
                  <div className="session-title">{s.title}</div>
                  <div className="session-snippet">{s.modelId || s.providerId}</div>
                </div>
                <RowActions
                  bookmarked={false}
                  onBookmark={() => toggleBookmark(s.id)}
                  onDelete={() => void remove(s.id)}
                />
                <span className="session-time">{relTime(s.updatedAt)}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function RowActions({
  bookmarked,
  onBookmark,
  onDelete,
}: {
  bookmarked: boolean;
  onBookmark: () => void;
  onDelete: () => void;
}) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', alignSelf: 'center' }} onClick={(e) => e.stopPropagation()}>
      <IconButton
        name="star"
        size={14}
        variant="sm"
        title={bookmarked ? 'Remove bookmark' : 'Bookmark'}
        iconColor={bookmarked ? 'var(--star)' : 'var(--dim)'}
        onClick={onBookmark}
      />
      <IconButton name="trash" size={14} variant="sm" title="Delete" iconColor="var(--dim)" onClick={onDelete} />
    </span>
  );
}

interface DateGroup {
  label: string;
  items: SessionMeta[];
}

function groupByDate(sessions: SessionMeta[]): DateGroup[] {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 86_400_000;
  const today: SessionMeta[] = [];
  const yesterday: SessionMeta[] = [];
  const earlier: SessionMeta[] = [];
  for (const s of sessions) {
    if (s.updatedAt >= startOfToday) today.push(s);
    else if (s.updatedAt >= startOfYesterday) yesterday.push(s);
    else earlier.push(s);
  }
  return [
    { label: 'TODAY', items: today },
    { label: 'YESTERDAY', items: yesterday },
    { label: 'EARLIER', items: earlier },
  ].filter((g) => g.items.length > 0);
}

function relTime(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}
