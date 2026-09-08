function requestId() {
  if (globalThis.crypto.randomUUID) return globalThis.crypto.randomUUID();
  // HTTP deployments outside localhost may not expose randomUUID.
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// Kept in component memory only. An unchanged failed submission keeps its key;
// confirmed completion or a changed payload starts a new logical submission.
export function createSubmissionKeys() {
  const submissions = new Map();
  const files = new WeakMap();
  const snapshot = (value) => {
    if (value instanceof FormData) return snapshot(Object.fromEntries(value.entries()));
    if (value instanceof File) {
      if (!files.has(value)) files.set(value, requestId());
      return { file: files.get(value), name: value.name, size: value.size, type: value.type };
    }
    if (Array.isArray(value)) return value.map(snapshot);
    if (value && typeof value === 'object')
      return Object.fromEntries(
        Object.keys(value)
          .sort()
          .map((key) => [key, snapshot(value[key])]),
      );
    return value;
  };
  return {
    prepare(path, body) {
      const fingerprint = JSON.stringify(snapshot(body));
      let submission = submissions.get(path);
      if (!submission || submission.fingerprint !== fingerprint) {
        submission = { key: requestId(), fingerprint };
        submissions.set(path, submission);
      }
      return submission;
    },
    complete(path, submission) {
      // A late response must not discard the key of a newer, changed request.
      if (submissions.get(path) === submission) submissions.delete(path);
    },
  };
}
