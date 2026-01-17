# Inrupt Authentication Issue: Invalid Client ID Redirect Loop

**Status:** Identified and Documented
**Date:** 2026-01-17
**Severity:** HIGH - Production blocking issue
**GitHub Issue:** To be submitted to `inrupt/solid-client-authn-js`

---

## Problem Summary

Users returning to our app after extended periods are being completely blocked due to invalidated OAuth client credentials stored in their browser. The Inrupt library redirects immediately with the expired `client_id` before our error handling can activate, resulting in a 401 error with no programmatic recovery path.

**User Impact:** Complete application blockage requiring manual browser data clearing (IndexedDB/localStorage).

---

## Technical Details

### Where It Happens
- **File:** `src/components/SolidPodContext.tsx:74`
- **Code:** `await handleIncomingRedirect({ restorePreviousSession: true });`

### What Happens

1. User had previously logged in → `client_id` stored in browser
2. OAuth provider invalidated the dynamically registered client (normal maintenance)
3. On next visit, library finds stored `client_id` and immediately redirects with `prompt=none`
4. OAuth provider rejects invalid `client_id` before app can handle the error
5. User stuck on 401 error page

### Why Error Handling Doesn't Work

The redirect happens synchronously before `handleIncomingRedirect()` returns its Promise, so our try/catch block never executes.

### Example Error URL

```
https://login.inrupt.com/authorization?
  client_id=22fe30ba-129c-46ed-843c-e8f28debdb16  ← Invalid!
  &prompt=none
  &redirect_uri=https%3A%2F%2Freact-packing-app.vercel.app%2Fpod-auth-callback.html
  &response_mode=query
```

---

## Solution Options

### Option 1: Disable Automatic Session Restoration (Recommended Short-term)

```typescript
// Change from:
await handleIncomingRedirect({ restorePreviousSession: true });

// To:
await handleIncomingRedirect({ restorePreviousSession: false });
```

**Pros:**
- Eliminates the blocking issue entirely
- Users explicitly choose when to log in
- More predictable behavior

**Cons:**
- Users must click "Login" after every page refresh
- Loses the seamless "stay logged in" experience
- May not be using the library as intended

### Option 2: Wait for Upstream Guidance (Ideal)

Submit issue to Inrupt team and wait for their recommended pattern.

**Pros:**
- Could lead to a proper library-level fix
- Learn the intended usage pattern

**Cons:**
- Users can still get blocked in the meantime
- No timeline on response/fix

---

## Issue Submission

**Ready to copy/paste:** See `docs/inrupt-client-id-issue-submission.md`

**Submit to:** https://github.com/inrupt/solid-client-authn-js/issues/new

---

## Research & References

### Documentation
- [Session Restore upon Browser Refresh](https://docs.inrupt.com/guides/authentication-in-solid/authentication-from-browser/session-restore-upon-browser-refresh)
- [Session Restore Tutorial](https://docs.inrupt.com/developer-tools/javascript/client-libraries/tutorial/restore-session-browser-refresh/)

### Related Issues
- [#3443](https://github.com/inrupt/solid-client-authn-js/issues/3443) - Silent authentication redirect challenges
- [#1790](https://github.com/inrupt/solid-client-authn-js/issues/1790) - Wrong dynamic client ID used for code-to-token exchange
- [#1989](https://github.com/inrupt/solid-client-authn-js/issues/1989) - handleIncomingRedirect strips querystring

### Community Discussions
- [Inrupt pod login complains about an invalid_client](https://forum.solidproject.org/t/inrupt-pod-login-complains-about-an-invalid-client/4726)
- [handleIncomingRedirect creates endless loop](https://forum.solidproject.org/t/handleincomingredirect-w-redirect-creates-endless-loop/8623)

---

## Action Items

- [ ] Submit issue using `inrupt-client-id-issue-submission.md`
- [ ] Evaluate implementing `restorePreviousSession: false` workaround
- [ ] Monitor issue for Inrupt team response
- [ ] Update implementation based on their guidance
- [ ] Document final solution for team

---

**Last Updated:** 2026-01-17
**Maintained By:** Pack Me Up Development Team
