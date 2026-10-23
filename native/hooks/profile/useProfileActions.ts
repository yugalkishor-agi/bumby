import { useState } from 'react';
import { Share } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { mediaService } from '../../services/media.service.native';
import { userService } from '../../services/user.service';

export function useProfileActions(
  currentUser: any,
  profileUser: any,
  loadProfile: (force?: boolean) => Promise<void>
) {
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [showAboutAccountModal, setShowAboutAccountModal] = useState(false);

  const handleShareProfile = async () => {
    try {
      const username = profileUser?.username || '';
      await Share.share({
        message: `Check out @${username} on Bumby`,
        url: `https://bumby.app/user/${username}`,
      });
    } catch (error) {
      console.error('Failed to share profile:', error);
    }
  };

  const handleAvatarUpload = async () => {
    if (!currentUser) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setUploadingAvatar(true);
      try {
        const avatarURL = await mediaService.uploadAvatar(currentUser.userId, result.assets[0]);
        await userService.updateUser(currentUser.userId, { avatarURL });
        await loadProfile(true);
      } catch (error) {
        console.error('Failed to upload avatar:', error);
      } finally {
        setUploadingAvatar(false);
      }
    }
  };

  const openAboutAccount = () => setShowAboutAccountModal(true);
  const closeAboutAccount = () => setShowAboutAccountModal(false);

  return {
    uploadingAvatar,
    handleShareProfile,
    handleAvatarUpload,
    showAboutAccountModal,
    openAboutAccount,
    closeAboutAccount
  };
}
