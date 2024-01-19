// @generated
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct Request {
    #[prost(int64, tag="1")]
    pub start_block_num: i64,
    #[prost(string, tag="2")]
    pub start_cursor: ::prost::alloc::string::String,
    #[prost(uint64, tag="3")]
    pub stop_block_num: u64,
    /// With final_block_only, you only receive blocks that are irreversible:
    /// 'final_block_height' will be equal to current block and no 'undo_signal' will ever be sent
    #[prost(bool, tag="4")]
    pub final_blocks_only: bool,
    /// Substreams has two mode when executing your module(s) either development mode or production
    /// mode. Development and production modes impact the execution of Substreams, important aspects
    /// of execution include:
    /// * The time required to reach the first byte.
    /// * The speed that large ranges get executed.
    /// * The module logs and outputs sent back to the client.
    ///
    /// By default, the engine runs in developer mode, with richer and deeper output. Differences
    /// between production and development modes include:
    /// * Forward parallel execution is enabled in production mode and disabled in development mode
    /// * The time required to reach the first byte in development mode is faster than in production mode.
    ///
    /// Specific attributes of development mode include:
    /// * The client will receive all of the executed module's logs.
    /// * It's possible to request specific store snapshots in the execution tree (via `debug_initial_store_snapshot_for_modules`).
    /// * Multiple module's output is possible.
    ///
    /// With production mode`, however, you trade off functionality for high speed enabling forward
    /// parallel execution of module ahead of time.
    #[prost(bool, tag="5")]
    pub production_mode: bool,
    #[prost(string, tag="6")]
    pub output_module: ::prost::alloc::string::String,
    #[prost(message, optional, tag="7")]
    pub modules: ::core::option::Option<super::super::v1::Modules>,
    /// Available only in developer mode
    #[prost(string, repeated, tag="10")]
    pub debug_initial_store_snapshot_for_modules: ::prost::alloc::vec::Vec<::prost::alloc::string::String>,
}
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct Response {
    #[prost(oneof="response::Message", tags="1, 2, 3, 4, 5, 10, 11")]
    pub message: ::core::option::Option<response::Message>,
}
/// Nested message and enum types in `Response`.
pub mod response {
    #[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Oneof)]
    pub enum Message {
        /// Always sent first
        #[prost(message, tag="1")]
        Session(super::SessionInit),
        /// Progress of data preparation, before sending in the stream of `data` events.
        #[prost(message, tag="2")]
        Progress(super::ModulesProgress),
        #[prost(message, tag="3")]
        BlockScopedData(super::BlockScopedData),
        #[prost(message, tag="4")]
        BlockUndoSignal(super::BlockUndoSignal),
        #[prost(message, tag="5")]
        FatalError(super::Error),
        /// Available only in developer mode, and only if `debug_initial_store_snapshot_for_modules` is set.
        #[prost(message, tag="10")]
        DebugSnapshotData(super::InitialSnapshotData),
        /// Available only in developer mode, and only if `debug_initial_store_snapshot_for_modules` is set.
        #[prost(message, tag="11")]
        DebugSnapshotComplete(super::InitialSnapshotComplete),
    }
}
/// BlockUndoSignal informs you that every bit of data
/// with a block number above 'last_valid_block' has been reverted
/// on-chain. Delete that data and restart from 'last_valid_cursor'
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct BlockUndoSignal {
    #[prost(message, optional, tag="1")]
    pub last_valid_block: ::core::option::Option<super::super::v1::BlockRef>,
    #[prost(string, tag="2")]
    pub last_valid_cursor: ::prost::alloc::string::String,
}
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct BlockScopedData {
    #[prost(message, optional, tag="1")]
    pub output: ::core::option::Option<MapModuleOutput>,
    #[prost(message, optional, tag="2")]
    pub clock: ::core::option::Option<super::super::v1::Clock>,
    #[prost(string, tag="3")]
    pub cursor: ::prost::alloc::string::String,
    /// Non-deterministic, allows substreams-sink to let go of their undo data.
    #[prost(uint64, tag="4")]
    pub final_block_height: u64,
    #[prost(message, repeated, tag="10")]
    pub debug_map_outputs: ::prost::alloc::vec::Vec<MapModuleOutput>,
    #[prost(message, repeated, tag="11")]
    pub debug_store_outputs: ::prost::alloc::vec::Vec<StoreModuleOutput>,
}
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct SessionInit {
    #[prost(string, tag="1")]
    pub trace_id: ::prost::alloc::string::String,
    #[prost(uint64, tag="2")]
    pub resolved_start_block: u64,
    #[prost(uint64, tag="3")]
    pub linear_handoff_block: u64,
    #[prost(uint64, tag="4")]
    pub max_parallel_workers: u64,
}
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct InitialSnapshotComplete {
    #[prost(string, tag="1")]
    pub cursor: ::prost::alloc::string::String,
}
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct InitialSnapshotData {
    #[prost(string, tag="1")]
    pub module_name: ::prost::alloc::string::String,
    #[prost(message, repeated, tag="2")]
    pub deltas: ::prost::alloc::vec::Vec<StoreDelta>,
    #[prost(uint64, tag="4")]
    pub sent_keys: u64,
    #[prost(uint64, tag="3")]
    pub total_keys: u64,
}
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct MapModuleOutput {
    #[prost(string, tag="1")]
    pub name: ::prost::alloc::string::String,
    #[prost(message, optional, tag="2")]
    pub map_output: ::core::option::Option<::prost_types::Any>,
    /// DebugOutputInfo is available in non-production mode only
    #[prost(message, optional, tag="10")]
    pub debug_info: ::core::option::Option<OutputDebugInfo>,
}
/// StoreModuleOutput are produced for store modules in development mode.
/// It is not possible to retrieve store models in production, with parallelization
/// enabled. If you need the deltas directly, write a pass through mapper module
/// that will get them down to you.
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct StoreModuleOutput {
    #[prost(string, tag="1")]
    pub name: ::prost::alloc::string::String,
    #[prost(message, repeated, tag="2")]
    pub debug_store_deltas: ::prost::alloc::vec::Vec<StoreDelta>,
    #[prost(message, optional, tag="10")]
    pub debug_info: ::core::option::Option<OutputDebugInfo>,
}
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct OutputDebugInfo {
    #[prost(string, repeated, tag="1")]
    pub logs: ::prost::alloc::vec::Vec<::prost::alloc::string::String>,
    /// LogsTruncated is a flag that tells you if you received all the logs or if they
    /// were truncated because you logged too much (fixed limit currently is set to 128 KiB).
    #[prost(bool, tag="2")]
    pub logs_truncated: bool,
    #[prost(bool, tag="3")]
    pub cached: bool,
}
/// ModulesProgress is a message that is sent every 500ms
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct ModulesProgress {
    /// List of jobs running on tier2 servers
    #[prost(message, repeated, tag="2")]
    pub running_jobs: ::prost::alloc::vec::Vec<Job>,
    /// Execution statistics for each module
    #[prost(message, repeated, tag="3")]
    pub modules_stats: ::prost::alloc::vec::Vec<ModuleStats>,
    /// Stages definition and completed block ranges
    #[prost(message, repeated, tag="4")]
    pub stages: ::prost::alloc::vec::Vec<Stage>,
    #[prost(message, optional, tag="5")]
    pub processed_bytes: ::core::option::Option<ProcessedBytes>,
}
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct ProcessedBytes {
    #[prost(uint64, tag="1")]
    pub total_bytes_read: u64,
    #[prost(uint64, tag="2")]
    pub total_bytes_written: u64,
}
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct Error {
    #[prost(string, tag="1")]
    pub module: ::prost::alloc::string::String,
    #[prost(string, tag="2")]
    pub reason: ::prost::alloc::string::String,
    #[prost(string, repeated, tag="3")]
    pub logs: ::prost::alloc::vec::Vec<::prost::alloc::string::String>,
    /// FailureLogsTruncated is a flag that tells you if you received all the logs or if they
    /// were truncated because you logged too much (fixed limit currently is set to 128 KiB).
    #[prost(bool, tag="4")]
    pub logs_truncated: bool,
}
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct Job {
    #[prost(uint32, tag="1")]
    pub stage: u32,
    #[prost(uint64, tag="2")]
    pub start_block: u64,
    #[prost(uint64, tag="3")]
    pub stop_block: u64,
    #[prost(uint64, tag="4")]
    pub processed_blocks: u64,
    #[prost(uint64, tag="5")]
    pub duration_ms: u64,
}
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct Stage {
    #[prost(string, repeated, tag="1")]
    pub modules: ::prost::alloc::vec::Vec<::prost::alloc::string::String>,
    #[prost(message, repeated, tag="2")]
    pub completed_ranges: ::prost::alloc::vec::Vec<BlockRange>,
}
/// ModuleStats gathers metrics and statistics from each module, running on tier1 or tier2
/// All the 'count' and 'time_ms' values may include duplicate for each stage going over that module
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct ModuleStats {
    /// name of the module
    #[prost(string, tag="1")]
    pub name: ::prost::alloc::string::String,
    /// total_processed_blocks is the sum of blocks sent to that module code
    #[prost(uint64, tag="2")]
    pub total_processed_block_count: u64,
    /// total_processing_time_ms is the sum of all time spent running that module code
    #[prost(uint64, tag="3")]
    pub total_processing_time_ms: u64,
    /// // external_calls are chain-specific intrinsics, like "Ethereum RPC calls".
    #[prost(message, repeated, tag="4")]
    pub external_call_metrics: ::prost::alloc::vec::Vec<ExternalCallMetric>,
    /// total_store_operation_time_ms is the sum of all time spent running that module code waiting for a store operation (ex: read, write, delete...)
    #[prost(uint64, tag="5")]
    pub total_store_operation_time_ms: u64,
    /// total_store_read_count is the sum of all the store Read operations called from that module code
    #[prost(uint64, tag="6")]
    pub total_store_read_count: u64,
    /// total_store_write_count is the sum of all store Write operations called from that module code (store-only)
    #[prost(uint64, tag="10")]
    pub total_store_write_count: u64,
    /// total_store_deleteprefix_count is the sum of all store DeletePrefix operations called from that module code (store-only)
    /// note that DeletePrefix can be a costly operation on large stores
    #[prost(uint64, tag="11")]
    pub total_store_deleteprefix_count: u64,
    /// store_size_bytes is the uncompressed size of the full KV store for that module, from the last 'merge' operation (store-only)
    #[prost(uint64, tag="12")]
    pub store_size_bytes: u64,
    /// total_store_merging_time_ms is the time spent merging partial stores into a full KV store for that module (store-only)
    #[prost(uint64, tag="13")]
    pub total_store_merging_time_ms: u64,
    /// store_currently_merging is true if there is a merging operation (partial store to full KV store) on the way.
    #[prost(bool, tag="14")]
    pub store_currently_merging: bool,
    /// highest_contiguous_block is the highest block in the highest merged full KV store of that module (store-only)
    #[prost(uint64, tag="15")]
    pub highest_contiguous_block: u64,
}
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct ExternalCallMetric {
    #[prost(string, tag="1")]
    pub name: ::prost::alloc::string::String,
    #[prost(uint64, tag="2")]
    pub count: u64,
    #[prost(uint64, tag="3")]
    pub time_ms: u64,
}
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct StoreDelta {
    #[prost(enumeration="store_delta::Operation", tag="1")]
    pub operation: i32,
    #[prost(uint64, tag="2")]
    pub ordinal: u64,
    #[prost(string, tag="3")]
    pub key: ::prost::alloc::string::String,
    #[prost(bytes="vec", tag="4")]
    pub old_value: ::prost::alloc::vec::Vec<u8>,
    #[prost(bytes="vec", tag="5")]
    pub new_value: ::prost::alloc::vec::Vec<u8>,
}
/// Nested message and enum types in `StoreDelta`.
pub mod store_delta {
    #[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, PartialOrd, Ord, ::prost::Enumeration)]
    #[repr(i32)]
    pub enum Operation {
        Unset = 0,
        Create = 1,
        Update = 2,
        Delete = 3,
    }
    impl Operation {
        /// String value of the enum field names used in the ProtoBuf definition.
        ///
        /// The values are not transformed in any way and thus are considered stable
        /// (if the ProtoBuf definition does not change) and safe for programmatic use.
        pub fn as_str_name(&self) -> &'static str {
            match self {
                Operation::Unset => "UNSET",
                Operation::Create => "CREATE",
                Operation::Update => "UPDATE",
                Operation::Delete => "DELETE",
            }
        }
        /// Creates an enum from field names used in the ProtoBuf definition.
        pub fn from_str_name(value: &str) -> ::core::option::Option<Self> {
            match value {
                "UNSET" => Some(Self::Unset),
                "CREATE" => Some(Self::Create),
                "UPDATE" => Some(Self::Update),
                "DELETE" => Some(Self::Delete),
                _ => None,
            }
        }
    }
}
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct BlockRange {
    #[prost(uint64, tag="2")]
    pub start_block: u64,
    #[prost(uint64, tag="3")]
    pub end_block: u64,
}
// @@protoc_insertion_point(module)
