import { InlineLoadingSkeleton, ButtonLoadingSkeleton } from '../components/ui/LoadingSkeleton';
import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
  Dimensions} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../contexts/AuthContext';
import { userService } from '../services/user.service';
import { mediaService } from '../services/media.service.native';
import { colors, spacing, typography } from '../styles/theme';
import { Image } from 'expo-image';

export default function AvatarEditorScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const [selectedImage, setSelectedImage] = useState<any>(null);
  const [uploading, setUploading] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const pickImage = async (useCamera = false) => {
    try {
      if (useCamera) {
        // launchCameraAsync throws (or silently cancels) without camera
        // permission - request it explicitly before opening the camera.
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          Alert.alert('Camera access needed', 'Allow camera access in your settings to take a profile photo.');
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
      Alert.alert('Error', 'Failed to select image');
    }
  };

  const handleDiscard = () => {
    if (hasChanges) {
      Alert.alert('Discard Changes', 'Are you sure you want to discard your changes?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => navigation.goBack() }
      ]);
    } else {
      navigation.goBack();
    }
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
      
      Alert.alert('Success', 'Profile photo updated successfully!', [
        { text: 'OK', onPress: () => navigation.goBack() }
      ]);
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
    
    Alert.alert(
      'Remove Profile Photo',
      'Are you sure you want to remove your profile photo?',
      [
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
              // Best-effort cleanup of the stored object so it does not orphan.
              if (previousAvatarURL) {
                await mediaService.deleteAvatar(previousAvatarURL);
              }
              Alert.alert('Success', 'Profile photo removed successfully!', [
                { text: 'OK', onPress: () => navigation.goBack() }
              ]);
            } catch (error) {
              console.error('Failed to remove avatar:', error);
              const message = error instanceof Error ? error.message : 'Failed to remove profile photo';
              Alert.alert('Remove failed', message);
            } finally {
              setUploading(false);
            }
          }
        }
      ]
    );
  };

  const currentAvatarURL = selectedImage?.uri || user?.avatarURL;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleDiscard}>
          <Ionicons name="close" size={24} color={colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.title}>Profile Photo</Text>
        <TouchableOpacity 
          onPress={handleSave}
          disabled={uploading || !hasChanges}
          style={[styles.saveButton, (!hasChanges || uploading) && styles.saveButtonDisabled]}
        >
          {uploading ? (
            <InlineLoadingSkeleton />
          ) : (
            <Text style={[styles.saveText, !hasChanges && styles.saveTextDisabled]}>
              Save
            </Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Avatar Preview */}
        <View style={styles.avatarContainer}>
          {currentAvatarURL ? (
            <Image source={{ uri: currentAvatarURL }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Ionicons name="person" size={80} color={colors.text.secondary} />
            </View>
          )}
          {selectedImage && (
            <View style={styles.changeIndicator}>
              <Ionicons name="checkmark-circle" size={24} color={colors.accent.primary} />
            </View>
          )}
        </View>

        {/* Action Buttons */}
        <View style={styles.actionsContainer}>
          <TouchableOpacity 
            style={styles.actionButton}
            onPress={() => pickImage(true)}
            disabled={uploading}
          >
            <View style={styles.actionIcon}>
              <Ionicons name="camera" size={24} color={colors.accent.primary} />
            </View>
            <Text style={styles.actionText}>Take Photo</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.actionButton}
            onPress={() => pickImage(false)}
            disabled={uploading}
          >
            <View style={styles.actionIcon}>
              <Ionicons name="images" size={24} color={colors.accent.primary} />
            </View>
            <Text style={styles.actionText}>Choose from Library</Text>
          </TouchableOpacity>

          {user?.avatarURL && (
            <TouchableOpacity 
              style={styles.actionButton}
              onPress={handleRemove}
              disabled={uploading}
            >
              <View style={styles.actionIcon}>
                <Ionicons name="trash" size={24} color={colors.text.secondary} />
              </View>
              <Text style={[styles.actionText, styles.removeText]}>Remove Photo</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Tips */}
        <View style={styles.tipsContainer}>
          <Text style={styles.tipsTitle}>Photo Tips:</Text>
          <Text style={styles.tipText}>• Use a clear, well-lit photo</Text>
          <Text style={styles.tipText}>• Make sure your face is visible</Text>
          <Text style={styles.tipText}>• Square photos work best</Text>
          <Text style={styles.tipText}>• Avoid group photos</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  title: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold as any,
    color: colors.text.primary,
  },
  saveButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveText: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold as any,
    color: colors.accent.primary,
  },
  saveTextDisabled: {
    color: colors.text.secondary,
  },
  content: {
    flex: 1,
    padding: spacing.lg,
  },
  avatarContainer: {
    alignItems: 'center',
    marginBottom: spacing.xl,
    position: 'relative',
  },
  avatar: {
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: colors.background.secondary,
  },
  avatarPlaceholder: {
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: colors.background.secondary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.border.subtle,
    borderStyle: 'dashed',
  },
  changeIndicator: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    backgroundColor: colors.background.primary,
    borderRadius: 12,
    padding: 2,
  },
  actionsContainer: {
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    backgroundColor: colors.background.secondary,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  actionIcon: {
    marginRight: spacing.md,
  },
  actionText: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.medium as any,
    color: colors.text.primary,
  },
  removeText: {
    color: colors.accent.error,
  },
  tipsContainer: {
    backgroundColor: colors.background.secondary,
    padding: spacing.lg,
    borderRadius: 12,
    marginBottom: spacing.xl,
  },
  tipsTitle: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold as any,
    color: colors.text.primary,
    marginBottom: spacing.sm,
  },
  tipText: {
    fontSize: 14,
    color: colors.text.secondary,
    marginBottom: spacing.xs,
    lineHeight: 20,
  },
});






