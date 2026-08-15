"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { MethodBadge, StatusBadge } from "@/components/ui/Badges";
import styles from "@/app/requests/requests.module.css";
import type { RequestEvent } from "@/lib/types";
import { formatDuration, formatTimestamp, isErrorStatus } from "@/lib/format";

export function RequestTable({ requests }: { requests: RequestEvent[] }) {
  const router = useRouter();

  return (
    <div className={styles.tableWrap}>
      <table className={styles.table} data-testid="request-table">
        <thead>
          <tr>
            <th>Method</th>
            <th>Path</th>
            <th>Status</th>
            <th>Duration</th>
            <th>Timestamp</th>
            <th>Request ID</th>
          </tr>
        </thead>
        <tbody>
          {requests.map((request) => {
            const href = `/requests/${request.request_id}`;
            const error = isErrorStatus(request.status_code);
            return (
              <tr
                key={request.request_id}
                className={error ? styles.errorRow : undefined}
                data-testid="request-row"
                data-request-id={request.request_id}
                onClick={() => router.push(href)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    router.push(href);
                  }
                }}
                tabIndex={0}
                role="link"
              >
                <td>
                  <MethodBadge method={request.method} />
                </td>
                <td className={styles.path} title={request.path}>
                  <Link href={href} onClick={(event) => event.stopPropagation()}>
                    {request.path}
                  </Link>
                </td>
                <td>
                  <StatusBadge statusCode={request.status_code} />
                </td>
                <td className={styles.mono}>{formatDuration(request.duration_ms)}</td>
                <td className={styles.mono}>{formatTimestamp(request.started_at)}</td>
                <td className={styles.id} title={request.request_id}>
                  {request.request_id}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
