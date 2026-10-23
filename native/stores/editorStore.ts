import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

// Element Types
export type ElementType = 'text' | 'drawing' | 'sticker' | 'gifSticker' | 'widget';
export type Tool = 'none' | 'text' | 'draw' | 'sticker' | 'filter' | 'widget';
export type BrushType = 'pen' | 'marker' | 'neon' | 'pencil' | 'eraser';
export type WidgetType = 'poll' | 'quiz' | 'slider' | 'question' | 'countdown' | 'mention' | 'hashtag';

// Base Element
export interface BaseElement {
  id: string;
  type: ElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  scale: number;
  zIndex: number;
  opacity: number;
  locked: boolean;
}

// Text Element
export interface TextElement extends BaseElement {
  type: 'text';
  text: string;
  fontSize: number;
  fontFamily: string;
  color: string;
  backgroundColor?: string;
  textAlign: 'left' | 'center' | 'right';
  fontWeight: 'normal' | 'bold';
  textShadow?: {
    color: string;
    offsetX: number;
    offsetY: number;
    blur: number;
  };
}

// Drawing Element
export interface DrawingElement extends BaseElement {
  type: 'drawing';
  paths: string; // SVG path string
  brushType: BrushType;
  brushSize: number;
  brushColor: string;
  points: number[]; // Flat array of x, y coordinates
}

// Sticker Element
export interface StickerElement extends BaseElement {
  type: 'sticker';
  emoji: string;
  fontSize: number;
}

// GIF Sticker Element
export interface GifStickerElement extends BaseElement {
  type: 'gifSticker';
  gifUrl: string;
  thumbnailUrl: string;
  aspectRatio: number;
}

// Widget Element
export interface WidgetElement extends BaseElement {
  type: 'widget';
  widgetType: WidgetType;
  config: WidgetConfig;
}

export interface WidgetConfig {
  theme?: 'neon' | 'pastel' | 'dark' | 'minimal';
  text?: string;
  options?: string[];
  correctIndex?: number;
  placeholder?: string;
  emojis?: string[];
  max?: number;
}

export type EditorElement = TextElement | DrawingElement | StickerElement | GifStickerElement | WidgetElement;

// Filter State
export interface FilterState {
  brightness: number; // -1 to 1
  contrast: number;   // 0 to 2
  saturation: number; // 0 to 2
  blur: number;       // 0 to 10
  temperature: number; // -1 to 1
}

// History State
export interface HistoryState {
  timestamp: number;
  elements: EditorElement[];
  filters: FilterState;
}

// Editor Store
interface EditorStore {
  // Canvas
  backgroundImage: string | null;
  imageWidth: number;
  imageHeight: number;
  canvasWidth: number;
  canvasHeight: number;
  
  // Elements
  elements: EditorElement[];
  selectedIds: string[];
  
  // Tools
  activeTool: Tool;
  
  // Filters
  filters: FilterState;
  
  // History
  history: HistoryState[];
  historyIndex: number;
  maxHistory: number;
  
  // Drawing state (temporary)
  isDrawing: boolean;
  currentDrawingPoints: number[];
  brushColor: string;
  brushSize: number;
  brushType: BrushType;
  
  // Text state (temporary)
  textColor: string;
  textSize: number;
  textFont: string;
  
  // Actions
  setBackgroundImage: (uri: string, width: number, height: number) => void;
  addElement: (element: EditorElement) => void;
  updateElement: (id: string, updates: Partial<EditorElement>) => void;
  deleteElement: (id: string) => void;
  deleteSelected: () => void;
  selectElement: (id: string, multi?: boolean) => void;
  deselectAll: () => void;
  setActiveTool: (tool: Tool) => void;
  setFilter: (filter: keyof FilterState, value: number) => void;
  resetFilters: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  saveHistory: () => void;
  reset: () => void;
  
  // Drawing actions
  startDrawing: (x: number, y: number) => void;
  continueDrawing: (x: number, y: number) => void;
  endDrawing: () => void;
  setBrushColor: (color: string) => void;
  setBrushSize: (size: number) => void;
  setBrushType: (type: BrushType) => void;
  
  // Text actions
  setTextColor: (color: string) => void;
  setTextSize: (size: number) => void;
  setTextFont: (font: string) => void;
  
  // Utility
  bringToFront: (id: string) => void;
  sendToBack: (id: string) => void;
  duplicateElement: (id: string) => void;
}

const initialFilterState: FilterState = {
  brightness: 0,
  contrast: 1,
  saturation: 1,
  blur: 0,
  temperature: 0,
};

export const useEditorStore = create<EditorStore>()(
  immer((set, get) => ({
    // Initial state
    backgroundImage: null,
    imageWidth: 1080,
    imageHeight: 1920,
    canvasWidth: 1080,
    canvasHeight: 1920,
    elements: [],
    selectedIds: [],
    activeTool: 'none',
    filters: { ...initialFilterState },
    history: [],
    historyIndex: -1,
    maxHistory: 50,
    isDrawing: false,
    currentDrawingPoints: [],
    brushColor: '#FFFFFF',
    brushSize: 15,
    brushType: 'pen',
    textColor: '#FFFFFF',
    textSize: 70,
    textFont: 'System',
    
    // Actions
    setBackgroundImage: (uri, width, height) => set((state) => {
      state.backgroundImage = uri;
      state.imageWidth = width;
      state.imageHeight = height;
    }),
    
    addElement: (element) => set((state) => {
      state.elements.push(element);
      get().saveHistory();
    }),
    
    updateElement: (id, updates) => set((state) => {
      const element = state.elements.find(el => el.id === id);
      if (element) {
        Object.assign(element, updates);
      }
    }),
    
    deleteElement: (id) => set((state) => {
      state.elements = state.elements.filter(el => el.id !== id);
      state.selectedIds = state.selectedIds.filter(sid => sid !== id);
      get().saveHistory();
    }),
    
    deleteSelected: () => set((state) => {
      const selectedIds = state.selectedIds;
      state.elements = state.elements.filter(el => !selectedIds.includes(el.id));
      state.selectedIds = [];
      get().saveHistory();
    }),
    
    selectElement: (id, multi = false) => set((state) => {
      if (multi) {
        if (state.selectedIds.includes(id)) {
          state.selectedIds = state.selectedIds.filter(sid => sid !== id);
        } else {
          state.selectedIds.push(id);
        }
      } else {
        state.selectedIds = [id];
      }
    }),
    
    deselectAll: () => set((state) => {
      state.selectedIds = [];
    }),
    
    setActiveTool: (tool) => set((state) => {
      state.activeTool = tool;
      if (tool !== 'none') {
        state.selectedIds = [];
      }
    }),
    
    setFilter: (filter, value) => set((state) => {
      state.filters[filter] = value;
    }),
    
    resetFilters: () => set((state) => {
      state.filters = { ...initialFilterState };
    }),
    
    saveHistory: () => set((state) => {
      const currentState: HistoryState = {
        timestamp: Date.now(),
        elements: JSON.parse(JSON.stringify(state.elements)),
        filters: { ...state.filters },
      };
      
      // Remove any future history if we're not at the end
      if (state.historyIndex < state.history.length - 1) {
        state.history = state.history.slice(0, state.historyIndex + 1);
      }
      
      state.history.push(currentState);
      
      // Limit history size
      if (state.history.length > state.maxHistory) {
        state.history = state.history.slice(-state.maxHistory);
      }
      
      state.historyIndex = state.history.length - 1;
    }),
    
    undo: () => set((state) => {
      if (state.historyIndex > 0) {
        state.historyIndex--;
        const previousState = state.history[state.historyIndex];
        state.elements = JSON.parse(JSON.stringify(previousState.elements));
        state.filters = { ...previousState.filters };
      }
    }),
    
    redo: () => set((state) => {
      if (state.historyIndex < state.history.length - 1) {
        state.historyIndex++;
        const nextState = state.history[state.historyIndex];
        state.elements = JSON.parse(JSON.stringify(nextState.elements));
        state.filters = { ...nextState.filters };
      }
    }),
    
    canUndo: () => get().historyIndex > 0,
    canRedo: () => get().historyIndex < get().history.length - 1,
    
    // Drawing actions
    startDrawing: (x, y) => set((state) => {
      state.isDrawing = true;
      state.currentDrawingPoints = [x, y];
    }),
    
    continueDrawing: (x, y) => set((state) => {
      if (state.isDrawing) {
        state.currentDrawingPoints.push(x, y);
      }
    }),
    
    endDrawing: () => set((state) => {
      if (state.isDrawing && state.currentDrawingPoints.length > 2) {
        const newDrawing: DrawingElement = {
          id: `drawing-${Date.now()}`,
          type: 'drawing',
          x: 0,
          y: 0,
          width: state.canvasWidth,
          height: state.canvasHeight,
          rotation: 0,
          scale: 1,
          zIndex: state.elements.length,
          opacity: 1,
          locked: false,
          paths: '', // Will be computed from points
          brushType: state.brushType,
          brushSize: state.brushSize,
          brushColor: state.brushColor,
          points: [...state.currentDrawingPoints],
        };
        state.elements.push(newDrawing);
        get().saveHistory();
      }
      state.isDrawing = false;
      state.currentDrawingPoints = [];
    }),
    
    setBrushColor: (color) => set((state) => {
      state.brushColor = color;
    }),
    
    setBrushSize: (size) => set((state) => {
      state.brushSize = size;
    }),
    
    setBrushType: (type) => set((state) => {
      state.brushType = type;
    }),
    
    // Text actions
    setTextColor: (color) => set((state) => {
      state.textColor = color;
    }),
    
    setTextSize: (size) => set((state) => {
      state.textSize = size;
    }),
    
    setTextFont: (font) => set((state) => {
      state.textFont = font;
    }),
    
    // Utility
    bringToFront: (id) => set((state) => {
      const element = state.elements.find(el => el.id === id);
      if (element) {
        const maxZ = Math.max(...state.elements.map(el => el.zIndex), 0);
        element.zIndex = maxZ + 1;
      }
    }),
    
    sendToBack: (id) => set((state) => {
      const element = state.elements.find(el => el.id === id);
      if (element) {
        const minZ = Math.min(...state.elements.map(el => el.zIndex), 0);
        element.zIndex = minZ - 1;
      }
    }),
    
    duplicateElement: (id) => set((state) => {
      const element = state.elements.find(el => el.id === id);
      if (element) {
        const duplicate = {
          ...JSON.parse(JSON.stringify(element)),
          id: `${element.type}-${Date.now()}`,
          x: element.x + 20,
          y: element.y + 20,
          zIndex: state.elements.length,
        };
        state.elements.push(duplicate);
        get().saveHistory();
      }
    }),
    
    reset: () => set((state) => {
      state.backgroundImage = null;
      state.elements = [];
      state.selectedIds = [];
      state.activeTool = 'none';
      state.filters = { ...initialFilterState };
      state.history = [];
      state.historyIndex = -1;
      state.isDrawing = false;
      state.currentDrawingPoints = [];
    }),
  }))
);

// Helper to safely access store state outside React components
export const getEditorState = () => {
  try {
    return useEditorStore.getState();
  } catch {
    // Fallback if getState is not available
    return {
      elements: [],
      filters: { brightness: 0, contrast: 1, saturation: 1, blur: 0, temperature: 0 },
      backgroundImage: null,
      imageWidth: 1080,
      imageHeight: 1920,
      canvasWidth: 1080,
      canvasHeight: 1920,
      selectedIds: [],
      activeTool: 'none' as Tool,
      textColor: '#FFFFFF',
      textSize: 70,
      textFont: 'System',
      brushColor: '#FFFFFF',
      brushSize: 15,
      brushType: 'pen' as BrushType,
    };
  }
};
