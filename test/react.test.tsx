// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { startTransition } from "react";
import type { ActionResponse } from "../src/core/index";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useSAVAction, UseSAVActionOptions } from "../src/react/index";

afterEach(() => {
  cleanup();
});

type PayloadValue = string | string[];

interface HookHarnessProps<TOutput> {
  action: (formData: FormData) => Promise<ActionResponse<TOutput>>;
  payload: Record<string, PayloadValue>;
  onSuccess?: UseSAVActionOptions<TOutput>["onSuccess"];
  onError?: UseSAVActionOptions<TOutput>["onError"];
  preventEnterSubmit?: UseSAVActionOptions<TOutput>["preventEnterSubmit"];
}

function toFormData(payload: Record<string, PayloadValue>): FormData {
  const formData = new FormData();

  for (const [key, value] of Object.entries(payload)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        formData.append(key, item);
      }
      continue;
    }

    formData.set(key, value);
  }

  return formData;
}

function HookHarness<TOutput>({
  action,
  payload,
  onSuccess,
  onError,
  preventEnterSubmit,
}: HookHarnessProps<TOutput>) {
  const hookOptions: UseSAVActionOptions<TOutput> = {
    onError: (er) => onError?.(er),
    onSuccess: (data) => onSuccess?.(data),
  };

  if (preventEnterSubmit !== undefined) {
    hookOptions.preventEnterSubmit = preventEnterSubmit;
  }

  const { data, errors, onAction, getFieldError, onsubmit } = useSAVAction(
    action,
    hookOptions,
  );

  return (
    <form data-testid="form" onSubmit={onsubmit}>
      <input data-testid="text-input" name="text-input" />
      <textarea data-testid="text-area" name="text-area" />
      <button
        type="button"
        onClick={() => {
          startTransition(() => {
            void onAction(toFormData(payload));
          });
        }}
      >
        submit
      </button>
      <div data-testid="data">{data ? JSON.stringify(data) : ""}</div>
      <div data-testid="errors">{errors ? JSON.stringify(errors) : ""}</div>
      <div data-testid="email-error">{getFieldError("email") ?? ""}</div>
    </form>
  );
}

describe("useSAVAction", () => {
  it("calls onSuccess and exposes resolved data", async () => {
    const onSuccess = vi.fn();
    const onError = vi.fn();

    const action = vi.fn(async (formData: FormData) => {
      return {
        success: true,
        data: {
          message: "ok",
          email: String(formData.get("email") ?? ""),
        },
      } satisfies ActionResponse<{ message: string; email: string }>;
    });

    render(
      <HookHarness
        action={action}
        payload={{ email: "dev@sav.dev" }}
        onSuccess={onSuccess}
        onError={onError}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "submit" }));

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith({
        message: "ok",
        email: "dev@sav.dev",
      });
    });

    expect(onError).not.toHaveBeenCalled();
    expect(screen.getByTestId("data").textContent).toContain('"message":"ok"');
  });

  it("calls onError and exposes field errors", async () => {
    const onSuccess = vi.fn();
    const onError = vi.fn();

    const expectedErrors = {
      email: ["Email is invalid"],
      _server: ["Validation failed"],
    };

    const action = vi.fn(async () => {
      return {
        success: false,
        errors: expectedErrors,
      } satisfies ActionResponse<never>;
    });

    render(
      <HookHarness
        action={action}
        payload={{ email: "invalid" }}
        onSuccess={onSuccess}
        onError={onError}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "submit" }));

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith(expectedErrors);
    });

    expect(onSuccess).not.toHaveBeenCalled();
    expect(screen.getByTestId("email-error").textContent).toBe(
      "Email is invalid",
    );
    expect(screen.getByTestId("errors").textContent).toContain(
      "Validation failed",
    );
  });

  it("prevents Enter default on form when enabled", () => {
    render(
      <HookHarness
        action={async () => ({ success: true, data: null })}
        payload={{ email: "dev@sav.dev" }}
        preventEnterSubmit
      />,
    );

    const textInput = screen.getByTestId("text-input");
    const enterEvent = new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
    });

    textInput.dispatchEvent(enterEvent);

    expect(enterEvent.defaultPrevented).toBe(true);
  });

  it("does not prevent Enter default for textarea", () => {
    render(
      <HookHarness
        action={async () => ({ success: true, data: null })}
        payload={{ email: "dev@sav.dev" }}
        preventEnterSubmit
      />,
    );

    const textArea = screen.getByTestId("text-area");
    const enterEvent = new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
    });

    textArea.dispatchEvent(enterEvent);

    expect(enterEvent.defaultPrevented).toBe(false);
  });
});
