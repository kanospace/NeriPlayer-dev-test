'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { collectIssueLabels, applyIssueLabels, FORM_FIELDS } = require('./issue_labels.cjs');
const { syncLabels } = require('./sync_labels.cjs');

const areaHeading = '涉及模块 / Affected area';
const platformHeading = '涉及平台 / Affected platforms';
const bugBody = (area, platform = '不涉及在线平台 / Not related to online platforms') =>
  `### 问题描述 / Problem description\n\n播放失败\n\n### ${areaHeading}\n\n${area}\n\n### ${platformHeading}\n\n${platform}`;

test('bug 表单按明确选择补充类型、分诊、模块和平台标签', () => {
  assert.deepEqual(collectIssueLabels({ body: bugBody('播放与音频 / Playback and audio', '网易云音乐 / NetEase Cloud Music, Bilibili'), labels: [] }),
    ['bug', 'status: needs-triage', 'area: playback', 'platform: netease', 'platform: bilibili']);
});

test('功能与建议表单使用 enhancement', () => {
  for (const heading of ['功能背景与需求 / Motivation', '建议概述 / Suggestion overview']) {
    assert.deepEqual(collectIssueLabels({ body: `### ${heading}\n\n希望改进体验`, labels: [] }),
      ['enhancement', 'status: needs-triage']);
  }
});

test('未知选项、未回答和继承属性名不会生成标签', () => {
  assert.deepEqual(collectIssueLabels({ body: bugBody('P0, __proto__, constructor', '_No response_'), labels: [] }),
    ['bug', 'status: needs-triage']);
});

test('正文中的关键词和恶意代码不会参与匹配或执行', () => {
  global.issueLabelsInjected = false;
  const body = bugBody('${global.issueLabelsInjected = true}', 'platform: youtube') +
    '\n\n### 日志 / Logs\n\nP0 crash urgent area: auth\n```js\n### 涉及模块 / Affected area\n\n账号与登录 / Accounts and login\n```';
  assert.deepEqual(collectIssueLabels({ body, labels: [] }), ['bug', 'status: needs-triage']);
  assert.equal(global.issueLabelsInjected, false);
  delete global.issueLabelsInjected;
});

test('围栏内的伪表单和重复字段不会伪造自动分类', () => {
  assert.deepEqual(collectIssueLabels({ body: '```\n' + bugBody('歌词 / Lyrics') + '\n```', labels: [] }),
    ['status: needs-triage']);
  assert.deepEqual(collectIssueLabels({ body: bugBody('歌词 / Lyrics') + `\n\n### ${areaHeading}\n\n账号与登录 / Accounts and login`, labels: [] }),
    ['bug', 'status: needs-triage']);
});

test('保留已有人工分诊分组和优先级，不新增冲突分类', () => {
  assert.deepEqual(collectIssueLabels({ body: bugBody('歌词 / Lyrics', '网易云音乐 / NetEase Cloud Music'),
    labels: [{ name: 'enhancement' }, { name: 'status: confirmed' }, { name: 'area: ui' }, { name: 'platform: youtube' }, { name: 'P1' }, { name: 'custom' }] }), []);
});

test('已存在的标签不重复添加，未分诊分组仍可补齐', () => {
  assert.deepEqual(collectIssueLabels({ body: bugBody('歌词 / Lyrics'), labels: ['BUG', 'custom'] }),
    ['status: needs-triage', 'area: lyrics']);
});

test('多选模块去重并给文档选项添加现有 documentation 标签', () => {
  assert.deepEqual(collectIssueLabels({ body: bugBody('歌词 / Lyrics, 文档与翻译 / Documentation and translation, 歌词 / Lyrics'), labels: [] }),
    ['bug', 'status: needs-triage', 'area: lyrics', 'area: documentation', 'documentation']);
});

test('所有模块选项都有显式映射，优先级不由表单自动设置', () => {
  const cases = [
    ['账号与登录 / Accounts and login', ['area: auth']],
    ['播放与音频 / Playback and audio', ['area: playback']],
    ['USB 独占播放 / USB exclusive playback', ['area: usb-exclusive']],
    ['网络与代理 / Network and proxy', ['area: network']],
    ['歌词 / Lyrics', ['area: lyrics']],
    ['下载与存储 / Downloads and storage', ['area: download']],
    ['本地音乐与歌单 / Local music and playlists', ['area: local-media']],
    ['云同步与备份 / Cloud sync and backup', ['area: sync']],
    ['一起听 / Listen Together', ['area: listen-together']],
    ['界面与交互 / UI and interaction', ['area: ui']],
    ['性能与资源占用 / Performance and resource usage', ['area: performance']],
    ['文档与翻译 / Documentation and translation', ['area: documentation', 'documentation']],
    ['构建、CI 与发布 / Build and CI and release', ['area: ci']],
    ['安装、启动与更新 / Installation and startup and update', ['area: startup']],
    ['其他或不确定 / Other or unsure', []],
  ];
  for (const [choice, labels] of cases) {
    assert.deepEqual(collectIssueLabels({ body: bugBody(choice), labels: [] }), ['bug', 'status: needs-triage', ...labels], choice);
  }
  assert.equal(cases.length, Object.keys(FORM_FIELDS.area.options).length);
});

test('所有平台选项都有显式映射', () => {
  const cases = [
    ['网易云音乐 / NetEase Cloud Music', ['platform: netease']],
    ['Bilibili', ['platform: bilibili']],
    ['YouTube Music', ['platform: youtube']],
    ['本地音频或下载文件 / Local audio or downloaded files', []],
    ['不涉及在线平台 / Not related to online platforms', []],
    ['其他或不确定 / Other or unsure', []],
  ];
  for (const [choice, labels] of cases) {
    assert.deepEqual(collectIssueLabels({ body: bugBody('其他或不确定 / Other or unsure', choice), labels: [] }), ['bug', 'status: needs-triage', ...labels], choice);
  }
  assert.equal(cases.length, Object.keys(FORM_FIELDS.platform.options).length);
});

function dropdownFields(source) {
  return source.split(/\n(?=  - type: )/).filter(block => block.startsWith('  - type: dropdown')).map(block => ({
    title: block.match(/^      label: (.+)$/m)?.[1],
    choices: [...block.matchAll(/^        - (.+)$/gm)].map(match => match[1]),
  }));
}

test('三个表单的分类字段与脚本协议一致，所有自动标签存在于清单', () => {
  for (const filename of ['bug-report.yml', 'feature-request.yml', 'suggestion-submission.yml']) {
    const source = fs.readFileSync(path.join(__dirname, '..', 'ISSUE_TEMPLATE', filename), 'utf8');
    const fields = dropdownFields(source);
    for (const field of Object.values(FORM_FIELDS)) {
      const matching = fields.filter(item => item.title === field.title);
      assert.equal(matching.length, 1, `${filename}: ${field.title}`);
      assert.deepEqual(matching[0].choices, Object.keys(field.options), filename);
    }
  }
  const definitions = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'labels.json'), 'utf8'));
  const names = new Set(definitions.map(label => label.name));
  for (const field of Object.values(FORM_FIELDS)) {
    for (const labels of Object.values(field.options)) {
      for (const name of labels) assert.ok(names.has(name), name);
    }
  }
  for (const name of ['bug', 'enhancement', 'status: needs-triage', 'P0', 'P1', 'P2', 'P3']) assert.ok(names.has(name), name);
});

test('Issue runner 读取最新标签，只补充缺少项且不替换已有标签', async () => {
  const requests = [];
  const result = await applyIssueLabels({
    context: { repo: { owner: 'owner', repo: 'repo' }, payload: { action: 'opened', issue: { number: 12 } } },
    github: { rest: { issues: {
      get: async args => { assert.deepEqual(args, { owner: 'owner', repo: 'repo', issue_number: 12 }); return { data: { number: 12, body: bugBody('歌词 / Lyrics'), labels: [{ name: 'P1' }, { name: 'status: confirmed' }] } }; },
      addLabels: async args => { requests.push(args); },
    } } },
    core: { info() {} },
  });
  assert.deepEqual(result, ['bug', 'area: lyrics']);
  assert.deepEqual(requests, [{ owner: 'owner', repo: 'repo', issue_number: 12, labels: ['bug', 'area: lyrics'] }]);
});

test('编辑、重开和 PR 不触发自动标签 API', async () => {
  for (const payload of [{ action: 'edited', issue: { number: 12 } }, { action: 'reopened', issue: { number: 12 } },
    { action: 'opened', issue: { number: 12, pull_request: {} } }]) {
    assert.deepEqual(await applyIssueLabels({ context: { payload }, github: {}, core: {} }), []);
  }
});

test('标签已齐全时不发送空写请求', async () => {
  assert.deepEqual(await applyIssueLabels({
    context: { repo: { owner: 'o', repo: 'r' }, payload: { action: 'opened', issue: { number: 1 } } },
    github: { rest: { issues: { get: async () => ({ data: { body: '', labels: ['status: confirmed'] } }) } } },
    core: { info() {} },
  }), []);
});

test('同步标签只创建或更新清单中的项，未知远端标签被保留', async () => {
  const writes = [];
  const api = {
    listLabelsForRepo() {},
    createLabel: async args => { writes.push(['create', args]); },
    updateLabel: async args => { writes.push(['update', args]); },
  };
  const result = await syncLabels({
    context: { repo: { owner: 'o', repo: 'r' } },
    github: { rest: { issues: api }, paginate: async (endpoint, args) => {
      assert.equal(endpoint, api.listLabelsForRepo);
      assert.deepEqual(args, { owner: 'o', repo: 'r', per_page: 100 });
      return [{ name: 'bug', color: 'd73a4a', description: 'existing' }, { name: 'P1', color: 'ffffff', description: '' }, { name: 'custom', color: '123456', description: 'keep' }];
    } },
    core: { info() {} },
  }, [{ name: 'bug', color: 'd73a4a', description: 'existing' }, { name: 'P1', color: 'b60205', description: 'high' }, { name: 'P2', color: 'fbca04', description: 'normal' }]);
  assert.deepEqual(result, { created: ['P2'], updated: ['P1'], unchanged: ['bug'] });
  assert.deepEqual(writes, [
    ['update', { owner: 'o', repo: 'r', name: 'P1', new_name: 'P1', color: 'b60205', description: 'high' }],
    ['create', { owner: 'o', repo: 'r', name: 'P2', color: 'fbca04', description: 'normal' }],
  ]);
});

test('无效或重复标签配置在调用 GitHub 前拒绝', async () => {
  for (const labels of [[{ name: 'bad', color: 'red' }], [{ name: 'P1', color: '123456' }, { name: 'p1', color: '654321' }]]) {
    await assert.rejects(syncLabels({ github: {}, context: {}, core: {} }, labels), /label/i);
  }
});

test('标签配置的额外属性不能改变同步目标仓库', async () => {
  const writes = [];
  await syncLabels({
    context: { repo: { owner: 'o', repo: 'r' } },
    github: { paginate: async () => [], rest: { issues: {
      listLabelsForRepo() {}, createLabel: async args => { writes.push(args); },
    } } },
    core: { info() {} },
  }, [{ name: 'P1', color: 'b60205', description: 'high', owner: 'other', repo: 'other' }]);
  assert.deepEqual(writes, [{ owner: 'o', repo: 'r', name: 'P1', color: 'b60205', description: 'high' }]);
});
