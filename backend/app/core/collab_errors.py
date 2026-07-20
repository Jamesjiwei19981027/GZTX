"""协作 API 统一失败信封"""
from fastapi.responses import JSONResponse


def fail(http_status: int, code: int, message: str) -> JSONResponse:
    return JSONResponse(
        status_code=http_status,
        content={"code": code, "message": message, "data": None},
    )


class CollabError(Exception):
    """业务异常，路由层转 fail()"""

    def __init__(self, http_status: int, code: int, message: str):
        self.http_status = http_status
        self.code = code
        self.message = message
        super().__init__(message)

    def to_response(self) -> JSONResponse:
        return fail(self.http_status, self.code, self.message)
