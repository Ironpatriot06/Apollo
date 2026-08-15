import { apiGet } from "@/lib/api/client";
import type {
  ExecutionEventListResponse,
  RequestSummary,
  RequestTimeline,
} from "@/lib/types";

export function getRequestSummary(
  requestId: string,
  init?: RequestInit,
): Promise<RequestSummary> {
  return apiGet<RequestSummary>(
    `/api/v1/events/${encodeURIComponent(requestId)}/summary`,
    undefined,
    init,
  );
}

export function getRequestTimeline(
  requestId: string,
  init?: RequestInit,
): Promise<RequestTimeline> {
  return apiGet<RequestTimeline>(
    `/api/v1/events/${encodeURIComponent(requestId)}/timeline`,
    undefined,
    init,
  );
}

export function listExecutionEvents(
  params: {
    limit?: number;
    offset?: number;
    event_type?: string;
    request_id?: string;
  } = {},
  init?: RequestInit,
): Promise<ExecutionEventListResponse> {
  return apiGet<ExecutionEventListResponse>(
    "/api/v1/execution-events",
    {
      limit: params.limit,
      offset: params.offset,
      event_type: params.event_type,
      request_id: params.request_id,
    },
    init,
  );
}
