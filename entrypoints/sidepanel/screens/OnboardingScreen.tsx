import type { Nav } from '../App';
import { useProviders } from '../state/providers';
import Icon from '../ui/Icon';

/** First-run provider connection. Copilot uses device auth; any other provider
 *  is a custom OpenAI-compatible endpoint added via the config screen. */
export default function OnboardingScreen({ nav }: { nav: Nav }) {
  const providers = useProviders();
  return (
    <div className="onboard jc-scroll">
      <div className="onboard-logo">
        <span>J</span>
      </div>
      <div style={{ fontSize: 21, fontWeight: 700, color: 'var(--text)', lineHeight: 1.2, marginBottom: 8 }}>
        Welcome to J Chat
      </div>
      <div style={{ fontSize: 13.5, lineHeight: 1.55, color: 'var(--mid)', marginBottom: 22 }}>
        Connect an AI provider to start chatting with any page you're on. Your keys stay on this device.
      </div>

      <div className="mono" style={{ fontSize: 9.5, color: 'var(--dim)', letterSpacing: '0.05em', marginBottom: 10 }}>
        CONNECT A PROVIDER
      </div>
      {providers.map((p) => (
        <button
          key={p.id}
          className="provider-row"
          style={{ width: '100%', textAlign: 'left' }}
          onClick={() => (p.isCopilot ? nav.openCopilot() : nav.openProvider(p.id))}
        >
          <span className="provider-avatar" style={{ background: p.tint, width: 32, height: 32, borderRadius: 9, fontSize: 14 }}>
            {p.initial}
          </span>
          <span style={{ flex: 1, fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>{p.name}</span>
          <Icon name="chevron-right" size={15} color="var(--dim)" strokeWidth={2.2} />
        </button>
      ))}
      <button
        className="dashed-btn"
        style={{ marginTop: 8 }}
        onClick={() => nav.addProvider()}
      >
        <Icon name="plus" size={14} strokeWidth={2.2} />
        Add a custom provider
      </button>
      <button
        className="btn btn-danger-ghost"
        style={{ marginTop: 8, color: 'var(--mid)', alignSelf: 'flex-start', background: 'none', border: 'none' }}
        onClick={() => nav.go('chat')}
      >
        Skip for now →
      </button>
    </div>
  );
}
