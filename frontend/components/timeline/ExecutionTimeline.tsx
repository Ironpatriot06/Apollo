"use client";

import { CollapsibleCode } from "@/components/ui/CollapsibleCode";
import styles from "@/components/timeline/ExecutionTimeline.module.css";
import type {
  ExceptionEventMetadata,
  HttpOutEventMetadata,
  SqlEventMetadata,
  TimelineExecutionEvent,
} from "@/lib/types";
import { formatDuration } from "@/lib/format";

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
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

function ExceptionBody({ metadata }: { metadata: ExceptionEventMetadata }) {
  const frames = Array.isArray(metadata.traceback) ? metadata.traceback : [];

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
        <div className={styles.trace}>
          <div className={`${styles.metaLine} ${styles.muted}`}>Traceback</div>
          <ul className={styles.traceList} data-testid="exception-traceback">
            {frames.map((frame, index) => (
              <li key={`${frame.filename}-${frame.line_number}-${index}`} className={styles.traceItem}>
                {frame.filename ?? "?"}:{frame.line_number ?? "?"} in {frame.function ?? "?"}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function EventNode({ event }: { event: TimelineExecutionEvent }) {
  const type = event.event_type;
  const meta = asRecord(event.metadata);
  const className =
    type === "SQL"
      ? styles.sql
      : type === "HTTP_OUT"
        ? styles.httpOut
        : type === "EXCEPTION"
          ? styles.exception
          : "";

  return (
    <div
      className={`${styles.event} ${className}`}
      data-testid="timeline-event"
      data-event-type={type}
    >
      <div className={styles.rail}>
        <span className={styles.railDot} />
      </div>
      <div className={styles.card}>
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
    </div>
  );
}

export function ExecutionTimeline({
  events,
  requestLabel,
}: {
  events: TimelineExecutionEvent[];
  requestLabel: string;
}) {
  if (events.length === 0) {
    return (
      <div className={styles.timeline} data-testid="execution-timeline">
        <div className={styles.root}>
          <div className={styles.rootLine}>
            <span className={styles.dot} />
          </div>
          <div>
            <div className={styles.type}>Request</div>
            <div className={styles.metaLine}>{requestLabel}</div>
          </div>
        </div>
        <div className={styles.empty} data-testid="timeline-empty">
          No execution events were recorded for this request.
        </div>
      </div>
    );
  }

  return (
    <div className={styles.timeline} data-testid="execution-timeline">
      <div className={styles.root}>
        <div className={styles.rootLine}>
          <span className={styles.dot} />
        </div>
        <div>
          <div className={styles.type}>Request</div>
          <div className={styles.metaLine}>{requestLabel}</div>
        </div>
      </div>
      {events.map((event) => (
        <EventNode key={event.event_id} event={event} />
      ))}
    </div>
  );
}
