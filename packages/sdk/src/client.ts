import {
  pairPollResponseSchema,
  pairStartResponseSchema,
  syncVscodeResponseSchema,
  type PairStartRequest,
  type PairPollRequest,
  type SyncVscodeRequest,
} from '@momentum/shared-types';

export interface MomentumClientOptions {
  apiBaseUrl: string;
  deviceJwt?: string;
}

export class MomentumClient {
  private readonly apiBaseUrl: string;
  private readonly deviceJwt?: string;

  constructor(options: MomentumClientOptions) {
    this.apiBaseUrl = options.apiBaseUrl.replace(/\/$/, '');
    this.deviceJwt = options.deviceJwt;
  }

  async pairStart(payload: PairStartRequest) {
    const response = await this.request('/auth/pair-start', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return pairStartResponseSchema.parse(await response.json());
  }

  async pairPoll(payload: PairPollRequest) {
    const response = await this.request('/auth/pair-poll', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return pairPollResponseSchema.parse(await response.json());
  }

  async syncVscode(payload: SyncVscodeRequest) {
    const response = await this.request('/sync/vscode', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return syncVscodeResponseSchema.parse(await response.json());
  }

  private async request(path: string, init: RequestInit) {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...(this.deviceJwt ? { Authorization: `Bearer ${this.deviceJwt}` } : {}),
    };

    const response = await fetch(`${this.apiBaseUrl}${path}`, {
      ...init,
      headers,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Request failed ${response.status}: ${text}`);
    }

    return response;
  }
}
