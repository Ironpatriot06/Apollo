"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "@/components/layout/Sidebar.module.css";

const NAV = [
  { href: "/", label: "Overview" },
  { href: "/requests", label: "Requests" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className={styles.sidebar}>
      <div className={styles.brand}>
        <span className={styles.brandName}>Apollo</span>
        <span className={styles.brandSub}>Observability Console</span>
      </div>
      <nav className={styles.nav} aria-label="Primary">
        {NAV.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`${styles.link} ${active ? styles.active : ""}`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className={styles.footer}>Developer observability</div>
    </aside>
  );
}
