import Link from 'next/link'

export default function NotFound() {
  return <main className="not-found-page"><p className="eyebrow">Universal Convertal</p><h1>That route is not in the workspace.</h1><p>Choose a tool to continue with a precise, private conversion.</p><Link href="/" className="button button-primary">Return to units</Link></main>
}
