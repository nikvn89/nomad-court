# v0.2.16
# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *

class Contract(gl.Contract):
    def __init__(self):
        pass

    @gl.public.write
    def return_as_hex(self) -> str:
        return gl.message.sender.as_hex

    @gl.public.write
    def return_str(self) -> str:
        return str(gl.message.sender)

    @gl.public.write
    def return_host(self, host: Address) -> str:
        return host.as_hex
