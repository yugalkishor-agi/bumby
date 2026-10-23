import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  StyleSheet,
  SafeAreaView,
  ScrollView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { useAuth } from '../contexts/AuthContext';
import { userService } from '../services/user.service';
import { mediaService } from '../services/media.service.native';
import { borderRadius, spacing, typography, useColors } from '../styles/theme';
import { InlineLoadingSkeleton } from '../components/ui/LoadingSkeleton';

export default function AvatarEditorScreen() {
  const navigation = useNavigation();
  const c = useColors();
  const { user, refreshUser } = useAuth();
  const [selectedImage, setSelectedImage] = useState<any>(null);
  const [uploading, setUploading] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const pickImage = async (useCamera = false) => {
    try {
      if (useCamera) {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          Alert.alert('Camera access needed', 'Allow camera access to take a photo.');
          return;
        }
      } else {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          Alert.alert('Photo access needed', 'Allow photo access to pick an image.');
          return;
        }
      }

      const result = useCamera
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.8,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.8,
          });

      if (!result.canceled && result.assets[0]) {
        setSelectedImage(result.assets[0]);
        setHasChanges(true);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Could not open picker', 'Try again.');
    }
  };

  const handleDiscard = () => {
    if (!hasChanges) {
      navigation.goBack();
      return;
    }
    Alert.alert('Discard changes?', 'Your new photo will not be saved.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => navigation.goBack() },
    ]);
  };

  const handleSave = async () => {
    if (!user || !selectedImage || !hasChanges) {
      navigation.goBack();
      return;
    }

    setUploading(true);
    try {
      const avatarURL = await mediaService.uploadAvatar(user.userId, selectedImage);
      await userService.updateUser(user.userId, { avatarURL });
      await refreshUser();

      Alert.alert('Photo updated', undefined, [{ text: 'OK', onPress: () => navigation.goBack() }]);
    } catch (error) {
      console.error('Failed to update avatar:', error);
      const message = error instanceof Error ? error.message : 'Failed to update profile photo';
      Alert.alert('Upload failed', message);
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = async () => {
    if (!user) return;

    Alert.alert('Remove photo?', 'Your profile will fall back to your initials.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setUploading(true);
          try {
            const previousAvatarURL = user.avatarURL;
            // `undefined` clears the field on the user doc (updateUser
            // translates it to an explicit Firestore field deletion).
            await userService.updateUser(user.userId, { avatarURL: undefined });
            await refreshUser();
            // Best-effort cleanup of the stored object so it does not orphan.
            if (previousAvatarURL) {
              await mediaService.deleteAvatar(previousAvatarURL);
            }
            Alert.alert('Photo removed', undefined, [
              { text: 'OK', onPress: () => navigation.goBack() },
            ]);
          } catch (error) {
            console.error('Failed to remove avatar:', error);
            const message = error instanceof Error ? error.message : 'Failed to remove profile photo';
            Alert.alert('Remove failed', message);
          } finally {
            setUploading(false);
          }
        },
      },
    ]);
  };

  const currentAvatarURL = selectedImage?.uri || user?.avatarURL;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: c.background.primary }]}>
      <View style={[styles.header, { borderBottomColor: c.border.subtle }]}>
        <TouchableOpacity
          onPress={handleDiscard}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={styles.iconButton}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
        >
          <Ionicons name="close" size={24} color={c.text.primary} />
        </TouchableOpacity>

        <Text style={[styles.title, { color: c.text.primary }]}>Profile photo</Text>

        <TouchableOpacity
          onPress={handleSave}
          disabled={uploading || !hasChanges}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={[styles.saveButton, (!hasChanges || uploading) && styles.disabled]}
          accessibilityRole="button"
          accessibilityLabel="Save photo"
        >
          {uploading ? (
            <InlineLoadingSkeleton size={16} />
          ) : (
            <Text style={[styles.saveText, !hasChanges && { color: c.text.muted }]}>Save</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.avatarContainer}>
          {currentAvatarURL ? (
            <Image
              source={{ uri: currentAvatarURL }}
              style={styles.avatar}
              contentFit="cover"
              transition={150}
            />
          ) : (
            <View
              style={[
                styles.avatarPlaceholder,
                { backgroundColor: c.background.secondary, borderColor: c.border.medium },
              ]}
            >
              <Ionicons name="person" size={80} color={c.text.muted} />
            </View>
          )}
          {selectedImage ? (
            <View style={[styles.changeIndicator, { backgroundColor: c.background.primary }]}>
              <Ionicons name="checkmark-circle" size={24} color={c.accent.primary} />
            </View>
          ) : null}
        </View>

        <View style={styles.actionsContainer}>
          <ActionButton
            icon="camera"
            label="Take photo"
            onPress={() => pickImage(true)}
            disabled={uploading}
            iconColor={c.accent.primary}
            surface={c.background.secondary}
            borderColor={c.border.subtle}
            textColor={c.text.primary}
          />
          <ActionButton
            icon="images"
            label="Choose from library"
            onPress={() => pickImage(false)}
            disabled={uploading}
            iconColor={c.accent.primary}
            surface={c.background.secondary}
            borderColor={c.border.subtle}
            textColor={c.text.primary}
          />
          {user?.avatarURL ? (
            <ActionButton
              icon="trash"
              label="Remove photo"
              onPress={handleRemove}
              disabled={uploading}
              iconColor={c.accent.error}
              surface={c.background.secondary}
              borderColor={c.border.subtle}
              textColor={c.accent.error}
            />
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function ActionButton({
  icon,
  label,
  onPress,
  disabled,
  iconColor,
  surface,
  borderColor,
  textColor,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  iconColor: string;
  surface: string;
  borderColor: string;
  textColor: string;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.actionButton,
        { backgroundColor: surface, borderColor },
        disabled && styles.disabled,
      ]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons name={icon} size={22} color={iconColor} />
      <Text style={[styles.actionText, { color: textColor }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
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
    opacity: 0.5,
  },
  saveText: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  avatarContainer: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  avatar: {
    width: 200,
    height: 200,
    borderRadius: 100,
  },
  avatarPlaceholder: {
    width: 200,
    height: 200,
    borderRadius: 100,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderStyle: 'dashed',
  },
  changeIndicator: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    borderRadius: 12,
    padding: 2,
  },
  actionsContainer: {
    gap: spacing.md,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: borderRadius.md,
    borderWidth: 1,
  },
  actionText: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.medium,
  },
});
