import type { UpdateOutcome } from "./updater.js";

// =============================================================================
// minecraft/jobs.ts の型。実装（startJob/getJob 等、メモリ上のジョブストア）は
// gameserver リポジトリの api/src/minecraft/jobs.ts にある。
// Bot 側は POST /update のレスポンス（jobId）と、GET /update-jobs/:jobId の
// レスポンス（この Job 型）をポーリングして Discord に進捗を表示する。
// =============================================================================

export type JobState = "running" | "completed" | "failed";

export interface Job {
  id: string;
  serverName: string;
  state: JobState;
  startedAt: string;
  finishedAt?: string;
  /** state === "completed" のときのみ。updater.ts の結果をそのまま保持する。 */
  outcome?: UpdateOutcome;
  /** state === "failed" のときのみ。想定外の例外が起きた場合のメッセージ。 */
  error?: string;
}
