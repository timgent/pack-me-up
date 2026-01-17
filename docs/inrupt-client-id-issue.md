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
`handleIncomingRedirect({ restorePreviousSession: true })` causes unrecoverable redirect loop when stored client_id is invalidated

---

### **Description**

**Environment:**
- Library: `@inrupt/solid-client-authn-browser` v3.1.0
- OAuth Provider: Inrupt (login.inrupt.com)
- Browser: Chrome/Firefox/Safari (reproducible across all)
- App Type: React SPA deployed to production

---

### **Problem Summary**

When `handleIncomingRedirect({ restorePreviousSession: true })` is called with stored session data containing an **invalidated/expired client_id**, the library immediately redirects to the OAuth authorization endpoint with the invalid credentials **before** the application can catch and handle the error. This results in:

1. Immediate 401 "invalid_client_id" error from the OAuth provider
2. User is blocked from accessing the application
3. The error occurs **synchronously during the redirect**, so the Promise returned by `handleIncomingRedirect()` never resolves/rejects
4. The only recovery path is manually clearing browser data

**This creates a production incident scenario where users cannot access the application.**

---

### **Expected Behavior**

One of the following should happen:

**Option A (Preferred):** The library should validate stored client credentials before initiating silent authentication, and if invalid:
- Clear the corrupted session data automatically
- Return a rejected Promise with a specific error type (e.g., `InvalidClientError`)
- Allow the application to handle the error and prompt for fresh login

**Option B:** Provide a synchronous method to inspect/validate stored session data before calling `handleIncomingRedirect()`:
```typescript
const hasValidSession = await session.validateStoredSession();
if (!hasValidSession) {
  await session.logout(); // Clear corrupted data
}
await handleIncomingRedirect({ restorePreviousSession: true });
```

**Option C:** Make the redirect deferrable so applications can catch errors:
```typescript
try {
  await handleIncomingRedirect({
    restorePreviousSession: true,
    validateBeforeRestore: true // New option
  });
} catch (error) {
  if (error instanceof InvalidClientError) {
    // Handle gracefully
  }
}
```

---

### **Actual Behavior**

1. User visits app after OAuth provider has invalidated their dynamically registered client
2. `handleIncomingRedirect({ restorePreviousSession: true })` is called
3. Library **immediately redirects** (synchronously) to:
   ```
   https://login.inrupt.com/authorization?
     client_id=<INVALID_ID>
     &prompt=none
     &redirect_uri=...
     &response_mode=query
   ```
4. OAuth provider returns 401 with "invalid_client_id" error
5. User is stuck on error page
6. The `try/catch` block in the application never catches the error because the redirect happens before the Promise is created

---

### **Reproduction Steps**

**Setup:**
```typescript
import { handleIncomingRedirect, getDefaultSession } from '@inrupt/solid-client-authn-browser';

// Initial app load
useEffect(() => {
  const initSession = async () => {
    try {
      await handleIncomingRedirect({ restorePreviousSession: true });
      const session = getDefaultSession();
      setSession(session);
    } catch (error) {
      console.error("This never fires for invalid client_id", error);
    }
  };
  initSession();
}, []);
```

**Steps:**
1. Log in to a Solid Pod provider successfully (creates dynamic client registration)
2. Close the browser (session data remains in IndexedDB/localStorage)
3. Wait for OAuth provider to invalidate the client registration (or manually delete it from provider's admin panel)
4. Open the app again
5. **Observe:** Immediate redirect to authorization endpoint with invalid client_id
6. **Observe:** 401 error page, application is unusable

**Temporary Workaround:**
Users must manually clear site data (Application → Clear Storage in DevTools) to recover.

---

### **Root Cause Analysis**

From examining the library's behavior:

1. **Silent Authentication Flow**: When `restorePreviousSession: true`, the library checks for stored session data and immediately initiates a `prompt=none` silent authentication flow
2. **No Credential Validation**: The library does not validate that the stored `client_id` is still valid with the OAuth provider before initiating the redirect
3. **Synchronous Redirect**: The redirect happens synchronously/immediately, so the Promise returned by `handleIncomingRedirect()` hasn't been created yet when the redirect occurs
4. **Error Handling Gap**: There's no mechanism for the application to intercept or handle invalid client credentials before the redirect

---

### **Impact**

**Production Severity: HIGH**

- Users cannot access the application without manual intervention
- No programmatic recovery path available to developers
- Common in production environments where:
  - Users return after extended periods (weeks/months)
  - OAuth providers perform regular client cleanup
  - Dynamic client registrations have TTLs

**Real-world example:** Our production app (https://react-packing-app.vercel.app) experienced this issue, completely blocking users from authentication.

---

### **Proposed Solutions**

**Solution 1: Pre-validation Check (Recommended)**
```typescript
// Add internal validation before silent auth redirect
async handleIncomingRedirect(options) {
  if (options.restorePreviousSession) {
    const storedClientId = await this.getStoredClientId();
    if (storedClientId) {
      try {
        // Lightweight validation with OAuth provider
        await this.validateClientRegistration(storedClientId);
      } catch (error) {
        if (error instanceof InvalidClientError) {
          console.warn("Stored client_id is invalid, clearing session data");
          await this.logout(); // Clear corrupted data
          // Return empty session, no redirect
          return;
        }
      }
    }
  }
  // Continue with normal flow...
}
```

**Solution 2: Catch Silent Auth Errors**
```typescript
// When silent auth fails with invalid_client, automatically cleanup
async attemptSilentAuthentication(clientId, redirectUri) {
  try {
    // Initiate silent auth
  } catch (error) {
    if (error.error === 'invalid_client') {
      await this.clearStoredSession();
      throw new InvalidClientError("Stored client credentials are invalid");
    }
    throw error;
  }
}
```

**Solution 3: New API Method**
```typescript
// Expose a validation method for applications
class Session {
  async hasValidStoredSession(): Promise<boolean> {
    const clientId = await this.storage.get('clientId');
    if (!clientId) return false;

    try {
      await this.validateWithProvider(clientId);
      return true;
    } catch {
      return false;
    }
  }
}
```

---

### **Additional Context**

Related issues:
- [#3443](https://github.com/inrupt/solid-client-authn-js/issues/3443) - Discusses problems with automatic silent authentication redirects
- [#1790](https://github.com/inrupt/solid-client-authn-js/issues/1790) - Wrong dynamic client ID issues
- [#1989](https://github.com/inrupt/solid-client-authn-js/issues/1989) - handleIncomingRedirect strips query string

The library's current behavior prioritizes automatic session restoration over error resilience. For production applications, **graceful degradation** (falling back to logged-out state) is preferable to **user-blocking errors**.

---

### **Workaround (Application-Level)**

Until this is fixed, we're using:
```typescript
await handleIncomingRedirect({ restorePreviousSession: false });
```

This disables automatic session restoration, requiring users to explicitly log in after page refresh, but prevents the invalid client_id redirect issue entirely.

---

### **Acceptance Criteria**

A fix should ensure that:
- [ ] Invalid/expired client_id in stored session data does not cause unrecoverable redirect loops
- [ ] Applications can catch and handle invalid client errors programmatically
- [ ] Session data is automatically cleaned up when credentials are invalid
- [ ] Users are not blocked from accessing applications due to corrupted session storage

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

## Recommended Solution for Our App

**Immediate Fix:** Disable automatic session restoration

```typescript
// Change this line:
await handleIncomingRedirect({ restorePreviousSession: false });
```

**Benefits:**
- ✅ Eliminates the redirect loop entirely
- ✅ Users explicitly choose when to log in (standard SPA pattern)
- ✅ No unexpected redirects
- ✅ Cleaner, more predictable UX

**Trade-offs:**
- ❌ Users must click "Login" after page refresh (but this is standard for most web apps)
- ❌ Loses "stay logged in" feeling

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

1. **Submit Issue:** Create issue in `inrupt/solid-client-authn-js` repository using the draft above
2. **Implement Workaround:** Apply `restorePreviousSession: false` in our codebase
3. **Monitor:** Watch for upstream fixes from Inrupt team
4. **Re-evaluate:** Once fixed upstream, consider re-enabling automatic session restoration

---

**Document Maintained By:** Pack Me Up Development Team
**Last Updated:** 2026-01-17
