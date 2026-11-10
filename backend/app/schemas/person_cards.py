"""可发现的卡片接口文档；业务校验由统一服务执行。"""
from pydantic import BaseModel, ConfigDict, Field


class CardTemplateBody(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)
    fields: list[str] | None = Field(default=None, description='按顺序显示的白名单字段；空数组隐藏全部字段，省略则继承')
    density: str | None = Field(default=None, description='compact 紧凑 / standard 标准 / detailed 详细')
    color: str | None = Field(default=None, description='ink / slate / sage / ochre / clay / rose / plum / stone')


class CardStyleBody(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)
    fields: list[str] | None = Field(default=None, description='有序可见字段，省略则继承项目模板')
    color: str | None = Field(default=None, description='纸与墨固定色板键')
    tags: list[dict] | None = Field(default=None, description='最多8个，text最多12字，color使用色板键')
    custom_fields: list[dict] | None = Field(default=None, description='最多10个，key最多12字，value最多60字')
    avatar: str | None = Field(default=None, description='initial 名字首字 / profile 当前个人头像')
