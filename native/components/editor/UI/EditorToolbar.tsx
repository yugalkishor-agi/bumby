import React from 'react';
import { View, TouchableOpacity, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useAnimatedStyle,
  withSpring,
  interpolate,
} from 'react-native-reanimated';
import { useEditorStore, Tool } from '../../../stores/editorStore';

interface ToolConfig {
  id: Tool;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
}

const TOOLS: ToolConfig[] = [
  { id: 'text', icon: 'text', label: 'Text' },
  { id: 'draw', icon: 'brush', label: 'Draw' },
  { id: 'sticker', icon: 'happy', label: 'Sticker' },
  { id: 'filter', icon: 'color-filter', label: 'Filter' },
  { id: 'widget', icon: 'apps', label: 'Widget' },
];

export function EditorToolbar() {
  const activeTool = useEditorStore(state => state.activeTool);
  const setActiveTool = useEditorStore(state => state.setActiveTool);
  const deleteSelected = useEditorStore(state => state.deleteSelected);
  const selectedIds = useEditorStore(state => state.selectedIds);

  const hasSelection = selectedIds.length > 0;

  const handleToolPress = (toolId: Tool) => {
    if (activeTool === toolId) {
      // Toggle off if already active
      setActiveTool('none');
    } else {
      setActiveTool(toolId);
    }
  };

  return (
    <View style={styles.toolbar}>
      <View style={styles.toolsContainer}>
        {TOOLS.map(tool => (
          <ToolButton
            key={tool.id}
            tool={tool}
            active={activeTool === tool.id}
            onPress={() => handleToolPress(tool.id)}
          />
        ))}
      </View>

      {/* Delete button (shown when elements are selected) */}
      {hasSelection && (
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={deleteSelected}
          activeOpacity={0.8}
        >
          <Ionicons name="trash-outline" size={22} color="#FFFFFF" />
          <Text style={styles.deleteText}>Delete</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

interface ToolButtonProps {
  tool: ToolConfig;
  active: boolean;
  onPress: () => void;
}

function ToolButton({ tool, active, onPress }: ToolButtonProps) {
  const animatedStyle = useAnimatedStyle(() => {
    const scale = withSpring(active ? 1.1 : 1, {
      damping: 15,
      stiffness: 300,
    });

    return {
      transform: [{ scale }],
    };
  });

  return (
    <TouchableOpacity
      style={styles.toolButtonWrapper}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Animated.View
        style={[
          styles.toolButton,
          active && styles.toolButtonActive,
          animatedStyle,
        ]}
      >
        <Ionicons
          name={tool.icon}
          size={24}
          color={active ? '#000000' : '#FFFFFF'}
        />
      </Animated.View>
      <Text style={[styles.toolLabel, active && styles.toolLabelActive]}>
        {tool.label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  toolbar: {
    backgroundColor: '#1A1A1A',
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  toolsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  toolButtonWrapper: {
    alignItems: 'center',
    gap: 6,
  },
  toolButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#2A2A2A',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  toolButtonActive: {
    backgroundColor: '#EC4899',
    borderColor: '#FF69B4',
  },
  toolLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#A0A0A0',
  },
  toolLabelActive: {
    color: '#EC4899',
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: '#FF4444',
    borderRadius: 12,
  },
  deleteText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
});
