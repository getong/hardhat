use edr_evm::HashMap;

#[derive(Clone, Debug, PartialEq, serde::Deserialize, serde::Serialize)]
pub struct BlockchainConfig {
    pub forking: Option<RpcForkConfig>,
}

impl Default for BlockchainConfig {
    fn default() -> Self {
        Self { forking: None }
    }
}

#[derive(Clone, Debug, PartialEq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RpcForkConfig {
    pub json_rpc_url: String,
    pub block_number: Option<u64>,
    pub http_headers: Option<HashMap<String, String>>,
}
