import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { userService } from '../services/user.service';
import type { User } from '../types/database';

export type ProfileTextField = 'displayName' | 'bio' | 'website' | 'location';

interface UseProfileFieldOptions {
  field: ProfileTextField;
  /** Transform the raw input right before it is written to the user doc. */
  normalize?: (raw: string) => string;
}

/**
 * Loads, edits and persists a single text field on the signed-in user's profile.
 *
 * `userService.getUser` never throws - it resolves to `null` on failure - so the
 * value read from the auth context is used as a fallback instead of leaving an
 * empty form that would wipe the stored value on save.
 */
export function useProfileField({ field, normalize }: UseProfileFieldOptions) {
  const { user, refreshUser } = useAuth();
  const userId = user?.userId ?? null;

  const [value, setValue] = useState('');
  const [initial, setInitial] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Keeps the auth-sourced fallback out of the `load` dependency list so the
  // effect below cannot re-trigger on every auth context update.
  const fallbackRef = useRef('');
  fallbackRef.current = (user?.[field] as string | undefined) ?? '';

  const load = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }

    try {
      const doc = await userService.getUser(userId);
      const next = (doc?.[field] as string | undefined) ?? fallbackRef.current;
      setValue(next);
      setInitial(next);
    } catch (error) {
      console.error(`Failed to load profile field "${field}":`, error);
      const next = fallbackRef.current;
      setValue(next);
      setInitial(next);
    } finally {
      setLoading(false);
    }
  }, [userId, field]);

  useEffect(() => {
    void load();
  }, [load]);

  const dirty = value !== initial;

  const save = useCallback(async (): Promise<boolean> => {
    if (!userId || saving) return false;

    setSaving(true);
    try {
      const next = normalize ? normalize(value) : value.trim();
      await userService.updateUser(userId, { [field]: next } as Partial<User>);
      await refreshUser();
      setValue(next);
      setInitial(next);
      return true;
    } catch (error) {
      console.error(`Failed to save profile field "${field}":`, error);
      return false;
    } finally {
      setSaving(false);
    }
  }, [userId, saving, value, normalize, field, refreshUser]);

  const revert = useCallback(() => {
    setValue(initial);
  }, [initial]);

  return {
    value,
    setValue,
    initial,
    dirty,
    loading,
    saving,
    save,
    revert,
    reload: load,
  };
}
