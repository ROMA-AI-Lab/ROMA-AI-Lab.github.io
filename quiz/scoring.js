/* ===========================================================================
 * ROMA Lab · CIT scoring kernel v5.3
 * ---------------------------------------------------------------------------
 * 学生端（app.js）与导师端（faculty.js）共用本文件，禁止在别处复制评分公式。
 *
 * 职责边界（v5.1 起）：
 *   题库（core.zh.json / extended.zh.json）  只说「这个选项体现什么特质」（dims）
 *   口味（tastes/<id>.json）                 只说「我们喜欢什么样的人」（preference）
 *   本内核                                    把两者合起来算分
 *
 *   这么分的理由：题库是客观描述，可以在机构之间复用；口味是主观偏好，
 *   换机构、换年份都可能变。混在一起时，题库看起来自带「标准答案」，
 *   实际上那只是某一家的口味。
 *
 * 计分口径：
 *   1. 每题、每维，用「所选选项分值 ÷ 该题该维最大值」得到题内相对分，再对有该维
 *      的题取平均。这样六个维度才在同一把尺子上，不受各维题量不均的影响。
 *   2. 再用三点基线做中心化映射：
 *        floor = 每题「选项最小值 / 最大值」的平均 → 每题都选最差，映射到 0 分
 *        base  = 每题「选项均值 / 最大值」的平均  → 随机作答的期望，映射到 50 分
 *        top   = 每题「口味分最高的选项在该维的取值 / 最大值」的平均 → 映射到 100 分
 *      注意 top 不一定等于 100：分寸、诚信等维度上，「稳妥但不出彩」的选项
 *      未必是该维得分最高的那个，所以 100 分按本题真正可达到的上限来定。
 *      top 依赖口味文件——换一套口味，「100 分」的刻度会跟着挪，这是设计使然。
 *   3. 一个维度若有效题数不足 MIN_ITEMS，标记为不可测（per 为 null），
 *      不再像 v4.3 那样把常数维度直接显示成 100%。
 * ===========================================================================*/
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CIT = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const VERSION = '5.3.0';
  const DIMS = ['BND', 'COM', 'EMP', 'INT', 'CRE', 'RES'];
  const DIM_LABEL = {
    BND: '分寸感',
    COM: '沟通',
    EMP: '同理',
    INT: '诚信',
    CRE: '创造',
    RES: '抗压'
  };
  const DIM_EN = {
    BND: 'Boundary', COM: 'Communication', EMP: 'Empathy',
    INT: 'Integrity', CRE: 'Creativity', RES: 'Resilience'
  };
  // 权重之和必须为 1：由 v4.3 的 CRV 0.10 拆成 CRE 0.09 + RES 0.09，
  // 差额补给诚信（0.28→0.25 让出部分给创造），最终如下。
  const WEIGHTS = { BND: 0.20, COM: 0.20, INT: 0.25, EMP: 0.17, CRE: 0.09, RES: 0.09 };

  const MIN_ITEMS = 8;        // 一个维度至少要有多少道有效题
  const MIN_SPREAD_ITEMS = 8; // 其中至少多少道题的选项真的能区分人
  const MIN_HEADROOM = 12;    // base→top 之间至少要留多少分，否则等于把小数点后的噪声放大成几十分

  // 只有一种模式：固定 50 题。core.zh.json 是前 20 题、extended.zh.json 是后 30 题，
  // 拆成两个文件只是为了便于维护，运行时永远拼成一整套。
  // 不再提供 20 题简版：题量减少会让单维可分辨区间塌缩（实测抗压只剩 6 分），
  // 而分数的全部意义就在于能区分人——测不准的短版比不测更糟。
  const BANK_FILES = ['core.zh.json', 'extended.zh.json'];
  const TOTAL_ITEMS = 50;

  const TASTE_DIR = 'tastes';
  const DEFAULT_TASTE = 'roma';

  /* ---------- 基础 ---------- */
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

  function hashBank(bank) {
    // FNV-1a 32bit，只用于「报告与题库版本对账」，不做安全用途。
    // 刻意不含口味分：题库指纹只反映题目本身，口味换了不该让题库指纹变。
    let h = 0x811c9dc5;
    const s = bank.map(q => [
      q.id,
      q.options.map(o => [o.id, DIMS.map(d => o.dims[d] || 0).join('.')].join(':')).join('|')
    ].join('#')).join('@');
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return ('00000000' + h.toString(16)).slice(-8);
  }

  function hashTaste(taste) {
    if (!taste || !taste.preference) return null;
    let h = 0x811c9dc5;
    const s = Object.keys(taste.preference).sort().map(qid => {
      const row = taste.preference[qid];
      return qid + ':' + Object.keys(row).sort().map(k => k + '=' + row[k]).join(',');
    }).join('|');
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return ('00000000' + h.toString(16)).slice(-8);
  }

  /** 取某题某选项的口味分；没有口味时返回 null（不是 0——0 是「明确相左」） */
  function prefOf(taste, qid, oid) {
    const row = taste && taste.preference && taste.preference[qid];
    if (!row) return null;
    const v = row[oid];
    return v === undefined || v === null ? null : Number(v);
  }

  /**
   * 校验口味文件能否安全套用到这份题库上。
   * 任何一条 error 都必须让调用方拒绝计算——拿旧口味套新题会静默算出错分。
   */
  function bindTaste(taste, bank) {
    const bankHash = hashBank(bank);
    const issues = [];
    if (!taste) {
      issues.push({ level: 'error', code: 'missing-taste', msg: '未加载口味文件' });
      return { ok: false, issues, bankHash, tasteHash: null, tasteId: null };
    }
    const bind = taste.bank_binding || {};
    if (bind.bank_hash !== bankHash) {
      issues.push({
        level: 'error',
        code: 'bank-hash-mismatch',
        msg: `口味文件绑定的是题库 ${bind.bank_hash || '（未记录）'}，当前题库是 ${bankHash}`
      });
    }
    if (bind.items && bind.items !== bank.length) {
      issues.push({
        level: 'error',
        code: 'item-count',
        msg: `口味文件按 ${bind.items} 题编写，当前题库 ${bank.length} 题`
      });
    }
    const missing = [];
    bank.forEach(q => {
      const row = taste.preference && taste.preference[q.id];
      q.options.forEach(o => {
        if (!row || row[o.id] === undefined) missing.push(q.id + ':' + o.id);
      });
    });
    if (missing.length) {
      issues.push({
        level: 'error',
        code: 'coverage',
        msg: `口味文件未覆盖 ${missing.length} 个选项`,
        sample: missing.slice(0, 6)
      });
    }
    const unknown = Object.keys(taste.preference || {})
      .filter(qid => !bank.some(q => q.id === qid));
    if (unknown.length) {
      issues.push({
        level: 'warn',
        code: 'unknown-items',
        msg: `口味文件里有 ${unknown.length} 道题库中不存在的题`,
        sample: unknown.slice(0, 6)
      });
    }
    const scale = taste.scale && taste.scale.range;
    if (scale) {
      const bad = [];
      Object.keys(taste.preference || {}).forEach(qid => {
        Object.keys(taste.preference[qid]).forEach(oid => {
          const v = Number(taste.preference[qid][oid]);
          if (!(v >= scale[0] && v <= scale[1])) bad.push(qid + ':' + oid);
        });
      });
      if (bad.length) {
        issues.push({
          level: 'error',
          code: 'out-of-range',
          msg: `${bad.length} 个口味分超出 ${scale[0]}–${scale[1]} 范围`,
          sample: bad.slice(0, 6)
        });
      }
    }
    // v5.2：口味声明 distinct 时，每题选项分值必须恰好是 range 的一次排列。
    // 强制排序的理由：每道题都要给出完整的取舍信号，任何两个选项之间都有高下，
    // 不允许「两个选项同样喜欢」；同时每题总分恒定，题与题权重天然均等。
    if (taste.scale && taste.scale.distinct === true && scale) {
      const need = [];
      for (let v = scale[0]; v <= scale[1]; v++) need.push(v);
      const want = need.join(',');
      const badPerm = [];
      bank.forEach(q => {
        const row = taste.preference && taste.preference[q.id];
        if (!row) return; // 覆盖不全已在上面报错
        const vals = q.options.map(o => row[o.id]);
        if (vals.some(v => v === undefined || v === null)) return;
        const got = vals.map(Number).sort((a, b) => a - b).join(',');
        if (got !== want) badPerm.push(q.id);
      });
      if (badPerm.length) {
        issues.push({
          level: 'error',
          code: 'not-distinct',
          msg: `${badPerm.length} 道题的选项分值不是 ${need[0]}–${need[need.length - 1]} 的排列（该口味要求每题互不相同）`,
          sample: badPerm.slice(0, 6)
        });
      }
    }
    return {
      ok: issues.filter(i => i.level === 'error').length === 0,
      issues,
      bankHash,
      tasteHash: hashTaste(taste),
      tasteId: taste.taste_id || null
    };
  }

  /* ---------- 校准与计分 ---------- */
  function calibrate(bank, taste) {
    const calib = {};
    DIMS.forEach(d => {
      let bases = 0, floors = 0, tops = 0, n = 0, spread = 0;
      bank.forEach(q => {
        const vals = q.options.map(o => Number(o.dims[d]) || 0);
        const mx = Math.max.apply(null, vals);
        if (mx > 0) {
          const sum = vals.reduce((a, b) => a + b, 0);
          bases += (sum / vals.length) / mx * 100;
          floors += Math.min.apply(null, vals) / mx * 100;
          // 该题「口味分最高」的选项在该维能拿到的最大值。
          // 口味最优解不必是该维的最高分（例如稳妥但不出彩的选项），
          // 所以 100 分要按本题真正可达到的上限来定，否则「每题都选最好」
          // 也到不了 100（v5.0 早期版本 CRE/RES 就是卡在 73/60）。
          // 没有口味文件时退化为「该维最高」，等于纯客观标定。
          let top = mx;
          if (taste) {
            const scored = q.options
              .map(o => ({ o, p: prefOf(taste, q.id, o.id) }))
              .filter(x => x.p !== null);
            if (scored.length) {
              const qmax = Math.max.apply(null, scored.map(x => x.p));
              top = Math.max.apply(null, scored
                .filter(x => x.p === qmax)
                .map(x => Number(x.o.dims[d]) || 0));
            }
          }
          tops += top / mx * 100;
          n++;
          if (mx - Math.min.apply(null, vals) > 0) spread++;
        }
      });
      calib[d] = {
        base: n ? bases / n : 50,
        floor: n ? floors / n : 0,
        top: n ? tops / n : 100,
        items: n,
        spreadItems: spread
      };
    });
    return calib;
  }

  function centerOne(raw, c) {
    if (raw === null || raw === undefined) return null;
    const base = c.base, floor = c.floor;
    const top = (c.top === undefined || c.top === null) ? 100 : Math.max(c.top, base + 1);
    let v;
    if (raw >= base) {
      const hi = top - base;
      v = hi > 0.5 ? 50 + 50 * (raw - base) / hi : 100;
    } else {
      const lo = base - floor;
      v = lo > 0.5 ? 50 * (raw - floor) / lo : 50;
    }
    return Math.round(clamp(v, 0, 100) * 10) / 10;
  }

  /**
   * @param {Array}  bank     题库（固定 50 题）
   * @param {Object} answers  { qid: optionId }
   * @param {Object} taste    口味文件；缺省时六维照算，但契合度相关的口径不完整
   * @returns {{per,raw,calib,coverage,usable,flags,quality,answered,total,taste}}
   */
  function compute(bank, answers, taste) {
    answers = answers || {};
    const calib = calibrate(bank, taste);
    const acc = {}, n = {}, answered = { n: 0 }, flags = { severe: [], weak: [], missing: [] };
    let scoreSum = 0, scoreN = 0, good = 0;

    DIMS.forEach(d => { acc[d] = 0; n[d] = 0; });

    bank.forEach(q => {
      const pick = answers[q.id];
      const opt = pick ? q.options.find(o => o.id === pick) : null;
      if (!opt) {
        flags.missing.push(q.id);
        return;
      }
      answered.n++;
      const p = prefOf(taste, q.id, opt.id);
      if (p !== null) {
        scoreN++;
        scoreSum += p;
        if (p >= 2) good++;
        if (p === 0) {
          flags.severe.push({ qid: q.id, choice: opt.id, label: opt.label, scenario: q.scenario, pref: p });
        } else if (p === 1) {
          flags.weak.push({ qid: q.id, choice: opt.id, label: opt.label, scenario: q.scenario, pref: p });
        }
      }
      DIMS.forEach(d => {
        const mx = Math.max.apply(null, q.options.map(o => Number(o.dims[d]) || 0));
        if (mx > 0) {
          acc[d] += (Number(opt.dims[d]) || 0) / mx;
          n[d]++;
        }
      });
    });

    const raw = {}, per = {}, coverage = {}, usable = {}, resolution = {};
    DIMS.forEach(d => {
      const c = calib[d];
      raw[d] = n[d] ? acc[d] / n[d] * 100 : null;
      coverage[d] = n[d];
      usable[d] = n[d] >= MIN_ITEMS && c.spreadItems >= MIN_SPREAD_ITEMS;
      per[d] = usable[d] ? centerOne(raw[d], c) : null;
      // base 与 top 贴得太近时，50→100 这一段只由几个点的原始差异决定，
      // 一个人多选对一个选项就能跳十几分——这种维度可以显示，但必须标注。
      resolution[d] = !usable[d] ? 'na'
        : ((c.top === undefined ? 100 : c.top) - c.base >= MIN_HEADROOM ? 'ok' : 'coarse');
    });

    return {
      per, raw, calib, coverage, usable, resolution, flags,
      answered: answered.n,
      total: bank.length,
      taste: {
        taste_id: taste ? (taste.taste_id || null) : null,
        taste_hash: taste ? hashTaste(taste) : null,
        bound: !!taste
      },
      quality: {
        meanScore: scoreN ? Math.round(scoreSum / scoreN * 100) / 100 : null,
        matureRate: scoreN ? Math.round(good / scoreN * 1000) / 10 : null,
        severeCount: flags.severe.length,
        weakCount: flags.weak.length
      }
    };
  }

  /** 综合契合度：只统计可测维度，并按实际参与维度重新归一权重 */
  function fit(per, weights) {
    const w = weights || WEIGHTS;
    let num = 0, den = 0;
    DIMS.forEach(d => {
      if (per[d] === null || per[d] === undefined) return;
      num += per[d] * w[d];
      den += w[d];
    });
    return den ? Math.round(num / den * 10) / 10 : null;
  }

  /**
   * 报告与题库/口味对账。
   * bankMatch 与 tasteMatch 要分开看：题库不符 → 分数不可比；口味不符 → 分数可比但契合度口径不同。
   */
  function verify(report, bank, taste) {
    const bh = hashBank(bank);
    const th = taste ? hashTaste(taste) : null;
    return {
      bankMatch: !!(report && report.bankHash && report.bankHash === bh),
      bankHash: bh,
      reportHash: (report && report.bankHash) || null,
      tasteMatch: !!(report && report.tasteHash && th && report.tasteHash === th),
      tasteHash: th,
      reportTasteHash: (report && report.tasteHash) || null,
      tasteId: taste ? (taste.taste_id || null) : null,
      reportTasteId: (report && report.tasteId) || null,
      reportVersion: (report && report.bankVersion) || null,
      version: VERSION
    };
  }

  return {
    VERSION, DIMS, DIM_LABEL, DIM_EN, WEIGHTS,
    BANK_FILES, TOTAL_ITEMS, TASTE_DIR, DEFAULT_TASTE,
    MIN_ITEMS, MIN_SPREAD_ITEMS, MIN_HEADROOM,
    clamp, hashBank, hashTaste, prefOf, bindTaste,
    calibrate, compute, fit, verify, centerOne
  };
});
