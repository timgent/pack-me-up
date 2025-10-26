import { useEffect, useState, useCallback } from 'react'
import { useForm, SubmitHandler, useFieldArray, useWatch } from "react-hook-form"
import { useDebouncedCallback } from 'use-debounce'
import { PackingListQuestionSet, newDraftQuestion } from '../edit-questions/types'
import { packingAppDb } from '../services/database'
import { DatabaseMigration } from '../services/migration'
import { QuestionSection } from '../edit-questions/question-section'
import { PeopleSection } from '../edit-questions/people-section'
import { Button } from '../components/Button'
import { useToast } from '../components/ToastContext'
import { AlwaysNeededItemsSection } from '../edit-questions/always-needed-items-section'
import { Modal } from '../components/Modal'
import { exampleData } from '../edit-questions/example-data'
import { Callout } from '../components/Callout'
import { useSolidPod } from '../components/SolidPodContext'
import { usePodSync } from '../hooks/usePodSync'
import { useSyncCoordinator } from '../hooks/useSyncCoordinator'
import { POD_CONTAINERS } from '../services/solidPod'

export function EditQuestionsForm() {

  const { register, control, handleSubmit, setValue, watch, reset, getValues } = useForm<PackingListQuestionSet>({
    defaultValues: { questions: [], people: [{ id: crypto.randomUUID(), name: "Me" }], alwaysNeededItems: [] }
  });
  const [rev, setRev] = useState<string | undefined>(undefined)
  const [isExampleModalOpen, setIsExampleModalOpen] = useState(false)
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const { fields: peopleFields, append: appendPeople, remove: removePeople } = useFieldArray({
    control,
    name: "people"
  });
  const { showToast } = useToast();
  const { isLoggedIn } = useSolidPod();

  // Watch all form values for auto-save
  const watchedFormValues = useWatch({ control });

  const [currentQuestionSet, setCurrentQuestionSet] = useState<PackingListQuestionSet | null>(null);

  console.log("EditQuestionsForm - isLoggedIn:", isLoggedIn);

  // Set up sync coordination (handles conflict resolution, focus preservation, etc.)
  const { syncingFromPod, handleSyncSuccess, handleSyncError, saveWithSyncPrevention } =
    useSyncCoordinator<PackingListQuestionSet>({
      currentData: currentQuestionSet,
      saveToLocalDb: async (data) => {
        const docToWrite = {
          _id: "1",
          ...data,
          _rev: rev,
        };
        return await packingAppDb.saveQuestionSet(docToWrite);
      },
      updateFormAndState: (data, newRev) => {
        const updatedData = {
          ...data,
          _rev: newRev
        };
        setRev(newRev);
        setCurrentQuestionSet(updatedData);
        reset(updatedData);
      },
      conflictStrategy: 'fallback-to-pod', // Pod wins if local has no timestamp (handles fresh loads)
    });

  // Callback when save to Pod succeeds
  const handleSaveSuccess = useCallback(() => {
    console.log('Saved to Pod successfully');
  }, []);

  // Callback when save to Pod fails
  const handleSaveError = useCallback((error: string) => {
    console.error('Save to Pod error:', error);
    showToast(`Failed to save to Pod: ${error}`, 'error');
  }, [showToast]);

  // Set up automatic Pod sync with polling
  const { lastSync, isSyncing, error: syncError, saveToPod } = usePodSync<PackingListQuestionSet>({
    pathConfig: {
      container: POD_CONTAINERS.ROOT,
      filename: 'packing-list-questions.json'
    },
    pollInterval: 5000, // Poll every 5 seconds for faster sync
    enabled: isLoggedIn, // Only sync when logged in
    onSyncSuccess: handleSyncSuccess,
    onSyncError: handleSyncError,
    onSaveSuccess: handleSaveSuccess,
    onSaveError: handleSaveError,
  });

  // Auto-save handler with debouncing
  const handleAutoSave = useDebouncedCallback(async () => {
    const currentData = getValues();

    // Skip if there's no data yet or we're syncing from Pod
    if (!currentQuestionSet) {
      console.log('handleAutoSave: currentQuestionSet is null, skipping');
      return;
    }

    try {
      // Check if data has actually changed
      const currentDataString = JSON.stringify(currentData);
      const lastDataString = JSON.stringify(currentQuestionSet);

      if (currentDataString === lastDataString) {
        console.log('handleAutoSave: No changes detected, skipping save');
        return;
      }

      console.log('handleAutoSave: Changes detected, auto-saving...');
      setAutoSaveStatus('saving');

      // Prepare data with ID
      const dataToSave = {
        _id: "1",
        ...currentData,
        _rev: rev,
      };

      // If logged in, use saveWithSyncPrevention (handles local + Pod save)
      if (isLoggedIn) {
        const savedData = await saveWithSyncPrevention(dataToSave, saveToPod);
        if (savedData) {
          setRev(savedData._rev);
          setCurrentQuestionSet(savedData);
          console.log('handleAutoSave: Saved to local DB and Pod');
        }
      } else {
        // Not logged in, just save locally
        const dataWithTimestamp = {
          ...dataToSave,
          lastModified: new Date().toISOString()
        };
        const result = await packingAppDb.saveQuestionSet(dataWithTimestamp);
        const savedData = {
          ...dataWithTimestamp,
          _rev: result.rev
        };
        setRev(result.rev);
        setCurrentQuestionSet(savedData);
        console.log('handleAutoSave: Saved to local DB');
      }

      setAutoSaveStatus('saved');
      setTimeout(() => setAutoSaveStatus('idle'), 2000); // Show "saved" for 2 seconds
    } catch (error) {
      console.error('handleAutoSave: Error saving:', error);
      setAutoSaveStatus('error');
      showToast('Auto-save failed. Please try again.', 'error');
    }
  }, 800); // 800ms debounce to batch rapid changes

  // Trigger auto-save when form values change
  useEffect(() => {
    console.log('=== AUTO-SAVE EFFECT TRIGGERED ===', {
      hasCurrentQuestionSet: !!currentQuestionSet,
      watchedFormValues: watchedFormValues
    });
    if (currentQuestionSet) {
      console.log('Calling handleAutoSave...');
      handleAutoSave();
    } else {
      console.log('Skipping handleAutoSave - currentQuestionSet is null');
    }
  }, [watchedFormValues, handleAutoSave]);

  const removePerson = (removedIndex: number) => {
    // We need this wrapper for removing people to correctly removed the check boxes for that person
    getValues("questions").forEach((_question, questionIndex) => {
      getValues(`questions.${questionIndex}.options`).forEach((_option, optionIndex) => {
        getValues(`questions.${questionIndex}.options.${optionIndex}.items`).forEach((_item, itemIndex) => {
          const currentPersonSelections = getValues(`questions.${questionIndex}.options.${optionIndex}.items.${itemIndex}.personSelections`)
          currentPersonSelections.splice(removedIndex, 1)
        })
      })
    })
    removePeople(removedIndex)
  }

  const people = watch("people")

  useEffect(() => {
    const loadQuestionSet = async () => {
      console.log("Starting document load sequence")

      try {
        // Check if migration is needed
        const migrationCheck = await DatabaseMigration.checkMigrationNeeded()
        if (migrationCheck.needed) {
          console.log('Migration needed, performing automatic migration')
          const migrationResult = await DatabaseMigration.performMigration()
          if (!migrationResult.success) {
            console.error('Migration failed:', migrationResult.errors)
            showToast('Database migration failed', 'error')
            return
          }
          showToast('Database migrated successfully', 'success')
        }

        const doc = await packingAppDb.getQuestionSet()
        console.log("Document retrieved successfully:", {
          _id: doc._id,
          _rev: doc._rev,
          timestamp: new Date().toISOString()
        })
        setRev(doc._rev)
        setCurrentQuestionSet(doc)
        reset(doc)
      } catch (err: any) {
        console.log("Initial get error:", {
          name: err.name,
          message: err.message,
          timestamp: new Date().toISOString()
        })
        if (err.name === 'not_found') {
          console.log('No data yet, creating new doc')
          const newDoc = {
            _id: "1",
            questions: [],
            people: [{ id: crypto.randomUUID(), name: "Me" }],
            alwaysNeededItems: []
          }
          console.log("Attempting to create new doc:", {
            doc: newDoc,
            timestamp: new Date().toISOString()
          })
          try {
            const result = await packingAppDb.saveQuestionSet(newDoc)
            console.log("Document created successfully:", {
              rev: result.rev,
              timestamp: new Date().toISOString()
            })
            const savedNewDoc = {
              ...newDoc,
              _rev: result.rev
            };
            setRev(result.rev)
            setCurrentQuestionSet(savedNewDoc)
            reset(newDoc)
          } catch (putErr: any) {
            console.error('Error creating new doc:', {
              name: putErr.name,
              message: putErr.message,
              timestamp: new Date().toISOString()
            })
            showToast('Failed to initialize database', 'error')
          }
        } else {
          console.error('Error loading doc:', err)
          showToast('Failed to load data', 'error')
        }
      }
    }

    loadQuestionSet()
  }, [])

  const { fields: questionFields, append: appendQuestion, remove: removeQuestion } = useFieldArray({
    control,
    name: "questions"
  });

  const onSubmit: SubmitHandler<PackingListQuestionSet> = async (data) => {
    try {
      // Prepare data with ID
      const dataToSave = {
        _id: "1",
        ...data,
        _rev: rev,
      };

      // If logged in, use saveWithSyncPrevention (handles local + Pod save)
      if (isLoggedIn) {
        const savedData = await saveWithSyncPrevention(dataToSave, saveToPod);
        if (savedData) {
          setRev(savedData._rev);
          setCurrentQuestionSet(savedData);
        }
      } else {
        // Not logged in, just save locally
        const dataWithTimestamp = {
          ...dataToSave,
          lastModified: new Date().toISOString()
        };
        const result = await packingAppDb.saveQuestionSet(dataWithTimestamp);
        const savedData = {
          ...dataWithTimestamp,
          _rev: result.rev
        };
        setRev(result.rev);
        setCurrentQuestionSet(savedData);
      }

      showToast('Changes saved successfully!', 'success');
    } catch (error) {
      console.error('Error saving changes:', error);
      showToast('Failed to save changes. Please try again.', 'error');
    }
  };

  const handleLoadExample = (exampleName: string) => {
    const data = exampleData[exampleName as keyof typeof exampleData];
    if (data) {
      const dataWithRev = { ...data, _rev: rev };
      reset(dataWithRev);
      setCurrentQuestionSet(dataWithRev);
      setIsExampleModalOpen(false);
      showToast('Example loaded successfully!', 'success');
    }
  };

  const isFormEmpty = questionFields.length === 0 && people.length === 1 && getValues("alwaysNeededItems").length === 0;

  // Format last sync time for display
  const formatLastSync = (date: Date | null) => {
    if (!date) return 'Never';
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSecs = Math.floor(diffMs / 1000);

    if (diffSecs < 60) return 'Just now';
    if (diffSecs < 120) return '1 minute ago';
    if (diffSecs < 3600) return `${Math.floor(diffSecs / 60)} minutes ago`;
    return date.toLocaleTimeString();
  };

  return (
    <div className="w-full flex flex-col items-center py-8 px-4">
      <div className="mb-8 w-full max-w-5xl">
        <h1 className="text-2xl font-bold text-gray-900">Packing List Questions</h1>
        <p className="mt-2 text-gray-600">Create and manage your packing list questions and options.</p>
      </div>
      {isFormEmpty && (
        <div className="w-full max-w-5xl mb-8">
          <Callout
            title="Get Started with Example Questions"
            description="Your form is empty. Load an example to see how questions and options work, or start building your own from scratch."
            action={{
              label: "Load Example",
              onClick: () => setIsExampleModalOpen(true)
            }}
          />
        </div>
      )}
      <div className="w-full max-w-5xl flex flex-col lg:flex-row lg:items-start lg:gap-8">
        {/* Main form content */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 flex-1 pb-32 lg:pb-8" id="edit-questions-form">
          <PeopleSection
            control={control}
            register={register}
            fields={peopleFields}
            append={appendPeople}
            remove={removePerson}
          />
          <AlwaysNeededItemsSection
            control={control}
            register={register}
            watch={watch}
            setValue={setValue}
            people={people}
          />
          {questionFields.map((question, questionIndex) => (
            <QuestionSection
              key={question.id}
              questionIndex={questionIndex}
              control={control}
              register={register}
              watch={watch}
              setValue={setValue}
              removeQuestion={() => removeQuestion(questionIndex)}
              people={people}
            />
          ))}
          {/* Add Question button at bottom of form - only visible on large screens */}
          <div className="hidden lg:block">
            <Button
              type="button"
              onClick={() => appendQuestion(newDraftQuestion(questionFields.length))}
              variant="secondary"
            >
              Add Question
            </Button>
          </div>
        </form>
        {/* Sticky sidebar for large screens */}
        <div className="hidden lg:block lg:w-64 lg:sticky lg:top-24 flex-shrink-0">
          <div className="backdrop-blur-md bg-white/80 border border-gray-200 shadow-xl rounded-xl flex flex-col items-stretch gap-4 py-6 px-4 relative">
            {/* Sync from Pod indicator - absolutely positioned to avoid layout shift */}
            {isLoggedIn && syncingFromPod && (
              <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 z-10 bg-blue-50 border border-blue-200 rounded-md px-3 py-1.5 flex items-center gap-1.5 shadow-md">
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                <span className="text-xs text-blue-700 font-medium whitespace-nowrap">Syncing from Pod...</span>
              </div>
            )}

            {/* Auto-save Status */}
            <div className="bg-gray-50 border border-gray-200 rounded-md p-3">
              <p className="text-xs font-semibold text-gray-700 mb-2">Auto-Save Status</p>
              <div className={`flex items-center gap-2 transition-opacity duration-200 ${autoSaveStatus === 'idle' ? 'opacity-60' : 'opacity-100'}`}>
                {autoSaveStatus === 'saving' && (
                  <>
                    <div className="animate-spin h-3 w-3 border-2 border-blue-500 border-t-transparent rounded-full"></div>
                    <span className="text-xs text-blue-600">Saving...</span>
                  </>
                )}
                {autoSaveStatus === 'saved' && (
                  <>
                    <div className="h-3 w-3 flex items-center justify-center text-green-500">✓</div>
                    <span className="text-xs text-green-600">Saved</span>
                  </>
                )}
                {autoSaveStatus === 'error' && (
                  <>
                    <div className="h-3 w-3 flex items-center justify-center text-red-500">✗</div>
                    <span className="text-xs text-red-600">Error</span>
                  </>
                )}
                {autoSaveStatus === 'idle' && (
                  <>
                    <div className="h-3 w-3 flex items-center justify-center text-gray-500">✓</div>
                    <span className="text-xs text-gray-600">All changes saved</span>
                  </>
                )}
              </div>
            </div>

            {isLoggedIn ? (
              <>
                {/* Pod Sync Status */}
                <div className="bg-gray-50 border border-gray-200 rounded-md p-3">
                  <p className="text-xs font-semibold text-gray-700 mb-1">Pod Sync Status</p>
                  <div className="flex items-center gap-2 mb-1">
                    {isSyncing ? (
                      <>
                        <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                        <p className="text-xs text-gray-600">Polling...</p>
                      </>
                    ) : syncError ? (
                      <>
                        <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                        <p className="text-xs text-red-600">Error</p>
                      </>
                    ) : (
                      <>
                        <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                        <p className="text-xs text-gray-600">Active</p>
                      </>
                    )}
                  </div>
                  <p className="text-xs text-gray-500">Last sync: {formatLastSync(lastSync)}</p>
                  {syncError && (
                    <p className="text-xs text-red-500 mt-1">{syncError}</p>
                  )}
                </div>
              </>
            ) : (
              <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
                <p className="text-xs text-gray-700 font-semibold mb-1">💡 Store in Your Pod</p>
                <p className="text-xs text-gray-600 mb-2">Login with Solid Pod to save your questions privately in storage you control.</p>
                <p className="text-xs text-blue-600">→ Click "Login with Solid Pod" above</p>
              </div>
            )}
            <Button
              type="button"
              onClick={() => appendQuestion(newDraftQuestion(questionFields.length))}
              variant="secondary"
            >
              Add Question
            </Button>
            <Button type="button" onClick={() => {
              const defaultData = { questions: [], people: [{ id: crypto.randomUUID(), name: "Me" }], alwaysNeededItems: [] };
              reset(defaultData);
              setCurrentQuestionSet(defaultData);
              showToast('Form has been reset to default state', 'success');
            }}>Reset form</Button>
            <Button
              type="button"
              onClick={() => setIsExampleModalOpen(true)}
              variant="secondary"
            >
              Load Example
            </Button>
          </div>
        </div>
      </div>
      {/* Sticky bottom bar for small/medium screens */}
      <div className="fixed bottom-0 left-0 w-full z-50 flex justify-center pointer-events-none lg:hidden">
        <div className="max-w-4xl w-full px-4 pb-4">
          <div className="backdrop-blur-md bg-white/80 border border-gray-200 shadow-xl rounded-xl flex flex-col gap-3 py-4 px-3 pointer-events-auto relative">
            {/* Sync from Pod indicator - absolutely positioned to avoid layout shift */}
            {isLoggedIn && syncingFromPod && (
              <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 z-10 bg-blue-50 border border-blue-200 rounded-md px-3 py-1.5 flex items-center gap-1.5 shadow-md">
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                <span className="text-xs text-blue-700 font-medium whitespace-nowrap">Syncing from Pod...</span>
              </div>
            )}

            {/* Auto-save Status */}
            <div className="bg-gray-50 border border-gray-200 rounded-md p-2 mx-2">
              <div className="flex items-center justify-between">
                <div className={`flex items-center gap-2 transition-opacity duration-200 ${autoSaveStatus === 'idle' ? 'opacity-60' : 'opacity-100'}`}>
                  {autoSaveStatus === 'saving' && (
                    <>
                      <div className="animate-spin h-3 w-3 border-2 border-blue-500 border-t-transparent rounded-full"></div>
                      <span className="text-xs text-blue-600">Auto-saving...</span>
                    </>
                  )}
                  {autoSaveStatus === 'saved' && (
                    <>
                      <div className="h-3 w-3 flex items-center justify-center text-green-500">✓</div>
                      <span className="text-xs text-green-600">Saved</span>
                    </>
                  )}
                  {autoSaveStatus === 'error' && (
                    <>
                      <div className="h-3 w-3 flex items-center justify-center text-red-500">✗</div>
                      <span className="text-xs text-red-600">Error</span>
                    </>
                  )}
                  {autoSaveStatus === 'idle' && (
                    <>
                      <div className="h-3 w-3 flex items-center justify-center text-gray-500">✓</div>
                      <span className="text-xs text-gray-600">All changes saved</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {isLoggedIn && (
              <div className="bg-gray-50 border border-gray-200 rounded-md p-2 mx-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {isSyncing ? (
                      <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                    ) : syncError ? (
                      <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                    ) : (
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    )}
                    <p className="text-xs text-gray-600">
                      {isSyncing ? 'Pod polling...' : `Pod synced ${formatLastSync(lastSync)}`}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {!isLoggedIn && (
              <div className="bg-blue-50 border border-blue-200 rounded-md p-2 mx-2">
                <p className="text-xs text-gray-700 font-semibold">💡 Login with Solid Pod to save privately</p>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3 justify-center">
            <Button
              type="button"
              onClick={() => appendQuestion(newDraftQuestion(questionFields.length))}
              variant="secondary"
            >
              Add Question
            </Button>
            <Button type="button" onClick={() => {
              const defaultData = { questions: [], people: [{ id: crypto.randomUUID(), name: "Me" }], alwaysNeededItems: [] };
              reset(defaultData);
              setCurrentQuestionSet(defaultData);
              showToast('Form has been reset to default state', 'success');
            }}>Reset form</Button>
            <Button
              type="button"
              onClick={() => setIsExampleModalOpen(true)}
              variant="secondary"
            >
              Load Example
            </Button>
            </div>
          </div>
        </div>
      </div>

      <Modal
        isOpen={isExampleModalOpen}
        onClose={() => setIsExampleModalOpen(false)}
        title="Load Example"
      >
        <div className="space-y-2">
          {Object.keys(exampleData).map((exampleName) => (
            <button
              key={exampleName}
              onClick={() => handleLoadExample(exampleName)}
              className="w-full text-left px-4 py-2 hover:bg-gray-100 rounded-md transition-colors"
            >
              {exampleName}
            </button>
          ))}
        </div>
      </Modal>
    </div>
  )
} 
