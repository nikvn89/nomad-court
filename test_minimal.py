# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *

class Contract(gl.Contract):
    name: str

    def __init__(self):
        self.name = "test"

    @gl.public.view
    def get_name(self) -> str:
        return self.name
