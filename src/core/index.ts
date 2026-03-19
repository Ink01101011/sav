import * as v from "valibot";

type MaybePromise<T> = T | Promise<T>;

export type ActionErrors = Record<string, string[]>;

export type ActionResponse<T> =
  | { success: true; data: T }
  | { success: false; errors: ActionErrors };

export type ActionInput = FormData | Record<string, unknown>;

export function createAction<
  TSchema extends v.BaseSchema<unknown, unknown>,
  TOutput,
>(
  schema: TSchema,
  actionFn: (data: v.Output<TSchema>) => MaybePromise<TOutput>,
) {
  return async (input: ActionInput): Promise<ActionResponse<TOutput>> => {
    const rawData = input instanceof FormData ? parseFormData(input) : input;
    const result = v.safeParse(schema, rawData);

    if (!result.success) {
      return { success: false, errors: formatIssues(result.issues) };
    }

    try {
      const data = await actionFn(result.output);
      return { success: true, data };
    } catch (error) {
      console.error("Action execution failed:", error);
      return { success: false, errors: { _server: ["Internal Server Error"] } };
    }
  };
}

export function parseFormData(formData: FormData): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  formData.forEach((value, key) => {
    // แปลง key เช่น "items[0].id" หรือ "items[0][id]" ให้เป็น array: ['items', '0', 'id']
    const parts = key.replace(/\]/g, "").split(/\[|\./).filter(Boolean);

    let current = result;

    for (let partIndex = 0; partIndex < parts.length; partIndex++) {
      const part = parts[partIndex];
      const nextPart = parts[partIndex + 1];

      // ถ้าเป็นชิ้นสุดท้าย (เช่น 'id') ให้ใส่ค่า value ลงไปเลย
      if (partIndex === parts.length - 1) {
        current[part!] = value;
      } else {
        if (!current[part!]) {
          current[part!] = isNaN(Number(nextPart)) ? {} : [];
        }
        current = current[part!] as unknown as Record<string, unknown>;
      }
    }
  });

  return result;
}

function formatIssues(
  issues: readonly { message: string; path?: readonly unknown[] }[],
): ActionErrors {
  const formattedErrors: ActionErrors = {};

  issues.forEach((issue) => {
    const path = String(getIssuePathKey(issue.path) ?? "root");
    formattedErrors[path] ??= [];
    formattedErrors[path].push(issue.message);
  });

  return formattedErrors;
}

function getIssuePathKey(path?: readonly unknown[]): PropertyKey | undefined {
  const firstPathItem = path?.[0];

  if (
    typeof firstPathItem === "object" &&
    firstPathItem !== null &&
    "key" in firstPathItem
  ) {
    return (firstPathItem as { key?: PropertyKey }).key;
  }

  return undefined;
}
