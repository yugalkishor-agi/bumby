import React, { useCallback, useState, useMemo } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../contexts/AuthContext';

import { useSearchState } from '../hooks/search/useSearchState';
import { useRecentSearches } from '../hooks/search/useRecentSearches';
import { useSearchQuery } from '../hooks/search/useSearchQuery';
import { useExploreContent } from '../hooks/search/useExploreContent';
import { SearchCreatorGlimpse } from '../hooks/search/searchTypes';

import { SearchHeader } from '../components/search/SearchHeader';
import { SearchRecentOverlay } from '../components/search/SearchRecentOverlay';
import { SearchResultsList } from '../components/search/SearchResultsList';
import { ExploreSection } from '../components/search/ExploreSection';
import { SearchPreviewModal } from '../components/search/SearchPreviewModal';

import { colors, spacing } from '../styles/theme';

type RootStackParamList = {
  Profile: { userId?: string };
  PostDetail: { postId: string };
  HashtagFeed: { hashtag: string };
  Glimpse: { glimpseId: string; authorId?: string };
};
type SearchScreenNavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function SearchScreenEnhanced() {
  const navigation = useNavigation<SearchScreenNavigationProp>();
  const { user } = useAuth();

  const {
    query,
    setQuery,
    isReady,
    loading,
    setLoading,
    refreshing,
    setRefreshing,
    isSearchFocused,
    setIsSearchFocused,
  } = useSearchState();

  const [searchTab, setSearchTab] = useState<'top' | 'users' | 'tags' | 'posts'>('top');
  const [previewItem, setPreviewItem] = useState<SearchCreatorGlimpse | null>(null);

  // A long-press preview must never outlive the screen. If the user navigates
  // away (or the gesture is cancelled) while it is open, a transparent Modal
  // would keep swallowing every touch in the app.
  useFocusEffect(
    useCallback(() => {
      return () => setPreviewItem(null);
    }, [])
  );

  const {
    recentSearches,
    setRecentSearches,
    recentSearchesKey,
    persistRecentSearch,
    clearAllRecentSearches,
    removeRecentSearch,
  } = useRecentSearches(user?.userId);

  const { userResults, tagResults, postResults } = useSearchQuery(user?.userId, query, persistRecentSearch);

  const {
    trendingTags,
    discoverColumns,
    loadFresh,
  } = useExploreContent(user?.userId, recentSearchesKey, setRecentSearches, setLoading, setRefreshing, isReady);

  const showSearchResults = query.trim().length > 0;
  const showRecentSearchOverlay = isSearchFocused && query.trim().length === 0;

  const searchData = useMemo(() => {
    if (!showSearchResults) return [];
    if (searchTab === 'users') return userResults.map((u) => ({ ...u, __kind: 'user' }));
    if (searchTab === 'tags') return tagResults.map((t) => ({ ...t, __kind: 'tag' }));
    if (searchTab === 'posts') return postResults.map((p) => ({ ...p, __kind: 'post' }));

    const out: any[] = [];
    if (userResults.length > 0) out.push({ ...userResults[0], __kind: 'user' });
    if (userResults.length > 1) out.push({ ...userResults[1], __kind: 'user' });
    if (tagResults.length > 0) out.push({ ...tagResults[0], __kind: 'tag' });
    if (tagResults.length > 1) out.push({ ...tagResults[1], __kind: 'tag' });
    postResults.slice(0, 10).forEach((p) => out.push({ ...p, __kind: 'post' }));
    return out;
  }, [showSearchResults, searchTab, userResults, tagResults, postResults]);

  const inlineRecentSearches = useMemo(() => {
    if (!showSearchResults) return [];
    return recentSearches.slice(0, 4);
  }, [showSearchResults, recentSearches]);

  if (!isReady || (loading && !refreshing && !query && recentSearches.length === 0)) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color="#4B82F2" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <SearchHeader query={query} setQuery={setQuery} setIsSearchFocused={setIsSearchFocused} />

      {showSearchResults ? (
        <View style={styles.tabsHeader}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabRow as any}>
            {['Top', 'Users', 'Tags', 'Posts'].map((label) => {
              const id = label.toLowerCase() as typeof searchTab;
              return (
                <TouchableOpacity
                  key={id}
                  activeOpacity={0.8}
                  style={[styles.tabChip, searchTab === id && styles.tabChipActive]}
                  onPress={() => setSearchTab(id)}
                >
                  <Text style={[styles.tabChipText, searchTab === id && styles.tabChipTextActive]}>{label}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      ) : null}

      {showSearchResults ? (
        <SearchResultsList
          searchData={searchData}
          inlineRecentSearches={inlineRecentSearches}
          setQuery={setQuery}
          openUser={(u) => navigation.navigate('Profile', { userId: u.userId })}
          openHashtag={(h) => navigation.navigate('HashtagFeed', { hashtag: h })}
          openPost={(p) => navigation.navigate('PostDetail', { postId: p.postId })}
        />
      ) : showRecentSearchOverlay ? (
        <SearchRecentOverlay
          recentSearches={recentSearches}
          setQuery={setQuery}
          clearAllRecentSearches={clearAllRecentSearches}
          removeRecentSearch={removeRecentSearch}
        />
      ) : (
        <ExploreSection
          trendingTags={trendingTags}
          discoverColumns={discoverColumns}
          setQuery={setQuery}
          openGlimpse={(glimpse) => navigation.navigate('Glimpse', { glimpseId: glimpse.glimpseId, authorId: glimpse.authorId })}
          beginPreview={setPreviewItem}
          endPreview={() => setPreviewItem(null)}
          refreshing={refreshing}
          loadFresh={loadFresh}
        />
      )}

      <SearchPreviewModal previewItem={previewItem} onDismiss={() => setPreviewItem(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabsHeader: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    backgroundColor: colors.background.primary,
  },
  tabRow: {
    paddingTop: 10,
    paddingBottom: 4,
    gap: 10,
  },
  tabChip: {
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 18,
    backgroundColor: '#0A0C10',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  tabChipActive: {
    backgroundColor: '#4B82F2',
    borderColor: 'rgba(113,177,255,0.6)',
  },
  tabChipText: {
    color: 'rgba(255,255,255,0.74)',
    fontSize: 15,
    fontWeight: '700',
  },
  tabChipTextActive: {
    color: '#07111F',
  },
});
