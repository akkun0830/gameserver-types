import type { PluginsLock, ReconcileResult } from "./lock.js";

// =============================================================================
// minecraft/updater.ts の入出力型。
// 実装（updatePlugins/updateServerAndPlugins 本体）は gameserver リポジトリの
// api/src/minecraft/updater.ts にある。Bot 側（gameserver-bot）は
// PluginUpdateRequest を組み立てて API に送り、UpdateOutcome を受け取って
// Discord に表示する用途でこの型を使う。
// =============================================================================

/** サーバー起動確認の結果。api/src/minecraft/startup-check.ts の型と同一。 */
export interface StartupCheckResult {
  healthy: boolean;
  timedOut: boolean;
  errorLines: string[];
}

export interface PluginUpdateRequest {
  /** lock のキーとなるプラグイン名。 */
  name: string;
  resolved: {
    version: string;
    versionId?: string;
    downloadUrl: string;
    sha512: string;
    filename: string;
    loader?: string;
  };
  source: PluginsLock["plugins"][string]["source"];
  projectId?: string;
  required: boolean;
  /** 更新前の現ファイル名。新規追加プラグインなら null。 */
  currentFile: string | null;
}

export interface ServerUpdateRequest {
  /** 新しい Minecraft バージョン（例: "26.3"）。 */
  mcVersion: string;
  /** .env の対象キー名（例: "MC_JAVA_PLUGIN_VERSION"）。 */
  envKey: string;
  /** .env / docker-compose.yml のあるディレクトリ。 */
  composeDir: string;
  /** .env ファイルのパス。 */
  envPath: string;
}

export type UpdateOutcome =
  | { kind: "lock_held"; heldSince: string }
  | { kind: "reconcile_failed"; result: ReconcileResult }
  | { kind: "download_failed"; error: string }
  | {
      kind: "rolled_back";
      backupRef: string;
      diagnosis: string[];
      startup: StartupCheckResult;
    }
  | {
      kind: "rollback_failed";
      backupRef: string;
      diagnosis: string[];
      startup: StartupCheckResult;
      rollbackError: string;
    }
  | {
      /**
       * サーバー自体は正常起動したが、更新後の本体JARファイルを検出できず
       * lock に記録できなかった。サーバーは新バージョンで動作しているが
       * lock が古い情報のまま乖離した状態を意味する。success として扱うと
       * 次回の判定（checker.ts）が誤った現在バージョンを前提にしてしまうため、
       * 独立した結果種別として区別する。ロールバックはしない
       * （サーバー自体は正常なので、無闇に戻す方が実害が大きい）。
       */
      kind: "server_jar_not_found";
      searchedIn: string;
    }
  | { kind: "success"; backupRef: string; updatedPlugins: string[] };
