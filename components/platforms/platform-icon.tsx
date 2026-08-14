import { createElement, type ComponentType, type SVGProps } from "react"
import {
  Youtube,
  Rss,
  Headphones,
  Globe,
  Mail,
  MessageCircle,
} from "lucide-react"
import {
  KhatSocialIcon,
  type KhatSocialName,
} from "@/components/brand/khat-social-icon"
import { WhatsAppIcon } from "@/components/icons/whatsapp-icon"
import { SnapchatIcon } from "@/components/icons/snapchat-icon"
import { FacebookIcon } from "@/components/icons/facebook-icon"
import { ThreadsIcon } from "@/components/icons/threads-icon"
import { TelegramIcon } from "@/components/icons/telegram-icon"
import { PinterestIcon } from "@/components/icons/pinterest-icon"
import { TwitchIcon } from "@/components/icons/twitch-icon"
import { DiscordIcon } from "@/components/icons/discord-icon"
import { SoundCloudIcon } from "@/components/icons/soundcloud-icon"

type IconComponent = ComponentType<SVGProps<SVGSVGElement> & { className?: string }>

/**
 * Wrap one of the identity's own platform marks as a plain icon component, so
 * it drops into `ICON_MAP` beside the stock ones with no call-site changes.
 *
 * `width`/`height` are dropped deliberately: every call site sizes these with
 * a Tailwind class, and a CSS rule beats an SVG presentation attribute, so
 * passing them through would be dead weight that only looks like it works.
 */
const khatMark = (name: KhatSocialName): IconComponent => {
  const Mark = ({ className }: SVGProps<SVGSVGElement>) => (
    <KhatSocialIcon name={name} className={className} />
  )
  Mark.displayName = `KhatMark(${name})`
  return Mark
}

/**
 * Single mapping from `icon_name` (stored on podcast_platform_links) to
 * a React icon component. Extend this when adding new platforms.
 *
 * SIX OF THESE ARE THE IDENTITY'S OWN. The designer drew TikTok, Spotify,
 * Instagram, YouTube, Podcast and X in KHAT style, each carrying the orange
 * diamond (`SOCIAL MEDIA ICON/ICON.pdf`). Those six now come from
 * `<KhatSocialIcon>`; the rest keep their stock mark, because the identity
 * does not draw them and inventing one would be us designing the identity
 * rather than applying it.
 */
const ICON_MAP: Record<string, IconComponent> = {
  // audio
  spotify: khatMark("spotify"),
  apple_podcasts: khatMark("podcast"),
  podcast: khatMark("podcast"),
  soundcloud: SoundCloudIcon,
  anghami: Headphones,
  rss: Rss,
  // video
  youtube: khatMark("youtube"),
  youtube_music: Youtube,
  twitch: TwitchIcon,
  // social
  x: khatMark("x"),
  instagram: khatMark("instagram"),
  tiktok: khatMark("tiktok"),
  facebook: FacebookIcon,
  threads: ThreadsIcon,
  snapchat: SnapchatIcon,
  pinterest: PinterestIcon,
  // community / messaging
  whatsapp: WhatsAppIcon,
  telegram: TelegramIcon,
  discord: DiscordIcon,
  // misc
  website: Globe,
  newsletter: Mail,
  email: Mail,
  chat: MessageCircle,
}

const FALLBACK_ICON: IconComponent = Headphones

export function getPlatformIcon(iconName: string | null | undefined): IconComponent {
  if (!iconName) return FALLBACK_ICON
  return ICON_MAP[iconName] || FALLBACK_ICON
}

interface PlatformIconProps extends SVGProps<SVGSVGElement> {
  iconName: string | null | undefined
}

export function PlatformIcon({ iconName, className, ...rest }: PlatformIconProps) {
  // createElement avoids an eslint "Cannot create components during render"
  // false-positive we'd hit by capitalizing a local variable and rendering it.
  return createElement(getPlatformIcon(iconName), { className, ...rest })
}

// Known icon names — useful for admin form dropdown
export const KNOWN_ICON_NAMES = Object.keys(ICON_MAP)
