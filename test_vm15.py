# v0.2.16
from genlayer import *

class Contract(gl.Contract):
    test_map: TreeMap[str, str]

    def __init__(self):
        pass

    @gl.public.view
    def get_val_get(self, key: str) -> str:
        val = self.test_map.get(key)
        if val is None:
            return "not_found"
        return val
