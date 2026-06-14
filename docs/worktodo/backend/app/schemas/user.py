from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from datetime import datetime


class UserBase(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    email: Optional[EmailStr] = None
    nickname: Optional[str] = Field(None, max_length=50)
    avatar_url: Optional[str] = None


class UserCreate(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=6, max_length=50)
    email: Optional[EmailStr] = None
    nickname: Optional[str] = Field(None, max_length=50)


class UserUpdate(BaseModel):
    nickname: Optional[str] = Field(None, max_length=50)
    avatar_url: Optional[str] = None
    notify_pref: Optional[dict] = None


class UserPasswordChange(BaseModel):
    old_password: str
    new_password: str = Field(..., min_length=6, max_length=50)


class UserResponse(BaseModel):
    id: int
    username: str
    email: Optional[str] = None
    nickname: Optional[str] = None
    avatar_url: Optional[str] = None
    notify_pref: dict = {}
    created_at: datetime

    class Config:
        from_attributes = True


class UserBriefResponse(BaseModel):
    id: int
    username: str
    nickname: Optional[str] = None
    avatar_url: Optional[str] = None

    class Config:
        from_attributes = True