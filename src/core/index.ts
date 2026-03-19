import * as v from "valibot";

type MaybePromise<T> = T | Promise<T>;

export type ActionErrors = Record<string, string[]>;

export type ActionResponse<T> =
  | { success: true; data: T }
  | { success: false; errors: ActionErrors };

export type ActionInput = FormData | Record<string, unknown>;

export function createAction<TSchema extends v.BaseSchema<unknown, unknown>, TOutput>(
  schema: TSchema,
  actionFn: (data: v.Output<TSchema>) => MaybePromise<TOutput>,
) {
  return async (input: ActionInput): Promise<ActionResponse<TOutput>> => {
    const rawData = input instanceof FormData ? formDataToObject(input) : input;
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

function formDataToObject(
  formData: FormData,
): Record<string, FormDataEntryValue | FormDataEntryValue[]> {
  const output: Record<string, FormDataEntryValue | FormDataEntryValue[]> = {};

  formData.forEach((value, key) => {
    const currentValue = output[key];

    if (currentValue === undefined) {
      output[key] = value;
      return;
    }

    output[key] = Array.isArray(currentValue)
      ? [...currentValue, value]
      : [currentValue, value];
  });

  return output;
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
