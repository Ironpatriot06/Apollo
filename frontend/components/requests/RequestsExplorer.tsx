"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { RequestTable } from "@/components/requests/RequestTable";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/States";
import styles from "@/app/requests/requests.module.css";
import {
  DEFAULT_PAGE_SIZE,
  DEFAULT_SLOW_THRESHOLD_MS,
  fetchRequestsForFilter,
} from "@/lib/format";
import type { RequestListResponse, RequestQuickFilter } from "@/lib/types";
import { ApiError } from "@/lib/api/client";

const QUICK_FILTERS: { id: RequestQuickFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "slow", label: "Slow" },
  { id: "errors", label: "Errors" },
  { id: "exceptions", label: "Exceptions" },
];

const REFRESH_INTERVALS = [
  { label: "5 seconds", value: 5000 },
  { label: "10 seconds", value: 10000 },
  { label: "30 seconds", value: 30000 },
];

function parseQuickFilter(value: string | null): RequestQuickFilter {
  if (value === "slow" || value === "errors" || value === "exceptions") {
    return value;
  }
  return "all";
}

export function RequestsExplorer() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const filter = parseQuickFilter(searchParams.get("filter"));
  const method = searchParams.get("method") ?? "";
  const path = searchParams.get("path") ?? "";
  const search = searchParams.get("search") ?? "";
  const statusParam = searchParams.get("status");
  const status_code = statusParam ? Number(statusParam) : undefined;
  const offset = Number(searchParams.get("offset") ?? "0") || 0;
  const limit = Number(searchParams.get("limit") ?? String(DEFAULT_PAGE_SIZE)) || DEFAULT_PAGE_SIZE;
  const threshold_ms =
    Number(searchParams.get("threshold_ms") ?? String(DEFAULT_SLOW_THRESHOLD_MS)) ||
    DEFAULT_SLOW_THRESHOLD_MS;

  const [data, setData] = useState<RequestListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [backgroundError, setBackgroundError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [liveEnabled, setLiveEnabled] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(5000);
  const [reloadKey, setReloadKey] = useState(0);
  const inFlightRef = useRef<AbortController | null>(null);
  const dataRef = useRef<RequestListResponse | null>(null);

  const [draftMethod, setDraftMethod] = useState(method);
  const [draftPath, setDraftPath] = useState(path);
  const [draftSearch, setDraftSearch] = useState(search);
  const [draftStatus, setDraftStatus] = useState(statusParam ?? "");
  const [draftThreshold, setDraftThreshold] = useState(String(threshold_ms));

  useEffect(() => {
    setDraftMethod(method);
    setDraftPath(path);
    setDraftSearch(search);
    setDraftStatus(statusParam ?? "");
    setDraftThreshold(String(threshold_ms));
  }, [method, path, search, statusParam, threshold_ms]);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  const queryKey = useMemo(
    () =>
      JSON.stringify({
        filter,
        method,
        path,
        search,
        status_code,
        offset,
        limit,
        threshold_ms,
        reloadKey,
      }),
    [filter, method, path, search, status_code, offset, limit, threshold_ms, reloadKey],
  );

  const loadRequests = useCallback(
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
        const response = await fetchRequestsForFilter(
          filter,
          {
            method: filter === "all" ? method || undefined : undefined,
            path: filter === "all" ? path || undefined : undefined,
            search: filter === "all" ? search || undefined : undefined,
            status_code:
              filter === "all" && Number.isFinite(status_code)
                ? status_code
                : undefined,
            offset,
            limit,
            threshold_ms,
          },
          { signal: controller.signal },
        );

        setData(response);
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
              : "Failed to load requests";
        if (background && dataRef.current) {
          setBackgroundError(message);
        } else {
          setError(message);
          setData(null);
        }
      } finally {
        if (inFlightRef.current === controller) {
          inFlightRef.current = null;
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [filter, method, path, search, status_code, offset, limit, threshold_ms],
  );

  useEffect(() => {
    void loadRequests({ background: false });
    return () => {
      inFlightRef.current?.abort();
    };
  }, [queryKey, loadRequests]);

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
        await loadRequests({ background: true });
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
  }, [liveEnabled, refreshInterval, loadRequests]);

  function updateParams(mutator: (params: URLSearchParams) => void) {
    const params = new URLSearchParams(searchParams.toString());
    mutator(params);
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  function setQuickFilter(next: RequestQuickFilter) {
    updateParams((params) => {
      if (next === "all") {
        params.delete("filter");
      } else {
        params.set("filter", next);
        params.delete("method");
        params.delete("path");
        params.delete("status");
      }
      params.delete("offset");
      if (next === "slow" && !params.get("threshold_ms")) {
        params.set("threshold_ms", String(DEFAULT_SLOW_THRESHOLD_MS));
      }
    });
  }

  function applyFilters(event: React.FormEvent) {
    event.preventDefault();
    updateParams((params) => {
      params.set("filter", "all");
      params.delete("filter");
      if (draftMethod) {
        params.set("method", draftMethod.toUpperCase());
      } else {
        params.delete("method");
      }
      if (draftPath) {
        params.set("path", draftPath);
      } else {
        params.delete("path");
      }
      if (draftSearch) {
        params.set("search", draftSearch);
      } else {
        params.delete("search");
      }
      if (draftStatus) {
        params.set("status", draftStatus);
      } else {
        params.delete("status");
      }
      if (draftThreshold) {
        params.set("threshold_ms", draftThreshold);
      }
      params.delete("offset");
    });
  }

  function clearFilters() {
    router.push(pathname);
  }

  function clearSearch() {
    updateParams((params) => {
      params.delete("search");
      params.delete("offset");
    });
  }

  function goToPage(nextOffset: number) {
    updateParams((params) => {
      if (nextOffset <= 0) {
        params.delete("offset");
      } else {
        params.set("offset", String(nextOffset));
      }
    });
  }

  const total = data?.total ?? 0;
  const pageStart = total === 0 ? 0 : offset + 1;
  const pageEnd = Math.min(offset + limit, total);
  const canPrev = offset > 0;
  const canNext = offset + limit < total;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Requests</h1>
        <p className={styles.subtitle}>
          Browse captured HTTP requests. Path filter uses exact match.
        </p>
      </header>

      <div className={styles.toolbar}>
        <div className={styles.liveBar}>
          <div className={styles.liveStatus}>
            <span
              className={`${styles.liveDot} ${liveEnabled ? styles.liveDotOn : ""}`}
              aria-hidden
            />
            <span data-testid="live-indicator">
              Live {liveEnabled ? "ON" : "OFF"}
            </span>
            <span className={styles.meta} data-testid="last-updated">
              Last updated {lastUpdated ? lastUpdated.toLocaleTimeString() : "—"}
            </span>
            {refreshing ? (
              <span className={styles.meta} data-testid="refreshing-indicator">
                Refreshing…
              </span>
            ) : null}
          </div>
          <div className={styles.liveControls}>
            <label className={styles.inlineControl}>
              <input
                type="checkbox"
                checked={liveEnabled}
                onChange={(event) => setLiveEnabled(event.target.checked)}
                data-testid="live-toggle"
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
              data-testid="refresh-interval"
              aria-label="Refresh interval"
            >
              {REFRESH_INTERVALS.map((interval) => (
                <option key={interval.value} value={interval.value}>
                  {interval.label}
                </option>
              ))}
              <option value="off">Off</option>
            </select>
          </div>
        </div>

        <div className={styles.quickFilters} role="tablist" aria-label="Quick filters">
          {QUICK_FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={filter === item.id}
              className={`${styles.chip} ${filter === item.id ? styles.chipActive : ""}`}
              onClick={() => setQuickFilter(item.id)}
              data-testid={`quick-filter-${item.id}`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <form className={styles.filters} onSubmit={applyFilters}>
          <div className={styles.field}>
            <label htmlFor="search">Search request ID or path</label>
            <input
              id="search"
              value={draftSearch}
              onChange={(event) => setDraftSearch(event.target.value)}
              placeholder="explode or request id"
              disabled={filter !== "all"}
              data-testid="filter-search"
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="method">Method</label>
            <select
              id="method"
              value={draftMethod}
              onChange={(event) => setDraftMethod(event.target.value)}
              disabled={filter !== "all"}
              data-testid="filter-method"
            >
              <option value="">Any</option>
              <option value="GET">GET</option>
              <option value="POST">POST</option>
              <option value="PUT">PUT</option>
              <option value="PATCH">PATCH</option>
              <option value="DELETE">DELETE</option>
            </select>
          </div>
          <div className={styles.field}>
            <label htmlFor="path">Path (exact)</label>
            <input
              id="path"
              value={draftPath}
              onChange={(event) => setDraftPath(event.target.value)}
              placeholder="/users/42"
              disabled={filter !== "all"}
              data-testid="filter-path"
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="status">Status</label>
            <input
              id="status"
              value={draftStatus}
              onChange={(event) => setDraftStatus(event.target.value)}
              placeholder="200"
              inputMode="numeric"
              disabled={filter !== "all"}
              data-testid="filter-status"
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="threshold">Slow threshold (ms)</label>
            <input
              id="threshold"
              value={draftThreshold}
              onChange={(event) => setDraftThreshold(event.target.value)}
              inputMode="decimal"
              data-testid="filter-threshold"
            />
          </div>
          <div className={styles.actions}>
            <button type="submit" className={styles.button} data-testid="apply-filters">
              Apply
            </button>
            <button
              type="button"
              className={styles.button}
              onClick={clearSearch}
              data-testid="clear-search"
            >
              Clear search
            </button>
            <button
              type="button"
              className={styles.button}
              onClick={clearFilters}
              data-testid="clear-filters"
            >
              Clear
            </button>
          </div>
        </form>
      </div>

      {loading ? <LoadingState label="Loading requests…" /> : null}
      {backgroundError && data ? (
        <div className={styles.refreshError} role="alert">
          Refresh failed: {backgroundError}
          <button
            type="button"
            className={styles.inlineButton}
            onClick={() => void loadRequests({ background: true })}
          >
            Retry
          </button>
        </div>
      ) : null}
      {!loading && error ? (
        <ErrorState
          title="Failed to load requests"
          message={error}
          onRetry={() => setReloadKey((value) => value + 1)}
        />
      ) : null}
      {!loading && !error && data && data.items.length === 0 ? (
        <EmptyState
          title="No requests found"
          message="No requests match the current filters. Generate traffic from the FastAPI demo or clear filters."
        />
      ) : null}
      {!loading && !error && data && data.items.length > 0 ? (
        <>
          <div className={styles.meta} data-testid="request-count">
            Showing {pageStart}–{pageEnd} of {total}
          </div>
          <RequestTable requests={data.items} />
          <div className={styles.pagination}>
            <button
              type="button"
              className={styles.button}
              disabled={!canPrev}
              onClick={() => goToPage(Math.max(0, offset - limit))}
              data-testid="pagination-prev"
            >
              Previous
            </button>
            <span className={styles.meta}>
              Offset {offset} · Limit {limit}
            </span>
            <button
              type="button"
              className={styles.button}
              disabled={!canNext}
              onClick={() => goToPage(offset + limit)}
              data-testid="pagination-next"
            >
              Next
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
