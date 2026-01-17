<!--
This file is ready to copy/paste directly into GitHub when creating an issue at:
https://github.com/inrupt/solid-client-authn-js/issues/new
-->

### Search terms you've used

`handleIncomingRedirect restorePreviousSession invalid_client`, `client_id expired session restore`, `prompt=none invalid client redirect`, `session restore blocking error`

### Impacted package

Which packages do you think might be impacted by the bug ?

- [x] solid-client-authn-browser
- [ ] solid-client-authn-node
- [ ] solid-client-authn-core
- [ ] oidc-client-ext
- [ ] Other (please specify): ...

### Bug description

When `handleIncomingRedirect({ restorePreviousSession: true })` is called with stored session data containing an invalidated/expired `client_id`, the library immediately redirects to the OAuth provider with the invalid credentials before my application can handle the error. This results in a 401 "invalid_client_id" error that completely blocks users from accessing the application, with no programmatic recovery path.

Users who return to my app after extended periods (when their dynamically registered client has been invalidated by the OAuth provider) are unable to use the application. The only recovery is manually clearing browser data, which most users don't know how to do.

### To Reproduce

1. Log in to a Solid Pod provider successfully (creates dynamic client registration, stores `client_id` in browser)
2. Close the browser (session data remains in IndexedDB/localStorage)
3. Wait for OAuth provider to invalidate the client registration (or manually delete it from provider's admin panel if possible for testing)
4. Open the app again
5. **Observe:** Immediate redirect to authorization endpoint with the now-invalid `client_id`
6. **Observe:** 401 "invalid_client_id" error page from OAuth provider

**My code:**
```typescript
import { handleIncomingRedirect, getDefaultSession } from '@inrupt/solid-client-authn-browser';

useEffect(() => {
  const initSession = async () => {
    try {
      await handleIncomingRedirect({ restorePreviousSession: true });
      const session = getDefaultSession();
      setSession(session);
    } catch (error) {
      console.error("Session initialization error:", error);
      // This never fires for invalid client_id scenarios
      await solidLogout();
    }
  };
  initSession();
}, []);
```

### Expected result

I'm not sure what the intended behavior should be, but I would expect one of:

1. The library validates stored client credentials before initiating silent auth, clears invalid session data automatically, and returns a logged-out session
2. The error is catchable in my try/catch block so I can handle it programmatically
3. A way to inspect/validate stored session data before calling `handleIncomingRedirect()` so I can clear corrupted data proactively

Ideally, users wouldn't be blocked from accessing the application due to expired OAuth credentials stored in their browser.

### Actual result

When the user visits the app:

1. `handleIncomingRedirect({ restorePreviousSession: true })` is called
2. The library immediately redirects to the OAuth provider (before my code continues):
   ```
   https://login.inrupt.com/authorization?
     client_id=22fe30ba-129c-46ed-843c-e8f28debdb16
     &prompt=none
     &redirect_uri=https%3A%2F%2Freact-packing-app.vercel.app%2Fpod-auth-callback.html
     &response_mode=query
     ...
   ```
3. OAuth provider returns 401 with "invalid_client_id" error
4. User is stuck on the error page
5. My `try/catch` block never catches any error (presumably because the redirect happens synchronously before the Promise is created)

The user cannot access the application. Manual browser data clearing is required to recover.

### Environment

```sh
$ npx envinfo --system --npmPackages --binaries --npmGlobalPackages --browsers

System:
  OS: Linux (Vercel deployment + local development)
  Browser: Chrome/Firefox/Safari (reproducible across all)

Binaries:
  Node: 18.x
  npm: 9.x

npmPackages:
  @inrupt/solid-client: ^2.1.2
  @inrupt/solid-client-authn-browser: ^3.1.0
  @inrupt/vocab-common-rdf: ^1.0.5
  @inrupt/vocab-solid: ^1.0.4
```

Production app affected: https://react-packing-app.vercel.app

## Additional information

### My Understanding (Please Correct If Wrong)

From my investigation, it appears that when `restorePreviousSession: true`, the library immediately initiates a silent auth redirect (`prompt=none`) before `handleIncomingRedirect()` returns its Promise. If the stored `client_id` has been invalidated, the redirect happens anyway with invalid credentials. Since the redirect is synchronous, my try/catch cannot intercept it.

I may be misunderstanding how this is intended to work.

### Questions I'm Hoping You Can Help With

1. **Is this the intended behavior** when stored client credentials become invalid? Should applications expect this scenario?

2. **Is there a recommended pattern** for handling invalidated client_ids that I'm missing? Should I be doing something differently in my setup?

3. **Is there a way to detect or validate** stored session data before calling `handleIncomingRedirect()` so I can clear it proactively if needed?

4. **Would it make sense** for the library to handle this scenario internally (e.g., detecting the invalid client and clearing session data automatically), or is that something applications should manage?

5. **For `restorePreviousSession: true` to be safe in production**, what assumptions should I make about client_id lifetime and validity?

### Temporary Workaround I'm Considering

```typescript
await handleIncomingRedirect({ restorePreviousSession: false });
```

This would require users to explicitly log in after each page refresh, losing the seamless "stay logged in" experience, but prevents the blocking issue entirely.

**Would this be the recommended approach**, or is there a better pattern I should follow?

### Related Issues/Discussions I Found

- [#3443](https://github.com/inrupt/solid-client-authn-js/issues/3443) - Discusses challenges with silent authentication redirects
- [#1790](https://github.com/inrupt/solid-client-authn-js/issues/1790) - Dynamic client ID issues
- [#1989](https://github.com/inrupt/solid-client-authn-js/issues/1989) - Query string handling with restorePreviousSession
- [Forum discussion on invalid_client errors](https://forum.solidproject.org/t/inrupt-pod-login-complains-about-an-invalid-client/4726)

I appreciate any guidance you can provide on the recommended way to handle this scenario!
