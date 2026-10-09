// Text for the model download screens. Pure, so it can be tested.

/** Sizes the way Hugging Face shows them (1 GB = 1,000,000,000 bytes), so a number on screen matches the model page. */
export function formatModelSize(bytes: number): string {
  if (bytes < 1_000_000) return `${Math.max(1, Math.round(bytes / 1000))} KB`;
  if (bytes < 1_000_000_000) return `${Math.round(bytes / 1_000_000)} MB`;
  return `${(bytes / 1_000_000_000).toFixed(2)} GB`;
}

export function progressFraction(bytes: number, total: number): number {
  if (!(total > 0)) return 0;
  return Math.min(1, Math.max(0, bytes / total));
}

export function progressLabel(bytes: number, total: number): string {
  if (!(total > 0)) return `${formatModelSize(bytes)} downloaded`;
  const percent = Math.floor(progressFraction(bytes, total) * 100);
  return `${formatModelSize(bytes)} of ${formatModelSize(total)} · ${percent}%`;
}

export type ErrorCopy = {
  text: string;
  // The model sits behind a license: the screen should show how to log in to Hugging Face.
  needsLogin: boolean;
};

export function downloadErrorCopy(code?: string | null, message?: string | null): ErrorCopy {
  switch (code) {
    case 'AUTH':
      return {
        text: 'This model needs a free Hugging Face account. Open its page and accept the license, then paste an access token below and try again.',
        needsLogin: true,
      };
    case 'WIFI':
      return { text: 'Connect to Wi-Fi, or turn off “Wi-Fi only”, and try again.', needsLogin: false };
    case 'OFFLINE':
      return { text: 'There is no internet connection.', needsLogin: false };
    case 'SPACE':
      return { text: 'There is not enough free storage on this phone for this model.', needsLogin: false };
    case 'NOT_FOUND':
      return { text: 'The model file was not found on Hugging Face. Try again later.', needsLogin: false };
    case 'SIZE':
      return { text: 'The file did not download correctly. Try again.', needsLogin: false };
    case 'NETWORK':
      return { text: 'The connection kept dropping. What was saved is kept, so you can continue when the signal is better.', needsLogin: false };
    default:
      return { text: message?.trim() ? message : 'The download failed.', needsLogin: false };
  }
}
