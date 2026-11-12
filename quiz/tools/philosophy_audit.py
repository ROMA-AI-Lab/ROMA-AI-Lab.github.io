#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""设计理念体检：检验「每个选项都像是对的」是否真的成立。

核心问题不是「分数算得对不对」，而是「一个不懂评分表的聪明学生，能不能靠
表面策略拿到高分」。如果答案是能，那这套题的防造假承诺就是空的。

题库文件里只有 dims（客观描述），实验室偏好存在 tastes/roma.json。
本脚本在载入后把口味合并回内存里的 o['score']，后续逻辑因此不用改——
它检验的本来就是「有人能看见 taste 时会发生什么」。

用法：python3 tools/philosophy_audit.py [--taste roma]
"""
import json
import os
import random
import re
import statistics as st

HERE = os.path.dirname(os.path.abspath(__file__))
QUIZ = os.path.dirname(HERE)
DIMS = ['BND', 'COM', 'EMP', 'INT', 'CRE', 'RES']
W = {'BND': 0.20, 'COM': 0.20, 'INT': 0.25, 'EMP': 0.17, 'CRE': 0.09, 'RES': 0.09}


def load(taste_id='roma'):
    out = []
    for f in ('core.zh.json', 'extended.zh.json'):
        with open(os.path.join(QUIZ, f), encoding='utf-8') as fh:
            out += json.load(fh)

    tp = os.path.join(QUIZ, 'tastes', taste_id + '.json')
    if os.path.exists(tp):
        taste = json.load(open(tp, encoding='utf-8'))
        pref = taste.get('preference', {})
        for q in out:
            for o in q['options']:
                o['score'] = int(pref.get(q['id'], {}).get(o['id'], 0))
        print(f'口味：{taste.get("name")}（{taste_id}）')
    else:
        print(f'警告：未找到 tastes/{taste_id}.json，按全 0 口味运行（结果无意义）')
    return out


# ---------- 与 scoring.js 完全一致的计分 ----------
def calibrate(bank):
    c = {}
    for d in DIMS:
        bs, fs, ts, n, sp = 0.0, 0.0, 0.0, 0, 0
        for q in bank:
            vals = [o['dims'].get(d, 0) for o in q['options']]
            mx = max(vals)
            if mx <= 0:
                continue
            bs += (sum(vals) / len(vals)) / mx * 100
            fs += min(vals) / mx * 100
            qmax = max(o.get('score', 0) for o in q['options'])
            ts += max(o['dims'].get(d, 0) for o in q['options'] if o.get('score', 0) == qmax) / mx * 100
            n += 1
            if mx - min(vals) > 0:
                sp += 1
        c[d] = {'base': bs / n, 'floor': fs / n, 'top': ts / n, 'items': n, 'spread': sp}
    return c


def center(raw, cc):
    base, floor = cc['base'], cc['floor']
    top = max(cc['top'], base + 1)
    if raw >= base:
        hi = top - base
        v = 50 + 50 * (raw - base) / hi if hi > 0.5 else 100
    else:
        lo = base - floor
        v = 50 * (raw - floor) / lo if lo > 0.5 else 50
    return round(max(0.0, min(100.0, v)), 1)


def score_of(bank, picks, calib):
    acc, n = {d: 0.0 for d in DIMS}, {d: 0 for d in DIMS}
    for q in bank:
        o = next((x for x in q['options'] if x['id'] == picks.get(q['id'])), None)
        if not o:
            continue
        for d in DIMS:
            mx = max(x['dims'].get(d, 0) for x in q['options'])
            if mx > 0:
                acc[d] += o['dims'].get(d, 0) / mx
                n[d] += 1
    per = {d: (center(acc[d] / n[d] * 100, calib[d]) if n[d] >= 8 and calib[d]['spread'] >= 8 else None)
           for d in DIMS}
    num = sum(per[d] * W[d] for d in DIMS if per[d] is not None)
    den = sum(W[d] for d in DIMS if per[d] is not None)
    return per, (round(num / den, 1) if den else None)


# ---------- 统计工具 ----------
def spearman(xs, ys):
    def rank(v):
        s = sorted(range(len(v)), key=lambda i: v[i])
        r = [0.0] * len(v)
        i = 0
        while i < len(s):
            j = i
            while j + 1 < len(s) and v[s[j + 1]] == v[s[i]]:
                j += 1
            avg = (i + j) / 2 + 1
            for k in range(i, j + 1):
                r[s[k]] = avg
            i = j + 1
        return r
    rx, ry = rank(xs), rank(ys)
    mx, my = sum(rx) / len(rx), sum(ry) / len(ry)
    num = sum((a - mx) * (b - my) for a, b in zip(rx, ry))
    den = (sum((a - mx) ** 2 for a in rx) * sum((b - my) ** 2 for b in ry)) ** 0.5
    return num / den if den else 0.0


def jaccard(a, b, k=2):
    def grams(s):
        s = re.sub(r'[^\u4e00-\u9fa5A-Za-z]', '', s)
        return {s[i:i + k] for i in range(max(0, len(s) - k + 1))}
    ga, gb = grams(a), grams(b)
    return len(ga & gb) / len(ga | gb) if (ga | gb) else 0.0


RESP = ['主动', '先', '确认', '告知', '说明', '记录', '承担', '坦诚', '同步', '一起',
        '建议', '商量', '反馈', '复核', '留痕', '对齐', '公开', '署名', '核实']
CAUT = ['暂', '等', '观察', '再说', '先不', '搁置', '避免', '不要', '推', '拖', '回避']
# 「周全度」的文本代理：兼顾多件事、做得多 —— 一个想讨好出题人的学生最可能抓的线索
CONN = ['并', '再', '同时', '先', '然后', '一起', '以及', '和', '后']
VERB = ['提供', '说明', '确认', '告知', '记录', '建议', '商量', '同步', '反馈', '核实',
        '复核', '承担', '公开', '保留', '询问', '解释', '调整', '评估', '报告', '沟通',
        '征询', '核对', '留痕', '补', '改']


def _conn(o):
    return sum(1 for w in CONN if w in o['label'])


def _verb(o):
    return sum(1 for w in VERB if w in o['label'])


def main():
    bank = load()
    calib = calibrate(bank)
    print(f'\n题库 {len(bank)} 题 · {sum(len(q["options"]) for q in bank)} 个选项')

    # ===== 1. 表面线索是否能预测「最优解」 =====
    print('\n' + '=' * 68)
    print('1. 表面线索的泄漏：不懂评分表的人能不能猜到最优解？')
    print('=' * 68)
    lens, scores = [], []
    longest_is_best = 0
    resp_win, caus_win = 0, 0
    for q in bank:
        opts = q['options']
        best = max(opts, key=lambda o: o.get('score', 0))
        if len(best['label']) == max(len(o['label']) for o in opts):
            longest_is_best += 1
        def rh(o):
            return sum(1 for w in RESP if w in o['label'])
        def ch(o):
            return sum(1 for w in CAUT if w in o['label'])
        if rh(best) == max(rh(o) for o in opts) and rh(best) > 0:
            resp_win += 1
        if ch(best) == min(ch(o) for o in opts):
            caus_win += 1
        for o in opts:
            lens.append(len(o['label']))
            scores.append(o.get('score', 0))
    r_len = spearman(lens, scores)
    print(f'  选项字数 vs score 的秩相关：{r_len:+.2f}   （|r| < 0.15 视为安全）')
    print(f'  「最长的选项」正好是最优解的题：{longest_is_best}/{len(bank)}'
          f' = {longest_is_best / len(bank) * 100:.0f}%   （随机期望 25%）')
    print(f'  「尽责词最多」的选项是最优解的题：{resp_win}/{len(bank)} = {resp_win / len(bank) * 100:.0f}%')
    print(f'  最优解「最少用回避词」的题：{caus_win}/{len(bank)} = {caus_win / len(bank) * 100:.0f}%')

    # ===== 2. 四种作弊策略实测 =====
    print('\n' + '=' * 68)
    print('2. 作弊策略实测：完全不懂题意，只按表面规则选，能拿多少分？')
    print('=' * 68)
    strategies = {
        '最长的一句': lambda q: max(q['options'], key=lambda o: len(o['label'])),
        '最短的一句': lambda q: min(q['options'], key=lambda o: len(o['label'])),
        '尽责词最多': lambda q: max(q['options'], key=lambda o: (sum(1 for w in RESP if w in o['label']),
                                                          -len(o['label']))),
        '六维总和最大': lambda q: max(q['options'], key=lambda o: sum(o['dims'].values())),
        '六维最均衡': lambda q: min(q['options'], key=lambda o: st.pstdev(list(o['dims'].values()))),
        '兼顾最多（连接词）': lambda q: max(q['options'], key=lambda o: (_conn(o), -len(o['label']))),
        '做的事最多（动词）': lambda q: max(q['options'], key=lambda o: (_verb(o), -len(o['label']))),
        '周全度组合': lambda q: max(q['options'], key=lambda o: (_verb(o) + _conn(o), -len(o['label']))),
        '永远选 A': lambda q: q['options'][0],
        '永远选 D': lambda q: q['options'][-1],
        '闭眼随机': None,
    }
    print(f'  {"策略":<14}{"ROMA Fit":>10}{"是否过契合线(62)":>18}')
    print('  ' + '-' * 44)
    for name, fn in strategies.items():
        if fn is None:
            rnd = random.Random(7)
            fits = []
            for _ in range(200):
                picks = {q['id']: rnd.choice(q['options'])['id'] for q in bank}
                fits.append(score_of(bank, picks, calib)[1])
            fit = round(sum(fits) / len(fits), 1)
            note = f'（200 次均值，σ≈{st.pstdev(fits):.1f}）'
        else:
            picks = {q['id']: fn(q)['id'] for q in bank}
            fit = score_of(bank, picks, calib)[1]
            note = ''
        flag = '⚠ 能' if fit >= 62 else '否'
        print(f'  {name:<14}{fit:>10}{flag:>16}  {note}')

    # ===== 3. 「四个选项都说得通」的程度 =====
    print('\n' + '=' * 68)
    print('3. 选项是不是真的「各有各的道理」？')
    print('=' * 68)
    gaps, sims, dimspread = [], [], []
    for q in bank:
        sc = sorted(o.get('score', 0) for o in q['options'])
        gaps.append(sc[-1] - sc[0])
        opts = q['options']
        pair = [jaccard(opts[i]['label'], opts[j]['label'])
                for i in range(len(opts)) for j in range(i + 1, len(opts))]
        sims.append(sum(pair) / len(pair))
        # 取向差异：四个选项的维度画像平均两两距离（0-6 归一）
        vd = []
        for i in range(len(opts)):
            for j in range(i + 1, len(opts)):
                vd.append(sum(abs(opts[i]['dims'].get(d, 0) - opts[j]['dims'].get(d, 0)) for d in DIMS) / 18)
        dimspread.append(sum(vd) / len(vd))
    print(f'  每题 score 极差：均值 {st.mean(gaps):.2f}  （0 = 四个选项一样好；3 = 有好有坏，一眼能分）')
    print(f'    极差为 3 的题：{sum(1 for g in gaps if g == 3)} 题 · 为 1 的题：{sum(1 for g in gaps if g == 1)} 题')
    print(f'  选项文本相似度（2-gram Jaccard）：均值 {st.mean(sims):.2f}'
          f'  （<0.15 = 讲四件不同的事，像四个选项在考不同知识点）')
    print(f'  选项维度取向差异：均值 {st.mean(dimspread):.2f}  （0 = 四个选项取向相同，只是措辞不同）')

    # ===== 4. 单题决定性 =====
    print('\n' + '=' * 68)
    print('4. 单题权重：有没有「一题定生死」的题？')
    print('=' * 68)
    base = {q['id']: max(q['options'], key=lambda o: o.get('score', 0))['id'] for q in bank}
    f0 = score_of(bank, base, calib)[1]
    deltas = []
    for q in bank:
        p = dict(base)
        p[q['id']] = min(q['options'], key=lambda o: o.get('score', 0))['id']
        deltas.append((f0 - score_of(bank, p, calib)[1], q['id']))
    deltas.sort(reverse=True)
    print(f'  满分作答的 Fit：{f0}')
    print(f'  把单题改选成最差，Fit 下降：最大 {deltas[0][0]:.1f}（{deltas[0][1]}）· '
          f'中位 {st.median([d for d, _ in deltas]):.1f} · 最小 {deltas[-1][0]:.1f}')
    print(f'  影响最大的三题：' + '、'.join(f'{q}(−{d:.1f})' for d, q in deltas[:3]))
    print(f'  影响最小的三题：' + '、'.join(f'{q}(−{d:.1f})' for d, q in deltas[-3:]))

    # ===== 5. 维度取向是否真的互斥 =====
    print('\n' + '=' * 68)
    print('5. 「必须取舍」还是「可以全都要」？')
    print('=' * 68)
    tie = 0
    for q in bank:
        qmax = max(o.get('score', 0) for o in q['options'])
        cand = [o for o in q['options'] if o.get('score', 0) == qmax]
        if len(cand) > 1:
            tie += 1
    # 最优选项是否在某一维上不是该题最高分 → 说明「最优解要放弃某项」
    sacrifice = 0
    for q in bank:
        best = max(q['options'], key=lambda o: o.get('score', 0))
        mx = max(1, max(o['dims'].get('INT', 0) for o in q['options']))
        if best['dims'].get('INT', 0) < mx:
            sacrifice += 1
    print(f'  存在并列最优解的题：{tie} 题')
    print(f'  最优解在「诚信」上不是本题最高的题：{sacrifice} 题'
          f'（这些题里，选最优要放弃一点诚信分 → 是真取舍）')

    # ===== 6. 六维之间的相关（是否存在「一个人全是高分」的隐因子） =====
    print('\n' + '=' * 68)
    print('6. 六个维度是不是在测同一件事？')
    print('=' * 68)
    rnd = random.Random(11)
    rows = []
    for _ in range(600):
        picks = {q['id']: rnd.choice(q['options'])['id'] for q in bank}
        rows.append(score_of(bank, picks, calib)[0])
    print('  随机作答下六维相关矩阵（|r| > 0.6 说明两维在测同一件事）：')
    print('        ' + ''.join(f'{d:>7}' for d in DIMS))
    for a in DIMS:
        cells = []
        for b in DIMS:
            if a == b:
                cells.append('      —')
            else:
                cells.append(f'{spearman([r[a] for r in rows], [r[b] for r in rows]):>+7.2f}')
        print(f'  {a:<6}' + ''.join(cells))


if __name__ == '__main__':
    main()
