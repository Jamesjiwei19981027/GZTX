import pytest
import pytest_asyncio
from unittest.mock import AsyncMock, patch
from httpx import AsyncClient

from app.services.llm_settings import ResolvedLlm


@pytest_asyncio.fixture
async def progress_scope(db_session, test_user):
    from app.models.company import Company, CompanyMembership
    from app.models.project import Project, ProjectMember
    from app.models.tree import NodeType, TreeNode
    company = Company(name="进展公司", slug="progress", status="active")
    db_session.add(company)
    await db_session.flush()
    project = Project(company_id=company.id, name="进展项目", created_by=test_user.id, status="active")
    kind = NodeType(company_id=company.id, key="person", name="人", behavior_template="person")
    db_session.add_all([project, kind, CompanyMembership(company_id=company.id, user_id=test_user.id)])
    await db_session.flush()
    node = TreeNode(company_id=company.id, project_id=project.id, node_type_id=kind.id, title="成员")
    db_session.add_all([node, ProjectMember(project_id=project.id, user_id=test_user.id, role="member")])
    await db_session.commit()
    return project.id, node.id


@pytest.mark.asyncio
async def test_suggest_unauthorized(client: AsyncClient):
    """未登录返回 401"""
    res = await client.post(
        "/api/v1/record-progress/suggest",
        json={"text": "测试未登录", "has_attachments": False},
    )
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_suggest_fake_rule_evidence_branch(client: AsyncClient, auth_headers, progress_scope):
    """fake 模型走规则：带附件且有 node_id -> evidence"""
    res = await client.post(
        "/api/v1/record-progress/suggest",
        headers=auth_headers,
        json={
            "text": "测试报告与交付文档",
            "has_attachments": True,
            "project_id": progress_scope[0],
            "node_id": progress_scope[1],
        },
    )
    assert res.status_code == 200
    data = res.json()["data"]
    assert data["target"] == "evidence"
    assert data["source"] == "rule"
    assert "证据材料" in data["reason"]


@pytest.mark.asyncio
async def test_suggest_fake_rule_knowledge_branch(client: AsyncClient, auth_headers):
    """fake 模型走规则：文本像个人笔记资料（无项目、无 node）-> knowledge"""
    res = await client.post(
        "/api/v1/record-progress/suggest",
        headers=auth_headers,
        json={
            "text": "FastAPI 异步上下文管理的备忘与阅读心得笔记",
            "has_attachments": False,
            "project_id": None,
            "node_id": None,
        },
    )
    assert res.status_code == 200
    data = res.json()["data"]
    assert data["target"] == "knowledge"
    assert data["source"] == "rule"
    assert "个人知识" in data["reason"]


@pytest.mark.asyncio
async def test_suggest_fake_rule_report_draft_branch(client: AsyncClient, auth_headers, progress_scope):
    """fake 模型走规则：其它情况 -> report_draft"""
    res = await client.post(
        "/api/v1/record-progress/suggest",
        headers=auth_headers,
        json={
            "text": "今天完成了用户注册流程联调与优化",
            "has_attachments": False,
            "project_id": progress_scope[0],
            "node_id": None,
        },
    )
    assert res.status_code == 200
    data = res.json()["data"]
    assert data["target"] == "report_draft"
    assert data["source"] == "rule"
    assert "汇报草稿" in data["reason"]


@pytest.mark.asyncio
async def test_suggest_llm_valid_json(client: AsyncClient, auth_headers):
    """模拟模型返回合法 JSON 时采用"""
    mock_llm = ResolvedLlm(
        provider="openai",
        base_url="https://api.openai.com/v1",
        model="gpt-4o",
        api_key="sk-test",
        enabled=True,
    )
    mock_chat_res = {
        "ok": True,
        "content": '```json\n{"target": "knowledge", "reason": "AI识别为技术备忘"}\n```',
    }

    with patch("app.api.v1.record_progress.llm_from_company", new=AsyncMock(return_value=mock_llm)), \
         patch("app.api.v1.record_progress.chat_completion", new=AsyncMock(return_value=mock_chat_res)):
        res = await client.post(
            "/api/v1/record-progress/suggest",
            headers=auth_headers,
            json={
                "text": "技术备忘",
                "has_attachments": False,
            },
        )
        assert res.status_code == 200
        data = res.json()["data"]
        assert data["target"] == "knowledge"
        assert data["reason"] == "AI识别为技术备忘"
        assert data["source"] == "llm"


@pytest.mark.asyncio
async def test_suggest_llm_gibberish_fallback(client: AsyncClient, auth_headers, progress_scope):
    """模拟模型返回乱码时按规则兜底"""
    mock_llm = ResolvedLlm(
        provider="openai",
        base_url="https://api.openai.com/v1",
        model="gpt-4o",
        api_key="sk-test",
        enabled=True,
    )
    mock_chat_res = {
        "ok": True,
        "content": "这是一堆不是JSON的乱码回答，比如：???@@@!!!",
    }

    with patch("app.api.v1.record_progress.llm_from_company", new=AsyncMock(return_value=mock_llm)), \
         patch("app.api.v1.record_progress.chat_completion", new=AsyncMock(return_value=mock_chat_res)):
        res = await client.post(
            "/api/v1/record-progress/suggest",
            headers=auth_headers,
            json={
                "text": "今天测试进展顺利",
                "has_attachments": False,
                "project_id": progress_scope[0],
            },
        )
        assert res.status_code == 200
        data = res.json()["data"]
        # 按规则兜底为 report_draft
        assert data["target"] == "report_draft"
        assert data["source"] == "rule"
