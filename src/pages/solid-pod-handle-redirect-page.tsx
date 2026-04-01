import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export const AUTH_RETURN_TO_KEY = "authReturnTo";

export const SolidPodHandleRedirectPage = () => {
    const navigate = useNavigate();

    useEffect(() => {
        const storedRoute = sessionStorage.getItem(AUTH_RETURN_TO_KEY);
        if (storedRoute) {
            sessionStorage.removeItem(AUTH_RETURN_TO_KEY);
            navigate(storedRoute);
            return;
        }

        // Fallback: use returnTo from URL params (covers cases where sessionStorage was not set)
        const params = new URLSearchParams(window.location.search);
        navigate(params.get("returnTo") || "/");
    }, [navigate]);

    return (
        <div className="flex items-center justify-center min-h-screen">
            <div className="text-center">
                <h1 className="text-2xl font-bold mb-4">Logging in...</h1>
                <p className="text-gray-600">Redirecting you back to the app...</p>
            </div>
        </div>
    );
}