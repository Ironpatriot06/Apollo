import { Suspense } from "react";
import { RequestsExplorer } from "@/components/requests/RequestsExplorer";
import { LoadingState } from "@/components/ui/States";

export default function RequestsPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading requests…" />}>
      <RequestsExplorer />
    </Suspense>
  );
}
