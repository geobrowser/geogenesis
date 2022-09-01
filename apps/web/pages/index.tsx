import Link from 'next/link'

export default function Home() {
  return (
    <div>
      <Link href="/databases/sync">
        <a>Sync database example</a>
      </Link>
    </div>
  )
}
