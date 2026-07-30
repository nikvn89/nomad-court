# v0.2.16
from genlayer import *

class Contract(gl.Contract):
    def __init__(self):
        pass

    @gl.public.view
    def echo_int(self, val: int) -> str:
        return str(val)
