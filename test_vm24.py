# v0.2.16
from genlayer import *
from dataclasses import dataclass

class Contract(gl.Contract):
    test_map: TreeMap[str, str]

    def __init__(self):
        if type(self.test_map) is type:
            self.test_map = TreeMap()

    @gl.public.write
    def store_val(self) -> str:
        self.test_map["k"] = "v"
        return "v"

    @gl.public.view
    def get_val(self) -> str:
        try:
            return self.test_map["k"]
        except Exception:
            return ""
