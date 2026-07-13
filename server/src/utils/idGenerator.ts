import { randomBytes } from 'crypto';

const ROOM_ALPHABET = '6789BCDFGHJKLMNPQRTWbcdfghjkmnpqrtwz';

function randomId(alphabet: string, size: number): string {
  const bytes = randomBytes(size);
  let id = '';
  for (let i = 0; i < size; i += 1) {
    id += alphabet[bytes[i] % alphabet.length];
  }
  return id;
}

export function genRoomId() {
  return randomId(ROOM_ALPHABET, 6);
}

export function genPlayerId() {
  return randomId(
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-',
    21,
  );
}
