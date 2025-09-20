/// Simple NFT module that mints and transfers Upsuider branded collectibles.
module upsuider_contract::upsuider_contract {
    use std::string::String;
    use sui::object::UID;
    use sui::tx_context::TxContext;

    const E_NOT_OWNER: u64 = 0;

    /// Move object representing a single Upsuider NFT.
    public struct UpsuiderNFT has key, store {
        id: UID,
        name: String,
        description: String,
        image_url: String,
        owner: address,
    }

    /// Mint a new NFT with the provided metadata and send it to `recipient`.
    public entry fun mint(
        name: String,
        description: String,
        image_url: String,
        recipient: address,
        ctx: &mut TxContext,
    ) {
        let nft = UpsuiderNFT {
            id: sui::object::new(ctx),
            name,
            description,
            image_url,
            owner: recipient,
        };
        sui::transfer::public_transfer(nft, recipient);
    }

    /// Transfer an existing Upsuider NFT to a new owner.
    public entry fun transfer_nft(nft: UpsuiderNFT, recipient: address, ctx: &mut TxContext) {
        let sender = sui::tx_context::sender(ctx);
        if (sender != nft.owner) {
            abort E_NOT_OWNER;
        };

        let mut nft = nft;
        nft.owner = recipient;
        sui::transfer::public_transfer(nft, recipient);
    }

    /// Read-only access to the NFT metadata.
    public fun metadata(nft: &UpsuiderNFT): (&String, &String, &String) {
        (&nft.name, &nft.description, &nft.image_url)
    }
}