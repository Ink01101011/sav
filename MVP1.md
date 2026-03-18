
# SAV (Server Action Validation)

## 🌟 Core Concept

A library that enables developers to write only TypeScript Interfaces, while the system automatically handles validation and type coercion of Server Actions. Eliminates redundant Zod or Valibot schema definitions.

## 🏗️ Architecture (The 3 Pillars)

The project is organized as a Monorepo with 3 main packages:

### 1. `sav-compiler` (The Build Engine)

- **Purpose:** Runs at build-time or via CLI (`npx sav-compiler generate`)
- **Implementation:** Uses `ts-morph` to parse code (AST), identifying `Interfaces` and JSDoc comments (`/** @sav ... */`)
- **Output:** Generates `schemas.gen.ts` containing Valibot validation rules

### 2. `sav-core` (The Server Runtime)

- **Purpose:** Middleware that intercepts data before Server Actions execute
- **Key Feature (Type Coercion):** Converts FormData strings to proper types (e.g., `"25"` → `25`, `"on"` → `true`)
- **Implementation:** Uses Valibot `v0.30.0` with `safeParseAsync` and `v.flatten` for validation and error handling

### 3. `sav-react` (The Client Experience)

- **Purpose:** React hook (`useSAVAction`) for UI integration
- **Foundation:** Wraps React 19's `useActionState`
- **Features:** Handles `isPending` state, provides `getFieldError('fieldName')` for per-field errors, includes `onSuccess`/`onError` callbacks

## 🚀 Developer Workflow

1. **Define:** Write Interface with validation rules via comments
    ```typescript
    interface UserDTO {
      /** @sav email, minLength(5) */
      email: string;
      /** @sav min(18) */
      age: number;
    }
    ```

2. **Generate:** Run `npx sav-compiler generate` to create schemas

3. **Action:** Create Server Action using `createAction`
    ```typescript
    export const register = createAction(UserDTOSchema, async (data) => {
      return await db.user.save(data);
    });
    ```

4. **UI:** Use `useSAVAction` in components
    ```tsx
    const { formAction, isPending, getFieldError } = useSAVAction(register);
    ```

## ✅ Resolved Issues

- FormData string type conversion
- Valibot v0.30.0 compatibility
- AST parsing for PropertyDeclaration vs PropertySignature
- CLI tooling with `commander`
