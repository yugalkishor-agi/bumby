import { useSyncExternalStore } from 'react';
import { preferencesService } from '../services/preferences.service';

/**
 * Returns true when the user has enabled Data Saver. Components that load
 * remote media use this to skip pre-caching and downscale quality.
 */
export function useDataSaverEnabled(): boolean {
  return useSyncExternalStore(
    (listener) => preferencesService.subscribe(listener),
    () => preferencesService.getSnapshot().dataSaverEnabled,
    () => false
  );
}
