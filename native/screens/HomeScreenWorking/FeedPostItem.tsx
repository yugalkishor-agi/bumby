import React, { memo } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { PostCard } from '../../components/feed/PostCard';
import type { Post } from './homeFeedTypes';

interface FeedPostItemProps {
  item: Post;
  onLayout: (event: LayoutChangeEvent, postId: string) => void;
  onLike: (postId: string) => void;
  onSaveChange: (postId: string, saved: boolean) => void;
  onShare: (postId: string, sharedCount: number) => void;
  onHide: (postId: string) => void;
}

const FeedPostItemComponent = ({
  item,
  onLayout,
  onLike,
  onSaveChange,
  onShare,
  onHide,
}: FeedPostItemProps) => {
  return (
    <View onLayout={(event) => onLayout(event, item.postId)}>
      <PostCard
        postId={item.postId}
        user={{
          name: item.username || item.displayName || '',
          avatar: item.avatarURL,
          username: item.username || item.displayName || '',
          isVerified: item.verified,
          userId: item.userId,
        }}
        image={item.mediaURLs[0] || item.thumbnailURL || ''}
        mediaAspectRatio={item.aspectRatio}
        caption={item.content}
        mediaType={item.mediaType}
        location={item.location}
        time={item.createdAt?.toISOString?.() || new Date().toISOString()}
        likes={item.likesCount || 0}
        comments={item.commentsCount || 0}
        taggedUsers={item.taggedUsers}
        collaborators={item.collaborators}
        shares={item.sharesCount || 0}
        likedByPreview={item.likedByPreview}
        latestCommentText={item.latestCommentText}
        latestCommentUser={item.latestCommentUser}
        hideLikesCount={item.hideLikesCount}
        hideSharesCount={item.hideSharesCount}
        commentsEnabled={item.commentsEnabled}
        allowSharing={item.allowSharing}
        audience={item.audience}
        isLiked={item.isLiked}
        isSaved={item.isSaved}
        onLike={onLike}
        onSaveChange={onSaveChange}
        onShare={onShare}
        onHide={onHide}
      />
    </View>
  );
};

export const FeedPostItem = memo(FeedPostItemComponent);
