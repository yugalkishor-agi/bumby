# Codebase conventions

Rules that the service, type and UI layers are expected to follow. Anything
listed here has been applied to the code already unless the section says
otherwise.

## 1. One error contract: services throw

Every **mutating** service method (create / update / delete / switch) either
succeeds and returns a value, or **throws**. There is no `{ success, error }`
envelope.

```ts
// ❌ two outcomes encoded in one return value
const result = await accountService.switch(id);
if (!result.success) show(result.error);

// ✅ success returns a value, failure throws
await accountService.switch(id);            // throws on failure
try {
  await accountService.switch(id);
} catch (e) {
  show(e instanceof Error ? e.message : String(e));
}
```

Readers may return a sentinel, but only to mean **"not found" / "nothing
here"**, never **"it failed"**:

| Sentinel | Meaning |
| --- | --- |
| `null` | record does not exist |
| `[]` | no records match |
| `false` | only for pure predicates such as `isFollowing()` |

A failure is never encoded as `null`, `[]` or `false` - that is a throw.

When a caller must branch on *why* something failed, throw a typed error with a
stable `code` rather than matching on message text:

```ts
throw new MultiAccountError('biometric_required', 'biometric_required');
if (isMultiAccountError(error, 'biometric_required')) promptBiometrics();
```

`multiAccount.service.ts` is the reference implementation. `highlight.service.ts`
is the reference for the read shape (returns `null` when missing, throws on
write).

## 2. `native/types/database.ts` is the entity source

All Firestore entity shapes - `User`, `Post`, `Story`, `Glimpse`, `Comment`,
`Message`, `Conversation`, `Collection`, `Highlight`, ... - live in
`native/types/database.ts`. Services and screens do not re-declare them.

Two exceptions, both deliberate:

- **View models** - a component-facing shape with renamed, flattened or
  pre-joined fields (for example `screens/HomeScreenWorking/homeFeedTypes.ts`).
  Name these for what they are (`FeedPost`, not `Post`) so the collision with
  the document type is visible.
- **Narrow views** - derive with `Pick<>` / `Partial<Pick<>>` from the schema
  type instead of restating field names:

  ```ts
  type ConversationUser = Pick<DBUser, 'userId' | 'username'> &
    Partial<Pick<DBUser, 'displayName' | 'avatarURL' | 'verified' | 'isOnline'>>;
  ```

Viewer-hydrated fields that are never written to a document (`isLiked`,
`isSaved`, `latestComment`, client-side send timestamps) are still declared on
the entity type, marked optional and commented as hydrated.

## 3. Layering

```
screens/  ->  hooks/  ->  services/  ->  types/
                 \        components/
                  \______/
```

- Shared types belong in `native/types/`, never under `components/` or
  `screens/`.
- A service never imports a screen or component (not even for a type).
- Hooks may import services and types; components may import hooks, services
  and types.

## 4. Theming

- Colours come from `useColors()` (backed by `contexts/ThemeContext.tsx`), so
  they follow the user's light/dark preference.
- The static `colors` export in `styles/theme.ts` is dark-only and is
  **frozen at module load**, so anything built from it with
  `StyleSheet.create(...)` at module scope can never react to a theme change.
  Do not add new uses of it.

**Status: partially applied.** Large parts of the app still import the static
`colors` object or hardcode hex values, so light mode does not work everywhere
yet. Convert components to `useColors()` as they are touched.

## 5. Naming

- Files: `camelCase.ts` for modules, `PascalCase.tsx` for React components,
  `*.service.ts` for the service layer, `*.types.ts` for type-only modules.
- Do not suffix a component with both its variant and its container, e.g.
  `Screen/Screen.tsx`.
