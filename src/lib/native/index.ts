import { Platform } from 'react-native';

import type { NativeEventMap, NativeEventName, NativeWithEvents } from '@/lib/native/contract';
import { createMockNative } from '@/lib/native/mock';

function loadReal(): NativeWithEvents | null {
  if (Platform.OS !== 'android') return null;
  try {
    // Optional native module: present only after modules/aifoundit-native lands.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const core = require('expo-modules-core') as {
      requireOptionalNativeModule?: (name: string) => unknown;
    };
    const mod = core.requireOptionalNativeModule?.('AiFoundItNative');
    return (mod as NativeWithEvents) ?? null;
  } catch {
    return null;
  }
}

const real = loadReal();
const mock = real ? null : createMockNative();

export const isMockNative = real === null;

export const native: NativeWithEvents = real ?? (mock as unknown as NativeWithEvents);

export function addNativeListener<E extends NativeEventName>(
  event: E,
  listener: (payload: NativeEventMap[E]) => void,
): { remove: () => void } {
  return native.addListener(event, listener);
}

// Test helpers — only present when running the mock.
export const mockControls = mock?.__mock ?? null;
