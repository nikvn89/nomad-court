# v0.2.16
# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *
import json
from dataclasses import dataclass

@allow_storage
@dataclass
class Dispute:
    host: Address
    guest: Address
    deposit_amount: bigint
    host_evidence_url: str
    guest_evidence_url: str
    rules_url: str
    status: str
    host_share: bigint
    guest_share: bigint
    rationale: str

class Contract(gl.Contract):
    disputes: TreeMap[str, Dispute]
    guest_latest_dispute: TreeMap[str, str]
    next_id: bigint

    def __init__(self):
        self.next_id = bigint(1)

    @gl.public.write
    def create_dispute(self, host: Address, rules_url: str) -> str:
        if not rules_url:
            raise gl.vm.UserError("Rules URL cannot be empty")
            
        amt = gl.message.value if hasattr(gl.message, "value") else bigint(0)
        
        d_id = str(self.next_id)
        self.disputes[d_id] = Dispute(
            host=host,
            guest=gl.message.sender,
            deposit_amount=amt,
            host_evidence_url="",
            guest_evidence_url="",
            rules_url=rules_url,
            status="OPEN",
            host_share=bigint(0),
            guest_share=bigint(0),
            rationale=""
        )
        self.guest_latest_dispute[str(gl.message.sender)] = d_id
        self.next_id += bigint(1)
        return d_id

    @gl.public.write
    def submit_evidence(self, dispute_id: str, evidence_url: str) -> None:
        if dispute_id not in self.disputes:
            raise gl.vm.UserError("Dispute not found")
            
        d = self.disputes[dispute_id]
        if d.status != "OPEN":
            raise gl.vm.UserError("Dispute is already resolved")
            
        if not evidence_url:
            raise gl.vm.UserError("Evidence URL must be provided")
            
        sender_str = str(gl.message.sender)
        host_str = str(d.host)
        guest_str = str(d.guest)
        
        if sender_str == host_str:
            d.host_evidence_url = evidence_url
        elif sender_str == guest_str:
            d.guest_evidence_url = evidence_url
        else:
            raise gl.vm.UserError("Only Host or Guest can submit evidence")

    @gl.public.write
    def resolve_dispute(self, dispute_id: str) -> None:
        if dispute_id not in self.disputes:
            raise gl.vm.UserError("Dispute not found")
            
        d = self.disputes[dispute_id]
        if d.status != "OPEN":
            raise gl.vm.UserError("Dispute is already resolved")
            
        if not d.host_evidence_url or not d.guest_evidence_url:
            raise gl.vm.UserError("Missing evidence URLs")

        h_url = d.host_evidence_url
        g_url = d.guest_evidence_url
        r_url = d.rules_url

        def leader_fn() -> str:
            try:
                host_text = gl.nondet.web.render(h_url, mode="text")[:2000]
                guest_text = gl.nondet.web.render(g_url, mode="text")[:2000]
                rules_text = gl.nondet.web.render(r_url, mode="text")[:2000]
            except Exception:
                fallback_json = {"host_share": 50, "guest_share": 50, "reason": "Web fetch failed"}
                return json.dumps(fallback_json, sort_keys=True)

            prompt = (
                "You are an impartial Airbnb dispute resolution judge. "
                "Analyze the Host's evidence, the Guest's evidence, and the House Rules. "
                "Determine fault based on logic and wear-and-tear standards. "
                "Allocate the deposit as integer percentages (host_share + guest_share = 100).\n"
                "RULES:\n" + rules_text + "\n"
                "HOST EVIDENCE:\n" + host_text + "\n"
                "GUEST EVIDENCE:\n" + guest_text + "\n"
                "Return exactly a JSON object: {\"host_share\": <int 0-100>, \"guest_share\": <int 0-100>, \"reason\": \"<string>\"}"
            )
            
            ai_resp = gl.nondet.exec_prompt(prompt)
            
            try:
                parsed = json.loads(ai_resp)
                h_share = int(parsed.get("host_share", 50))
                if h_share < 0: h_share = 0
                if h_share > 100: h_share = 100
                g_share = 100 - h_share
                
                reason = str(parsed.get("reason", ""))[:300]
                return json.dumps({"host_share": h_share, "guest_share": g_share, "reason": reason}, sort_keys=True)
            except Exception:
                fallback_json = {"host_share": 50, "guest_share": 50, "reason": "AI parse failed"}
                return json.dumps(fallback_json, sort_keys=True)

        def validator_fn(leader_res) -> bool:
            if not isinstance(leader_res, gl.vm.Return): return False
            try:
                l_data = json.loads(leader_res.value)
                v_data = json.loads(leader_fn())
                
                # Semantic Consensus: Compare the winning party rather than exact numbers
                # Band 0: Guest strongly wins (<40% to host)
                # Band 1: Split decision (40-60% to host)
                # Band 2: Host strongly wins (>60% to host)
                def get_band(h_share: int) -> int:
                    if h_share > 60: return 2
                    if h_share < 40: return 0
                    return 1
                    
                l_band = get_band(int(l_data.get("host_share", 50)))
                v_band = get_band(int(v_data.get("host_share", 50)))
                
                return l_band == v_band
            except Exception:
                return False

        final_res = gl.vm.run_nondet_unsafe(leader_fn, validator_fn)
        final_data = json.loads(final_res)
        
        h_share = int(final_data["host_share"])
        
        d.status = "RESOLVED"
        d.host_share = bigint(h_share)
        d.guest_share = bigint(100 - h_share)
        d.rationale = final_data["reason"]
        
        amt = d.deposit_amount
        if amt > bigint(0):
            host_payout = (amt * bigint(h_share)) // bigint(100)
            guest_payout = amt - host_payout
            if host_payout > bigint(0):
                _Recipient(d.host).emit_transfer(value=host_payout)
            if guest_payout > bigint(0):
                _Recipient(d.guest).emit_transfer(value=guest_payout)

    @gl.public.view
    def get_dispute(self, dispute_id: str) -> str:
        if dispute_id not in self.disputes:
            return "{}"
            
        d = self.disputes[dispute_id]
        h_str = str(d.host) if hasattr(d.host, "__str__") else ""
        g_str = str(d.guest) if hasattr(d.guest, "__str__") else ""
        
        return json.dumps({
            "host": h_str,
            "guest": g_str,
            "deposit_amount": int(d.deposit_amount),
            "status": d.status,
            "host_share": int(d.host_share),
            "guest_share": int(d.guest_share),
            "rationale": d.rationale
        })

    @gl.public.view
    def get_guest_latest_dispute(self, guest_address: str) -> str:
        if guest_address in self.guest_latest_dispute:
            return self.guest_latest_dispute[guest_address]
        return ""
