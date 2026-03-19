# 🛡️ SAV (Server Action Validation)

**SAV** is a high-performance, type-safe validation library for **Next.js Server Actions**. It eliminates boilerplate by automatically generating **Valibot** schemas directly from your TypeScript interfaces using AST metadata.

[![npm version](https://img.shields.io/badge/npm-0.1.0-blue.svg)](https://www.npmjs.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## ✨ Features

- **Zero-Boilerplate**: Define an interface, add a comment, and you're done.
- **Automatic Coercion**: Automatically converts `FormData` strings to `number`, `boolean`, or `Date`.
- **Compile-Time Generation**: Powered by `ts-morph` to generate schemas during your build process.
- **React 19 Ready**: Includes a custom hook `useSAVAction` for seamless integration with `useActionState`.
- **Ultra Lightweight**: Uses **Valibot** under the hood for the smallest possible server bundle size.

---

## 🚀 Quick Start

### 1. Install Dependencies

```bash
npm install sav-validator valibot
```

### 2. Define your DTO

Create a TypeScript interface. Use the `/** @sav ... */` JSDoc syntax to add validation rules.

```typescript
// app/actions/types.ts
export interface RegisterDTO {
    /** @sav email, minLength(5) */
    email: string;

    /** @sav min(18), max(100) */
    age: number;

    /** @sav optional */
    website?: string;
}
```

### 3. Run the Compiler

Run the SAV CLI to generate the schemas.

```bash
npx sav-validator generate --input "**/types.ts" --output "app/actions/schemas.gen.ts"
```

### 4. Create a Server Action

Wrap your logic with `createAction`. The data argument is fully typed and validated.

```typescript
// app/actions/user.ts
'use server';

import { createAction } from 'sav-validator/core';
import { RegisterDTOSchema } from './schemas.gen';

export const registerUser = createAction(RegisterDTOSchema, async (data) => {
    // data.age is a real number here!
    const user = await db.user.create({ 
        data: {
            email: data.email,
            age: data.age
        }
    });
    return user;
});
```

### 5. Use in your Component

Handle loading states and validation errors with zero effort using the custom hook.

```typescript
'use client';

import { useSAVAction } from 'sav-validator/react';
import { registerUser } from './actions/user';

export function RegisterForm() {
    const { formAction, isPending, getFieldError } = useSAVAction(registerUser, {
        onSuccess: (data) => alert(`Welcome ${data.email}!`),
        onError: (errs) => console.error(errs)
    });

    return (
        <form action={formAction} className="flex flex-col gap-2">
            <input name="email" placeholder="Email" disabled={isPending} />
            <span className="text-red-500">{getFieldError('email')}</span>

            <input name="age" type="number" placeholder="Age" disabled={isPending} />
            <span className="text-red-500">{getFieldError('age')}</span>

            <button type="submit" disabled={isPending}>
                {isPending ? 'Submitting...' : 'Register'}
            </button>
        </form>
    );
}
```

---

## 🛠️ How it Works

- **sav-validator/compiler**: Scans your code, reads JSDoc, and generates Valibot pipes.
- **sav-validator/core**: Intercepts FormData, performs type coercion (String → Number), and runs validation.
- **sav-validator/react**: Connects Server Action results to your UI state.

---

## 📝 Supported Constraints

The compiler currently supports the following `@sav` rules:

- `email` -> `v.email()`
- `url` -> `v.url()`
- `uuid` -> `v.uuid()`
- `regex(/.../)` -> `v.regex(/.../)`
- `minLength(x)` -> `v.minLength(x)`
- `maxLength(x)` -> `v.maxLength(x)`
- `length(x)` -> `v.length(x)`
- `includes(x)` -> `v.includes(x)`
- `startsWith(x)` -> `v.startsWith(x)`
- `endsWith(x)` -> `v.endsWith(x)`
- `min(x)` -> `v.minValue(x)`
- `max(x)` -> `v.maxValue(x)`
- `optional` -> wraps the field schema with `v.optional(...)`

---

## ⚖️ License

MIT © 2026 YourName
