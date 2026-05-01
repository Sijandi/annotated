import { supabase } from './supabase';

type Provider = 'twitter' | 'google';

/**
 * Sign in via OAuth using chrome.identity.launchWebAuthFlow.
 *
 * IMPORTANT: In the Supabase dashboard, configure each provider's redirect URL
 * to include `https://<your-extension-id>.chromiumapp.org/`.
 *
 * Get extension ID from chrome://extensions (with developer mode on, after loading
 * unpacked). Add that exact URL to the provider's "Redirect URLs" list in Supabase
 * Auth → Providers settings.
 */
export async function signInWithProvider(provider: Provider): Promise<void> {
  const redirectUrl = chrome.identity.getRedirectURL();
  // Format: https://<extension-id>.chromiumapp.org/

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: redirectUrl,
      skipBrowserRedirect: true, // we'll handle the redirect ourselves
    },
  });

  if (error) {
    console.error('[annotated] OAuth init failed:', error);
    throw error;
  }

  if (!data.url) {
    throw new Error('Supabase did not return an OAuth URL');
  }

  // Launch OAuth flow in a popup; chrome.identity handles the redirect
  const responseUrl = await new Promise<string>((resolve, reject) => {
    chrome.identity.launchWebAuthFlow(
      { url: data.url, interactive: true },
      (callbackUrl) => {
        if (chrome.runtime.lastError || !callbackUrl) {
          reject(chrome.runtime.lastError ?? new Error('No callback URL'));
        } else {
          resolve(callbackUrl);
        }
      }
    );
  });

  // Parse the callback URL for tokens
  // Supabase returns them in hash fragment (#) for implicit flow
  // or as query params (?) for some providers
  const url = new URL(responseUrl);
  const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''));
  const queryParams = url.searchParams;

  const access_token = hashParams.get('access_token') || queryParams.get('access_token');
  const refresh_token = hashParams.get('refresh_token') || queryParams.get('refresh_token');

  // If no tokens but there's a code, exchange it
  const code = queryParams.get('code');
  if (code && !access_token) {
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) {
      console.error('[annotated] code exchange failed:', exchangeError);
      throw exchangeError;
    }
    return;
  }

  if (!access_token || !refresh_token) {
    console.error('[annotated] callback URL:', responseUrl);
    throw new Error('OAuth response missing tokens');
  }

  const { error: setError } = await supabase.auth.setSession({
    access_token,
    refresh_token,
  });

  if (setError) {
    console.error('[annotated] setSession failed:', setError);
    throw setError;
  }
}
