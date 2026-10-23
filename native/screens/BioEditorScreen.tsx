import React, { useCallback, useRef } from 'react';
import { View, Alert, StyleSheet } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { EditorField, EditorScaffold } from '../components/profile/ProfileEditorUI';
import { useProfileField } from '../hooks/useProfileField';
import { spacing } from '../styles/theme';

const MAX_LENGTH = 150;

export default function BioEditorScreen() {
  const navigation = useNavigation();
  const { value, setValue, dirty, loading, saving, save, revert, reload } = useProfileField({
    field: 'bio',
  });

  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  useFocusEffect(
    useCallback(() => {
      if (!dirtyRef.current) void reload();
    }, [reload])
  );

  const handleSave = async () => {
    const ok = await save();
    if (ok) navigation.goBack();
    else Alert.alert('Could not save', 'Your bio was not updated. Try again.');
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
      title="Bio"
      onBack={handleBack}
      onSave={handleSave}
      saving={saving}
      canSave={dirty && !loading}
    >
      <View style={styles.content}>
        <EditorField
          label="Bio"
          value={value}
          onChangeText={setValue}
          placeholder="Say something about yourself"
          multiline
          minHeight={140}
          maxLength={MAX_LENGTH}
          counter={{ current: value.length, max: MAX_LENGTH }}
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
