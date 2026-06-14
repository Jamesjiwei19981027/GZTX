"""API dependencies"""
from typing import Optional
from fastapi import Header, HTTPException, status


async def verify_api_key(x_api_key: Optional[str] = Header(None)) -> str:
    if x_api_key is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="API key is required",
        )
    return x_api_key