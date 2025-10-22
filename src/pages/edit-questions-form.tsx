import { useEffect, useState } from 'react'
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
import { getPodUrlAll, saveFileInContainer, getFile, overwriteFile } from '@inrupt/solid-client'

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
  const { isLoggedIn, session } = useSolidPod();

  console.log("EditQuestionsForm - isLoggedIn:", isLoggedIn);

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
      const docToWrite = {
        _id: "1",
        ...data,
        _rev: rev,
      }
      const result = await packingAppDb.saveQuestionSet(docToWrite);
      setRev(result.rev)
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
      setIsExampleModalOpen(false);
      showToast('Example loaded successfully!', 'success');
    }
  };

  const handleSaveToPod = async () => {
    if (!session || !session.info.isLoggedIn || !session.info.webId) {
      showToast('You must be logged in to save to Pod', 'error');
      return;
    }

    try {
      // Get the user's pod URLs
      const podUrls = await getPodUrlAll(session.info.webId, { fetch: session.fetch });

      if (!podUrls || podUrls.length === 0) {
        showToast('No pod found for your account', 'error');
        return;
      }

      // Use the first pod
      const podUrl = podUrls[0];
      const containerUrl = `${podUrl}pack-me-up/`;

      // Get current form data
      const data = getValues();
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const file = new File([blob], 'packing-list-questions.json', { type: 'application/json' });

      console.log(`Saving file to container: ${containerUrl}`);

      // Try saveFileInContainer first
      try {
        const savedFile = await saveFileInContainer(
          containerUrl,
          file,
          {
            fetch: session.fetch,
            slug: 'packing-list-questions.json'
          }
        );
        console.log('File saved at:', savedFile.internal_resourceInfo.sourceIri);
      } catch (saveError: any) {
        // If we get 404 or 409, use overwriteFile instead
        if (saveError.statusCode === 404 || saveError.statusCode === 409) {
          console.log(`Container issue (${saveError.statusCode}), using overwriteFile...`);
          const fileUrl = `${containerUrl}packing-list-questions.json`;
          await overwriteFile(fileUrl, blob, {
            fetch: session.fetch,
            contentType: 'application/json'
          });
          console.log('File saved at:', fileUrl);
        } else {
          throw saveError;
        }
      }

      showToast('Successfully saved to Solid Pod!', 'success');
    } catch (error) {
      console.error('Error saving to pod:', error);
      showToast('Failed to save to Pod. Please try again.', 'error');
    }
  };

  const handleLoadFromPod = async () => {
    if (!session || !session.info.isLoggedIn || !session.info.webId) {
      showToast('You must be logged in to load from Pod', 'error');
      return;
    }

    try {
      // Get the user's pod URLs
      const podUrls = await getPodUrlAll(session.info.webId, { fetch: session.fetch });

      if (!podUrls || podUrls.length === 0) {
        showToast('No pod found for your account', 'error');
        return;
      }

      // Use the first pod
      const podUrl = podUrls[0];
      const fileUrl = `${podUrl}pack-me-up/packing-list-questions.json`;

      console.log(`Loading from pod: ${fileUrl}`);

      // Get the file from the pod
      const file = await getFile(fileUrl, { fetch: session.fetch });

      // Read the file content
      const text = await file.text();
      const data = JSON.parse(text) as PackingListQuestionSet;

      // Preserve the current revision
      data._rev = rev;

      // Load the data into the form
      reset(data);
      showToast('Questions loaded from Pod successfully!', 'success');
    } catch (error) {
      console.error('Error loading from pod:', error);
      showToast('Failed to load from Pod. Please try again.', 'error');
    }
  };

  const isFormEmpty = questionFields.length === 0 && people.length === 1 && getValues("alwaysNeededItems").length === 0;

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
                >
                  Load from Pod
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
      {/* Sticky bottom bar for small/medium screens */}
      <div className="fixed bottom-0 left-0 w-full z-50 flex justify-center pointer-events-none lg:hidden">
        <div className="max-w-4xl w-full px-4 pb-4">
          <div className="backdrop-blur-md bg-white/80 border border-gray-200 shadow-xl rounded-xl flex flex-wrap items-center gap-4 justify-center py-4 pointer-events-auto">
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
                >
                  Load from Pod
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
