// Web stub: calls are native-only, so the ZEGOCLOUD SDK is never bundled for web.
export function registerZegoAvatar(_userId: string, _avatarURL?: string | null) {}
export function registerZegoAvatars(_users: Array<{ userId: string; avatarURL?: string | null }>) {}
export function clearZegoAvatars() {}

export const zegoCallService = {
  isSupported: false,
  isInitialized: false,
  currentUserId: null as string | null,

  async initialize(_user: any): Promise<void> {},

  async uninitialize(): Promise<void> {},

  async startCall(_params: {
    invitees: Array<{ userID: string; userName: string }>;
    isVideoCall: boolean;
    navigation?: any;
    timeout?: number;
    resourceID?: string;
  }): Promise<void> {},
};
