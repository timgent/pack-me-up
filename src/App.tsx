import { HashRouter } from 'react-router-dom'
import { Route } from 'react-router-dom'
import { Routes } from 'react-router-dom'
import './App.css'
import { EditQuestionsForm } from './edit-questions/EditQuestionsForm'
import { CreatePackingList } from './create-packing-list/create-packing-list'
import { Navigation } from './components/Navigation'
import { PackingLists } from './packing-lists/packing-lists'
import { ViewPackingList } from './packing-lists/view-packing-list'

function App() {
  return (
    <>
      <HashRouter>
        <Navigation />
        <div className="container mx-auto px-4 py-8">
          <Routes>
            <Route path="/" element={<EditQuestionsForm />} />
            <Route path="/create-packing-list" element={<CreatePackingList />} />
            <Route path="/view-lists" element={<PackingLists />} />
            <Route path="/view-lists/:id" element={<ViewPackingList />} />
          </Routes>
        </div>
      </HashRouter>
    </>
  )
}

export default App
