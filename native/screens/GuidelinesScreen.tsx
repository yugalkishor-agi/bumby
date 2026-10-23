import React from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { createStaticContentScreen } from '../templates/StaticContentTemplate';

const styles = StyleSheet.create({
  heading: {
    fontSize: 24,
    fontWeight: '700',
    color: '#000',
    marginBottom: 12,
  },
  intro: {
    fontSize: 15,
    lineHeight: 24,
    color: '#6b7280',
    marginBottom: 24,
  },
  section: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
    marginTop: 24,
    marginBottom: 12,
  },
  paragraph: {
    fontSize: 15,
    lineHeight: 24,
    color: '#374151',
  },
});

const GuidelinesScreenComponent = createStaticContentScreen({
  title: 'Community Guidelines',
  content: (
    <View>
      <Text style={styles.heading}>Community Guidelines</Text>
      <Text style={styles.intro}>
        Welcome to Bumby! Our community guidelines help keep our platform safe and welcoming for everyone.
      </Text>

      <Text style={styles.section}>Be Respectful</Text>
      <Text style={styles.paragraph}>
        • Treat others with kindness and respect{'\n'}
        • No harassment, bullying, or hate speech{'\n'}
        • Respect different opinions and perspectives
      </Text>

      <Text style={styles.section}>Share Responsibly</Text>
      <Text style={styles.paragraph}>
        • Post only content you have rights to share{'\n'}
        • No spam or misleading information{'\n'}
        • Use appropriate content warnings
      </Text>

      <Text style={styles.section}>Stay Safe</Text>
      <Text style={styles.paragraph}>
        • Protect your personal information{'\n'}
        • Report suspicious activity{'\n'}
        • Don't share content that endangers others
      </Text>

      <Text style={styles.section}>Prohibited Content</Text>
      <Text style={styles.paragraph}>
        The following is not allowed on Bumby:{'\n'}
        • Illegal content or activities{'\n'}
        • Violence, gore, or self-harm{'\n'}
        • Sexual exploitation{'\n'}
        • Hate speech or discrimination{'\n'}
        • Impersonation or fraud
      </Text>

      <Text style={styles.section}>Consequences</Text>
      <Text style={styles.paragraph}>
        Violations may result in:{'\n'}
        • Content removal{'\n'}
        • Account restrictions{'\n'}
        • Permanent account suspension
      </Text>

      <Text style={styles.section}>Reporting</Text>
      <Text style={styles.paragraph}>
        If you see content that violates these guidelines, please report it using the report button. We review all reports promptly.
      </Text>
    </View>
  ),
});

export default GuidelinesScreenComponent;
