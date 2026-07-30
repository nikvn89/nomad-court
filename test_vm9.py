# v0.2.16
# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *

class Contract(gl.Contract):
    test_map: TreeMap[str, str]

    def __init__(self):
        self.test_map = TreeMap()

    @gl.public.write
    def get_sender_as_hex(self) -> str:
        s = gl.message.sender.as_hex
        self.test_map["s1"] = s
        return s

    @gl.public.write
    def get_address_from_str(self, addr_str: str) -> str:
        a = Address(addr_str)
        s = a.as_hex
        self.test_map["s2"] = s
        return s

    @gl.public.view
    def get_val(self, key: str) -> str:
        if key in self.test_map:
            return self.test_map[key]
        return ""
