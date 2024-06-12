import { CHAIN_RPC } from "./config";

export async function getChainHead() {
  const result = await fetch(CHAIN_RPC, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'eth_getBlockByNumber',
      params: ['latest', false],
      id: 1,
    }),
  });

  // @TODO: Errors, retries
  const json = (await result.json()) as {
    result: {
      hash: string; // hex encoded
      number: string; // hex encoded
    };
  };

  const head = {
    hash: json.result.hash,
    number: Number(json.result.number),
  };

  return head;
}

export async function getBlockMetadata(blockNumber: number) {
  const result = await fetch(CHAIN_RPC, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'eth_getBlockByNumber',
      params: [`0x${blockNumber.toString(16)}`, false],
      id: 1,
    }),
  });

  // @TODO: Errors, retries
  const json = (await result.json()) as {
    result: {
      hash: string; // hex encoded
      number: string; // hex encoded
      timestamp: string; // hex encoded
    };
  };

  return {
    hash: json.result.hash,
    timestamp: Number(json.result.timestamp),
  };
}
