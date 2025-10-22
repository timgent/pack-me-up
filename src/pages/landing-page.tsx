import { Link } from 'react-router-dom'
import { useSolidPod } from '../components/SolidPodContext'

export const LandingPage = () => {
    const { isLoggedIn, webId } = useSolidPod()
    return (
        <>
            {isLoggedIn && (
                <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
                    <p className="text-green-800">
                        Logged in as: <span className="font-semibold">{webId}</span>
                    </p>
                </div>
            )}
            <div className="max-w-4xl mx-auto">
                <div className="text-center mb-12">
                    <h1 className="text-4xl font-bold mb-4">Smart Packing Made Simple</h1>
                    <p className="text-xl text-gray-600">
                        Never forget an essential item again. Create personalized packing lists based on your specific needs.
                    </p>
                </div>

                <div className="grid md:grid-cols-2 gap-8 mb-12">
                    <div className="bg-white p-6 rounded-lg shadow-md">
                        <h2 className="text-2xl font-semibold mb-3">Smart Questionnaires</h2>
                        <p className="text-gray-600 mb-4">
                            Answer a few simple questions about your trip, and we'll generate a customized packing list tailored to your needs.
                        </p>
                    </div>

                    <div className="bg-white p-6 rounded-lg shadow-md">
                        <h2 className="text-2xl font-semibold mb-3">Save & Reuse Lists</h2>
                        <p className="text-gray-600 mb-4">
                            Save your packing lists for future trips and easily modify them for different occasions.
                        </p>
                    </div>

                    <div className="bg-white p-6 rounded-lg shadow-md">
                        <h2 className="text-2xl font-semibold mb-3">Customizable Items</h2>
                        <p className="text-gray-600 mb-4">
                            Add, remove, or modify items to perfectly match your packing requirements.
                        </p>
                    </div>

                    <div className="bg-white p-6 rounded-lg shadow-md">
                        <h2 className="text-2xl font-semibold mb-3">Easy to Use</h2>
                        <p className="text-gray-600 mb-4">
                            Simple and intuitive interface that makes packing preparation a breeze.
                        </p>
                    </div>

                    <div className="bg-blue-50 p-6 rounded-lg shadow-md border-2 border-blue-200">
                        <h2 className="text-2xl font-semibold mb-3">Own Your Data</h2>
                        <p className="text-gray-600 mb-4">
                            Login with your Solid Pod to store your questions and lists in personal storage that you control. Your data stays private and portable.
                        </p>
                        {!isLoggedIn && (
                            <p className="text-sm text-blue-600 font-medium">
                                → Click "Login with Solid Pod" above to get started
                            </p>
                        )}
                    </div>
                </div>

                <div className="text-center">
                    <Link
                        to="/create-packing-list"
                        className="inline-block bg-blue-600 text-white px-8 py-3 rounded-lg text-lg font-semibold hover:bg-blue-700 transition-colors"
                    >
                        Create Your First Packing List
                    </Link>
                </div>
            </div>
        </>
    )
} 