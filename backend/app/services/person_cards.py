"""三端共享的卡片数据契约。省略字段继承，空列表表示明确隐藏。"""
from copy import deepcopy
import asyncio
import weakref
from contextlib import asynccontextmanager

_locks = weakref.WeakKeyDictionary()


@asynccontextmanager
async def locked_card_update(project_id):
    """SQLite 单进程与现有偏好锁同口径；PG 另由目标行 FOR UPDATE 保护。"""
    locks = _locks.setdefault(asyncio.get_running_loop(), {})
    async with locks.setdefault(project_id, asyncio.Lock()):
        yield

FIELDS = ('avatar', 'name', 'role', 'department', 'description', 'task_count', 'overdue_count', 'progress', 'recent_progress', 'next_due', 'tags', 'custom_fields')
PALETTE = ('ink', 'slate', 'sage', 'ochre', 'clay', 'rose', 'plum', 'stone')
DEFAULT_CARD = {'fields': list(FIELDS), 'density': 'standard', 'color': 'ink', 'tags': [], 'custom_fields': [], 'avatar': 'profile'}


def validate_card(value, kind):
    allowed = {
        'template': {'fields', 'density', 'color'},
        'style': {'fields', 'color', 'tags', 'custom_fields', 'avatar'},
        'view': {'fields', 'density', 'show_colors', 'show_tags'},
    }[kind]
    if not isinstance(value, dict) or set(value) - allowed:
        raise ValueError('卡片配置包含不支持的字段')
    if 'fields' in value:
        fields = value['fields']
        if not isinstance(fields, list) or any(not isinstance(f, str) or f not in FIELDS for f in fields) or len(set(fields)) != len(fields):
            raise ValueError('显示字段必须来自白名单且不能重复')
    if 'density' in value and value['density'] not in ('compact', 'standard', 'detailed'):
        raise ValueError('卡片密度仅支持紧凑、标准、详细')
    if 'color' in value and value['color'] not in PALETTE:
        raise ValueError('颜色必须使用纸与墨固定色板')
    for key in ('show_colors', 'show_tags'):
        if key in value and not isinstance(value[key], bool):
            raise ValueError('颜色与标签显示设置必须为布尔值')
    if 'avatar' in value and value['avatar'] not in ('initial', 'profile'):
        raise ValueError('头像仅支持名字首字或现有个人头像')
    for key, limit, properties in (('tags', 8, {'text': 12, 'color': None}), ('custom_fields', 10, {'key': 12, 'value': 60})):
        if key not in value:
            continue
        rows = value[key]
        if not isinstance(rows, list) or len(rows) > limit:
            raise ValueError(f'{"标签" if key == "tags" else "自定义字段"}最多 {limit} 个')
        for row in rows:
            if not isinstance(row, dict) or set(row) != set(properties):
                raise ValueError('标签或自定义字段格式不正确')
            for name, length in properties.items():
                text = row[name]
                if name == 'color':
                    if text not in PALETTE:
                        raise ValueError('标签颜色必须使用纸与墨固定色板')
                elif not isinstance(text, str) or (name != 'value' and not text.strip()) or len(text) > length:
                    raise ValueError(f'标签或字段的{name}不能为空且最多 {length} 字')
    return deepcopy(value)


def merge_card(template=None, style=None, view=None):
    result = deepcopy(DEFAULT_CARD)
    result.update(template or {})
    result.update(style or {})
    pref = view or {}
    result.update({k: v for k, v in pref.items() if k in ('fields', 'density')})
    if pref.get('show_colors') is False:
        result['color'] = DEFAULT_CARD['color']
        result['tags'] = [{**t, 'color': DEFAULT_CARD['color']} for t in result['tags']]
    if pref.get('show_tags') is False:
        result['tags'] = []
    return result


async def card_access(db, project, user_id):
    """独立于树祖先编辑权；只有直接上级，且管理员不自动获得此权限。"""
    from sqlalchemy import select
    from app.services.acl import AclService
    from app.models.tree import NodeAssignment, TreeNode, NodeType
    acl = AclService()
    company = await acl._membership(db, user_id, project.company_id)
    member = await acl._project_member(db, project.id, user_id)
    active = bool(company and company.employment_status == 'active' and project.status != 'archived')
    manager = active and (user_id in (project.created_by, project.pm_user_id) or bool(member and member.role == 'pm'))
    if not active or not (manager or member):
        return False, set()
    people = list((await db.execute(select(TreeNode).join(NodeType, NodeType.id == TreeNode.node_type_id).where(
        TreeNode.project_id == project.id, TreeNode.is_deleted.is_(False), NodeType.key == 'person',
    ))).scalars().all())
    if manager:
        return True, {n.id for n in people}
    assignments = list((await db.execute(select(NodeAssignment).where(
        NodeAssignment.node_id.in_([n.id for n in people]), NodeAssignment.user_id == user_id,
    ))).scalars().all())
    own = {a.node_id for a in assignments if a.role_key in ('primary', 'collaborator')}
    managed = {a.node_id for a in assignments if a.role_key == 'primary'}
    return False, own | {n.id for n in people if n.parent_id in managed}
