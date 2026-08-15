import styles from "@/components/ui/States.module.css";

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div className={styles.wrap} role="status" aria-live="polite">
      <div className={styles.spinner} aria-hidden />
      <p className={styles.message}>{label}</p>
    </div>
  );
}

export function EmptyState({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <div className={styles.wrap}>
      <h2 className={styles.title}>{title}</h2>
      <p className={styles.message}>{message}</p>
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  message,
  onRetry,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className={`${styles.wrap} ${styles.error}`}>
      <h2 className={styles.title}>{title}</h2>
      <p className={styles.message}>{message}</p>
      {onRetry ? (
        <div className={styles.actions}>
          <button type="button" className={styles.button} onClick={onRetry}>
            Retry
          </button>
        </div>
      ) : null}
    </div>
  );
}
