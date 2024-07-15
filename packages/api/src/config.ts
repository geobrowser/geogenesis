import dotenv from 'dotenv';

dotenv.config();

export const PORT = process.env.PORT || 5001;
export const DATABASE_URL = process.env.DATABASE_URL!;
export const CHAIN_RPC = process.env.CHAIN_RPC!;
export const GEO_SUBGRAPH_DEPLOYMENT_ID = process.env.GEO_SUBGRAPH_DEPLOYMENT_ID!;
 
if (!DATABASE_URL) {
  throw "DATABASE_URL must be set";
}
if (!CHAIN_RPC) {
  throw "CHAIN_RPC must be set";
}
if (!GEO_SUBGRAPH_DEPLOYMENT_ID) {
  throw "GEO_SUBGRAPH_DEPLOYMENT_ID must be set";
}