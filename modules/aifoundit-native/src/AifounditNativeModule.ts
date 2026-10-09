import { requireOptionalNativeModule } from 'expo-modules-core';

import type { NativeWithEvents } from './AifounditNative.types';

// Optional: absent outside a dev/release Android build, so callers must
// null-check. src/lib/native/index.ts is the only consumer.
export default requireOptionalNativeModule<NativeWithEvents>('AiFoundItNative');
