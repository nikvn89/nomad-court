# v0.2.16
# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *

class Contract(gl.Contract):
    test_map: TreeMap[str, str]

    def __init__(self):
        self.test_map = TreeMap()

    @gl.public.write
    def test_sender_as_hex(self) -> str:
        s = "failed"
        try:
            s = gl.message.sender.as_hex()
        except Exception as e:
            s = f"error as_hex: {e}"
        self.test_map["as_hex"] = s
        return s

    @gl.public.write
    def test_sender_str(self) -> str:
        s = "failed"
        try:
            s = str(gl.message.sender)
        except Exception as e:
            s = f"error str: {e}"
        self.test_map["str"] = s
        return s
        
    @gl.public.write
    def test_host_str(self, host: str) -> str:
        self.test_map["host"] = host
        return host

    @gl.public.view
    def get_val(self, key: str) -> str:
        if key in self.test_map:
            return self.test_map[key]
        return ""
