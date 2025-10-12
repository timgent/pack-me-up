import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export const SolidPodHandleRedirectPage = () => {
    const navigate = useNavigate();

    useEffect(() => {
        // Get the returnTo parameter from the URL
        const params = new URLSearchParams(window.location.search);
        const returnTo = params.get("returnTo") || "/";

        // Redirect to the return route
        navigate(returnTo);
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