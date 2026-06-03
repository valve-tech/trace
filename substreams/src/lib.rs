use substreams::scalar::BigInt;
use substreams::Hex;
use substreams_database_change::pb::sf::substreams::sink::database::v1::DatabaseChanges;
use substreams_database_change::tables::Tables;
use substreams_ethereum::pb::eth::v2 as eth;

/// keccak256("Transfer(address,address,uint256)") — lowercase hex, no 0x.
const TRANSFER: &str = "ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

/// Emit every standard ERC-20 Transfer in the block as an append-only row.
///
/// No curated token filter and no balance store — this is the raw transfers
/// archive. Two things are derived from it downstream rather than computed
/// here:
///   * the `(holder → tokens)` membership index for portfolio discovery is a
///     projection of this table (DISTINCT token over sender/recipient),
///     maintained at insert time (e.g. a ClickHouse ReplacingMergeTree MV);
///   * the *current* balance comes from `balanceOf()` at read time, because
///     summing Transfer values is wrong for rebasing / fee-on-transfer tokens.
///
/// Addresses are lowercase hex, no 0x (matching the rest of the pipeline).
#[substreams::handlers::map]
fn db_out(block: eth::Block) -> Result<DatabaseChanges, substreams::errors::Error> {
    let mut tables = Tables::new();
    let block_num = block.number.to_string();

    for log in block.logs() {
        let topics = &log.log.topics;
        // Standard ERC-20 Transfer: topic0 + indexed `from` + indexed `to`
        // (3 topics); value is the non-indexed 32-byte data word. This skips
        // ERC-721 Transfer (4 topics, value indexed) by construction.
        if topics.len() != 3 || Hex::encode(&topics[0]) != TRANSFER {
            continue;
        }

        let token = Hex::encode(log.address());
        let from = Hex::encode(&topics[1][12..]);
        let to = Hex::encode(&topics[2][12..]);
        let value = BigInt::from_unsigned_bytes_be(&log.log.data).to_string();
        // block_index is the block-wide log index — unique within a block, so
        // (block_num, log_index) is a natural primary key.
        let log_index = log.log.block_index.to_string();
        let id = format!("{}-{}", block_num, log_index);

        tables
            .create_row("transfers", [("id".to_string(), id)])
            .set("block_num", &block_num)
            .set("log_index", &log_index)
            .set("token", &token)
            .set("sender", &from)
            .set("recipient", &to)
            .set("value", &value);
    }

    Ok(tables.to_database_changes())
}
