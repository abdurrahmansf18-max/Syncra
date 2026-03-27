from pydantic import BaseModel


class AccountDeleteRequest(BaseModel):
    password: str
    confirmation: str
