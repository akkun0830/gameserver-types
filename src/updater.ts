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
  /**
   * lock のキーとなるプラグイン名。
   *
   * 更新前の現ファイル名（旧 currentFile）はここに含めない。updater.ts は
   * 実行時に自分で readLock + reconcile 済みの lock を持っているため、
   * そちらから引く方が「ディスク上に実在するファイル名である」ことが
   * 保証される。Bot 側から送らせると、判定時点と実行時点のタイミングの
   * ズレを検証できないまま rm(..., { force: true }) に渡ることになり、
   * ズレていても静かに失敗して旧バージョンの jar が残置される
   * （同じプラグインの2バージョン同居）リスクがあった。
   */
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
  /**
   * docker-compose.yml 上のサービス名（例: "mc-java-plugin"）。
   *
   * dockerode（stopContainer/startContainer）が要求するフルコンテナ名
   * （例: "gameserver-mc-java-plugin-1"、updateServerAndPlugins の
   * containerName 引数）とは別物。`docker compose up -d` コマンドは
   * こちらのサービス名を要求するため、両者を混同すると
   * "no such service" エラーになる。
   */
  serviceName: string;
}

export type UpdateOutcome =
  | { kind: "lock_held"; heldSince: string }
  | { kind: "reconcile_failed"; result: ReconcileResult }
  | { kind: "download_failed"; error: string }
  | {
      /**
       * 本体更新の直前に取るワールドのスナップショット（scripts/snapshot.sh）が
       * 失敗したため、更新を開始しなかった。ディスク上は何も変更していない。
       *
       * 本体バージョンを跨ぐ更新はワールドデータを不可逆に変換するため、
       * 「戻せる状態」を確保できないまま走らせない、という判断でここで止める。
       * スナップショットが取れないのは大抵ディスク満杯か権限異常であり、
       * その状態で更新を続けるとロールバックすら怪しくなる。
       *
       * updatePlugins（プラグインのみの更新）はワールドを変換しないため
       * スナップショットを取らず、この種別も返さない。
       */
      kind: "snapshot_failed";
      error: string;
    }
  | {
      kind: "rolled_back";
      backupRef: string;
      diagnosis: string[];
      startup: StartupCheckResult;
    }
  | {
      /**
       * 復元（jar・プラグイン・.env の巻き戻し）と `docker compose up -d` は
       * 成功したが、その後の起動確認で正常起動を確認できなかった。
       *
       * rolled_back と分けるのは、ディスク上の状態は戻っているのにサーバーが
       * 動いていないという、手動対応が必要な状態だから。rolled_back を
       * 「戻して正常起動した」の意味に保つことで、Discord 表示側が
       * kind だけで正しく出し分けられる。
       *
       * 典型的な原因は本体バージョンを跨いだ更新でのワールドデータの非互換。
       * 新バージョンが一度ワールドをロードすると level.dat の DataVersion や
       * region の chunk が新形式に書き換わり、この変換は不可逆なため、
       * jar を旧バージョンへ戻しても読めなくなることがある。
       *
       * rollbackStartup の errorLines に原因のログが入る。diagnosis
       * （プラグイン容疑者）は更新時の startup を元にしたもので、
       * 復元後の失敗原因とは無関係な点に注意（復元でプラグインは
       * 元に戻っているため、プラグインが原因である可能性は低い）。
       */
      kind: "rollback_unhealthy";
      backupRef: string;
      diagnosis: string[];
      /** 更新後（新バージョン）の起動確認結果。 */
      startup: StartupCheckResult;
      /** 復元後（旧バージョン）の起動確認結果。 */
      rollbackStartup: StartupCheckResult;
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
  | {
      /**
       * `docker compose up -d` 自体が失敗し、起動確認（ログ監視）まで
       * 到達しなかった。rolled_back / rollback_failed と違い startup
       * フィールドを持たないのは、そもそもログ監視を行っていないため
       * （起動確認の結果が無いのに healthy/timedOut を詰めると、
       * 実際には確認していないのに確認したかのように読めてしまう）。
       */
      kind: "compose_failed";
      backupRef: string;
      error: string;
      /**
       * .env 復元・プラグイン復元によるロールバックに成功したか。
       * false の場合、ディスク上の状態（.env・plugins/）が中途半端なまま
       * 残っている可能性があり、手動対応が必要。
       */
      rolledBack: boolean;
    }
  | { kind: "success"; backupRef: string; updatedPlugins: string[] };
