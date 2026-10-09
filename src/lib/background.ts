import { getMetaValue, setMetaValue } from '@/lib/db/files';
import { native } from '@/lib/native';

// Keeping the index current without opening the app: Android runs the scanner now and then (while charging)
// and again when new photos, videos or recordings appear. New files wait in the inbox until the app is opened.
const KEY = 'bg.enabled';

const SCHEDULE = { everyHours: 6, requireCharging: true, watchNewMedia: true };

/** On by default once the first scan has finished; the person can turn it off in Settings. */
export async function isBackgroundEnabled(): Promise<boolean> {
  return (await getMetaValue(KEY).catch(() => null)) === '1';
}

export async function setBackgroundEnabled(on: boolean): Promise<void> {
  await setMetaValue(KEY, on ? '1' : '0');
  try {
    if (on) await native.scheduleBackground(SCHEDULE);
    else await native.cancelBackground();
  } catch {
    // The preference is saved; scheduling is tried again the next time the app starts.
  }
}

/** Called after the first complete scan: turns it on unless the person has already made a choice. */
export async function enableBackgroundByDefault(): Promise<void> {
  const current = await getMetaValue(KEY).catch(() => null);
  if (current === null) await setBackgroundEnabled(true);
}

/** Called when the app starts, so the schedule matches the saved preference. */
export async function syncBackground(): Promise<void> {
  const current = await getMetaValue(KEY).catch(() => null);
  try {
    if (current === '1') await native.scheduleBackground(SCHEDULE);
    else if (current === '0') await native.cancelBackground();
  } catch {
    // Nothing to do: it is retried on the next start.
  }
}
