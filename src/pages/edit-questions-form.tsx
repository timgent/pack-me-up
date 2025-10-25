import { useEffect, useState, useRef } from 'react'
import { useForm, SubmitHandler, useFieldArray } from "react-hook-form"
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
import { POD_ERROR_MESSAGES } from '../services/solidPod'
import { useQuestionSetSync } from '../hooks/useQuestionSetSync'

export function EditQuestionsForm() {

  const { register, control, handleSubmit, setValue, watch, reset, getValues } = useForm<PackingListQuestionSet>({
    defaultValues: { questions: [], people: [{ id: crypto.randomUUID(), name: "Me" }], alwaysNeededItems: [] }
  });
  const [rev, setRev] = useState<string | undefined>(undefined)
  const [isExampleModalOpen, setIsExampleModalOpen] = useState(false)
  const { fields: peopleFields, append: appendPeople, remove: removePeople } = useFieldArray({
    control,
    name: "people"
  });
  const { showToast } = useToast();
  const { isLoggedIn } = useSolidPod();

  // Track if we're currently handling a local change to prevent sync loops
  const isLocalChangeRef = useRef(false);
  const lastSyncedDataRef = useRef<string | null>(null);

  console.log("EditQuestionsForm - isLoggedIn:", isLoggedIn);

  // Set up automatic Pod sync with polling
  const { lastSync, isSyncing, error: syncError, saveToPod, syncFromPod } = useQuestionSetSync({
    pollInterval: 10000, // Poll every 10 seconds
    enabled: isLoggedIn, // Only sync when logged in
    onSyncSuccess: (data) => {
      // Only update form if this isn't a local change we just made
      if (!isLocalChangeRef.current) {
        // Compare the incoming data with what we last synced
        const incomingDataString = JSON.stringify(data);

        // Only update if the data has actually changed
        if (lastSyncedDataRef.current !== incomingDataString) {
          console.log('Synced data from Pod - data has changed, updating form');

          // Save the currently focused element
          const activeElement = document.activeElement as HTMLElement;
          const activeElementId = activeElement?.id;
          const selectionStart = (activeElement as HTMLInputElement)?.selectionStart;
          const selectionEnd = (activeElement as HTMLInputElement)?.selectionEnd;

          // Preserve the current _rev for PouchDB
          data._rev = rev;
          reset(data);
          lastSyncedDataRef.current = incomingDataString;

          // Restore focus after a brief delay to allow the DOM to update
          setTimeout(() => {
            if (activeElementId) {
              const elementToFocus = document.getElementById(activeElementId) as HTMLInputElement;
              if (elementToFocus) {
                elementToFocus.focus();
                if (selectionStart !== null && selectionEnd !== null) {
                  elementToFocus.setSelectionRange(selectionStart, selectionEnd);
                }
              }
            }
          }, 0);
        } else {
          console.log('Synced data from Pod - no changes detected');
        }
      }
    },
    onSyncError: (error) => {
      console.error('Sync error:', error);
      // Don't show toast for errors - too noisy for automatic sync
    },
    onSaveSuccess: () => {
      console.log('Saved to Pod successfully');
      // Update the last synced data ref
      const currentData = getValues();
      lastSyncedDataRef.current = JSON.stringify(currentData);
    },
    onSaveError: (error) => {
      console.error('Save to Pod error:', error);
      showToast(`Failed to save to Pod: ${error}`, 'error');
    },
  });

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
        reset(doc)
        // Initialize the lastSyncedDataRef with the loaded data
        lastSyncedDataRef.current = JSON.stringify(doc)
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
            setRev(result.rev)
            reset(newDoc)
            // Initialize the lastSyncedDataRef with the new doc
            lastSyncedDataRef.current = JSON.stringify(newDoc)
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
      // Save to local PouchDB first
      const docToWrite = {
        _id: "1",
        ...data,
        _rev: rev,
      }
      const result = await packingAppDb.saveQuestionSet(docToWrite);
      setRev(result.rev)

      // If logged in, also save to Pod automatically
      if (isLoggedIn) {
        isLocalChangeRef.current = true;
        await saveToPod(data);
        // Reset the flag after a short delay to allow sync to complete
        setTimeout(() => {
          isLocalChangeRef.current = false;
        }, 2000);
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
      data._rev = rev;
      reset(data);
      // Update the lastSyncedDataRef when loading example
      lastSyncedDataRef.current = JSON.stringify(data);
      setIsExampleModalOpen(false);
      showToast('Example loaded successfully!', 'success');
    }
  };

  const handleSaveToPod = async () => {
    if (!isLoggedIn) {
      showToast(POD_ERROR_MESSAGES.NOT_LOGGED_IN, 'error');
      return;
    }

    try {
      const data = getValues();
      isLocalChangeRef.current = true;
      await saveToPod(data);
      // Reset the flag after a short delay
      setTimeout(() => {
        isLocalChangeRef.current = false;
      }, 2000);
      showToast('Successfully saved to Solid Pod!', 'success');
    } catch (error) {
      console.error('Error saving to pod:', error);
      showToast(POD_ERROR_MESSAGES.SAVE_FAILED, 'error');
    }
  };

  const handleLoadFromPod = async () => {
    if (!isLoggedIn) {
      showToast(POD_ERROR_MESSAGES.NOT_LOGGED_IN_LOAD, 'error');
      return;
    }

    try {
      // Force a manual sync - this will trigger onSyncSuccess which handles the update
      await syncFromPod();
      // Show success toast for manual sync only
      showToast('Questions synced from Pod!', 'success');
    } catch (error) {
      console.error('Error loading from pod:', error);
      showToast(POD_ERROR_MESSAGES.LOAD_FAILED, 'error');
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
          <div className="backdrop-blur-md bg-white/80 border border-gray-200 shadow-xl rounded-xl flex flex-col items-stretch gap-4 py-6 px-4">
            {isLoggedIn ? (
              <>
                {/* Sync Status */}
                <div className="bg-gray-50 border border-gray-200 rounded-md p-3">
                  <p className="text-xs font-semibold text-gray-700 mb-1">Auto-Sync Status</p>
                  <div className="flex items-center gap-2 mb-1">
                    {isSyncing ? (
                      <>
                        <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                        <p className="text-xs text-gray-600">Syncing...</p>
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
                <Button
                  type="button"
                  onClick={handleSaveToPod}
                  variant="secondary"
                >
                  Save to Pod
                </Button>
                <Button
                  type="button"
                  onClick={handleLoadFromPod}
                  variant="secondary"
                  disabled={isSyncing}
                >
                  {isSyncing ? 'Syncing...' : 'Sync Now'}
                </Button>
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
            <Button type="submit" form="edit-questions-form">
              Save Changes
            </Button>
            <Button type="button" onClick={() => {
              reset({ questions: [], people: [{ id: crypto.randomUUID(), name: "Me" }], alwaysNeededItems: [] });
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
          <div className="backdrop-blur-md bg-white/80 border border-gray-200 shadow-xl rounded-xl flex flex-col gap-3 py-4 px-3 pointer-events-auto">
            {isLoggedIn ? (
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
                      {isSyncing ? 'Syncing...' : `Synced ${formatLastSync(lastSync)}`}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-blue-50 border border-blue-200 rounded-md p-2 mx-2">
                <p className="text-xs text-gray-700 font-semibold">💡 Login with Solid Pod to save privately</p>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-3 justify-center">
            {isLoggedIn && (
              <>
                <Button
                  type="button"
                  onClick={handleSaveToPod}
                  variant="secondary"
                >
                  Save to Pod
                </Button>
                <Button
                  type="button"
                  onClick={handleLoadFromPod}
                  variant="secondary"
                  disabled={isSyncing}
                >
                  {isSyncing ? 'Syncing...' : 'Sync Now'}
                </Button>
              </>
            )}
            <Button
              type="button"
              onClick={() => appendQuestion(newDraftQuestion(questionFields.length))}
              variant="secondary"
            >
              Add Question
            </Button>
            <Button type="submit" form="edit-questions-form">
              Save Changes
            </Button>
            <Button type="button" onClick={() => {
              reset({ questions: [], people: [{ id: crypto.randomUUID(), name: "Me" }], alwaysNeededItems: [] });
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
