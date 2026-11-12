#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""CIT 版本号一键同步（代替手工改多处，防止漏改）。

用法（在 quiz/ 目录下）：
    python3 tools/bump.py 5.3.0            # 同步应用/内核版本到全部位置
    python3 tools/bump.py 5.3.0 --bank     # 同时把 tastes/roma.json 的 bank_binding.bank_version 一起 bump
                                           # （只有题库内容本身变了才加 --bank）

同步位置（6 处）：
    scoring.js           const VERSION = 'X.Y.Z'
    metadata.json        "version": "X.Y.Z"
    rules.weights.json   "version": "X.Y.Z"
    index.html           <div class="pill" id="verTag">vX.Y.Z</div>
    app.js               T.title 与 T.about_title 里的 (vX.Y) / （CIT vX.Y）
注意：app.js 两处文案只显示主.次版本号（如 v5.3），不含补丁号。
"""
import json
import re
import sys

def bump_file(path, pattern, repl, expect=1):
    with open(path, encoding='utf-8') as f:
        src = f.read()
    new, n = re.subn(pattern, repl, src)
    if n != expect:
        print('FAIL %s：期望替换 %d 处，实际 %d 处（pattern=%s）' % (path, expect, n, pattern))
        return False
    with open(path, 'w', encoding='utf-8') as f:
        f.write(new)
    print('OK   %s（%d 处）' % (path, n))
    return True

def main():
    if len(sys.argv) < 2 or not re.fullmatch(r'\d+\.\d+\.\d+', sys.argv[1]):
        print(__doc__)
        return 1
    ver = sys.argv[1]
    short = '.'.join(ver.split('.')[:2])  # 展示用短版本，如 5.3
    with_bank = '--bank' in sys.argv[2:]

    ok = True
    ok &= bump_file('scoring.js', r"const VERSION = '[^']+';", "const VERSION = '%s';" % ver)
    ok &= bump_file('metadata.json', r'"version": "[^"]+"', '"version": "%s"' % ver)
    ok &= bump_file('rules.weights.json', r'"version": "[^"]+"', '"version": "%s"' % ver)
    ok &= bump_file('index.html', r'(<div class="pill" id="verTag">)v[^<]+(</div>)', r'\g<1>v%s\g<2>' % ver)
    ok &= bump_file('app.js', r"title: 'ROMA Lab Cultural Insight Test \(v[^)]+\)'",
                    "title: 'ROMA Lab Cultural Insight Test (v%s)'" % short)
    ok &= bump_file('app.js', r'about_title: \'ROMA Lab · 六维科研气质评估模型（CIT v[^）]+）\'',
                    'about_title: \'ROMA Lab · 六维科研气质评估模型（CIT v%s）\'' % short)

    if with_bank:
        p = 'tastes/roma.json'
        t = json.load(open(p, encoding='utf-8'))
        t['bank_binding']['bank_version'] = ver
        json.dump(t, open(p, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
        open(p, 'a', encoding='utf-8').write('\n')
        print('OK   %s（bank_binding.bank_version → %s）' % (p, ver))
        print('提醒：题库内容变了，bank_hash 也会变——改完记得 python3 tools/extract_taste.py --rehash')

    if not ok:
        print('\n有文件替换失败，请检查上面的 FAIL 行；未做部分提交。')
        return 1
    print('\n全部同步到 v%s。接下来：cit-check.sh --e2e 全绿后再提交。' % ver)
    return 0

if __name__ == '__main__':
    sys.exit(main())
