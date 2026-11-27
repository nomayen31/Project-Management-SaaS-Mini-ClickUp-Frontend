"use client";

import { Activity, RefreshCw } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { getApiHealth, getDatabaseReadiness } from "@/lib/api";

export function HealthPanel() {
  const health = useQuery({
    queryKey: ["api-health"],
    queryFn: ({ signal }) => getApiHealth(signal),
    retry: false,
  });
  const readiness = useQuery({
    queryKey: ["database-readiness"],
    queryFn: ({ signal }) => getDatabaseReadiness(signal),
    retry: false,
  });

  return (
    <section className="status-panel" aria-labelledby="status-title">
      <div className="status-top">
        <span className="activity-icon"><Activity size={21} /></span>
        <Button variant="icon" aria-label="Check API again" onClick={() => { void health.refetch(); void readiness.refetch(); }} disabled={health.isFetching || readiness.isFetching}>
          <RefreshCw size={16} />
        </Button>
      </div>
      <div>
        <h2 id="status-title">API connection</h2>
        <p role="status" className="status-label" data-state={health.isFetching ? "pending" : health.isError ? "error" : "ok"}>
          {health.isFetching ? "Checking connection…" : health.isError ? "API unavailable" : "Connected"}
        </p>
      </div>
      <p className="status-detail">
        {health.isError ? "Start the backend and check again." : health.data?.service ?? "Waiting for the backend response."}
      </p>
      <div className="border-t border-line pt-3">
        <h3>Database</h3>
        <p className="status-detail" role="status">
          {readiness.isFetching && "Checking database…"}
          {!readiness.isFetching && readiness.isError && "Could not check database."}
          {!readiness.isFetching && !readiness.isError && readiness.data === "unavailable" && "Database unavailable"}
          {!readiness.isFetching && !readiness.isError && readiness.data === "connected" && "Database connected"}
        </p>
      </div>
    </section>
  );
}
