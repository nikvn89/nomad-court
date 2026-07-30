# v0.2.16
from genlayer import *

class Contract(gl.Contract):
    test_map: TreeMap[str, str]

    def __init__(self):
        pass

    @gl.public.write
    def store_string(self) -> str:
        self.test_map["hello"] = "world"
        return "world"

    @gl.public.view
    def get_val_no_in(self, key: str) -> str:
        return self.test_map.get(key, "")

    @gl.public.view
    def get_val_direct(self, key: str) -> str:
        return self.test_map[key]
