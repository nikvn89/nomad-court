# v0.2.16
from genlayer import *

class Contract(gl.Contract):
    def __init__(self):
        pass

    @gl.public.view
    def test_int(self) -> str:
        b = bigint(5)
        i = int(b)
        return str(i)

    @gl.public.view
    def test_str(self) -> str:
        b = bigint(5)
        return str(b)
