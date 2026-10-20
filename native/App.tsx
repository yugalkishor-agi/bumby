import 'react-native-reanimated';
import 'react-native-gesture-handler';
import React, { useEffect, useRef } from 'react';
import { useNavigation } from '@react-navigation/native';
import { navigationRef } from './services/navigation.service';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { View, SafeAreaView, Platform, Text, AppState, InteractionManager } from 'react-native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

// Import Firebase and Supabase to initialize
import './config/firebase';
import './config/supabase';
import './utils/debug';

// Contexts
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ToastProvider } from './contexts/ToastContext';
import { StoryProcessingProvider } from './contexts/StoryProcessingContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { UploadProvider } from './contexts/UploadContext';
import ErrorBoundary from './components/debug/ErrorBoundary';
import { StoryProcessingBar } from './components/ui/StoryProcessingBar';
import ThemedNavigationShell from './components/navigation/ThemedNavigationShell';
import { LoadingSkeleton } from './components/ui/LoadingSkeleton';

const getWelcomeScreen = () => require('./screens/WelcomeScreen').default;
const getOnboardingScreen = () => require('./screens/OnboardingScreen').default;
const getLoginScreen = () => require('./screens/LoginScreen').default;
const getSignupScreen = () => require('./screens/SignupScreen').default;
const getForgotPasswordScreen = () => require('./screens/ForgotPasswordScreen').default;
const getHomeScreen = () => require('./screens/HomeScreenWorking').default;
const getSearchScreenEnhanced = () => require('./screens/SearchScreenEnhanced').default;
const getNewPostScreenEnhanced = () => require('./screens/NewPostScreenEnhanced').default;
const getCreateTabHandler = () => require('./screens/CreateTabHandler').default;
const getNotificationsScreenEnhanced = () => require('./screens/NotificationsScreenEnhanced').default;
const getProfileScreenEnhanced = () => require('./screens/ProfileScreenEnhanced').default;
const getMessagesScreenEnhanced = () => require('./screens/MessagesScreenEnhanced').default;
const getChatScreenEnhanced = () => require('./screens/ChatScreenEnhanced').default;
const getNewMessageScreen = () => require('./screens/NewMessageScreen').default;
const getChatDetailsScreen = () => require('./screens/ChatDetailsScreen').default;
const getChatMessageSearchScreen = () => require('./screens/ChatMessageSearchScreen').default;
const getChatPrivacySafetyScreen = () => require('./screens/ChatPrivacySafetyScreen').default;
const getChatProfileScreen = () => require('./screens/ChatProfileScreen').default;
const getNewChatScreen = () => require('./screens/NewChatScreen').default;
const getNewGroupScreen = () => require('./screens/NewGroupScreen').default;
const getGroupInfoScreen = () => require('./screens/GroupInfoScreen').default;
const getGroupChatSettingsScreen = () => require('./screens/GroupChatSettingsScreen').default;
const getPostViewScreen = () => require('./screens/PostViewScreen').default;
const getCommentsScreen = () => require('./screens/CommentsScreen').default;
const getLikesListScreenEnhanced = () => require('./screens/LikesListScreenEnhanced').default;
const getReportScreen = () => require('./screens/ReportScreen').default;
const getMutualFollowersScreen = () => require('./screens/MutualFollowersScreen').default;
const getSharePostScreen = () => require('./screens/SharePostScreen').default;
const getStoryViewerScreenEnhanced = () => require('./screens/StoryViewerScreenEnhanced').default;
const getStoryCreateScreen = () => require('./screens/StoryCreateScreen').default;
const getGlimpseViewerScreen = () => require('./screens/GlimpseViewerScreenEnhanced').default;
const getGlimpseCreateScreen = () => require('./screens/GlimpseCreateScreen').default;
const getGlimpsesScreen = () => require('./screens/GlimpsesScreen').default;
const getHighlightsScreen = () => require('./screens/HighlightsScreen').default;
const getViewersListScreen = () => require('./screens/ViewersListScreen').default;
const getBackendDiagnosticsScreen = () => require('./screens/BackendDiagnosticsScreen').default;
const getEditProfileScreen = () => require('./screens/EditProfileScreen').default;
const getFollowersListScreen = () => require('./screens/FollowersListScreen').default;
const getFollowingScreen = () => require('./screens/FollowingScreen').default;
const getTaggedPostsScreen = () => require('./screens/TaggedPostsScreen').default;
const getMentionsScreen = () => require('./screens/MentionsScreen_Full').default;
const getAvatarEditorScreen = () => require('./screens/AvatarEditorScreen').default;
const getBioEditorScreen = () => require('./screens/BioEditorScreen').default;
const getNameEditorScreen = () => require('./screens/NameEditorScreen').default;
const getWebsiteEditorScreen = () => require('./screens/WebsiteEditorScreen').default;
const getLocationEditorScreen = () => require('./screens/LocationEditorScreen').default;
const getSavedPostsScreen = () => require('./screens/SavedPostsScreen').default;
const getArchiveScreen = () => require('./screens/ArchiveScreen').default;
const getLikedPostsScreen = () => require('./screens/LikedPostsScreen').default;
const getCollectionsScreen = () => require('./screens/CollectionsScreen').default;
const getCollectionDetailScreen = () => require('./screens/CollectionDetailScreen').default;
const getBookmarksScreen = () => require('./screens/BookmarksScreen').default;
const getDraftsScreen = () => require('./screens/DraftsScreen').default;
const getDiscoveryScreen = () => require('./screens/DiscoveryScreen').default;
const getExploreScreen = () => require('./screens/ExploreScreen').default;
const getTrendingScreen = () => require('./screens/TrendingScreen').default;
const getHashtagScreen = () => require('./screens/HashtagScreen').default;
const getLocationScreen = () => require('./screens/LocationScreen').default;
const getSuggestionsScreenEnhanced = () => require('./screens/SuggestionsScreenEnhanced').default;
const getRecentSearchesScreen = () => require('./screens/RecentSearchesScreen').default;
const getActiveUsersScreen = () => require('./screens/ActiveUsersScreen').default;
const getSettingsScreenEnhanced = () => require('./screens/SettingsScreenEnhanced').default;
const getPrivacySettingsScreen = () => require('./screens/PrivacySettingsScreen').default;
const getNotificationSettingsScreen = () => require('./screens/NotificationSettingsScreen').default;
const getAccountSettingsScreen = () => require('./screens/AccountSettingsScreen').default;
const getSecuritySettingsScreen = () => require('./screens/SecuritySettingsScreen').default;
const getAppearanceSettingsScreen = () => require('./screens/AppearanceSettingsScreen').default;
const getLanguageSettingsScreen = () => require('./screens/LanguageSettingsScreen').default;
const getDataUsageScreen = () => require('./screens/DataUsageScreen').default;
const getAccessibilityScreen = () => require('./screens/AccessibilityScreen').default;
const getSoundSettingsScreen = () => require('./screens/SoundSettingsScreen').default;
const getAutoPlaySettingsScreen = () => require('./screens/AutoPlaySettingsScreen').default;
const getCaptionsSettingsScreen = () => require('./screens/CaptionsSettingsScreen').default;
const getTwoFactorAuthScreen = () => require('./screens/TwoFactorAuthScreen').default;
const getChangePasswordScreen = () => require('./screens/ChangePasswordScreen').default;
const getDeactivateAccountScreen = () => require('./screens/DeactivateAccountScreen').default;
const getDeleteAccountScreen = () => require('./screens/DeleteAccountScreen').default;
const getEmailPhoneScreen = () => require('./screens/EmailPhoneScreen').default;
const getLoginActivityScreen = () => require('./screens/LoginActivityScreen').default;
const getSavedLoginScreen = () => require('./screens/SavedLoginScreen').default;
const getAppsWebsitesScreen = () => require('./screens/AppsWebsitesScreen').default;
const getBackupCodesScreen = () => require('./screens/BackupCodesScreen').default;
const getAccountActivityScreen = () => require('./screens/AccountActivityScreen').default;
const getBlockedUsersScreen = () => require('./screens/BlockedUsersScreen').default;
const getCloseFriendsScreen = () => require('./screens/CloseFriendsScreen').default;
const getRestrictedAccountsScreen = () => require('./screens/RestrictedAccountsScreen').default;
const getFollowRequestsScreen = () => require('./screens/FollowRequestsScreen').default;
const getMessagePrivacyScreen = () => require('./screens/MessagePrivacyScreen').default;
const getTagPrivacyScreen = () => require('./screens/TagPrivacyScreen').default;
const getHideStoryScreen = () => require('./screens/HideStoryScreen').default;
const getMentionSettingsScreen = () => require('./screens/MentionSettingsScreen').default;
const getReportContentScreen = () => require('./screens/ReportContentScreen').default;
const getReportProblemScreen = () => require('./screens/ReportProblemScreen').default;
const getBlockConfirmScreen = () => require('./screens/BlockConfirmScreen').default;
const getMuteConfirmScreen = () => require('./screens/MuteConfirmScreen').default;
const getAnalyticsScreen = () => require('./screens/AnalyticsScreen').default;
const getInsightsScreen = () => require('./screens/InsightsScreen').default;
const getActivityLogScreen = () => require('./screens/ActivityLogScreen').default;
const getStorageUsageScreen = () => require('./screens/StorageUsageScreen').default;
const getMediaPickerScreen = () => require('./screens/MediaPickerScreen').default;
const getCaptionEditorScreen = () => require('./screens/CaptionEditorScreen').default;
const getFiltersScreen = () => require('./screens/FiltersScreen').default;
const getCropScreen = () => require('./screens/CropScreen').default;
const getQRCodeScreen = () => require('./screens/QRCodeScreen').default;
const getScanQRScreen = () => require('./screens/ScanQRScreen').default;
const getPollCreateScreen = () => require('./screens/PollCreateScreen').default;
const getLiveStreamScreen = () => require('./screens/LiveStreamScreen').default;
const getBadgesScreen = () => require('./screens/BadgesScreen').default;
const getAchievementsScreen = () => require('./screens/AchievementsScreen').default;
const getLeaderboardScreen = () => require('./screens/LeaderboardScreen').default;
const getInterestsScreen = () => require('./screens/InterestsScreen').default;
const getThemeScreen = () => require('./screens/ThemeScreen').default;
const getFontSizeScreen = () => require('./screens/FontSizeScreen').default;
const getRequestVerificationScreen = () => require('./screens/RequestVerificationScreen').default;
const getCacheManagementScreen = () => require('./screens/CacheManagementScreen').default;
const getDownloadDataScreen = () => require('./screens/DownloadDataScreen').default;
const getHelpCenterScreen = () => require('./screens/HelpCenterScreen').default;
const getAboutScreen = () => require('./screens/AboutScreen').default;
const getTermsScreen = () => require('./screens/TermsScreen').default;
const getPrivacyPolicyScreen = () => require('./screens/PrivacyPolicyScreen').default;
const getGuidelinesScreen = () => require('./screens/GuidelinesScreen').default;
const getFAQScreen = () => require('./screens/FAQScreen').default;
const getContactSupportScreen = () => require('./screens/ContactSupportScreen').default;

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function SearchRedirectScreen() {
  const navigation = useNavigation();
  useEffect(() => {
    (navigation as any).navigate('Main', { screen: 'Search' });
  }, [navigation]);
  return null;
}

import { ModernTabBar } from './components/navigation/ModernTabBar';
import { Image } from 'expo-image';

function MainTabs() {
  return (
    <Tab.Navigator 
      id={undefined}
      detachInactiveScreens
      tabBar={(props) => <ModernTabBar {...props} />}
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tab.Screen
        name="Home"
        getComponent={getHomeScreen}
      />
      <Tab.Screen
        name="Search"
        getComponent={getSearchScreenEnhanced}
      />
      <Tab.Screen
        name="NewPost"
        getComponent={getCreateTabHandler}
      />
      <Tab.Screen
        name="Glimpses"
        getComponent={getGlimpsesScreen}
        listeners={({ navigation }: any) => ({
          tabPress: (event: any) => {
            event.preventDefault();
            const parent = navigation?.getParent?.();
            if (parent?.navigate) {
              parent.navigate('GlimpseViewer', { index: 0 });
              return;
            }
            navigation.navigate('GlimpseViewer', { index: 0 });
          },
        })}
        options={{
          tabBarStyle: { display: 'none' },
        }}
      />
      <Tab.Screen
        name="Profile"
        getComponent={getProfileScreenEnhanced}
      />
    </Tab.Navigator>
  );
}

function AuthStack() {
  return (
    <Stack.Navigator id={undefined} screenOptions={{ headerShown: false }}>

      <Stack.Screen name="Welcome" getComponent={getWelcomeScreen} />
      <Stack.Screen name="Onboarding" getComponent={getOnboardingScreen} />
      <Stack.Screen name="Login" getComponent={getLoginScreen} />
      <Stack.Screen name="Signup" getComponent={getSignupScreen} />
      <Stack.Screen name="ForgotPassword" getComponent={getForgotPasswordScreen} />
    </Stack.Navigator>
  );
}

function AppNavigator() {
  const { user, loading } = useAuth();
  const initialAuthResolvedRef = useRef(false);

  useEffect(() => {
    if (!loading) {
      initialAuthResolvedRef.current = true;
    }
  }, [loading]);

  useEffect(() => {
    let cancelled = false;
    let task: { cancel?: () => void } | null = null;

    if (!user?.userId) {
      try {
        require('./services/push.service').pushService.cleanup();
      } catch {}
      return;
    }

    task = InteractionManager.runAfterInteractions(() => {
      if (cancelled) return;
      const { pushService } = require('./services/push.service');
      void pushService.initialize(user.userId);
    });

    return () => {
      cancelled = true;
      try {
        task?.cancel?.();
      } catch {}
      try {
        require('./services/push.service').pushService.cleanup();
      } catch {}
    };
  }, [user?.userId]);

  useEffect(() => {
    if (!user?.userId) return;

    let cancelled = false;
    let warmupInteractionTask: { cancel?: () => void } | null = null;

    const scheduleWarm = (force = false) => {
      warmupInteractionTask?.cancel?.();
      warmupInteractionTask = InteractionManager.runAfterInteractions(() => {
        if (cancelled) return;
        const { appWarmupService } = require('./services/appWarmup.service');
        void appWarmupService.warm(user.userId, force ? { force: true } : undefined);
      });
    };

    scheduleWarm(true);

    const appStateSub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        scheduleWarm(false);
      }
    });

    return () => {
      cancelled = true;
      try {
        warmupInteractionTask?.cancel?.();
      } catch {}
      try {
        appStateSub.remove();
      } catch {}
    };
  }, [user?.userId]);

  useEffect(() => {
    const SHAKE_REPORT_ENABLED = false;
    if (!SHAKE_REPORT_ENABLED || !user?.userId) return;
    let sensorSubscription: { unsubscribe: () => void } | null = null;
    const appStateRef = { current: AppState.currentState };
    const startedAt = Date.now();
    let sampleCount = 0;

    const appStateSub = AppState.addEventListener('change', (nextState) => {
      appStateRef.current = nextState;
    });

    try {
      const sensorsModule = require('react-native-sensors');
      const accelerometer = sensorsModule?.accelerometer;
      const sensorTypes = sensorsModule?.SensorTypes;
      const setUpdateIntervalForType = sensorsModule?.setUpdateIntervalForType;

      if (!accelerometer?.subscribe || !sensorTypes || typeof setUpdateIntervalForType !== 'function') {
        return;
      }

      setUpdateIntervalForType(sensorTypes.accelerometer, 48);

      const STARTUP_GRACE_MS = 14000;
      const GRAVITY_FILTER = 0.86;
      const SHAKE_THRESHOLD = 2.85;
      const PEAK_WINDOW_MS = 720;
      const REQUIRED_PEAKS = 4;
      const COOLDOWN_MS = 12000;
      const MIN_SAMPLES = 30;
      const MIN_PEAK_GAP_MS = 120;
      const REQUIRED_SHAKE_SCORE = 12.4;

      let gravityX = 0;
      let gravityY = 0;
      let gravityZ = 0;
      let peakCount = 0;
      let peakWindowStart = 0;
      let lastTriggerAt = 0;

      let lastPeakAt = 0;
      let shakeScore = 0;
      sensorSubscription = accelerometer.subscribe({
        next: ({ x, y, z }: { x: number; y: number; z: number }) => {
          const now = Date.now();
          if (appStateRef.current !== 'active') return;
          if (now - startedAt < STARTUP_GRACE_MS) return;

          sampleCount += 1;
          if (sampleCount < MIN_SAMPLES) return;

          gravityX = GRAVITY_FILTER * gravityX + (1 - GRAVITY_FILTER) * x;
          gravityY = GRAVITY_FILTER * gravityY + (1 - GRAVITY_FILTER) * y;
          gravityZ = GRAVITY_FILTER * gravityZ + (1 - GRAVITY_FILTER) * z;

          const linearX = x - gravityX;
          const linearY = y - gravityY;
          const linearZ = z - gravityZ;

          const magnitude = Math.sqrt((linearX * linearX) + (linearY * linearY) + (linearZ * linearZ));
          if (magnitude < SHAKE_THRESHOLD) {
            return;
          }


          if (lastPeakAt > 0 && now - lastPeakAt < MIN_PEAK_GAP_MS) {
            return;
          }

          if (now - lastTriggerAt < COOLDOWN_MS) {
            return;
          }

          if (peakWindowStart === 0 || now - peakWindowStart > PEAK_WINDOW_MS) {
            peakWindowStart = now;
            peakCount = 1;
            shakeScore = magnitude;
            lastPeakAt = now;
            return;
          }

          peakCount += 1;
          shakeScore += magnitude;
          lastPeakAt = now;
          if (peakCount < REQUIRED_PEAKS || shakeScore < REQUIRED_SHAKE_SCORE) {
            return;
          }

          peakCount = 0;
          peakWindowStart = 0;
          shakeScore = 0;
          lastTriggerAt = now;

          const nav = navigationRef.current;
          if (!nav?.isReady?.()) return;

          const currentRouteName = nav.getCurrentRoute?.()?.name || '';
          if (
            currentRouteName === 'ReportProblem' ||
            currentRouteName === 'Login' ||
            currentRouteName === 'Signup' ||
            currentRouteName === 'Welcome' ||
            currentRouteName === 'Onboarding' ||
            currentRouteName === 'Notifications'
          ) {
            return;
          }

          (nav as any).navigate('ReportProblem', { source: 'shake' });
        },
      });
    } catch (error) {
      console.warn('[ShakeReport] Sensor not available:', error);
    }

    return () => {
      try {
        sensorSubscription?.unsubscribe?.();
      } catch {}
      try {
        appStateSub?.remove?.();
      } catch {}
    };
  }, [user?.userId]);

  if (loading && !initialAuthResolvedRef.current) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#05070A' }}>
        <View style={{ alignItems: 'center' }}>
          <View style={{ width: 120, height: 120, borderRadius: 40, backgroundColor: 'rgba(77,208,225,0.08)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(77,208,225,0.18)' }}>
            <Image source={require('../public/Iris-logo-splesh-screen.png')} style={{ width: 84, height: 84 }} contentFit="contain" />
          </View>
          <Text style={{ color: '#F4FDFF', fontSize: 28, fontWeight: '700', marginTop: 18, letterSpacing: 0.5 }}>Iris</Text>
          <Text style={{ color: 'rgba(244,253,255,0.58)', fontSize: 13, marginTop: 6 }}>Preparing your space</Text>
          <View style={{ width: 140, marginTop: 18 }}>
            <LoadingSkeleton height={10} borderRadius={999} />
            <LoadingSkeleton width="72%" height={10} borderRadius={999} style={{ marginTop: 10, alignSelf: 'center' }} />
          </View>
        </View>
      </View>
    );
  }

  return (
    <Stack.Navigator id={undefined}
      screenOptions={{
        headerShown: false,
        animation: 'fade',
      }}
    >
      {!user ? (
        <Stack.Screen name="Auth" component={AuthStack} />
      ) : (
        <>
          <Stack.Screen name="Main" component={MainTabs} />
          {/* Messaging */}
          <Stack.Screen name="Messages" getComponent={getMessagesScreenEnhanced} options={{ animation: 'none' }} />
          <Stack.Screen name="Chat" getComponent={getChatScreenEnhanced} options={{ animation: 'none' }} />
          <Stack.Screen name="NewMessage" getComponent={getNewMessageScreen} />
          <Stack.Screen name="ChatDetails" getComponent={getChatDetailsScreen} />
          <Stack.Screen name="ChatMessageSearch" getComponent={getChatMessageSearchScreen} />
          <Stack.Screen name="ChatPrivacySafety" getComponent={getChatPrivacySafetyScreen} />
          <Stack.Screen name="ChatProfile" getComponent={getChatProfileScreen} />
          <Stack.Screen name="NewChat" getComponent={getNewChatScreen} />
          <Stack.Screen name="NewGroup" getComponent={getNewGroupScreen} />
          <Stack.Screen name="GroupInfo" getComponent={getGroupInfoScreen} />
          <Stack.Screen name="GroupChatSettings" getComponent={getGroupChatSettingsScreen} />
          <Stack.Screen name="Search" component={SearchRedirectScreen} />
          {/* Content */}
          <Stack.Screen name="PostView" getComponent={getPostViewScreen} />
          <Stack.Screen name="Comments" getComponent={getCommentsScreen} />
          <Stack.Screen name="LikesList" getComponent={getLikesListScreenEnhanced} />
          <Stack.Screen name="Report" getComponent={getReportScreen} />
          <Stack.Screen name="MutualFollowers" getComponent={getMutualFollowersScreen} />
          <Stack.Screen
            name="SharePost"
            getComponent={getSharePostScreen}
            options={{
              presentation: 'transparentModal',
              animation: 'none',
              contentStyle: { backgroundColor: 'transparent' },
            }}
          />
          <Stack.Screen name="StoryViewer" getComponent={getStoryViewerScreenEnhanced} />
          <Stack.Screen name="StoryViewerEnhanced" getComponent={getStoryViewerScreenEnhanced} />
          <Stack.Screen
            name="CreatePost"
            getComponent={getNewPostScreenEnhanced}
            options={{
              presentation: 'fullScreenModal',
              gestureEnabled: true,
            }}
          />
          <Stack.Screen
            name="StoryCreate"
            getComponent={getStoryCreateScreen}
            options={{
              presentation: 'fullScreenModal',
              gestureEnabled: false,
              headerShown: false,
            }}
          />
          <Stack.Screen
            name="StoryEditor"
            getComponent={getStoryCreateScreen}
            options={{
              presentation: 'fullScreenModal',
              gestureEnabled: false,
              headerShown: false,
            }}
          />
          <Stack.Screen name="GlimpseViewer" getComponent={getGlimpseViewerScreen} />
          <Stack.Screen name="GlimpseCreate" getComponent={getGlimpseCreateScreen} />
          <Stack.Screen name="Highlights" getComponent={getHighlightsScreen} />
          {/* Legacy route aliases to avoid dead navigation targets */}
          <Stack.Screen name="HighlightViewer" getComponent={getHighlightsScreen} />
          <Stack.Screen name="ViewersList" getComponent={getViewersListScreen} />
          {/* Profile */}
          <Stack.Screen name="UserProfile" getComponent={getProfileScreenEnhanced} />
          <Stack.Screen name="EditProfile" getComponent={getEditProfileScreen} />
          <Stack.Screen name="FollowersList" getComponent={getFollowersListScreen} />
          <Stack.Screen name="Following" getComponent={getFollowingScreen} />
          <Stack.Screen name="TaggedPosts" getComponent={getTaggedPostsScreen} />
          <Stack.Screen name="Mentions" getComponent={getMentionsScreen} />
          {/* Profile Editors */}
          <Stack.Screen name="AvatarEditor" getComponent={getAvatarEditorScreen} />
          <Stack.Screen name="BioEditor" getComponent={getBioEditorScreen} />
          <Stack.Screen name="NameEditor" getComponent={getNameEditorScreen} />
          <Stack.Screen name="WebsiteEditor" getComponent={getWebsiteEditorScreen} />
          <Stack.Screen name="LocationEditor" getComponent={getLocationEditorScreen} />
          {/* Content Management */}
          <Stack.Screen name="SavedPosts" getComponent={getSavedPostsScreen} />
          <Stack.Screen name="Archive" getComponent={getArchiveScreen} />
          <Stack.Screen name="LikedPosts" getComponent={getLikedPostsScreen} />
          <Stack.Screen name="Collections" getComponent={getCollectionsScreen} />
          <Stack.Screen name="CollectionDetail" getComponent={getCollectionDetailScreen} />
          <Stack.Screen name="Bookmarks" getComponent={getBookmarksScreen} />
          <Stack.Screen name="Drafts" getComponent={getDraftsScreen} />
          {/* Discovery */}
          <Stack.Screen name="Discovery" getComponent={getDiscoveryScreen} />
          <Stack.Screen name="Explore" getComponent={getExploreScreen} />
          <Stack.Screen name="Trending" getComponent={getTrendingScreen} />
          <Stack.Screen name="Hashtag" getComponent={getHashtagScreen} />
          <Stack.Screen name="HashtagFeed" getComponent={getHashtagScreen} />
          <Stack.Screen name="Location" getComponent={getLocationScreen} />
          <Stack.Screen name="Suggestions" getComponent={getSuggestionsScreenEnhanced} />
          <Stack.Screen name="RecentSearches" getComponent={getRecentSearchesScreen} />
          <Stack.Screen name="ActiveUsers" getComponent={getActiveUsersScreen} />
          {/* Notifications */}
          <Stack.Screen name="Notifications" getComponent={getNotificationsScreenEnhanced} />
          {/* Diagnostics (Dev) */}
          <Stack.Screen name="Diagnostics" getComponent={getBackendDiagnosticsScreen} />
          {/* Settings */}
          <Stack.Screen name="Settings" getComponent={getSettingsScreenEnhanced} />
          <Stack.Screen name="PrivacySettings" getComponent={getPrivacySettingsScreen} />
          <Stack.Screen name="NotificationSettings" getComponent={getNotificationSettingsScreen} />
          <Stack.Screen name="AccountSettings" getComponent={getAccountSettingsScreen} />
          <Stack.Screen name="SecuritySettings" getComponent={getSecuritySettingsScreen} />
          <Stack.Screen name="AppearanceSettings" getComponent={getAppearanceSettingsScreen} />
          <Stack.Screen name="LanguageSettings" getComponent={getLanguageSettingsScreen} />
          <Stack.Screen name="DataUsage" getComponent={getDataUsageScreen} />
          <Stack.Screen name="Accessibility" getComponent={getAccessibilityScreen} />
          <Stack.Screen name="SoundSettings" getComponent={getSoundSettingsScreen} />
          <Stack.Screen name="AutoPlaySettings" getComponent={getAutoPlaySettingsScreen} />
          <Stack.Screen name="CaptionsSettings" getComponent={getCaptionsSettingsScreen} />

          {/* Account & Security */}
          <Stack.Screen name="TwoFactorAuth" getComponent={getTwoFactorAuthScreen} />
          <Stack.Screen name="ChangePassword" getComponent={getChangePasswordScreen} />
          <Stack.Screen name="DeactivateAccount" getComponent={getDeactivateAccountScreen} />
          <Stack.Screen name="DeleteAccount" getComponent={getDeleteAccountScreen} />
          <Stack.Screen name="EmailPhone" getComponent={getEmailPhoneScreen} />
          <Stack.Screen name="LoginActivity" getComponent={getLoginActivityScreen} />
          <Stack.Screen name="AccountActivity" getComponent={getAccountActivityScreen} />
          <Stack.Screen name="SavedLogin" getComponent={getSavedLoginScreen} />
          <Stack.Screen name="AppsWebsites" getComponent={getAppsWebsitesScreen} />
          <Stack.Screen name="BackupCodes" getComponent={getBackupCodesScreen} />

          {/* Privacy Controls */}
          <Stack.Screen name="BlockedUsers" getComponent={getBlockedUsersScreen} />
          <Stack.Screen name="CloseFriends" getComponent={getCloseFriendsScreen} />
          <Stack.Screen name="RestrictedAccounts" getComponent={getRestrictedAccountsScreen} />
          <Stack.Screen name="FollowRequests" getComponent={getFollowRequestsScreen} />
          <Stack.Screen name="MessagePrivacy" getComponent={getMessagePrivacyScreen} />
          <Stack.Screen name="TagPrivacy" getComponent={getTagPrivacyScreen} />
          <Stack.Screen name="HideStory" getComponent={getHideStoryScreen} />
          <Stack.Screen name="MentionSettings" getComponent={getMentionSettingsScreen} />

          {/* Moderation */}
          <Stack.Screen name="ReportContent" getComponent={getReportContentScreen} />
          <Stack.Screen name="ReportProblem" getComponent={getReportProblemScreen} />
          <Stack.Screen name="BlockConfirm" getComponent={getBlockConfirmScreen} />
          <Stack.Screen name="MuteConfirm" getComponent={getMuteConfirmScreen} />

          {/* Analytics */}
          <Stack.Screen name="Analytics" getComponent={getAnalyticsScreen} />
          <Stack.Screen name="Insights" getComponent={getInsightsScreen} />
          <Stack.Screen name="ActivityLog" getComponent={getActivityLogScreen} />
          <Stack.Screen name="StorageUsage" getComponent={getStorageUsageScreen} />

          {/* Media Tools */}
          <Stack.Screen name="MediaPicker" getComponent={getMediaPickerScreen} />
          <Stack.Screen name="CaptionEditor" getComponent={getCaptionEditorScreen} />
          <Stack.Screen name="Filters" getComponent={getFiltersScreen} />
          <Stack.Screen name="Crop" getComponent={getCropScreen} />

          {/* Social Features */}
          <Stack.Screen name="QRCode" getComponent={getQRCodeScreen} />
          <Stack.Screen name="ScanQR" getComponent={getScanQRScreen} />
          <Stack.Screen name="PollCreate" getComponent={getPollCreateScreen} />
          <Stack.Screen name="LiveStream" getComponent={getLiveStreamScreen} />
          <Stack.Screen name="Badges" getComponent={getBadgesScreen} />
          <Stack.Screen name="Achievements" getComponent={getAchievementsScreen} />
          <Stack.Screen name="Leaderboard" getComponent={getLeaderboardScreen} />

          {/* Preferences */}
          <Stack.Screen name="Interests" getComponent={getInterestsScreen} />
          <Stack.Screen name="Theme" getComponent={getThemeScreen} />
          <Stack.Screen name="FontSize" getComponent={getFontSizeScreen} />
          <Stack.Screen name="RequestVerification" getComponent={getRequestVerificationScreen} />
          <Stack.Screen name="CacheManagement" getComponent={getCacheManagementScreen} />
          <Stack.Screen name="DownloadData" getComponent={getDownloadDataScreen} />

          {/* Support & Info */}
          <Stack.Screen name="HelpCenter" getComponent={getHelpCenterScreen} />
          <Stack.Screen name="About" getComponent={getAboutScreen} />
          <Stack.Screen name="Terms" getComponent={getTermsScreen} />
          <Stack.Screen name="PrivacyPolicy" getComponent={getPrivacyPolicyScreen} />
          <Stack.Screen name="Guidelines" getComponent={getGuidelinesScreen} />
          <Stack.Screen name="FAQ" getComponent={getFAQScreen} />
          <Stack.Screen name="ContactSupport" getComponent={getContactSupportScreen} />
        </>
      )}
    </Stack.Navigator>
  );
}

function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1, backgroundColor: '#000000' }}>
        <AuthProvider>
          <ThemeProvider>
            <StoryProcessingProvider>
              <UploadProvider>
                <ToastProvider>
                  <ThemedNavigationShell>
                    <ErrorBoundary>
                      <StoryProcessingBar />
                      <AppNavigator />
                    </ErrorBoundary>
                  </ThemedNavigationShell>
                </ToastProvider>
              </UploadProvider>
            </StoryProcessingProvider>
          </ThemeProvider>
        </AuthProvider>
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

export default App;
