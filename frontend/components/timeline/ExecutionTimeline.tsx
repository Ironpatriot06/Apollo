"use client";

import { useMemo, useState } from "react";
import { CollapsibleCode } from "@/components/ui/CollapsibleCode";
import styles from "@/components/timeline/ExecutionTimeline.module.css";
import type {
  ExceptionEventMetadata,
  HttpOutEventMetadata,
  SqlEventMetadata,
  TimelineExecutionEvent,
} from "@/lib/types";
import { formatDuration, truncateMiddle } from "@/lib/format";

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function safeTime(value: string): number {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function eventLabel(event: TimelineExecutionEvent): string {
  const meta = asRecord(event.metadata);
  if (event.event_type === "SQL") {
    return truncateMiddle(String(meta.query ?? "SQL query"), 72);
  }
  if (event.event_type === "HTTP_OUT") {
    return `${String(meta.method ?? "?")} ${truncateMiddle(String(meta.url ?? "(no url)"), 72)}`;
  }
  if (event.event_type === "EXCEPTION") {
    return `${String(meta.exception_type ?? "Exception")}${meta.message ? `: ${truncateMiddle(String(meta.message), 60)}` : ""}`;
  }
  return event.event_type;
}

function SqlBody({ metadata }: { metadata: SqlEventMetadata }) {
  const query = metadata.query ?? "(no query)";
  return <CollapsibleCode value={query} label="SQL" />;
}

function HttpOutBody({ metadata }: { metadata: HttpOutEventMetadata }) {
  const method = metadata.method ?? "?";
  const url = metadata.url ?? "(no url)";
  const status =
    metadata.status_code === null || metadata.status_code === undefined
      ? "—"
      : String(metadata.status_code);

  return (
    <div>
      <div className={styles.metaLine}>
        {method} {url}
      </div>
      <div className={`${styles.metaLine} ${styles.muted}`}>Status {status}</div>
      {metadata.error ? (
        <div className={`${styles.metaLine} ${styles.muted}`}>
          Error: {metadata.error_type ? `${metadata.error_type}: ` : ""}
          {metadata.error}
        </div>
      ) : null}
      {url.length > 120 ? <CollapsibleCode value={url} label="URL" /> : null}
    </div>
  );
}

export function ExceptionBody({
  metadata,
}: {
  metadata: ExceptionEventMetadata;
}) {
  const frames = Array.isArray(metadata.traceback) ? metadata.traceback : [];
  const tracebackText = frames
    .map(
      (frame) =>
        `${frame.filename ?? "?"}:${frame.line_number ?? "?"} in ${frame.function ?? "?"}`,
    )
    .join("\n");

  async function copyTraceback() {
    await navigator.clipboard?.writeText(
      tracebackText ||
        `${metadata.exception_type ?? "Exception"}${metadata.message ? `: ${metadata.message}` : ""}`,
    );
  }

  return (
    <div>
      <div className={styles.metaLine}>
        {metadata.exception_type ?? "Exception"}
        {metadata.message ? `: ${metadata.message}` : ""}
      </div>
      {metadata.message && metadata.message.length > 200 ? (
        <CollapsibleCode value={metadata.message} label="message" />
      ) : null}
      {frames.length > 0 ? (
        <details className={styles.trace} data-testid="exception-traceback-details">
          <summary className={styles.traceSummary}>Traceback</summary>
          <button
            type="button"
            className={styles.copyButton}
            onClick={copyTraceback}
            data-testid="copy-traceback"
          >
            Copy traceback
          </button>
          <ul className={styles.traceList} data-testid="exception-traceback">
            {frames.map((frame, index) => (
              <li
                key={`${frame.filename}-${frame.line_number}-${index}`}
                className={styles.traceItem}
              >
                {frame.filename ?? "?"}:{frame.line_number ?? "?"} in{" "}
                {frame.function ?? "?"}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

function EventDetails({ event }: { event: TimelineExecutionEvent }) {
  const type = event.event_type;
  const meta = asRecord(event.metadata);

  return (
    <div className={styles.card} data-testid="waterfall-event-detail">
      <div className={styles.header}>
        <span className={styles.type}>{type}</span>
        <span className={styles.duration}>{formatDuration(event.duration_ms)}</span>
      </div>
      {type === "SQL" ? <SqlBody metadata={meta as SqlEventMetadata} /> : null}
      {type === "HTTP_OUT" ? <HttpOutBody metadata={meta as HttpOutEventMetadata} /> : null}
      {type === "EXCEPTION" ? (
        <ExceptionBody metadata={meta as ExceptionEventMetadata} />
      ) : null}
      {type !== "SQL" && type !== "HTTP_OUT" && type !== "EXCEPTION" ? (
        <CollapsibleCode value={JSON.stringify(meta, null, 2)} label="metadata" />
      ) : null}
    </div>
  );
}

function eventClass(type: string): string {
  if (type === "SQL") {
    return styles.sql;
  }
  if (type === "HTTP_OUT") {
    return styles.httpOut;
  }
  if (type === "EXCEPTION") {
    return styles.exception;
  }
  return "";
}

export function ExecutionTimeline({
  events,
  requestLabel,
  requestStartedAt,
  requestDurationMs,
}: {
  events: TimelineExecutionEvent[];
  requestLabel: string;
  requestStartedAt?: string;
  requestDurationMs?: number;
}) {
  const [selectedEventId, setSelectedEventId] = useState<string | null>(
    events[0]?.event_id ?? null,
  );

  const layout = useMemo(() => {
    const requestStart =
      requestStartedAt !== undefined
        ? safeTime(requestStartedAt)
        : safeTime(events[0]?.started_at ?? new Date().toISOString());
    const eventEnds = events.map(
      (event) => safeTime(event.started_at) + Math.max(event.duration_ms, 0),
    );
    const requestEnd = requestStart + Math.max(requestDurationMs ?? 0, 0);
    const totalMs = Math.max(
      1,
      requestDurationMs ?? 0,
      requestEnd - requestStart,
      ...eventEnds.map((end) => end - requestStart),
    );

    return events.map((event) => {
      const startOffset = Math.max(0, safeTime(event.started_at) - requestStart);
      const left = Math.min(100, (startOffset / totalMs) * 100);
      const width = Math.max(0.6, (Math.max(event.duration_ms, 0) / totalMs) * 100);
      return {
        event,
        left,
        width: Math.min(100 - left, width),
        startOffset,
      };
    });
  }, [events, requestDurationMs, requestStartedAt]);

  const selectedEvent =
    events.find((event) => event.event_id === selectedEventId) ?? events[0];

  return (
    <div className={styles.timeline} data-testid="execution-timeline">
      <div className={styles.root}>
        <div>
          <div className={styles.type}>Request</div>
          <div className={styles.metaLine}>{requestLabel}</div>
        </div>
        <div className={styles.requestTrack} data-testid="waterfall-request">
          <div className={styles.requestBar} />
        </div>
      </div>

      {events.length === 0 ? (
        <div className={styles.empty} data-testid="timeline-empty">
          No execution events were recorded for this request.
        </div>
      ) : (
        <div className={styles.waterfall} data-testid="execution-waterfall">
          {layout.map(({ event, left, width, startOffset }) => (
            <button
              type="button"
              key={event.event_id}
              className={`${styles.event} ${eventClass(event.event_type)} ${
                selectedEvent?.event_id === event.event_id ? styles.selected : ""
              }`}
              data-testid="timeline-event"
              data-event-type={event.event_type}
              data-event-id={event.event_id}
              onClick={() => setSelectedEventId(event.event_id)}
              title={`${event.event_type} starts at ${formatDuration(startOffset)} and lasts ${formatDuration(event.duration_ms)}`}
            >
              <div className={styles.eventLabel}>
                <span className={styles.type}>{event.event_type}</span>
                <span className={styles.duration}>
                  {formatDuration(event.duration_ms)}
                </span>
                <span className={styles.labelText}>{eventLabel(event)}</span>
              </div>
              <div className={styles.track}>
                <span
                  className={styles.bar}
                  data-testid="waterfall-bar"
                  style={{ left: `${left}%`, width: `${width}%` }}
                />
              </div>
            </button>
          ))}
        </div>
      )}

      {selectedEvent ? <EventDetails event={selectedEvent} /> : null}
    </div>
  );
}
