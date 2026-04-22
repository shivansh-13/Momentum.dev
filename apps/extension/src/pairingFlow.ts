import { randomUUID } from 'node:crypto';
import * as vscode from 'vscode';
import { MomentumClient } from '@momentum/sdk';

export interface PairingResult {
  userId: string;
  deviceId: string;
  deviceJwt: string;
}

const DEVICE_ID_KEY = 'momentum.deviceId';
const DEVICE_JWT_KEY = 'momentum.deviceJwt';
const USER_ID_KEY = 'momentum.userId';
const FINGERPRINT_KEY = 'momentum.deviceFingerprint';

export class PairingFlow {
  constructor(private readonly context: vscode.ExtensionContext) {}

  async startPairing(apiBaseUrl: string): Promise<PairingResult | null> {
    const fingerprint = await this.getOrCreateSecret(FINGERPRINT_KEY);

    const client = new MomentumClient({ apiBaseUrl });
    const pairStart = await client.pairStart({
      deviceFingerprint: fingerprint,
      deviceName: 'VS Code',
      platform: process.platform as 'darwin' | 'win32' | 'linux',
      vscodeVersion: vscode.version,
    });

    void vscode.window.showInformationMessage(`Momentum pairing code: ${pairStart.code}`);

    for (let attempt = 0; attempt < 24; attempt += 1) {
      const result = await client.pairPoll({ pairingId: pairStart.pairingId });
      if (result.status === 'paired' && result.deviceJwt && result.userId) {
        const deviceId = await this.getOrCreateSecret(DEVICE_ID_KEY);
        await this.context.secrets.store(DEVICE_JWT_KEY, result.deviceJwt);
        await this.context.secrets.store(USER_ID_KEY, result.userId);

        return {
          userId: result.userId,
          deviceId,
          deviceJwt: result.deviceJwt,
        };
      }

      if (result.status === 'expired') {
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, 5000));
    }

    void vscode.window.showWarningMessage('Pairing not completed. Try again.');
    return null;
  }

  async getSavedCredentials(): Promise<PairingResult | null> {
    const userId = await this.context.secrets.get(USER_ID_KEY);
    const deviceId = await this.context.secrets.get(DEVICE_ID_KEY);
    const deviceJwt = await this.context.secrets.get(DEVICE_JWT_KEY);

    if (!userId || !deviceId || !deviceJwt) {
      return null;
    }

    return { userId, deviceId, deviceJwt };
  }

  private async getOrCreateSecret(key: string): Promise<string> {
    const existing = await this.context.secrets.get(key);
    if (existing) {
      return existing;
    }

    const value = randomUUID();
    await this.context.secrets.store(key, value);
    return value;
  }
}
