const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generatePairCode(length = 6): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let code = '';
  for (let i = 0; i < length; i += 1) {
    code += alphabet[bytes[i] % alphabet.length];
  }
  return code;
}
