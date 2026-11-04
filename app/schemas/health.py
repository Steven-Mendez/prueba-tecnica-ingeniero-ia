from pydantic import BaseModel


class Health(BaseModel):
    status: str
    app_name: str
