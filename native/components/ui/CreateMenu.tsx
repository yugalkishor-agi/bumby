import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Animated, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { toast } from '../../contexts/ToastContext';

interface CreateMenuProps {
  visible: boolean;
  onClose: () => void;
}

type CreateOption = {
  id: string;
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  route: string;
};

const CREATE_OPTIONS: CreateOption[] = [
  {
    id: 'post',
    title: 'Post',
    subtitle: 'Photos & videos',
    icon: 'images-outline',
    color: '#5EA1FF',
    route: 'CreatePost',
  },
  {
    id: 'glimpse',
    title: 'Glimpse',
    subtitle: 'Short video',
    icon: 'film-outline',
    color: '#FF7A59',
    route: 'GlimpseCreate',
  },
  {
    id: 'story',
    title: 'Story',
    subtitle: '24-hour update',
    icon: 'radio-button-on-outline',
    color: '#5DD39E',
    route: 'StoryEditor',
  },
  {
    id: 'live',
    title: 'Live',
    subtitle: 'Coming soon',
    icon: 'videocam-outline',
    color: '#C084FC',
    route: 'LiveStream',
  },
];

export function CreateMenu({ visible, onClose }: CreateMenuProps) {
  const navigation = useNavigation();
  const sheetTranslateY = useRef(new Animated.Value(420)).current;
  const sheetOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(sheetTranslateY, {
          toValue: 0,
          tension: 80,
          friction: 11,
          useNativeDriver: true,
        }),
        Animated.timing(sheetOpacity, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(sheetTranslateY, {
          toValue: 420,
          duration: 160,
          useNativeDriver: true,
        }),
        Animated.timing(sheetOpacity, {
          toValue: 0,
          duration: 120,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, sheetTranslateY, sheetOpacity]);

  const handleOptionPress = (option: CreateOption) => {
    onClose();
    setTimeout(() => {
      if (option.id === 'live') {
        Alert.alert('Coming soon', 'Live streaming will be available in an upcoming update.');
        return;
      }
      try {
        (navigation as any).navigate(option.route);
      } catch (error) {
        console.error('Create navigation failed:', error);
        toast.error('Unable to open creator');
      }
    }, 120);
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="none" onRequestClose={onClose}>
      <Animated.View
        style={[
          styles.sheet,
          {
            opacity: sheetOpacity,
            transform: [{ translateY: sheetTranslateY }],
          },
        ]}
      >
        <View style={styles.headerRow}>
          <View style={styles.titleGroup}>
            <View style={styles.titleMark}>
              <Ionicons name="add" size={20} color="#07111F" />
            </View>
            <Text style={styles.title}>Create</Text>
          </View>
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close create menu"
          >
            <Ionicons name="close" size={18} color="#F8FAFC" />
          </TouchableOpacity>
        </View>

        <View style={styles.content}>
          <View style={styles.optionsWrap}>
            {CREATE_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option.id}
                style={[styles.optionCard, { borderColor: `${option.color}35` }]}
                activeOpacity={0.88}
                onPress={() => handleOptionPress(option)}
                accessibilityRole="button"
                accessibilityLabel={`${option.title}, ${option.subtitle}`}
              >
                <View style={styles.optionCardTop}>
                  <View style={[styles.optionIcon, { backgroundColor: `${option.color}20` }]}>
                    <Ionicons name={option.icon} size={21} color={option.color} />
                  </View>
                  <View style={[styles.optionArrow, { backgroundColor: `${option.color}16` }]}>
                    <Ionicons name="arrow-forward" size={14} color={option.color} />
                  </View>
                </View>
                <Text style={styles.optionTitle}>{option.title}</Text>
                <Text style={styles.optionSubtitle}>{option.subtitle}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.footerRow}>
            <TouchableOpacity
              style={styles.secondaryAction}
              onPress={() => {
                onClose();
                setTimeout(() => {
                  try {
                    (navigation as any).navigate('Drafts');
                  } catch (error) {
                    console.error('Draft navigation failed:', error);
                    toast.error('Unable to open drafts');
                  }
                }, 120);
              }}
            >
              <Ionicons name="document-text-outline" size={16} color="#CBD5E1" />
              <Text style={styles.secondaryActionText}>Drafts</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    flex: 1,
    backgroundColor: '#050B18',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 24,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 28,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingBottom: 42,
  },
  titleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  titleMark: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: '#7DD3FC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#101A2A',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  optionCard: {
    width: '47%',
    minHeight: 152,
    borderRadius: 22,
    padding: 16,
    backgroundColor: '#0B1423',
    borderWidth: 1,
    justifyContent: 'space-between',
  },
  optionCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  optionIcon: {
    width: 46,
    height: 46,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionArrow: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  optionSubtitle: {
    fontSize: 12,
    color: '#94A3B8',
  },
  footerRow: {
    marginTop: 16,
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  secondaryAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(148,163,184,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.12)',
  },
  secondaryActionText: {
    color: '#E2E8F0',
    fontSize: 13,
    fontWeight: '700',
  },
});
