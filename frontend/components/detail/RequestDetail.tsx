"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ExceptionBody,
  ExecutionTimeline,
} from "@/components/timeline/ExecutionTimeline";
import { MethodBadge, StatusBadge } from "@/components/ui/Badges";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/States";
import styles from "@/app/requests/[requestId]/detail.module.css";
import { ApiError } from "@/lib/api/client";
import { getRequestSummary, getRequestTimeline } from "@/lib/api/events";
import {
  formatDuration,
  formatTimestamp,
  statusLabel,
  truncateMiddle,
} from "@/lib/format";
import type {
  ExceptionEventMetadata,
  HttpOutEventMetadata,
  RequestSummary,
  RequestTimeline,
  SqlEventMetadata,
  TimelineExecutionEvent,
} from "@/lib/types";

const REFRESH_INTERVALS = [
  { label: "5 seconds", value: 5000 },
  { label: "10 seconds", value: 10000 },
  { label: "30 seconds", value: 30000 },
];

function metadata(event: TimelineExecutionEvent): Record<string, unknown> {
  return event.metadata && typeof event.metadata === "object"
    ? event.metadata
    : {};
}

function sqlMetadata(event: TimelineExecutionEvent): SqlEventMetadata {
  return metadata(event) as SqlEventMetadata;
}

function httpMetadata(event: TimelineExecutionEvent): HttpOutEventMetadata {
  return metadata(event) as HttpOutEventMetadata;
}

function exceptionMetadata(
  event: TimelineExecutionEvent,
): ExceptionEventMetadata {
  return metadata(event) as ExceptionEventMetadata;
}

function DependencyView({ events }: { events: TimelineExecutionEvent[] }) {
  const sqlEvents = events.filter((event) => event.event_type === "SQL");
  const httpEvents = events.filter((event) => event.event_type === "HTTP_OUT");
  const exceptionEvents = events.filter(
    (event) => event.event_type === "EXCEPTION",
  );
  const sqlDuration = sqlEvents.reduce((sum, event) => sum + event.duration_ms, 0);
  const httpDuration = httpEvents.reduce((sum, event) => sum + event.duration_ms, 0);

  return (
    <section className={styles.panel} data-testid="dependency-view">
      <h2 className={styles.sectionTitle}>Dependencies</h2>
      <div className={styles.dependencyGrid}>
        <div className={styles.dependencyCard}>
          <div className={styles.dependencyTitle}>Database</div>
          <div className={styles.dependencyMetric}>
            {sqlEvents.length} {sqlEvents.length === 1 ? "query" : "queries"}
            {" · "}
            {formatDuration(sqlDuration)}
          </div>
          <ul className={styles.compactList}>
            {sqlEvents.map((event) => (
              <li key={event.event_id}>
                {truncateMiddle(sqlMetadata(event).query ?? "(no query)", 96)}
              </li>
            ))}
          </ul>
        </div>
        <div className={styles.dependencyCard}>
          <div className={styles.dependencyTitle}>External HTTP</div>
          <div className={styles.dependencyMetric}>
            {httpEvents.length} {httpEvents.length === 1 ? "request" : "requests"}
            {" · "}
            {formatDuration(httpDuration)}
          </div>
          <ul className={styles.compactList}>
            {httpEvents.map((event) => {
              const meta = httpMetadata(event);
              return (
                <li key={event.event_id}>
                  {meta.method ?? "?"} {truncateMiddle(meta.url ?? "(no url)", 82)}
                  {" · "}
                  {meta.status_code ?? "—"}
                </li>
              );
            })}
          </ul>
        </div>
        <div className={styles.dependencyCard}>
          <div className={styles.dependencyTitle}>Exceptions</div>
          <div className={styles.dependencyMetric}>
            {exceptionEvents.length} captured
          </div>
        </div>
      </div>
    </section>
  );
}

function ExceptionInvestigation({
  events,
}: {
  events: TimelineExecutionEvent[];
}) {
  const exceptionEvents = events.filter(
    (event) => event.event_type === "EXCEPTION",
  );

  if (exceptionEvents.length === 0) {
    return null;
  }

  return (
    <section className={styles.panel} data-testid="exception-investigation">
      <h2 className={styles.sectionTitle}>Exception investigation</h2>
      <div className={styles.exceptionStack}>
        {exceptionEvents.map((event) => (
          <div key={event.event_id} className={styles.exceptionCard}>
            <ExceptionBody metadata={exceptionMetadata(event)} />
          </div>
        ))}
      </div>
    </section>
  );
}

function SlowestEvent({
  event,
}: {
  event: TimelineExecutionEvent | undefined;
}) {
  if (!event) {
    return null;
  }

  return (
    <div className={styles.slowest} data-testid="slowest-event">
      <span className={styles.metaLabel}>Slowest event</span>
      <span className={styles.metaValue}>
        {event.event_type} · {formatDuration(event.duration_ms)}
      </span>
    </div>
  );
}

export function RequestDetail({ requestId }: { requestId: string }) {
  const [summary, setSummary] = useState<RequestSummary | null>(null);
  const [timeline, setTimeline] = useState<RequestTimeline | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [backgroundError, setBackgroundError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [liveEnabled, setLiveEnabled] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(5000);
  const [reloadKey, setReloadKey] = useState(0);
  const inFlightRef = useRef<AbortController | null>(null);
  const hasVisibleDataRef = useRef(false);

  useEffect(() => {
    hasVisibleDataRef.current = Boolean(summary && timeline);
  }, [summary, timeline]);

  const loadDetail = useCallback(
    async ({ background }: { background: boolean }) => {
      inFlightRef.current?.abort();
      const controller = new AbortController();
      inFlightRef.current = controller;

      if (background) {
        setRefreshing(true);
        setBackgroundError(null);
      } else {
        setLoading(true);
        setError(null);
      }

      try {
        const [summaryResponse, timelineResponse] = await Promise.all([
          getRequestSummary(requestId, { signal: controller.signal }),
          getRequestTimeline(requestId, { signal: controller.signal }),
        ]);
        setSummary(summaryResponse);
        setTimeline(timelineResponse);
        setLastUpdated(new Date());
        setError(null);
        setBackgroundError(null);
      } catch (err) {
        if (controller.signal.aborted) {
          return;
        }
        const message =
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Failed to load request detail";
        if (background && hasVisibleDataRef.current) {
          setBackgroundError(message);
        } else {
          setError(message);
          setSummary(null);
          setTimeline(null);
        }
      } finally {
        if (inFlightRef.current === controller) {
          inFlightRef.current = null;
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [requestId],
  );

  useEffect(() => {
    void loadDetail({ background: false });
    return () => {
      inFlightRef.current?.abort();
    };
  }, [loadDetail, reloadKey]);

  useEffect(() => {
    if (!liveEnabled) {
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const schedule = () => {
      timer = setTimeout(async () => {
        if (cancelled) {
          return;
        }
        await loadDetail({ background: true });
        if (!cancelled) {
          schedule();
        }
      }, refreshInterval);
    };

    schedule();

    return () => {
      cancelled = true;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [liveEnabled, refreshInterval, loadDetail]);

  const slowestEvent = useMemo(
    () =>
      timeline?.events.reduce<TimelineExecutionEvent | undefined>(
        (slowest, event) =>
          !slowest || event.duration_ms > slowest.duration_ms ? event : slowest,
        undefined,
      ),
    [timeline],
  );

  if (loading) {
    return <LoadingState label="Loading request detail…" />;
  }

  if (error) {
    return (
      <ErrorState
        title="Failed to load request"
        message={error}
        onRetry={() => setReloadKey((value) => value + 1)}
      />
    );
  }

  if (!summary || !timeline) {
    return (
      <EmptyState
        title="Request not found"
        message="This request ID was not found in Apollo."
      />
    );
  }

  const request = summary.request;
  const requestLabel = `${request.method} ${request.path}`;
  const hasError = summary.has_error || request.status_code >= 400;
  const exceptionCount = summary.event_counts.EXCEPTION;
  const failureLabel =
    request.status_code >= 500
      ? exceptionCount > 0
        ? "Request failed · Exception captured"
        : "Request failed · No exception event captured"
      : hasError
        ? "Request has error signals"
        : "Request completed";

  return (
    <div className={styles.page} data-testid="request-detail">
      <Link href="/requests" className={styles.back}>
        ← Back to requests
      </Link>

      <div className={styles.liveBar}>
        <span data-testid="detail-live-indicator">
          Live {liveEnabled ? "ON" : "OFF"}
        </span>
        <span className={styles.metaValue} data-testid="detail-last-updated">
          Last updated {lastUpdated ? lastUpdated.toLocaleTimeString() : "—"}
        </span>
        {refreshing ? (
          <span className={styles.metaValue} data-testid="detail-refreshing">
            Refreshing…
          </span>
        ) : null}
        <label className={styles.inlineControl}>
          <input
            type="checkbox"
            checked={liveEnabled}
            onChange={(event) => setLiveEnabled(event.target.checked)}
            data-testid="detail-live-toggle"
          />
          Live
        </label>
        <select
          value={liveEnabled ? String(refreshInterval) : "off"}
          onChange={(event) => {
            if (event.target.value === "off") {
              setLiveEnabled(false);
              return;
            }
            setRefreshInterval(Number(event.target.value));
            setLiveEnabled(true);
          }}
          data-testid="detail-refresh-interval"
          aria-label="Detail refresh interval"
        >
          {REFRESH_INTERVALS.map((interval) => (
            <option key={interval.value} value={interval.value}>
              {interval.label}
            </option>
          ))}
          <option value="off">Off</option>
        </select>
      </div>

      {backgroundError ? (
        <div className={styles.refreshError} role="alert">
          Refresh failed: {backgroundError}
          <button
            type="button"
            className={styles.inlineButton}
            onClick={() => void loadDetail({ background: true })}
          >
            Retry
          </button>
        </div>
      ) : null}

      <header
        className={`${styles.header} ${hasError ? styles.headerError : ""}`}
        data-testid="request-header"
      >
        <div className={styles.titleRow}>
          <MethodBadge method={request.method} />
          <span className={styles.route}>{request.path}</span>
          <StatusBadge statusCode={request.status_code} />
          <span className={styles.statusText}>{statusLabel(request.status_code)}</span>
          <span className={styles.duration}>{formatDuration(request.duration_ms)}</span>
        </div>
        <div className={styles.failureLabel} data-testid="failure-label">
          {failureLabel}
        </div>
        <div className={styles.metaGrid}>
          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>Request ID</span>
            <span className={styles.metaValue}>{request.request_id}</span>
          </div>
          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>Timestamp</span>
            <span className={styles.metaValue}>{formatTimestamp(request.started_at)}</span>
          </div>
          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>Total events</span>
            <span className={styles.metaValue}>{summary.total_events}</span>
          </div>
          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>Execution duration</span>
            <span className={styles.metaValue}>
              {formatDuration(summary.total_execution_duration_ms)}
            </span>
          </div>
          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>Has error</span>
            <span className={styles.metaValue}>{summary.has_error ? "true" : "false"}</span>
          </div>
          <SlowestEvent event={slowestEvent} />
        </div>
      </header>

      <div className={styles.counts} data-testid="event-counts">
        <div className={styles.count}>
          <div className={styles.countLabel}>HTTP_IN</div>
          <div className={styles.countValue}>{summary.event_counts.HTTP_IN}</div>
        </div>
        <div className={styles.count}>
          <div className={styles.countLabel}>HTTP_OUT</div>
          <div className={styles.countValue}>{summary.event_counts.HTTP_OUT}</div>
        </div>
        <div className={styles.count}>
          <div className={styles.countLabel}>SQL</div>
          <div className={styles.countValue}>{summary.event_counts.SQL}</div>
        </div>
        <div className={styles.count}>
          <div className={styles.countLabel}>EXCEPTION</div>
          <div className={styles.countValue}>{summary.event_counts.EXCEPTION}</div>
        </div>
      </div>

      <DependencyView events={timeline.events} />
      <ExceptionInvestigation events={timeline.events} />

      <h2 className={styles.sectionTitle}>Execution waterfall</h2>
      <ExecutionTimeline
        events={timeline.events}
        requestLabel={requestLabel}
        requestStartedAt={request.started_at}
        requestDurationMs={request.duration_ms}
      />
    </div>
  );
}
