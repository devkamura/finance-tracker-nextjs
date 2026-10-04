"use client";

import { Fragment } from "react";

import { Tooltip } from "@/components/ui/Tooltip";
import {
  DIMENSION_LABELS,
  DIMENSIONS,
  dimensionOptions,
  isDimension,
  type Dimension,
  type DimensionMaster,
  type DimensionOption,
} from "@/lib/analytics/dimensions";
import type { AnalyticsFilter } from "@/lib/analytics/url-state";

type SplitFilterControlsProps = {
  master: DimensionMaster;
  // 円グラフの「分ける」。推移グラフでは使わないため null（欄を出さない）
  split: Dimension | null;
  onChangeSplit: (split: Dimension) => void;
  filter: AnalyticsFilter | null;
  onChangeFilter: (filter: AnalyticsFilter | null) => void;
};

const NONE_VALUE = "none";

// 選択肢を、続けて並ぶ同じ見出しごとにまとめる（見出しのない選択肢はそのまま並べる）
function groupOptions(
  options: DimensionOption[]
): { group: string | undefined; options: DimensionOption[] }[] {
  const blocks: { group: string | undefined; options: DimensionOption[] }[] = [];
  for (const option of options) {
    const last = blocks[blocks.length - 1];
    if (last && last.group === option.group) {
      last.options.push(option);
    } else {
      blocks.push({ group: option.group, options: [option] });
    }
  }
  return blocks;
}

// 項目名の横の「i」で開く説明。どの支出を対象にするか（絞り込み）→ それを何ごとに区切るか（分ける）の
// 順に読めるよう、画面でも絞り込みを上に置く。
const FILTER_HELP =
  "グラフの対象にする支出を選びます。例：「カテゴリ」→「食費」にすると、食費だけを集計します。「なし」はすべての支出です。";
const SPLIT_HELP =
  "対象の支出を、何ごとに区切って円グラフにするかを選びます。例：絞り込み「食費」で分ける「内訳」にすると、自炊・外食・間食の割合が分かります。";

const selectClass =
  "rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-900";

// 分析画面の「絞り込み」「分ける」（docs/分析拡充/基本設計書.md 2.9節、詳細設計書 F4 5章）。
// 絞り込みは項目（カテゴリ・内訳など）を選んでから、その値（食費など）を選ぶ。
// 項目を選んだときは、選択肢の先頭の値で絞り込む。選択肢のない項目は選べないようにする。
// 支払い先の値は、見出し（グループ全体・自分用・相方の自分用）ごとにまとめて出す。
export function SplitFilterControls({
  master,
  split,
  onChangeSplit,
  filter,
  onChangeFilter,
}: SplitFilterControlsProps) {
  const filterOptions = filter ? dimensionOptions(filter.dimension, master) : [];

  const changeFilterDimension = (value: string) => {
    if (!isDimension(value)) {
      onChangeFilter(null);
      return;
    }
    const first = dimensionOptions(value, master)[0];
    onChangeFilter(first ? { dimension: value, key: first.key } : null);
  };

  return (
    // 枠は条件の折りたたみ（AnalyticsConditionsPanel）が持つため、ここでは並べるだけにする
    <div className="flex flex-col gap-3 text-sm text-slate-600">
      <div className="flex items-center gap-2">
        <span className="flex w-20 shrink-0 items-center gap-1">
          絞り込み
          <Tooltip text={FILTER_HELP} align="start" />
        </span>
        <select
          value={filter?.dimension ?? NONE_VALUE}
          onChange={(e) => changeFilterDimension(e.target.value)}
          aria-label="絞り込む項目"
          className={`${filter ? "w-28 shrink-0" : "min-w-0 flex-1"} ${selectClass}`}
        >
          <option value={NONE_VALUE}>なし</option>
          {DIMENSIONS.map((d) => (
            <option key={d} value={d} disabled={dimensionOptions(d, master).length === 0}>
              {DIMENSION_LABELS[d]}
            </option>
          ))}
        </select>
        {filter && (
          <select
            value={filter.key}
            onChange={(e) => onChangeFilter({ dimension: filter.dimension, key: e.target.value })}
            aria-label={`絞り込む${DIMENSION_LABELS[filter.dimension]}`}
            className={`min-w-0 flex-1 ${selectClass}`}
          >
            {groupOptions(filterOptions).map((block, index) =>
              block.group === undefined ? (
                <Fragment key={`plain-${index}`}>
                  {block.options.map((o) => (
                    <option key={o.key} value={o.key}>
                      {o.label}
                    </option>
                  ))}
                </Fragment>
              ) : (
                <optgroup key={block.group} label={block.group}>
                  {block.options.map((o) => (
                    <option key={o.key} value={o.key}>
                      {o.label}
                    </option>
                  ))}
                </optgroup>
              )
            )}
          </select>
        )}
      </div>
      {split !== null && (
        // 説明の「i」ボタンを置くため label で囲まない（label 内のボタンは文字のタップでも押されてしまう）
        <div className="flex items-center gap-2">
          <span className="flex w-20 shrink-0 items-center gap-1">
            分ける
            <Tooltip text={SPLIT_HELP} align="start" />
          </span>
          <select
            value={split}
            onChange={(e) => isDimension(e.target.value) && onChangeSplit(e.target.value)}
            aria-label="分ける項目"
            className={`min-w-0 flex-1 ${selectClass}`}
          >
            {DIMENSIONS.map((d) => (
              <option key={d} value={d}>
                {DIMENSION_LABELS[d]}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
