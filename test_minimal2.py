from genlayer import *

class Contract(gl.Contract):
    name: str

    def __init__(self):
        self.name = "test"

    @gl.public.view
    def get_name(self) -> str:
        return self.name
