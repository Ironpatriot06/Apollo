"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ExecutionTimeline } from "@/components/timeline/ExecutionTimeline";
import { MethodBadge, StatusBadge } from "@/components/ui/Badges";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/States";
import styles from "@/app/requests/[requestId]/detail.module.css";
import { ApiError } from "@/lib/api/client";
import { getRequestSummary, getRequestTimeline } from "@/lib/api/events";
import {
  formatDuration,
  formatTimestamp,
  statusLabel,
} from "@/lib/format";
import type { RequestSummary, RequestTimeline } from "@/lib/types";

export function RequestDetail({ requestId }: { requestId: string }) {
  const [summary, setSummary] = useState<RequestSummary | null>(null);
  const [timeline, setTimeline] = useState<RequestTimeline | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [summaryResponse, timelineResponse] = await Promise.all([
          getRequestSummary(requestId),
          getRequestTimeline(requestId),
        ]);
        if (!active) {
          return;
        }
        setSummary(summaryResponse);
        setTimeline(timelineResponse);
      } catch (err) {
        if (!active) {
          return;
        }
        const message =
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Failed to load request detail";
        setError(message);
        setSummary(null);
        setTimeline(null);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [requestId, reloadKey]);

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

  return (
    <div className={styles.page} data-testid="request-detail">
      <Link href="/requests" className={styles.back}>
        ← Back to requests
      </Link>

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

      <h2 className={styles.sectionTitle}>Execution timeline</h2>
      <ExecutionTimeline events={timeline.events} requestLabel={requestLabel} />
    </div>
  );
}
