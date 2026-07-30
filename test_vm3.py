# v0.2.16
# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *

class Contract(gl.Contract):
    test_dict: dict

    def __init__(self):
        self.test_dict = {}

    @gl.public.write
    def test_host_str(self, host: str) -> str:
        self.test_dict["host"] = host
        return host

    @gl.public.view
    def get_val(self, key: str) -> str:
        if key in self.test_dict:
            return self.test_dict[key]
        return ""
