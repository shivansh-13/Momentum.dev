export interface DeviceIdentity {
  userId: string;
  deviceId: string;
}

export function readDeviceIdentity(req: Request): DeviceIdentity {
  const authHeader = req.headers.get('authorization') ?? req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    throw new Error('missing bearer token');
  }

  const token = authHeader.slice('Bearer '.length).trim();
  const parts = token.split(':');
  if (parts.length !== 3 || parts[0] !== 'devjwt') {
    throw new Error('invalid device token');
  }

  return {
    userId: parts[1],
    deviceId: parts[2],
  };
}
