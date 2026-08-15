/** Types mirrored from backend/app/schemas */

export type EventType = "HTTP_IN" | "HTTP_OUT" | "SQL" | "EXCEPTION" | string;

export interface RequestEvent {
  request_id: string;
  method: string;
  path: string;
  status_code: number;
  started_at: string;
  duration_ms: number;
}

export interface RequestListResponse {
  items: RequestEvent[];
  total: number;
  limit: number;
  offset: number;
}

export interface TimelineExecutionEvent {
  event_id: string;
  event_type: EventType;
  started_at: string;
  duration_ms: number;
  metadata: Record<string, unknown>;
}

export interface RequestTimeline {
  request: RequestEvent;
  events: TimelineExecutionEvent[];
}

export interface EventCounts {
  HTTP_IN: number;
  HTTP_OUT: number;
  SQL: number;
  EXCEPTION: number;
}

export interface RequestSummary {
  request: RequestEvent;
  total_events: number;
  event_counts: EventCounts;
  total_execution_duration_ms: number;
  has_error: boolean;
}

export interface ExecutionEvent {
  event_id: string;
  request_id: string;
  event_type: EventType;
  started_at: string;
  duration_ms: number;
  metadata: Record<string, unknown>;
}

export interface ExecutionEventListResponse {
  items: ExecutionEvent[];
  total: number;
  limit: number;
  offset: number;
}

export interface SqlEventMetadata {
  query?: string;
}

export interface HttpOutEventMetadata {
  method?: string;
  url?: string;
  status_code?: number | null;
  error_type?: string;
  error?: string;
}

export interface ExceptionTraceFrame {
  filename?: string;
  function?: string;
  line_number?: number;
}

export interface ExceptionEventMetadata {
  exception_type?: string;
  message?: string;
  traceback?: ExceptionTraceFrame[];
}

export type RequestQuickFilter = "all" | "slow" | "errors" | "exceptions";

export interface ListRequestsParams {
  limit?: number;
  offset?: number;
  status_code?: number;
  path?: string;
  method?: string;
  search?: string;
}

export interface ListSlowRequestsParams {
  threshold_ms: number;
  limit?: number;
  offset?: number;
}
