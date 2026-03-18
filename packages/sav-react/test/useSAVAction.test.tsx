// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { startTransition } from "react";
import type { ActionResponse } from "sav-core";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useSAVAction, UseSAVActionOptions } from "../src/index";

afterEach(() => {
  cleanup();
});

type PayloadValue = string | string[];

interface HookHarnessProps<TOutput> {
  action: (formData: FormData) => Promise<ActionResponse<TOutput>>;
  payload: Record<string, PayloadValue>;
  onSuccess?: UseSAVActionOptions<TOutput>["onSuccess"];
  onError?: UseSAVActionOptions<TOutput>["onError"];
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
}: HookHarnessProps<TOutput>) {

  const { data, errors, formAction, getFieldError } = useSAVAction(action, {
    onError: (er) => onError?.(er),
    onSuccess: (data) => onSuccess?.(data),
  });

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          startTransition(() => {
            void formAction(toFormData(payload));
          });
        }}
      >
        submit
      </button>
      <div data-testid="data">{data ? JSON.stringify(data) : ""}</div>
      <div data-testid="errors">{errors ? JSON.stringify(errors) : ""}</div>
      <div data-testid="email-error">{getFieldError("email") ?? ""}</div>
    </div>
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
});
