import React, { useCallback, useRef } from 'react';
import { View, Alert, StyleSheet } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { EditorField, EditorScaffold } from '../components/profile/ProfileEditorUI';
import { useProfileField } from '../hooks/useProfileField';
import { spacing } from '../styles/theme';

const MAX_LENGTH = 200;

const normalizeWebsite = (raw: string) => {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
};

// Host must contain a dot and no whitespace.
const URL_PATTERN = /^https?:\/\/[^\s/]+\.[^\s/]+$/i;

export default function WebsiteEditorScreen() {
  const navigation = useNavigation();
  const { value, setValue, dirty, loading, saving, save, revert, reload } = useProfileField({
    field: 'website',
    normalize: normalizeWebsite,
  });

  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  useFocusEffect(
    useCallback(() => {
      if (!dirtyRef.current) void reload();
    }, [reload])
  );

  const handleSave = async () => {
    const next = normalizeWebsite(value);
    if (next && !URL_PATTERN.test(next)) {
      Alert.alert('Invalid link', 'Enter a valid web address.');
      return;
    }

    const ok = await save();
    if (ok) navigation.goBack();
    else Alert.alert('Could not save', 'Your website was not updated. Try again.');
  };

  const handleBack = () => {
    if (!dirty) {
      navigation.goBack();
      return;
    }
    Alert.alert('Discard changes?', 'Your edits will be lost.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => {
          revert();
          navigation.goBack();
        },
      },
    ]);
  };

  return (
    <EditorScaffold
      title="Website"
      onBack={handleBack}
      onSave={handleSave}
      saving={saving}
      canSave={dirty && !loading}
    >
      <View style={styles.content}>
        <EditorField
          label="Website"
          value={value}
          onChangeText={setValue}
          placeholder="example.com"
          keyboardType="url"
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={MAX_LENGTH}
          autoFocus
        />
      </View>
    </EditorScaffold>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    padding: spacing.lg,
  },
});
