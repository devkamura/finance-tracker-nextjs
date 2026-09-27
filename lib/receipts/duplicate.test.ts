import { describe, expect, it } from "vitest";

import { OWNER_JOINT_VALUE } from "@/lib/constants";
import { buildPartnerItems, findPartner } from "@/lib/receipts/duplicate";
import type { ReceiptItem } from "@/types/receipt";

const ME = "user-me";
const PARTNER = "user-partner";

function buildItem(overrides: Partial<ReceiptItem> = {}): ReceiptItem {
  return {
    clientId: "1",
    name: "牛乳",
    price: "200",
    taxType: "exclusive",
    taxRateId: "1",
    categoryId: "2",
    purposeId: "3",
    sceneIds: ["4", "5"],
    ownerUserId: OWNER_JOINT_VALUE,
    ...overrides,
  };
}

describe("buildPartnerItems", () => {
  it("U-52: 帰属先は私→相方のみ置き換え、相方・共同はそのまま、その他の項目は元と同じ", () => {
    const items = [
      buildItem({ clientId: "1", ownerUserId: ME }),
      buildItem({ clientId: "2", ownerUserId: PARTNER }),
      buildItem({ clientId: "3", ownerUserId: OWNER_JOINT_VALUE }),
    ];

    const result = buildPartnerItems(items, ME, PARTNER);

    expect(result.map((item) => item.ownerUserId)).toEqual([
      PARTNER,
      PARTNER,
      OWNER_JOINT_VALUE,
    ]);
    // 帰属先以外は元と同じ（帰属先だけ元の値に揃えて比較する）
    result.forEach((item, index) => {
      expect({ ...item, ownerUserId: items[index].ownerUserId }).toEqual(
        items[index]
      );
    });
  });

  it("U-52: 元の明細（シーン配列含む）を書き換えない", () => {
    const items = [buildItem({ ownerUserId: ME })];

    const result = buildPartnerItems(items, ME, PARTNER);
    result[0].sceneIds.push("99");

    expect(items[0].ownerUserId).toBe(ME);
    expect(items[0].sceneIds).toEqual(["4", "5"]);
  });
});

describe("findPartner", () => {
  it("U-53: 2人グループでは自分以外のメンバーを返す", () => {
    const members = [
      { userId: ME, displayName: "私" },
      { userId: PARTNER, displayName: "相方" },
    ];
    expect(findPartner(members, ME)).toEqual({
      userId: PARTNER,
      displayName: "相方",
    });
  });

  it("U-53: 自分しかいない場合はnullを返す", () => {
    expect(findPartner([{ userId: ME }], ME)).toBeNull();
  });
});
