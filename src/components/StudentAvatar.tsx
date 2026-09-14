import { useQuery } from '@tanstack/react-query'
import { STUDENT_PHOTOS, signedUrlFor } from '@/lib/storage'
import { cn } from '@/lib/utils'

function initials(first: string, last: string) {
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase()
}

interface Props {
  photoPath: string | null
  firstName: string
  lastName: string
  size?: number
  className?: string
  bucket?: string
}

/** Photo resolved from a private storage path via a signed URL, with initials fallback. */
export function Avatar({ photoPath, firstName, lastName, size = 40, className, bucket = STUDENT_PHOTOS }: Props) {
  const { data: url } = useQuery({
    queryKey: ['photo_url', bucket, photoPath],
    enabled: !!photoPath,
    staleTime: 50 * 60 * 1000,
    queryFn: () => signedUrlFor(bucket, photoPath!),
  })

  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 font-medium text-primary',
        className,
      )}
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {url ? (
        <img src={url} alt={`${firstName} ${lastName}`} className="h-full w-full object-cover" />
      ) : (
        initials(firstName, lastName)
      )}
    </div>
  )
}

// Backwards-compatible alias.
export const StudentAvatar = Avatar
