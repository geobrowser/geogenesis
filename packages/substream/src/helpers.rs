use substreams::Hex;

/// This function will return the hex representation of the address in lowercase
pub fn format_hex(address: &[u8]) -> String {
    format!("0x{}", Hex(address).to_string())
}
