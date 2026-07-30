# v0.2.16
from genlayer import *

class Contract(gl.Contract):
    def __init__(self):
        pass

    @gl.public.view
    def test_type_error(self) -> str:
        b = bigint(5)
        # return int(b) is illegal maybe?
        return str(type(b))

    @gl.public.view
    def test_int(self) -> str:
        b = bigint(5)
        return str(int(b))
