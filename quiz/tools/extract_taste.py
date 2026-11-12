#!/usr/bin/env python3
"""把题库里的 score 抽成独立的 taste 文件。

设计意图
--------
题库回答的是「这个选项体现什么特质」（dims，客观描述）；
taste 回答的是「我们实验室喜欢什么样的人」（preference，主观偏好）。

两者混在一个文件里时，题库看起来自带标准答案——实际上那只是某一家机构的口味。
抽出来以后：
  · 换机构 → 只换 taste，题库不动
  · 口味变了 → 只更新 taste
  · taste 与题库指纹绑定，题库一改就报警，不会拿旧口味套新题

用法
----
    python3 tools/extract_taste.py                 # 首次抽取，生成 tastes/roma.json
    python3 tools/extract_taste.py --check         # 只校验绑定关系，不写文件
    python3 tools/extract_taste.py --taste roma    # 指定口味名（默认 roma）
"""
import argparse
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
QUIZ = os.path.dirname(HERE)
TASTE_DIR = os.path.join(QUIZ, 'tastes')
BANK_FILES = ['core.zh.json', 'extended.zh.json']
DIMS = ['BND', 'COM', 'EMP', 'INT', 'CRE', 'RES']
BANK_VERSION = '5.3.0'  # 由 tools/bump.py 同步；只在首次抽取生成 taste 时使用

TASTE_META = {
    'roma': {
        'name': 'ROMA Lab 口味 v2',
        'describe': (
            'ROMA Lab 的偏好取向，依据《ROMA Lab 实验室手册（2025 年版）》重设。'
            'v2 起强制每题四选项分值为 0-3 的排列，逐题取舍见 tastes/roma-v2-设计说明.md。'
        ),
    }
}


def check_permutation(taste, bank):
    """若口味声明 scale.distinct，每题选项分值必须是 range 的一次排列。"""
    scale = (taste.get('scale') or {})
    if scale.get('distinct') is not True or 'range' not in scale:
        return []
    lo, hi = scale['range']
    want = sorted(range(lo, hi + 1))
    bad = []
    for q in bank:
        row = taste['preference'].get(q['id'], {})
        vals = [row.get(o['id']) for o in q['options']]
        if any(v is None for v in vals):
            continue  # 覆盖问题由 --check 的另一段报告
        if sorted(vals) != want:
            bad.append(q['id'])
    return bad


def rehash(taste_path, bank):
    """手改 preference 后重算指纹与绑定并写回。"""
    taste = json.load(open(taste_path, encoding='utf-8'))
    bad = check_permutation(taste, bank)
    if bad:
        print('FAIL 以下题目分值不是 0-3 的排列：%s' % bad[:6])
        return 1
    taste['bank_binding']['bank_hash'] = hash_bank(bank)
    taste['bank_binding']['items'] = len(bank)
    taste['bank_binding']['options'] = sum(len(q['options']) for q in bank)
    taste['taste_hash'] = hash_taste(taste['preference'])
    with open(taste_path, 'w', encoding='utf-8') as fh:
        json.dump(taste, fh, ensure_ascii=False, indent=2)
        fh.write('\n')
    print('OK %s 指纹已更新：%s（题库 %s）'
          % (os.path.basename(taste_path), taste['taste_hash'], taste['bank_binding']['bank_hash']))
    return 0


def fnv1a16(text):
    """与 JS 端 hashBank 完全一致的 FNV-1a 32bit（按 UTF-16 code unit 遍历）。"""
    h = 0x811C9DC5
    units = text.encode('utf-16-le')
    for i in range(0, len(units), 2):
        cu = units[i] | (units[i + 1] << 8)
        h ^= cu
        h = (h * 0x01000193) & 0xFFFFFFFF
    return '%08x' % h


def hash_bank(bank):
    """只基于 qid + option id + dims，不含 taste 信息。"""
    s = '@'.join(
        '%s#%s' % (
            q['id'],
            '|'.join(
                '%s:%s' % (o['id'], '.'.join(str(o['dims'].get(d, 0)) for d in DIMS))
                for o in q['options']
            ),
        )
        for q in bank
    )
    return fnv1a16(s)


def hash_taste(pref):
    s = '|'.join(
        '%s:%s' % (qid, ','.join('%s=%d' % (k, v) for k, v in sorted(opts.items())))
        for qid, opts in sorted(pref.items())
    )
    return fnv1a16(s)


def load_bank():
    out = []
    for f in BANK_FILES:
        with open(os.path.join(QUIZ, f), encoding='utf-8') as fh:
            out += json.load(fh)
    return out


def make_taste(bank, taste_id='roma'):
    """从含 score 的题库构造 taste 对象。bank 必须是最终形态（已轮转、已重键）。"""
    pref, dist = {}, {}
    for q in bank:
        pref[q['id']] = {}
        for o in q['options']:
            if 'score' not in o:
                raise KeyError('题库 %s:%s 没有 score，无法抽取口味' % (q['id'], o['id']))
            v = int(o['score'])
            pref[q['id']][o['id']] = v
            dist[v] = dist.get(v, 0) + 1

    meta = TASTE_META.get(taste_id, {
        'name': taste_id,
        'describe': '（自定义口味，请补写取向说明）',
    })
    return {
        'schema': 'roma-cit-taste',
        'schema_version': 1,
        'taste_id': taste_id,
        'name': meta['name'],
        'version': '1.0.0',
        'describe': meta['describe'],
        'bank_binding': {
            'bank_version': BANK_VERSION,
            'bank_hash': hash_bank(bank),
            'items': len(bank),
            'options': sum(len(q['options']) for q in bank),
            'note': '此指纹由 qid + option + dims 计算，与 taste 无关。题库一改即失配，加载时必须拒绝。',
        },
        'scale': {
            'range': [0, 3],
            'meaning': '0 = 与实验室取向明显相左，3 = 最贴近实验室取向。中间值表示部分契合。',
            'usage': '仅用于契合度（ROMA Fit）、选项质量与风险提示，不参与六维分数的累加。',
        },
        'distribution': {str(k): dist[k] for k in sorted(dist)},
        'taste_hash': hash_taste(pref),
        'preference': pref,
    }


def save_bank(bank):
    core = [q for q in bank if int(q['id'][1:]) <= 20]
    ext = [q for q in bank if int(q['id'][1:]) > 20]
    for name, part in zip(BANK_FILES, (core, ext)):
        with open(os.path.join(QUIZ, name), 'w', encoding='utf-8') as fh:
            json.dump(part, fh, ensure_ascii=False, indent=2)
            fh.write('\n')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--taste', default='roma')
    ap.add_argument('--check', action='store_true')
    ap.add_argument('--rehash', action='store_true',
                    help='手改 preference 后重算 taste_hash 与 bank_binding 并写回')
    args = ap.parse_args()

    bank = load_bank()
    has_score = any('score' in o for q in bank for o in q['options'])
    bank_hash = hash_bank(bank)
    taste_path = os.path.join(TASTE_DIR, args.taste + '.json')

    if args.rehash:
        if not os.path.exists(taste_path):
            print('FAIL 没有 taste 文件：%s' % taste_path)
            return 1
        return rehash(taste_path, bank)

    if args.check:
        if not os.path.exists(taste_path):
            print('FAIL 没有 taste 文件：%s' % taste_path)
            return 1
        taste = json.load(open(taste_path, encoding='utf-8'))
        ok = True
        if has_score:
            print('FAIL 题库仍含 score 字段，说明还没抽干净')
            ok = False
        if taste['bank_binding']['bank_hash'] != bank_hash:
            print('FAIL 绑定指纹不一致：taste 记的是 %s，题库实际是 %s'
                  % (taste['bank_binding']['bank_hash'], bank_hash))
            ok = False
        missing = [(q['id'], o['id']) for q in bank for o in q['options']
                   if o['id'] not in taste['preference'].get(q['id'], {})]
        if missing:
            print('FAIL taste 未覆盖 %d 个选项，例如 %s' % (len(missing), missing[:3]))
            ok = False
        extra = [qid for qid in taste['preference'] if qid not in {q['id'] for q in bank}]
        if extra:
            print('FAIL taste 里有题库不存在的题：%s' % extra[:3])
            ok = False
        bad_perm = check_permutation(taste, bank)
        if bad_perm:
            print('FAIL 以下题目分值不是排列（distinct 口味要求每题互不相同）：%s' % bad_perm[:6])
            ok = False
        if taste.get('taste_hash') and taste['taste_hash'] != hash_taste(taste['preference']):
            print('FAIL 文件内 taste_hash 与 preference 不符（手改后请跑 --rehash）')
            ok = False
        if ok:
            n = sum(len(v) for v in taste['preference'].values())
            print('PASS taste %s 绑定正常：%d 题 / %d 选项 / 指纹 %s / 口味指纹 %s'
                  % (args.taste, len(taste['preference']), n, bank_hash, hash_taste(taste['preference'])))
        return 0 if ok else 1

    if not has_score:
        # 已经抽过了：只校验，不覆盖用户的 taste 文件
        print('题库已无 score 字段，跳过抽取。校验绑定：')
        sys.argv = [sys.argv[0], '--check', '--taste', args.taste]
        return main()

    taste = make_taste(bank, args.taste)
    pref = taste['preference']
    bank_hash = taste['bank_binding']['bank_hash']

    os.makedirs(TASTE_DIR, exist_ok=True)
    with open(taste_path, 'w', encoding='utf-8') as fh:
        json.dump(taste, fh, ensure_ascii=False, indent=2)
        fh.write('\n')

    for q in bank:
        for o in q['options']:
            o.pop('score', None)
    save_bank(bank)

    after = hash_bank(load_bank())
    status = 'OK' if after == bank_hash else 'FAIL'
    print('%s 已生成 %s' % (status, os.path.relpath(taste_path, QUIZ)))
    print('     题库指纹 %s（抽取前后一致=%s）' % (bank_hash, after == bank_hash))
    print('     taste 指纹 %s · %d 题 / %d 选项 · 分布 %s'
          % (taste['taste_hash'], len(pref), sum(len(v) for v in pref.values()),
             taste['distribution']))
    return 0 if after == bank_hash else 1


if __name__ == '__main__':
    sys.exit(main())
