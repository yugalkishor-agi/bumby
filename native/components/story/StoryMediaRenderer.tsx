/**
 * Story Media Renderer - A wrapper that uses WebView-based rendering for consistent
 * story overlay display matching the editor's Konva coordinate system.
 * 
 * This ensures that text, stickers, widgets, and drawings appear EXACTLY as they
 * were placed in the story editor.
 */

import React, { useMemo } from 'react';
import { View, StyleSheet, Dimensions, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import { Video, ResizeMode } from 'expo-av';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Editor uses 375x667 stage
const STAGE_W = 375;
const STAGE_H = 667;

interface StoryMediaRendererProps {
  mediaURL: string;
  mediaType: 'image' | 'video';
  storyData: {
    textElements?: any[];
    stickers?: any[];
    drawings?: any[];
    filters?: { brightness?: number; contrast?: number; saturation?: number };
    audioOverlay?: { uri: string; name?: string; volume?: number; start?: number; end?: number };
    mediaWidth?: number;
    mediaHeight?: number;
    positionSpace?: 'media' | 'screen';
    trimStart?: number;
    trimEnd?: number;
    thumbnailURL?: string;
  };
  onLoad?: () => void;
  onError?: () => void;
  isPaused?: boolean;
  onVideoProgress?: (progress: number) => void;
  onVideoEnd?: () => void;
}

/**
 * Renders story media with overlays using WebView for consistent coordinate system
 */
export function StoryMediaRenderer({
  mediaURL,
  mediaType,
  storyData,
  onLoad,
  onError,
  isPaused = false,
  onVideoProgress,
  onVideoEnd,
}: StoryMediaRendererProps) {
  // Build HTML for WebView-based rendering
  const html = useMemo(() => {
    const escapedURL = (mediaURL || '').replace(/'/g, "\\'").replace(/"/g, '\\"');
    const textElements = JSON.stringify(storyData.textElements || []);
    const stickers = JSON.stringify(storyData.stickers || []);
    const drawings = JSON.stringify(storyData.drawings || []);
    const filters = JSON.stringify(storyData.filters || {});
    const audioOverlay = JSON.stringify(storyData.audioOverlay || null);

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { 
      width: 100vw; 
      height: 100vh; 
      height: 100dvh;
      overflow: hidden; 
      background: #000; 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    #container {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
    }
    #stage {
      position: relative;
      width: ${STAGE_W}px;
      height: ${STAGE_H}px;
      transform-origin: center center;
    }
    #media {
      position: absolute;
      left: 0;
      top: 0;
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
    #overlays {
      position: absolute;
      left: 0;
      top: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
    }
    .overlay {
      position: absolute;
      pointer-events: none;
    }
    .text-el {
      display: flex;
      align-items: center;
      justify-content: center;
      text-shadow: 2px 2px 4px rgba(0,0,0,0.8);
      white-space: pre-wrap;
      word-wrap: break-word;
    }
    .sticker {
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .emoji-sticker { font-size: 48px; }
    .label-sticker {
      background: rgba(0,0,0,0.7);
      color: #fff;
      padding: 8px 16px;
      border-radius: 12px;
      font-weight: 600;
      font-size: 14px;
    }
    .location-badge, .mention-badge, .hashtag-badge {
      background: rgba(255,255,255,0.92);
      color: #111;
      padding: 8px 14px;
      border-radius: 999px;
      font-weight: 600;
      font-size: 13px;
    }
    .widget-box {
      background: rgba(0,0,0,0.75);
      border-radius: 16px;
      padding: 12px;
      min-width: 180px;
      backdrop-filter: blur(8px);
      border: 1px solid rgba(255,255,255,0.15);
    }
    .widget-title {
      color: #fff;
      font-weight: 700;
      font-size: 14px;
      margin-bottom: 8px;
      text-align: center;
    }
    .poll-option {
      background: rgba(255,255,255,0.15);
      color: #fff;
      padding: 10px 14px;
      border-radius: 10px;
      font-weight: 600;
      text-align: center;
      margin-top: 6px;
    }
    .slider-track {
      height: 8px;
      background: rgba(255,255,255,0.2);
      border-radius: 4px;
      overflow: hidden;
    }
    .slider-fill {
      height: 100%;
      background: linear-gradient(90deg, #ec4899, #8b5cf6);
      width: 50%;
    }
    .slider-emoji {
      font-size: 28px;
      text-align: center;
      margin-top: 8px;
    }
    .question-input {
      background: rgba(255,255,255,0.1);
      border: 1px solid rgba(255,255,255,0.2);
      border-radius: 10px;
      padding: 10px 12px;
      color: rgba(255,255,255,0.6);
      font-size: 13px;
    }
    .time-widget {
      background: rgba(0,0,0,0.6);
      color: #fff;
      padding: 8px 16px;
      border-radius: 12px;
      font-weight: 700;
      font-size: 18px;
    }
    .filter-overlay {
      position: absolute;
      left: 0; top: 0; right: 0; bottom: 0;
      pointer-events: none;
    }
  </style>
</head>
<body>
  <div id="container">
    <div id="stage">
      ${mediaType === 'video' ?
        `<video id="media" src="${escapedURL}" autoplay loop muted playsinline></video>` :
        `<img id="media" src="${escapedURL}" />`
      }
      <div class="filter-overlay" id="filterOverlay"></div>
      <div id="overlays"></div>
    </div>
  </div>
  
  <script>
    (function() {
      var STAGE_W = ${STAGE_W};
      var STAGE_H = ${STAGE_H};
      var textElements = ${textElements};
      var stickers = ${stickers};
      var drawings = ${drawings};
      var filters = ${filters};
      var audioOverlay = ${audioOverlay};
      
      function scaleStage() {
        var stage = document.getElementById('stage');
        var cw = window.innerWidth || ${SCREEN_WIDTH};
        var ch = window.innerHeight || ${SCREEN_HEIGHT};
        var scale = Math.min(cw / STAGE_W, ch / STAGE_H);
        stage.style.transform = 'scale(' + scale + ')';
      }
      
      function applyFilters() {
        var media = document.getElementById('media');
        var overlay = document.getElementById('filterOverlay');
        var parts = [];
        if (typeof filters.contrast === 'number' && filters.contrast !== 0) {
          parts.push('contrast(' + Math.max(0,Math.min(2, 1 + filters.contrast/100)) + ')');
        }
        if (typeof filters.saturation === 'number' && filters.saturation !== 1) {
          parts.push('saturate(' + Math.max(0,Math.min(3, filters.saturation)) + ')');
        }
        if (parts.length) media.style.filter = parts.join(' ');
        
        if (typeof filters.brightness === 'number' && filters.brightness !== 0) {
          var b = filters.brightness;
          overlay.style.backgroundColor = b > 0 ? '#fff' : '#000';
          overlay.style.opacity = Math.min(0.35, Math.abs(b) * 0.35);
        }
      }
      
      // Editor saves x,y as CENTER position in PIXELS (375x667 stage)
      // For normalized values (0-1), convert to pixels
      function getPixelPos(val, ref) {
        if (val <= 1 && val >= 0) return val * ref; // normalized
        return val; // already pixels
      }
      
      function renderText() {
        var c = document.getElementById('overlays');
        textElements.forEach(function(el) {
          var d = document.createElement('div');
          d.className = 'overlay text-el';
          
          // Data from normalizeEditorExport is NORMALIZED (0-1), convert to pixels!
          var rawX = el.x;
          var rawY = el.y;
          var x = getPixelPos(rawX != null ? rawX : 0.5, STAGE_W);
          var y = getPixelPos(rawY != null ? rawY : 0.5, STAGE_H);
          var rot = el.rotation || 0;
          var scX = el.scaleX || el.scale || 1;
          var scY = el.scaleY || el.scale || 1;
          var fontSize = el.fontSize || 24;
          
          // Position using transform translate to center the text at x,y
          d.style.cssText = 'left:' + x + 'px;top:' + y + 'px;' +
            'transform:translate(-50%,-50%) rotate(' + rot + 'deg) scale(' + scX + ',' + scY + ');' +
            'color:' + (el.color || el.fill || '#fff') + ';' +
            'font-size:' + fontSize + 'px;' +
            'font-weight:' + (el.fontWeight || 'bold') + ';' +
            'font-family:' + (el.fontFamily || 'sans-serif') + ';' +
            'text-align:' + (el.textAlign || 'center') + ';';
          d.textContent = el.text || '';
          c.appendChild(d);
        });
      }
      
      function renderStickers() {
        var c = document.getElementById('overlays');
        stickers.forEach(function(st) {
          var d = document.createElement('div');
          d.className = 'overlay sticker';
          
          // Data from normalizeEditorExport is NORMALIZED (0-1), convert to pixels!
          var rawX = st.x;
          var rawY = st.y;
          // If x/y are normalized (0-1 range), convert to pixels
          // If they're already pixels (>1), use directly
          var x = getPixelPos(rawX != null ? rawX : 0.5, STAGE_W);
          var y = getPixelPos(rawY != null ? rawY : 0.5, STAGE_H);
          var rot = st.rotation || 0;
          var scX = st.scaleX || st.scale || 1;
          var scY = st.scaleY || st.scale || 1;
          
          // Check if this uses transform structure (fallback)
          if (st.transform && st.transform.x != null) {
            x = getPixelPos(st.transform.x, STAGE_W);
            y = getPixelPos(st.transform.y, STAGE_H);
            rot = st.transform.rotation || rot;
            scX = st.transform.scale || scX;
            scY = st.transform.scale || scY;
          }
          
          // Position using transform translate to center at x,y
          d.style.cssText = 'left:' + x + 'px;top:' + y + 'px;' +
            'transform:translate(-50%,-50%) rotate(' + rot + 'deg) scale(' + scX + ',' + scY + ');';
          
          var content = st.content;
          var kind = st.kind || st.type || '';
          
          // Handle WIDGETS from editor (saved as {kind, data, x, y, ...})
          if (kind === 'ask' || kind === 'question') {
            var askData = st.data || content || {};
            d.innerHTML = '<div class="widget-box"><div class="widget-title">' + (askData.text || 'Ask me anything') + '</div>' +
              '<div class="question-input">' + (askData.placeholder || 'Type answer...') + '</div></div>';
          } else if (kind === 'poll') {
            var pollData = st.data || content || {};
            var opts = (pollData.options || [pollData.optionA || 'Yes', pollData.optionB || 'No']).map(function(o){ 
              return '<div class="poll-option">' + o + '</div>'; 
            }).join('');
            d.innerHTML = '<div class="widget-box"><div class="widget-title">' + (pollData.text || 'Which one?') + '</div>' + opts + '</div>';
          } else if (kind === 'slider') {
            var sliderData = st.data || content || {};
            d.innerHTML = '<div class="widget-box"><div class="widget-title">' + (sliderData.text || 'Rate') + '</div>' +
              '<div class="slider-track"><div class="slider-fill"></div></div>' +
              '<div class="slider-emoji">' + (sliderData.emoji || '😍') + '</div></div>';
          } else if (kind === 'quiz') {
            var quizData = st.data || content || {};
            var qopts = (quizData.options || ['A','B']).map(function(o){ return '<div class="poll-option">' + o + '</div>'; }).join('');
            d.innerHTML = '<div class="widget-box"><div class="widget-title">' + (quizData.text || 'Quiz') + '</div>' + qopts + '</div>';
          } else if (kind === 'mention') {
            var mData = st.data || content || {};
            d.innerHTML = '<span class="mention-badge">@' + (mData.handle || 'user') + '</span>';
          } else if (kind === 'hashtag') {
            var hData = st.data || content || {};
            d.innerHTML = '<span class="hashtag-badge">#' + (hData.tag || 'tag') + '</span>';
          } else if (kind === 'time') {
            var now = new Date();
            var hr = now.getHours() % 12 || 12;
            var min = ('0' + now.getMinutes()).slice(-2);
            var ampm = now.getHours() >= 12 ? 'PM' : 'AM';
            d.innerHTML = '<div class="time-widget">' + hr + ':' + min + ' ' + ampm + '</div>';
          // Legacy sticker types
          } else if (kind === 'emoji') {
            d.innerHTML = '<span class="emoji-sticker">' + (content || st.emoji || '😀') + '</span>';
          } else if (kind === 'label' || (!kind && typeof content === 'string')) {
            d.innerHTML = '<span class="label-sticker">' + (content || '') + '</span>';
          } else if (kind === 'location') {
            d.innerHTML = '<span class="location-badge">📍 ' + (content || st.text || '') + '</span>';
          } else if (kind === 'gif' && content) {
            var url = content.mp4Url || content.url || (typeof content === 'string' ? content : '');
            if (url) d.innerHTML = '<video src="' + url + '" autoplay loop muted playsinline style="width:100%;height:100%;object-fit:contain;"></video>';
          } else if (st.src) {
            // Image sticker (GIF static frame)
            d.innerHTML = '<img src="' + st.src + '" style="max-width:100%;max-height:100%;object-fit:contain;" />';
          }
          
          c.appendChild(d);
        });

        try {
          if (audioOverlay && typeof audioOverlay.uri === 'string' && audioOverlay.uri) {
            var md = document.createElement('div');
            md.className = 'overlay sticker';
            md.style.cssText = 'left:' + (STAGE_W * 0.5) + 'px;top:' + (STAGE_H * 0.14) + 'px;transform:translate(-50%,-50%);';
            var title = (audioOverlay.name || 'Audio Track').toString().replace(/</g, '&lt;').replace(/>/g, '&gt;');
            md.innerHTML = '<div class="widget-box" style="min-width:260px;padding:10px 14px;border-radius:14px;">' +
              '<div style="font-size:13px;font-weight:800;color:#fff;">♫ ' + title + '</div>' +
              '</div>';
            c.appendChild(md);
          }
        } catch (e) {}
      }
      
      function renderDrawings() {
        var c = document.getElementById('overlays');
        drawings.forEach(function(dr) {
          if (dr.svgData) {
            var wrap = document.createElement('div');
            wrap.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;';
            wrap.innerHTML = dr.svgData;
            c.appendChild(wrap);
          } else if (dr.points && dr.points.length >= 4) {
            var svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
            svg.setAttribute('width', STAGE_W);
            svg.setAttribute('height', STAGE_H);
            svg.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;';
            var pathD = 'M ' + dr.points[0] + ' ' + dr.points[1];
            for (var i = 2; i < dr.points.length; i += 2) pathD += ' L ' + dr.points[i] + ' ' + dr.points[i+1];
            var path = document.createElementNS('http://www.w3.org/2000/svg','path');
            path.setAttribute('d', pathD);
            path.setAttribute('stroke', dr.stroke || '#fff');
            path.setAttribute('stroke-width', dr.strokeWidth || 3);
            path.setAttribute('fill', 'none');
            path.setAttribute('stroke-linecap', 'round');
            svg.appendChild(path);
            c.appendChild(svg);
          }
        });
      }
      
      window.addEventListener('load', function() {
        scaleStage();
        applyFilters();
        renderText();
        renderStickers();
        renderDrawings();
        try { window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({event:'loaded'})); } catch(e){}
      });
      window.addEventListener('resize', scaleStage);
      
      var media = document.getElementById('media');
      media.onload = media.onloadeddata = function() {
        try { window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({event:'mediaLoaded'})); } catch(e){}
      };
      media.onerror = function() {
        try { window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({event:'mediaError'})); } catch(e){}
      };
    })();
  </script>
</body>
</html>
`;
  }, [mediaURL, mediaType, storyData, SCREEN_WIDTH, SCREEN_HEIGHT]);

  const handleMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.event === 'loaded' || data.event === 'mediaLoaded') {
        onLoad?.();
      } else if (data.event === 'mediaError') {
        onError?.();
      } else if (data.event === 'videoProgress') {
        onVideoProgress?.(data.progress);
      } else if (data.event === 'videoEnd') {
        onVideoEnd?.();
      }
    } catch { }
  };

  return (
    <View style={styles.container}>
      <WebView
        originWhitelist={['*']}
        allowFileAccess
        allowUniversalAccessFromFileURLs
        source={{ html }}
        style={styles.webview}
        javaScriptEnabled
        domStorageEnabled
        cacheEnabled={false}
        setSupportMultipleWindows={false}
        scrollEnabled={false}
        scalesPageToFit={false}
        bounces={false}
        contentMode="mobile"
        pullToRefreshEnabled={false}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        androidLayerType="hardware"
        forceDarkOn={false}
        onMessage={handleMessage}
        onError={() => onError?.()}
        onHttpError={() => onError?.()}
        onRenderProcessGone={() => onError?.()}
        onContentProcessDidTerminate={() => onError?.()}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        mixedContentMode="always"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  webview: {
    flex: 1,
    backgroundColor: '#000',
  },
});

export default StoryMediaRenderer;
