import { API_BASE } from "./client";
import { parseError, type AppError } from "./errors";

/**
 * POST a JSON body and consume a `text/event-stream` response, invoking `onEvent`
 * for each parsed `data:` JSON object as it arrives.
 *
 * The backend's streaming endpoints (company research, cover-letter generation)
 * are POST, so the browser's EventSource (GET-only) can't be used — we read the
 * fetch body stream directly and split on the SSE `\n\n` event delimiter.
 *
 * Returns when the stream ends. Pass an AbortSignal to cancel early.
 */
export async function streamSSE<T>(
  path: string,
  body: unknown,
  onEvent: (event: T) => void,
  signal?: AbortSignal,
): Promise<void> {
  return streamSSERequest(
    path,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
    onEvent,
    signal,
  );
}

/**
 * Lower-level SSE consumer: send an arbitrary request (e.g. a multipart upload)
 * and parse the `text/event-stream` response. Used for the streaming CV import.
 */
export async function streamSSERequest<T>(
  path: string,
  init: RequestInit,
  onEvent: (event: T) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { Accept: "text/event-stream", ...(init.headers ?? {}) },
    signal,
  });

  if (!res.ok || !res.body) {
    // A pre-stream failure (e.g. request validation) comes back as our JSON error
    // envelope, not SSE. Parse it and tag the thrown Error so the consumer's
    // `parseError`/`toast.error` shows the friendly message + details.
    let appError: AppError | undefined;
    try {
      const body = await res.json();
      if (body && typeof body === "object" && "error" in body) appError = parseError(body.error);
      else if (body && typeof (body as { detail?: unknown }).detail === "string") {
        appError = parseError({ code: "http_error", message: (body as { detail: string }).detail });
      }
    } catch {
      // Non-JSON / empty body — fall through to a generic message.
    }
    const err = new Error(appError?.message ?? `Stream failed (${res.status})`) as Error & {
      appError?: AppError;
    };
    err.appError = appError;
    throw err;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE events are separated by a blank line.
    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) !== -1) {
      const rawEvent = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      const data = rawEvent
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .join("");
      if (!data) continue;
      try {
        onEvent(JSON.parse(data) as T);
      } catch {
        // Ignore malformed keep-alive/comment frames.
      }
    }
  }
}
