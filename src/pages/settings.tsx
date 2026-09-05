import { ThemeChoice } from '../components/ThemeChoice'

/**
 * The app's preferences, reachable in every state the app has.
 *
 * It exists because the theme control had to leave the nav bar (#337) and the
 * account menu could not take it: that menu only exists once you are signed in,
 * so putting the only theme control there would leave a signed-out user with no
 * way to change it at all. A route is reachable signed in or out, on a phone or
 * a desktop — from the footer, the account menu and the mobile menu alike.
 *
 * Nothing here needs a session; anything that does belongs in the account menu.
 */
export const SettingsPage = () => {
    return (
        <div className="max-w-3xl mx-auto bg-white/60 dark:bg-gray-900/60 rounded-2xl shadow-soft p-6 md:p-10 space-y-6">
            <h1 className="text-3xl font-bold text-primary-900 dark:text-primary-200">Settings</h1>

            <section className="space-y-3">
                <h2 className="text-xl font-bold text-primary-900 dark:text-primary-200">Appearance</h2>
                <p className="text-gray-700 dark:text-gray-300">
                    Choose how Pack Me Up looks. <strong>System</strong> follows your device's
                    setting and keeps following it as it changes — including when your device
                    switches to dark in the evening.
                </p>
                <ThemeChoice />
            </section>
        </div>
    )
}
