import { z } from "zod";

// =============================================================================
// plugins.lock.json のスキーマと型。
//
// 実装（read/write/reconcile/recordUpdate 等）は gameserver リポジトリの
// api/src/minecraft/lock.ts にある。このパッケージにはスキーマと型だけを置き、
// Ubuntu側（gameserver）・Pi側（gameserver-bot）の両方がここから import する。
// 二重管理を避けるため、gameserver側の lock.ts もこのパッケージのスキーマを
// re-export する形に揃える。
// =============================================================================

export const SCHEMA_VERSION = 1 as const;

export const jarTypeSchema = z.enum([
  "vanilla",
  "snapshot",
  "spigot",
  "paper",
  "purpur",
  "neoforge",
  "fabric",
]);
export type JarType = z.infer<typeof jarTypeSchema>;

export const sourceKindSchema = z.enum([
  "modrinth",
  "github",
  "hangar",
  "url",
  "manual",
]);
export type SourceKind = z.infer<typeof sourceKindSchema>;

export const pluginLoaderSchema = z.enum(["spigot", "bukkit", "paper", "purpur"]);
export type PluginLoader = z.infer<typeof pluginLoaderSchema>;

export const modLoaderSchema = z.enum(["fabric", "neoforge"]);
export type ModLoader = z.infer<typeof modLoaderSchema>;

export const isoDateTimeSchema = z.iso.datetime({ offset: true });

export const hashSchema = z.object({
  algo: z.enum(["sha1", "sha256"]),
  value: z.string(),
});
export type FileHash = z.infer<typeof hashSchema>;

export const serverPreviousSchema = z.object({
  mc_version: z.string(),
  backup_ref: z.string(),
});
export type ServerPrevious = z.infer<typeof serverPreviousSchema>;

export const serverEntrySchema = z.object({
  name: z.string(),
  jar_type: jarTypeSchema,
  mc_version: z.string(),
  hash: hashSchema,
  file: z.string(),
  installed_at: isoDateTimeSchema,
  previous: serverPreviousSchema.nullable(),
});
export type ServerEntry = z.infer<typeof serverEntrySchema>;

export const entryPreviousSchema = z.object({
  version: z.string(),
  file: z.string(),
  backup_ref: z.string(),
});
export type EntryPrevious = z.infer<typeof entryPreviousSchema>;

/**
 * plugin / mod で共通のエントリ形状。loader だけ呼び出し側で絞り込む。
 * zod は TS のジェネリクスと違い実行時スキーマなので、loader の型を
 * 差し替えたバリアントを2つ用意して合成する。
 */
function entrySchema<L extends z.ZodTypeAny>(loader: L) {
  return z.object({
    source: sourceKindSchema,
    project_id: z.string().optional(),
    version: z.string(),
    version_id: z.string().optional(),
    file: z.string(),
    sha512: z.string(),
    loader: loader.optional(),
    required: z.boolean(),
    installed_at: isoDateTimeSchema,
    previous: entryPreviousSchema.nullable(),
  });
}

export const pluginEntrySchema = entrySchema(pluginLoaderSchema);
export type PluginEntry = z.infer<typeof pluginEntrySchema>;

export const modEntrySchema = entrySchema(modLoaderSchema);
export type ModEntry = z.infer<typeof modEntrySchema>;

export const pluginsLockSchema = z.object({
  $schema_version: z.literal(SCHEMA_VERSION),
  server: serverEntrySchema,
  plugins: z.record(z.string(), pluginEntrySchema),
  mods: z.record(z.string(), modEntrySchema),
  last_check: isoDateTimeSchema,
  last_update: isoDateTimeSchema,
});
export type PluginsLock = z.infer<typeof pluginsLockSchema>;

export interface ReconcileDiff {
  /** lock に記録されているが実ファイルが存在しない */
  missing: string[];
  /** 実ファイルは存在するが lock に記録がない */
  untracked: string[];
  /** ハッシュが lock の記録と一致しない（エントリ名） */
  corrupted: string[];
}

export interface ReconcileResult {
  plugins: ReconcileDiff;
  mods: ReconcileDiff;
  isClean: boolean;
}
