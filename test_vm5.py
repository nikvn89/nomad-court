# v0.2.16
# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *

class Contract(gl.Contract):
    test_map: TreeMap[str, str]

    def __init__(self):
        pass

    @gl.public.write
    def dump_address(self) -> str:
        s = "UNKNOWN"
        sender = gl.message.sender
        
        # Try finding ANY string property!
        if hasattr(sender, "value"):
            s = str(sender.value)
        elif hasattr(sender, "address"):
            s = str(sender.address)
        elif hasattr(sender, "to_hex"):
            s = sender.to_hex()
        elif hasattr(sender, "hex"):
            s = sender.hex()
        elif hasattr(sender, "as_hex"):
            s = sender.as_hex()
        elif hasattr(sender, "__str__"):
            try:
                s = str(sender)
            except Exception:
                s = "str_failed"
        else:
            s = "no_known_fields"

        self.test_map["addr"] = s
        return s

    @gl.public.view
    def get_val(self, key: str) -> str:
        if key in self.test_map:
            return self.test_map[key]
        return ""
