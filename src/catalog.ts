import { z } from "zod";

// =============================================================================
// サービスカタログ（GET /servers/catalog）とステータス（GET /servers/status）の型。
//
// サービスの一覧と Discord 向けの属性は、Ubuntu 側の docker-compose.yml の
// ラベル（gameserver.*）が唯一の定義元。API がラベルを検証してここの形に
// 変換し、Bot はこの形だけを知る（ラベル名や compose の構造は知らない）。
// 詳細は gameserver リポジトリの service-labels-design.md を参照。
// =============================================================================

/**
 * Discord 上のグループ。ステータス表示のチャンネルと起動コマンド
 * （/minecraft /ark /7dtd）の振り分けに使う。
 *
 * compose の gameserver.group ラベルの値。ここに無い値が書かれていたら
 * API がカタログの取得をエラーにする（Bot 側に受け皿となるチャンネル設定・
 * コマンドが無いため、黙って通すとどこにも表示されないサービスができる）。
 * グループを足すときは、ここと Bot の CHANNEL_GROUPS・起動コマンドを揃えて足す。
 */
export const serviceGroupSchema = z.enum(["minecraft", "ark", "sdtd"]);
export type ServiceGroup = z.infer<typeof serviceGroupSchema>;

/**
 * Discord に出すサービスの属性。3つは揃って存在する（compose の
 * gameserver.group / display-name / discord-startable は全部書くか全部書かないか）。
 */
export const discordServiceSchema = z.object({
  group: serviceGroupSchema,
  displayName: z.string().min(1),
  /** Discord の起動コマンドから起動できるか。API の /start もこれを確認する。 */
  startable: z.boolean(),
});
export type DiscordService = z.infer<typeof discordServiceSchema>;

export const catalogServiceSchema = z.object({
  /** docker-compose.yml のサービス名（例: "mc-java-plugin"）。 */
  name: z.string().min(1),
  /** Discord に出さないサービス（mariadb、mc-java-test-plugin 等）は null。 */
  discord: discordServiceSchema.nullable(),
});
export type CatalogService = z.infer<typeof catalogServiceSchema>;

export const serviceCatalogSchema = z.object({
  services: z.array(catalogServiceSchema),
});
export type ServiceCatalog = z.infer<typeof serviceCatalogSchema>;

/**
 * GET /servers/status の1サービス分。Discord に出すサービスだけが含まれる。
 * 表示に必要な属性（表示名・グループ）も一緒に返すので、Bot はステータス
 * 表示のためにカタログを別途引く必要がない。
 */
export interface ServerStatus {
  name: string;
  displayName: string;
  group: ServiceGroup;
  running: boolean;
}

export interface ServersStatus {
  servers: ServerStatus[];
  machine: {
    online: boolean;
  };
}
