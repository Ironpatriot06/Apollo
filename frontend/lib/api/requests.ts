import { apiGet } from "@/lib/api/client";
import type {
  ListRequestsParams,
  ListSlowRequestsParams,
  RequestListResponse,
} from "@/lib/types";

export function listRequests(
  params: ListRequestsParams = {},
  init?: RequestInit,
): Promise<RequestListResponse> {
  return apiGet<RequestListResponse>(
    "/api/v1/requests",
    {
      limit: params.limit,
      offset: params.offset,
      status_code: params.status_code,
      path: params.path,
      method: params.method,
      search: params.search,
    },
    init,
  );
}

export function listSlowRequests(
  params: ListSlowRequestsParams,
  init?: RequestInit,
): Promise<RequestListResponse> {
  return apiGet<RequestListResponse>(
    "/api/v1/requests/slow",
    {
      threshold_ms: params.threshold_ms,
      limit: params.limit,
      offset: params.offset,
    },
    init,
  );
}

export function listErrorRequests(
  params: { limit?: number; offset?: number } = {},
  init?: RequestInit,
): Promise<RequestListResponse> {
  return apiGet<RequestListResponse>(
    "/api/v1/requests/errors",
    {
      limit: params.limit,
      offset: params.offset,
    },
    init,
  );
}

export function listExceptionRequests(
  params: { limit?: number; offset?: number } = {},
  init?: RequestInit,
): Promise<RequestListResponse> {
  return apiGet<RequestListResponse>(
    "/api/v1/requests/exceptions",
    {
      limit: params.limit,
      offset: params.offset,
    },
    init,
  );
}
