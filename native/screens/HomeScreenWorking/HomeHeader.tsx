import React, { useCallback } from 'react';
import { View, Text, TouchableOpacity, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { styles } from './styles';

interface HomeHeaderProps {
  unreadNotifications: number;
  unreadMessages: number;
  messageWiggle: Animated.Value;
}

export const HomeHeader = React.memo(({
  unreadNotifications,
  unreadMessages,
  messageWiggle
}: HomeHeaderProps) => {
  const navigation = useNavigation();

  const navigateToSuggestions = useCallback(() => {
    (navigation as any).navigate('Suggestions');
  }, [navigation]);

  const navigateToNotifications = useCallback(() => {
    (navigation as any).navigate('Notifications');
  }, [navigation]);

  const navigateToMessages = useCallback(() => {
    (navigation as any).navigate('Messages');
  }, [navigation]);

  return (
    <View style={styles.header}>
      <View style={styles.headerSide} />
      <Text style={styles.headerTitle}>Bumby</Text>
      <View style={[styles.headerSide, styles.headerRight]}>
        <TouchableOpacity
          style={styles.headerButton}
          onPress={navigateToSuggestions}
        >
          <Ionicons name="people-outline" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.headerButton}
          onPress={navigateToNotifications}
        >
          <View style={styles.notificationIconContainer}>
            <Ionicons
              name="heart-outline"
              size={24}
              color={unreadNotifications > 0 ? "#ef4444" : "#FFFFFF"}
            />
            {unreadNotifications > 0 && (
              <View style={styles.notificationBadge}>
                <Text style={styles.notificationBadgeText}>
                  {unreadNotifications > 9 ? '9+' : unreadNotifications}
                </Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.headerButton}
          onPress={navigateToMessages}
        >
          <Animated.View
            style={{
              transform: [
                {
                  translateX: messageWiggle.interpolate({
                    inputRange: [-1, 0, 1],
                    outputRange: [-3, 0, 3]
                  })
                },
                {
                  rotate: messageWiggle.interpolate({
                    inputRange: [-1, 0, 1],
                    outputRange: ["-10deg", "0deg", "10deg"]
                  })
                }
              ]
            }}
          >
            <Ionicons
              name="paper-plane-outline"
              size={24}
              color={unreadMessages > 0 ? "#ef4444" : "#FFFFFF"}
            />
          </Animated.View>
        </TouchableOpacity>
      </View>
    </View>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.unreadNotifications === nextProps.unreadNotifications &&
    prevProps.unreadMessages === nextProps.unreadMessages &&
    prevProps.messageWiggle === nextProps.messageWiggle
  );
});
