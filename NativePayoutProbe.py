# v0.2.16
# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

from genlayer import *


@gl.evm.contract_interface
class NativePayout:
    class View:
        pass

    class Write:
        pass


class Contract(gl.Contract):
    """
    Test-only harness for native GEN external-message settlement.

    It intentionally contains no NomadCourt business logic.  The purpose is
    to make the payout primitive directly executable and to prove that two
    emitted native transfers are committed only when the parent GenVM
    transaction succeeds.
    """

    def __init__(self):
        pass

    @gl.public.write.payable
    def fund(self) -> None:
        if gl.message.value == u256(0):
            raise gl.vm.UserError("Probe funding requires positive value")

    def _emit_split(self, host: str, guest: str) -> None:
        host_addr = host.strip().lower()
        guest_addr = guest.strip().lower()

        if not host_addr or not guest_addr:
            raise gl.vm.UserError("Both payout recipients are required")

        if host_addr == guest_addr:
            raise gl.vm.UserError("Payout recipients must be different")

        total = self.balance

        if total < u256(2):
            raise gl.vm.UserError("Probe must hold at least 2 wei")

        host_amount = total // u256(2)
        guest_amount = total - host_amount

        NativePayout(Address(host_addr)).emit_transfer(
            value=host_amount
        )

        NativePayout(Address(guest_addr)).emit_transfer(
            value=guest_amount
        )

    @gl.public.write
    def payout_both(self, host: str, guest: str) -> None:
        self._emit_split(host, guest)

    @gl.public.write
    def payout_both_then_revert(self, host: str, guest: str) -> None:
        self._emit_split(host, guest)

        # Deliberately fail AFTER both native payout messages have been
        # emitted.  The integration test verifies that this parent GenVM
        # error atomically discards the transfers.
        raise gl.vm.UserError("Intentional rollback after payout emission")
