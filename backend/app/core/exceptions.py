from fastapi import HTTPException
from typing import Any, Optional

class SyncraBaseException(HTTPException):
    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        details: Optional[Any] = None
    ):
        super().__init__(status_code=status_code, detail=message)
        self.code = code
        self.details = details

class NotFoundException(SyncraBaseException):
    def __init__(self, resource: str):
        super().__init__(
            status_code=404,
            code="NOT_FOUND",
            message=f"{resource} bulunamadı."
        )

class ForbiddenException(SyncraBaseException):
    def __init__(self, detail: str = "Yetkisiz işlem."):
        super().__init__(
            status_code=403,
            code="FORBIDDEN",
            message=detail
        )

class ValidationException(SyncraBaseException):
    def __init__(self, details: Any):
        super().__init__(
            status_code=422,
            code="VALIDATION_ERROR",
            message="Veri doğrulama hatası.",
            details=details
        )
