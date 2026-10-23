import { View, Text, StyleSheet, TouchableOpacity, Dimensions } from "react-native";
import { Image } from 'expo-image';

const { width } = Dimensions.get('window');

export default function WelcomeScreen({ navigation }: any) {
  return (
    <View style={styles.container}>
      <View style={styles.logoSection}>
        <Image
          source={require('../../assets/Images/bumbylogo.png')}
          style={styles.logo}
          contentFit="contain"
        />
        <Text style={styles.tagline}>
          Share your glimpses with the world
        </Text>
      </View>

      <View style={styles.authSection}>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => navigation.navigate('Signup')}
        >
          <Text style={styles.primaryButtonText}>Create new account</Text>
        </TouchableOpacity>

        <View style={styles.loginSection}>
          <Text style={styles.loginText}>Already have an account? </Text>
          <TouchableOpacity onPress={() => navigation.navigate('Login')}>
            <Text style={styles.loginLink}>Log in</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.divider} />

        <View style={styles.termsSection}>
          <Text style={styles.termsText}>
            By continuing, you agree to our{' '}
            <Text style={styles.link}>Terms</Text> and{' '}
            <Text style={styles.link}>Privacy Policy</Text>
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
  },
  logoSection: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  logo: {
    width: 140,
    height: 140,
    backgroundColor: '#000000',
    borderRadius: 24,
    padding: 16,
  },
  tagline: {
    color: '#999',
    fontSize: 15,
    textAlign: 'center',
    marginTop: 32,
    fontWeight: '400',
  },
  authSection: {
    paddingHorizontal: 24,
    paddingBottom: 48,
  },
  primaryButton: {
    backgroundColor: '#4DD0E1',
    height: 48,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  primaryButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '600',
  },
  loginSection: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 8,
  },
  loginText: {
    color: '#888',
    fontSize: 14,
  },
  loginLink: {
    color: '#4DD0E1',
    fontSize: 14,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    backgroundColor: '#1a1a1a',
    marginVertical: 16,
  },
  termsSection: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  termsText: {
    color: '#888',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
  link: {
    color: '#4DD0E1',
  },
});
