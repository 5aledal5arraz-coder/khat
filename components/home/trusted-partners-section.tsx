import { getHomepagePartners } from "@/lib/queries/partnerships"
import Image from "next/image"

export async function TrustedPartnersSection() {
  const partners = await getHomepagePartners()
  if (partners.length === 0) return null

  return (
    <section className="py-10">
      <p className="text-center text-xs text-muted-foreground/60 mb-6">
        جهات وثقت بالحوار
      </p>
      <div className="flex flex-wrap items-center justify-center gap-8">
        {partners.map((partner) => {
          const logo = partner.logo_url ? (
            <Image
              src={partner.logo_url}
              alt={partner.name}
              width={120}
              height={48}
              className="h-10 w-auto object-contain grayscale opacity-60 transition-all duration-300 group-hover:grayscale-0 group-hover:opacity-100"
            />
          ) : (
            <span className="text-sm font-medium text-muted-foreground/60 transition-colors duration-300 group-hover:text-foreground">
              {partner.name}
            </span>
          )

          if (partner.website_url) {
            return (
              <a
                key={partner.id}
                href={partner.website_url}
                target="_blank"
                rel="noopener noreferrer"
                className="group"
                title={partner.name}
              >
                {logo}
              </a>
            )
          }

          return (
            <div key={partner.id} className="group" title={partner.name}>
              {logo}
            </div>
          )
        })}
      </div>
    </section>
  )
}
