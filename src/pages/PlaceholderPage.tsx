import { PageHeader } from '@/components/PageHeader'
import { Card, CardBody } from '@/components/ui/card'

/** Temporary page for modules scheduled in a later build phase. */
export function PlaceholderPage({ title, phase }: { title: string; phase: string }) {
  return (
    <div>
      <PageHeader title={title} />
      <Card>
        <CardBody className="py-12 text-center">
          <p className="font-serif text-lg font-semibold text-foreground">Under construction</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
            The {title.toLowerCase()} module is planned for {phase}. The foundation it builds on is
            already in place.
          </p>
        </CardBody>
      </Card>
    </div>
  )
}
