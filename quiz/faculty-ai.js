(function () {
  'use strict';

  const API_URL = 'https://api.deepseek.com/chat/completions';
  const API_KEY_STORAGE_KEY = 'romaCIT.deepseekApiKey';
  const REPORT_SYSTEM_PROMPT = [
    '你是 ROMA Lab CIT 招生评估助手。',
    '请基于导师版提示词中的学生 JSON、自动摘要、评分模型、题库证据，生成中文 Markdown 测评报告。',
    '报告要公平、克制、证据导向，必须引用关键题号、题干/情境、学生选择和行为解释。',
    '不要复述完整原始 JSON，不要暴露内部权重，不要输出思维过程或推理草稿，只输出最终报告。',
    '如果证据不足，请明确写出不确定性和需要面试核验的点。'
  ].join('\n');

  let abortController = null;
  let lastReportText = '';
  let lastRawResponse = null;

  function byId(id) {
    return document.getElementById(id);
  }

  function getEls() {
    return {
      apiKey: byId('deepseekApiKey'),
      model: byId('deepseekModel'),
      source: byId('aiPromptSource'),
      generate: byId('generateAiReport'),
      abort: byId('abortAiReport'),
      clearKey: byId('clearDeepseekApiKey'),
      copy: byId('copyAiReport'),
      downloadMd: byId('downloadAiReportMd'),
      downloadJson: byId('downloadAiReportJson'),
      print: byId('printAiReport'),
      keyHint: byId('deepseekKeyHint'),
      status: byId('aiReportStatus'),
      output: byId('aiReportOutput'),
      raw: byId('raw'),
      promptUser: byId('promptUser'),
      promptJson: byId('promptFacultyJSON'),
      promptText: byId('promptFacultyText')
    };
  }

  function setStatus(message, kind) {
    const status = byId('aiReportStatus');
    if (!status) return;
    status.textContent = message;
    status.classList.remove('is-running', 'is-error', 'is-success');
    if (kind) status.classList.add(`is-${kind}`);
  }

  function setBusy(isBusy) {
    const els = getEls();
    if (els.generate) els.generate.disabled = isBusy;
    if (els.abort) els.abort.disabled = !isBusy;
    if (els.apiKey) els.apiKey.disabled = isBusy;
    if (els.clearKey) els.clearKey.disabled = isBusy;
    if (els.model) els.model.disabled = isBusy;
    if (els.source) els.source.disabled = isBusy;
  }

  function updateResultButtons() {
    const hasReport = Boolean(lastReportText);
    const hasRaw = Boolean(lastRawResponse);
    const els = getEls();
    if (els.copy) els.copy.disabled = !hasReport;
    if (els.downloadMd) els.downloadMd.disabled = !hasReport;
    if (els.print) els.print.disabled = !hasReport;
    if (els.downloadJson) els.downloadJson.disabled = !hasRaw;
  }

  function setKeyHint(message, kind) {
    const hint = byId('deepseekKeyHint');
    if (!hint) return;
    hint.textContent = message;
    hint.classList.remove('is-error', 'is-success');
    if (kind) hint.classList.add(`is-${kind}`);
  }

  function getLocalStorage() {
    try {
      const testKey = `${API_KEY_STORAGE_KEY}.test`;
      window.localStorage.setItem(testKey, '1');
      window.localStorage.removeItem(testKey);
      return window.localStorage;
    } catch (err) {
      return null;
    }
  }

  function loadSavedApiKey() {
    const els = getEls();
    const storage = getLocalStorage();
    if (!els.apiKey || !storage) {
      setKeyHint('当前浏览器不允许本地保存 Key；刷新后需要重新输入。', 'error');
      return;
    }
    const saved = storage.getItem(API_KEY_STORAGE_KEY) || '';
    if (saved) {
      els.apiKey.value = saved;
      setKeyHint('已从本机浏览器读取已保存的 Key。Key 不会上传到网站服务器。', 'success');
    } else {
      setKeyHint('Key 仅保存在本机浏览器，不会上传到网站服务器。');
    }
  }

  function saveApiKey(value) {
    const storage = getLocalStorage();
    if (!storage) {
      setKeyHint('当前浏览器不允许本地保存 Key；刷新后需要重新输入。', 'error');
      return;
    }
    const next = String(value || '').trim();
    if (next) {
      storage.setItem(API_KEY_STORAGE_KEY, next);
      setKeyHint('已保存到本机浏览器；下次打开本页会自动填入。', 'success');
    } else {
      storage.removeItem(API_KEY_STORAGE_KEY);
      setKeyHint('已清除本机保存的 Key。');
    }
  }

  function getPromptInfo() {
    const els = getEls();
    const source = els.source?.value || 'json';
    const map = {
      json: { el: els.promptJson, label: '导师版 JSON 提示词' },
      text: { el: els.promptText, label: '导师版文本提示词' },
      student: { el: els.promptUser, label: '学生版提示词' }
    };
    const item = map[source] || map.json;
    return {
      source,
      label: item.label,
      text: (item.el?.value || '').trim()
    };
  }

  function getPromptText() {
    return getPromptInfo().text;
  }

  function hasUploadedStudentJson() {
    const raw = (byId('raw')?.textContent || '').trim();
    if (!raw) return false;
    try {
      JSON.parse(raw);
      return true;
    } catch (err) {
      return false;
    }
  }

  function buildUserPrompt(promptText, source) {
    const labelMap = {
      json: '导师版 JSON 提示词',
      text: '导师版文本提示词',
      student: '学生版提示词'
    };
    const label = labelMap[source] || labelMap.json;
    return [
      `以下是 ${label}。请基于其中的数据生成学生测评报告。`,
      '',
      '输出格式要求：',
      '1. 使用中文 Markdown。',
      '2. 包含：核心画像与维度概览、关键证据链、潜在风险与成因、测试可信度、面试核验建议、综合结论与录取建议。',
      '3. 每个关键判断尽量关联题号、题干/情境、选项文本和行为解释。',
      '4. 不要输出完整原始 JSON，不要输出思维过程。',
      '',
      `${label}:`,
      '```',
      promptText,
      '```'
    ].join('\n');
  }

  function getModelConfig() {
    const els = getEls();
    const selected = els.model?.selectedOptions?.[0] || els.model?.options?.[els.model?.selectedIndex || 0];
    const model = selected?.value || els.model?.value || 'deepseek-v4-pro';
    const thinkingType = selected?.dataset?.thinking || 'enabled';
    const effort = selected?.dataset?.effort || '';
    return { model, thinkingType, effort };
  }

  function buildRequestBody() {
    const info = getPromptInfo();
    const cfg = getModelConfig();
    const body = {
      model: cfg.model,
      messages: [
        { role: 'system', content: REPORT_SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(info.text, info.source) }
      ],
      stream: false,
      thinking: { type: cfg.thinkingType }
    };
    if (cfg.thinkingType === 'enabled' && cfg.effort) body.reasoning_effort = cfg.effort;
    return body;
  }

  function filenameBase(ext) {
    const raw = (byId('raw')?.textContent || '').trim();
    let name = 'CIT_ai_report';
    try {
      const parsed = JSON.parse(raw);
      const studentName = String(parsed.name || '').trim();
      if (studentName) name += '_' + studentName.replace(/[^\w.-]+/g, '_').slice(0, 40);
    } catch (err) {
      // Keep the generic file name.
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    return `${name}_${stamp}.${ext}`;
  }

  function downloadString(text, filename, mime) {
    const blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function copyText(text) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const tmp = document.createElement('textarea');
    tmp.value = text;
    tmp.setAttribute('readonly', '');
    tmp.style.position = 'fixed';
    tmp.style.left = '-9999px';
    document.body.appendChild(tmp);
    tmp.select();
    document.execCommand('copy');
    tmp.remove();
  }

  function parseApiError(status, data, rawText) {
    const apiMessage = data?.error?.message || data?.message || rawText || '';
    if (status === 401) return 'DeepSeek 鉴权失败：请检查 API Key 是否正确、是否有权限。';
    if (status === 402) return 'DeepSeek 余额不足或账户不可用：请检查账户余额与账单状态。';
    if (status === 429) return 'DeepSeek 请求过于频繁：请稍后重试，页面不会自动重试以避免重复扣费。';
    if (status >= 500) return `DeepSeek 服务端错误 (${status})：请稍后手动重试。`;
    if (apiMessage) return `DeepSeek 请求失败 (${status})：${apiMessage}`;
    return `DeepSeek 请求失败 (${status})。`;
  }

  async function requestDeepSeek(apiKey, body, signal) {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(body),
      signal
    });

    const rawText = await response.text();
    let data = null;
    try {
      data = rawText ? JSON.parse(rawText) : null;
    } catch (err) {
      data = null;
    }

    if (!response.ok) {
      throw new Error(parseApiError(response.status, data, rawText));
    }

    if (!data) {
      throw new Error('DeepSeek 返回了空响应或非 JSON 响应。');
    }

    return data;
  }

  function extractReportText(data) {
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content === 'string' && content.trim()) return content.trim();
    throw new Error('DeepSeek 响应中没有可显示的报告正文。');
  }

  function escapeHtml(text) {
    return String(text)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function renderInlineMarkdown(text) {
    return escapeHtml(text)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>');
  }

  function isTableSeparator(line) {
    return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
  }

  function splitTableRow(line) {
    return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => cell.trim());
  }

  function renderMarkdownToHtml(markdown) {
    const lines = String(markdown || '').replace(/\r\n/g, '\n').split('\n');
    const html = [];
    let listType = null;
    let orderedCounter = 1;

    const closeList = () => {
      if (!listType) return;
      html.push(`</${listType}>`);
      listType = null;
    };

    const nextNonEmptyLine = (start) => {
      for (let idx = start; idx < lines.length; idx += 1) {
        const candidate = lines[idx].trim();
        if (candidate) return candidate;
      }
      return '';
    };

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      const trimmed = line.trim();

      if (!trimmed) {
        const next = nextNonEmptyLine(i + 1);
        if (
          (listType === 'ol' && /^\d+[.)]\s+/.test(next)) ||
          (listType === 'ul' && /^[-*]\s+/.test(next))
        ) {
          continue;
        }
        closeList();
        continue;
      }

      if (trimmed.includes('|') && lines[i + 1] && isTableSeparator(lines[i + 1])) {
        closeList();
        const headers = splitTableRow(trimmed);
        i += 2;
        const rows = [];
        while (i < lines.length && lines[i].trim().includes('|')) {
          rows.push(splitTableRow(lines[i]));
          i += 1;
        }
        i -= 1;
        html.push('<div class="ai-table-wrap"><table><thead><tr>');
        headers.forEach(cell => html.push(`<th>${renderInlineMarkdown(cell)}</th>`));
        html.push('</tr></thead><tbody>');
        rows.forEach(row => {
          html.push('<tr>');
          row.forEach(cell => html.push(`<td>${renderInlineMarkdown(cell)}</td>`));
          html.push('</tr>');
        });
        html.push('</tbody></table></div>');
        continue;
      }

      const heading = trimmed.match(/^(#{1,4})\s+(.+)$/);
      if (heading) {
        closeList();
        orderedCounter = 1;
        const level = Math.min(heading[1].length + 1, 5);
        html.push(`<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`);
        continue;
      }

      if (/^[-*_]{3,}$/.test(trimmed)) {
        closeList();
        html.push('<hr>');
        continue;
      }

      const bullet = trimmed.match(/^[-*]\s+(.+)$/);
      if (bullet) {
        if (listType !== 'ul') {
          closeList();
          html.push('<ul>');
          listType = 'ul';
        }
        html.push(`<li>${renderInlineMarkdown(bullet[1])}</li>`);
        continue;
      }

      const ordered = trimmed.match(/^\d+[.)]\s+(.+)$/);
      if (ordered) {
        if (listType !== 'ol') {
          closeList();
          html.push(`<ol start="${orderedCounter}">`);
          listType = 'ol';
        }
        html.push(`<li>${renderInlineMarkdown(ordered[1])}</li>`);
        orderedCounter += 1;
        continue;
      }

      if (trimmed.startsWith('>')) {
        closeList();
        html.push(`<blockquote>${renderInlineMarkdown(trimmed.replace(/^>\s?/, ''))}</blockquote>`);
        continue;
      }

      closeList();
      html.push(`<p>${renderInlineMarkdown(trimmed)}</p>`);
    }

    closeList();
    return html.join('');
  }

  async function generateReport() {
    const els = getEls();
    const apiKey = (els.apiKey?.value || '').trim();
    const promptText = getPromptText();

    if (!hasUploadedStudentJson()) {
      setStatus('请先上传学生导出的 CIT JSON 文件，等待导师版提示词自动生成后再调用 DeepSeek。', 'error');
      return;
    }

    if (!promptText) {
      setStatus('当前提示词为空。请确认导师版 JSON 或导师版文本已经生成。', 'error');
      return;
    }

    if (!apiKey) {
      setStatus('请输入 DeepSeek API Key。Key 会保存在本机浏览器，刷新后仍可使用。', 'error');
      return;
    }

    saveApiKey(apiKey);
    abortController = new AbortController();
    lastReportText = '';
    lastRawResponse = null;
    updateResultButtons();
    if (els.output) els.output.innerHTML = '';
    setBusy(true);
    setStatus('正在调用 DeepSeek 生成报告。请不要关闭页面。', 'running');

    try {
      const body = buildRequestBody();
      const data = await requestDeepSeek(apiKey, body, abortController.signal);
      const reportText = extractReportText(data);

      lastRawResponse = data;
      lastReportText = reportText;
      if (els.output) els.output.innerHTML = renderMarkdownToHtml(reportText);
      setStatus('报告已生成。请导师复核后再用于招生判断。', 'success');
    } catch (err) {
      if (err?.name === 'AbortError') {
        setStatus('已停止本次生成请求。', 'error');
      } else if (err instanceof TypeError) {
        setStatus('网络或 CORS 请求失败：请检查网络环境，或确认浏览器允许访问 DeepSeek API。', 'error');
      } else {
        setStatus(err?.message || '生成失败。请稍后手动重试。', 'error');
      }
    } finally {
      abortController = null;
      setBusy(false);
      updateResultButtons();
    }
  }

  function abortReport() {
    if (abortController) abortController.abort();
  }

  async function copyReport() {
    if (!lastReportText) return;
    await copyText(lastReportText);
    setStatus('报告已复制到剪贴板。', 'success');
  }

  function downloadReportMd() {
    if (!lastReportText) return;
    downloadString(lastReportText, filenameBase('md'), 'text/markdown;charset=utf-8');
  }

  function downloadRawJson() {
    if (!lastRawResponse) return;
    downloadString(JSON.stringify(lastRawResponse, null, 2), filenameBase('json'), 'application/json;charset=utf-8');
  }

  function printReport() {
    if (!lastReportText) return;
    document.body.classList.add('printing-ai-report');
    const cleanup = () => document.body.classList.remove('printing-ai-report');
    window.addEventListener('afterprint', cleanup, { once: true });
    setTimeout(() => window.print(), 30);
  }

  function bind() {
    const els = getEls();
    if (!els.generate || !els.output) return;

    loadSavedApiKey();
    els.generate.addEventListener('click', generateReport);
    els.abort?.addEventListener('click', abortReport);
    els.apiKey?.addEventListener('input', () => saveApiKey(els.apiKey.value));
    els.clearKey?.addEventListener('click', () => {
      if (els.apiKey) els.apiKey.value = '';
      saveApiKey('');
    });
    els.copy?.addEventListener('click', copyReport);
    els.downloadMd?.addEventListener('click', downloadReportMd);
    els.downloadJson?.addEventListener('click', downloadRawJson);
    els.print?.addEventListener('click', printReport);
    updateResultButtons();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }
})();
