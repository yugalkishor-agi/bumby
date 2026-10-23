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

const PrivacyPolicyScreenComponent = createStaticContentScreen({
  title: 'Privacy Policy',
  content: (
    <View>
      <Text style={styles.heading}>Privacy Policy</Text>
      <Text style={styles.date}>Last updated: January 2024</Text>
      
      <Text style={styles.section}>1. Information We Collect</Text>
      <Text style={styles.paragraph}>
        We collect information you provide directly to us, including:{'\n'}
        • Account information (name, email, username){'\n'}
        • Profile information{'\n'}
        • Content you post{'\n'}
        • Communications with other users
      </Text>

      <Text style={styles.section}>2. How We Use Your Information</Text>
      <Text style={styles.paragraph}>
        We use the information we collect to:{'\n'}
        • Provide and improve our services{'\n'}
        • Personalize your experience{'\n'}
        • Communicate with you{'\n'}
        • Ensure safety and security
      </Text>

      <Text style={styles.section}>3. Information Sharing</Text>
      <Text style={styles.paragraph}>
        We do not sell your personal information. We may share information:{'\n'}
        • With your consent{'\n'}
        • To comply with legal obligations{'\n'}
        • To protect rights and safety
      </Text>

      <Text style={styles.section}>4. Data Storage</Text>
      <Text style={styles.paragraph}>
        Your data is stored securely using Firebase and Supabase services with encryption at rest and in transit.
      </Text>

      <Text style={styles.section}>5. Your Rights</Text>
      <Text style={styles.paragraph}>
        You have the right to:{'\n'}
        • Access your personal data{'\n'}
        • Correct inaccurate data{'\n'}
        • Delete your account and data{'\n'}
        • Export your data
      </Text>

      <Text style={styles.section}>6. Cookies and Tracking</Text>
      <Text style={styles.paragraph}>
        We use cookies and similar technologies to improve your experience and analyze usage patterns.
      </Text>

      <Text style={styles.section}>7. Children's Privacy</Text>
      <Text style={styles.paragraph}>
        Our service is not intended for users under 13 years of age. We do not knowingly collect information from children under 13.
      </Text>

      <Text style={styles.section}>8. Contact Us</Text>
      <Text style={styles.paragraph}>
        For privacy concerns, contact us at privacy@bumby.app
      </Text>
    </View>
  ),
});

export default PrivacyPolicyScreenComponent;
