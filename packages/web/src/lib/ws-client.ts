import type { ClientMessage, ServerMessage } from './protocol';

export type ConnectionStatus =
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'reconnecting';

export interface WSClientOptions {
  url: string;
  sessionId: string;
  token: string;
  onMessage: (msg: ServerMessage) => void;
  onStatusChange: (status: ConnectionStatus) => void;
  /** Called when the server closes the connection with code 4001 (bad/expired token). */
  onUnauthorized?: () => void;
}

/**
 * WebSocket client with exponential backoff reconnection.
 *
 * Handles JSON serialization of the clsh protocol messages,
 * automatic reconnection on disconnect, and connection timeout
 * detection for demo mode fallback.
 */
export class TerminalWSClient {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnects = 5;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  private readonly options: WSClientOptions;

  private get url() { return this.options.url; }
  private get sessionId() { return this.options.sessionId; }
  private get token() { return this.options.token; }
  private get onMessage() { return this.options.onMessage; }
  private get onStatusChange() { return this.options.onStatusChange; }

  constructor(options: WSClientOptions) {
    this.options = options;
  }

  /**
   * Attempt to connect to the WebSocket server.
   * Returns true if connected within 2 seconds, false otherwise
   * (useful for demo mode detection).
   */
  connect(): Promise<boolean> {
    return new Promise((resolve) => {
      if (this.disposed) {
        resolve(false);
        return;
      }

      this.onStatusChange('connecting');

      const wsUrl = new URL(this.url);
      wsUrl.searchParams.set('token', this.token);
      wsUrl.searchParams.set('sessionId', this.sessionId);

      const timeout = setTimeout(() => {
        // Connection did not establish in 2 seconds
        resolve(false);
      }, 2000);

      try {
        this.ws = new WebSocket(wsUrl.toString());
      } catch {
        clearTimeout(timeout);
        this.onStatusChange('disconnected');
        resolve(false);
        return;
      }

      this.ws.onopen = () => {
        clearTimeout(timeout);
        this.reconnectAttempts = 0;
        this.onStatusChange('connected');
        resolve(true);
      };

      this.ws.onmessage = (event: MessageEvent) => {
        try {
          const msg = JSON.parse(String(event.data)) as ServerMessage;
          this.onMessage(msg);
        } catch {
          // Ignore malformed messages
        }
      };

      this.ws.onclose = (event: CloseEvent) => {
        clearTimeout(timeout);
        this.onStatusChange('disconnected');
        // 4001 = backend rejected token (expired JWT or backend restarted).
        // Stop reconnecting — the stored token is no longer valid.
        if (event.code === 4001) {
          this.disposed = true;
          this.options.onUnauthorized?.();
          return;
        }
        this.scheduleReconnect();
      };

      this.ws.onerror = () => {
        clearTimeout(timeout);
        // onclose will fire after onerror, so reconnect is handled there
      };
    });
  }

  /**
   * Send a client message over the WebSocket connection.
   * Silently drops messages if not connected.
   */
  send(msg: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  /**
   * Permanently disconnect. No further reconnection attempts will be made.
   */
  disconnect(): void {
    this.disposed = true;
    this.maxReconnects = 0;

    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;
      this.ws.onopen = null;
      this.ws.close();
      this.ws = null;
    }

    this.onStatusChange('disconnected');
  }

  private scheduleReconnect(): void {
    if (this.disposed || this.reconnectAttempts >= this.maxReconnects) {
      return;
    }

    this.onStatusChange('reconnecting');

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 10000);
    this.reconnectAttempts++;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, delay);
  }
}
