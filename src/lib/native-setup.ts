import { detectModelConfig } from '@/lib/models';
import { native } from '@/lib/native';
import { loadScanConfig } from '@/lib/scan-config';

/**
 * Hands the native side everything it needs: the folder rules and the model files in use. Call it when the
 * app starts and whenever the models or the folder rules change. The embedder is loaded before this returns;
 * the chat model keeps loading in the background (poll native.getStatus() to see when it is ready).
 */
export async function configureNative() {
  const [scan, models] = await Promise.all([loadScanConfig(), detectModelConfig()]);
  const status = await native.configure(scan, models.config);
  return { status, models };
}
