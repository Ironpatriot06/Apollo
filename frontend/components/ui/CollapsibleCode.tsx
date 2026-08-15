"use client";

import { useState } from "react";
import styles from "@/components/ui/CollapsibleCode.module.css";

const DEFAULT_THRESHOLD = 320;

export function CollapsibleCode({
  value,
  threshold = DEFAULT_THRESHOLD,
  label = "content",
}: {
  value: string;
  threshold?: number;
  label?: string;
}) {
  const needsCollapse = value.length > threshold;
  const [expanded, setExpanded] = useState(false);
  const display =
    needsCollapse && !expanded ? `${value.slice(0, threshold)}…` : value;

  return (
    <div>
      <div className={styles.wrap}>
        <pre className={styles.pre}>{display}</pre>
      </div>
      {needsCollapse ? (
        <button
          type="button"
          className={styles.toggle}
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? `Collapse ${label}` : `Expand full ${label}`}
        </button>
      ) : null}
    </div>
  );
}
