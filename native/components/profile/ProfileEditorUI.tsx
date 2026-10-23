import React from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { borderRadius, spacing, typography, useColors } from '../../styles/theme';
import { InlineLoadingSkeleton } from '../ui/LoadingSkeleton';

interface EditorScaffoldProps {
  title: string;
  onBack: () => void;
  onSave?: () => void;
  saving?: boolean;
  /** Disables the save affordance (e.g. nothing changed yet). */
  canSave?: boolean;
  children: React.ReactNode;
}

/**
 * Shared chrome for the single-field profile editors: back, title and a save
 * action that reflects the pending state. Keeps the editors visually
 * identical and avoids duplicating header logic in every screen.
 */
export function EditorScaffold({
  title,
  onBack,
  onSave,
  saving = false,
  canSave = true,
  children,
}: EditorScaffoldProps) {
  const c = useColors();
  const saveDisabled = !onSave || saving || !canSave;

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: c.background.primary }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.header, { borderBottomColor: c.border.subtle }]}>
        <TouchableOpacity
          onPress={onBack}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={styles.iconButton}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={24} color={c.text.primary} />
        </TouchableOpacity>

        <Text style={[styles.title, { color: c.text.primary }]} numberOfLines={1}>
          {title}
        </Text>

        {onSave ? (
          <TouchableOpacity
            onPress={onSave}
            disabled={saveDisabled}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={[styles.saveButton, saveDisabled && styles.disabled]}
            accessibilityRole="button"
            accessibilityLabel="Save"
          >
            {saving ? (
              <InlineLoadingSkeleton size={16} />
            ) : (
              <Text
                style={[
                  styles.saveText,
                  { color: c.accent.primary },
                  !canSave && { color: c.text.muted },
                ]}
              >
                Save
              </Text>
            )}
          </TouchableOpacity>
        ) : (
          <View style={styles.iconButton} />
        )}
      </View>

      {children}
    </KeyboardAvoidingView>
  );
}

interface EditorFieldProps {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  multiline?: boolean;
  maxLength?: number;
  keyboardType?: 'default' | 'url' | 'email-address';
  autoCapitalize?: 'none' | 'sentences' | 'words';
  autoCorrect?: boolean;
  autoFocus?: boolean;
  minHeight?: number;
  /** Shows a `used/max` counter under the field. */
  counter?: { current: number; max: number };
  style?: ViewStyle;
}

/**
 * Labelled input used by the profile editors. The label doubles as the
 * placeholder-free description, so no extra helper copy is needed.
 */
export function EditorField({
  label,
  value,
  onChangeText,
  placeholder,
  multiline = false,
  maxLength,
  keyboardType = 'default',
  autoCapitalize = 'sentences',
  autoCorrect = true,
  autoFocus = false,
  minHeight,
  counter,
  style,
}: EditorFieldProps) {
  const c = useColors();
  const atLimit = counter ? counter.current >= counter.max : false;

  return (
    <View style={style}>
      <Text style={[styles.label, { color: c.text.primary }]}>{label}</Text>
      <TextInput
        style={[
          styles.input,
          {
            backgroundColor: c.background.secondary,
            borderColor: c.border.medium,
            color: c.text.primary,
          },
          multiline && styles.multiline,
          minHeight != null && { minHeight },
        ]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={c.text.muted}
        multiline={multiline}
        maxLength={maxLength}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoCorrect={autoCorrect}
        autoFocus={autoFocus}
        textAlignVertical={multiline ? 'top' : 'center'}
      />
      {counter ? (
        <Text style={[styles.counter, { color: atLimit ? c.accent.primary : c.text.muted }]}>
          {counter.current}/{counter.max}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
  },
  iconButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
  },
  saveButton: {
    minWidth: 56,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.6,
  },
  saveText: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
  },
  label: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    marginBottom: spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: typography.fontSize.base,
    minHeight: 52,
  },
  multiline: {
    paddingTop: spacing.md,
  },
  counter: {
    alignSelf: 'flex-end',
    marginTop: spacing.xs,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
  },
});
