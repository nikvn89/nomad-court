# v0.2.16
# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *

class Contract(gl.Contract):
    test_map: TreeMap[str, str]

    def __init__(self):
        pass

    @gl.public.write
    def test_sender(self) -> str:
        s = str(gl.message.sender)
        self.test_map["sender_str"] = s
        return s

    @gl.public.write
    def test_address_arg(self, host: Address) -> str:
        s = str(host)
        self.test_map["host_str"] = s
        return s

    @gl.public.write
    def test_bigint(self) -> str:
        b = bigint(1)
        self.test_map["bigint"] = str(b)
        return str(b)

    @gl.public.view
    def get_val(self, key: str) -> str:
        if key in self.test_map:
            return self.test_map[key]
        return ""
