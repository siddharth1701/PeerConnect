/**
 * Room ID generation and validation
 * Room codes are XXXX-XXXX format, cryptographically random
 * Alphabet excludes ambiguous characters: 0/O, 1/I/l
 */

const ROOM_ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * Generate a cryptographically random room ID in format XXXX-XXXX
 * @returns {string} Room code like "KVMX-R9TH"
 */
export function generateRoomId() {
  const part1 = generateRandomString(4);
  const part2 = generateRandomString(4);
  return `${part1}-${part2}`;
}

/**
 * Generate a peer ID using UUID v4
 * @returns {string} UUID string
 */
export function generatePeerId() {
  return crypto.randomUUID();
}

/**
 * Validate that a string matches the room ID format
 * @param {string} str - The room code to validate
 * @returns {boolean} True if valid XXXX-XXXX format
 */
export function validateRoomId(str) {
  if (!str || typeof str !== 'string') return false;
  const regex = /^[A-Z2-9]{4}-[A-Z2-9]{4}$/;
  return regex.test(str);
}

/**
 * Generate a random string from the room ID alphabet
 * @private
 * @param {number} length - How many characters to generate
 * @returns {string} Random string
 */
function generateRandomString(length) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);

  let result = '';
  for (let i = 0; i < length; i++) {
    const index = bytes[i] % ROOM_ID_ALPHABET.length;
    result += ROOM_ID_ALPHABET[index];
  }
  return result;
}
