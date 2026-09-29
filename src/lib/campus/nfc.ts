export function isNfcSupported() {
  return false;
}

export async function readNfcStudentToken(): Promise<string> {
  throw new Error("NFC student credentials are not available yet.");
}
