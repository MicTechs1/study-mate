const QR_PREFIX = "studymate:sid:";
const TOKEN_BYTES = 32;

export function generateQrToken(): string {
  const bytes = new Uint8Array(TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

export function encodeQrPayload(token: string): string {
  return `${QR_PREFIX}${token}`;
}

export function parseQrPayload(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  if (value.startsWith(QR_PREFIX)) {
    const token = value.slice(QR_PREFIX.length).trim();
    return isOpaqueToken(token) ? token : null;
  }
  if (isOpaqueToken(value) && !value.includes("{") && !looksLikePrivatePayload(value)) {
    return value;
  }
  return null;
}

export function isOpaqueToken(token: string) {
  return /^[A-Za-z0-9_-]{32,128}$/.test(token);
}

function looksLikePrivatePayload(value: string) {
  return /gpa|index|faculty|password|email|full_name|fullName/i.test(value);
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
