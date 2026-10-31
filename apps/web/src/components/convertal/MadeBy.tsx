// Who built Universal Convertal, and how to reach him. Matches the Person entity published on https://chames.tn.
const author = {
  name: 'Chames Eddine Dhibi',
  role: 'freelance full-stack developer',
  phone: '+216 51 091 800',
  phoneHref: 'tel:+21651091800',
  whatsappHref: `https://wa.me/21651091800?text=${encodeURIComponent(
    'Hi Chames, I saw Universal Convertal and would like to talk about a project.',
  )}`,
  portfolioHref: 'https://chames.tn/?utm_source=unit-converter&utm_medium=referral&utm_campaign=demo_credit',
}

const structuredData = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      name: 'Universal Convertal',
      description: 'Unit, currency, developer and image conversion tools that run in the browser.',
      applicationCategory: 'UtilitiesApplication',
      operatingSystem: 'Any',
      inLanguage: 'en',
      creator: { '@id': 'https://chames.tn/#person' },
    },
    {
      '@type': 'Person',
      '@id': 'https://chames.tn/#person',
      name: author.name,
      alternateName: ['Chames Dhibi', 'Chams Dhibi'],
      jobTitle: 'Software Engineer & Full-Stack Developer',
      url: 'https://chames.tn',
      telephone: '+216 51091800',
      address: { '@type': 'PostalAddress', addressLocality: 'Gafsa', addressCountry: 'TN' },
      sameAs: [
        'https://github.com/chams99',
        'https://linkedin.com/in/chamesdh',
        'https://www.upwork.com/freelancers/~01ec2dc27e0c617399',
      ],
    },
  ],
}

const pill =
  'inline-flex min-h-10 items-center rounded-full border border-border px-4 text-xs font-medium text-foreground transition-colors hover:border-primary hover:text-primary'

export function MadeBy() {
  return (
    <aside
      aria-labelledby="made-by-title"
      className="mx-auto flex w-[min(100%-4rem,1240px)] flex-wrap items-center justify-between gap-x-8 gap-y-3 pb-8 text-xs text-muted-foreground max-[1100px]:w-[min(100%-2.5rem,860px)] max-[700px]:w-[min(100%-2rem,640px)]"
    >
      <div>
        <h2 id="made-by-title" className="text-sm font-semibold text-foreground">
          Need a tool like this one?
        </h2>
        <p className="mt-0.5">
          Designed and built by{' '}
          <a href={author.portfolioHref} rel="author" className="text-foreground underline underline-offset-4 hover:text-primary">
            {author.name}
          </a>
          , {author.role}.
        </p>
      </div>
      <ul className="flex flex-wrap gap-2">
        <li>
          <a href={author.phoneHref} className={pill}>
            {author.phone}
          </a>
        </li>
        <li>
          <a href={author.whatsappHref} className={pill}>
            WhatsApp
          </a>
        </li>
        <li>
          <a href={author.portfolioHref} className={pill}>
            chames.tn
          </a>
        </li>
      </ul>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
    </aside>
  )
}
