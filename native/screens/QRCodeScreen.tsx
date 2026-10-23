import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Share } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';

export default function QRCodeScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();

  const handleShare = async () => {
    try {
      await Share.share({
        message: `Follow me on Bumby: @${user?.username}`,
      });
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={28} color="#000" />
        </TouchableOpacity>
        <Text style={styles.title}>QR Code</Text>
        <TouchableOpacity onPress={handleShare}>
          <Ionicons name="share-outline" size={24} color="#000" />
        </TouchableOpacity>
      </View>
      <View style={styles.content}>
        <View style={styles.qrContainer}>
          <Ionicons name="qr-code" size={200} color="#3b82f6" />
        </View>
        <Text style={styles.username}>@{user?.username}</Text>
        <Text style={styles.description}>
          Scan this code to follow me
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  title: { fontSize: 18, fontWeight: '600' },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  qrContainer: { padding: 24, backgroundColor: '#f9fafb', borderRadius: 16, marginBottom: 24 },
  username: { fontSize: 24, fontWeight: '700', marginBottom: 8 },
  description: { fontSize: 15, color: '#6b7280' },
});
