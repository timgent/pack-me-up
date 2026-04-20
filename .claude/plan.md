# Plan: Fix non-functional X button on "Questions Generated Successfully!" modal (Issue #136)

## Issue summary
The success modal shown after AI question generation has an X close button (top-right) that does nothing when clicked. Users expect the modal to dismiss but it stays open, with no way to close it via the X.

## Root cause / approach
In `src/pages/wizard.tsx` line 276, the Modal's `onClose` prop is wired to an empty function `() => {}` instead of `() => setShowSuccessModal(false)`. The Modal component itself correctly calls `onClose` when the X button is clicked — the parent just ignores the event.

Fix: pass `() => setShowSuccessModal(false)` as `onClose`.

## Files to modify
- `src/pages/wizard.tsx` — line 276: change `onClose={() => {}}` to `onClose={() => setShowSuccessModal(false)}`
- `src/pages/wizard.test.tsx` — add a test verifying the X button closes the modal

## TDD steps

### 1. Red — add failing test
In `wizard.test.tsx`, after the existing "shows success modal" test, add:

```tsx
it('closes the success modal when the X button is clicked', async () => {
    const db = makeDb()
    mockUseDatabase.mockReturnValue({ db: db as unknown as PackingAppDatabase })
    mockUseWizardGeneration.mockReturnValue({
        isLoading: false,
        isSuccess: true,
        generateAndSave: vi.fn(),
    })

    render(
        <MemoryRouter>
            <Wizard />
        </MemoryRouter>
    )

    await waitFor(() =>
        expect(screen.getByText(/questions generated successfully/i)).toBeTruthy()
    )

    const closeButton = screen.getByRole('button', { name: /close/i })
    closeButton.click()

    await waitFor(() =>
        expect(screen.queryByText(/questions generated successfully/i)).toBeNull()
    )
})
```

Run `npm test` — this test should **fail** because `onClose={() => {}}` does not close the modal.

### 2. Green — fix the bug
In `src/pages/wizard.tsx` line 276, change:
```tsx
onClose={() => {}}
```
to:
```tsx
onClose={() => setShowSuccessModal(false)}
```

Run `npm test` — the new test (and all existing tests) should now **pass**.

### 3. Refactor
No structural cleanup needed; the fix is minimal and self-contained.

## Verification
Run `npm test` — all tests pass.
