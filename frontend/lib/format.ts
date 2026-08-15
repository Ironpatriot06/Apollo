import type {
  ListRequestsParams,
  RequestListResponse,
  RequestQuickFilter,
} from "@/lib/types";
import {
  listErrorRequests,
  listExceptionRequests,
  listRequests,
  listSlowRequests,
} from "@/lib/api/requests";

export const DEFAULT_PAGE_SIZE = 20;
export const DEFAULT_SLOW_THRESHOLD_MS = 100;

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms)) {
    return "—";
  }
  if (ms < 1) {
    return `${ms.toFixed(2)} ms`;
  }
  if (ms < 1000) {
    return `${ms.toFixed(2)} ms`;
  }
  return `${(ms / 1000).toFixed(2)} s`;
}

export function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function statusLabel(statusCode: number): string {
  if (statusCode >= 500) {
    return `${statusCode} Error`;
  }
  if (statusCode >= 400) {
    return `${statusCode} Client Error`;
  }
  if (statusCode >= 300) {
    return `${statusCode} Redirect`;
  }
  if (statusCode >= 200) {
    return `${statusCode} OK`;
  }
  return String(statusCode);
}

export function isErrorStatus(statusCode: number): boolean {
  return statusCode >= 400;
}

export function truncateMiddle(value: string, max = 80): string {
  if (value.length <= max) {
    return value;
  }
  const keep = Math.floor((max - 1) / 2);
  return `${value.slice(0, keep)}…${value.slice(-keep)}`;
}

export async function fetchRequestsForFilter(
  filter: RequestQuickFilter,
  params: ListRequestsParams & { threshold_ms?: number },
  init?: RequestInit,
): Promise<RequestListResponse> {
  const limit = params.limit ?? DEFAULT_PAGE_SIZE;
  const offset = params.offset ?? 0;

  switch (filter) {
    case "slow":
      return listSlowRequests(
        {
          threshold_ms: params.threshold_ms ?? DEFAULT_SLOW_THRESHOLD_MS,
          limit,
          offset,
        },
        init,
      );
    case "errors":
      return listErrorRequests({ limit, offset }, init);
    case "exceptions":
      return listExceptionRequests({ limit, offset }, init);
    case "all":
    default:
      return listRequests(
        {
          limit,
          offset,
          method: params.method,
          path: params.path,
          status_code: params.status_code,
          search: params.search,
        },
        init,
      );
  }
}
