import { useState } from "react"
import { avatarSrc, type ApiAvatar } from "../api/profile"
import { avatarInitial } from "./profileLogic"

const SIZE = {
  sm: "h-7 w-7 text-xs",
  md: "h-12 w-12 text-lg",
  lg: "h-24 w-24 text-4xl sm:h-28 sm:w-28",
} as const

/** A chosen avatar image, or the default: the user's initial on an accent background (#32). */
export default function UserAvatar({
  avatar,
  displayName,
  username,
  size = "md",
  className = "",
}: {
  avatar?: ApiAvatar | null
  displayName?: string | null
  username?: string | null
  size?: keyof typeof SIZE
  className?: string
}) {
  const [failedFile, setFailedFile] = useState<string | null>(null)
  const showImage = avatar && failedFile !== avatar.file
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full bg-accent font-black text-white ${SIZE[size]} ${className}`}
    >
      {showImage ? (
        <img
          src={avatarSrc(avatar)}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setFailedFile(avatar.file)}
        />
      ) : (
        avatarInitial(displayName, username)
      )}
    </span>
  )
}
