import React from 'react';
import { createSettingsScreen } from '../templates/SettingsTemplate';

export default createSettingsScreen({
  title: 'Help Center',
  sections: [
    {
      title: 'Guides',
      items: [
        { label: 'FAQ', type: 'navigation', icon: 'help-circle', navigateTo: 'FAQ', description: 'Quick answers to common questions' },
        { label: 'Community Guidelines', type: 'navigation', icon: 'book', navigateTo: 'Guidelines', description: 'Rules for posts, messages, and stories' },
        { label: 'Privacy Policy', type: 'navigation', icon: 'shield-checkmark', navigateTo: 'PrivacyPolicy', description: 'How Iris handles your data' },
      ],
    },
    {
      title: 'Account & Safety',
      items: [
        { label: 'Privacy Settings', type: 'navigation', icon: 'lock-closed', navigateTo: 'PrivacySettings', description: 'Visibility and interaction controls' },
        { label: 'Account Security', type: 'navigation', icon: 'shield', navigateTo: 'SecuritySettings', description: 'Password, two-factor auth, app lock' },
      ],
    },
    {
      title: 'Support',
      items: [
        { label: 'Report a Problem', type: 'navigation', icon: 'flag', navigateTo: 'ReportProblem', description: 'Send a bug report' },
        { label: 'Contact Support', type: 'navigation', icon: 'mail', navigateTo: 'ContactSupport', description: 'Get help with your account' },
        { label: 'Notification Settings', type: 'navigation', icon: 'notifications', navigateTo: 'NotificationSettings', description: 'Choose what you get notified about' },
        { label: 'Storage Usage', type: 'navigation', icon: 'server', navigateTo: 'StorageUsage', description: 'Media and app storage on this device' },
      ],
    },
  ],
});
