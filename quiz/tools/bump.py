#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""CIT 版本号一键同步 / 一致性校验（代替手工改多处，防止漏改）。

用法（可从任意目录调用）：
    python3 <quiz>/tools/bump.py --check         # 只读：校验所有版本标识是否与 scoring.js 的 VERSION 一致
    python3 <quiz>/tools/bump.py 5.3.0          # 同步全部版本标识到 5.3.0
    python3 <quiz>/tools/bump.py 5.3.0 --bank   # 同时 bump tastes/roma.json 的 bank_binding.bank_version
                                               # （只有题库内容本身变了才加 --bank）

同步位置（14 处，按文件）：
    scoring.js              const VERSION / 文件头注释
    metadata.json           "version"
    rules.weights.json      "version"
    index.html              verTag 徽章 / <title> / about 静态文案
    faculty.html            <title> / 副标题
    app.js                  T.title / T.about_title / 文件头注释
    faculty.js              文件头注释
    tools/extract_taste.py  BANK_VERSION
    tastes/roma.json        bank_binding.bank_version（仅 --bank，不参与 --check）

约定：
  · 页面与注释只显示主.次版本号（如 v5.3），verTag 与 JSON 用完整三段（5.3.0）。
  · scoring.js 的 `const VERSION` 是唯一权威版本，--check 以它为准。
  · bank_version 表示题库版本，系统版本升级而题库未变时可以合法地落后，故 --check 不校验它。
  · **有意不同步**：所有「v5.x 起 / v5.0 之前」历史沿革表述、migration_v4.3.json 的 "to"、
    tastes/README.md 的 schema 示例、tools/rekey.py 生成的迁移目标版本——它们是历史事实，不是当前标识。
  · 任何一处正则失配（0 处或多处）即整体失败，且写入模式下**不写任何文件**。
"""
import json
import os
import re
import sys
from collections import OrderedDict

HERE = os.path.dirname(os.path.abspath(__file__))
QUIZ = os.path.dirname(HERE)

# (相对 quiz/ 的路径, 正则, 替换模板, 期望匹配次数)
# 模板中 {ver}=完整三段版本（5.3.0），{short}=主.次（5.3）
SYNC_POINTS = [
    ('scoring.js', r"const VERSION = '[^']+';", "const VERSION = '{ver}';", 1),
    ('scoring.js', r'(CIT scoring kernel )v\d+\.\d+', r'\g<1>v{short}', 1),
    ('metadata.json', r'"version": "[^"]+"', '"version": "{ver}"', 1),
    ('rules.weights.json', r'"version": "[^"]+"', '"version": "{ver}"', 1),
    ('index.html', r'(<div class="pill" id="verTag">)v[^<]+(</div>)', r'\g<1>v{ver}\g<2>', 1),
    ('index.html', r'(Cultural Insight Test \(CIT )v\d+\.\d+(\)</title>)', r'\g<1>v{short}\g<2>', 1),
    ('index.html', r'(六维科研气质评估模型（CIT )v\d+\.\d+(）)', r'\g<1>v{short}\g<2>', 1),
    ('faculty.html', r'(CIT Faculty Analyzer \(Private )v\d+\.\d+(\)</title>)', r'\g<1>v{short}\g<2>', 1),
    ('faculty.html', r'(内部评估（)v\d+\.\d+( · 六维)', r'\g<1>v{short}\g<2>', 1),
    ('app.js', r"title: 'ROMA Lab Cultural Insight Test \(v[^)]+\)'",
     "title: 'ROMA Lab Cultural Insight Test (v{short})'", 1),
    ('app.js', r'about_title: \'ROMA Lab · 六维科研气质评估模型（CIT v[^）]+）\'',
     'about_title: \'ROMA Lab · 六维科研气质评估模型（CIT v{short}）\'', 1),
    ('app.js', r'(ROMA Lab CIT · 学生端 )v\d+\.\d+', r'\g<1>v{short}', 1),
    ('faculty.js', r'(ROMA Lab · CIT Faculty Analyzer )v\d+\.\d+', r'\g<1>v{short}', 1),
    ('tools/extract_taste.py', r"BANK_VERSION = '[^']+'", "BANK_VERSION = '{ver}'", 1),
]


def path_of(rel):
    return os.path.join(QUIZ, rel)


def read(rel):
    with open(path_of(rel), encoding='utf-8') as f:
        return f.read()


def write(rel, text):
    with open(path_of(rel), 'w', encoding='utf-8') as f:
        f.write(text)


def render(tpl, ver, short):
    return tpl.replace('{ver}', ver).replace('{short}', short)


def grouped_points():
    """同一文件可能有多处同步点，必须按顺序累积替换，不能各自基于原文覆盖。"""
    grouped = OrderedDict()
    for rel, pattern, repl, expect in SYNC_POINTS:
        grouped.setdefault(rel, []).append((pattern, repl, expect))
    return grouped


def current_version():
    m = re.search(r"const VERSION = '([^']+)';", read('scoring.js'))
    if not m:
        print('FAIL scoring.js 里找不到 const VERSION，无法判定权威版本')
        return None
    return m.group(1)


def check():
    """只读校验：把每个同步点替换成权威版本，内容若变化即为漂移。"""
    ver = current_version()
    if ver is None:
        return 1
    short = '.'.join(ver.split('.')[:2])
    bad = []
    for rel, rules in grouped_points().items():
        src = read(rel)
        cur = src
        for pattern, repl, expect in rules:
            new, n = re.subn(pattern, render(repl, ver, short), cur)
            if n != expect:
                bad.append('%s：模式匹配 %d 处（期望 %d），页面结构可能变了' % (rel, n, expect))
            elif new != cur:
                m = re.search(pattern, cur)
                snippet = m.group(0)[:70] if m else '?'
                bad.append('%s：版本标识与 v%s 不一致 →「%s」' % (rel, ver, snippet))
            cur = new
    if bad:
        print('FAIL 版本标识漂移 %d 处：' % len(bad))
        for line in bad:
            print('  · ' + line)
        print('修复：python3 tools/bump.py %s；若是历史沿革表述，请确认它不在同步名单里。' % ver)
        return 1
    print('PASS 版本标识一致：v%s（%d 处，权威源 scoring.js）' % (ver, len(SYNC_POINTS)))
    return 0


def sync(ver, with_bank):
    short = '.'.join(ver.split('.')[:2])
    pending = OrderedDict()
    ok = True
    for rel, rules in grouped_points().items():
        src = read(rel)
        for pattern, repl, expect in rules:
            src, n = re.subn(pattern, render(repl, ver, short), src)
            if n != expect:
                print('FAIL %s：模式匹配 %d 处（期望 %d）' % (rel, n, expect))
                ok = False
        pending[rel] = src
    if not ok:
        print('\n有同步点失配，未写入任何文件。')
        return 1

    for rel, text in pending.items():
        if text != read(rel):
            write(rel, text)
        print('OK   %s' % rel)

    if with_bank:
        p = 'tastes/roma.json'
        t = json.load(open(path_of(p), encoding='utf-8'))
        t['bank_binding']['bank_version'] = ver
        with open(path_of(p), 'w', encoding='utf-8') as fh:
            json.dump(t, fh, ensure_ascii=False, indent=2)
            fh.write('\n')
        print('OK   %s（bank_binding.bank_version → %s）' % (p, ver))
        print('提醒：题库内容变了，bank_hash 也会变——改完记得 python3 tools/extract_taste.py --rehash')

    print('\n全部同步到 v%s（%d 处）。接下来：cit-check.sh --e2e 全绿后再提交。' % (ver, len(SYNC_POINTS)))
    return 0


def main():
    args = sys.argv[1:]
    if args and args[0] == '--check':
        return check()
    if not args or not re.fullmatch(r'\d+\.\d+\.\d+', args[0]):
        print(__doc__)
        return 1
    return sync(args[0], '--bank' in args[1:])


if __name__ == '__main__':
    sys.exit(main())
