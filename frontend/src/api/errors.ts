import { AxiosError } from "axios";

/**
 * The frontend mirror of the backend `AppError` (see `backend/core/errors.py`).
 *
 * Every failure — an HTTP response, a network drop, a mid-stream SSE `fatal`
 * event, or a plain thrown value — is normalized to this one shape via
 * `parseError`, so the UI always has a friendly `title` + `message` to show and
 * the raw technical `detail` tucked away for a "Show details" toggle.
 */
export type AppErrorAction = "switch_model" | "open_settings" | "add_key" | "retry";

export interface AppError {
  code: string;
  title: string;
  message: string;
  /** Raw technical string (exception repr / stack); shown only behind a toggle. */
  detail: string | null;
  retryable: boolean;
  action: AppErrorAction | null;
}

/** Backend error envelope: `{ detail, error: {...} }`. */
interface ErrorEnvelope {
  detail?: unknown;
  error?: Partial<AppError> & { code?: string };
}

function make(partial: Partial<AppError> & { message: string }): AppError {
  return {
    code: partial.code ?? "internal.unexpected",
    title: partial.title ?? "Something went wrong",
    message: partial.message,
    detail: partial.detail ?? null,
    retryable: partial.retryable ?? false,
    action: partial.action ?? null,
  };
}

/** True when a value already has the backend `error` object's shape. */
function isAppErrorShape(value: unknown): value is AppError {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, unknown>).code === "string" &&
    typeof (value as Record<string, unknown>).message === "string"
  );
}

/** Coerce a backend `error` object (possibly partial) into a complete AppError. */
function fromErrorObject(obj: Partial<AppError>): AppError {
  return make({
    code: obj.code,
    title: obj.title,
    message: obj.message ?? "Something went wrong",
    detail: obj.detail ?? null,
    retryable: obj.retryable,
    action: obj.action ?? null,
  });
}

/** A concise title for a bare HTTP status (used when only `detail` came back). */
function titleForStatus(status: number | undefined): string {
  if (status === 404) return "Not found";
  if (status === 429) return "Too many requests";
  if (status === 401 || status === 403) return "Not allowed";
  if (status && status >= 500) return "Service unavailable";
  return "Something went wrong";
}

function fromAxios(err: AxiosError): AppError {
  const data = err.response?.data as ErrorEnvelope | string | undefined;

  // Preferred: the structured envelope from our backend.
  if (data && typeof data === "object" && isAppErrorShape((data as ErrorEnvelope).error)) {
    return fromErrorObject((data as ErrorEnvelope).error as AppError);
  }

  // Fallback: FastAPI's legacy `{ detail }` (string or 422 validation array).
  if (data && typeof data === "object") {
    const detail = (data as ErrorEnvelope).detail;
    if (typeof detail === "string" && detail.trim()) {
      return make({ code: "http_error", title: titleForStatus(err.response?.status), message: detail });
    }
    if (Array.isArray(detail) && detail[0] && typeof detail[0] === "object") {
      const first = detail[0] as { msg?: string };
      return make({ code: "validation", title: "Check your input", message: first.msg ?? "Invalid input." });
    }
  }

  // No usable body → distinguish a dropped connection from a timeout.
  if (err.code === "ERR_NETWORK" || !err.response) {
    return make({
      code: "network.unreachable",
      title: "Can't reach the app",
      message: "Couldn't reach the local backend. Make sure it's running on :8000, then try again.",
      detail: err.message,
      retryable: true,
      action: "retry",
    });
  }
  if (err.code === "ECONNABORTED") {
    return make({
      code: "network.timeout",
      title: "The request timed out",
      message: "The server took too long to respond. Please try again.",
      detail: err.message,
      retryable: true,
      action: "retry",
    });
  }

  return make({
    code: "http_error",
    title: titleForStatus(err.response?.status),
    message: err.message || "The request failed.",
    detail: err.message,
    retryable: true,
  });
}

/** Normalize ANY thrown/received value into an `AppError`. Never throws. */
export function parseError(err: unknown): AppError {
  // Already a backend `error` object (e.g. an SSE `fatal`/`agent_error` payload).
  if (isAppErrorShape(err)) return fromErrorObject(err);

  if (err instanceof AxiosError) return fromAxios(err);

  // An Error we tagged with a parsed AppError (see `streamSSE` in api/sse.ts).
  if (err instanceof Error) {
    const tagged = (err as Error & { appError?: unknown }).appError;
    if (isAppErrorShape(tagged)) return fromErrorObject(tagged);
    return make({ code: "internal.unexpected", message: err.message || "Something went wrong", detail: err.stack ?? err.message });
  }

  if (typeof err === "string" && err.trim()) {
    return make({ code: "internal.unexpected", message: err });
  }

  return make({ code: "internal.unexpected", message: "Something went wrong.", detail: String(err) });
}
