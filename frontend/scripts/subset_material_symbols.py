"""Material Symbols 子集化（由 scripts/subset-material-symbols.ts 调用）。

原理：Material Symbols 用连字（liga）把图标名渲染成字形。直接按字符子集化
会因为 GSUB 闭包保留全部连字（所有图标名都是 a-z0-9_），起不到瘦身效果。
所以先把字体 GSUB 里的连字表裁剪到只剩用到的图标，再做常规子集化，
闭包就只会带上需要的图标字形。

输入：src/assets/material-symbols-icons.json 的 scanned 列表
输出：src/assets/material-symbols-outlined-subset.woff2 + 回写 subset 列表
依赖：pip install fonttools brotli
"""
import json
import sys
from pathlib import Path

from fontTools.subset import Options, Subsetter
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[1]
FONT_IN = ROOT / "node_modules" / "material-symbols" / "material-symbols-outlined.woff2"
MANIFEST = ROOT / "src" / "assets" / "material-symbols-icons.json"
FONT_OUT = ROOT / "src" / "assets" / "material-symbols-outlined-subset.woff2"

TEXT = "abcdefghijklmnopqrstuvwxyz0123456789_"


def glyph_to_char(font):
    return {g: chr(cp) for cp, g in font.getBestCmap().items()}


def iter_liga_subtables(gsub):
    for lookup in gsub.table.LookupList.Lookup:
        subtables = lookup.SubTable
        if lookup.LookupType == 7:  # Extension
            subtables = [st.ExtSubTable for st in subtables]
            if not subtables or subtables[0].LookupType != 4:
                continue
        elif lookup.LookupType != 4:
            continue
        yield from subtables


def prune_ligatures(font, wanted):
    """把 liga 连字裁剪到 wanted 集合，返回字体里实际存在的图标名集合。"""
    g2c = glyph_to_char(font)
    present = set()
    for st in iter_liga_subtables(font["GSUB"]):
        for first, ligas in list(st.ligatures.items()):
            first_ch = g2c.get(first, "")
            kept = []
            for liga in ligas:
                name = first_ch + "".join(g2c.get(c, "?") for c in liga.Component)
                if name in wanted:
                    present.add(name)
                    kept.append(liga)
            if kept:
                st.ligatures[first] = kept
            else:
                del st.ligatures[first]
    return present


def main():
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    wanted = set(manifest["scanned"])

    font = TTFont(str(FONT_IN))
    present = prune_ligatures(font, wanted)

    options = Options()
    options.flavor = "woff2"
    # Material Symbols 的连字挂在 rclt/rlig（浏览器默认开启的必需特性）下
    options.layout_features = ["rclt", "rlig", "liga", "calt"]
    subsetter = Subsetter(options)
    subsetter.populate(text=TEXT)
    subsetter.subset(font)
    font.save(str(FONT_OUT))

    # 校验：子集字体里每个图标的连字都在
    check = TTFont(str(FONT_OUT))
    remained = prune_ligatures(check, present)
    missing = present - remained
    if missing:
        print(f"ERROR: icons missing after subset: {sorted(missing)}")
        sys.exit(1)

    skipped = sorted(wanted - present)
    manifest["subset"] = sorted(present)
    MANIFEST.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    size_kb = FONT_OUT.stat().st_size / 1024
    print(f"subset font: {len(present)} icons, {size_kb:.0f} KB -> {FONT_OUT}")
    if skipped:
        print(f"note: {len(skipped)} scanned strings are not icon names (skipped): {skipped}")


if __name__ == "__main__":
    main()
