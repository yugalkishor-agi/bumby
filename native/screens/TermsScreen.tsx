import React from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { createStaticContentScreen } from '../templates/StaticContentTemplate';

const styles = StyleSheet.create({
  heading: {
    fontSize: 24,
    fontWeight: '700',
    color: '#000',
    marginBottom: 8,
  },
  date: {
    fontSize: 14,
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

const TermsScreenComponent = createStaticContentScreen({
  title: 'Terms of Service',
  content: (
    <View>
      <Text style={styles.heading}>Terms of Service</Text>
      <Text style={styles.date}>Last updated: January 2024</Text>
      
      <Text style={styles.section}>1. Acceptance of Terms</Text>
      <Text style={styles.paragraph}>
        By accessing and using Bumby, you accept and agree to be bound by the terms and provision of this agreement.
      </Text>

      <Text style={styles.section}>2. Use License</Text>
      <Text style={styles.paragraph}>
        Permission is granted to temporarily download one copy of Bumby for personal, non-commercial transitory viewing only.
      </Text>

      <Text style={styles.section}>3. User Content</Text>
      <Text style={styles.paragraph}>
        You retain all rights to the content you post on Bumby. By posting content, you grant us a worldwide, non-exclusive, royalty-free license to use, copy, reproduce, process, adapt, modify, publish, transmit, display and distribute such content.
      </Text>

      <Text style={styles.section}>4. Prohibited Uses</Text>
      <Text style={styles.paragraph}>
        You may not use Bumby to:{'\n'}
        • Violate any laws or regulations{'\n'}
        • Infringe on intellectual property rights{'\n'}
        • Transmit harmful or malicious code{'\n'}
        • Harass, abuse, or harm another person
      </Text>

      <Text style={styles.section}>5. Account Termination</Text>
      <Text style={styles.paragraph}>
        We reserve the right to terminate or suspend your account at our sole discretion, without notice, for conduct that we believe violates these Terms of Service.
      </Text>

      <Text style={styles.section}>6. Disclaimer</Text>
      <Text style={styles.paragraph}>
        The service is provided "as is" without warranties of any kind, either express or implied.
      </Text>

      <Text style={styles.section}>7. Contact</Text>
      <Text style={styles.paragraph}>
        For questions about these Terms, please contact us at support@bumby.app
      </Text>
    </View>
  ),
});

export default TermsScreenComponent;
