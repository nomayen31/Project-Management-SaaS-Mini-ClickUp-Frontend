import { z } from "zod";

const healthResponse = z.object({ data: z.object({ status: z.literal("ok"), service: z.string() }) });
const readinessResponse = z.object({
  data: z.object({ status: z.literal("ready"), database: z.literal("connected") }),
});
const unavailableResponse = z.object({
  error: z.object({ code: z.literal("DATABASE_UNAVAILABLE") }),
});

export async function getApiHealth(signal: AbortSignal) {
  const response = await fetch("/api/health", { signal, cache: "no-store" });
  if (!response.ok) throw new Error("Could not reach the TaskFlow API.");
  return healthResponse.parse(await response.json()).data;
}

export async function getDatabaseReadiness(signal: AbortSignal) {
  const response = await fetch("/api/ready", { signal, cache: "no-store" });
  if (response.status === 503) {
    unavailableResponse.parse(await response.json());
    return "unavailable";
  }

  if (!response.ok) throw new Error("Could not check database readiness.");
  return readinessResponse.parse(await response.json()).data.database;
}
