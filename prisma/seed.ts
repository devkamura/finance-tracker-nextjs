import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

// seedスクリプトは本番イメージにapp/libを含めず単独で実行できるようにするため、
// lib/prisma.ts のシングルトンには依存せずここでクライアントを直接生成する。
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// 元となるDjango版の実データ（src/fixtures/initial_data.json）を移植。
// 「該当なし」はUI側の定数として扱うためここには含めない。
const STORES = [
  "OK",
  "APITA",
  "マツモトキヨシ",
  "スシロー",
  "セブンイレブン",
  "ファミリーマート",
  "マクドナルド",
  "メルカリ",
  "Amazon",
  "吉野家",
  "すき家",
  "Seria",
  "ほねごり",
  "くら寿司",
];

const TRANSACTION_TYPES = ["支出", "返金"];

const CONSUMPTION_TAXES = [
  { name: "税込", multiplier: "1.00" },
  { name: "税別(8%)", multiplier: "1.08" },
  { name: "税別(10%)", multiplier: "1.10" },
  { name: "税なし", multiplier: "1.00" },
];

const CATEGORIES = [
  "食費",
  "交通費",
  "医療費",
  "娯楽",
  "日用品",
  "宿泊・旅行",
  "学習・自己投資",
  "その他",
];

const PURPOSES = ["個人", "交際費", "仕事", "家族", "生活維持"];

const SCENES = [
  "朝食",
  "昼食",
  "夕食",
  "間食",
  "飲み物",
  "副業",
  "飲み会",
  "デート",
  "趣味",
  "通院・薬局",
  "宿泊",
];

async function main() {
  await Promise.all(
    STORES.map((name) =>
      prisma.store.upsert({ where: { name }, update: {}, create: { name } })
    )
  );

  await Promise.all(
    TRANSACTION_TYPES.map((name) =>
      prisma.transactionType.upsert({
        where: { name },
        update: {},
        create: { name },
      })
    )
  );

  await Promise.all(
    CONSUMPTION_TAXES.map((tax) =>
      prisma.consumptionTax.upsert({
        where: { name: tax.name },
        update: { multiplier: tax.multiplier },
        create: tax,
      })
    )
  );

  await Promise.all(
    CATEGORIES.map((name) =>
      prisma.category.upsert({ where: { name }, update: {}, create: { name } })
    )
  );

  await Promise.all(
    PURPOSES.map((name) =>
      prisma.purpose.upsert({ where: { name }, update: {}, create: { name } })
    )
  );

  await Promise.all(
    SCENES.map((name) =>
      prisma.scene.upsert({ where: { name }, update: {}, create: { name } })
    )
  );

  console.log("シード投入が完了しました。");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
