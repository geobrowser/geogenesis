import {useHypergraphApp} from "@graphprotocol/hypergraph-react"
import React from "react"

export function useConnectApp() {
	const {redirectToConnect} = useHypergraphApp()

	const connect = React.useCallback(() => {
		redirectToConnect({
			storage: localStorage,
			connectUrl: "https://connect.geobrowser.io/",
			successUrl: `${window.location.origin}/authenticate-success`,
			redirectFn: (url: URL) => {
				window.location.href = url.toString()
			},
		})
	}, [redirectToConnect])

	return {
		connect,
	}
}
