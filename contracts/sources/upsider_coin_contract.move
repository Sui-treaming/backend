module my_coin_pkg::my_coin {
    use sui::coin::{Self, TreasuryCap};
    use sui::url;

    public struct MY_COIN has drop {}

    fun init(witness: MY_COIN, ctx: &mut sui::tx_context::TxContext) {
        let decimals: u8 = 9;
        let symbol = b"WSV";
        let name = b"My Coin";
        let description = b"";
        let icon = option::some(url::new_unsafe_from_bytes(b"https://example.com/icon.png"));
        let (treasury, metadata) = coin::create_currency<MY_COIN>(
            witness, decimals, symbol, name, description, icon, ctx
        );
        let sender = ctx.sender();
        sui::transfer::public_transfer(treasury, sender);
        sui::transfer::public_share_object(metadata);
    }

    public fun mint(
        cap: &mut TreasuryCap<MY_COIN>,
        amount: u64,
        recipient: address,
        ctx: &mut sui::tx_context::TxContext
    ) {
        let c = coin::mint<MY_COIN>(cap, amount, ctx);
        sui::transfer::public_transfer(c, recipient);
    }

    public fun burn(
        cap: &mut TreasuryCap<MY_COIN>,
        c: coin::Coin<MY_COIN>
    ) {
        coin::burn<MY_COIN>(cap, c);
    }


}