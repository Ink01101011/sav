import { useActionState, useEffect } from "react";
import type { ActionResponse } from "sav-core";

export interface UseSAVActionOptions<TOutput> {
  onSuccess?: (data: TOutput) => void;
  onError?: (errors: Record<string, string[]>) => void;
}

export function useSAVAction<TOutput>(
  action: (formData: FormData) => Promise<ActionResponse<TOutput>>,
  options: UseSAVActionOptions<TOutput>,
) {
  const { onError, onSuccess } = options ?? {};

  const [state, formAction, isPending] = useActionState(
    async (_previousState: ActionResponse<TOutput> | null, formData: FormData) => {
      return action(formData);
    },
    null as ActionResponse<TOutput> | null,
  );

  useEffect(() => {
    if (!state) return;

    if (state.success) {
      onSuccess?.(state.data);
      return;
    }

    onError?.(state.errors);
  }, [state, onError, onSuccess]);

  const errors = state && !state.success ? state.errors : undefined;
  const data = state && state.success ? state.data : undefined;

  return {
    formAction,
    isPending,
    errors,
    data,
    getFieldError: (fieldName: string) => {
      return errors?.[fieldName]?.[0];
    },
  };
}
