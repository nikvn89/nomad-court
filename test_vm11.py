# v0.2.16
# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *

class Contract(gl.Contract):
    test_map: TreeMap[str, str]
    
    def __init__(self):
        pass

    @gl.public.write
    def dump_message_attrs(self) -> str:
        # Check all attributes of gl.message
        s = ",".join(dir(gl.message))
        self.test_map["addr"] = s
        return s

    @gl.public.view
    def get_val(self, key: str) -> str:
        if key in self.test_map:
            return self.test_map[key]
        return ""
