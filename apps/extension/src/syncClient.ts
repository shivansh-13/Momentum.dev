import { ApiClient } from './apiClient.js';
import type { IngestEvent } from './types.js';

export interface SyncClientOptions {
  apiBaseUrl: string;
  getDeviceJwt: () => Promise<string | null>;
}

export class SyncClient {
  private readonly options: SyncClientOptions;
  private readonly queue: IngestEvent[] = [];

  constructor(options: SyncClientOptions) {
    this.options = options;
  }

  enqueue(event: IngestEvent): void {
    this.queue.push(event);
  }

  async flush(): Promise<void> {
    if (this.queue.length === 0) {
      return;
    }

    const deviceJwt = await this.options.getDeviceJwt();
    if (!deviceJwt) {
      return;
    }

    const client = new ApiClient({
      apiBaseUrl: this.options.apiBaseUrl,
      getDeviceJwt: async () => deviceJwt,
    });

    const events = this.queue.splice(0, this.queue.length);
    try {
      await client.syncVscode({ events });
    } catch (_err) {
      this.queue.unshift(...events);
    }
  }
}
