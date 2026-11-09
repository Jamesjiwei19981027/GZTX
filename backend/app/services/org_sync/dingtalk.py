"""钉钉内部应用通讯录：部门树与分页部门成员，不使用静态快照。"""
from app.services.integration_http import request_json
from app.services.org_sync.base import DeptDTO, UserDTO


class DingTalkOrgProvider:
    def __init__(self, credentials: dict):
        self.credentials = credentials
        self.token = None
        self.departments = None
        if not all(credentials.get(k) for k in ("corp_id", "app_key", "app_secret")):
            raise ValueError("请先完整配置钉钉企业应用")

    async def _call(self, path: str, body: dict):
        if not self.token:
            response = await request_json("POST", "https://api.dingtalk.com/v1.0/oauth2/accessToken", json={
                "appKey": self.credentials["app_key"], "appSecret": self.credentials["app_secret"]})
            self.token = response.get("accessToken")
            if not self.token:
                raise ValueError("钉钉企业应用令牌获取失败，请检查应用凭据")
        result = await request_json("POST", "https://oapi.dingtalk.com/topapi/" + path,
                                    params={"access_token": self.token}, json=body)
        if result.get("errcode") != 0 or "result" not in result:
            raise ValueError("钉钉通讯录读取失败，请检查应用权限与通讯录可见范围")
        return result["result"]

    async def fetch_departments(self) -> list[DeptDTO]:
        root = await self._call("v2/department/get", {"dept_id": 1, "language": "zh_CN"})
        if not isinstance(root, dict) or not root.get("name"):
            raise ValueError("钉钉根部门数据不完整")
        departments = [DeptDTO(external_id="1", name=root["name"])]
        seen = {"1"}
        for parent in departments:
            children = await self._call("v2/department/listsub", {"dept_id": int(parent.external_id), "language": "zh_CN"})
            if not isinstance(children, list):
                raise ValueError("钉钉部门数据格式错误")
            for child in children:
                ext = str(child.get("dept_id", ""))
                if not ext.isdigit() or not child.get("name") or ext in seen:
                    raise ValueError("钉钉部门树存在重复或无效部门")
                seen.add(ext)
                departments.append(DeptDTO(external_id=ext, name=child["name"], parent_external_id=parent.external_id))
            if len(departments) > 10000:
                raise ValueError("钉钉部门数量超过单次同步上限")
        self.departments = departments
        return departments

    async def fetch_users(self) -> list[UserDTO]:
        departments = self.departments if self.departments is not None else await self.fetch_departments()
        by_id = {}
        for department in departments:
            cursor, seen_cursors = 0, set()
            while True:
                if cursor in seen_cursors or len(seen_cursors) >= 10000:
                    raise ValueError("钉钉成员分页游标异常")
                seen_cursors.add(cursor)
                result = await self._call("v2/user/list", {"dept_id": int(department.external_id), "cursor": cursor,
                    "size": 100, "order_field": "modify_desc", "contain_access_limit": False, "language": "zh_CN"})
                if not isinstance(result, dict) or not isinstance(result.get("list"), list):
                    raise ValueError("钉钉成员列表数据格式错误")
                for row in result["list"]:
                    ext = row.get("userid")
                    if not isinstance(ext, str) or not ext or not row.get("name"):
                        raise ValueError("钉钉成员数据缺少标识或姓名")
                    depts = [str(d) for d in row.get("dept_id_list", [department.external_id])]
                    if ext in by_id:
                        by_id[ext].dept_external_ids = list(dict.fromkeys(by_id[ext].dept_external_ids + depts))
                        continue
                    by_id[ext] = UserDTO(external_id=ext, name=row["name"], email=row.get("org_email") or row.get("email"),
                        mobile=row.get("mobile"), title=row.get("title"), dept_external_ids=depts, union_id=row.get("unionid"))
                if not result.get("has_more"):
                    break
                cursor = result.get("next_cursor")
                if not isinstance(cursor, int):
                    raise ValueError("钉钉成员分页缺少下一页游标")
        return list(by_id.values())
