package com.timgent.packmeup;

import android.os.Bundle;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // When the OIDC provider issues an HTTP redirect back to https://localhost/?code=…,
        // Android WebView attempts a real TLS connection to localhost:443 before
        // shouldInterceptRequest can serve it from local assets — causing ERR_CONNECTION_REFUSED.
        // Intercepting the redirect here and reloading programmatically avoids the TLS race:
        // loadUrl() calls go through shouldInterceptRequest cleanly.
        getBridge().getWebView().setWebViewClient(new BridgeWebViewClient(getBridge()) {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                String localUrl = getBridge().getLocalUrl();
                if (localUrl != null && url.startsWith(localUrl)
                        && (url.contains("code=") || url.contains("error="))) {
                    view.loadUrl(url);
                    return true;
                }
                return super.shouldOverrideUrlLoading(view, request);
            }
        });
    }
}
