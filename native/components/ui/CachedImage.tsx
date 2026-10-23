import React, { memo, useEffect, useState } from 'react';

import { imageCacheService } from '../../services/imageCache.service';
import { Image, ImageProps } from 'expo-image';
import { useDataSaverEnabled } from '../../hooks/useDataSaver';

type CachedImageProps = Omit<ImageProps, 'source'> & {
  uri: string;
};

function CachedImageComponent({ uri, ...props }: CachedImageProps) {
  const dataSaverEnabled = useDataSaverEnabled();
  const [resolvedUri, setResolvedUri] = useState(() => imageCacheService.peekCachedUri(uri) || uri);

  useEffect(() => {
    let active = true;
    const initialUri = imageCacheService.peekCachedUri(uri) || uri;
    setResolvedUri(initialUri);

    if (!uri) {
      return () => undefined;
    }

    // Data Saver skips the background download - the image is only fetched
    // when it actually scrolls into view.
    if (dataSaverEnabled) {
      return () => {
        active = false;
      };
    }

    imageCacheService.getCachedUri(uri, { background: true }).then((localUri) => {
      if (active && localUri) {
        setResolvedUri(localUri);
      }
    });

    return () => {
      active = false;
    };
  }, [uri, dataSaverEnabled]);

  return (
    <Image
      {...props}
      source={{ uri: resolvedUri }}
      // Data Saver keeps media in memory only and lets the loader deprioritise
      // it, so images are not written to disk or fetched ahead of time.
      cachePolicy={dataSaverEnabled ? 'memory' : props.cachePolicy}
      priority={dataSaverEnabled ? 'low' : props.priority}
    />
  );
}

export const CachedImage = memo(CachedImageComponent);
