#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""CIT 题库质量审计 v5.0
区分度 / 可达区间 / 维度相关 / 位置均衡 / 潜变量回收 / 校准参数生成

  python3 tools/audit.py [题库目录]          # 审计
  python3 tools/audit.py --calib [题库目录]  # 顺带打印 calibration JSON
"""
import json, os, sys, random, statistics as st

DIMS = ['BND', 'COM', 'EMP', 'INT', 'CRE', 'RES']
HERE = os.path.dirname(os.path.abspath(__file__))
QUIZ = os.path.dirname(HERE)


def load(dirpath=QUIZ):
    bank = []
    for f in ('core.zh.json', 'extended.zh.json'):
        p = os.path.join(dirpath, f)
        if os.path.exists(p):
            bank.extend(json.load(open(p, encoding='utf-8')))
    return bank


def load_taste(dirpath=QUIZ, name='roma'):
    """口味文件是独立的：题库只有 dims，偏好全在 tastes/<name>.json 里。"""
    p = os.path.join(dirpath, 'tastes', name + '.json')
    if not os.path.exists(p):
        return None
    return json.load(open(p, encoding='utf-8'))


def pref(taste, qid, oid):
    if not taste:
        return None
    v = taste.get('preference', {}).get(qid, {}).get(oid)
    return None if v is None else int(v)


def raw_scores(bank, picks):
    """题内相对分：每题按该维该题最大值归一，再对该维有区分度的题取平均。"""
    acc, cnt = {d: 0.0 for d in DIMS}, {d: 0 for d in DIMS}
    for q in bank:
        o = next(x for x in q['options'] if x['id'] == picks[q['id']])
        for d in DIMS:
            mx = max(x['dims'][d] for x in q['options'])
            if mx > 0:
                acc[d] += o['dims'][d] / mx
                cnt[d] += 1
    return {d: (acc[d] / cnt[d] * 100 if cnt[d] else None) for d in DIMS}, cnt


def center(raw, calib):
    """把原始相对分映射到 0-100，50 = 随机作答基线，100 = 全选最优，0 = 全选最差。"""
    out = {}
    for d, v in raw.items():
        if v is None:
            out[d] = None
            continue
        base, floor = calib[d]['base'], calib[d]['floor']
        top = max(calib[d].get('top', 100.0), base + 1.0)
        if v >= base:
            hi = top - base
            out[d] = 50.0 + (50.0 * (v - base) / hi if hi > 0.5 else 0.0)
        else:
            lo = base - floor
            out[d] = 50.0 * (v - floor) / lo if lo > 0.5 else 50.0
    return {d: (None if out[d] is None else round(min(100.0, max(0.0, out[d])), 1)) for d in DIMS}


def build_calib(bank, taste=None, trials=2000, seed=7):
    """校准参数解析求解，与浏览器端 scoring.js 完全一致：
       base  = 每题「选项均值 / 该题最大值」的平均 → 随机作答的期望水平（50 分）
       floor = 每题「选项最小值 / 该题最大值」的平均 → 每题都选最差时的水平（0 分）
       top   = 每题「口味分最高的选项在该维的取值 / 最大值」的平均 → 100 分
               没有口味文件时退化为「该维最高」，等于纯客观标定。
    """
    calib = {}
    for d in DIMS:
        bases, floors, tops = [], [], []
        for q in bank:
            vals = [o['dims'][d] for o in q['options']]
            mx = max(vals)
            if mx > 0:
                bases.append(sum(vals) / len(vals) / mx * 100)
                floors.append(min(vals) / mx * 100)
                top_v = mx
                if taste:
                    scored = [(o, pref(taste, q['id'], o['id'])) for o in q['options']]
                    scored = [x for x in scored if x[1] is not None]
                    if scored:
                        qmax = max(p for _, p in scored)
                        top_v = max(o['dims'][d] for o, p in scored if p == qmax)
                tops.append(top_v / mx * 100)
        calib[d] = {'base': round(sum(bases) / len(bases), 1),
                    'floor': round(sum(floors) / len(floors), 1),
                    'top': round(sum(tops) / len(tops), 1)}
    random.seed(seed)
    sims = [raw_scores(bank, {q['id']: random.choice([o['id'] for o in q['options']])
                              for q in bank})[0] for _ in range(trials)]
    worst = {q['id']: min(q['options'], key=lambda o: sum(o['dims'].values()))['id'] for q in bank}
    return calib, sims, worst


def audit(bank, taste=None, verbose=True):
    ok = True
    n = len(bank)
    p = print if verbose else (lambda *a, **k: None)
    p(f'题库 {n} 题 / {sum(len(q["options"]) for q in bank)} 选项\n')

    # 1 区分度
    p('维度      可区分题数   选项值分布 0/1/2/3        判定')
    p('-' * 60)
    for d in DIMS:
        items, hist = 0, [0, 0, 0, 0]
        for q in bank:
            vals = [o['dims'][d] for o in q['options']]
            for v in vals:
                hist[v] += 1
            if max(vals) - min(vals) > 0:
                items += 1
        bad = items < 10
        ok &= not bad
        p(f'{d:<8}{items:>6}/{n:<6}   {hist[0]:>3}/{hist[1]:<3}/{hist[2]:<3}/{hist[3]:<3}'
          f'          {"FAIL 题数不足" if bad else "OK"}')

    calib, sims, worst = build_calib(bank, taste)

    # 2 校准后区间
    cs = [center(s, calib) for s in sims]
    p('\n维度      校准前区间          校准后区间          跨度  判定')
    p('-' * 68)
    for d in DIMS:
        rv = [s[d] for s in sims if s[d] is not None]
        cv = [s[d] for s in cs if s[d] is not None]
        span = max(cv) - min(cv)
        bad = span < 40
        ok &= not bad
        p(f'{d:<8}{min(rv):5.1f}-{max(rv):<5.1f}      {min(cv):5.1f}-{max(cv):<5.1f}     '
          f'{span:5.1f}  {"FAIL 过窄" if bad else "OK"}')

    # 3 极值：有口味文件时按「口味最优解」挑，这也是 100 分标定所依据的那条路径
    def _best_of(q):
        if taste:
            scored = [(o, pref(taste, q['id'], o['id'])) for o in q['options']]
            scored = [x for x in scored if x[1] is not None]
            if scored:
                qmax = max(p for _, p in scored)
                return max((o for o, p in scored if p == qmax),
                           key=lambda o: sum(o['dims'].values()))
        return max(q['options'], key=lambda o: sum(o['dims'].values()))

    best = {q['id']: _best_of(q)['id'] for q in bank}
    p('\n最差作答(校准后):', center(raw_scores(bank, worst)[0], calib))
    p('最优作答(校准后):', center(raw_scores(bank, best)[0], calib))

    # 4 相关
    p('\n维度相关矩阵（随机作答，校准前）：')
    p('       ' + ''.join(f'{d:>7}' for d in DIMS))
    worst_r = 0
    for a in DIMS:
        row = []
        for b in DIMS:
            xs = [s[a] for s in sims if s[a] is not None and s[b] is not None]
            ys = [s[b] for s in sims if s[a] is not None and s[b] is not None]
            mx, my = sum(xs) / len(xs), sum(ys) / len(ys)
            cov = sum((i - mx) * (j - my) for i, j in zip(xs, ys)) / len(xs)
            r = cov / ((st.pstdev(xs) or 1) * (st.pstdev(ys) or 1))
            row.append(r)
            if a != b:
                worst_r = max(worst_r, abs(r))
        p(f'{a:>6} ' + ''.join(f'{v:7.2f}' for v in row))
    p(f'  最大非对角相关 |r| = {worst_r:.2f}  {"FAIL 互斥或冗余" if worst_r > 0.6 else "OK"}')
    ok &= worst_r <= 0.6

    # 5 位置均衡（按口味分均值，而非单点计数）
    per_pos = {k: [] for k in 'ABCD'}
    for q in bank:
        for j, o in enumerate(q['options']):
            v = pref(taste, q['id'], o['id'])
            if v is not None:
                per_pos['ABCD'[j]].append(v)
    means = {k: sum(v) / len(v) for k, v in per_pos.items() if v}
    spread = max(means.values()) - min(means.values())
    p('\n各位置平均口味分: ' + ' '.join(f'{k}={v:.2f}' for k, v in means.items())
      + f'，极差 {spread:.2f} {"FAIL 位置偏倚" if spread > 0.25 else "OK"}')
    ok &= spread <= 0.25

    # 6 口味分分布
    sc = [pref(taste, q['id'], o['id']) for q in bank for o in q['options']]
    sc = [x for x in sc if x is not None]
    p(f'口味分分布 0:{sc.count(0)} 1:{sc.count(1)} 2:{sc.count(2)} 3:{sc.count(3)}'
      f'（均值 {sum(sc) / len(sc):.2f}）')
    ok &= sc.count(1) != len(sc)

    # 7 潜变量回收
    def recover(sigma, n=500, seed=11):
        random.seed(seed)
        rec = {d: [] for d in DIMS}
        for _ in range(n):
            latent = {d: random.uniform(0, 3) for d in DIMS}
            picks = {}
            for q in bank:
                score = lambda o: sum(latent[d] * o['dims'][d] for d in DIMS) + random.gauss(0, sigma)
                picks[q['id']] = max(q['options'], key=score)['id']
            got = center(raw_scores(bank, picks)[0], calib)
            for d in DIMS:
                if got[d] is not None:
                    rec[d].append((latent[d], got[d]))
        out = {}
        for d in DIMS:
            xs = [t[0] for t in rec[d]]
            ys = [t[1] for t in rec[d]]
            mx, my = sum(xs) / len(xs), sum(ys) / len(ys)
            cov = sum((i - mx) * (j - my) for i, j in zip(xs, ys)) / len(xs)
            out[d] = cov / ((st.pstdev(xs) or 1) * (st.pstdev(ys) or 1))
        return out

    p('\n潜变量回收（500 个已知画像 → 模拟作答 → 反推）：')
    nom, stress = recover(2.5), recover(4.0)
    p('        标称(σ=2.5)  压力(σ=4.0)   判定')
    recov = {}
    for d in DIMS:
        recov[d] = nom[d]
        bad = nom[d] < 0.40
        ok &= not bad
        tag = 'FAIL 过低' if bad else ('OK（本版最弱，建议补题）' if nom[d] < 0.55 else 'OK')
        p(f'  {d}:  {nom[d]:.2f}        {stress[d]:.2f}       {tag}')

    p('\n总体：' + ('PASS' if ok else 'FAIL'))
    p('\n校准参数：')
    p(json.dumps(calib, ensure_ascii=False, indent=2))
    return ok, calib, recov, worst_r, spread


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    d = args[0] if args else QUIZ
    bank = load(d)
    taste = load_taste(d)
    if taste is None:
        print('提示：未找到 tastes/roma.json，本次按「纯客观」口径校准（top = 该维最高）\n')
    else:
        bind = taste.get('bank_binding', {}).get('bank_hash')
        print(f'口味：{taste.get("name")}（{taste.get("taste_id")}）· 绑定题库 {bind}\n')
    ok, *_ = audit(bank, taste)
    sys.exit(0 if ok else 1)
