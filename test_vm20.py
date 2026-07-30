# v0.2.16
from genlayer import *

class Contract(gl.Contract):
    test_map: TreeMap[str, str]
    dummy: bigint

    def __init__(self):
        self.dummy = bigint(1)

    @gl.public.write
    def store_sender_str(self) -> str:
        s = str(gl.message.sender)
        self.test_map["sender"] = s
        return s

    @gl.public.view
    def get_val(self, key: str) -> str:
        try:
            return self.test_map[key]
        except Exception:
            return ""
