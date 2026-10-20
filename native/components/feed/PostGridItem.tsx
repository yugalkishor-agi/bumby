import React from 'react';
import {
  View,
  TouchableOpacity,
  Text,
  StyleSheet,
  Dimensions} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { colors, spacing, borderRadius } from '../../styles/theme';
import { Image } from 'expo-image';

const { width } = Dimensions.get('window');
const imageSize = (width - spacing.md * 4) / 3;

interface PostGridItemProps {
  item: any;
  onPress?: () => void;
}

export function PostGridItem({ item, onPress }: PostGridItemProps) {
  const navigation = useNavigation();
  
  const handlePress = () => {
    if (onPress) {
      onPress();
      return;
    }
    
    const isGlimpse = item.isGlimpse || item.glimpseId || item.postType === 'glimpse';
    const itemId = item.postId || item.storyId || item.glimpseId;
    
    if (isGlimpse) {
      (navigation as any).navigate('GlimpseViewer', { glimpseId: itemId });
    } else {
      (navigation as any).navigate('PostView', { postId: itemId });
    }
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      style={styles.gridItem}
      activeOpacity={0.8}
    >
      <Image
        source={{ uri: item.thumbnailURL || item.mediaURLs?.[0] || item.mediaURL }}
        style={styles.gridImage}
        contentFit="cover"
      />
      
      {/* Video indicator */}
      {item.mediaType === 'video' && (
        <View style={styles.videoBadge}>
          <Ionicons name="play" size={16} color="#fff" />
        </View>
      )}
      
      {/* Carousel indicator */}
      {item.postType === 'carousel' && (
        <View style={styles.carouselBadge}>
          <Ionicons name="copy-outline" size={16} color="#fff" />
        </View>
      )}
      
      {/* Glimpse indicator */}
      {(item.isGlimpse || item.glimpseId || item.postType === 'glimpse') && (
        <View style={styles.glimpseBadge}>
          <Ionicons name="film" size={16} color="#fff" />
        </View>
      )}
      
      {/* Stats overlay */}
      {(item.stats?.likesCount > 0 || item.likesCount > 0) && (
        <View style={styles.statsOverlay}>
          <View style={styles.statItem}>
            <Ionicons name="heart" size={14} color="#fff" />
            <Text style={styles.statText}>
              {item.stats?.likesCount || item.likesCount || 0}
            </Text>
          </View>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  gridItem: {
    width: imageSize,
    height: imageSize,
    margin: 1,
    position: 'relative',
    borderRadius: borderRadius.sm,
    overflow: 'hidden',
  },
  gridImage: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.background.secondary,
  },
  videoBadge: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: borderRadius.sm,
    padding: spacing.xs,
  },
  carouselBadge: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: borderRadius.sm,
    padding: spacing.xs,
  },
  glimpseBadge: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    backgroundColor: 'rgba(138, 43, 226, 0.8)',
    borderRadius: borderRadius.sm,
    padding: spacing.xs,
  },
  statsOverlay: {
    position: 'absolute',
    bottom: spacing.sm,
    left: spacing.sm,
    right: spacing.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  statText: {
    color: '#fff',
    fontSize: 12,
    marginLeft: 2,
    fontWeight: '500',
  },
});

