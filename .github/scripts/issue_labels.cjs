'use strict';

// 维护约定：表单的分类标题和选项是解析协议，修改时同步更新映射与测试
// P0 为阻断性问题，P1 为严重问题，P2 为普通问题，P3 为低影响改进，均由维护者分诊
// 只处理首次打开并补充缺失的分类组，编辑和重开后的标签由维护者管理
const FORM_FIELDS = {
  area: {
    title: '涉及模块 / Affected area',
    options: {
      '账号与登录 / Accounts and login': ['area: auth'],
      '播放与音频 / Playback and audio': ['area: playback'],
      'USB 独占播放 / USB exclusive playback': ['area: usb-exclusive'],
      '网络与代理 / Network and proxy': ['area: network'],
      '歌词 / Lyrics': ['area: lyrics'],
      '下载与存储 / Downloads and storage': ['area: download'],
      '本地音乐与歌单 / Local music and playlists': ['area: local-media'],
      '云同步与备份 / Cloud sync and backup': ['area: sync'],
      '一起听 / Listen Together': ['area: listen-together'],
      '界面与交互 / UI and interaction': ['area: ui'],
      '性能与资源占用 / Performance and resource usage': ['area: performance'],
      '文档与翻译 / Documentation and translation': ['area: documentation', 'documentation'],
      '构建、CI 与发布 / Build and CI and release': ['area: ci'],
      '安装、启动与更新 / Installation and startup and update': ['area: startup'],
      '其他或不确定 / Other or unsure': [],
    },
  },
  platform: {
    title: '涉及平台 / Affected platforms',
    options: {
      '网易云音乐 / NetEase Cloud Music': ['platform: netease'],
      Bilibili: ['platform: bilibili'],
      'YouTube Music': ['platform: youtube'],
      '本地音频或下载文件 / Local audio or downloaded files': [],
      '不涉及在线平台 / Not related to online platforms': [],
      '其他或不确定 / Other or unsure': [],
    },
  },
};

function readSections(body) {
  const sections = new Map();
  let current = null;
  let fence = null;
  for (const line of String(body ?? '').replace(/<!--[\s\S]*?-->/g, '').split(/\r?\n/)) {
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (marker) {
      if (!fence) fence = marker[1];
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = null;
      continue;
    }
    if (fence) continue;
    const heading = line.match(/^### (.+?)\s*$/);
    if (heading) {
      const values = sections.get(heading[1]) ?? [];
      current = [];
      values.push(current);
      sections.set(heading[1], values);
    } else if (current) {
      current.push(line);
    }
  }
  return sections;
}

function collectIssueLabels(issue) {
  const current = new Set((issue.labels ?? []).map(label =>
    (typeof label === 'string' ? label : label.name).toLowerCase()));
  const hasGroup = prefix => [...current].some(name => name.startsWith(prefix));
  const sections = readSections(issue.body);
  const wanted = new Set();
  if (!current.has('bug') && !current.has('enhancement')) {
    const types = [
      ['问题描述 / Problem description', 'bug'],
      ['功能背景与需求 / Motivation', 'enhancement'],
      ['建议概述 / Suggestion overview', 'enhancement'],
    ].filter(([heading]) => sections.get(heading)?.length === 1);
    if (types.length === 1) wanted.add(types[0][1]);
  }
  if (!hasGroup('status: ')) wanted.add('status: needs-triage');
  for (const [group, field] of Object.entries(FORM_FIELDS)) {
    if (hasGroup(`${group}: `)) continue;
    const values = sections.get(field.title);
    if (values?.length !== 1) continue;
    for (const choice of values[0].join('\n').split(/,\s*|\n/).map(value => value.trim())) {
      if (!Object.hasOwn(field.options, choice)) continue;
      for (const label of field.options[choice]) wanted.add(label);
    }
  }
  return [...wanted].filter(label => !current.has(label.toLowerCase()));
}

async function applyIssueLabels({ github, context, core }) {
  const { action, issue } = context.payload;
  if (action !== 'opened' || !issue || issue.pull_request) return [];
  const target = { ...context.repo, issue_number: issue.number };
  // 读取当前标签，避免排队期间已完成的人工分诊被旧事件覆盖
  const { data: latest } = await github.rest.issues.get(target);
  const labels = collectIssueLabels(latest);
  if (labels.length) await github.rest.issues.addLabels({ ...target, labels });
  core.info(`Issue #${issue.number}: added ${labels.length} labels`);
  return labels;
}

module.exports = { FORM_FIELDS, collectIssueLabels, applyIssueLabels };
