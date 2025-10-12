import { Button } from "./Button"
import {
    login,
    handleIncomingRedirect,
    getDefaultSession,
    fetch,
} from "@inrupt/solid-client-authn-browser";



export const SolidPodLoginForm = () => {
    const selectedIdp = "https://login.inrupt.com"
    const handleLogin = () => {
        return login({
            oidcIssuer: selectedIdp,
            redirectUrl: new URL("/pod-auth-callback.html", window.location.href).toString(),
            clientName: "Pack Me Up",
        });
    }
    return (
        <>
            <h1 className="text-xl p-2">Solid Pod Login Form</h1>
            <Button onClick={handleLogin}>Login</Button>
        </>
    )
}
