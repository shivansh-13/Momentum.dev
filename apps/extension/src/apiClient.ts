import type {
  IngestEvent,
  PairPollResponse,
  PairStartPayload,
  PairStartResponse,
} from './types.js';

export interface ApiClientOptions {
  apiBaseUrl: string;
  getDeviceJwt?: () => Promise<string | null>;
}

export class ApiClient {
  private readonly apiBaseUrl: string;
  private readonly getDeviceJwt?: () => Promise<string | null>;

  constructor(options: ApiClientOptions) {
    this.apiBaseUrl = options.apiBaseUrl.replace(/\/$/, '');
    this.getDeviceJwt = options.getDeviceJwt;
  }

  async pairStart(payload: PairStartPayload): Promise<PairStartResponse> {
    return this.request('/auth/pair-start', {
      method: 'POST',
      body: payload,
    });
  }

  async pairPoll(payload: { pairingId: string }): Promise<PairPollResponse> {
    return this.request('/auth/pair-poll', {
      method: 'POST',
      body: payload,
    });
  }

  async syncVscode(payload: { events: IngestEvent[] }): Promise<{ accepted: number; rejected: number }> {
    return this.request('/sync/vscode', {
      method: 'POST',
      body: payload,
      withAuth: true,
    });
  }

  private async request<T>(
    path: string,
    options: { method: 'POST' | 'GET'; body?: unknown; withAuth?: boolean },
  ): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (options.withAuth && this.getDeviceJwt) {
      const jwt = await this.getDeviceJwt();
      if (jwt) {
        headers.Authorization = `Bearer ${jwt}`;
      }
    }

    const response = await fetch(`${this.apiBaseUrl}${path}`, {
      method: options.method,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`API ${path} failed (${response.status}): ${text}`);
    }

    return (await response.json()) as T;
  }
}
