import React from 'react';
import { createSettingsScreen } from '../templates/SettingsTemplate';

export default createSettingsScreen({
  title: 'Account',
  sections: [
    {
      title: 'Sign-in',
      items: [
        {
          label: 'Email & Phone',
          type: 'navigation',
          icon: 'mail',
          description: 'Change your contact details',
          navigateTo: 'EmailPhone',
        },
        {
          label: 'Change Password',
          type: 'navigation',
          icon: 'key',
          description: 'Set a new password',
          navigateTo: 'ChangePassword',
        },
      ],
    },
    {
      title: 'Storage',
      items: [
        {
          label: 'Storage Usage',
          type: 'navigation',
          icon: 'server',
          description: 'Space used by Iris on this device',
          navigateTo: 'StorageUsage',
        },
        {
          label: 'Clear Cache',
          type: 'navigation',
          icon: 'trash',
          description: 'Free up space',
          navigateTo: 'CacheManagement',
        },
      ],
    },
    {
      title: 'Account',
      items: [
        {
          label: 'Deactivate Account',
          type: 'navigation',
          icon: 'pause-circle',
          description: 'Temporarily hide your account',
          navigateTo: 'DeactivateAccount',
          danger: true,
        },
        {
          label: 'Delete Account',
          type: 'navigation',
          icon: 'trash-bin',
          description: 'Permanently remove your account',
          navigateTo: 'DeleteAccount',
          danger: true,
        },
      ],
    },
  ],
});
