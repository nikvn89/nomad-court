# v0.2.16
from genlayer import *

class Contract(gl.Contract):
    test_map: TreeMap[str, str]

    def __init__(self):
        pass

    @gl.public.write
    def store_val(self) -> str:
        if type(self.test_map) is type:
            self.test_map = TreeMap()
        self.test_map["k"] = "v"
        return "v"
