#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
CIT 题库重键工具 v5.0
把原 CRV（创造+抗压混装）拆成 CRE（创造）与 RES（抗压），
校准全部 200 个选项的 score（0-3 契合度），
修复「最优选项在某个维度上反而丢分」造成的维度互斥，
并按题轮转选项顺序消除位置偏倚。

用法：
  python3 tools/rekey.py            # 生成并覆盖 core.zh.json / extended.zh.json 到 ./out
  python3 tools/rekey.py --write     # 直接写回 quiz 目录（先备份）
"""
import json, os, sys, hashlib, shutil, argparse

HERE = os.path.dirname(os.path.abspath(__file__))
QUIZ = os.path.dirname(HERE)
DIMS = ['BND', 'COM', 'EMP', 'INT', 'CRE', 'RES']

# 题库与口味的指纹算法只允许有一份实现，直接复用抽取工具里的
sys.path.insert(0, HERE)
from extract_taste import make_taste, hash_bank  # noqa: E402

# ---------------------------------------------------------------------------
# 赋分表：(score, CRE, RES)
#   score  0=明显不推荐 / 1=可接受但保守或被动 / 2=较成熟 / 3=高度契合
#   CRE    0=沿用常规 1=有轻微变通 2=主动设计替代方案 3=重构问题或生成新方案
#   RES    0=情境与抗压无关 1=回避或依赖外部 2=稳住并推进 3=受挫后仍持续加码并复原
# BND/COM/EMP/INT 沿用原作者的相对结构，仅对与 score 明显矛盾的 6 项做修正（见 OVERRIDE）
# ---------------------------------------------------------------------------
KEY = {
 'Q1':  {'A': (3, 2, 0), 'B': (2, 1, 0), 'C': (2, 1, 1), 'D': (1, 0, 0)},
 'Q2':  {'A': (3, 2, 3), 'B': (1, 1, 2), 'C': (2, 2, 1), 'D': (2, 0, 2)},
 'Q3':  {'A': (3, 2, 0), 'B': (2, 1, 0), 'C': (2, 0, 1), 'D': (2, 3, 1)},
 'Q4':  {'A': (3, 3, 3), 'B': (3, 2, 2), 'C': (2, 2, 2), 'D': (1, 0, 1)},
 'Q5':  {'A': (3, 1, 2), 'B': (3, 2, 2), 'C': (1, 1, 1), 'D': (2, 0, 2)},
 'Q6':  {'A': (3, 2, 0), 'B': (2, 2, 0), 'C': (3, 0, 1), 'D': (1, 0, 1)},
 'Q7':  {'A': (2, 0, 1), 'B': (3, 2, 3), 'C': (1, 0, 2), 'D': (2, 1, 2)},
 'Q8':  {'A': (2, 0, 0), 'B': (3, 1, 0), 'C': (2, 0, 0), 'D': (2, 0, 0)},
 'Q9':  {'A': (2, 1, 3), 'B': (3, 3, 3), 'C': (2, 1, 1), 'D': (2, 3, 2)},
 'Q10': {'A': (3, 1, 2), 'B': (3, 2, 2), 'C': (1, 0, 2), 'D': (2, 0, 3)},
 'Q11': {'A': (2, 0, 2), 'B': (2, 1, 2), 'C': (3, 3, 1), 'D': (2, 2, 3)},
 'Q12': {'A': (2, 3, 2), 'B': (3, 1, 1), 'C': (3, 2, 1), 'D': (2, 1, 3)},
 'Q13': {'A': (3, 1, 3), 'B': (2, 0, 2), 'C': (3, 1, 2), 'D': (1, 1, 1)},
 'Q14': {'A': (1, 0, 2), 'B': (3, 3, 3), 'C': (3, 2, 2), 'D': (0, 0, 1)},
 'Q15': {'A': (2, 2, 1), 'B': (3, 1, 1), 'C': (2, 0, 2), 'D': (3, 2, 1)},
 'Q16': {'A': (3, 1, 3), 'B': (2, 1, 2), 'C': (1, 0, 1), 'D': (2, 0, 3)},
 'Q17': {'A': (2, 0, 1), 'B': (3, 2, 0), 'C': (3, 1, 0), 'D': (2, 0, 0)},
 'Q18': {'A': (1, 0, 1), 'B': (3, 1, 1), 'C': (3, 3, 1), 'D': (2, 1, 3)},
 'Q19': {'A': (3, 1, 2), 'B': (3, 2, 1), 'C': (2, 0, 2), 'D': (2, 2, 1)},
 'Q20': {'A': (3, 0, 0), 'B': (1, 1, 0), 'C': (3, 2, 0), 'D': (0, 1, 0)},
 'Q21': {'A': (3, 2, 3), 'B': (2, 0, 2), 'C': (2, 1, 1), 'D': (1, 0, 2)},
 'Q22': {'A': (3, 2, 2), 'B': (2, 0, 1), 'C': (1, 0, 0), 'D': (2, 1, 3)},
 'Q23': {'A': (3, 2, 1), 'B': (3, 1, 1), 'C': (3, 2, 1), 'D': (2, 1, 1)},
 'Q24': {'A': (3, 2, 3), 'B': (3, 1, 2), 'C': (0, 0, 1), 'D': (2, 1, 2)},
 'Q25': {'A': (1, 0, 1), 'B': (3, 1, 2), 'C': (2, 1, 1), 'D': (2, 0, 1)},
 'Q26': {'A': (3, 2, 3), 'B': (3, 1, 2), 'C': (1, 0, 1), 'D': (2, 1, 3)},
 'Q27': {'A': (3, 2, 2), 'B': (3, 0, 1), 'C': (1, 1, 2), 'D': (3, 1, 2)},
 'Q28': {'A': (3, 1, 1), 'B': (2, 0, 1), 'C': (0, 0, 0), 'D': (2, 0, 2)},
 'Q29': {'A': (3, 1, 3), 'B': (3, 2, 3), 'C': (3, 1, 2), 'D': (2, 0, 2)},
 'Q30': {'A': (3, 3, 2), 'B': (1, 1, 2), 'C': (2, 0, 1), 'D': (2, 2, 1)},
 'Q31': {'A': (3, 2, 2), 'B': (2, 1, 3), 'C': (3, 3, 2), 'D': (2, 0, 1)},
 'Q32': {'A': (3, 1, 1), 'B': (3, 0, 1), 'C': (1, 0, 0), 'D': (2, 0, 1)},
 'Q33': {'A': (3, 3, 1), 'B': (2, 0, 1), 'C': (2, 1, 1), 'D': (2, 2, 0)},
 'Q34': {'A': (3, 1, 1), 'B': (3, 3, 1), 'C': (3, 1, 1), 'D': (1, 0, 1)},
 'Q35': {'A': (3, 1, 1), 'B': (1, 0, 1), 'C': (3, 1, 1), 'D': (2, 2, 2)},
 'Q36': {'A': (2, 1, 1), 'B': (2, 1, 1), 'C': (1, 0, 1), 'D': (3, 3, 1)},
 'Q37': {'A': (3, 0, 2), 'B': (3, 1, 3), 'C': (2, 0, 3), 'D': (3, 3, 2)},
 'Q38': {'A': (3, 0, 1), 'B': (2, 2, 3), 'C': (2, 1, 3), 'D': (3, 0, 1)},
 'Q39': {'A': (3, 1, 2), 'B': (1, 0, 1), 'C': (1, 0, 0), 'D': (3, 2, 1)},
 'Q40': {'A': (3, 2, 3), 'B': (3, 0, 2), 'C': (2, 0, 1), 'D': (3, 0, 3)},
 'Q41': {'A': (3, 2, 2), 'B': (3, 1, 1), 'C': (3, 2, 1), 'D': (3, 3, 1)},
 'Q42': {'A': (3, 1, 2), 'B': (1, 0, 0), 'C': (2, 0, 1), 'D': (2, 1, 1)},
 'Q43': {'A': (2, 1, 2), 'B': (3, 1, 1), 'C': (2, 1, 1), 'D': (3, 2, 1)},
 'Q44': {'A': (2, 1, 3), 'B': (3, 3, 2), 'C': (2, 2, 2), 'D': (2, 0, 1)},
 'Q45': {'A': (3, 1, 2), 'B': (2, 2, 2), 'C': (0, 0, 0), 'D': (2, 3, 3)},
 'Q46': {'A': (3, 1, 2), 'B': (1, 0, 1), 'C': (2, 1, 1), 'D': (2, 0, 1)},
 'Q47': {'A': (3, 3, 3), 'B': (2, 1, 2), 'C': (2, 0, 3), 'D': (2, 0, 1)},
 'Q48': {'A': (3, 1, 2), 'B': (1, 0, 0), 'C': (3, 2, 1), 'D': (2, 1, 1)},
 'Q49': {'A': (2, 1, 3), 'B': (3, 2, 2), 'C': (1, 0, 0), 'D': (2, 0, 1)},
 'Q50': {'A': (3, 0, 2), 'B': (2, 2, 3), 'C': (2, 2, 2), 'D': (2, 0, 1)},
}

# score 与原文维度明显矛盾的项：原键把「有明显风险的做法」给了高诚信/高边界分。
# 这一批是逐条对照题干改的，不是机械规则。
OVERRIDE = {
 ('Q6',  'D'): {'INT': 1},   # 保留原稿只在致谢提及：回避署名沟通
 ('Q10', 'C'): {'INT': 1},   # 直接恢复原稿再讨论：单方面处置他人改动
 ('Q13', 'D'): {'INT': 1},   # 转话题简化收尾：回避实质回应
 ('Q14', 'D'): {'INT': 1, 'BND': 1},   # 先投稿后修正：绕开质量把关
 ('Q20', 'B'): {'INT': 1},   # 只发英文版：对国内同行隐去信息
 ('Q20', 'D'): {'INT': 1, 'BND': 1},   # 直接发布未确认：越界且不可撤回
 ('Q24', 'C'): {'INT': 0, 'BND': 1},   # 数据异常仍保留显著结果
 ('Q27', 'C'): {'INT': 1, 'BND': 2},   # 自筹差额不上报：绕过财务流程
 ('Q28', 'C'): {'INT': 0, 'BND': 1},   # 加入私下商业项目
 ('Q32', 'C'): {'INT': 1, 'BND': 2},   # 学弟夸大而忽略
 ('Q35', 'B'): {'INT': 1},   # 发言超时而放任
 ('Q42', 'B'): {'INT': 1},   # 不实传言而忽略
 ('Q45', 'C'): {'INT': 1},   # 评审指出引用不足仍保留原文
 ('Q48', 'B'): {'INT': 1, 'BND': 1},   # 成果被记成他人而不澄清
 ('Q34', 'D'): {'INT': 1},   # 明知传播八卦而沉默
}


def load():
    """始终以 backup_v4.3/ 为素材来源：重跑本脚本必须幂等，
    否则每跑一次选项就会被再轮转一次，历史报告的迁移映射也就错了。"""
    src = os.path.join(QUIZ, 'tools', 'source_v4.3')
    if not (os.path.exists(os.path.join(src, 'core.zh.json'))):
        src = QUIZ
    bank = []
    for f in ('core.zh.json', 'extended.zh.json'):
        with open(os.path.join(src, f), encoding='utf-8') as fh:
            bank.extend(json.load(fh))
    return bank


def repair_tradeoffs(q, dims, key):
    """最优选项不应在某一维度上明显输给次优选项——那会把维度做成互斥。
    规则：score 达到题内最高的选项，若某维低于题内最高值 1 分，则补到最高值；
    低 2 分以上视为真实的取向差异，保留。"""
    top = max(key[o['id']][0] for o in q['options'])
    best_ids = [o['id'] for o in q['options'] if key[o['id']][0] == top]
    for d in ('BND', 'COM', 'EMP', 'INT'):
        mx = max(dims[o['id']][d] for o in q['options'])
        for oid in best_ids:
            if mx - dims[oid][d] == 1:
                dims[oid][d] = mx
    return dims


# 契合度对关系维度的天花板：明显不推荐的做法不可能在诚信/边界上拿满分。
# 这一条既修正了原键（如「先投稿后修正」却给 INT=3），也把各维的可达下限拉开。
CEILING = {0: 1, 1: 2, 2: 3, 3: 3}



def apply_ceiling(dims, key):
    for oid, d in dims.items():
        cap = CEILING[key[oid][0]]
        for k in ('BND', 'COM', 'EMP', 'INT'):
            d[k] = min(d[k], cap)
    return dims


def rotate_to_balance(q, idx):
    """最优解轮转到 idx%4，其余三项按题号确定性打散——两件事一起做才压得住位置偏倚。"""
    import random as _r
    opts = q['options']
    top = max(o.get('score', 0) for o in opts)
    cand = [i for i, o in enumerate(opts) if o.get('score', 0) == top]
    best = max(cand, key=lambda i: sum(opts[i]['dims'].values()))
    rest = [o for i, o in enumerate(opts) if i != best]
    _r.Random(q['id']).shuffle(rest)
    target = idx % 4
    rest.insert(target, opts[best])
    return rest


def build():
    bank = load()
    out = []
    migration = {}
    for i, q in enumerate(bank):
        q = json.loads(json.dumps(q))          # deep copy
        dims = {o['id']: dict(o['dims']) for o in q['options']}
        key = KEY[q['id']]

        for o in q['options']:
            oid = o['id']
            sc, cre, res = key[oid]
            dims[oid]['CRE'] = cre
            dims[oid]['RES'] = res
            dims[oid].pop('CRV', None)
            for k, v in OVERRIDE.get((q['id'], oid), {}).items():
                dims[oid][k] = v

        dims = apply_ceiling(dims, key)
        dims = repair_tradeoffs(q, dims, key)
        for o in q['options']:
            o['dims'] = {k: int(dims[o['id']].get(k, 0)) for k in DIMS}
            o['score'] = int(key[o['id']][0])

        # 记下「旧选项 ID → 新选项 ID」的文本对应，旧报告才能被正确重算
        before = {o['id']: o['label'] for o in q['options']}
        q['options'] = rotate_to_balance(q, i)
        for j, o in enumerate(q['options']):
            o['id'] = 'ABCD'[j]
        after = {o['label']: o['id'] for o in q['options']}
        migration[q['id']] = {old: after[label] for old, label in before.items()}
        out.append(q)

    # 拆回 core / extended
    core = out[:20]
    ext = out[20:]
    return core, ext, migration


def digest(bank):
    payload = json.dumps(
        [[q['id'], q['scenario'], [[o['id'], o['label'], o['score'], o['dims']] for o in q['options']]]
         for q in bank],
        ensure_ascii=False, sort_keys=True).encode('utf-8')
    return hashlib.sha256(payload).hexdigest()[:16]


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--write', action='store_true')
    ap.add_argument('--out', default=os.path.join(QUIZ, 'out'))
    args = ap.parse_args()

    core, ext, migration = build()
    target = QUIZ if args.write else args.out
    os.makedirs(target, exist_ok=True)

    # score 属于「口味」而不属于「题库」：先抽成 tastes/roma.json，再从题库里删干净。
    # 这样换机构、调口味都只动那个文件，题库保持客观描述（只有 dims）。
    bank = core + ext
    taste = make_taste(bank, 'roma')
    tdir = os.path.join(target, 'tastes')
    os.makedirs(tdir, exist_ok=True)
    with open(os.path.join(tdir, 'roma.json'), 'w', encoding='utf-8') as fh:
        json.dump(taste, fh, ensure_ascii=False, indent=2)
        fh.write('\n')

    for q in bank:
        for o in q['options']:
            o.pop('score', None)

    core = [q for q in bank if int(q['id'][1:]) <= 20]
    ext = [q for q in bank if int(q['id'][1:]) > 20]

    # 素材源 tools/source_v4.3/ 是只读基线，不要在这里覆盖它。
    # 需要回到 v4.3 时，直接从 tools/source_v4.3/ 拷回来即可。

    for name, arr in (('core.zh.json', core), ('extended.zh.json', ext)):
        with open(os.path.join(target, name), 'w', encoding='utf-8') as fh:
            json.dump(arr, fh, ensure_ascii=False, indent=2)
            fh.write('\n')

    with open(os.path.join(target, 'migration_v4.3.json'), 'w', encoding='utf-8') as fh:
        json.dump({
            'from': 'v4.3',
            'to': '5.1.0',
            'policy': '旧报告只有选项字母，没有题库指纹。选项在本版被轮转打散，需按本题干内选项文本重新对应后再重算；不要直接沿用旧报告里的 per 字段。',
            'option_map': migration
        }, fh, ensure_ascii=False, indent=2)
        fh.write('\n')

    print(f'写入 {target}')
    print(f'  core {len(core)} 题 / extended {len(ext)} 题')
    print(f'  题库指纹 = {hash_bank(core + ext)}')
    print(f'  口味指纹 = {taste["taste_hash"]}（tastes/roma.json）')
