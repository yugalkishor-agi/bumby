import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { e2eeKeyVault } from './e2eeKeyVault.service';
import type { Conversation, CreateMessageData, Message } from '../types/database';

type StoredIdentity = {
  deviceId: string;
  publicKeyJwk: JsonWebKey;
  privateKeyJwk: JsonWebKey;
};

type RemoteBundle = {
  deviceId: string;
  userId: string;
  publicKeyJwk: JsonWebKey;
  algorithm: string;
};

type ConversationE2EEState = NonNullable<Conversation['e2ee']>;

type EncryptResult = {
  enabled: boolean;
  messageData: CreateMessageData;
  conversationE2EE?: ConversationE2EEState;
  previewText: string;
};

const DEVICE_DOC_ID = 'primary';
const IDENTITY_KEY = (userId: string) => `device-identity:${userId}`;
const LOCAL_CACHE_KEY = 'local-cache-key';
const E2EE_VERSION = 1;
const ENVELOPE_ALGORITHM = 'AES-256-GCM/RSA-OAEP-256';
const PAYLOAD_ALGORITHM = 'AES-GCM';
const LOCAL_CACHE_ALGORITHM = 'AES-GCM';
const conversationKeyCache = new Map<string, CryptoKey>();
const conversationMetaCache = new Map<string, ConversationE2EEState | null>();
const cacheKeyForConversation = (conversationId: string, keyVersion: number) => conversationId + ':v' + String(keyVersion || 1);

const encodeUtf8 = (value: string): Uint8Array => new TextEncoder().encode(value);
const decodeUtf8 = (value: ArrayBuffer | Uint8Array): string =>
  new TextDecoder().decode(value instanceof Uint8Array ? value : new Uint8Array(value));


const toBufferSource = (bytes: Uint8Array): ArrayBuffer => {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer as ArrayBuffer;
};
const binaryToBase64 = (binary: string): string => {
  if (typeof (globalThis as any).btoa === 'function') {
    return (globalThis as any).btoa(binary);
  }
  const bufferCtor = (globalThis as any).Buffer;
  if (bufferCtor?.from) {
    return bufferCtor.from(binary, 'binary').toString('base64');
  }
  throw new Error('Base64 encoder unavailable');
};

const base64ToBinary = (value: string): string => {
  if (typeof (globalThis as any).atob === 'function') {
    return (globalThis as any).atob(value);
  }
  const bufferCtor = (globalThis as any).Buffer;
  if (bufferCtor?.from) {
    return bufferCtor.from(value, 'base64').toString('binary');
  }
  throw new Error('Base64 decoder unavailable');
};

const bytesToBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return binaryToBase64(binary);
};

const base64ToBytes = (value: string): Uint8Array => {
  const binary = base64ToBinary(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
};

const randomBytes = (length: number): Uint8Array => {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
};

const importAesKey = async (raw: Uint8Array): Promise<CryptoKey> =>
  crypto.subtle.importKey('raw', toBufferSource(raw), { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);

const importPublicKey = async (jwk: JsonWebKey): Promise<CryptoKey> =>
  crypto.subtle.importKey('jwk', jwk, { name: 'RSA-OAEP', hash: 'SHA-256' }, true, ['encrypt']);

const importPrivateKey = async (jwk: JsonWebKey): Promise<CryptoKey> =>
  crypto.subtle.importKey('jwk', jwk, { name: 'RSA-OAEP', hash: 'SHA-256' }, true, ['decrypt']);

const isEligibleDirectPayload = (messageData: CreateMessageData): boolean => {
  if (messageData.mediaURL || (Array.isArray(messageData.mediaItems) && messageData.mediaItems.length > 0)) return false;
  if (messageData.poll || messageData.location || messageData.storyReply || messageData.sharedContent) return false;
  if ((messageData as any).glimpseId) return false;
  const normalizedType = String(messageData.type || 'text');
  return normalizedType === 'text' || normalizedType === '';
};

const extractRecipientId = (conversation: Conversation, senderId: string): string | null => {
  if (conversation.type !== 'direct') return null;
  return (conversation.participantIds || []).find((participantId) => participantId !== senderId) || null;
};

const toConversationMeta = (value: any): ConversationE2EEState | null => {
  if (!value || typeof value !== 'object' || value.enabled !== true) return null;
  return {
    enabled: true,
    version: Number(value.version || E2EE_VERSION),
    algorithm: String(value.algorithm || ENVELOPE_ALGORITHM),
    keyVersion: Number(value.keyVersion || 1),
    wrappedKeys: typeof value.wrappedKeys === 'object' && value.wrappedKeys ? value.wrappedKeys : {},
    deviceId: String(value.deviceId || DEVICE_DOC_ID),
    initializedAtMs: Number(value.initializedAtMs || 0),
  };
};

const buildEncryptedPayload = async (plaintext: string, conversationKey: CryptoKey) => {
  const iv = randomBytes(12);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: toBufferSource(iv) }, conversationKey, toBufferSource(encodeUtf8(plaintext)));
  return {
    version: E2EE_VERSION,
    algorithm: PAYLOAD_ALGORITHM,
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
  };
};

class ChatE2EEService {
  private identityCache = new Map<string, StoredIdentity>();
  private localCacheKey: CryptoKey | null = null;

  private supportsCrypto(): boolean {
    const secureCrypto = (globalThis as any)?.crypto;
    return Boolean(
      secureCrypto &&
        typeof secureCrypto?.getRandomValues === 'function' &&
        secureCrypto?.subtle
    );
  }

  private async getStoredIdentity(userId: string): Promise<StoredIdentity | null> {
    if (this.identityCache.has(userId)) return this.identityCache.get(userId) || null;
    const raw = await e2eeKeyVault.getItem(IDENTITY_KEY(userId));
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as StoredIdentity;
      if (!parsed?.deviceId || !parsed.publicKeyJwk || !parsed.privateKeyJwk) return null;
      this.identityCache.set(userId, parsed);
      return parsed;
    } catch {
      return null;
    }
  }

  async ensureOwnDeviceBundle(userId: string): Promise<StoredIdentity> {
    const existing = await this.getStoredIdentity(userId);
    if (existing) {
      await this.publishDeviceBundle(userId, existing).catch(() => undefined);
      return existing;
    }

    const keyPair = await crypto.subtle.generateKey(
      {
        name: 'RSA-OAEP',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      true,
      ['encrypt', 'decrypt']
    );

    const publicKeyJwk = (await crypto.subtle.exportKey('jwk', keyPair.publicKey)) as JsonWebKey;
    const privateKeyJwk = (await crypto.subtle.exportKey('jwk', keyPair.privateKey)) as JsonWebKey;
    const identity: StoredIdentity = {
      deviceId: DEVICE_DOC_ID,
      publicKeyJwk,
      privateKeyJwk,
    };

    this.identityCache.set(userId, identity);
    await e2eeKeyVault.setItem(IDENTITY_KEY(userId), JSON.stringify(identity));
    await this.publishDeviceBundle(userId, identity);
    return identity;
  }

  private async publishDeviceBundle(userId: string, identity: StoredIdentity): Promise<void> {
    const ref = doc(db, 'users', userId, 'secureDevices', identity.deviceId);
    await setDoc(
      ref,
      {
        userId,
        deviceId: identity.deviceId,
        algorithm: ENVELOPE_ALGORITHM,
        publicKeyJwk: identity.publicKeyJwk,
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      },
      { merge: true }
    );
  }

  private async getRemoteBundle(userId: string): Promise<RemoteBundle | null> {
    const directRef = doc(db, 'users', userId, 'secureDevices', DEVICE_DOC_ID);
    const directSnap = await getDoc(directRef);
    if (directSnap.exists()) {
      const data = directSnap.data() as any;
      return {
        deviceId: String(data.deviceId || directSnap.id),
        userId,
        publicKeyJwk: data.publicKeyJwk,
        algorithm: String(data.algorithm || ENVELOPE_ALGORITHM),
      };
    }

    const snapshot = await getDocs(query(collection(db, 'users', userId, 'secureDevices'), limit(1)));
    if (snapshot.empty) return null;
    const first = snapshot.docs[0];
    const data = first.data() as any;
    return {
      deviceId: String(data.deviceId || first.id),
      userId,
      publicKeyJwk: data.publicKeyJwk,
      algorithm: String(data.algorithm || ENVELOPE_ALGORITHM),
    };
  }

  private async createConversationMeta(senderId: string, recipientId: string): Promise<ConversationE2EEState | null> {
    const [senderIdentity, recipientBundle] = await Promise.all([
      this.ensureOwnDeviceBundle(senderId),
      this.getRemoteBundle(recipientId),
    ]);

    if (!recipientBundle?.publicKeyJwk) return null;

    const conversationKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
    const rawConversationKey = new Uint8Array(await crypto.subtle.exportKey('raw', conversationKey));
    const [senderPublicKey, recipientPublicKey] = await Promise.all([
      importPublicKey(senderIdentity.publicKeyJwk),
      importPublicKey(recipientBundle.publicKeyJwk),
    ]);

    const [senderWrapped, recipientWrapped] = await Promise.all([
      crypto.subtle.encrypt({ name: 'RSA-OAEP' }, senderPublicKey, toBufferSource(rawConversationKey)),
      crypto.subtle.encrypt({ name: 'RSA-OAEP' }, recipientPublicKey, toBufferSource(rawConversationKey)),
    ]);

    return {
      enabled: true,
      version: E2EE_VERSION,
      algorithm: ENVELOPE_ALGORITHM,
      keyVersion: 1,
      wrappedKeys: {
        [senderId]: bytesToBase64(new Uint8Array(senderWrapped)),
        [recipientId]: bytesToBase64(new Uint8Array(recipientWrapped)),
      },
      deviceId: senderIdentity.deviceId,
      initializedAtMs: Date.now(),
    };
  }

  private async resolveConversationKey(conversationId: string, currentUserId: string, meta: ConversationE2EEState): Promise<CryptoKey | null> {
    const versionedCacheKey = cacheKeyForConversation(conversationId, Number(meta?.keyVersion || 1));
    const cached = conversationKeyCache.get(versionedCacheKey);
    if (cached) return cached;

    const wrappedKey = meta.wrappedKeys?.[currentUserId];
    if (!wrappedKey) return null;

    const identity = await this.ensureOwnDeviceBundle(currentUserId);
    const privateKey = await importPrivateKey(identity.privateKeyJwk);
    const rawKey = await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, privateKey, toBufferSource(base64ToBytes(wrappedKey)));
    const aesKey = await importAesKey(new Uint8Array(rawKey));
    conversationKeyCache.set(versionedCacheKey, aesKey);
    return aesKey;
  }

  private async getConversationMeta(conversationId: string, options?: { forceRefresh?: boolean }): Promise<ConversationE2EEState | null> {
    if (!options?.forceRefresh && conversationMetaCache.has(conversationId)) {
      return conversationMetaCache.get(conversationId) || null;
    }
    const snap = await getDoc(doc(db, 'conversations', conversationId));
    const meta = toConversationMeta(snap.data()?.e2ee);
    if (meta?.enabled) {
      conversationMetaCache.set(conversationId, meta);
    } else {
      conversationMetaCache.delete(conversationId);
    }
    return meta;
  }

  invalidateConversation(conversationId: string): void {
    Array.from(conversationKeyCache.keys()).forEach((key) => {
      if (key.startsWith(conversationId + ':') ) {
        conversationKeyCache.delete(key);
      }
    });
    conversationMetaCache.delete(conversationId);
  }

  async prepareOutgoingMessage(
    conversationId: string,
    conversation: Conversation,
    messageData: CreateMessageData
  ): Promise<EncryptResult> {
    if (!this.supportsCrypto()) {
      return {
        enabled: false,
        messageData,
        previewText: typeof messageData.text === 'string' && messageData.text.trim().length > 0 ? messageData.text : 'Sent you a message',
      };
    }

    if (conversation.type !== 'direct' || !isEligibleDirectPayload(messageData)) {
      return {
        enabled: false,
        messageData,
        previewText: typeof messageData.text === 'string' && messageData.text.trim().length > 0 ? messageData.text : 'Sent you a message',
      };
    }

    const recipientId = extractRecipientId(conversation, messageData.senderId);
    if (!recipientId) {
      return { enabled: false, messageData, previewText: messageData.text || 'Sent you a message' };
    }

    const existingMeta = toConversationMeta((conversation as any).e2ee);
    const meta = existingMeta || (await this.createConversationMeta(messageData.senderId, recipientId));
    if (!meta) {
      return {
        enabled: false,
        messageData,
        previewText: typeof messageData.text === 'string' && messageData.text.trim().length > 0 ? messageData.text : 'Sent you a message',
      };
    }

    const conversationKey = await this.resolveConversationKey(conversationId, messageData.senderId, meta);
    if (!conversationKey) {
      if (existingMeta?.enabled) {
        throw new Error('Secure conversation key unavailable on this device.');
      }
      return {
        enabled: false,
        messageData,
        previewText: typeof messageData.text === 'string' && messageData.text.trim().length > 0 ? messageData.text : 'Sent you a message',
      };
    }

    const payload = {
      text: typeof messageData.text === 'string' ? messageData.text : '',
      replyTo: (messageData as any).replyTo || undefined,
      replyToText: messageData.replyToText || undefined,
      forwardedFrom: messageData.forwardedFrom || undefined,
    };

    const encryptedPayload = await buildEncryptedPayload(JSON.stringify(payload), conversationKey);

    return {
      enabled: true,
      conversationE2EE: meta,
      previewText: 'Encrypted message',
      messageData: {
        ...messageData,
        text: '',
        replyToText: undefined,
        forwardedFrom: undefined,
        encryptedPayload,
        e2eeState: 'encrypted',
      },
    };
  }

  async hydrateMessages(conversationId: string, currentUserId: string, messages: Message[]): Promise<Message[]> {
    if (!Array.isArray(messages) || messages.length === 0) return messages;
    // Any message that carries an encrypted payload must be resolved here. The
    // persisted `text` is blank for encrypted messages, so falling through
    // would render an empty bubble instead of readable content.
    const needsDecrypt = messages.some((message: any) => Boolean(message?.encryptedPayload));
    if (!needsDecrypt) return messages;

    const lockEncryptedMessages = (list: Message[]): Message[] =>
      list.map((message: any) =>
        message?.encryptedPayload
          ? ({ ...message, text: 'Encrypted message', e2eeState: 'locked' } as Message)
          : message
      );

    if (!this.supportsCrypto()) {
      return lockEncryptedMessages(messages);
    }

    let meta = await this.getConversationMeta(conversationId);
    if (!meta?.enabled) {
      meta = await this.getConversationMeta(conversationId, { forceRefresh: true });
    }
    if (!meta?.enabled) {
      return lockEncryptedMessages(messages);
    }

    const conversationKey = await this.resolveConversationKey(conversationId, currentUserId, meta);
    if (!conversationKey) {
      return lockEncryptedMessages(messages);
    }

    return Promise.all(
      messages.map(async (message: any) => {
        if (!message?.encryptedPayload) return message as Message;
        if (!message?.encryptedPayload?.ciphertext) {
          return { ...message, text: 'Encrypted message', e2eeState: 'locked' } as Message;
        }
        try {
          const iv = base64ToBytes(String(message.encryptedPayload.iv || ''));
          const ciphertext = base64ToBytes(String(message.encryptedPayload.ciphertext || ''));
          const plaintextBuffer = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: toBufferSource(iv) }, conversationKey, toBufferSource(ciphertext));
          const parsed = JSON.parse(decodeUtf8(plaintextBuffer));
          return {
            ...message,
            text: typeof parsed?.text === 'string' ? parsed.text : '',
            replyTo: parsed?.replyTo,
            replyToText: parsed?.replyToText,
            forwardedFrom: parsed?.forwardedFrom,
            e2eeState: 'decrypted',
          } as Message;
        } catch {
          return {
            ...message,
            text: 'Encrypted message',
            e2eeState: 'locked',
          } as Message;
        }
      })
    );
  }

  private async getLocalCacheKey(): Promise<CryptoKey> {
    if (this.localCacheKey) return this.localCacheKey;
    let raw = await e2eeKeyVault.getItem(LOCAL_CACHE_KEY);
    if (!raw) {
      raw = bytesToBase64(randomBytes(32));
      await e2eeKeyVault.setItem(LOCAL_CACHE_KEY, raw);
    }
    const key = await importAesKey(base64ToBytes(raw));
    this.localCacheKey = key;
    return key;
  }

  async sealLocalCacheString(value: string): Promise<string> {
    if (!value) return value;
    if (!this.supportsCrypto()) return value;
    const cacheKey = await this.getLocalCacheKey();
    const iv = randomBytes(12);
    const ciphertext = await crypto.subtle.encrypt({ name: LOCAL_CACHE_ALGORITHM, iv: toBufferSource(iv) }, cacheKey, toBufferSource(encodeUtf8(value)));
    return JSON.stringify({ mode: 'sealed', version: 1, algorithm: LOCAL_CACHE_ALGORITHM, iv: bytesToBase64(iv), ciphertext: bytesToBase64(new Uint8Array(ciphertext)) });
  }

  async unsealLocalCacheString(value: string): Promise<string> {
    if (!value) return value;
    if (!this.supportsCrypto()) return value;
    try {
      const parsed = JSON.parse(value);
      if (parsed?.mode !== 'sealed' || !parsed?.ciphertext || !parsed?.iv) return value;
      const cacheKey = await this.getLocalCacheKey();
      const sealedIv = base64ToBytes(String(parsed.iv));
      const sealedCiphertext = base64ToBytes(String(parsed.ciphertext));
      const plaintext = await crypto.subtle.decrypt(
        { name: LOCAL_CACHE_ALGORITHM, iv: toBufferSource(sealedIv) },
        cacheKey,
        toBufferSource(sealedCiphertext)
      );
      return decodeUtf8(plaintext);
    } catch {
      return value;
    }
  }
}

export const chatE2EE = new ChatE2EEService();



