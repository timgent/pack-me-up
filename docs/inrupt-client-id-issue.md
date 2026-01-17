# Inrupt Authentication Issue: Invalid Client ID Redirect Loop

**Status:** Identified and Documented
**Date:** 2026-01-17
**Severity:** HIGH - Production blocking issue

---

## Issue Summary

This document describes a critical authentication issue with the Inrupt Solid authentication library (`@inrupt/solid-client-authn-browser`) that causes users to be blocked from accessing the application when stored OAuth client credentials become invalidated.

**Issue Repository:** `inrupt/solid-client-authn-js`

---

## GitHub Issue Draft

### **Title:**
Need guidance: `handleIncomingRedirect({ restorePreviousSession: true })` redirects immediately with invalidated client_id, blocking users from app

---

### **Description**

**Environment:**
- Library: `@inrupt/solid-client-authn-browser` v3.1.0
- OAuth Provider: Inrupt (login.inrupt.com)
- Browser: Chrome/Firefox/Safari (reproducible across all)
- App Type: React SPA deployed to production (https://react-packing-app.vercel.app)

---

### **Our Setup**

We have a React application that initializes the Solid session on page load:

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
      // Handle errors and clear session data
    }
  };
  initSession();
}, []);
```

We use `restorePreviousSession: true` to provide a seamless experience where users remain logged in across page refreshes.

---

### **What We're Observing**

When users visit our app after their OAuth provider has invalidated the dynamically registered client_id (which we assume is normal maintenance/cleanup), the following happens:

1. User visits the app
2. `handleIncomingRedirect({ restorePreviousSession: true })` is called
3. The library **immediately redirects** to the OAuth provider before our code continues:
   ```
   https://login.inrupt.com/authorization?
     client_id=22fe30ba-129c-46ed-843c-e8f28debdb16
     &prompt=none
     &redirect_uri=https%3A%2F%2Freact-packing-app.vercel.app%2Fpod-auth-callback.html
     &response_mode=query
     ...
   ```
4. OAuth provider immediately returns 401 with "invalid_client_id" error
5. User sees the error page and cannot access our application
6. Our `try/catch` block never catches any error (presumably because the redirect happens synchronously)

**Current User Recovery:** Users must manually clear browser site data (IndexedDB/localStorage) to recover. Obviously, this is not a viable solution.

---

### **Why This Is Problematic**

Users who return after weeks/months are completely blocked from accessing the app. The redirect happens before our error handling can activate, so we have no way to detect or recover programmatically. Users must manually clear browser data, which they don't know how to do.

---

### **Reproduction Steps**

1. Log in to a Solid Pod provider successfully (creates dynamic client registration)
2. Close the browser (session data with client_id remains in IndexedDB/localStorage)
3. Wait for OAuth provider to invalidate the client registration (or manually delete it from provider's admin panel if possible for testing)
4. Open the app again
5. **Observe:** Immediate redirect to authorization endpoint with the now-invalid client_id
6. **Observe:** 401 "invalid_client_id" error page from OAuth provider

The user is now blocked from accessing the application entirely.

---

### **Our Understanding (Please Correct If Wrong)**

From our investigation, it appears that when `restorePreviousSession: true`, the library immediately initiates a silent auth redirect (`prompt=none`) before `handleIncomingRedirect()` returns its Promise. If the stored `client_id` has been invalidated, the redirect happens anyway with invalid credentials. Since the redirect is synchronous, our try/catch cannot intercept it.

We may be misunderstanding how this is intended to work.

---

### **What We've Tried**

We attempted to catch errors in our application code:

```typescript
try {
  await handleIncomingRedirect({ restorePreviousSession: true });
} catch (error) {
  // This never fires for invalid client_id scenarios
  await solidLogout(); // Clear corrupted session
}
```

However, this doesn't work because the redirect happens before the Promise is created.

---

### **Questions We're Hoping You Can Help With**

1. **Is this the intended behavior** when stored client credentials become invalid? Should applications expect this scenario?

2. **Is there a recommended pattern** for handling invalidated client_ids that we're missing? Should we be doing something differently in our setup?

3. **Is there a way to detect or validate** stored session data before calling `handleIncomingRedirect()` so we can clear it proactively if needed?

4. **Would it make sense** for the library to handle this scenario internally (e.g., detecting the invalid client and clearing session data automatically), or is that something applications should manage?

5. **For `restorePreviousSession: true` to be safe in production**, what assumptions should we make about client_id lifetime and validity?

---

### **Temporary Workaround We're Considering**

```typescript
await handleIncomingRedirect({ restorePreviousSession: false });
```

This would require users to explicitly log in after each page refresh, losing the seamless "stay logged in" experience, but prevents the blocking issue entirely.

**Would this be the recommended approach**, or is there a better pattern we should follow?

---

### **Additional Context**

We found some potentially related issues:
- [#3443](https://github.com/inrupt/solid-client-authn-js/issues/3443) - Discusses challenges with silent authentication redirects
- [#1790](https://github.com/inrupt/solid-client-authn-js/issues/1790) - Dynamic client ID issues
- [#1989](https://github.com/inrupt/solid-client-authn-js/issues/1989) - Query string handling with restorePreviousSession

We appreciate any guidance you can provide on the recommended way to handle this scenario!

---

## Internal Notes

### What We Found
- **File:** `src/components/SolidPodContext.tsx:74`
- **Issue:** `restorePreviousSession: true` causes immediate redirect before error handling can activate
- **Root cause:** Stored `client_id` from previous login becomes invalid over time (provider cleanup)
- **User impact:** Complete app blockage, requires manual browser data clearing

### Our Options
1. **Short-term:** Set `restorePreviousSession: false` (lose "stay logged in" UX but fix the blocking issue)
2. **Ideal:** Wait for Inrupt team guidance on the intended pattern

### Research Links
- **Docs:** [Session Restore](https://docs.inrupt.com/guides/authentication-in-solid/authentication-from-browser/session-restore-upon-browser-refresh) | [Tutorial](https://docs.inrupt.com/developer-tools/javascript/client-libraries/tutorial/restore-session-browser-refresh/)
- **Issues:** [#3443](https://github.com/inrupt/solid-client-authn-js/issues/3443) (silent auth redirects) | [#1790](https://github.com/inrupt/solid-client-authn-js/issues/1790) (client ID) | [#1989](https://github.com/inrupt/solid-client-authn-js/issues/1989) (query string)
- **Forum:** [Invalid client discussion](https://forum.solidproject.org/t/inrupt-pod-login-complains-about-an-invalid-client/4726)

---

## Next Steps

1. Submit issue to `inrupt/solid-client-authn-js` using the draft above
2. Consider implementing `restorePreviousSession: false` workaround if needed urgently
3. Update implementation based on Inrupt team's guidance

**Last Updated:** 2026-01-17
