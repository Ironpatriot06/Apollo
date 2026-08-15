import styles from "@/components/ui/Badges.module.css";

export function MethodBadge({ method }: { method: string }) {
  const key = method.toUpperCase();
  const className =
    key === "GET"
      ? styles.get
      : key === "POST"
        ? styles.post
        : key === "PUT" || key === "PATCH"
          ? styles.put
          : key === "DELETE"
            ? styles.delete
            : styles.other;

  return <span className={`${styles.badge} ${className}`}>{key}</span>;
}

export function StatusBadge({ statusCode }: { statusCode: number }) {
  const tone =
    statusCode >= 500
      ? styles.err
      : statusCode >= 400
        ? styles.warn
        : styles.ok;

  return (
    <span className={`${styles.status} ${tone}`} data-testid="status-badge">
      {statusCode}
    </span>
  );
}
