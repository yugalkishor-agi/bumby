// Zego credentials come from the environment so they are never committed.
// Local values live in `.env.local` (gitignored); see `.env.example`.
const zegoAppId = Number(process.env.EXPO_PUBLIC_ZEGO_APP_ID || '0');
const zegoAppSign = process.env.EXPO_PUBLIC_ZEGO_APP_SIGN || '';

export const ZEGO_APP_ID = zegoAppId;
export const ZEGO_APP_SIGN = zegoAppSign;
export const ZEGO_RESOURCE_ID = process.env.EXPO_PUBLIC_ZEGO_PUSH_RESOURCE_ID || 'zego_call';

export const zegoConfig = {
  appID: ZEGO_APP_ID,
  appSign: ZEGO_APP_SIGN,
  resourceID: ZEGO_RESOURCE_ID,
};
