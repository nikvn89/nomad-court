# v0.2.16
from genlayer import *

class Contract(gl.Contract):
    test_map: TreeMap[str, str]

    def __init__(self):
        self.test_map = TreeMap()

    @gl.public.write
    def store_val(self, key: str, val: str) -> str:
        self.test_map[key] = val
        return val

    @gl.public.view
    def get_val(self, key: str) -> str:
        try:
            return self.test_map[key]
        except Exception:
            return ""
