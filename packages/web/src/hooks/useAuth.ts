import { useState, useCallback, useEffect, useRef } from 'react';

export interface AuthState {
  isAuthenticated: boolean;
  token: string | null;
  loading: boolean;
  error: string | null;
}

interface AuthReturn {
  auth: AuthState;
  authenticateWithBootstrap: (token: string) => Promise<boolean>;
  authenticateWithMagicLink: (email: string) => Promise<void>;
  logout: () => void;
  /** Called when the WS closes with code 4001 (token expired/backend restarted) */
  handleUnauthorized: () => void;
}

const SESSION_KEY = 'clsh_jwt';
const STORAGE = localStorage; // persists across PWA close/reopen (sessionStorage did not)

const INITIAL_STATE: AuthState = {
  isAuthenticated: false,
  token: null,
  loading: false,
  error: null,
};

/**
 * Auth state management hook.
 *
 * Stores the JWT in memory (not localStorage). Supports two authentication
 * flows: bootstrap token (primary) and magic link (secondary).
 *
 * On mount, checks for a `?token=` URL parameter and auto-authenticates.
 */
export function useAuth(): AuthReturn {
  const [auth, setAuth] = useState<AuthState>(() => {
    // Restore JWT from localStorage — survives PWA close/reopen and page refresh
    try {
      const stored = STORAGE.getItem(SESSION_KEY);
      if (stored) {
        return { isAuthenticated: true, token: stored, loading: false, error: null };
      }
    } catch {
      // storage unavailable (private mode, etc.) — ignore
    }
    return INITIAL_STATE;
  });
  const eventSourceRef = useRef<EventSource | null>(null);

  // Clean up any active SSE connection on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, []);

  const authenticateWithBootstrap = useCallback(
    async (bootstrapToken: string): Promise<boolean> => {
      setAuth((prev) => ({ ...prev, loading: true, error: null }));

      try {
        const response = await fetch('/api/auth/bootstrap', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: bootstrapToken }),
        });

        if (!response.ok) {
          const body = (await response.json()) as { error?: string };
          const message = body.error ?? `Authentication failed (${String(response.status)})`;
          setAuth((prev) => ({
            ...prev,
            loading: false,
            error: message,
          }));
          return false;
        }

        const data = (await response.json()) as { token: string };

        setAuth({
          isAuthenticated: true,
          token: data.token,
          loading: false,
          error: null,
        });

        // Persist JWT so page refresh doesn't force re-auth
        try {
          STORAGE.setItem(SESSION_KEY, data.token);
        } catch {
          // Ignore storage errors
        }

        // Clean up the URL parameter without a page reload
        const url = new URL(window.location.href);
        url.searchParams.delete('token');
        window.history.replaceState({}, '', url.toString());

        return true;
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : 'Network error';
        setAuth((prev) => ({
          ...prev,
          loading: false,
          error: message,
        }));
        return false;
      }
    },
    [],
  );

  const authenticateWithMagicLink = useCallback(
    async (email: string): Promise<void> => {
      setAuth((prev) => ({ ...prev, loading: true, error: null }));

      try {
        const response = await fetch('/api/auth/magic-link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });

        if (!response.ok) {
          const body = (await response.json()) as { error?: string };
          const message = body.error ?? `Failed to send magic link (${String(response.status)})`;
          setAuth((prev) => ({
            ...prev,
            loading: false,
            error: message,
          }));
          return;
        }

        const data = (await response.json()) as { pendingId: string };

        // Close any existing SSE connection
        if (eventSourceRef.current) {
          eventSourceRef.current.close();
        }

        // Listen for the auth_complete event via SSE
        const es = new EventSource(`/api/sse/events/${data.pendingId}`);
        eventSourceRef.current = es;

        es.addEventListener('auth_complete', (event: MessageEvent) => {
          const payload = JSON.parse(String(event.data)) as { token: string };
          setAuth({
            isAuthenticated: true,
            token: payload.token,
            loading: false,
            error: null,
          });
          es.close();
          eventSourceRef.current = null;
        });

        es.addEventListener('error', () => {
          setAuth((prev) => ({
            ...prev,
            loading: false,
            error: 'Lost connection while waiting for magic link confirmation',
          }));
          es.close();
          eventSourceRef.current = null;
        });

        // Keep loading state active while waiting for SSE
        setAuth((prev) => ({
          ...prev,
          loading: true,
          error: null,
        }));
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : 'Network error';
        setAuth((prev) => ({
          ...prev,
          loading: false,
          error: message,
        }));
      }
    },
    [],
  );

  const logout = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    try {
      STORAGE.removeItem(SESSION_KEY);
    } catch {
      // Ignore
    }
    setAuth(INITIAL_STATE);
  }, []);

  // Auto-authenticate from URL ?token= parameter on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get('token');
    if (urlToken) {
      void authenticateWithBootstrap(urlToken);
    }
  }, [authenticateWithBootstrap]);

  const handleUnauthorized = useCallback(() => {
    // Token rejected by backend (expired or backend restarted with new JWT secret).
    // Clear stored token so the user is shown the auth screen.
    try { STORAGE.removeItem(SESSION_KEY); } catch { /* ignore */ }
    setAuth(INITIAL_STATE);
  }, []);

  return { auth, authenticateWithBootstrap, authenticateWithMagicLink, logout, handleUnauthorized };
}
