use crate::blockchain::SyncBlockchain;
use crate::evm::build_evm;
use crate::state::SyncState;
use crate::{PendingTransaction, TransactionError};
use rethnet_eth::signature::SignatureError;
use rethnet_eth::B256;
use revm::inspectors::GasInspector;
use revm::interpreter::{
    opcode, CallInputs, CreateInputs, Gas, InstructionResult, Interpreter, Stack,
};
use revm::primitives::{hex, B160, U256};
use revm::primitives::{BlockEnv, Bytes, CfgEnv, ExecutionResult, ResultAndState, SpecId};
use revm::{EVMData, Inspector, JournalEntry};
use std::collections::HashMap;
use std::fmt::Debug;

/// Get trace output for `debug_traceTransaction`
#[cfg_attr(feature = "tracing", tracing::instrument)]
pub fn debug_trace_transaction<BlockchainErrorT, StateErrorT>(
    blockchain: &dyn SyncBlockchain<BlockchainErrorT, StateErrorT>,
    // Take ownership of the state so that we can apply throw-away modifications on it
    mut state: Box<dyn SyncState<StateErrorT>>,
    evm_config: CfgEnv,
    trace_config: DebugTraceConfig,
    block_env: BlockEnv,
    transactions: Vec<PendingTransaction>,
    transaction_hash: &B256,
) -> Result<DebugTraceResult, DebugTraceError<BlockchainErrorT, StateErrorT>>
where
    BlockchainErrorT: Debug + Send + 'static,
    StateErrorT: Debug + Send + 'static,
{
    if evm_config.spec_id < SpecId::SPURIOUS_DRAGON {
        // Matching Hardhat Network behaviour: https://github.com/NomicFoundation/hardhat/blob/af7e4ce6a18601ec9cd6d4aa335fa7e24450e638/packages/hardhat-core/src/internal/hardhat-network/provider/vm/ethereumjs.ts#L427
        return Err(DebugTraceError::InvalidSpecId {
            spec_id: evm_config.spec_id,
        });
    }

    if evm_config.spec_id > SpecId::MERGE && block_env.prevrandao.is_none() {
        return Err(TransactionError::MissingPrevrandao.into());
    }

    for transaction in transactions {
        if transaction.hash() == transaction_hash {
            let evm = build_evm(
                blockchain,
                &state,
                evm_config,
                transaction.into(),
                block_env,
            );
            let mut tracer = TracerEip3155::new(trace_config);
            let ResultAndState {
                result: execution_result,
                ..
            } = evm
                .inspect_ref(&mut tracer)
                .map_err(TransactionError::from)?;
            let debug_result = match execution_result {
                ExecutionResult::Success {
                    gas_used, output, ..
                } => DebugTraceResult {
                    pass: true,
                    gas_used,
                    output: Some(output.into_data()),
                    logs: tracer.logs,
                },
                ExecutionResult::Revert { gas_used, output } => DebugTraceResult {
                    pass: false,
                    gas_used,
                    output: Some(output),
                    logs: tracer.logs,
                },
                ExecutionResult::Halt { gas_used, .. } => DebugTraceResult {
                    pass: false,
                    gas_used,
                    output: None,
                    logs: tracer.logs,
                },
            };

            return Ok(debug_result);
        } else {
            let evm = build_evm(
                blockchain,
                &state,
                evm_config.clone(),
                transaction.into(),
                block_env.clone(),
            );
            let ResultAndState { state: changes, .. } =
                evm.transact_ref().map_err(TransactionError::from)?;
            state.commit(changes);
        }
    }

    Err(DebugTraceError::InvalidTransactionHash {
        transaction_hash: *transaction_hash,
        block_number: block_env.number,
    })
}

/// Config options for `debug_trace_transaction`
#[derive(Debug, Default, Clone)]
pub struct DebugTraceConfig {
    /// Disable storage trace.
    pub disable_storage: bool,
    /// Disable memory trace.
    pub disable_memory: bool,
    /// Disable stack trace.
    pub disable_stack: bool,
}

#[derive(Debug, thiserror::Error)]
pub enum DebugTraceError<BlockchainErrorT, StateErrorT> {
    /// Invalid hardfork spec argument.
    #[error("Invalid spec id: {spec_id:?}. `debug_traceTransaction` is not supported prior to Spurious Dragon")]
    InvalidSpecId { spec_id: SpecId },
    /// Invalid transaction hash argument.
    #[error("Transaction hash {transaction_hash} not found in block {block_number}")]
    InvalidTransactionHash {
        transaction_hash: B256,
        block_number: U256,
    },
    #[error(transparent)]
    SignatureError(#[from] SignatureError),
    #[error(transparent)]
    TransactionError(#[from] TransactionError<BlockchainErrorT, StateErrorT>),
}

/// Result of a `debug_traceTransaction` call.
#[derive(Debug, Clone, serde::Deserialize, serde::Serialize)]
pub struct DebugTraceResult {
    /// Whether transaction was executed successfully.
    pub pass: bool,
    /// All gas used by the transaction.
    pub gas_used: u64,
    /// Return values of the function.
    pub output: Option<Bytes>,
    /// The EIP-3155 debug logs.
    pub logs: Vec<DebugTraceLogItem>,
}

/// The output of an EIP-3155 trace.
/// The required fields match <https://eips.ethereum.org/EIPS/eip-3155#output> except for
/// `returnData` and `refund` which are not used currently by Hardhat.
/// The `opName`, `error`, `memory` and `storage` optional fields are supported as well.
#[derive(Debug, Clone, serde::Deserialize, serde::Serialize)]
pub struct DebugTraceLogItem {
    /// Program Counter
    pub pc: u64,
    /// Op code
    pub op: u8,
    /// Gas left before executing this operation as hex number.
    pub gas: String,
    /// Gas cost of this operation as hex number.
    pub gas_cost: String,
    /// Array of all values (hex numbers) on the stack
    pub stack: Option<Vec<String>>,
    /// Depth of the call stack
    pub depth: u64,
    /// Size of memory array.
    pub mem_size: u64,
    /// Name of the operation.
    pub op_name: String,
    /// Description of an error.
    pub error: Option<String>,
    /// Array of all allocated values as hex strings.
    pub memory: Option<Vec<String>>,
    /// Map of all stored values with keys and values encoded as hex strings.
    pub storage: Option<HashMap<String, String>>,
}

// Based on https://github.com/bluealloy/revm/blob/70cf969a25a45e3bb4e503926297d61a90c7eec5/crates/revm/src/inspector/tracer_eip3155.rs
// Original licensed under the MIT license.
struct TracerEip3155 {
    config: DebugTraceConfig,

    logs: Vec<DebugTraceLogItem>,

    gas_inspector: GasInspector,

    contract_address: B160,
    gas_remaining: u64,
    memory: Vec<u8>,
    mem_size: usize,
    opcode: u8,
    pc: usize,
    skip: bool,
    stack: Stack,
    // Contract-specific storage
    storage: HashMap<B160, HashMap<String, String>>,
}

impl TracerEip3155 {
    fn new(config: DebugTraceConfig) -> Self {
        Self {
            config,
            logs: Vec::default(),
            gas_inspector: GasInspector::default(),
            contract_address: B160::default(),
            stack: Stack::new(),
            pc: 0,
            opcode: 0,
            gas_remaining: 0,
            memory: Vec::default(),
            mem_size: 0,
            skip: false,
            storage: HashMap::default(),
        }
    }

    fn record_log<DatabaseErrorT>(&mut self, data: &mut dyn EVMData<DatabaseErrorT>) {
        let depth = data.journaled_state().depth();

        let stack = if self.config.disable_stack {
            None
        } else {
            Some(
                self.stack
                    .data()
                    .iter()
                    .map(to_hex_word)
                    .collect::<Vec<String>>(),
            )
        };

        let memory = if self.config.disable_memory {
            None
        } else {
            Some(self.memory.chunks(32).map(hex::encode).collect())
        };

        let storage = if self.config.disable_storage {
            None
        } else {
            if matches!(self.opcode, opcode::SLOAD | opcode::SSTORE) {
                let journaled_state = data.journaled_state();
                let last_entry = journaled_state.journal.last().and_then(|v| v.last());
                if let Some(JournalEntry::StorageChange { address, key, .. }) = last_entry {
                    let value = journaled_state.state[address].storage[key].present_value();
                    let contract_storage = self.storage.entry(self.contract_address).or_default();
                    contract_storage.insert(to_hex_word(key), to_hex_word(&value));
                }
            }
            Some(
                self.storage
                    .get(&self.contract_address)
                    .cloned()
                    .unwrap_or_default(),
            )
        };

        let mut error = None;
        let op_name = opcode::OPCODE_JUMPMAP[self.opcode as usize].map_or_else(
            || {
                // Matches message from Hardhat
                // https://github.com/NomicFoundation/hardhat/blob/37c5c5845969b15995cc96cb6bd0596977f8b1f8/packages/hardhat-core/src/internal/hardhat-network/stack-traces/vm-debug-tracer.ts#L452
                let fallback = format!("opcode 0x${:x} not defined", self.opcode);
                error = Some(fallback.clone());
                fallback
            },
            String::from,
        );

        // TODO gas inspector is not updated for STATICCALL for some reason, so instead of returning
        // the gas cost of the previous op which could be confusing we return 0.
        let gas_cost = if self.opcode == opcode::STATICCALL {
            0
        } else {
            self.gas_inspector.last_gas_cost()
        };

        let log_item = DebugTraceLogItem {
            pc: self.pc as u64,
            op: self.opcode,
            gas: format!("0x{:x}", self.gas_remaining),
            gas_cost: format!("0x{gas_cost:x}"),
            stack,
            depth,
            mem_size: self.mem_size as u64,
            op_name,
            error,
            memory,
            storage,
        };
        self.logs.push(log_item);
    }
}

impl<DatabaseErrorT> Inspector<DatabaseErrorT> for TracerEip3155 {
    fn initialize_interp(
        &mut self,
        interp: &mut Interpreter,
        data: &mut dyn EVMData<DatabaseErrorT>,
    ) -> InstructionResult {
        self.gas_inspector.initialize_interp(interp, data);
        InstructionResult::Continue
    }

    fn step(
        &mut self,
        interp: &mut Interpreter,
        data: &mut dyn EVMData<DatabaseErrorT>,
    ) -> InstructionResult {
        self.contract_address = interp.contract.address;

        self.gas_inspector.step(interp, data);
        self.gas_remaining = self.gas_inspector.gas_remaining();

        if !self.config.disable_stack {
            self.stack = interp.stack.clone();
        }

        if !self.config.disable_memory {
            self.memory = interp.memory.data().clone();
        }

        self.mem_size = interp.memory.len();

        self.opcode = interp.current_opcode();

        self.pc = interp.program_counter();

        InstructionResult::Continue
    }

    fn step_end(
        &mut self,
        interp: &mut Interpreter,
        data: &mut dyn EVMData<DatabaseErrorT>,
        eval: InstructionResult,
    ) -> InstructionResult {
        self.gas_inspector.step_end(interp, data, eval);

        // Omit extra return https://github.com/bluealloy/revm/pull/563
        if self.skip {
            self.skip = false;
            return InstructionResult::Continue;
        };

        self.record_log(data);
        InstructionResult::Continue
    }

    fn call(
        &mut self,
        data: &mut dyn EVMData<DatabaseErrorT>,
        _inputs: &mut CallInputs,
    ) -> (InstructionResult, Gas, Bytes) {
        self.record_log(data);
        (InstructionResult::Continue, Gas::new(0), Bytes::new())
    }

    fn call_end(
        &mut self,
        data: &mut dyn EVMData<DatabaseErrorT>,
        inputs: &CallInputs,
        remaining_gas: Gas,
        ret: InstructionResult,
        out: Bytes,
    ) -> (InstructionResult, Gas, Bytes) {
        self.gas_inspector
            .call_end(data, inputs, remaining_gas, ret, out.clone());
        self.skip = true;
        (ret, remaining_gas, out)
    }

    fn create(
        &mut self,
        data: &mut dyn EVMData<DatabaseErrorT>,
        _inputs: &mut CreateInputs,
    ) -> (InstructionResult, Option<B160>, Gas, Bytes) {
        self.record_log(data);
        (
            InstructionResult::Continue,
            None,
            Gas::new(0),
            Bytes::default(),
        )
    }

    fn create_end(
        &mut self,
        data: &mut dyn EVMData<DatabaseErrorT>,
        inputs: &CreateInputs,
        ret: InstructionResult,
        address: Option<B160>,
        remaining_gas: Gas,
        out: Bytes,
    ) -> (InstructionResult, Option<B160>, Gas, Bytes) {
        self.gas_inspector
            .create_end(data, inputs, ret, address, remaining_gas, out.clone());
        self.skip = true;
        (ret, address, remaining_gas, out)
    }
}

fn to_hex_word(word: &U256) -> String {
    if word == &U256::ZERO {
        // For 0 zero, the #066x formatter doesn't add padding.
        format!("0x{}", "0".repeat(64))
    } else {
        // 66 = 64 hex chars + 0x prefix
        format!("{word:#066x}")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_to_hex_word() {
        assert_eq!(
            to_hex_word(&U256::ZERO),
            "0x0000000000000000000000000000000000000000000000000000000000000000"
        );
        assert_eq!(
            to_hex_word(&U256::from(1)),
            "0x0000000000000000000000000000000000000000000000000000000000000001"
        );
    }
}