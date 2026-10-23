import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  Dimensions,
  StyleSheet,
  Animated,
  Easing,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';

interface AnchorRect {
  x: number;
  y: number;
  width: number;
  height: number;
  isMe?: boolean;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  onAction: (action: string) => void;
  canDeleteForEveryone?: boolean;
  anchor?: AnchorRect | null;
  stylesRef: any;
}

type ActionItem = { key: string; label: string; icon: string; danger?: boolean };

const MessageActionsSheet: React.FC<Props> = ({
  visible,
  onClose,
  onAction,
  canDeleteForEveryone,
  anchor,
  stylesRef,
}) => {
  const [rendered, setRendered] = useState(visible);

  // Animation values
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const sheetTranslateY = useRef(new Animated.Value(48)).current;
  const sheetOpacity = useRef(new Animated.Value(0)).current;
  const sheetScale = useRef(new Animated.Value(0.96)).current;

  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  const stopAll = useCallback(() => {
    backdropOpacity.stopAnimation();
    sheetTranslateY.stopAnimation();
    sheetOpacity.stopAnimation();
    sheetScale.stopAnimation();
  }, [backdropOpacity, sheetOpacity, sheetScale, sheetTranslateY]);

  const playIn = useCallback(() => {
    stopAll();
    backdropOpacity.setValue(0);
    sheetTranslateY.setValue(28);
    sheetOpacity.setValue(0);
    sheetScale.setValue(0.95);

    Animated.parallel([
      Animated.timing(backdropOpacity, {
        toValue: 1,
        duration: 160,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.spring(sheetTranslateY, {
        toValue: 0,
        speed: 32,
        bounciness: 5,
        useNativeDriver: true,
      }),
      Animated.timing(sheetOpacity, {
        toValue: 1,
        duration: 120,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.spring(sheetScale, {
        toValue: 1,
        speed: 32,
        bounciness: 5,
        useNativeDriver: true,
      }),
    ]).start();
  }, [backdropOpacity, sheetOpacity, sheetScale, sheetTranslateY, stopAll]);

  const dismiss = useCallback((after?: () => void) => {
    stopAll();
    Animated.parallel([
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 140,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(sheetTranslateY, {
        toValue: 20,
        duration: 130,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(sheetOpacity, {
        toValue: 0,
        duration: 120,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(sheetScale, {
        toValue: 0.96,
        duration: 130,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start(() => {
      setRendered(false);
      closeRef.current();
      after?.();
    });
  }, [backdropOpacity, sheetOpacity, sheetScale, sheetTranslateY, stopAll]);

  useEffect(() => {
    if (visible) {
      setRendered(true);
      // Short delay lets the modal mount before animating
      requestAnimationFrame(() => playIn());
    }
  }, [visible, playIn]);

  const triggerHaptic = () => {
    if (Platform.OS === 'web') return;
    Haptics.impactAsync?.(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
  };

  const handleActionPress = (key: string) => {
    triggerHaptic();
    onAction(key);
    dismiss();
  };

  const actions: ActionItem[] = [
    { key: 'reply', label: 'Reply', icon: 'return-up-back-outline' },
    { key: 'forward', label: 'Forward', icon: 'paper-plane-outline' },
    { key: 'copy', label: 'Copy', icon: 'copy-outline' },
    { key: 'delete_me', label: 'Delete for me', icon: 'trash-outline', danger: false },
    ...(canDeleteForEveryone
      ? [{ key: 'delete_all', label: 'Delete for everyone', icon: 'alert-circle-outline', danger: true } as ActionItem]
      : []),
  ];

  if (!rendered) return null;

  const { width } = Dimensions.get('window');

  // Determine popover position based on anchor
  const popoverWidth = Math.min(width - 32, 220);
  let popoverLeft = 16;
  let popoverTop = 100;

  if (anchor) {
    const sheetHeight = 16 + actions.length * 44;
    const preferredLeft = anchor.isMe
      ? anchor.x - popoverWidth - 8
      : anchor.x + anchor.width + 8;
    const centeredTop = anchor.y + anchor.height / 2 - sheetHeight / 2;
    const { height: winHeight } = Dimensions.get('window');

    popoverLeft = Math.min(Math.max(12, preferredLeft), width - popoverWidth - 12);
    popoverTop = Math.min(Math.max(20, centeredTop), winHeight - sheetHeight - 24);
  }

  return (
    <Modal visible={rendered} transparent animationType="none" onRequestClose={() => dismiss()}>
      {/* Backdrop */}
      <Animated.View
        style={[styles.backdrop, { opacity: backdropOpacity }]}
        pointerEvents="box-none"
      >
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={() => dismiss()}
        />
      </Animated.View>

      {/* Action sheet popover */}
      <Animated.View
        style={[
          styles.popoverWrap,
          {
            left: popoverLeft,
            top: popoverTop,
            width: popoverWidth,
            opacity: sheetOpacity,
            transform: [
              { translateY: sheetTranslateY },
              { scale: sheetScale },
            ],
          },
        ]}
        pointerEvents="box-none"
      >
        <BlurView intensity={72} tint="dark" style={styles.popover}>
          {actions.map((action, index) => (
            <TouchableOpacity
              key={action.key}
              style={[
                styles.actionRow,
                index < actions.length - 1 && styles.actionRowBorder,
                action.danger && styles.actionRowDanger,
              ]}
              onPress={() => handleActionPress(action.key)}
              activeOpacity={0.65}
            >
              <View style={[styles.iconWrap, action.danger && styles.iconWrapDanger]}>
                <Ionicons
                  name={action.icon as any}
                  size={16}
                  color={action.danger ? '#f87171' : '#94a3b8'}
                />
              </View>
              <Text style={[styles.actionLabel, action.danger && styles.actionLabelDanger]}>
                {action.label}
              </Text>
            </TouchableOpacity>
          ))}
        </BlurView>
      </Animated.View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.38)',
  },
  popoverWrap: {
    position: 'absolute',
    shadowColor: '#000',
    shadowOpacity: 0.42,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 20,
  },
  popover: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    backgroundColor: 'rgba(7, 12, 24, 0.82)',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 12,
    minHeight: 44,
  },
  actionRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  actionRowDanger: {
    backgroundColor: 'rgba(239, 68, 68, 0.06)',
  },
  iconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(148, 163, 184, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapDanger: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
  },
  actionLabel: {
    color: '#e2e8f0',
    fontSize: 14,
    fontWeight: '500',
    letterSpacing: 0.1,
  },
  actionLabelDanger: {
    color: '#f87171',
  },
});

export default MessageActionsSheet;
