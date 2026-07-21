const LAST_UPDATED = '21 July 2026'

export const PrivacyPolicyPage = () => {
    return (
        <div className="max-w-3xl mx-auto bg-white/60 rounded-2xl shadow-soft p-6 md:p-10 space-y-6">
            <div>
                <h1 className="text-3xl font-bold text-primary-900 mb-1">Privacy Policy</h1>
                <p className="text-sm text-gray-500">Last updated: {LAST_UPDATED}</p>
            </div>

            <p className="text-gray-700">
                Pack Me Up ("the app") helps you build and manage packing lists for your trips. This
                policy explains what information the app handles, where it is stored, and who can see it.
            </p>

            <section className="space-y-2">
                <h2 className="text-xl font-bold text-primary-900">Information you provide</h2>
                <p className="text-gray-700">
                    The app stores the packing questions, items, and packing lists you create, including
                    any trip or traveller details you choose to enter (such as names or age brackets for
                    the people you're packing for). This information is provided directly by you and is
                    used only to generate and display your packing lists.
                </p>
            </section>

            <section className="space-y-2">
                <h2 className="text-xl font-bold text-primary-900">Where your data is stored</h2>
                <p className="text-gray-700">
                    By default, your data is stored locally on your device, in your browser's or app's
                    local storage. It is not sent to any server we control.
                </p>
                <p className="text-gray-700">
                    If you choose to log in with a Solid Pod, your data is also saved to the personal Pod
                    you connect — storage that you own and control, hosted by the Pod provider you select.
                    We do not have our own servers that store your packing data; the app talks directly to
                    your Pod. You can revoke access or delete your data from your Pod at any time through
                    your Pod provider.
                </p>
                <p className="text-gray-700">
                    If you use the sharing feature, the packing lists or questions you choose to share are
                    made accessible to the specific people you share them with, via your Pod's access
                    controls.
                </p>
            </section>

            <section className="space-y-2">
                <h2 className="text-xl font-bold text-primary-900">Analytics and error reporting</h2>
                <p className="text-gray-700">
                    We use privacy-friendly, cookie-free analytics to understand overall app usage (such as
                    which pages are visited), and an error-reporting tool to help us diagnose crashes and
                    bugs. Error reports may include technical details like error messages, stack traces,
                    and device/browser information, but do not include the contents of your packing lists.
                </p>
            </section>

            <section className="space-y-2">
                <h2 className="text-xl font-bold text-primary-900">What we don't do</h2>
                <p className="text-gray-700">
                    We do not sell your data, and we do not use your packing list contents for advertising.
                    We do not have accounts or passwords of our own — authentication, when used, is handled
                    by your chosen Solid Pod provider.
                </p>
            </section>

            <section className="space-y-2">
                <h2 className="text-xl font-bold text-primary-900">Children's privacy</h2>
                <p className="text-gray-700">
                    The app is not directed at children and is not designed to knowingly collect personal
                    information from children.
                </p>
            </section>

            <section className="space-y-2">
                <h2 className="text-xl font-bold text-primary-900">Changes to this policy</h2>
                <p className="text-gray-700">
                    We may update this policy from time to time. Changes will be posted on this page with
                    an updated "Last updated" date.
                </p>
            </section>

            <section className="space-y-2">
                <h2 className="text-xl font-bold text-primary-900">Contact us</h2>
                <p className="text-gray-700">
                    If you have questions about this policy or your data, contact us at{' '}
                    <a
                        href="mailto:tim.packmeup@gmail.com"
                        className="font-semibold text-primary-700 underline hover:text-primary-900"
                    >
                        tim.packmeup@gmail.com
                    </a>
                    .
                </p>
            </section>
        </div>
    )
}
