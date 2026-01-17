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

- **Production blocking**: Users who return to the app after weeks/months are completely unable to access it
- **No programmatic recovery**: We cannot detect or handle this scenario in our application code
- **Poor user experience**: Users have no way to know why they can't access the app or how to fix it
- **Silent failure**: The redirect happens before any Promise resolution, so standard error handling doesn't work

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

From our investigation, it appears that:

1. When `restorePreviousSession: true`, the library finds stored session data and immediately initiates a silent authentication flow (`prompt=none`)
2. This redirect happens synchronously/immediately, before `handleIncomingRedirect()` returns its Promise
3. If the stored `client_id` has been invalidated by the OAuth provider, the redirect happens anyway with the invalid credentials
4. Since the redirect is synchronous, our application's error handling cannot catch it

We may be misunderstanding how this is intended to work, so please correct us if we're missing something.

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

We're considering changing our code to:

```typescript
await handleIncomingRedirect({ restorePreviousSession: false });
```

This would disable automatic session restoration, requiring users to explicitly log in after each page refresh. This prevents the invalid client_id issue but loses the seamless "stay logged in" experience.

**Would this be the recommended approach**, or is there a better pattern we should follow?

---

### **Additional Context**

We found some potentially related issues:
- [#3443](https://github.com/inrupt/solid-client-authn-js/issues/3443) - Discusses challenges with silent authentication redirects
- [#1790](https://github.com/inrupt/solid-client-authn-js/issues/1790) - Dynamic client ID issues
- [#1989](https://github.com/inrupt/solid-client-authn-js/issues/1989) - Query string handling with restorePreviousSession

We appreciate any guidance you can provide on the recommended way to handle this scenario!

---

## Our Investigation

### Timeline of the Issue

**Production Impact:**
- Users visiting the app after extended periods were immediately redirected to Inrupt's OAuth provider
- 401 error: "invalid_client_id"
- Complete blockage from using the application
- Required manual clearing of browser data to recover

### Technical Analysis

**Current Implementation** (`src/components/SolidPodContext.tsx:74`):
```typescript
await handleIncomingRedirect({ restorePreviousSession: true });
```

**How It Fails:**
1. User had previously logged in → `client_id` stored in browser (IndexedDB/localStorage)
2. OAuth provider invalidated the dynamically registered client (normal maintenance)
3. On next visit, library finds stored `client_id` and immediately redirects with `prompt=none`
4. OAuth provider rejects invalid `client_id` before app can handle the error
5. User stuck on 401 error page

**Why Error Handling Doesn't Work:**
The existing try/catch in lines 86-105 of SolidPodContext.tsx would handle errors, but the redirect happens **synchronously before any error is thrown** to catch.

---

## Potential Solutions We're Evaluating

### **Option 1: Disable Automatic Session Restoration**

```typescript
// Change from this:
await handleIncomingRedirect({ restorePreviousSession: true });

// To this:
await handleIncomingRedirect({ restorePreviousSession: false });
```

**Pros:**
- Eliminates the redirect loop problem
- Users explicitly choose when to log in
- No unexpected redirects
- More predictable behavior

**Cons:**
- Users must click "Login" after every page refresh
- Loses the seamless "stay logged in" experience
- May not be using the library as intended

### **Option 2: Wait for Upstream Guidance**

Continue with current implementation but document the issue for users (tell them to clear site data if they get stuck). Wait for Inrupt team's guidance on the recommended pattern.

**Pros:**
- Keeps intended automatic session restoration
- Follows library's designed usage pattern

**Cons:**
- Users can still get blocked
- Not a real solution

We're leaning toward **Option 1** as a short-term fix while we seek guidance, but we'd prefer to understand the intended way to handle this scenario.

---

## References

### Documentation
- [Session Restore upon Browser Refresh](https://docs.inrupt.com/guides/authentication-in-solid/authentication-from-browser/session-restore-upon-browser-refresh)
- [Session Restore Tutorial](https://docs.inrupt.com/developer-tools/javascript/client-libraries/tutorial/restore-session-browser-refresh/)
- [Authentication from Browser](https://docs.inrupt.com/guides/authentication-in-solid/authentication-from-browser)

### Related Issues
- [Browser/App: Restore session without silent login and redirect (#3443)](https://github.com/inrupt/solid-client-authn-js/issues/3443)
- [Wrong dynamic client ID used for code-to-token exchange (#1790)](https://github.com/inrupt/solid-client-authn-js/issues/1790)
- [handleIncomingRedirect strips querystring (#1989)](https://github.com/inrupt/solid-client-authn-js/issues/1989)

### Community Discussions
- [Inrupt pod login complains about an invalid_client](https://forum.solidproject.org/t/inrupt-pod-login-complains-about-an-invalid-client/4726)
- [handleIncomingRedirect creates endless loop](https://forum.solidproject.org/t/handleincomingredirect-w-redirect-creates-endless-loop/8623)

---

## Next Steps

1. **Submit Issue:** Create issue in `inrupt/solid-client-authn-js` repository to seek guidance from the Inrupt team
2. **Evaluate Workaround:** Consider implementing `restorePreviousSession: false` as temporary measure
3. **Monitor Response:** Review Inrupt team's recommendations and adjust implementation accordingly
4. **Update Documentation:** Document the recommended approach for our team once we have clarity

---

**Document Maintained By:** Pack Me Up Development Team
**Last Updated:** 2026-01-17
