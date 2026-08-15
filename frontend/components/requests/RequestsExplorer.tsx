"use client";

import { useEffect, useMemo, useState } from "react";
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
  const statusParam = searchParams.get("status");
  const status_code = statusParam ? Number(statusParam) : undefined;
  const offset = Number(searchParams.get("offset") ?? "0") || 0;
  const limit = Number(searchParams.get("limit") ?? String(DEFAULT_PAGE_SIZE)) || DEFAULT_PAGE_SIZE;
  const threshold_ms =
    Number(searchParams.get("threshold_ms") ?? String(DEFAULT_SLOW_THRESHOLD_MS)) ||
    DEFAULT_SLOW_THRESHOLD_MS;

  const [data, setData] = useState<RequestListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [draftMethod, setDraftMethod] = useState(method);
  const [draftPath, setDraftPath] = useState(path);
  const [draftStatus, setDraftStatus] = useState(statusParam ?? "");
  const [draftThreshold, setDraftThreshold] = useState(String(threshold_ms));

  useEffect(() => {
    setDraftMethod(method);
    setDraftPath(path);
    setDraftStatus(statusParam ?? "");
    setDraftThreshold(String(threshold_ms));
  }, [method, path, statusParam, threshold_ms]);

  const queryKey = useMemo(
    () =>
      JSON.stringify({
        filter,
        method,
        path,
        status_code,
        offset,
        limit,
        threshold_ms,
        reloadKey,
      }),
    [filter, method, path, status_code, offset, limit, threshold_ms, reloadKey],
  );

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetchRequestsForFilter(filter, {
          method: filter === "all" ? method || undefined : undefined,
          path: filter === "all" ? path || undefined : undefined,
          status_code:
            filter === "all" && Number.isFinite(status_code)
              ? status_code
              : undefined,
          offset,
          limit,
          threshold_ms,
        });
        if (!active) {
          return;
        }
        setData(response);
      } catch (err) {
        if (!active) {
          return;
        }
        const message =
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Failed to load requests";
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
  }, [queryKey, filter, method, path, status_code, offset, limit, threshold_ms]);

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
              onClick={clearFilters}
              data-testid="clear-filters"
            >
              Clear
            </button>
          </div>
        </form>
      </div>

      {loading ? <LoadingState label="Loading requests…" /> : null}
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
