/* CIT v5.0 评分内核测试
 * 运行：node tests/scoring.test.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const CIT = require('../scoring.js');

const QUIZ = path.join(__dirname, '..');
const read = f => JSON.parse(fs.readFileSync(path.join(QUIZ, f), 'utf8'));
const core = read('core.zh.json');
const ext = read('extended.zh.json');
const full = core.concat(ext);
const taste = read('tastes/roma.json');
const migration = read('migration_v4.3.json');
const v43 = {
  core: JSON.parse(fs.readFileSync(path.join(QUIZ, 'tools/source_v4.3/core.zh.json'), 'utf8')),
  ext: JSON.parse(fs.readFileSync(path.join(QUIZ, 'tools/source_v4.3/extended.zh.json'), 'utf8'))
};

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log('  ✓ ' + name); pass++; }
  catch (e) { console.log('  ✗ ' + name + '\n     ' + e.message); fail++; }
}
const round = (v, n = 1) => Math.round(v * 10 ** n) / 10 ** n;
function seeded(seed) { return () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }; }

console.log('\n[1] 题库结构');
test('只有一种模式：BANK_FILES 拼起来正好就是全量 50 题', () => {
  assert.deepStrictEqual(CIT.BANK_FILES, ['core.zh.json', 'extended.zh.json']);
  assert.strictEqual(CIT.TOTAL_ITEMS, 50);
  assert.strictEqual(full.length, CIT.TOTAL_ITEMS, '题库题量与 TOTAL_ITEMS 不一致');
  assert.strictEqual(CIT.BANKS, undefined, '不应再有 core/full 双模式表');
});
test('50 题 / 每题 4 选项 / 六维齐全', () => {
  assert.strictEqual(full.length, 50);
  full.forEach(q => {
    assert.strictEqual(q.options.length, 4, q.id + ' 选项数');
    q.options.forEach(o => {
      CIT.DIMS.forEach(d => assert.ok(Number.isInteger(o.dims[d]), `${q.id}${o.id} 缺 ${d}`));
      assert.strictEqual(o.score, undefined, `${q.id}${o.id} 题库不该再含 score，口味已抽到 tastes/`);
    });
  });
});
test('选项字母连续且不重复', () => {
  full.forEach(q => assert.deepStrictEqual(q.options.map(o => o.id), ['A', 'B', 'C', 'D'], q.id));
});
test('不再残留 CRV 维度', () => {
  full.forEach(q => q.options.forEach(o => assert.ok(!('CRV' in o.dims), q.id + ' 仍有 CRV')));
});

console.log('\n[2] 维度可测性（v4.3 的核心缺陷）');
test('每个维度都有 ≥8 道可区分题', () => {
  const calib = CIT.calibrate(full, taste);
  CIT.DIMS.forEach(d => {
    assert.ok(calib[d].spreadItems >= 8, `${d} 可区分题仅 ${calib[d].spreadItems}`);
    assert.ok(calib[d].items >= 8, `${d} 有效题仅 ${calib[d].items}`);
  });
});
test('不存在「所有选项同值」的维度（CRV 事故回归）', () => {
  const calib = CIT.calibrate(full, taste);
  CIT.DIMS.forEach(d => assert.ok(calib[d].spreadItems > 0, d + ' 又是常数维度'));
});
test('CRE 与 RES 已是两个独立维度，取值不同', () => {
  const withBoth = full.filter(q => {
    const cre = q.options.map(o => o.dims.CRE);
    const res = q.options.map(o => o.dims.RES);
    return new Set(cre).size > 1 && new Set(res).size > 1;
  });
  assert.ok(withBoth.length >= 15, '同时区分创造与抗压的题只有 ' + withBoth.length);
});

console.log('\n[3] 计分与校准');
test('随机作答六维都在 50 附近（基线中心化）', () => {
  const rnd = seeded(42);
  const acc = {}; CIT.DIMS.forEach(d => acc[d] = []);
  for (let i = 0; i < 400; i++) {
    const picks = {};
    full.forEach(q => picks[q.id] = q.options[Math.floor(rnd() * 4)].id);
    const s = CIT.compute(full, picks, taste);
    CIT.DIMS.forEach(d => acc[d].push(s.per[d]));
  }
  CIT.DIMS.forEach(d => {
    const m = acc[d].reduce((a, b) => a + b, 0) / acc[d].length;
    assert.ok(Math.abs(m - 50) < 6, `${d} 随机均值 ${round(m)} 偏离 50 过多`);
  });
});
test('最优作答 > 随机 > 最差，且六维都不为 null', () => {
  const sum = o => Object.values(o.dims).reduce((a, b) => a + b, 0);
  const best = {}, worst = {}, rnd = {};
  full.forEach(q => {
    best[q.id] = q.options.reduce((a, b) => sum(b) > sum(a) ? b : a).id;
    worst[q.id] = q.options.reduce((a, b) => sum(b) < sum(a) ? b : a).id;
    rnd[q.id] = q.options[1].id;
  });
  const B = CIT.compute(full, best, taste), W = CIT.compute(full, worst, taste), R = CIT.compute(full, rnd, taste);
  CIT.DIMS.forEach(d => {
    assert.ok(B.per[d] !== null && W.per[d] !== null, d + ' 出现 null');
    assert.ok(B.per[d] > R.per[d] && R.per[d] > W.per[d], `${d} 未单调：${B.per[d]}/${R.per[d]}/${W.per[d]}`);
  });
  assert.ok(CIT.fit(B.per) > 85, '最优作答 Fit 应 > 85，实为 ' + CIT.fit(B.per));
  assert.ok(CIT.fit(W.per) < 40, '最差作答 Fit 应 < 40，实为 ' + CIT.fit(W.per));
});
test('每一维的 100 分都真实可达（按该题口味最优的选项作答）', () => {
  CIT.DIMS.forEach(d => {
    const picks = {};
    full.forEach(q => {
      const top = Math.max.apply(null, q.options.map(o => taste.preference[q.id][o.id]));
      const cand = q.options.filter(o => taste.preference[q.id][o.id] === top);
      picks[q.id] = cand.reduce((a, b) => (b.dims[d] || 0) > (a.dims[d] || 0) ? b : a).id;
    });
    const s = CIT.compute(full, picks, taste);
    assert.ok(Math.abs(s.per[d] - 100) < 1.5, `${d} 满分画像仅 ${s.per[d]}，说明 100 分标定偏低`);
  });
});
test('逐题押中口味 = 联合最优，其 Fit 应 ≥ 85（v5.2 起最优解唯一，理论上可达 100）', () => {
  const sum = o => Object.values(o.dims).reduce((a, b) => a + b, 0);
  const best = {};
  full.forEach(q => {
    const top = Math.max.apply(null, q.options.map(o => taste.preference[q.id][o.id]));
    const cand = q.options.filter(o => taste.preference[q.id][o.id] === top);
    best[q.id] = cand.reduce((a, b) => sum(b) > sum(a) ? b : a).id;
  });
  const s = CIT.compute(full, best, taste);
  CIT.DIMS.forEach(d => assert.ok(s.per[d] >= 85, `${d} 联合最优仅 ${s.per[d]}`));
  assert.ok(CIT.fit(s.per) >= 85, '联合最优 Fit 应 ≥ 85，实为 ' + CIT.fit(s.per));
});
test('校准参数满足 floor < base < top，且 top 不超过 100', () => {
  const c = CIT.calibrate(full, taste);
  CIT.DIMS.forEach(d => {
    assert.ok(c[d].floor < c[d].base, `${d} floor ${c[d].floor} 未低于 base ${c[d].base}`);
    assert.ok(c[d].base < c[d].top, `${d} base ${c[d].base} 未低于 top ${c[d].top}`);
    assert.ok(c[d].top <= 100.01, `${d} top ${c[d].top} 超过 100`);
  });
});
test('固定 50 题下六维的可分辨区间都够宽，无 coarse 标记', () => {
  const ans = q => q.options[1].id;
  const pick = bank => { const o = {}; bank.forEach(q => o[q.id] = ans(q)); return o; };
  const f = CIT.compute(full, pick(full), taste);
  CIT.DIMS.forEach(d => {
    assert.ok(f.calib[d].top - f.calib[d].base >= CIT.MIN_HEADROOM,
      `${d} 可分辨区间 ${round(f.calib[d].top - f.calib[d].base)} 过窄`);
    assert.strictEqual(f.resolution[d], 'ok', `${d} 不该是 coarse`);
  });
});
test('部分作答不影响另一维度的口径（不拿未答当低分）', () => {
  const half = {};
  core.forEach(q => half[q.id] = q.options[0].id);
  const s = CIT.compute(full, half, taste);
  assert.strictEqual(s.answered, 20);
  assert.strictEqual(s.total, 50);
  CIT.DIMS.forEach(d => {
    assert.ok(s.coverage[d] <= 20, d + ' 覆盖题数异常');
    assert.ok(s.per[d] === null || (s.per[d] >= 0 && s.per[d] <= 100));
  });
});
test('维度题量不足时返回 null 而不是满分（守卫）', () => {
  const tiny = [{
    id: 'X1',
    options: [
      { id: 'A', score: 1, dims: { BND: 2, COM: 0, EMP: 0, INT: 0, CRE: 0, RES: 0 } },
      { id: 'B', score: 1, dims: { BND: 3, COM: 0, EMP: 0, INT: 0, CRE: 0, RES: 0 } }
    ]
  }];
  const s = CIT.compute(tiny, { X1: 'B' });
  assert.strictEqual(s.per.BND, null, '题量不足应判为未测量');
  assert.strictEqual(s.usable.BND, false);
});
test('answer 缺失的题被记为 missing 而不是 0 分', () => {
  const s = CIT.compute(core, {}, taste);
  assert.strictEqual(s.answered, 0);
  assert.strictEqual(s.flags.missing.length, 20);
  assert.strictEqual(s.per.BND, null);
});

console.log('\n[4] 版本与指纹');
test('指纹稳定', () => {
  assert.strictEqual(CIT.hashBank(full), CIT.hashBank(full));
  assert.strictEqual(CIT.verify({ bankHash: CIT.hashBank(full) }, full, taste).bankMatch, true);
});
test('改动任一选项的维度值时指纹变化', () => {
  const clone = JSON.parse(JSON.stringify(core));
  const before = CIT.hashBank(clone);
  clone[0].options[0].dims.BND = (clone[0].options[0].dims.BND + 1) % 4;
  assert.notStrictEqual(before, CIT.hashBank(clone));
});
test('口味文件不参与题库指纹（换口味不该让题库看起来变了）', () => {
  const s2 = JSON.parse(JSON.stringify(taste));
  const before = CIT.hashBank(full);
  s2.preference.Q1.A = (s2.preference.Q1.A + 1) % 4;
  assert.strictEqual(before, CIT.hashBank(full), '题库指纹被口味影响了');
  assert.notStrictEqual(CIT.hashTaste(s2), CIT.hashTaste(taste), '口味指纹应当变化');
});
test('v4.3 旧报告指纹不匹配 → 触发重算', () => {
  const v = CIT.verify({ bankHash: 'deadbeef' }, full, taste);
  assert.strictEqual(v.bankMatch, false);
});

console.log('\n[5] 旧报告迁移（选项顺序被轮转过）');
test('迁移表覆盖全部 50 题与 4 个选项', () => {
  assert.strictEqual(Object.keys(migration.option_map).length, 50);
  Object.values(migration.option_map).forEach(m => assert.strictEqual(Object.keys(m).length, 4));
});
test('迁移后每个旧选项都落到「文本相同」的新选项上', () => {
  full.forEach(q => {
    const old = (v43.core.concat(v43.ext).find(x => x.id === q.id));
    const map = migration.option_map[q.id];
    old.options.forEach(o => {
      const newId = map[o.id];
      const target = q.options.find(x => x.id === newId);
      assert.ok(target, `${q.id}${o.id} 映射到不存在的 ${newId}`);
      assert.strictEqual(target.label, o.label, `${q.id}${o.id} 文本不一致：${target.label} vs ${o.label}`);
    });
  });
});
test('旧报告迁移后可重算，且旧 per 不被沿用', () => {
  const sample = '/Users/xiangguosun/Downloads/各种材料/ROMA_CIT_full_zh_1770481890666.json';
  if (!fs.existsSync(sample)) { console.log('     （跳过：本机没有样本报告）'); return; }
  const rep = JSON.parse(fs.readFileSync(sample, 'utf8'));
  const ans = {};
  Object.entries(rep.answers).forEach(([qid, oid]) => { ans[qid] = migration.option_map[qid][oid]; });
  const s = CIT.compute(full, ans, taste);
  assert.strictEqual(s.answered, 50);
  assert.ok(s.per.CRE !== null && s.per.RES !== null);
  assert.notStrictEqual(round(s.per.CRE, 0) + '/' + round(s.per.RES, 0), '100/100', '不该再出现双百');
});

console.log('\n[6] 权重与合成');
test('六维权重之和为 1', () => {
  const sum = CIT.DIMS.reduce((a, d) => a + CIT.WEIGHTS[d], 0);
  assert.ok(Math.abs(sum - 1) < 1e-9, '权重和 = ' + sum);
});
test('含 null 维度时按实际可测维度归一', () => {
  const per = { BND: 60, COM: 60, EMP: null, INT: 60, CRE: null, RES: null };
  assert.strictEqual(CIT.fit(per), 60);
  assert.strictEqual(CIT.fit({ BND: null, COM: null, EMP: null, INT: null, CRE: null, RES: null }), null);
});

console.log('\n[7] 端到端一致性（学生端导出 → 导师端重算）');
test('同一份作答两端算出同一组分数', () => {
  const picks = {};
  full.forEach(q => picks[q.id] = q.options[2].id);
  const student = CIT.compute(full, picks, taste);
  const report = {
    schema: 'roma-cit-report',
    bankVersion: CIT.VERSION,
    bankHash: CIT.hashBank(full),
    tasteId: taste.taste_id,
    tasteHash: CIT.hashTaste(taste),
    per: student.per,
    answers: picks
  };
  // 导师端：先校验指纹，再自己重算
  assert.strictEqual(CIT.verify(report, full, taste).bankMatch, true);
  assert.strictEqual(CIT.verify(report, full, taste).tasteMatch, true, '口味指纹应一并匹配');
  const faculty = CIT.compute(full, report.answers, taste);
  CIT.DIMS.forEach(d => assert.strictEqual(faculty.per[d], report.per[d], d + ' 两端不一致'));
});

console.log('\n[8] 口味文件与题库绑定');
test('口味覆盖全部 50 题 / 200 个选项，绑定校验通过', () => {
  assert.strictEqual(Object.keys(taste.preference).length, 50);
  let n = 0;
  full.forEach(q => {
    const row = taste.preference[q.id];
    assert.ok(row, q.id + ' 未覆盖');
    q.options.forEach(o => {
      assert.ok(Number.isInteger(row[o.id]), `${q.id}${o.id} 未覆盖`);
      assert.ok(row[o.id] >= 0 && row[o.id] <= 3, `${q.id}${o.id} 越界`);
      n++;
    });
  });
  assert.strictEqual(n, 200);
  const b = CIT.bindTaste(taste, full);
  assert.strictEqual(b.ok, true, JSON.stringify(b.issues));
  assert.strictEqual(b.bankHash, CIT.hashBank(full), '口味绑定的指纹应等于当前题库指纹');
});

test('题库被改动后，旧口味必须被拒绝（不能静默套用）', () => {
  const clone = JSON.parse(JSON.stringify(full));
  clone[0].options[0].dims.BND = (clone[0].options[0].dims.BND + 1) % 4;
  const b = CIT.bindTaste(taste, clone);
  assert.strictEqual(b.ok, false, '题库变了却仍判为可绑定');
  assert.ok(b.issues.some(i => i.code === 'bank-hash-mismatch'), '应报指纹不符');
});

test('口味漏掉某题某选项时拒绝加载', () => {
  const t2 = JSON.parse(JSON.stringify(taste));
  delete t2.preference.Q7.B;
  const b = CIT.bindTaste(t2, full);
  assert.strictEqual(b.ok, false);
  assert.ok(b.issues.some(i => i.code === 'coverage'), '应报覆盖不全');
});

test('distinct 口味：每题分值必须是 0-3 的排列，出现并列即拒绝加载', () => {
  // 当前 roma v2 自身必须 50 题全部满足排列
  full.forEach(q => {
    const vals = q.options.map(o => taste.preference[q.id][o.id]).sort((a, b) => a - b);
    assert.deepStrictEqual(vals, [0, 1, 2, 3], q.id + ' 不是 0-3 的排列');
  });
  // 人为制造一个并列，bindTaste 必须报 not-distinct
  const t2 = JSON.parse(JSON.stringify(taste));
  t2.preference.Q3.B = t2.preference.Q3.A;
  const b = CIT.bindTaste(t2, full);
  assert.strictEqual(b.ok, false, '出现并列分值却仍判为可绑定');
  assert.ok(b.issues.some(i => i.code === 'not-distinct'), '应报 not-distinct');
  // 未声明 distinct 的口味不受此约束（兼容其他机构的自定义口味）
  const t3 = JSON.parse(JSON.stringify(taste));
  t3.scale.distinct = false;
  t3.preference.Q3.B = t3.preference.Q3.A;
  assert.strictEqual(CIT.bindTaste(t3, full).ok, true, '未声明 distinct 不该被排列规则卡住');
});

test('没有口味文件时六维照算，但质量指标为 null（不伪造契合度）', () => {
  const picks = {};
  full.forEach(q => picks[q.id] = q.options[0].id);
  const s = CIT.compute(full, picks, null);
  CIT.DIMS.forEach(d => assert.notStrictEqual(s.per[d], null, d + ' 应仍可测'));
  assert.strictEqual(s.quality.meanScore, null);
  assert.strictEqual(s.quality.matureRate, null);
  assert.strictEqual(s.taste.bound, false);
});

test('换一套口味：分数随 100 分刻度移动，说明口味确实参与标定', () => {
  const picks = {};
  full.forEach(q => picks[q.id] = q.options[1].id);
  const a = CIT.compute(full, picks, taste);
  const t2 = JSON.parse(JSON.stringify(taste));
  Object.keys(t2.preference).forEach(qid => {
    Object.keys(t2.preference[qid]).forEach(oid => {
      t2.preference[qid][oid] = 3 - t2.preference[qid][oid];   // 镜像口味
    });
  });
  t2.taste_id = 'mirror';
  const b = CIT.compute(full, picks, t2);
  assert.notStrictEqual(CIT.hashTaste(t2), CIT.hashTaste(taste));
  assert.ok(CIT.DIMS.some(d => a.per[d] !== b.per[d]),
    '换口味后分数完全没变，说明口味没真正参与标定');
});

console.log(`\n结果：${pass} 通过 / ${fail} 失败\n`);
process.exit(fail ? 1 : 0);
