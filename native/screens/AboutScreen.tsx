import React from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { createStaticContentScreen } from '../templates/StaticContentTemplate';

const styles = StyleSheet.create({
  heading: { fontSize: 32, fontWeight: '700', color: '#000', textAlign: 'center', marginBottom: 8 },
  version: { fontSize: 14, color: '#6b7280', textAlign: 'center', marginBottom: 4 },
  tagline: { fontSize: 16, color: '#3b82f6', textAlign: 'center', marginBottom: 32, fontStyle: 'italic' },
  section: { fontSize: 18, fontWeight: '600', color: '#000', marginTop: 24, marginBottom: 12 },
  paragraph: { fontSize: 15, lineHeight: 24, color: '#374151' },
});

export default createStaticContentScreen({
  title: 'About',
  content: (
    <View>
      <Text style={styles.heading}>Bumby</Text>
      <Text style={styles.version}>Version 1.0.0</Text>
      <Text style={styles.tagline}>Share your moments, connect with friends</Text>
      
      <Text style={styles.section}>About Bumby</Text>
      <Text style={styles.paragraph}>
        Bumby is a modern social media platform built for authentic connections and creative expression. 
        Share photos, videos, and stories with your friends and discover new content from around the world.
      </Text>

      <Text style={styles.section}>Built With</Text>
      <Text style={styles.paragraph}>
        • React Native & Expo{'\n'}
        • Firebase & Firestore{'\n'}
        • Supabase Storage{'\n'}
        • TypeScript
      </Text>

      <Text style={styles.section}>Developer</Text>
      <Text style={styles.paragraph}>
        Made with ❤️ by the Bumby Team{'\n'}
        © 2024 Bumby. All rights reserved.
      </Text>
    </View>
  ),
});
