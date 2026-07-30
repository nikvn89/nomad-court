# v0.2.16
from genlayer import *

class Contract(gl.Contract):
    map1: TreeMap[str, str]
    map2: TreeMap[str, str]

    def __init__(self):
        self.map1 = TreeMap()
        self.map2 = TreeMap()

    @gl.public.write
    def store_str(self) -> str:
        s = "hello"
        self.map1["k1"] = s
        self.map2["k2"] = s
        return s
