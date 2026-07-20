import { useEffect, useState } from 'react';
import type { AuthState, ChatProvider } from '@/lib/providers/types';

export function useAuthState(provider: ChatProvider): AuthState | null {
  const [auth, setAuth] = useState<AuthState | null>(null);

  useEffect(() => {
    let mounted = true;
    provider.getAuthState().then((state) => {
      if (mounted) setAuth((current) => current ?? state);
    });
    const unsubscribe = provider.onAuthStateChange(setAuth);
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [provider]);

  return auth;
}
