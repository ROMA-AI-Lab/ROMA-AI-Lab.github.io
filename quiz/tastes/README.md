# tastes/ · 口味文件

这套测试分两半：

| 文件 | 回答的问题 | 谁可以改 |
|---|---|---|
| `core.zh.json` / `extended.zh.json` | 这个选项**体现什么特质**（`dims`，六维各 0–3） | 改题的人。改了要重跑全套审计 |
| `tastes/*.json` | 我们**喜欢什么样的人**（`preference`，每选项 0–3） | 换机构、换年份、换招生取向时改这里，题库不动 |

混在一起写的时候，题库看起来像「自带标准答案」——其实那只是某一家的口味。分开以后，同一个题库可以服务不同机构的不同取向。

## 现在有哪几套

| id | 名称 | 用在哪 |
|---|---|---|
| `roma` | ROMA Lab 口味 v2（强制 0-3 排列） | 学生端与导师端默认加载（`CIT.DEFAULT_TASTE`） |

## 文件长什么样

```jsonc
{
  "schema": "roma-cit-taste",
  "taste_id": "roma",
  "name": "ROMA Lab 口味 v2",
  "version": "2.0.0",
  "describe": "依据实验室手册重设……",          // 给人看，导师端会显示
  "bank_binding": {
    "bank_version": "5.1.0",
    "bank_hash": "60aa6407",                 // 绑定的题库指纹
    "items": 50,
    "options": 200
  },
  "scale": { "range": [0, 3], "distinct": true, "meaning": "0=明显相左，3=最贴近" },
  "taste_hash": "2d89e5d1",
  "preference": {
    "Q1": { "A": 3, "B": 2, "C": 1, "D": 0 },
    "Q2": { ... }
  }
}
```

`preference` 必须**逐题逐选项**写全（50 题 × 4 选项 = 200 个值），不能只写部分——漏一个，`bindTaste()` 会直接判定不可用。

**v2 强制规则（`scale.distinct: true`）**：每题四个选项的分值必须恰好是 `{0,1,2,3}` 的一个排列——
每道题都必须给出完整的取舍顺序，不允许「两个选项同样喜欢」。违反时 `bindTaste()` 报
`not-distinct` 错误并拒绝加载。理由：任何两个选项之间都有高下，学生的每次选择都在暴露真实偏好；
同时每题总分恒为 6，题与题之间权重天然均等。roma 的逐题取舍依据见 `roma-v2-设计说明.md`。
自定义口味若不想要这条约束，把 `scale.distinct` 设为 `false` 即可（但不建议——并列分会稀释区分度）。

## 给另一个机构做一套

1. 复制 `roma.json` → `tastes/<新机构>.json`，改 `taste_id` / `name` / `describe`。
2. 按他们的取向重调 `preference` 里的数值，`taste_hash` 和 `bank_binding.bank_hash` 先不用管。
3. 用脚本重新计算并写回指纹与绑定：

```bash
python3 tools/extract_taste.py --rehash --taste <新机构>
```

4. 让页面用这一套：改 `scoring.js` 里的 `DEFAULT_TASTE`，或者给 URL 加参数（当前未实现，需要时再加）。

## 绑定规则（重要）

题库指纹只由 `qid + option + dims` 计算，**刻意不含口味分**。所以：

- 换口味 → 题库指纹不变，旧报告仍然可比
- 改题、改选项、改维度分 → 题库指纹变，所有口味文件立即失配

失配以后两端都会**拒绝加载**而不是警告了事（`app.js` 直接抛错，`faculty.js` 在诊断里标红）。这是有意的：拿旧口味套新题会静默算出错分，比报错难查得多。

改完题库后的正确顺序：

```bash
python3 tools/rekey.py --write     # 重键 + 重新生成 tastes/roma.json（会覆盖！先备份自定义口味）
python3 tools/audit.py             # 题库体检
python3 tools/philosophy_audit.py  # 设计理念体检
node tests/scoring.test.js
node tests/e2e.mjs
```

注意 `rekey.py --write` 会用重新算出的偏好覆盖 `tastes/roma.json`。如果你手调过 roma 的口味，先把文件备份出去，跑完再把 `preference` 合并回来并重算 `taste_hash`。

## 自检

```bash
python3 tools/extract_taste.py --check            # 题库无 score、口味覆盖完整、指纹匹配
python3 tools/extract_taste.py --check --taste x  # 检查另一套口味
```
