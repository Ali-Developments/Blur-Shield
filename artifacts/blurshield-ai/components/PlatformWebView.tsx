import React, { forwardRef, useImperativeHandle, useRef, useState, useEffect } from 'react';
import { Platform } from 'react-native';
import {
  WebView as RNWebView,
  type WebViewMessageEvent,
  type WebViewProps,
} from 'react-native-webview';
import { toBrowseUrl } from '@/lib/browseUrl';

export type { WebViewMessageEvent };

export type PlatformWebViewRef = {
  injectJavaScript: (js: string) => void;
  reload: () => void;
};

type Props = Omit<WebViewProps, 'source'> & {
  source: { uri: string } | { html: string };
};

const MOBILE_USER_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) ' +
  'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1 ' +
  'BlurShield/1.0';

export const PlatformWebView = forwardRef<PlatformWebViewRef, Props>(
  function PlatformWebView(props, ref) {
    const webviewRef = useRef<RNWebView>(null);
    const [errorCount, setErrorCount] = useState(0);
    const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
      return () => {
        if (errorTimerRef.current) {
          clearTimeout(errorTimerRef.current);
        }
      };
    }, []);

    useImperativeHandle(ref, () => ({
      injectJavaScript(js: string) {
        try {
          console.log('[PlatformWebView] injectJavaScript called, length=', js ? js.length : 0);
          webviewRef.current?.injectJavaScript(js);
          console.log('[PlatformWebView] injectJavaScript completed');
        } catch (e) {
          console.error('[PlatformWebView] injectJavaScript error', e);
          throw e;
        }
      },
      reload() {
        webviewRef.current?.reload();
      },
    }));

    const source =
      props.source && 'uri' in props.source
        ? { uri: toBrowseUrl(props.source.uri) }
        : props.source;

    const handleError = (e: any) => {
      console.error('[PlatformWebView] onError:', e.nativeEvent);
      const count = errorCount + 1;
      setErrorCount(count);
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
      if (count < 3) {
        const delay = 500 * count;
        errorTimerRef.current = setTimeout(() => {
          console.warn('[PlatformWebView] Retrying load (attempt ' + (count + 1) + '/3)...');
          webviewRef.current?.reload();
        }, delay);
      }
      props.onError?.(e);
    };

    const handleHttpError = (e: any) => {
      console.warn('[PlatformWebView] onHttpError:', e.nativeEvent.statusCode, e.nativeEvent.url);
      props.onHttpError?.(e);
    };

    const handleLoadStart = () => {
      setErrorCount(0);
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
      try { console.log('[PlatformWebView] WebView Started'); } catch {}
    };

    const handleLoadEnd = (e: any) => {
      try { console.log('[PlatformWebView] Page Loaded'); } catch {}
      props.onLoadEnd?.(e);
    };

    const androidLayerType: 'none' | 'software' | 'hardware' = Platform.OS === 'android' ? 'hardware' : 'none';

    return (
      <RNWebView
        ref={webviewRef}
        {...props}
        source={source}
        userAgent={MOBILE_USER_AGENT}
        applicationNameForUserAgent="BlurShield/1.0"
        javaScriptEnabled
        domStorageEnabled
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        mixedContentMode="always"
        originWhitelist={['*']}
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        allowsFullscreenVideo
        allowsBackForwardNavigationGestures
        allowsLinkPreview={false}
        automaticallyAdjustContentInsets={false}
        contentInsetAdjustmentBehavior="never"
        scrollEnabled
        pagingEnabled={false}
        cacheEnabled
        cacheMode="LOAD_DEFAULT"
        textZoom={100}
        setSupportMultipleWindows={false}
        setBuiltInZoomControls={false}
        setDisplayZoomControls={false}
        allowUniversalAccessFromFileURLs
        allowFileAccess
        allowFileAccessFromFileURLs
        androidLayerType={androidLayerType}
        onError={handleError}
        onHttpError={handleHttpError}
        onLoadStart={handleLoadStart}
        onLoadEnd={handleLoadEnd}
        onRenderProcessGone={(e) => {
          console.error('[PlatformWebView] onRenderProcessGone:', e.nativeEvent);
          if (e.nativeEvent.didCrash) {
            webviewRef.current?.reload();
          }
        }}
        onContentProcessDidTerminate={() => {
          console.warn('[PlatformWebView] onContentProcessDidTerminate - reloading');
          webviewRef.current?.reload();
        }}
      />
    );
  },
);
