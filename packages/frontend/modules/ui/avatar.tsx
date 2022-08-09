export function Avatar({ addressOrName }: { addressOrName: string }) {
  // const { data } = useEnsAvatar({
  //   addressOrName,
  //   chainId: chain.mainnet.id,
  // })

  return (
    <div
      style={{
        width: 20,
        height: 20,
        borderRadius: 10,
        background: 'lightgray',
        border: 'none',
      }}
    >
      {/* {data && (
        <img
          alt="Avatar"
          src={data}
          style={{ width: '100%', height: '100%' }}
        ></img>
      )} */}
    </div>
  )
}
