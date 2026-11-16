"""后台审计终态、权限丢弃及模型调用预算。"""
import asyncio
import json
from datetime import datetime, timezone

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.models.audit_run import AuditRun
from app.models.tree import TreeNode, NodeAssignment
from app.models.user import User
from app.services import axis_audit as service
from app.services import axis_audit_jobs as jobs
from app.services.llm_settings import ResolvedLlm


@pytest_asyncio.fixture(autouse=True)
async def controlled_model(monkeypatch, async_engine):
    async def resolve(*args, **kwargs):
        return ResolvedLlm('openai_responses', 'https://unused.invalid/v1', 'grok-test', 'test', source='company')
    monkeypatch.setattr(service, 'llm_for_company', resolve)
    monkeypatch.setattr(jobs, 'async_session_factory', async_sessionmaker(async_engine, expire_on_commit=False))


def valid_reply(kwargs):
    payload = json.loads(kwargs['messages'][-1]['content'])
    people = payload.get('people') or [payload['person']]
    return {'ok': True, 'content': json.dumps({'overall_risk': 'low', 'nodes': [
        {'node_id': p['node_id'], 'risk_level': 'low', 'summary': '受控 AI 结论', 'findings': [], 'suggested_actions': []}
        for p in people]}, ensure_ascii=False)}


async def start(client, ids):
    url = f'/api/v1/projects/{ids["project_id"]}/audits'
    response = await client.post(url, headers=ids['pm_headers'], json={'scope': 'project'})
    assert response.status_code == 200, response.text
    data = response.json()['data']
    assert data['status'] == 'running' and data['mode'] == 'rule'
    return url + f'/{data["id"]}', data


@pytest.mark.parametrize('failure', ['timeout', 'exception', 'bad_json', 'not_ok'])
async def test_model_failure_is_done_rule_with_chinese_reason(async_client, seed_ids, monkeypatch, failure):
    async def complete(*args, **kwargs):
        assert kwargs['timeout'] == service.MAIN_TIMEOUT
        if failure == 'timeout':
            await asyncio.sleep(1)
        if failure == 'exception':
            raise RuntimeError('secret-provider-key-do-not-expose')
        return {'ok': failure != 'not_ok', 'content': 'bad JSON'}
    monkeypatch.setattr(service, 'MAIN_TIMEOUT', 0.01)
    monkeypatch.setattr(service, 'chat_completion', complete)
    url, baseline = await start(async_client, seed_ids)
    await jobs.process_pending_audits()
    data = (await async_client.get(url, headers=seed_ids['pm_headers'])).json()['data']
    assert data['status'] == 'done' and data['mode'] == 'rule'
    assert data['nodes'] == baseline['nodes']
    assert '规则检查' in data['fallback_reason']
    assert 'secret-provider' not in json.dumps(data)
    assert data['started_at'] and data['finished_at']


async def test_success_runs_outside_request_and_once(async_client, seed_ids, monkeypatch):
    calls = []
    entered, release = asyncio.Event(), asyncio.Event()
    async def complete(*args, **kwargs):
        calls.append(kwargs['timeout'])
        entered.set()
        await release.wait()
        return valid_reply(kwargs)
    monkeypatch.setattr(service, 'chat_completion', complete)
    url, baseline = await asyncio.wait_for(start(async_client, seed_ids), timeout=2)
    assert not calls, '请求返回前不得调用模型'
    worker = asyncio.create_task(jobs.process_pending_audits())
    try:
        await asyncio.wait_for(entered.wait(), timeout=2)
        current = (await async_client.get(url, headers=seed_ids['pm_headers'])).json()['data']
        assert current['status'] == 'running' and current['nodes'] == baseline['nodes']
    finally:
        release.set()
        await worker
    data = (await async_client.get(url, headers=seed_ids['pm_headers'])).json()['data']
    assert data['status'] == 'done' and data['mode'] == 'ai'
    assert calls == [180, 120]
    assert data['fallback_reason'] is None
    await jobs._execute(data['id'])
    assert calls == [180, 120], '终态记录不得重复调用模型'


async def test_recipient_timeout_preserves_isolated_rule_projection(async_client, seed_ids, monkeypatch):
    async def complete(*args, **kwargs):
        if 'person' in json.loads(kwargs['messages'][-1]['content']):
            assert kwargs['timeout'] == service.RECIPIENT_TIMEOUT
            await asyncio.sleep(1)
        return valid_reply(kwargs)
    monkeypatch.setattr(service, 'RECIPIENT_TIMEOUT', 0.01)
    monkeypatch.setattr(service, 'chat_completion', complete)
    url, _ = await start(async_client, seed_ids)
    await jobs.process_pending_audits()
    initiator = (await async_client.get(url, headers=seed_ids['pm_headers'])).json()['data']
    recipient = (await async_client.get(url, headers=seed_ids['member_headers'])).json()['data']
    assert initiator['status'] == recipient['status'] == 'done'
    assert initiator['mode'] == 'ai' and recipient['mode'] == 'rule'
    assert '独立规则检查' in recipient['mode_message']
    assert '本人规则检查' in recipient['fallback_reason']
    assert '受控 AI 结论' not in json.dumps(recipient, ensure_ascii=False)


@pytest.mark.parametrize('change', ['assignment', 'session', 'inactive', 'project_role'])
async def test_successful_ai_is_discarded_after_access_or_snapshot_change(async_client, seed_ids, db_session, monkeypatch, change):
    changed = False
    async def complete(*args, **kwargs):
        nonlocal changed
        reply = valid_reply(kwargs)
        if not changed:
            changed = True
            if change == 'assignment':
                from sqlalchemy import select
                assignment = (await db_session.scalars(select(NodeAssignment).where(
                    NodeAssignment.node_id == seed_ids['root_node_id'], NodeAssignment.role_key == 'primary'))).first()
                await db_session.delete(assignment)
            elif change == 'project_role':
                from app.models.project import Project
                project = await db_session.get(Project, seed_ids['project_id'])
                project.pm_user_id = seed_ids['member_user_id']
            else:
                user = await db_session.get(User, seed_ids['pm_user_id'])
                if change == 'session':
                    user.sessions_revoked_at = datetime.now(timezone.utc)
                else:
                    user.is_active = False
            await db_session.commit()
        return reply
    monkeypatch.setattr(service, 'chat_completion', complete)
    _, baseline = await start(async_client, seed_ids)
    await jobs.process_pending_audits()
    db_session.expire_all()
    row = await db_session.get(AuditRun, baseline['id'])
    assert row.status == 'failed' and row.mode == 'rule'
    assert '丢弃' in row.result_json['fallback_reason']
    assert '受控 AI 结论' not in json.dumps(row.result_json, ensure_ascii=False)


async def test_restart_marks_queued_and_started_failed(async_client, seed_ids, db_session, monkeypatch):
    _, first = await start(async_client, seed_ids)
    _, second = await start(async_client, seed_ids)
    row = await db_session.get(AuditRun, second['id'])
    row.started_at = datetime.now(timezone.utc)
    await db_session.commit()
    assert await jobs.recover_interrupted_audits() == 2
    db_session.expire_all()
    for data in (first, second):
        row = await db_session.get(AuditRun, data['id'])
        assert row.status == 'failed' and row.finished_at
        assert '重启' in row.result_json['fallback_reason']
        assert '_job' not in row.result_json
        assert service.project_result(row, seed_ids['pm_user_id'])['nodes'] == data['nodes']
    assert await jobs.recover_interrupted_audits() == 0


async def test_unexpected_worker_error_cannot_stay_running(async_client, seed_ids, monkeypatch):
    async def broken(*args):
        raise RuntimeError('internal detail')
    monkeypatch.setattr(jobs, 'complete_audit', broken)
    url, baseline = await start(async_client, seed_ids)
    await jobs.process_pending_audits()
    data = (await async_client.get(url, headers=seed_ids['pm_headers'])).json()['data']
    assert data['status'] == 'failed' and data['mode'] == 'rule'
    assert data['nodes'] == baseline['nodes']


@pytest.mark.parametrize('limit', ['characters', 'people'])
async def test_input_limits_do_not_drop_rule_people(async_client, seed_ids, db_session, monkeypatch, limit):
    from app.models.project import Project
    from app.services.tree_service import TreeService
    if limit == 'people':
        project = await db_session.get(Project, seed_ids['project_id'])
        for i in range(40):
            await TreeService().create_node(db_session, project, parent_id=seed_ids['root_node_id'],
                node_type_key='person', title=f'人员{i}', assignees=[])
        await db_session.commit()
    else:
        original = service.materials
        async def large(*args):
            matter_map, counts, inputs = await original(*args)
            inputs[0]['reports'] = ['字' * 60001]
            return matter_map, counts, inputs
        monkeypatch.setattr(service, 'materials', large)
    async def forbidden(*args, **kwargs):
        pytest.fail('超过输入上限不得调用模型')
    monkeypatch.setattr(service, 'chat_completion', forbidden)
    url, baseline = await start(async_client, seed_ids)
    await jobs.process_pending_audits()
    data = (await async_client.get(url, headers=seed_ids['pm_headers'])).json()['data']
    assert data['status'] == 'done' and data['mode'] == 'rule'
    assert data['nodes'] == baseline['nodes']
    assert '缩小审计范围' in data['fallback_reason']


async def test_recipient_model_concurrency_is_at_most_four(monkeypatch):
    active, peak, calls = 0, 0, 0
    async def complete(*args, **kwargs):
        nonlocal active, peak, calls
        if 'person' in json.loads(kwargs['messages'][-1]['content']):
            active += 1
            peak = max(peak, active)
            calls += 1
            await asyncio.sleep(0.01)
            active -= 1
        return valid_reply(kwargs)
    monkeypatch.setattr(service, 'chat_completion', complete)
    inputs = [{'node_id': i, 'matters': []} for i in range(5)]
    rules = [{'node_id': i, 'title': f'人员{i}', 'subject_user_ids': [i], 'risk_level': 'low',
        'findings': [], 'suggested_actions': [], 'summary': '规则'} for i in range(5)]
    llm = ResolvedLlm('openai_responses', 'https://unused.invalid/v1', 'grok-test', 'test')
    nodes, recipients = await service.model_analysis(llm, rules, inputs, None)
    assert len(nodes) == len(recipients) == calls == 5
    assert peak == 4


async def test_scheduler_registers_audit_queue_without_new_infrastructure(monkeypatch):
    from app.main import create_scheduler
    monkeypatch.setattr('apscheduler.schedulers.asyncio.AsyncIOScheduler.start', lambda self: None)
    scheduler = create_scheduler()
    job = scheduler.get_job('process_pending_audits')
    assert job.func == jobs.process_pending_audits
    assert job.trigger.interval.total_seconds() == 5
    assert job.max_instances == 1 and job.coalesce
