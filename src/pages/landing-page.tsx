import { Link } from 'react-router-dom'
import { useSolidPod } from '../hooks/useSolidPod'

export const LandingPage = () => {
    const { isLoggedIn, webId } = useSolidPod()
    return (
        <>
            {isLoggedIn && (
                <div className="mb-6 p-4 bg-gradient-to-r from-success-50 to-primary-50 border-2 border-success-300 rounded-2xl shadow-soft animate-fade-in">
                    <p className="text-success-800 font-semibold">
                        🎉 Logged in as: <span className="font-bold">{webId}</span>
                    </p>
                </div>
            )}
            <div className="max-w-4xl mx-auto">
                <div className="text-center mb-12 animate-slide-up">
                    <h1 className="text-5xl font-bold mb-4 text-primary-900">
                        Smart Packing Made Simple
                    </h1>
                    <p className="text-xl text-gray-700 font-medium">
                        Never forget an essential item again. Create personalized packing lists based on your specific needs.
                    </p>
                </div>

                <div className="grid md:grid-cols-2 gap-6 mb-12">
                    <div className="bg-gradient-to-br from-primary-50 to-primary-100 p-6 rounded-2xl shadow-soft hover:shadow-glow-primary transition-all duration-300 hover:scale-105 border-2 border-primary-200">
                        <div className="text-3xl mb-2">📋</div>
                        <h2 className="text-2xl font-bold mb-3 text-primary-900">Smart Questionnaires</h2>
                        <p className="text-gray-700">
                            Answer a few simple questions about your trip, and we'll generate a customized packing list tailored to your needs.
                        </p>
                    </div>

                    <div className="bg-gradient-to-br from-secondary-50 to-secondary-100 p-6 rounded-2xl shadow-soft hover:shadow-glow-secondary transition-all duration-300 hover:scale-105 border-2 border-secondary-200">
                        <div className="text-3xl mb-2">💾</div>
                        <h2 className="text-2xl font-bold mb-3 text-secondary-900">Save & Reuse Lists</h2>
                        <p className="text-gray-700">
                            Save your packing lists for future trips and easily modify them for different occasions.
                        </p>
                    </div>

                    <div className="bg-gradient-to-br from-accent-50 to-accent-100 p-6 rounded-2xl shadow-soft hover:shadow-glow-accent transition-all duration-300 hover:scale-105 border-2 border-accent-200">
                        <div className="text-3xl mb-2">✏️</div>
                        <h2 className="text-2xl font-bold mb-3 text-accent-900">Customizable Items</h2>
                        <p className="text-gray-700">
                            Add, remove, or modify items to perfectly match your packing requirements.
                        </p>
                    </div>

                    <div className="bg-gradient-to-br from-success-50 to-success-100 p-6 rounded-2xl shadow-soft hover:shadow-lg transition-all duration-300 hover:scale-105 border-2 border-success-200">
                        <div className="text-3xl mb-2">✨</div>
                        <h2 className="text-2xl font-bold mb-3 text-success-900">Easy to Use</h2>
                        <p className="text-gray-700">
                            Simple and intuitive interface that makes packing preparation a breeze.
                        </p>
                    </div>

                    <div className="md:col-span-2 bg-primary-950 p-6 rounded-2xl shadow-glow-primary border-2 border-primary-800 text-white">
                        <div className="text-4xl mb-2">🔒</div>
                        <h2 className="text-2xl font-bold mb-3">Own Your Data</h2>
                        <p className="mb-4 text-white">
                            Login with your Solid Pod to store your questions and lists in personal storage that you control. Your data stays private and portable.
                        </p>
                        {!isLoggedIn && (
                            <p className="text-sm font-bold bg-white/20 backdrop-blur-sm px-4 py-2 rounded-xl inline-block">
                                → Click "Login with Solid Pod" above to get started
                            </p>
                        )}
                    </div>
                </div>

                <div className="text-center space-y-4">
                    <Link
                        to="/wizard"
                        className="inline-block bg-gradient-primary text-white px-8 py-4 rounded-2xl text-lg font-bold hover:scale-105 transition-all duration-200 shadow-soft hover:shadow-glow-primary"
                    >
                        ✨ Get Started with the Wizard
                    </Link>
                    <div className="text-gray-600">
                        or{' '}
                        <Link
                            to="/create-packing-list"
                            className="text-primary-700 font-semibold hover:underline"
                        >
                            create a packing list directly
                        </Link>
                    </div>
                </div>
            </div>
        </>
    )
} 