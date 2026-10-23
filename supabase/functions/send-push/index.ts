// Supabase Edge Function — send-push
// Sends FCM V1 push notifications directly without Expo as middleman.
// Called from the app's notification.service.ts whenever a notification is created.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const FCM_PROJECT_ID = Deno.env.get('FCM_PROJECT_ID') ?? 'socialapp-e5192';
const FCM_CLIENT_EMAIL = Deno.env.get('FCM_CLIENT_EMAIL') ?? '';
// Supabase stores secrets as-is — the private key may have literal \n strings
// instead of real newline characters depending on how it was set. Normalize all
// known escaping variants so atob() never sees non-base64 characters.
const FCM_PRIVATE_KEY = (Deno.env.get('FCM_PRIVATE_KEY') ?? '')
  // Handle double-escaped sequences (\\n → \n → newline)
  .replace(/\\\\n/g, '\n')
  .replace(/\\n/g, '\n')
  .replace(/\\\\r/g, '')
  .replace(/\\r/g, '')
  // Strip any surrounding quotes that may have been added during copy-paste
  .replace(/^["']|["']$/g, '')
  .trim();

const FCM_ENDPOINT = `https://fcm.googleapis.com/v1/projects/${FCM_PROJECT_ID}/messages:send`;

// ---------------------------------------------------------------------------
// Startup validation — fail fast with a clear message instead of a cryptic
// "Failed to decode base64" when secrets are missing or malformed.
// ---------------------------------------------------------------------------

if (!FCM_CLIENT_EMAIL) {
  console.error('[send-push] STARTUP ERROR: FCM_CLIENT_EMAIL secret is not set');
}
if (!FCM_PRIVATE_KEY) {
  console.error('[send-push] STARTUP ERROR: FCM_PRIVATE_KEY secret is not set');
} else if (!FCM_PRIVATE_KEY.includes('-----BEGIN PRIVATE KEY-----')) {
  console.error(
    '[send-push] STARTUP WARNING: FCM_PRIVATE_KEY does not look like a PEM key. ' +
    'It may be base64-encoded, double-escaped, or corrupted. ' +
    `Key starts with: "${FCM_PRIVATE_KEY.slice(0, 40)}"`
  );
}

// ---------------------------------------------------------------------------
// JWT helpers (no external deps — pure Deno crypto)
// ---------------------------------------------------------------------------

function base64url(data: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...data));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function encodeBase64url(str: string): string {
  return base64url(new TextEncoder().encode(str));
}

async function signRS256(input: string, privateKeyPem: string): Promise<string> {
  // Extract only the base64 body between PEM headers.
  // Strategy: use a regex that matches the full PEM structure so the header/footer
  // words are never mixed into the base64 body. Falls back to stripping any line
  // that starts with '-----' for robustness.
  let pemBody: string;

  const pemMatch = privateKeyPem.match(
    /-----BEGIN[^-]+-----\s*([\s\S]+?)\s*-----END[^-]+-----/
  );
  if (pemMatch) {
    // Take only the captured group between the headers
    pemBody = pemMatch[1].replace(/\s+/g, '');
  } else {
    // Fallback: remove any line starting with '-----' then strip all whitespace
    pemBody = privateKeyPem
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('-----'))
      .join('')
      .replace(/\s+/g, '');
  }

  // Final safety: strip any remaining non-base64 characters
  pemBody = pemBody.replace(/[^A-Za-z0-9+/=]/g, '');

  if (!pemBody) {
    throw new Error('FCM_PRIVATE_KEY is empty or malformed — no base64 content found after stripping PEM headers');
  }

  let binaryDer: Uint8Array;
  try {
    const binaryString = atob(pemBody);
    binaryDer = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      binaryDer[i] = binaryString.charCodeAt(i);
    }
  } catch (e: any) {
    throw new Error(
      `Failed to decode FCM private key: ${e?.message}. ` +
      `Key body length after stripping: ${pemBody.length}. ` +
      `First 40 chars: "${pemBody.slice(0, 40)}". ` +
      `Check that FCM_PRIVATE_KEY is set correctly in Supabase secrets.`
    );
  }

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    binaryDer.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(input)
  );

  return base64url(new Uint8Array(signature));
}

async function getAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = encodeBase64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = encodeBase64url(
    JSON.stringify({
      iss: FCM_CLIENT_EMAIL,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    })
  );

  const signature = await signRS256(`${header}.${payload}`, FCM_PRIVATE_KEY);
  const jwt = `${header}.${payload}.${signature}`;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    throw new Error(`Failed to get FCM access token: ${err}`);
  }

  const tokenData = await tokenRes.json();
  return tokenData.access_token as string;
}

// ---------------------------------------------------------------------------
// Notification title/body builder
// ---------------------------------------------------------------------------

function buildNotification(type: string, actorUsername: string, refPreview?: string): { title: string; body: string } {
  const actor = actorUsername || 'Someone';
  const preview = refPreview || '';

  switch (type) {
    case 'dm':
      return { title: `New message from ${actor}`, body: preview || 'Open chat to see the message.' };
    case 'like':
      return { title: `${actor} liked your post`, body: 'Tap to view.' };
    case 'comment':
      return { title: `${actor} commented on your post`, body: preview || 'Tap to read the comment.' };
    case 'comment_reply':
      return { title: `${actor} replied to your comment`, body: preview || 'Tap to read the reply.' };
    case 'follow':
      return { title: `${actor} started following you`, body: 'Tap to view their profile.' };
    case 'follow_request':
      return { title: `${actor} requested to follow you`, body: 'Tap to review the request.' };
    case 'mention':
      return { title: `${actor} mentioned you`, body: preview || 'Tap to see where.' };
    case 'story_view':
      return { title: `${actor} viewed your story`, body: 'Tap to see story activity.' };
    case 'story_reply':
      return { title: `${actor} replied to your story`, body: preview || 'Tap to read the reply.' };
    case 'story_like':
      return { title: `${actor} liked your story`, body: 'Tap to see story activity.' };
    case 'collaboration_request':
      return { title: `${actor} sent a collaboration request`, body: preview || 'Tap to review.' };
    default:
      return { title: `New activity from ${actor}`, body: 'Tap to view.' };
  }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  try {
    const body = await req.json();
    const { fcmToken, notification: notifData } = body as {
      fcmToken: string;
      notification: {
        type: string;
        actorUsername: string;
        refPreview?: string;
        refMediaURL?: string;
        notificationId?: string;
        refType?: string;
        refId?: string;
        actorId?: string;
        actorAvatarURL?: string;
      };
    };

    if (!fcmToken || !notifData) {
      return new Response(JSON.stringify({ error: 'Missing fcmToken or notification' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { title, body: bodyText } = buildNotification(
      notifData.type,
      notifData.actorUsername,
      notifData.refPreview
    );

    const accessToken = await getAccessToken();

    const fcmPayload = {
      message: {
        token: fcmToken,
        notification: {
          title,
          body: bodyText,
        },
        android: {
          priority: 'high',
          notification: {
            channel_id: notifData.type === 'dm' ? 'messages' : 'social',
            click_action: 'FLUTTER_NOTIFICATION_CLICK',
          },
        },
        data: {
          type: notifData.type ?? '',
          notificationId: notifData.notificationId ?? '',
          refType: notifData.refType ?? '',
          refId: notifData.refId ?? '',
          actorId: notifData.actorId ?? '',
          actorUsername: notifData.actorUsername ?? '',
          actorAvatarURL: notifData.actorAvatarURL ?? '',
          refPreview: notifData.refPreview ?? '',
          refMediaURL: notifData.refMediaURL ?? '',
        },
      },
    };

    const fcmRes = await fetch(FCM_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(fcmPayload),
    });

    const fcmResult = await fcmRes.json();

    if (!fcmRes.ok) {
      const fcmError = fcmResult?.error ?? fcmResult;
      const errorCode = fcmError?.status ?? '';
      const errorDetails: any[] = fcmError?.details ?? [];
      const fcmErrorCode = errorDetails.find((d: any) => d['@type']?.includes('FcmError'))?.errorCode ?? '';

      // UNREGISTERED or INVALID_ARGUMENT on the token field = stale/bad token.
      // Return 410 Gone so the client knows to purge the token from Firestore.
      const isStaleToken =
        errorCode === 'NOT_FOUND' ||
        fcmErrorCode === 'UNREGISTERED' ||
        (errorCode === 'INVALID_ARGUMENT' &&
          (errorDetails.some((d: any) =>
            d?.fieldViolations?.some((v: any) => v?.field === 'message.token')
          ) || fcmErrorCode === 'INVALID_ARGUMENT'));

      if (isStaleToken) {
        console.warn('[send-push] Stale/invalid FCM token — client should purge it:', fcmToken);
        return new Response(JSON.stringify({ error: fcmResult, staleToken: true }), {
          status: 410,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      console.error('[send-push] FCM error:', JSON.stringify(fcmResult));
      return new Response(JSON.stringify({ error: fcmResult }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    console.log('[send-push] Delivered:', fcmResult.name);
    return new Response(JSON.stringify({ success: true, name: fcmResult.name }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('[send-push] Unexpected error:', err?.message);
    return new Response(JSON.stringify({ error: err?.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
