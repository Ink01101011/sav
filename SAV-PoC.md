# SAV Proof-of-Concept Implementation

To build a proof-of-concept (PoC) for **SAV (Server Action Validation)**, we need to bridge the gap between static TypeScript interfaces and runtime validation.

Since Next.js uses **SWC** (written in Rust) for its build pipeline, creating a custom SWC plugin is the most performant route. However, for a fast PoC, we can use a **TypeScript Transformer** or a pre-build script that generates validation schemas.

---

## 1. Project Structure (`sav-monorepo`)

A standard library structure using **pnpm workspaces** is best for separating the compiler logic from the runtime hooks.

```
valiact/
├── packages/
│   ├── sav-core/          # Runtime validation logic (Valibot based)
│   ├── sav-compiler/      # TS Compiler API / AST logic
│   └── sav-react/         # useActionState hooks & error mapping
├── examples/
│   └── nextjs-app/        # Test environment
├── package.json
└── tsconfig.json
```

---

## 2. The `package.json` (Core Dependencies)

We'll use **Valibot** because it is significantly smaller than Zod, which is critical for keeping Next.js "Server-Side Bundle" sizes low.

```json
{
  "name": "valiact",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "build": "turbo run build",
    "dev": "turbo run dev"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "ts-morph": "^21.0.0", 
    "turbo": "latest"
  },
  "dependencies": {
    "valibot": "^0.30.0"
  }
}
```

*Note: `ts-morph` is a wrapper around the TypeScript Compiler API that makes AST manipulation much easier for your PoC.*

---

## 3. Proof-of-Concept: The "Type-to-Schema" Compiler

This script demonstrates how SAV "reads" an interface and generates a runtime validator. In a real library, this would run automatically during `next build`.

```typescript
// packages/sav-compiler/poc-compiler.ts
import { Project, InterfaceDeclaration } from 'ts-morph';

const project = new Project();
const sourceFile = project.createSourceFile("temp.ts", `
  interface CreateUserDTO {
    email: string;
    age: number;
    isAdmin: boolean;
  }
`);

function generateValibotSchema(node: InterfaceDeclaration) {
  const name = node.getName();
  let schemaCode = `const ${name}Schema = v.object({\n`;

  node.getProperties().forEach(prop => {
    const type = prop.getType().getText();
    let vType = 'v.string()'; // Default

    if (type === 'number') vType = 'v.number()';
    if (type === 'boolean') vType = 'v.boolean()';
    
    schemaCode += `  ${prop.getName()}: ${vType},\n`;
  });

  schemaCode += "});";
  return schemaCode;
}

const targetInterface = sourceFile.getInterfaceOrThrow("CreateUserDTO");
console.log("--- Generated Runtime Schema ---");
console.log(generateValibotSchema(targetInterface));
```

---

## 4. The Runtime Wrapper (`sav-core`)

This is what the developer actually imports. It uses the generated schema to protect the function.

```typescript
// packages/sav-core/index.ts
import * as v from 'valibot';

export function createAction<T>(schema: v.BaseSchema<any, T>, actionFn: (data: T) => Promise<any>) {
  return async (formData: FormData) => {
    // 1. Convert FormData to plain object
    const rawData = Object.fromEntries(formData.entries());
    
    // 2. Validate
    const result = v.safeParse(schema, rawData);
    
    if (!result.success) {
      return { 
        success: false, 
        errors: result.issues.map(i => ({ path: i.path?.[0].key, message: i.message })) 
      };
    }

    // 3. Execute original action
    return actionFn(result.output);
  };
}
```

---

## 5. Next Steps for Development

To make this a "real" library that resolves the problems you identified, I suggest these focus areas:

1. **Type Coercion:** HTML Forms send everything as strings. Your compiler must automatically add `v.coerce(v.number(), Number)` when it sees a `number` type in your TypeScript interface.
2. **Next.js Integration:** Create a small `next.config.js` plugin that hooks into the Webpack/Turbo process to run your `sav-compiler` on every save.
3. **Error Handling:** Build a `useSAVAction` hook for the client side that automatically matches the server's error paths to your `<input>` labels.

**Would you like me to show you how to handle the "Type Coercion" logic for FormData (converting strings to numbers/booleans automatically)?**
