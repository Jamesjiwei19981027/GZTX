"""总体结论的存档、隔离与 AI 发现去重；仅使用受控模型。"""
import json
from copy import deepcopy
from types import SimpleNamespace

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.models.audit_run import AuditRun
from app.services import axis_audit as service
from app.services import axis_audit_jobs as jobs
from app.services.llm_settings import ResolvedLlm


@pytest_asyncio.fixture(autouse=True)
async def isolated_audit_environment(monkeypatch, async_engine):
    from app.services import llm_settings
    monkeypatch.setattr(llm_settings, 'llm_from_env', lambda: None)
    monkeypatch.setattr(jobs, 'async_session_factory', async_sessionmaker(async_engine, expire_on_commit=False))


@pytest.mark.parametrize('summary', ['先催办小李，再催办小王。建议逐日确认交付。', '结' * 801, None, 123, ''])
async def test_summary_archived_only_for_initiator(async_client, seed_ids, db_session, monkeypatch, summary):
    async def resolve(*args, **kwargs):
        return ResolvedLlm('openai', 'https://unused.invalid/v1', 'test', 'test', source='company')

    async def complete(*args, **kwargs):
        payload = json.loads(kwargs['messages'][-1]['content'])
        people = payload.get('people') or [payload['person']]
        reply = {'overall_risk': 'low', 'nodes': [
            {'node_id': p['node_id'], 'risk_level': 'low', 'summary': '受控逐人结论',
             'findings': [], 'suggested_actions': []} for p in people]}
        if summary is not None:
            reply['overall_summary'] = summary
        return {'ok': True, 'content': json.dumps(reply, ensure_ascii=False)}

    monkeypatch.setattr(service, 'resolve_llm', resolve)
    monkeypatch.setattr(service, 'chat_completion', complete)
    url = f'/api/v1/projects/{seed_ids["project_id"]}/audits'
    instruction = '重点看谁最拖后腿，并给出催办顺序'
    response = await async_client.post(url, headers=seed_ids['pm_headers'],
        json={'scope': 'project', 'custom_instruction': instruction})
    baseline = response.json()['data']
    await service.complete_audit(db_session, baseline['id'])
    initiator = (await async_client.get(url + f'/{baseline["id"]}', headers=seed_ids['pm_headers'])).json()['data']
    assert initiator['mode'] == 'ai', '缺失或异常总体结论不得导致逐人结果整体回退'
    assert initiator['custom_instruction'] == instruction
    if isinstance(summary, str) and summary:
        assert initiator['overall_summary'] == summary[:800]
    else:
        assert '未提供总体结论' in initiator['overall_summary']
    db_session.expire_all()
    row = await db_session.get(AuditRun, baseline['id'])
    assert row.result_json['overall_summary'] == initiator['overall_summary']
    assert row.result_json['rule_nodes'] == [
        {**n, 'subject_user_ids': row.result_json['rule_nodes'][i]['subject_user_ids']}
        for i, n in enumerate(baseline['nodes'])]
    for path in (url, url + f'/{baseline["id"]}'):
        data = (await async_client.get(path, headers=seed_ids['member_headers'])).json()['data']
        recipient = data['items'][0] if path == url else data
        assert 'overall_summary' not in recipient
        assert recipient['custom_instruction'] is None
        assert 'rule_nodes' not in recipient


async def test_rule_summary_and_restart_keep_metrics_without_answering_instruction(async_client, seed_ids):
    url = f'/api/v1/projects/{seed_ids["project_id"]}/audits'
    response = await async_client.post(url, headers=seed_ids['pm_headers'],
        json={'scope': 'project', 'custom_instruction': '请指定末位人员'})
    baseline = response.json()['data']
    assert '未经 AI 分析' in baseline['overall_summary']
    assert '共 1 人' in baseline['overall_summary']
    assert '高风险' in baseline['overall_summary'] and '逾期' in baseline['overall_summary']
    assert '请指定末位人员' not in baseline['overall_summary']
    await jobs.recover_interrupted_audits()
    data = (await async_client.get(url + f'/{baseline["id"]}', headers=seed_ids['pm_headers'])).json()['data']
    assert data['overall_summary'] == baseline['overall_summary']


@pytest.mark.parametrize(('ai_findings', 'remaining'), [
    ([{'type': '进度风险', 'description': '事项截止六天前，请优先催办并核实当前进度', 'matter_ids': [10]}], ['另一事项逾期', '完成缺材料', '全人职责']),
    ([{'type': '进度风险', 'description': '两事项均已逾期，应按交付依赖安排催办', 'matter_ids': [10, 11]}], ['完成缺材料', '全人职责']),
    ([{'type': '进度风险', 'description': '没有引用事项的泛化建议', 'matter_ids': []}], ['事项逾期', '另一事项逾期', '完成缺材料', '全人职责']),
    ([{'type': '进度风险', 'description': '非法越界引用', 'matter_ids': [10, 99]}], ['事项逾期', '另一事项逾期', '完成缺材料', '全人职责']),
    ([{'type': '进度风险', 'description': '风险', 'matter_ids': [10]}], ['事项逾期', '另一事项逾期', '完成缺材料', '全人职责']),
])
def test_ai_dedup_by_person_type_and_matter_without_mutating_rules(ai_findings, remaining):
    rules = [{'node_id': 1, 'risk_level': 'high', 'summary': '规则', 'subject_user_ids': [2],
        'findings': [
            {'type': '进度风险', 'description': '事项逾期', 'matter_ids': [10]},
            {'type': '进度风险', 'description': '另一事项逾期', 'matter_ids': [11]},
            {'type': '言行不符', 'description': '完成缺材料', 'matter_ids': [10]},
            {'type': '职责落空', 'description': '全人职责', 'matter_ids': []}]}]
    original = deepcopy(rules)
    reply = {'overall_risk': 'low', 'nodes': [{'node_id': 1, 'risk_level': 'low',
        'summary': 'AI 具体判断', 'findings': ai_findings, 'suggested_actions': []}]}
    nodes, _ = service.parse_model(json.dumps(reply), rules,
        {1: [SimpleNamespace(id=10), SimpleNamespace(id=11)]})
    descriptions = [f['description'] for f in nodes[0]['findings']]
    assert [d for d in descriptions if d in ['事项逾期', '另一事项逾期', '完成缺材料', '全人职责']] == remaining
    assert rules == original
    assert nodes[0]['risk_level'] == 'high'


def test_rule_summary_counts_people_risk_and_distinct_overdue_matters():
    summary = service.rule_summary([
        {'risk_level': 'high', 'findings': [
            {'type': '进度风险', 'description': '「甲」已逾期', 'matter_ids': [10]},
            {'type': '进度风险', 'description': '「甲」已逾期', 'matter_ids': [10]},
            {'type': '言行不符', 'description': '材料待核验', 'matter_ids': [11]}]},
        {'risk_level': 'medium', 'findings': [
            {'type': '职责落空', 'description': '无事项', 'matter_ids': []}]}])
    assert '共 2 人，高风险 1 人' in summary
    assert '逾期 1 项' in summary
    assert '进度风险 2 条、言行不符 1 条、职责落空 1 条、工作量 0 条' in summary
    assert '未经 AI 分析' in summary


def test_short_specific_ai_replaces_long_title_but_preserves_uncovered_progress_facts():
    overdue = {'type': '进度风险', 'description': '「' + '长事项标题' * 20 + '」已逾期', 'matter_ids': [10]}
    blocked = {'type': '进度风险', 'description': '「甲」进展阻塞或存在风险', 'matter_ids': [10]}
    stale = {'type': '进度风险', 'description': '「甲」超过 7 天无进展记录', 'matter_ids': [10]}
    rules = [{'node_id': 1, 'risk_level': 'high', 'summary': '规则',
        'findings': [overdue, blocked, stale]}]
    detailed = {'type': '进度风险', 'description': '已逾期六天，完成度15%，应优先催办', 'matter_ids': [10]}
    reply = {'overall_risk': 'high', 'nodes': [{'node_id': 1, 'risk_level': 'high',
        'summary': 'AI 判断', 'findings': [detailed], 'suggested_actions': []}]}
    nodes, _ = service.parse_model(json.dumps(reply), rules, {1: [SimpleNamespace(id=10)]})
    assert nodes[0]['findings'] == [blocked, stale, detailed]
    reply['nodes'][0]['findings'] = [{'type': '进度风险',
        'description': '该事项已连续十二天没有更新，缺少最新进展，请负责人补充记录并说明后续安排', 'matter_ids': [10]}]
    nodes, _ = service.parse_model(json.dumps(reply), rules, {1: [SimpleNamespace(id=10)]})
    assert nodes[0]['findings'] == [overdue, blocked, reply['nodes'][0]['findings'][0]]


@pytest.mark.parametrize(('kind', 'rule_description', 'ai_description'), [
    ('言行不符', '「甲」标记完成但缺少已提交材料，仅为待核验线索',
        '汇报中的开始时间与完成时间相互矛盾，请负责人确认填写日期，以上仅作为待核验线索'),
    ('进度风险', '「甲」进展阻塞或存在风险',
        '事项进度存在风险，十二天未更新记录，请负责人补充最新交付进度和当前完成时间'),
])
def test_generic_risk_or_pending_verification_does_not_cover_distinct_rule_fact(kind, rule_description, ai_description):
    rule = {'type': kind, 'description': rule_description, 'matter_ids': [10]}
    finding = {'type': kind, 'description': ai_description, 'matter_ids': [10]}
    rules = [{'node_id': 1, 'risk_level': 'high', 'summary': '规则', 'findings': [rule]}]
    reply = {'overall_risk': 'high', 'nodes': [{'node_id': 1, 'risk_level': 'high',
        'summary': 'AI 判断', 'findings': [finding], 'suggested_actions': []}]}
    nodes, _ = service.parse_model(json.dumps(reply), rules, {1: [SimpleNamespace(id=10)]})
    assert nodes[0]['findings'] == [rule, finding]
