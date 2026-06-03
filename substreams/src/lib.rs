use substreams::pb::substreams::store_delta::Operation;
use substreams::scalar::BigInt;
use substreams::store::{DeltaBigInt, Deltas, StoreAdd, StoreAddBigInt, StoreNew};
use substreams::Hex;
use substreams_database_change::pb::sf::substreams::sink::database::v1::DatabaseChanges;
use substreams_database_change::tables::Tables;
use substreams_ethereum::pb::eth::v2 as eth;

/// keccak256("Transfer(address,address,uint256)") — lowercase hex, no 0x.
const TRANSFER: &str = "ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const ZERO: &str = "0000000000000000000000000000000000000000";

/// Curated PulseChain token set (lowercase, no 0x). Mirrors
/// packages/api/.../portfolio curated list. Bounds storage to a high-signal
/// set; extend deliberately — each high-volume token adds holder rows.
const CURATED: [&str; 4] = [
    "a1077a294dde1b09bb078844df40758a5d0f9a27", // WPLS
    "2b591e99afe9f32eaa6214f7b7629768c40eeb39", // HEX
    "95b303987a60c71504d99aa1b13b4da07b0790ab", // PLSX
    "2fa878ab3f87cc1c9737fc071108f904c0b0c95d", // INC
];

fn is_curated(addr: &str) -> bool {
    CURATED.contains(&addr)
}

/// Accumulate signed ERC-20 Transfer deltas per `token:holder`. The store
/// holds the running balance (bounded by holder count), so a genesis backfill
/// stays small — no per-transfer storage.
#[substreams::handlers::store]
fn store_balances(block: eth::Block, store: StoreAddBigInt) {
    for log in block.logs() {
        let token = Hex::encode(log.address());
        if !is_curated(&token) {
            continue;
        }
        let topics = &log.log.topics;
        // ERC-20 Transfer: topic0 + indexed from + indexed to (3 topics);
        // value is the (non-indexed) 32-byte data word.
        if topics.len() != 3 || Hex::encode(&topics[0]) != TRANSFER {
            continue;
        }
        let from = Hex::encode(&topics[1][12..]);
        let to = Hex::encode(&topics[2][12..]);
        let value = BigInt::from_unsigned_bytes_be(&log.log.data);

        if from != ZERO {
            store.add(log.ordinal(), format!("{}:{}", token, from), value.clone().neg());
        }
        if to != ZERO {
            store.add(log.ordinal(), format!("{}:{}", token, to), value);
        }
    }
}

/// Turn each per-block balance delta into a Postgres upsert on `token_balance`.
#[substreams::handlers::map]
fn db_out(deltas: Deltas<DeltaBigInt>) -> Result<DatabaseChanges, substreams::errors::Error> {
    let mut tables = Tables::new();
    for delta in deltas.deltas {
        let mut parts = delta.key.splitn(2, ':');
        let token = parts.next().unwrap_or("");
        let holder = parts.next().unwrap_or("");
        let balance = delta.new_value.to_string();
        let keys = [
            ("token".to_string(), token.to_string()),
            ("holder".to_string(), holder.to_string()),
        ];
        match delta.operation {
            Operation::Create => {
                tables.create_row("token_balance", keys).set("balance", &balance);
            }
            Operation::Update => {
                tables.update_row("token_balance", keys).set("balance", &balance);
            }
            Operation::Delete => {
                tables.delete_row("token_balance", keys);
            }
            Operation::Unset => {}
        }
    }
    Ok(tables.to_database_changes())
}
