import { InlineLoadingSkeleton, ButtonLoadingSkeleton } from '../components/ui/LoadingSkeleton';
import { useState, useEffect } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform, Alert } from "react-native";
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from "../contexts/AuthContext";
import { Image } from 'expo-image';

export default function SignupScreen({ navigation }: any) {
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    username: "",
    email: "",
    password: "",
  });
  const [avatarUri, setAvatarUri] = useState<string>("");
  const [usernameValidation, setUsernameValidation] = useState<{ valid: boolean; error?: string }>({ valid: false });
  const [checkingAvailability, setCheckingAvailability] = useState(false);
  const { signUp, loading } = useAuth();

  useEffect(() => {
    if (!formData.username) {
      setUsernameValidation({ valid: false });
      return;
    }

    if (formData.username.length < 3 || formData.username.length > 12) {
      setUsernameValidation({ valid: false, error: 'Username must be 3-12 characters' });
      return;
    }

    if (!/[a-zA-Z]/.test(formData.username)) {
      setUsernameValidation({ valid: false, error: 'Username must contain at least one letter' });
      return;
    }

    const validPattern = /^[a-zA-Z0-9_.]+$/;
    if (!validPattern.test(formData.username)) {
      setUsernameValidation({ valid: false, error: 'Only letters, numbers, _ and . allowed' });
      return;
    }

    if (formData.username.startsWith('_') || formData.username.startsWith('.') || formData.username.endsWith('_') || formData.username.endsWith('.')) {
      setUsernameValidation({ valid: false, error: 'Cannot start/end with special characters' });
      return;
    }

    if (/[_.]{2,}/.test(formData.username)) {
      setUsernameValidation({ valid: false, error: 'Cannot have consecutive special characters' });
      return;
    }

    setUsernameValidation({ valid: true });
  }, [formData.username]);

  const handleSignup = async () => {
    if (!usernameValidation.valid) {
      alert(usernameValidation.error || "Please choose a valid username");
      return;
    }

    setCheckingAvailability(true);
    try {
      await signUp(
        formData.email,
        formData.password,
        formData.username,
        formData.name
      );
      Alert.alert("Account created!", "Welcome to Bumby. Let's get started!");
      // Navigation will happen automatically when auth state updates
    } catch (error: any) {
      Alert.alert("Signup failed", error.message || "Could not create account. Please try again.");
    } finally {
      setCheckingAvailability(false);
    }
  };

  const handleChange = (field: string, value: string) => {
    setFormData({ ...formData, [field]: value });
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled) {
      setAvatarUri(result.assets[0].uri);
    }
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.container}
    >
      <ScrollView 
        contentContainerStyle={styles.scrollContent as any}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <TouchableOpacity 
            onPress={() => navigation.goBack()}
            style={styles.backButton}
          >
            <Ionicons name="chevron-back" size={24} color="#888" />
          </TouchableOpacity>
          <Image
            source={require('../../assets/Images/bumbylogo.png')}
            style={styles.logo}
            contentFit="contain"
          />
          <View style={styles.spacer} />
        </View>

        <View style={styles.content}>
          <View style={styles.titleSection}>
            <Text style={styles.title}>Create Account</Text>
            <Text style={styles.subtitle}>Join Bumby today</Text>
          </View>

          <TouchableOpacity onPress={pickImage} style={styles.avatarContainer}>
            <View style={styles.avatar}>
              {avatarUri ? (
                <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  {formData.name ? (
                    <Text style={styles.avatarText}>{formData.name[0].toUpperCase()}</Text>
                  ) : (
                    <Ionicons name="camera" size={32} color="#666" />
                  )}
                </View>
              )}
              <View style={styles.uploadBadge}>
                <Ionicons name="cloud-upload" size={16} color="#000" />
              </View>
            </View>
          </TouchableOpacity>

          <View style={styles.form}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Full Name</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter your full name"
                placeholderTextColor="#666"
                value={formData.name}
                onChangeText={(text) => handleChange("name", text)}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Username</Text>
              <View style={styles.inputContainerWithIcon}>
                <TextInput
                  style={[
                    styles.input,
                    formData.username && !usernameValidation.valid && styles.inputError,
                    formData.username && usernameValidation.valid && styles.inputSuccess,
                  ]}
                  placeholder="@username"
                  placeholderTextColor="#666"
                  value={formData.username}
                  onChangeText={(text) => handleChange("username", text.toLowerCase())}
                  autoCapitalize="none"
                />
                {formData.username && (
                  <View style={styles.validationIcon}>
                    {usernameValidation.valid ? (
                      <Ionicons name="checkmark-circle" size={20} color="#22c55e" />
                    ) : (
                      <Ionicons name="close-circle" size={20} color="#ef4444" />
                    )}
                  </View>
                )}
              </View>
              {formData.username && !usernameValidation.valid && usernameValidation.error && (
                <Text style={styles.errorText}>{usernameValidation.error}</Text>
              )}
              <Text style={styles.helpText}>
                3-12 characters. Must have letters. Can mix _ and . but not same type only.
              </Text>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter your email"
                placeholderTextColor="#666"
                value={formData.email}
                onChangeText={(text) => handleChange("email", text)}
                autoCapitalize="none"
                keyboardType="email-address"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Password</Text>
              <View style={styles.inputContainer}>
                <TextInput
                  style={[styles.input, styles.passwordInput]}
                  placeholder="Create a strong password"
                  placeholderTextColor="#666"
                  value={formData.password}
                  onChangeText={(text) => handleChange("password", text)}
                  secureTextEntry={!showPassword}
                />
                <TouchableOpacity
                  onPress={() => setShowPassword(!showPassword)}
                  style={styles.eyeIcon}
                >
                  <Ionicons 
                    name={showPassword ? "eye-off-outline" : "eye-outline"} 
                    size={20} 
                    color="#888" 
                  />
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.signupButton, (loading || checkingAvailability) && styles.signupButtonDisabled]}
              onPress={handleSignup}
              disabled={loading || checkingAvailability}
            >
              {checkingAvailability ? (
                <InlineLoadingSkeleton />
              ) : loading ? (
                <InlineLoadingSkeleton />
              ) : (
                <Text style={styles.signupButtonText}>Sign Up</Text>
              )}
            </TouchableOpacity>
          </View>

          <Text style={styles.termsText}>
            By signing up, you agree to our{' '}
            <Text style={styles.link}>Terms of Service</Text> and{' '}
            <Text style={styles.link}>Privacy Policy</Text>
          </Text>

          <View style={styles.loginSection}>
            <Text style={styles.loginText}>Already have an account? </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Login')}>
              <Text style={styles.loginLink}>Login</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  scrollContent: {
    flexGrow: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  backButton: {
    padding: 4,
  },
  logo: {
    width: 120,
    height: 40,
  },
  spacer: {
    width: 32,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  titleSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#888',
  },
  avatarContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    position: 'relative',
  },
  avatarImage: {
    width: 96,
    height: 96,
    borderRadius: 48,
  },
  avatarPlaceholder: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#1a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 32,
    color: '#fff',
    fontWeight: '600',
  },
  uploadBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#0D0D0D',
  },
  form: {
    marginBottom: 24,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#fff',
    marginBottom: 8,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  inputContainerWithIcon: {
    position: 'relative',
  },
  input: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#333',
    height: 48,
    paddingHorizontal: 16,
    color: '#fff',
    fontSize: 16,
  },
  inputError: {
    borderColor: '#ef4444',
  },
  inputSuccess: {
    borderColor: '#22c55e',
  },
  passwordInput: {
    flex: 1,
    paddingRight: 48,
  },
  eyeIcon: {
    position: 'absolute',
    right: 12,
    padding: 8,
  },
  validationIcon: {
    position: 'absolute',
    right: 12,
    top: 14,
  },
  errorText: {
    color: '#ef4444',
    fontSize: 12,
    marginTop: 4,
  },
  helpText: {
    color: '#666',
    fontSize: 12,
    marginTop: 4,
  },
  signupButton: {
    backgroundColor: '#fff',
    height: 52,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  signupButtonDisabled: {
    opacity: 0.5,
  },
  signupButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '600',
  },
  termsText: {
    color: '#666',
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 16,
  },
  link: {
    color: '#fff',
  },
  loginSection: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  loginText: {
    color: '#888',
    fontSize: 14,
  },
  loginLink: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});

