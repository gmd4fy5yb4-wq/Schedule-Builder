import Link from 'next/link'

export default function HelpLayout({
  title, intro, children,
}: { title: string; intro: string; children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-5 py-10">
        <Link href="/help" className="text-sm text-gray-500 hover:text-gray-800 transition">
          ← All help topics
        </Link>
        <h1 className="mt-4 text-3xl font-bold text-gray-900">{title}</h1>
        <p className="mt-2 text-gray-600 leading-relaxed">{intro}</p>
        <div className="mt-8 space-y-6 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-gray-900 [&_p]:text-gray-700 [&_p]:leading-relaxed [&_li]:text-gray-700 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5">
          {children}
        </div>
        <div className="mt-12 pt-6 border-t border-gray-200 text-sm text-gray-500">
          Still stuck? Email <a className="text-[var(--fd-primary)] underline" href="mailto:greg@alfred-digital.com">greg@alfred-digital.com</a>.
        </div>
      </div>
    </main>
  )
}
