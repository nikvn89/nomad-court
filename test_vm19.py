# v0.2.16
from genlayer import *

class Contract(gl.Contract):
    test_map: TreeMap[str, str]

    def __init__(self):
        pass

    @gl.public.view
    def test_missing_key(self, key: str) -> str:
        try:
            val = self.test_map[key]
            return val
        except BaseException as e:
            return "Caught: " + str(type(e)) + " - " + str(e)
