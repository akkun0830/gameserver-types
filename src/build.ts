// =============================================================================
// Spigot本体の自前ビルド機能の型。
// 実装（BuildTools呼び出し、docker run --rm、成果物のsha256検証）は
// gameserver リポジトリの api/src/minecraft/build.ts にある。
//
// 既存の更新ジョブ（updater.ts の UpdateOutcome、jobs.ts の Job）とは
// 意図的に別系統にしている（詳細は minecraft-updater-plan.md
// 「ビルドジョブは既存の jobs.ts とは別系統（build-jobs.ts）にする」を参照）：
//   - kind が衝突する（両方に lock_held があり、単純な union にすると
//     判別可能ユニオンにならない）
//   - 既存の更新フローに手を入れずに済む
//   - jobId すら要らない（update.lock により1サーバーにつき同時1ビルドしか
//     走らないため、serverName をキーにすれば十分）
// =============================================================================

export interface ServerBuildRequest {
  /** ビルド対象の Minecraft バージョン（例: "26.3"）。 */
  mcVersion: string;
  /**
   * hub.spigotmc.org の hashes.Spigot（sha256）。
   * 必須にすることで「検証できないものはビルドしない」を型で表現する。
   */
  expectedSha256: string;
  /**
   * ビルドに使用する Java メジャーバージョンの範囲 [min, max]（例: [25, 26]）。
   * hub の javaVersions はクラスファイルのメジャーバージョン（例: [69, 70]）で
   * 返るため、Pi 側で -44 して変換済みの値を渡す。
   *
   * どの値を使ってビルダーイメージを作るかは Ubuntu 側が決める
   * （手持ちのビルダーイメージとの照合が必要で、その情報は実行側にしかないため）。
   * 通常は min を使う。
   */
  javaVersions: [number, number];
}

export type BuildOutcome =
  | { kind: "success"; file: string; sha256: string }
  /** 既に data/ 直下に成果物があり、ハッシュ検証も通った（ビルド自体は行っていない）。 */
  | { kind: "already_built"; file: string }
  /** BuildTools の実行自体が失敗した。 */
  | { kind: "build_failed"; error: string }
  /**
   * 既存 jar のハッシュが期待値と一致しなかった。削除して再ビルドはしない
   * （誰かが手で置いた・壊れた等の異常のシグナルであり、自動で消すと
   * 原因が分からなくなるため）。
   */
  | { kind: "hash_mismatch"; expected: string; actual: string }
  | { kind: "lock_held"; heldSince: string };

export type BuildJobState = "running" | "completed" | "failed";

/**
 * サーバー1台分の「最新のビルド状態」。update系の Job と違い jobId を持たない
 * （serverName をキーにした単純な Map で管理されるため。1サーバーにつき
 * update.lock で同時1ビルドしか走らない設計上、jobId による識別は不要）。
 * GET /servers/:name/build-job のレスポンス型。
 */
export interface BuildJob {
  serverName: string;
  state: BuildJobState;
  startedAt: string;
  finishedAt?: string;
  /** state === "completed" のときのみ。build.ts の結果をそのまま保持する。 */
  outcome?: BuildOutcome;
  /** state === "failed" のときのみ。想定外の例外が起きた場合のメッセージ。 */
  error?: string;
}
