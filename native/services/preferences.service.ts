/**
 * Lightweight, app-wide store for device preferences that change how media is
 * loaded. Kept deliberately tiny: the settings service writes into it whenever
 * user settings are read or updated, and components subscribe to it.
 */

type Listener = () => void;

interface DevicePreferences {
  /** Reduce media bandwidth (skip pre-caching, downscale quality). */
  dataSaverEnabled: boolean;
}

let state: DevicePreferences = {
  dataSaverEnabled: false,
};

const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch {}
  });
}

export const preferencesService = {
  getSnapshot(): DevicePreferences {
    return state;
  },

  setDataSaverEnabled(enabled: boolean) {
    const next = !!enabled;
    if (state.dataSaverEnabled === next) return;
    state = { ...state, dataSaverEnabled: next };
    emit();
  },

  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};
