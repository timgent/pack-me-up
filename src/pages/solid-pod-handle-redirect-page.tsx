import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useHasQuestions } from "../hooks/useHasQuestions";
import { isNeutralAuthReturnRoute, suggestedPostLoginRoute } from "./postLoginDestination";

export const AUTH_RETURN_TO_KEY = "authReturnTo";

export const SolidPodHandleRedirectPage = () => {
    const navigate = useNavigate();
    // Only consulted for the neutral case below, but hooks can't be conditional —
    // and the read is local-first, so asking costs nothing when it isn't used.
    const { hasQuestions, isLoading: isCheckingQuestions } = useHasQuestions();
    // The neutral case waits for the question check, so this effect runs again
    // when it settles. One navigation is all we ever want.
    const hasNavigated = useRef(false);

    useEffect(() => {
        if (hasNavigated.current) return;

        const storedRoute = sessionStorage.getItem(AUTH_RETURN_TO_KEY);
        sessionStorage.removeItem(AUTH_RETURN_TO_KEY);
        if (!isNeutralAuthReturnRoute(storedRoute)) {
            hasNavigated.current = true;
            navigate(storedRoute!);
            return;
        }

        // Fallback: use returnTo from URL params (covers cases where sessionStorage was not set)
        const paramRoute = new URLSearchParams(window.location.search).get("returnTo");
        if (!isNeutralAuthReturnRoute(paramRoute)) {
            hasNavigated.current = true;
            navigate(paramRoute!);
            return;
        }

        // Nothing the user asked to come back to, so make the suggestion the
        // home page would have made (#334) — but not before the check settles,
        // or a returning user whose questions are still arriving from the pod
        // gets sent to the wizard (#333). The "Logging in..." screen below is
        // what they see meanwhile.
        if (isCheckingQuestions) return;
        hasNavigated.current = true;
        // Replace: this page was itself reached by a location.replace, and the
        // back button should leave the app rather than bounce through it.
        navigate(suggestedPostLoginRoute(hasQuestions), { replace: true });
    }, [navigate, hasQuestions, isCheckingQuestions]);

    return (
        <div className="flex items-center justify-center min-h-screen">
            <div className="text-center">
                <h1 className="text-2xl font-bold mb-4">Logging in...</h1>
                <p className="text-gray-600 dark:text-gray-400">Redirecting you back to the app...</p>
            </div>
        </div>
    );
}
