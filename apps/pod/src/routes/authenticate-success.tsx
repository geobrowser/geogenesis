import {useHypergraphApp} from "@graphprotocol/hypergraph-react"
import {createFileRoute, useNavigate} from "@tanstack/react-router"
import {useEffect} from "react"

export const Route = createFileRoute("/authenticate-success")({
	component: RouteComponent,
	validateSearch: (search: Record<string, unknown>): {ciphertext: string; nonce: string} => {
		return {
			ciphertext: search.ciphertext as string,
			nonce: search.nonce as string,
		}
	},
})

function RouteComponent() {
	const {ciphertext, nonce} = Route.useSearch()
	const {processConnectAuthSuccess} = useHypergraphApp()
	const navigate = useNavigate()

	useEffect(() => {
		processConnectAuthSuccess({storage: localStorage, ciphertext, nonce})
		console.log("redirecting to /")
		navigate({to: "/", replace: true})
	}, [ciphertext, nonce, processConnectAuthSuccess, navigate])

	return <div>Authenticating …</div>
}
