type OptionalString = string | undefined;

type SupabaseConfig = {
  url: OptionalString;
  anonKey: OptionalString;
  cdnUrl: OptionalString;
};

type FirebaseConfig = {
  apiKey: OptionalString;
  authDomain: OptionalString;
  databaseURL: OptionalString;
  projectId: OptionalString;
  storageBucket: OptionalString;
  messagingSenderId: OptionalString;
  appId: OptionalString;
  measurementId: OptionalString;
};

const normalize = (value: OptionalString): OptionalString => {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    const unquoted = trimmed.slice(1, -1).trim();
    return unquoted || undefined;
  }
  return trimmed;
};

const readPublicEnv = (name: string): OptionalString => normalize(process.env[name]);
const readSupabaseUrlEnv = (): OptionalString =>
  readPublicEnv('EXPO_PUBLIC_SUPABASE_URL') ?? readPublicEnv('NEXT_PUBLIC_SUPABASE_URL');
const readSupabaseAnonKeyEnv = (): OptionalString =>
  readPublicEnv('EXPO_PUBLIC_SUPABASE_ANON_KEY') ??
  readPublicEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY');

const TEMP_FIREBASE_OVERRIDE_ENABLED = false;
const TEMP_FIREBASE_OVERRIDE: FirebaseConfig = {
  apiKey: undefined,
  authDomain: undefined,
  databaseURL: undefined,
  projectId: undefined,
  storageBucket: undefined,
  messagingSenderId: undefined,
  appId: undefined,
  measurementId: undefined,
};

const firebaseOverride = TEMP_FIREBASE_OVERRIDE_ENABLED ? TEMP_FIREBASE_OVERRIDE : undefined;

const TEMP_SUPABASE_OVERRIDE_ENABLED = false;
const TEMP_SUPABASE_OVERRIDE: SupabaseConfig = {
  url: undefined,
  anonKey: undefined,
  cdnUrl: undefined,
};

const supabaseOverride = TEMP_SUPABASE_OVERRIDE_ENABLED ? TEMP_SUPABASE_OVERRIDE : undefined;

const FALLBACKS = {
  supabase: {
    url: 'https://ilchgntolshbomhfswln.supabase.co',
    anonKey: 'sb_publishable_GSxLUCHWEAaHpZ9xrbLLsQ_vs932Sb2',
    cdnUrl: undefined as OptionalString,
  },
  firebase: {
    apiKey: 'AIzaSyCRkTQxIcmP_buOJGwfbBwsKFkxr3cpHsw',
    authDomain: 'socialapp-e5192.firebaseapp.com',
    databaseURL: 'https://socialapp-e5192-default-rtdb.firebaseio.com',
    projectId: 'socialapp-e5192',
    storageBucket: 'socialapp-e5192.firebasestorage.app',
    messagingSenderId: '20621914868',
    appId: '1:20621914868:android:715fc83ada9c857aafa4a1',
    measurementId: undefined,
  },

} as const;

export const runtimeConfig = {
  supabase: {
    url: supabaseOverride?.url ?? readSupabaseUrlEnv() ?? FALLBACKS.supabase.url,
    anonKey: supabaseOverride?.anonKey ?? readSupabaseAnonKeyEnv() ?? FALLBACKS.supabase.anonKey,
    cdnUrl: supabaseOverride?.cdnUrl ?? readPublicEnv('EXPO_PUBLIC_SUPABASE_CDN_URL') ?? FALLBACKS.supabase.cdnUrl,
  },
  firebase: {
    apiKey:
      firebaseOverride?.apiKey ?? readPublicEnv('EXPO_PUBLIC_FIREBASE_API_KEY') ?? FALLBACKS.firebase.apiKey,
    authDomain:
      firebaseOverride?.authDomain ?? readPublicEnv('EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN') ?? FALLBACKS.firebase.authDomain,
    databaseURL:
      firebaseOverride?.databaseURL ??
      readPublicEnv('EXPO_PUBLIC_FIREBASE_DATABASE_URL') ??
      FALLBACKS.firebase.databaseURL,
    projectId:
      firebaseOverride?.projectId ?? readPublicEnv('EXPO_PUBLIC_FIREBASE_PROJECT_ID') ?? FALLBACKS.firebase.projectId,
    storageBucket:
      firebaseOverride?.storageBucket ??
      readPublicEnv('EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET') ??
      FALLBACKS.firebase.storageBucket,
    messagingSenderId:
      firebaseOverride?.messagingSenderId ??
      readPublicEnv('EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID') ??
      FALLBACKS.firebase.messagingSenderId,
    appId:
      firebaseOverride?.appId ?? readPublicEnv('EXPO_PUBLIC_FIREBASE_APP_ID') ?? FALLBACKS.firebase.appId,
    measurementId:
      firebaseOverride?.measurementId ??
      readPublicEnv('EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID') ??
      FALLBACKS.firebase.measurementId,
  },
} as const;

export const runtimeConfigSource = {
  firebaseFromFallback:
    !firebaseOverride && (!readPublicEnv('EXPO_PUBLIC_FIREBASE_API_KEY') || !readPublicEnv('EXPO_PUBLIC_FIREBASE_APP_ID')),
  supabaseFromFallback: !supabaseOverride && (!readSupabaseUrlEnv() || !readSupabaseAnonKeyEnv()),
} as const;

export const backendConfigSummary = {
  firebase: {
    projectId: runtimeConfig.firebase.projectId,
    authDomain: runtimeConfig.firebase.authDomain,
    tempOverrideEnabled: TEMP_FIREBASE_OVERRIDE_ENABLED,
    usingFallback: runtimeConfigSource.firebaseFromFallback,
  },
  supabase: {
    url: runtimeConfig.supabase.url,
    cdnUrl: runtimeConfig.supabase.cdnUrl,
    tempOverrideEnabled: TEMP_SUPABASE_OVERRIDE_ENABLED,
    usingFallback: runtimeConfigSource.supabaseFromFallback,
  },
} as const;
