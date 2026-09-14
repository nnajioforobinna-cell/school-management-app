import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('h-5 w-5 animate-spin text-muted', className)} />
}

export function FullScreenLoader() {
  return (
    <div className="flex h-full min-h-[60vh] w-full items-center justify-center">
      <Spinner className="h-6 w-6" />
    </div>
  )
}
