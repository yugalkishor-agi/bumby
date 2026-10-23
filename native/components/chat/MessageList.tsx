import React, { useRef, useCallback, memo } from 'react';
import type { ChatMessage } from '../../types/chat';
import { FlatListProps, ViewToken } from 'react-native';
import { FlashList, FlashListProps } from '@shopify/flash-list';
import type { ListRenderItem } from '@shopify/flash-list';

type MessageListProps = {
  data: ChatMessage[];
  extraData?: any;
  renderBubble: ListRenderItem<ChatMessage>;
  onVisibleChange?: (ids: Set<string>) => void;
  flatListRef: React.RefObject<any>;
  onLoadMore?: () => void;
  onScroll?: FlashListProps<ChatMessage>['onScroll'];
  onContentSizeChange?: FlashListProps<ChatMessage>['onContentSizeChange'];
  maintainVisibleContentPosition?: FlashListProps<ChatMessage>['maintainVisibleContentPosition'];
  onScrollBeginDrag?: FlashListProps<ChatMessage>['onScrollBeginDrag'];
  onScrollEndDrag?: FlashListProps<ChatMessage>['onScrollEndDrag'];
  onMomentumScrollBegin?: FlashListProps<ChatMessage>['onMomentumScrollBegin'];
  onMomentumScrollEnd?: FlashListProps<ChatMessage>['onMomentumScrollEnd'];
  ListHeaderComponent?: FlashListProps<ChatMessage>['ListHeaderComponent'];
  initialScrollIndex?: number;
};

const MessageList: React.FC<MessageListProps> = ({
  data,
  extraData,
  renderBubble,
  onVisibleChange,
  flatListRef,
  onLoadMore,
  onScroll,
  onContentSizeChange,
  maintainVisibleContentPosition,
  onScrollBeginDrag,
  onScrollEndDrag,
  onMomentumScrollBegin,
  onMomentumScrollEnd,
  ListHeaderComponent,
  initialScrollIndex,
}) => {
  const shouldTrackViewability = Boolean(onVisibleChange || onLoadMore);

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken<ChatMessage>[] }) => {
    if (!shouldTrackViewability) return;

    if (onVisibleChange) {
      const ids = new Set(
        viewableItems
          .map((vi) => vi.item?.messageId)
          .filter((messageId): messageId is string => Boolean(messageId))
      );
      onVisibleChange(ids);
    }

    if (onLoadMore && viewableItems.some((vi) => vi.index === 0)) {
      onLoadMore();
    }
  });

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 40 });
  const keyExtractor = useCallback((item: ChatMessage) => item.messageId ?? String(item.createdAt), []);

  return (
    <FlashList
      ref={flatListRef}
      data={data}
      extraData={extraData}
      renderItem={renderBubble}
      keyExtractor={keyExtractor}
      initialScrollIndex={initialScrollIndex}
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14 } as any}
      estimatedItemSize={100}
      maintainVisibleContentPosition={maintainVisibleContentPosition}
      onViewableItemsChanged={shouldTrackViewability ? onViewableItemsChanged.current : undefined}
      viewabilityConfig={shouldTrackViewability ? (viewabilityConfig.current as FlatListProps<ChatMessage>['viewabilityConfig']) : undefined}
      onScroll={onScroll}
      onScrollBeginDrag={onScrollBeginDrag}
      onScrollEndDrag={onScrollEndDrag}
      onMomentumScrollBegin={onMomentumScrollBegin}
      onMomentumScrollEnd={onMomentumScrollEnd}
      onContentSizeChange={onContentSizeChange}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      scrollEventThrottle={32}
      drawDistance={900}
      ListHeaderComponent={ListHeaderComponent}
    />
  );
};

export default memo(MessageList);



