import { describe, expect, it } from "vitest";

import {
  areKnownTags,
  counterpartOptionLabel,
  isKnownCounterpart,
  selectableOptions,
  type Counterpart,
  type Tag,
} from "@/lib/receipts/labels";

const ME = "user-a";

const counterparts: Counterpart[] = [
  { id: 1, kind: "member", userId: ME, name: "A", isHidden: false },
  { id: 2, kind: "member", userId: "user-b", name: "B", isHidden: false },
  { id: 3, kind: "default", userId: null, name: "ふたり", isHidden: false },
  { id: 4, kind: "default", userId: null, name: "実家", isHidden: true },
];

const tags: Tag[] = [
  { id: 5, name: "朝食", isHidden: false },
  { id: 6, name: "旧タグ", isHidden: true },
];

describe("相手・タグ（lib/receipts/labels.ts）", () => {
  it("U-103: ログイン中のユーザー自身だけ「自分（A）」と表示し、非表示の相手には（非表示）を付ける", () => {
    expect(counterparts.map((c) => counterpartOptionLabel(c, ME))).toEqual([
      "自分（A）",
      "B",
      "ふたり",
      "実家（非表示）",
    ]);
    // ログイン中のユーザーが分からないときは名前のまま
    expect(counterpartOptionLabel(counterparts[0], undefined)).toBe("A");
  });

  it("U-103: 選択肢は表示中のものに、選ばれている非表示のものだけを加える", () => {
    expect(selectableOptions(counterparts, [""]).map((c) => c.id)).toEqual([1, 2, 3]);
    expect(selectableOptions(counterparts, ["4"]).map((c) => c.id)).toEqual([1, 2, 3, 4]);
    expect(selectableOptions(tags, []).map((t) => t.id)).toEqual([5]);
    expect(selectableOptions(tags, ["6"]).map((t) => t.id)).toEqual([5, 6]);
  });

  it("U-103: グループの相手・タグか（非表示も既存の値として正しい）", () => {
    expect(isKnownCounterpart("4", counterparts)).toBe(true);
    expect(isKnownCounterpart("99", counterparts)).toBe(false);
    expect(areKnownTags([], tags)).toBe(true);
    expect(areKnownTags(["5", "6"], tags)).toBe(true);
    expect(areKnownTags(["5", "99"], tags)).toBe(false);
  });
});
