import {HypergraphAppProvider} from "@graphprotocol/hypergraph-react"
import {mapping} from "./mapping"

export function Providers({children}: {children: React.ReactNode}) {
	return (
		<HypergraphAppProvider mapping={mapping} appId="93bb8907-085a-4a0e-83dd-62b0dc98e793">
			{children}
		</HypergraphAppProvider>
	)
}
