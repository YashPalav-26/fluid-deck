/**
 * SEARCH-008 Search Worker entrypoint. Vite emits this as a separate module
 * worker; it imports the shared tokenizer/MiniSearch engine and never Dexie.
 */
import { SearchWorkerCore } from "./search-worker-core.ts";
import type { WorkerSearchRequest, WorkerSearchResponse } from "./search-worker-protocol.ts";

interface WorkerScope {
  onmessage: ((event: MessageEvent<WorkerSearchRequest>) => void) | null;
  onmessageerror: ((event: MessageEvent) => void) | null;
  postMessage(message: WorkerSearchResponse): void;
}

const scope = globalThis as unknown as WorkerScope;
const core = new SearchWorkerCore();

scope.onmessage = (event) => {
  for (const response of core.handle(event.data)) scope.postMessage(response);
};

scope.onmessageerror = () => {
  scope.postMessage({
    type: "error",
    code: "INVALID_MESSAGE",
    message: "Worker received an unreadable message",
    retryable: false,
  });
};
