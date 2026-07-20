import { useEffect, useRef, useState } from 'react';
import type { Nav } from '../App';
import { copilotProvider } from '@/lib/providers/copilot';
import { useAuthState } from '../hooks';
import Icon from '../ui/Icon';
import { Button } from '../ui/Button';
import ScreenHeader from '../components/ScreenHeader';

/** GitHub Copilot device-code authorization (real device flow). */
export default function CopilotAuthScreen({ nav }: { nav: Nav }) {
  const auth = useAuthState(copilotProvider);
  const [copied, setCopied] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const startedRef = useRef(false);

  const startSignIn = () => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    copilotProvider.signIn(abortRef.current.signal).catch(() => {
      /* surfaced via auth state */
    });
  };

  // Kick off the device flow as soon as we land here unauthenticated, so the
  // code is on screen without an extra click (matches the mock).
  useEffect(() => {
    if (auth?.status === 'signed-out' && !startedRef.current) {
      startedRef.current = true;
      startSignIn();
    }
  }, [auth?.status]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      /* clipboard may be blocked */
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="screen">
      <ScreenHeader title="GitHub Copilot" onBack={nav.backToSettings} />
      <div
        className="screen-scroll jc-scroll"
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '18px 22px 24px' }}
      >
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: 15,
            background: 'var(--chip)',
            border: '1px solid var(--border2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 16,
          }}
        >
          <Icon name="github" size={28} color="var(--text2)" />
        </div>

        {auth?.status === 'signed-in' ? (
          <>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 7, textAlign: 'center' }}>
              Connected
            </div>
            <div style={{ fontSize: 12.5, lineHeight: 1.55, color: 'var(--mid)', textAlign: 'center', maxWidth: 262, marginBottom: 22 }}>
              Signed in{auth.user ? <> as <strong>{auth.user.login}</strong></> : null}. You're ready to chat.
            </div>
            <Button variant="danger-ghost" block onClick={() => void copilotProvider.signOut()}>
              Disconnect
            </Button>
          </>
        ) : (
          <>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 7, textAlign: 'center' }}>
              Connect with device code
            </div>
            <div style={{ fontSize: 12.5, lineHeight: 1.55, color: 'var(--mid)', textAlign: 'center', maxWidth: 262, marginBottom: 22 }}>
              Open the GitHub device page and enter the code below to authorize J Chat for Copilot.
            </div>

            <div className="mono" style={{ width: '100%', fontSize: 9.5, color: 'var(--dim)', letterSpacing: '0.05em', marginBottom: 8 }}>
              YOUR DEVICE CODE
            </div>
            <div className="device-code-box">
              <span className="device-code">
                {auth?.status === 'pending-device' ? auth.userCode : '— — — —'}
              </span>
              <button
                className="device-copy"
                title="Copy code"
                disabled={auth?.status !== 'pending-device'}
                onClick={() => auth?.status === 'pending-device' && void copyCode(auth.userCode)}
              >
                <Icon name={copied ? 'check' : 'copy'} size={copied ? 18 : 16} color={copied ? 'var(--ok)' : undefined} />
              </button>
            </div>

            <button
              className="btn btn-primary btn-block"
              style={{ height: 44, fontSize: 13, boxShadow: '0 4px 14px -4px var(--accent-glow)' }}
              onClick={() =>
                chrome.tabs.create({
                  url: auth?.status === 'pending-device' ? auth.verificationUri : 'https://github.com/login/device',
                })
              }
            >
              Open github.com/login/device
              <Icon name="external" size={15} />
            </button>

            {auth?.status === 'error' ? (
              <div className="error-text" style={{ marginTop: 18, fontSize: 12, textAlign: 'center' }}>
                {auth.message}
                <div style={{ marginTop: 10 }}>
                  <Button variant="primary" small onClick={startSignIn}>Try again</Button>
                </div>
              </div>
            ) : (
              <div className="waiting" style={{ marginTop: 18 }}>
                <span className="pulse" />
                Waiting for authorization…
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
