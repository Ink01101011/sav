import { useActionState, useCallback, useEffect } from "react";
import type { ActionResponse } from "../core/index.js";

export type { ActionErrors, ActionResponse, ActionInput } from "../core/index.js";

export interface UseSAVActionOptions<TOutput> {
  onSuccess?: (data: TOutput) => void;
  onError?: (errors: Record<string, string[]>) => void;
  preventEnterSubmit?: boolean;
}

export function useSAVAction<TOutput>(
  action: (formData: FormData) => Promise<ActionResponse<TOutput>>,
  options: UseSAVActionOptions<TOutput>,
) {
  const { onError, onSuccess, preventEnterSubmit } = options ?? {};

  const [state, formAction, isPending] = useActionState(
    async (
      _previousState: ActionResponse<TOutput> | null,
      formData: FormData,
    ) => {
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

  const onsubmit = useCallback(
    (event: React.SubmitEvent<HTMLFormElement>) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      formAction(formData);
    },
    [formAction],
  );

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLFormElement>) => {
      if (!preventEnterSubmit || event.key !== "Enter") {
        return;
      }

      if (event.target instanceof HTMLTextAreaElement) {
        return;
      }

      event.preventDefault();
    },
    [preventEnterSubmit],
  );

  return {
    onAction: formAction,
    onsubmit,
    onKeyDown,
    isPending,
    errors,
    data,
    getFieldError: (fieldName: string) => {
      return errors?.[fieldName]?.[0];
    },
  };
}
