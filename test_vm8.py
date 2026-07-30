# v0.2.16
# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *

class Contract(gl.Contract):
    def __init__(self):
        pass

    @gl.public.write
    def test_sender_type_write(self) -> str:
        return str(type(gl.message.sender))
