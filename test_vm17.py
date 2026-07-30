# v0.2.16
from genlayer import *
import json
from dataclasses import dataclass

@allow_storage
@dataclass
class Dispute:
    host: str
    deposit_amount: bigint

class Contract(gl.Contract):
    disputes: TreeMap[str, Dispute]
    next_id: bigint
    
    def __init__(self):
        self.next_id = bigint(1)

    @gl.public.write
    def store_dispute(self) -> str:
        d = Dispute(
            host="abc",
            deposit_amount=bigint(500)
        )
        self.disputes["1"] = d
        return "1"

    @gl.public.view
    def get_dispute(self, d_id: str) -> str:
        try:
            d = self.disputes[d_id]
        except Exception:
            return "{}"
            
        return json.dumps({
            "host": d.host,
            "deposit_amount": str(d.deposit_amount)
        })
