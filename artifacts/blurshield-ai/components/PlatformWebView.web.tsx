import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { ActivityIndicator, View } from 'react-native';
import { toBrowseUrl } from '@/lib/browseUrl';

export type WebViewMessageEvent = {
  nativeEvent: { data: string };
};

export type PlatformWebViewRef = {
  injectJavaScript: (js: string) => void;
  reload: () => void;
};

type InjectableIframeWindow = Window & {
  document: Document;
  __bsInjectedScripts?: Set<string>;
  eval: (code: string) => any;
};

type Props = {
  source: { uri: string };
  style?: object;
  injectedJavaScript?: string;
  onMessage?: (event: WebViewMessageEvent) => void;
  onLoadEnd?: () => void;
  startInLoadingState?: boolean;
  allowsBackForwardNavigationGestures?: boolean;
  mediaPlaybackRequiresUserAction?: boolean;
  allowsInlineMediaPlayback?: boolean;
  onError?: (e: any) => void;
  onNavigationStateChange?: (navState: { url: string; loading: boolean }) => void;
};

const INJECT_MAX_RETRIES = 5;

function safeReport(_event: string, _payload: Record<string, unknown> = {}) {}

export const PlatformWebView = forwardRef<PlatformWebViewRef, Props>(
  function PlatformWebView(
    { source, style, injectedJavaScript, onMessage, onLoadEnd, startInLoadingState, onNavigationStateChange },
    ref,
  ) {
    const iframeRef  = useRef<HTMLIFrameElement | null>(null);
    const [loading, setLoading] = useState(startInLoadingState ?? true);
    const loadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const injectRetryRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const proxyUrl = toBrowseUrl(source.uri);

    function clearAllTimers() {
      if (loadTimeoutRef.current) { clearTimeout(loadTimeoutRef.current); loadTimeoutRef.current = null; }
      if (injectRetryRef.current) { clearTimeout(injectRetryRef.current); injectRetryRef.current = null; }
    }

    function injectIntoIframe(js: string, attempt: number = 0) {
      const iframeWindow = iframeRef.current?.contentWindow as InjectableIframeWindow | null;
      const iframeDoc = iframeWindow?.document;
      if (!iframeDoc || !iframeWindow) {
        if (attempt < INJECT_MAX_RETRIES) {
          injectRetryRef.current = setTimeout(() => injectIntoIframe(js, attempt + 1), 250 * (attempt + 1));
        } else {
          console.warn('[PlatformWebView.web] No iframe document after retries');
        }
        return;
      }

      try {
        const readyState = iframeDoc.readyState;
        if (readyState !== 'complete' && readyState !== 'interactive' && attempt < INJECT_MAX_RETRIES) {
          injectRetryRef.current = setTimeout(() => injectIntoIframe(js, attempt + 1), 200);
          return;
        }
      } catch {}

      try {
        iframeWindow.eval(js);
        console.log('[PlatformWebView.web] Injected via eval (attempt ' + attempt + ')');
      } catch (e) {
        console.warn('[PlatformWebView.web] Eval failed, using script tag:', e instanceof Error ? e.message : String(e));
        try {
          const script = iframeDoc.createElement('script');
          script.type = 'text/javascript';
          script.text = '(function(){' + js + '})(); true;';
          const target = iframeDoc.head || iframeDoc.body || iframeDoc.documentElement;
          if (target) target.appendChild(script);
        } catch (se) {
          console.error('[PlatformWebView.web] Both eval and script tag failed:', se);
        }
      }
    }

    useImperativeHandle(ref, () => ({
      injectJavaScript(js: string) {
        try {
          injectIntoIframe(js, 0);
        } catch (e) {
          console.warn('[PlatformWebView] injectJavaScript failed:', e);
        }
      },
      reload() {
        if (iframeRef.current) {
          setLoading(true);
          try {
            const iframe = iframeRef.current;
            iframe.src = iframe.src;
          } catch {}
        }
      },
    }));

    useEffect(() => {
      clearAllTimers();
      setLoading(startInLoadingState ?? true);
      try { console.log('[PlatformWebView.web] WebView Started'); } catch {}
      onNavigationStateChange?.({ url: proxyUrl, loading: true });
    }, [proxyUrl, startInLoadingState, onNavigationStateChange]);

    useEffect(() => {
      return () => clearAllTimers();
    }, []);

    useEffect(() => {
      if (!onMessage) return;
      function handler(e: MessageEvent) {
        if (typeof e.data === 'string') {
          console.log('[PlatformWebView.web] Received message:', e.data.slice(0, 200) + '...');
          onMessage!({ nativeEvent: { data: e.data } });
        }
      }
      window.addEventListener('message', handler, false);
      return () => window.removeEventListener('message', handler, false);
    }, [onMessage]);

    function handleLoad() {
      clearAllTimers();
      safeReport('webview.load', { sourceUri: source.uri, proxyUrl });
      try { console.log('[PlatformWebView.web] Page Loaded'); } catch {}
      console.log('[PlatformWebView.web] iframe loaded, proxyUrl:', proxyUrl);
      setLoading(false);
      onNavigationStateChange?.({ url: proxyUrl, loading: false });
      if (injectedJavaScript) {
        setTimeout(() => injectIntoIframe(injectedJavaScript, 0), 600);
      }
      onLoadEnd?.();
    }

    return (
      <View style={[{ flex: 1, overflow: 'hidden' }, style]}>
        {loading && (
          <View
            style={{
              position: 'absolute', inset: 0,
              alignItems: 'center', justifyContent: 'center',
              zIndex: 10,
            }}
          >
            <ActivityIndicator size="large" />
          </View>
        )}
        <iframe
          key={proxyUrl}
          ref={iframeRef}
          src={proxyUrl}
          onLoad={handleLoad}
          onError={(e) => {
            clearAllTimers();
            setLoading(false);
            console.error('[PlatformWebView.web] iframe error:', e);
          }}
          style={{
            flex: 1,
            width: '100%',
            height: '100%',
            border: 'none',
            display: 'block',
            backgroundColor: '#070A14',
          }}
          allow="camera; microphone; autoplay; autoplay-insecure; encrypted-media; fullscreen; picture-in-picture; clipboard-write; clipboard-read; xr-spatial-tracking"
          allowFullScreen
          sandbox="allow-downloads allow-forms allow-modals allow-orientation-lock allow-pointer-lock allow-popups allow-popups-to-escape-sandbox allow-presentation allow-same-origin allow-scripts allow-storage-access-by-user-activation allow-top-navigation-by-user-activation"
          referrerPolicy="strict-origin-when-cross-origin"
          loading="eager"
        />
      </View>
    );
  },
);
