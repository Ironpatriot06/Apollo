"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MethodBadge, StatusBadge } from "@/components/ui/Badges";
import { ErrorState, LoadingState } from "@/components/ui/States";
import styles from "@/app/overview.module.css";
import { ApiError } from "@/lib/api/client";
import {
  listErrorRequests,
  listExceptionRequests,
  listRequests,
  listSlowRequests,
} from "@/lib/api/requests";
import {
  DEFAULT_SLOW_THRESHOLD_MS,
  formatDuration,
} from "@/lib/format";
import type { RequestEvent } from "@/lib/types";

interface OverviewData {
  recentTotal: number;
  errorTotal: number;
  slowTotal: number;
  exceptionTotal: number;
  recent: RequestEvent[];
  errors: RequestEvent[];
  slow: RequestEvent[];
  exceptions: RequestEvent[];
}

function RequestList({
  title,
  items,
  empty,
  href,
}: {
  title: string;
  items: RequestEvent[];
  empty: string;
  href: string;
}) {
  return (
    <section className={styles.panel}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <h2 className={styles.panelTitle}>{title}</h2>
        <Link href={href} className={styles.statLink}>
          View all
        </Link>
      </div>
      {items.length === 0 ? (
        <p className={styles.muted}>{empty}</p>
      ) : (
        <div className={styles.list}>
          {items.map((request) => (
            <Link
              key={request.request_id}
              href={`/requests/${request.request_id}`}
              className={styles.row}
              data-testid="overview-request-row"
            >
              <MethodBadge method={request.method} />
              <span className={styles.path} title={request.path}>
                {request.path}
              </span>
              <StatusBadge statusCode={request.status_code} />
              <span className={styles.muted}>{formatDuration(request.duration_ms)}</span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

export function OverviewPage() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [recent, errors, slow, exceptions] = await Promise.all([
          listRequests({ limit: 8, offset: 0 }),
          listErrorRequests({ limit: 5, offset: 0 }),
          listSlowRequests({
            threshold_ms: DEFAULT_SLOW_THRESHOLD_MS,
            limit: 5,
            offset: 0,
          }),
          listExceptionRequests({ limit: 5, offset: 0 }),
        ]);

        if (!active) {
          return;
        }
        setData({
          recentTotal: recent.total,
          errorTotal: errors.total,
          slowTotal: slow.total,
          exceptionTotal: exceptions.total,
          recent: recent.items,
          errors: errors.items,
          slow: slow.items,
          exceptions: exceptions.items,
        });
      } catch (err) {
        if (!active) {
          return;
        }
        const message =
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Failed to load overview";
        setError(message);
        setData(null);
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
  }, [reloadKey]);

  if (loading) {
    return <LoadingState label="Loading overview…" />;
  }

  if (error || !data) {
    return (
      <ErrorState
        title="Failed to load overview"
        message={error ?? "Unknown error"}
        onRetry={() => setReloadKey((value) => value + 1)}
      />
    );
  }

  const investigate =
    data.errorTotal > 0
      ? "Errors are present — start with failed requests."
      : data.exceptionTotal > 0
        ? "Exceptions were recorded — inspect exception requests."
        : data.slowTotal > 0
          ? "Some requests exceed the slow threshold — inspect slow requests."
          : data.recentTotal > 0
            ? "No error or exception signals right now. Browse recent requests if something looks off."
            : "No requests ingested yet. Run the FastAPI demo to generate traffic.";

  return (
    <div className={styles.page} data-testid="overview-page">
      <header className={styles.header}>
        <h1 className={styles.title}>Overview</h1>
        <p className={styles.subtitle}>{investigate}</p>
      </header>

      <div className={styles.grid}>
        <div className={styles.stat}>
          <div className={styles.statLabel}>Total requests</div>
          <div className={styles.statValue}>{data.recentTotal}</div>
          <Link href="/requests" className={styles.statLink}>
            Browse requests
          </Link>
        </div>
        <div className={styles.stat}>
          <div className={styles.statLabel}>Errors (≥400)</div>
          <div className={styles.statValue}>{data.errorTotal}</div>
          <Link href="/requests?filter=errors" className={styles.statLink}>
            View errors
          </Link>
        </div>
        <div className={styles.stat}>
          <div className={styles.statLabel}>Slow (≥{DEFAULT_SLOW_THRESHOLD_MS}ms)</div>
          <div className={styles.statValue}>{data.slowTotal}</div>
          <Link href="/requests?filter=slow" className={styles.statLink}>
            View slow
          </Link>
        </div>
        <div className={styles.stat}>
          <div className={styles.statLabel}>With exceptions</div>
          <div className={styles.statValue}>{data.exceptionTotal}</div>
          <Link href="/requests?filter=exceptions" className={styles.statLink}>
            View exceptions
          </Link>
        </div>
      </div>

      <RequestList
        title="Recent requests"
        items={data.recent}
        empty="No recent requests."
        href="/requests"
      />
      <RequestList
        title="Error requests"
        items={data.errors}
        empty="No error requests."
        href="/requests?filter=errors"
      />
      <RequestList
        title="Slow requests"
        items={data.slow}
        empty="No slow requests."
        href="/requests?filter=slow"
      />
      <RequestList
        title="Exception requests"
        items={data.exceptions}
        empty="No exception requests."
        href="/requests?filter=exceptions"
      />
    </div>
  );
}
